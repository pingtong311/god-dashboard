/**
 * 訊號日誌端點：寫入（POST）+ 單日對帳（GET）
 * POST /api/skynet/signal-log
 * GET  /api/skynet/signal-log?date=YYYYMMDD[&window=N]
 *
 * 存在理由：業主要「有回測、複驗、佐證」的投資建議與勝率。盤點後確認
 * 全站 KV（mkt:bars:、scan:*、god:*）**沒有任何歷史訊號留存**，勝率因此完全算不出來。
 * 本端點就是那個基礎設施：把「有停損、有失效條件」的建議留下來，並能事後對帳。
 *
 * 權杖
 * ----------------------------------------------------------------------------
 * 專用環境變數 `SIGNAL_LOG_TOKEN`（只對本端點有效），並相容全域
 * SKYNET_DASHBOARD_API_TOKEN / SKYNET_API_WRITE_TOKEN。
 * 做法比照 src/app/api/skynet/god/ingest/route.ts（extraTokens）。
 * 帶法：`Authorization: Bearer <token>` 或 `x-skynet-api-token: <token>`。
 * allowSameOrigin:false —— 這是機器對機器端點（GOD 辦公室／後端推送），
 * 刻意不開放瀏覽器同源繞過，避免任何人開頁面就能寫訊號污染勝率統計。
 *
 * POST 契約
 * ----------------------------------------------------------------------------
 * body: { ticker, signal_date, entry_price, target_price, stop_loss,
 *         reason, invalid_condition, confidence, source }
 * 硬閘門：缺 stop_loss 或 invalid_condition → 400，且不寫入 KV。
 *   - 200 { ok:true, key, id, deduplicated, count, dropped_malformed, storedAt, expiresAt }
 *   - 400 { ok:false, error, message }（含 missing_stop_loss / missing_invalid_condition）
 *   - 400 { ok:false, error:'daily_limit_reached', limit }
 *   - 403 / 429（守衛，見 src/lib/apiGuard.ts）
 *   - 503 { ok:false, error:'kv_unavailable' }
 *
 * GET 契約
 * ----------------------------------------------------------------------------
 *   - 200 { ok:true, date, window_days, signals:[...對帳結果], bars:{...}, provenance }
 *   - 400 { ok:false, error:'missing_date' | 'invalid_date' }
 *   - 200 { ok:false, error:'kv_unavailable' } + X-Skynet-Stale: true（不 5xx，
 *         依本專案慣例：唯讀端點失敗回 200 + ok:false，避免把頁面帶崩）
 *
 * 對帳語義：從訊號日**次日**起算（避免前視偏誤）；單日同時觸及目標與停損 →
 * outcome 'ambiguous'（日 K 無盤中先後順序，不選邊）；取不到日 K → outcome **null**
 * 並帶原因，絕不當 0。詳見 src/lib/signalLog.ts 檔頭。
 *
 * Cloudflare Free plan 配額（程式碼內已用常數守住）
 * ----------------------------------------------------------------------------
 *   - 寫入 1,000 次/日：每筆訊號 1 次寫入，單日上限 200 筆（= 配額 20%）。
 *   - KV value 25 MiB：單日 200 筆 × ~450 bytes ≈ 90 KB，安全。
 *   - CPU 10ms/request：單日對帳預設 window=10 日曆天（≈7 個交易日），
 *     日 K 走「快速抽取」（不整包 JSON.parse 0.76MB），估算 ~3–7ms。
 *     上限 window=45（≈31 個交易日）會明顯越過 Free plan CPU 預算，
 *     故僅供離線／除錯使用，不建議在線上常態呼叫。
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';
import { getKv } from '@/lib/godBridge';
import { todayTaipeiYmd } from '@/lib/marketBars';
import {
  MAX_SIGNALS_PER_DAY,
  RECONCILE_WINDOW_DAYS_DEFAULT,
  RECONCILE_WINDOW_DAYS_MAX,
  SIGNAL_LOG_KV_TTL_SECONDS,
  buildReconcileWindow,
  evaluateSignal,
  loadBars,
  mergeSignalList,
  normalizeSignalDate,
  parseSignalBody,
  parseSignalDay,
  pickBars,
  signalLogKey,
} from '@/lib/signalLog';
import type { StoredSignal } from '@/lib/signalLog';

/** 寫入權杖：專用環境變數（只對本端點有效）。 */
const SIGNAL_LOG_TOKEN = process.env.SIGNAL_LOG_TOKEN ?? '';

/** 只帶 ASCII 的回應標頭（HTTP header 不接受 CJK，非 ASCII 會讓 route 500）。 */
function readHeaders(stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-Skynet-Data-Source': 'kv',
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

/**
 * 解析 window 參數（日曆天）。
 * 非數字／小於 1 → 預設值；大於上限 → 上限。
 */
function parseWindow(raw: string | null): number {
  if (raw === null || raw.trim() === '') return RECONCILE_WINDOW_DAYS_DEFAULT;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 1) return RECONCILE_WINDOW_DAYS_DEFAULT;
  return Math.min(Math.floor(n), RECONCILE_WINDOW_DAYS_MAX);
}

export async function POST(request: Request) {
  const guard = guardMutation(request, {
    endpoint: 'signal-log',
    maxRequests: 60,
    allowSameOrigin: false,
    extraTokens: [SIGNAL_LOG_TOKEN],
  });
  if (guard) return guard;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: '請求內容不是合法 JSON。' },
      { status: 400 },
    );
  }

  // ★ 硬閘門：缺 stop_loss / invalid_condition 在此被擋下，KV 完全不會被寫入。
  const parsed = parseSignalBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, message: parsed.message },
      { status: 400 },
    );
  }

  const kv = await getKv();
  if (!kv) {
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 尚未綁定，無法寫入訊號日誌。' },
      { status: 503 },
    );
  }

  const key = signalLogKey(parsed.value.signal_date);
  const existingRaw = await kv.get(key).catch(() => null);
  const existing = parseSignalDay(existingRaw ?? null);

  const merged = mergeSignalList(existing.list, parsed.value);
  if (!merged.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: merged.error,
        limit: merged.limit,
        message: `${parsed.value.signal_date} 的訊號已達單日上限 ${MAX_SIGNALS_PER_DAY} 筆。`,
      },
      { status: 400 },
    );
  }

  const storedAt = new Date().toISOString();
  try {
    await kv.put(key, JSON.stringify(merged.list), { expirationTtl: SIGNAL_LOG_KV_TTL_SECONDS });
  } catch {
    // 寫入失敗明確回報 503，讓推送端可重試；不假裝成功（資料誠實）。
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 寫入失敗，請稍後再試。' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      key,
      id: parsed.value.id,
      deduplicated: merged.deduplicated,
      count: merged.list.length,
      // 讀取時發現的畸形筆數：誠實回報，不靜默丟資料。
      dropped_malformed: existing.dropped,
      corrupted_existing: existing.corrupted,
      storedAt,
      expiresAt: new Date(Date.now() + SIGNAL_LOG_KV_TTL_SECONDS * 1000).toISOString(),
    },
    { status: 200 },
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawDate = params.get('date');
  if (rawDate === null || rawDate.trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'missing_date', message: '請帶 date 參數（YYYYMMDD 或 YYYY-MM-DD）。' },
      { status: 400 },
    );
  }
  const signalDate = normalizeSignalDate(rawDate);
  if (!signalDate) {
    return NextResponse.json(
      { ok: false, error: 'invalid_date', message: 'date 需為 YYYYMMDD 或 YYYY-MM-DD 的真實日期。' },
      { status: 400 },
    );
  }
  const windowDays = parseWindow(params.get('window'));
  const key = signalLogKey(signalDate);

  const kv = await getKv();
  if (!kv) {
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 尚未綁定，讀不到訊號日誌與日 K。' },
      { status: 200, headers: readHeaders(true) },
    );
  }

  const stored = parseSignalDay(await kv.get(key).catch(() => null));
  if (stored.list.length === 0) {
    // 沒有訊號就是沒有訊號，明說；不回空陣列讓人誤以為「系統正常運作中」。
    return NextResponse.json(
      {
        ok: true,
        date: signalDate,
        window_days: windowDays,
        signals: [],
        note: stored.corrupted
          ? `${key} 內容損壞（不是訊號陣列），已略過；請重新寫入。`
          : `${signalDate} 尚無任何訊號紀錄（本系統不產生示意訊號）。`,
        dropped_malformed: stored.dropped,
      },
      { status: 200, headers: readHeaders(false) },
    );
  }

  // 對帳：從訊號日次一交易日起（避免前視偏誤），見 src/lib/signalLog.ts。
  const window = buildReconcileWindow(signalDate, windowDays);
  if (!window) {
    return NextResponse.json(
      { ok: false, error: 'invalid_date', message: '無法由 signal_date 推算對帳窗口。' },
      { status: 400 },
    );
  }

  const codes = Array.from(new Set(stored.list.map((item: StoredSignal) => item.ticker)));
  const bars = await loadBars(kv, window.scannedDates, codes);
  const today = todayTaipeiYmd();
  const ctx = {
    scannedDates: window.scannedDates,
    missingDates: bars.missingDates,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    windowDays,
    today,
  };

  const signals = stored.list.map((item: StoredSignal) =>
    evaluateSignal(item, pickBars(bars.index, window.scannedDates, item.ticker), ctx),
  );

  return NextResponse.json(
    {
      ok: true,
      date: signalDate,
      window_days: windowDays,
      window: { start: window.windowStart, end: window.windowEnd },
      signals,
      bars: {
        scanned_dates: window.scannedDates,
        available_dates: bars.availableDates,
        missing_dates: bars.missingDates,
      },
      dropped_malformed: stored.dropped,
      provenance: {
        // 訊號來自我們自己的日誌；判定依據是我們自己抓的日 K（可稽核、可重算）。
        source: 'self-produced',
        upstream: 'mkt:bars:<YYYY-MM-DD>',
        upstreams: window.scannedDates.map((date) => `mkt:bars:${date}`),
      },
    },
    { status: 200, headers: readHeaders(false) },
  );
}

