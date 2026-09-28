/**
 * 全市場歷史日 K 共用資料端點
 * GET /api/skynet/market-bars?action=read&days=120[&codes=2330,2317][&to=YYYY-MM-DD]
 * GET /api/skynet/market-bars?action=ingest&date=YYYYMMDD            （需權杖）
 * GET /api/skynet/market-bars?action=ingest&from=YYYYMMDD&to=YYYYMMDD（需權杖）
 * GET /api/skynet/market-bars?action=status
 *
 * 職責（三層架構，設計理由見 src/lib/marketBars.ts 檔首）：
 *   第一層 寫入：抓「某一天」TWSE + TPEX 全市場 OHLC → 壓縮 → 存 KV（key mkt:bars:<YYYY-MM-DD>）。
 *   第二層 回填：action=ingest 接受單日或區間（區間硬限制見 MAX_INGEST_* 常數，呼叫端自行迴圈）。
 *   第三層 讀取：action=read 從 KV 組裝 N 天序列，純 KV 讀取、不打上游。
 *
 * 安全：
 *   - 讀取端（read / status）為唯讀，不需權杖。
 *   - 寫入端（ingest）為機器對機器，需權杖；沿用 guardMutation（同 god-ingest 用法，
 *     allowSameOrigin:false）。接受全域權杖或端點專用權杖 MARKET_BARS_INGEST_TOKEN。
 *
 * 資料誠實：
 *   - KV 未綁定（本地 / 未部署）時回 ready:false 的誠實訊息，絕不拋錯。
 *   - 非交易日（週末／休市）明確回 stored:false + reason，不回空陣列假裝成功。
 *   - read 缺漏日期一律列出。
 *
 * 所有可測邏輯集中於 @/lib/marketBars；本檔僅匯出 HTTP 方法。
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';
import { getKv } from '@/lib/godBridge';
import {
  MAX_FULL_SERIES_DAYS,
  MAX_INGEST_DAYS,
  MAX_INGEST_TRADING_DAYS,
  MAX_READ_DAYS,
  MARKET_BARS_KV_PREFIX,
  TWSE_MI_INDEX_URL,
  TPEX_OTC_URL,
  buildStoredDay,
  buildTradingDayWindow,
  eachDateInRange,
  fetchTpexDay,
  fetchTwseDay,
  isTradingDay,
  listStoredDates,
  loadRange,
  parseYmdToDate,
  storeDay,
  todayTaipeiYmd,
  type Provenance,
  type SkynetKvWithList,
} from '@/lib/marketBars';

export const dynamic = 'force-dynamic';

/** 統一的來源追蹤欄位（本端點自產，非代理第三方）。 */
const PROVENANCE: Provenance = {
  source: 'self-produced',
  upstream: TWSE_MI_INDEX_URL,
  upstreams: [TWSE_MI_INDEX_URL, TPEX_OTC_URL],
};

/** KV 未綁定時的統一誠實回應（不拋錯、不假裝成功）。 */
function kvUnavailable(action: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      ready: false,
      action,
      error: 'kv_unavailable',
      message: 'KV 尚未綁定（本地開發或尚未部署），無法讀寫全市場日 K。',
      provenance: PROVENANCE,
    },
    { status: 200 },
  );
}

/** 把 query 的 YYYYMMDD 正規化為 UTC 午夜 Date；異常回 null。 */
function parseQueryDate(raw: string | null): Date | null {
  if (!raw) return null;
  return parseYmdToDate(raw.trim());
}

// ---------------------------------------------------------------------------
// action=read：從 KV 組裝序列（純讀取）
// ---------------------------------------------------------------------------
async function handleRead(searchParams: URLSearchParams): Promise<NextResponse> {
  const daysRaw = Number.parseInt(searchParams.get('days') ?? '120', 10);
  const requestedDays = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, MAX_READ_DAYS) : 120;

  const toRaw = searchParams.get('to');
  const toDate = toRaw ? parseQueryDate(toRaw) : parseYmdToDate(todayTaipeiYmd());
  if (!toDate) {
    return NextResponse.json(
      { ok: false, error: 'invalid_to', message: 'to 參數格式須為 YYYYMMDD 或 YYYY-MM-DD。' },
      { status: 400 },
    );
  }

  const codesParam = (searchParams.get('codes') ?? '').trim();
  const codes = codesParam
    ? codesParam.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [];
  const codeSet = new Set(codes);

  const window = buildTradingDayWindow(toDate, requestedDays);
  const from = window.length > 0 ? window[0] : null;
  const to = window.length > 0 ? window[window.length - 1] : null;

  const kv = (await getKv()) as SkynetKvWithList | undefined;
  if (!kv) return kvUnavailable('read');

  const { days: found, missing } = await loadRange(kv, window);
  const available = found.map((d) => d.date);

  // 序列是否隨回應附帶：
  //   - 有指定 codes → 過濾後體積小，一律附帶。
  //   - 未指定 codes 且天數 ≤ MAX_FULL_SERIES_DAYS → 附帶全市場序列。
  //   - 否則僅回日期清單（避免 120 天 × ~0.76MB ≈ 91MB 的回應）。
  const seriesIncluded = codeSet.size > 0 || window.length <= MAX_FULL_SERIES_DAYS;
  const series = seriesIncluded
    ? found.map((d) =>
        codeSet.size === 0
          ? d
          : {
              ...d,
              twse: d.twse.filter((b) => codeSet.has(b[0])),
              tpex: d.tpex.filter((b) => codeSet.has(b[0])),
              counts: {
                twse: d.twse.filter((b) => codeSet.has(b[0])).length,
                tpex: d.tpex.filter((b) => codeSet.has(b[0])).length,
              },
            },
      )
    : [];

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      action: 'read',
      from,
      to,
      requestedDays,
      available,
      missing,
      counts: { available: available.length, missing: missing.length },
      seriesIncluded,
      ...(seriesIncluded
        ? {}
        : {
            seriesNote: `未附帶全市場序列（天數 ${window.length} 超過 ${MAX_FULL_SERIES_DAYS} 天上限）；請改用 codes= 指定個股，或縮小 days。`,
          }),
      ...(codes.length > 0 ? { codes } : {}),
      days: series,
      provenance: PROVENANCE,
    },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}

// ---------------------------------------------------------------------------
// action=status：列出 KV 已累積的日期（純讀取）
// ---------------------------------------------------------------------------
async function handleStatus(): Promise<NextResponse> {
  const kv = (await getKv()) as SkynetKvWithList | undefined;
  if (!kv) return kvUnavailable('status');

  const dates = await listStoredDates(kv);
  if (dates === null) {
    return NextResponse.json(
      {
        ok: false,
        ready: false,
        action: 'status',
        error: 'kv_list_unavailable',
        message: 'KV 綁定不支援 list，無法列出已累積日期。',
        provenance: PROVENANCE,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      action: 'status',
      prefix: MARKET_BARS_KV_PREFIX,
      count: dates.length,
      first: dates.length > 0 ? dates[0] : null,
      last: dates.length > 0 ? dates[dates.length - 1] : null,
      dates,
      provenance: PROVENANCE,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ---------------------------------------------------------------------------
// action=ingest：抓上游寫 KV（需權杖）
// ---------------------------------------------------------------------------

/** 抓單一交易日並寫入 KV；回傳結果摘要。 */
async function ingestOneDay(
  kv: SkynetKvWithList,
  ymd: string,
): Promise<{
  date: string;
  stored: boolean;
  reason?: string;
  counts?: { twse: number; tpex: number };
  bytes?: number;
}> {
  const date = parseYmdToDate(ymd);
  if (!date) return { date: ymd, stored: false, reason: 'invalid_date' };
  if (!isTradingDay(date)) return { date: ymd, stored: false, reason: 'not_a_trading_day' };

  const [twseRes, tpexRes] = await Promise.all([fetchTwseDay(date), fetchTpexDay(date)]);

  if (!twseRes && !tpexRes) {
    // 交易日卻兩邊都無資料：可能是未收錄的休市日，或上游異常。誠實回報，不寫空資料。
    return { date: ymd, stored: false, reason: 'no_upstream_data' };
  }

  const twseBars = twseRes?.bars ?? [];
  const tpexBars = tpexRes?.bars ?? [];
  const tradeDate = twseRes?.tradeDate ?? tpexRes?.tradeDate ?? ymd;

  const payload = buildStoredDay(tradeDate, twseBars, tpexBars, {
    twse: twseRes?.rawCount ?? 0,
    tpex: tpexRes?.rawCount ?? 0,
  });

  try {
    await storeDay(kv, tradeDate, payload);
  } catch {
    return { date: ymd, stored: false, reason: 'kv_write_failed' };
  }

  return {
    date: tradeDate,
    stored: true,
    counts: payload.counts,
    bytes: JSON.stringify(payload).length,
  };
}

async function handleIngest(req: NextRequest, searchParams: URLSearchParams): Promise<NextResponse> {
  // 寫入型端點守衛：機器對機器（非瀏覽器），一律需權杖；同 god-ingest 用法。
  const guard = guardMutation(req, {
    endpoint: 'market-bars',
    maxRequests: 40,
    allowSameOrigin: false,
    extraTokens: [process.env.MARKET_BARS_INGEST_TOKEN ?? ''],
  });
  if (guard) return guard;

  const kv = (await getKv()) as SkynetKvWithList | undefined;
  if (!kv) return kvUnavailable('ingest');

  const dateParam = searchParams.get('date')?.trim();
  const fromParam = searchParams.get('from')?.trim();
  const toParam = searchParams.get('to')?.trim();

  // ---- 單日 ----
  if (dateParam) {
    if (!parseYmdToDate(dateParam)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_date', message: 'date 格式須為 YYYYMMDD 或 YYYY-MM-DD。' },
        { status: 400 },
      );
    }
    const result = await ingestOneDay(kv, dateParam);
    return NextResponse.json(
      {
        ok: true,
        action: 'ingest',
        mode: 'single',
        ...result,
        provenance: PROVENANCE,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ---- 區間 ----
  if (!fromParam || !toParam) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_params',
        message: '需提供 date，或 from 與 to（區間）。',
      },
      { status: 400 },
    );
  }

  const fromDate = parseYmdToDate(fromParam);
  const toDate = parseYmdToDate(toParam);
  if (!fromDate || !toDate) {
    return NextResponse.json(
      { ok: false, error: 'invalid_range', message: 'from / to 格式須為 YYYYMMDD 或 YYYY-MM-DD。' },
      { status: 400 },
    );
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      { ok: false, error: 'invalid_range', message: 'from 不可晚於 to。' },
      { status: 400 },
    );
  }

  const allDates = eachDateInRange(fromParam, toParam);
  const calendarSpan = allDates.length;

  // 硬限制一：日曆天數 ≤ MAX_INGEST_DAYS（任務規格 40 天）。
  if (calendarSpan > MAX_INGEST_DAYS) {
    return NextResponse.json(
      {
        ok: false,
        error: 'range_too_large',
        maxDays: MAX_INGEST_DAYS,
        requestedDays: calendarSpan,
        message: `區間最多 ${MAX_INGEST_DAYS} 天（含頭尾）；請由呼叫端分段迴圈。`,
      },
      { status: 400 },
    );
  }

  const tradingDates = allDates.filter((d) => {
    const dt = parseYmdToDate(d);
    return dt !== null && isTradingDay(dt);
  });

  // 硬限制二：實際交易日 ≤ MAX_INGEST_TRADING_DAYS（subrequest 預算防線）。
  if (tradingDates.length > MAX_INGEST_TRADING_DAYS) {
    return NextResponse.json(
      {
        ok: false,
        error: 'subrequest_budget_exceeded',
        maxTradingDays: MAX_INGEST_TRADING_DAYS,
        tradingDaysRequested: tradingDates.length,
        message:
          `此區間含 ${tradingDates.length} 個交易日，超過單次上限 ${MAX_INGEST_TRADING_DAYS} 天` +
          `（每交易日需 2 次上游 fetch + 1 次 KV put；免費方案每 request 上限 50 subrequests）。請由呼叫端分段。`,
      },
      { status: 400 },
    );
  }

  const stored: Array<{ date: string; counts: { twse: number; tpex: number } }> = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  for (const d of tradingDates) {
    const result = await ingestOneDay(kv, d);
    if (result.stored && result.counts) {
      stored.push({ date: result.date, counts: result.counts });
    } else {
      skipped.push({ date: result.date, reason: result.reason ?? 'unknown' });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      action: 'ingest',
      mode: 'range',
      from: fromParam,
      to: toParam,
      calendarSpan,
      tradingDays: tradingDates.length,
      storedCount: stored.length,
      skippedCount: skipped.length,
      stored,
      skipped,
      subrequestsUsed: tradingDates.length * 3,
      provenance: PROVENANCE,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = (searchParams.get('action') ?? 'read').trim().toLowerCase();

  switch (action) {
    case 'read':
      return handleRead(searchParams);
    case 'status':
      return handleStatus();
    case 'ingest':
      return handleIngest(req, searchParams);
    default:
      return NextResponse.json(
        {
          ok: false,
          error: 'unknown_action',
          allowed: ['read', 'ingest', 'status'],
          message: `不支援的 action：${action}`,
        },
        { status: 400 },
      );
  }
}
