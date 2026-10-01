/**
 * 訊號勝率統計端點
 * GET /api/skynet/signal-log/stats[?from=YYYYMMDD&to=YYYYMMDD&window=N]
 *
 * 回傳：總筆數、已結算筆數、勝率、平均報酬、最大回撤。
 *
 * ★ 本端點最重要的行為是「樣本不足時誠實」：
 *   已結算筆數（win + loss）< 30 → 回傳 win_rate 的同時標
 *   `sample_sufficient: false` + `sample_note`「樣本不足，不足以判斷勝率」。
 *   已結算 0 筆 → win_rate / avg_return_pct / max_drawdown_pct 一律 **null**
 *   （不是 0；0 會被誤讀成「勝率 0%」，那是捏造）。
 *   這是本專案鐵律，不可為了頁面好看而省略。
 *
 * 資料來源與成本
 * ----------------------------------------------------------------------------
 *   訊號：`signal:log:<YYYYMMDD>`（每日一個 key，內部為陣列）。
 *   日 K：`mkt:bars:<YYYY-MM-DD>`，走 src/lib/signalLog.ts 的「快速抽取」
 *         （不整包 JSON.parse 0.76MB），約 0.3–1ms CPU/日。
 *
 * Free plan 配額（以常數守住，並在超標時誠實截斷）
 * ----------------------------------------------------------------------------
 *   - 讀取 100,000 次/日：單次請求最多讀 30 個訊號日 + 40 個日 K 日 ≈ 70 次讀取，安全。
 *   - list 次數配額最稀缺 → **優先吃 from/to**；只有沒給區間時才用 KV list，
 *     且綁定不支援 list 時回 400 請呼叫端補上 from/to（不偷偷回空統計）。
 *   - CPU 10ms/request：40 個日 K 日 × ~1ms ≈ 40ms，已接近／超過 Free plan 上限。
 *     故提供 window（預設 10）讓呼叫端縮小視窗；
 *     若所需日 K 日數超過 MAX_STATS_BAR_DAYS，從**最舊**的訊號日開始截斷，
 *     並回傳 `truncated: true` + `truncated_note`（不偷偷少算、不假裝完整）。
 *
 * 回應契約
 * ----------------------------------------------------------------------------
 *   200 { ok:true, from, to, signal_dates, stats:{...}, truncated, truncated_note,
 *         bars:{...}, provenance }
 *   200 { ok:false, error:'kv_unavailable' } + X-Skynet-Stale: true
 *   400 { ok:false, error:'invalid_range' | 'list_unsupported' }
 *
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import { todayTaipeiYmd } from '@/lib/marketBars';
import {
  MAX_STATS_BAR_DAYS,
  MAX_STATS_SIGNALS,
  MAX_STATS_SIGNAL_DAYS,
  RECONCILE_WINDOW_DAYS_MAX,
  STATS_WINDOW_DAYS_DEFAULT,
  buildReconcileWindow,
  compactToDashed,
  computeStats,
  evaluateSignal,
  listSignalLogDates,
  loadBars,
  normalizeSignalDate,
  parseSignalDay,
  pickBars,
  signalLogKey,
} from '@/lib/signalLog';
import type { ReconciledSignal, StoredSignal } from '@/lib/signalLog';

/** 回應標頭（純 ASCII；CJK 放 body）。 */
function statsHeaders(stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-Skynet-Data-Source': 'kv',
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

/** 解析 window 參數（日曆天），預設 STATS_WINDOW_DAYS_DEFAULT，上限 RECONCILE_WINDOW_DAYS_MAX。 */
function parseWindow(raw: string | null): number {
  if (raw === null || raw.trim() === '') return STATS_WINDOW_DAYS_DEFAULT;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 1) return STATS_WINDOW_DAYS_DEFAULT;
  return Math.min(Math.floor(n), RECONCILE_WINDOW_DAYS_MAX);
}

/** KV 中沒有 list 時，用來提示呼叫端的訊息。 */
const LIST_UNSUPPORTED_MESSAGE =
  '此環境的 KV 綁定不支援 list，無法自動列舉訊號日，請帶上 from 與 to（YYYYMMDD 或 YYYY-MM-DD）。';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const windowDays = parseWindow(params.get('window'));

  const kv = await getKv();
  if (!kv) {
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 尚未綁定，讀不到訊號日誌與日 K。' },
      { status: 200, headers: statsHeaders(true) },
    );
  }

  // ① 決定要納入哪些「有訊號的日期」（'YYYYMMDD'，升冪）
  let signalDates: string[] = [];
  if (rawFrom !== null || rawTo !== null) {
    const from = rawFrom === null ? null : normalizeSignalDate(rawFrom);
    const to = rawTo === null ? null : normalizeSignalDate(rawTo);
    if ((rawFrom !== null && from === null) || (rawTo !== null && to === null)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_range', message: 'from / to 需為 YYYYMMDD 或 YYYY-MM-DD 的真實日期。' },
        { status: 400 },
      );
    }
    const start = from ?? to ?? null;
    const end = to ?? from ?? null;
    if (start === null || end === null || start > end) {
      return NextResponse.json(
        { ok: false, error: 'invalid_range', message: 'from 不得大於 to。' },
        { status: 400 },
      );
    }
    // 逐一列舉區間內每一天（訊號日 key 是稀疏的，讀不到就當天沒訊號）。
    const startDashed = compactToDashed(start);
    const endDashed = compactToDashed(end);
    if (!startDashed || !endDashed) {
      return NextResponse.json({ ok: false, error: 'invalid_range', message: '日期格式錯誤。' }, { status: 400 });
    }
    for (let t = Date.parse(`${startDashed}T00:00:00Z`); t <= Date.parse(`${endDashed}T00:00:00Z`); t += 86_400_000) {
      signalDates.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
    }
  } else {
    // 沒給區間 → 用 KV list（配額最稀缺，故只在此情況使用）。
    const listed = await listSignalLogDates(kv, MAX_STATS_SIGNAL_DAYS);
    if (listed === null) {
      return NextResponse.json(
        { ok: false, error: 'list_unsupported', message: LIST_UNSUPPORTED_MESSAGE },
        { status: 400 },
      );
    }
    signalDates = listed;
  }

  // 只取最近 MAX_STATS_SIGNAL_DAYS 個訊號日（CPU／讀取次數防線）。
  let truncatedBySignalDays = false;
  if (signalDates.length > MAX_STATS_SIGNAL_DAYS) {
    signalDates = signalDates.slice(-MAX_STATS_SIGNAL_DAYS);
    truncatedBySignalDays = true;
  }

  // ② 讀出訊號（每日一次小 KV 讀）
  const signals: StoredSignal[] = [];
  const datesWithSignals: string[] = [];
  let droppedMalformed = 0;
  let truncatedBySignals = false;
  for (const date of signalDates) {
    const stored = parseSignalDay(await kv.get(signalLogKey(date)).catch(() => null));
    droppedMalformed += stored.dropped;
    if (stored.list.length === 0) continue;
    for (const item of stored.list) {
      if (signals.length >= MAX_STATS_SIGNALS) {
        truncatedBySignals = true;
        break;
      }
      signals.push(item);
    }
    if (stored.list.length > 0) datesWithSignals.push(date);
    if (truncatedBySignals) break;
  }

  // ③ 依日 K 預算決定實際納入的訊號日（從最新往回加，超預算就停止並誠實回報）
  const today = todayTaipeiYmd();
  const acceptedDates: string[] = [];
  const barDateBudget = new Set<string>();
  let truncatedByBarBudget = false;
  for (let i = datesWithSignals.length - 1; i >= 0; i -= 1) {
    const date = datesWithSignals[i];
    const window = buildReconcileWindow(date, windowDays, today);
    if (!window) continue;
    const candidate = new Set(barDateBudget);
    for (const barDate of window.scannedDates) candidate.add(barDate);
    if (candidate.size > MAX_STATS_BAR_DAYS) {
      // 更舊的訊號日窗口只會更早，必然也超出預算 → 直接停止，不再嘗試。
      truncatedByBarBudget = true;
      break;
    }
    acceptedDates.unshift(date);
    barDateBudget.clear();
    for (const barDate of candidate) barDateBudget.add(barDate);
  }
  const acceptedSet = new Set(acceptedDates);
  const acceptedSignals = signals.filter((item) => acceptedSet.has(item.signal_date));
  const omittedSignalDates = datesWithSignals.filter((date) => !acceptedSet.has(date));

  // ④ 讀日 K（一次載入全部需要的日期，索引內以 date→code 存放，跨訊號共用）
  const barDates = Array.from(barDateBudget).sort();
  const codes = Array.from(new Set(acceptedSignals.map((item) => item.ticker)));
  const bars = await loadBars(kv, barDates, codes);

  // ⑤ 對帳
  const records: ReconciledSignal[] = [];
  for (const item of acceptedSignals) {
    const window = buildReconcileWindow(item.signal_date, windowDays, today);
    if (!window) continue;
    records.push(
      evaluateSignal(item, pickBars(bars.index, window.scannedDates, item.ticker), {
        scannedDates: window.scannedDates,
        missingDates: bars.missingDates.filter((date) => window.scannedDates.includes(date)),
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        windowDays,
        today,
      }),
    );
  }

  const stats = computeStats(records);

  const truncated = truncatedBySignalDays || truncatedBySignals || truncatedByBarBudget;
  let truncatedNote: string | null = null;
  if (truncated) {
    const reasons: string[] = [];
    if (truncatedBySignalDays) {
      reasons.push(`訊號日超過 ${MAX_STATS_SIGNAL_DAYS} 天，只納入最近的 ${MAX_STATS_SIGNAL_DAYS} 天`);
    }
    if (truncatedBySignals) reasons.push(`訊號筆數超過 ${MAX_STATS_SIGNALS} 筆上限`);
    if (truncatedByBarBudget) {
      reasons.push(
        `日 K 讀取預算 ${MAX_STATS_BAR_DAYS} 天用盡，已略過較舊的 ${omittedSignalDates.length} 個訊號日（縮小 window 或帶 from/to 可納入更多）`,
      );
    }
    truncatedNote = `本次統計未涵蓋全部資料：${reasons.join('；')}。統計結果不可視為完整勝率。`;
  }

  return NextResponse.json(
    {
      ok: true,
      from: acceptedDates[0] ?? null,
      to: acceptedDates[acceptedDates.length - 1] ?? null,
      window_days: windowDays,
      signal_dates: acceptedDates,
      omitted_signal_dates: omittedSignalDates,
      stats,
      truncated,
      truncated_note: truncatedNote,
      dropped_malformed: droppedMalformed,
      bars: {
        scanned_dates: barDates,
        available_dates: bars.availableDates,
        missing_dates: bars.missingDates,
      },
      provenance: {
        source: 'self-produced',
        upstream: 'mkt:bars:<YYYY-MM-DD>',
        upstreams: barDates.map((date) => `mkt:bars:${date}`),
      },
    },
    { status: 200, headers: statsHeaders(false) },
  );
}
