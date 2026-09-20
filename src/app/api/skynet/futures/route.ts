/**
 * 台股期貨近月收盤代理（TAIFEX 官方 OpenAPI）
 * GET /api/skynet/futures
 *
 * 資料源（單源，無回退）：
 *   https://openapi.taifex.com.tw/v1/DailyMarketReportFut
 *   （免費、免金匙、無 Referer 檢查、200 直連；實測 4/4 成功，size 恒定 806,830）
 *
 * ⚠ 無第二源：舊端點 api.taiex.com.tw 在 Workers 出口 404，改為主用端點。
 * （實測 NXDOMAIN、網域未註冊；mis.taifex.com.tw 是 SPA 非 API，任何路徑都回
 *  同一份 index.html fallback。抗單點靠 stale-on-error + in-flight 去重 + 短超時，不造假。）
 *
 * 挑選規則：
 * - 取 Contract === 'TX'（TAIFEX 官方代號；Shioaji 的 'TXF'/'TXFR1' 命名 TAIFEX 沒有，勿混用）
 * - ContractMonth(Week) 需符合 /^\d{6}$/（最後一道防線，排除價差列如 '202610/202611'）
 *   + 尾碼以 'W' 結尾的一律排除（週別契約；實測 0 筆 W 尾碼，當 no-op 冗餘保險）
 * - 過濾 TradingSession === '一般'（同合約有「盤後」列，取錯會拿到盤後價）
 * - 取 ContractMonth(Week) 最小者為「期近月」（6 位數字 YYYYMM 字典序 = 數值序，用 '<' 比較）
 *
 * 空值防護：'-' / 'NULL' / '' 一律轉 null（絕不當 0，否則漲跌會顯示成平盤）。
 * lastPrice 為 null 時回 ok:false，前端 page.tsx L291 已有 lastPrice > 0 保護，顯示 '--'。
 *
 * ⚠ 重要語義（已查證，非推測）：此來源是 EOD（收盤後發布、一天一份快照）。
 * 盤中（08:45–13:45）拿到的 Date 必為前一交易日，故 data.sourceLabel 帶日期
 * （如「收盤 09/18」），前端據此顯示，避免使用者誤以為是即時價。
 * 若業主需盤中滾動，需升級 Fugle 期貨方案或開 VPS 跑 Shioaji，皆屬成本決策。
 *
 * 快取：同一 Date 的檔案是「一天一份」的不可變快照，806KB 整包在冷啟動時
 * 會反覆重抓，故 route 內做「交易日級」in-memory 快取（金鑰 = 資料本身的
 * tradeDate，TTL 1 小時；收盤後換到新一天）。
 * 另在 HTTP header 帶 10 分鐘 CDX 級快取：Cache-Control: s-maxage=600。
 * 上游失敗時降級回傳最後一個交易日快取（前一日收盤 + X-Skynet-Stale: 'true'），
 * 無快取才回 502，絕不捏造資料。
 *
 * 回傳 shape：{ ok: true, data: { name, lastPrice, change, changePercent, sourceLabel,
 * source, date, contract, fetchedAt } }，對齊前端 TaifexFuturesQuote（src/types/market.ts；
 * data 多一個 fetchedAt 超集欄位，前端解構不受影響）；
 * 失敗回 502 + { ok: false, message }（前端對 error 格顯示占位 '--'，不造假數字）。
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';

// 舊端點 api.taiex.com.tw 在 Workers 出口 404，改為主用端點。
// 第二源實測不存在（NXDOMAIN / mis 為 SPA 非 API），單源 + stale-on-error + in-flight 去重。
const TAIFEX_DAILY_FUT = 'https://openapi.taifex.com.tw/v1/DailyMarketReportFut';
/** 上游 fetch 超時：4s（上游健康 0.5–1s，4s 夠餘裕，快速失敗不長卡）。 */
const UPSTREAM_TIMEOUT_MS = 4_000;
/** 交易日級 in-memory 快取 TTL：1 小時。 */
const DAILY_CACHE_TTL_MS = 3_600_000;

/**
 * in-flight 去重（冷啟動 CPU 風險關鍵一環）：
 * 存「進行中的 fetch Promise」而非結果，N 個並發請求只觸發 1 次 806KB fetch+parse。
 * finally 裡清空（含 rejected），避免卡住直到 isolate 重啟。
 */
let inflight: Promise<TaifexFuturesData | null> | null = null;

/**
 * 交易日級 in-memory 快取（best-effort per-isolate，不依賴 KV 寫入權限）。
 * 金鑰 = 資料 tradeDate（YYYYMMDD）+ 1h TTL；⚠ 不寫 KV（Workers 未開 KV 寫入權限，
 * 且 806KB 整包快照只適合同 isolate 短期去重，非跨請求持久化需求）。
 */
let cached: { ts: number; date: string; data: TaifexFuturesData } | null = null;

/** TAIFEX DailyMarketReportFut 單筆欄位（值皆為字串，可能為 '-' / 'NULL' / ''）。 */
type TaifexFutRow = {
  Date?: string;
  Contract?: string;
  'ContractMonth(Week)'?: string;
  Open?: string;
  High?: string;
  Low?: string;
  Last?: string;
  Change?: string;
  '%'?: string;
  Volume?: string;
  SettlementPrice?: string;
  OpenInterest?: string;
  TradingSession?: string;
  [key: string]: string | undefined;
};

/**
 * 對齊前端 src/types/market.ts 的 TaifexFuturesQuote（超集：多 fetchedAt 供運維追蹤）。
 * 數值欄位一律 number | null：'-'/'NULL'/'' 轉 null 而非 0；
 * 前端 page.tsx L291 `futures.lastPrice > 0` 已做 null 保護（null > 0 為 false），安全。
 */
type TaifexFuturesData = {
  name: string;
  /** 收盤價（EOD）；空值轉 null。 */
  lastPrice: number | null;
  /** 漲跌點數（帶正負）；空值轉 null。 */
  change: number | null;
  /** 漲跌百分比（帶正負）；空值轉 null。 */
  changePercent: number | null;
  /** 開盤價；空值轉 null。 */
  open: number | null;
  /** 最高價；空值轉 null。 */
  high: number | null;
  /** 最低價；空值轉 null。 */
  low: number | null;
  /** 成交量；空值轉 null。 */
  volume: number | null;
  /** 前端展示用：「收盤 MM/DD」——EOD 來源連日期一起顯示。 */
  sourceLabel: string;
  source: 'taifex-openapi-close';
  /** 交易日 'YYYY-MM-DD'。 */
  date: string;
  /** 近月合約月，形如 '2026-10'。 */
  contract: string;
  fetchedAt: string;
};

type TaifexFuturesBody =
  | { ok: true; data: TaifexFuturesData }
  | { ok: false; message: string };

/** 空值防護：'-' / 'NULL' / '' / undefined 一律回 null（絕不當 0）。 */
function parseNumOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === '-' || value === 'NULL') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** '%' 欄位格式：'2.06%' / '-1.11%' / '-'。去 % 後轉數字，無效回 null（有負值）。 */
function parsePercentOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === '-' || value === 'NULL') return null;
  const n = Number.parseFloat(value.replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}

/** YYYYMMDD → 'MM/DD'。格式異常時回空字串（sourceLabel 會退回純「收盤」）。 */
function toMonthDay(value: string): string {
  if (!/^\d{8}$/.test(value)) return '';
  return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
}

/** YYYYMM → 'YYYY-MM'。 */
function toContractMonth(value: string): string {
  if (!/^\d{6}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
}

/** 從 TAIFEX 全表挑 TX 近月「一般」時段收盤行；無有效行回 null。 */
function pickNearestMonth(raw: TaifexFutRow[]): TaifexFuturesData | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  // 近月：TX + /^\d{6}$/（唯一防線，排除價差列）+ 非 W 尾碼（週別冗餘保險）+ 一般時段。
  const candidates = raw.filter((row) => {
    const m = String(row['ContractMonth(Week)'] ?? '');
    if (!/^\d{6}$/.test(m)) return false; // 唯一防線：排除價差列（'202610/202611' 等）
    if (m.toUpperCase().endsWith('W')) return false; // 週別契約冗余保險（實測 0 筆 W 尾碼，no-op）
    return row.Contract === 'TX' && row.TradingSession === '一般';
  });

  if (candidates.length === 0) return null;

  // ⚠ 禁用 localeCompare：ICU 惰性初始化首次呼叫 ~15ms，Workers 冷啟動 100% 越過 10ms CPU 限制。
  // 6 位數字月份（如 '202610'）直接字串 '<' 比較即等價數值序，零成本。
  let nearest = candidates[0];
  for (const row of candidates) {
    const m1 = String(nearest['ContractMonth(Week)'] ?? '');
    const m2 = String(row['ContractMonth(Week)'] ?? '');
    if (m2 < m1) nearest = row;
  }

  const lastPrice = parseNumOrNull(nearest.Last);
  // Last 為空值（null）：該列無有效收盤價（EOD 異常），交回 ok:false，不造假數字。
  if (lastPrice === null) return null;

  const tradeDate = String(nearest.Date ?? '');
  const monthDay = toMonthDay(tradeDate);
  const data: TaifexFuturesData = {
    name: '台股期近月',
    lastPrice,
    change: parseNumOrNull(nearest.Change),
    changePercent: parsePercentOrNull(nearest['%']),
    open: parseNumOrNull(nearest.Open),
    high: parseNumOrNull(nearest.High),
    low: parseNumOrNull(nearest.Low),
    volume: parseNumOrNull(nearest.Volume),
    // EOD 來源：盤中顯示前一日收盤日期；不標「即時」。
    sourceLabel: monthDay ? `收盤 ${monthDay}` : '收盤',
    source: 'taifex-openapi-close',
    date: /^\d{8}$/.test(tradeDate)
      ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`
      : '',
    contract: toContractMonth(String(nearest['ContractMonth(Week)'] ?? '')),
    fetchedAt: new Date().toISOString(),
  };

  cached = { ts: Date.now(), date: tradeDate, data };
  return data;
}

/**
 * 抓 806KB 全表並挑近月；網路/DNS/NXDOMAIN/逾時/非 2xx/非 JSON 一律回 null（不丟出）。
 * - redirect:'manual'：workerd 對尾斜線場景回 302（ok:false），既有 !res.ok 直接命中。
 *   若用 'follow' 尾斜線會回 200+HTML，!res.ok 攔不住，要等 res.json() 才拋錯。
 *   注意：workerd 不支援 'error'；不要加 content-type 白名單（上游正常回應是 octet-stream）。
 * - AbortSignal.timeout：workerd 有實作，比 AbortController+setTimeout 少漏 clearTimeout 風險。
 */
async function fetchNearMonthQuoteRaw(): Promise<TaifexFuturesData | null> {
  let raw: TaifexFutRow[];
  try {
    const res = await fetch(TAIFEX_DAILY_FUT, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
    // 302 尾斜線在 manual 模式下 ok:false，直接命中；4xx/5xx 同。
    if (!res.ok) return null;
    const parsed: unknown = await res.json();
    if (!Array.isArray(parsed)) return null; // 形狀斷言：上游回非陣列（HTML 錯誤頁等）一律當無效
    raw = parsed as TaifexFutRow[];
  } catch {
    return null; // DNS 未註冊（NXDOMAIN）/逾時/非 JSON：快速失敗，交回階層決策
  }
  return pickNearestMonth(raw);
}

/** in-flight 去重：N 個並發請求只觸發 1 次 fetch+parse；命中進行中 promise 直接 await。 */
function fetchNearMonthQuote(): Promise<TaifexFuturesData | null> {
  if (inflight) return inflight;
  inflight = fetchNearMonthQuoteRaw().finally(() => {
    inflight = null; // 必須在 finally 清空（含 rejected），否則卡住直到 isolate 重啟
  });
  return inflight;
}

/**
 * 回傳 header：10 分鐘共享快取 + 資料源與交易日標註 + stale 標記。
 * ⚠ X-Skynet-Trade-Date 必須是純 ASCII 字串：HTTP header 不接受 CJK 字元
 * （非 ASCII 會觸發 ByteString TypeError，route 直接 500）。
 * sourceLabel（含中文「收盤」）只放 response body，不放 header。
 */
function responseHeaders(tradeDate: string, fromCache: boolean, stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'public, s-maxage=600',
    'X-Skynet-Data-Source': fromCache ? 'taifex-openapi-cache' : 'taifex-openapi-close',
    'X-Skynet-Trade-Date': tradeDate,
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

export async function GET(_req: NextRequest) {
  // in-memory 快取命中（1h TTL）：直接回 cached.data。
  // ⚠ 不 mutate cached.data 物件（會污染後續請求），NextResponse.json 會重新序列化。
  if (cached && Date.now() - cached.ts < DAILY_CACHE_TTL_MS) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: cached.data },
      { status: 200, headers: responseHeaders(cached.date, true, false) },
    );
  }

  const fresh = await fetchNearMonthQuote();
  if (fresh) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: fresh },
      { status: 200, headers: responseHeaders(fresh.date, false, false) },
    );
  }

  // 上游失敗：降級回傳最後一個交易日快取（前一日收盤 + 日期標註 + X-Skynet-Stale: 'true'），
  // 絕不捏造。stale=true 讓前端可顯示「前一日收盤」。
  if (cached) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: cached.data },
      { status: 200, headers: responseHeaders(cached.date, true, true) },
    );
  }

  // 無快取可用：回 502，前端該格顯示占位 '--'，不影響加權/櫃買兩格。
  return NextResponse.json<TaifexFuturesBody>(
    { ok: false, message: 'taifex_unavailable' },
    { status: 502, headers: { 'Cache-Control': 'public, s-maxage=600' } },
  );
}
