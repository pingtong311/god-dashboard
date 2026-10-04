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
import { readKvTextDetailed } from '@/lib/kvReadCache';
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
  marketBarKey,
  parseStoredMarketDay,
  parseYmdToDate,
  storeDay,
  todayTaipeiYmd,
  type Provenance,
  type SkynetKvWithList,
  type StoredMarketDay,
} from '@/lib/marketBars';

export const dynamic = 'force-dynamic';

/**
 * 邊緣端可安全解析的「序列原始位元組」上限。
 *
 * 算術（2026-10-04 實測）：
 *   - Cloudflare Free plan CPU 上限 **10ms**；地板值（OpenNext 執行期初始化
 *     ＋ 一次 KV 讀取）**7ms** → 剩餘預算約 **3ms**。
 *   - V8 `JSON.parse` 對本專案這種扁平陣列吞吐約 200MB/s → 3ms ≈ 600KB；
 *     但序列還需要 `JSON.stringify` 回寫（再一份成本）＋ 組裝配置，
 *     故取 **1/2 安全邊界 ≈ 256KB**。
 *   - ⚠ 實測單日 `mkt:bars:<date>` 值約 **660KB**（2026-10-02 = 675,459 bytes）
 *     → **只要附帶任何一天的全市場序列就已超過這個上限**。
 *
 * ⇒ 這是**刻意的誠實拒絕**，不是缺陷：與其讓請求在邊緣端爆 CPU 回
 *   503 `error code: 1102`（使用者看到的是「系統壞了」），不如明確回
 *   「此查詢在本方案下無法服務」＋可行替代路徑。
 *   付費方案（CPU 上限 30s）或把日 payload 瘦身後，同一段程式碼即可正常服務。
 */
const MAX_INLINE_SERIES_BYTES = 256 * 1024;

/** `action=read` 的共享快取標頭。 */
const READ_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=300',
};

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

/**
 * 「僅中繼資料」回應：不附帶序列，只回日期清單與命中／缺漏統計。
 *
 * 為什麼需要獨立一條路徑（2026-10-04 修）：
 *   原本無論需不需要序列，都會呼叫 `loadRange()` 把**整個視窗**逐日讀進記憶體
 *   並 `JSON.parse`。而文件記載的預設呼叫正是 `?action=read&days=120`——
 *   那會讀 **120 天 × 約 660KB ≈ 79MB** 並全部解析，在 Free plan 的 10ms CPU
 *   上限下必然 503（實測 days=1 就已 503）。
 *   但 `seriesIncluded === false` 時（未指定 codes 且視窗 > MAX_FULL_SERIES_DAYS）
 *   回應**根本不含序列**，只需要「哪些日期有資料」——那用**一次 KV `list`** 就能回答，
 *   不必讀任何一天的內容。
 */
function metadataOnlyResponse(params: {
  from: string | null;
  to: string | null;
  requestedDays: number;
  window: string[];
  storedDates: string[];
  codes: string[];
}): NextResponse {
  const have = new Set(params.storedDates);
  const available = params.window.filter((d) => have.has(d));
  const missing = params.window.filter((d) => !have.has(d));

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      action: 'read',
      from: params.from,
      to: params.to,
      requestedDays: params.requestedDays,
      available,
      missing,
      counts: { available: available.length, missing: missing.length },
      seriesIncluded: false,
      seriesNote:
        `未附帶全市場序列（天數 ${params.window.length} 超過 ${MAX_FULL_SERIES_DAYS} 天上限）；` +
        '請改用 codes= 指定個股，或縮小 days。',
      ...(params.codes.length > 0 ? { codes: params.codes } : {}),
      days: [],
      provenance: PROVENANCE,
    },
    { status: 200, headers: { ...READ_HEADERS, 'X-Skynet-Series-Mode': 'metadata-only' } },
  );
}

/**
 * 「序列過大，邊緣端無法服務」的誠實回應（200，不 5xx）。
 * 明確說明原因並給出可行替代，而不是讓使用者看到 503。
 */
function seriesTooLargeResponse(params: {
  from: string | null;
  to: string | null;
  requestedDays: number;
  window: string[];
  totalBytes: number;
  hasCodes: boolean;
}): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      ready: false,
      action: 'read',
      from: params.from,
      to: params.to,
      requestedDays: params.requestedDays,
      windowDays: params.window.length,
      seriesIncluded: false,
      error: 'series_too_large_for_edge',
      maxInlineBytes: MAX_INLINE_SERIES_BYTES,
      readBytes: params.totalBytes,
      message:
        '全市場日 K 序列在此方案（Cloudflare Free plan，Worker CPU 上限 10ms）下無法於邊緣端組裝。' +
        `單日 payload 約 660KB，解析成本已超過可用 CPU 預算（上限 ${MAX_INLINE_SERIES_BYTES} bytes）。`,
      alternatives: [
        '改用 ?action=status 取得已累積的日期清單（單次 KV list，極低成本）',
        '直接讀 KV：key 為 mkt:bars:<YYYY-MM-DD>（由 backfill-market-bars.mjs 回填）',
        'pattern-screen / swing-hub 已在離線預算中直接讀 KV，不需經過本端點',
        ...(params.hasCodes
          ? []
          : ['付費方案（CPU 上限 30s）即可正常服務本查詢']),
      ],
      provenance: PROVENANCE,
    },
    { status: 200, headers: { ...READ_HEADERS, 'X-Skynet-Series-Mode': 'too-large' } },
  );
}

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

  // 序列是否隨回應附帶：
  //   - 有指定 codes → 過濾後體積小，一律附帶。
  //   - 未指定 codes 且天數 ≤ MAX_FULL_SERIES_DAYS → 附帶全市場序列。
  //   - 否則僅回日期清單（避免 120 天 × ~660KB ≈ 79MB 的回應）。
  const seriesIncluded = codeSet.size > 0 || window.length <= MAX_FULL_SERIES_DAYS;

  // ── A. 不需序列 → 一次 KV `list` 回答「哪些日期有資料」（原本是 N 次 get + N 次 parse）──
  if (!seriesIncluded) {
    const storedDates = await listStoredDates(kv);
    if (storedDates !== null) {
      return metadataOnlyResponse({ from, to, requestedDays, window, storedDates, codes });
    }
    // `list` 不可用（罕見：綁定不支援 list）→ 落到 B 逐日讀，誠實降級。
  }

  // ── B. 需要序列 → 逐日讀（走三層快取），並在解析前先擋住過大序列 ──
  //
  // ⚠ 關鍵順序：**先累計位元組、超過上限就立刻停手**，絕不先 parse 再判斷。
  //    `mkt:bars:<date>` 是**不可變的歷史資料**（收盤後就不會再變），
  //    因此快取層的 TTL 對它特別划算——同一 isolate ／同一 colo 的重複查詢
  //    不會再打 KV（這是免費方案壓低 KV 每日讀取量的關鍵）。
  const found: StoredMarketDay[] = [];
  const missing: string[] = [];
  let totalBytes = 0;

  for (const date of window) {
    const read = await readKvTextDetailed(marketBarKey(date));
    if (read.status !== 'ok') {
      // 缺值／讀取失敗 → 誠實列為缺漏（不假裝成功）。
      missing.push(date);
      continue;
    }
    totalBytes += read.text.length;
    if (totalBytes > MAX_INLINE_SERIES_BYTES) {
      return seriesTooLargeResponse({
        from,
        to,
        requestedDays,
        window,
        totalBytes,
        hasCodes: codeSet.size > 0,
      });
    }
    const day = parseStoredMarketDay(read.text);
    if (!day) {
      missing.push(date);
      continue;
    }
    found.push(day);
  }

  const available = found.map((d) => d.date);

  const series = found.map((d) =>
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
  );

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
      seriesIncluded: true,
      ...(codes.length > 0 ? { codes } : {}),
      days: series,
      provenance: PROVENANCE,
    },
    { status: 200, headers: { ...READ_HEADERS, 'X-Skynet-Series-Mode': 'inline' } },
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
