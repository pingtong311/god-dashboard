/**
 * 台股期貨近月收盤代理（TAIFEX 官方 OpenAPI）
 * GET /api/skynet/futures
 *
 * 資料源（單源，無回退）：
 *   https://openapi.taifex.com.tw/v1/DailyMarketReportFut
 *   （免費、免金匙、無 Referer 檢查、200 直連、0 重定向；806,830 bytes 全表）
 *   舊端點 api.taiex.com.tw 本機 NXDOMAIN（網域未註冊），無第二官方主機。
 *
 * ⚠ fetch 策略（shioaji-research 2026-09-20 實測 + team-lead 裁示定案）：
 * - 精確 URL 常量，無尾斜線、無 query（尾斜線 → 302 到站根 Swagger UI →
 *   follow 後最終 200 + 1793 bytes text/html；!res.ok 擋不住，靠 res.json() 拋
 *   SyntaxError 兜底；query → 邊緣快取 MISS 回源，原站回源不穩定 522/20s）
 * - redirect 用 fetch 預設 'follow'（精確 URL 實測 0 重定向，直接 200）
 * - 不寫自訂 Accept 頭（衛生習慣；上游正確回應 content-type 是
 *   application/octet-stream，非 application/json，寫 content-type 白名單會 100% 誤殺）
 * - AbortSignal.timeout(4_000)：HIT ~0.5s；回源 20s 掛起會被 4s 斷掉走 stale-on-error
 * - 不做重試（精確 URL 實測 4/4 + 6/6 成功，重試只在最壞場景加倍延遲）
 * - 不做雙源回退（api.taiex / api.taifex / taiex.com.tw 全部 NXDOMAIN）
 *
 * 挑選規則：
 * - Contract === 'TX'（TAIFEX 官方代號；Shioaji 的 TXF/TXFR1 命名 TAIFEX 沒有，勿混用）
 * - ContractMonth(Week)：/^\d{6}$/ 唯一防線（排除價差列 '202610/202611' 13 字元）
 *   + endsWith('W') 冗餘保險（排除週別代碼；實測 0 筆，當前 no-op，不依賴它）
 * - TradingSession === '一般'（同合約有「盤後」列，取錯會拿到盤後價）
 * - 取到期月最小者為「期近月」：用 '<' 字串比較（6 位定長純數字，字典序=數值序），
 *   嚴禁 localeCompare（Workers 冷啟動 ICU 惰性初始化 +8.5~9.5ms，60/60 越過 Free 10ms CPU）
 *
 * 空值防護：'-' / 'NULL' / '' 一律轉 null（絕不當 0，否則漲跌會顯示成平盤）。
 * lastPrice 保證 > 0（filter 先做 (parseNum(row.Last) ?? 0) > 0 把無效行擋掉），
 * 故 lastPrice 型別為 number（非 nullable）。change/changePercent 上游哨兵值轉 null，
 * 前端 formatChange/formatPercent 對 null 會顯示 '--'，不造假數字。
 *
 * ⚠ EOD 語義（已查證，非推測）：此來源是收盤後發布，盤中（08:45–13:45）拿到的
 * Date 必為前一交易日，故 data.sourceLabel 帶日期（如「收盤 09/18」），前端據此顯示，
 * 避免使用者誤以為是即時價。
 *
 * 快取（三層）：
 * 1. KV（Cloudflare 綁定 SKYNET_CACHE，跨 isolate，30 分鐘 TTL）：只存 ~200 字節
 *    精簡物件 { ts, date, data }，絕不存 806KB 原表。入口命中條件：同日期（tradeDate
 *    必等於當前 UTC 日，EOD 語義：盤中拿前一天收盤 → 不命中 → 不串跨日資料）且 30 分鐘內。
 *    命中回 X-Skynet-Data-Source: kv-cache。KV 讀寫皆 catch 兜底，不可用不阻塞主流程。
 * 2. 交易日級 in-memory（1h TTL，team-lead 裁示）；收盤後換到新一天。
 * 另在 HTTP header 帶 10 分鐘 s-maxage（⚠ src/middleware.ts 對 /api/skynet/* 強制
 * 覆寫 no-store，此 header 只是裁示要求的標記，不可當防線）。
 * 上游失敗時降級回傳最後一個交易日快取（前一日收盤 + X-Skynet-Stale: true）；
 * 無快取才回 200 + { ok: false, message: 'taifex_unavailable' }（前端 allSettled
 * 顯示 '--'，不 5xx，不把首頁帶崩）。
 *
 * 回傳 shape：{ ok: true, data: { name, lastPrice, change, changePercent,
 * sourceLabel, source, date, contract, fetchedAt } }，對齊前端 TaifexFuturesQuote
 * （src/types/market.ts；data 多一個 fetchedAt 超集欄位，前端解構不受影響）；
 * 失敗一律回 200 + { ok: false, message }，不 5xx。
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// 精確 URL 常量：禁止拼接尾斜線或 query（shioaji-research 2026-09-20 實測）：
//   尾斜線 → 302 到 https://openapi.taifex.com.tw/ → 200 + text/html（1793 bytes）
//           最終碼是 200，!res.ok 擋不住，靠 res.json() 拋 SyntaxError 兜底
//   query  → Cloudflare 邊緣快取以完整 URL 為 key，首次 MISS 回源 806KB
//            （原站回源不穩定：522 掛 ~19.5s 或 20s 慢速 200）
const FUTURES_URL = 'https://openapi.taifex.com.tw/v1/DailyMarketReportFut';
/** 上游 fetch 超時：4s（HIT ~0.5s；回源 20s 掛起會被 4s 斷掉走 stale-on-error）。 */
const UPSTREAM_TIMEOUT_MS = 4_000;
/** 交易日級 in-memory 快取 TTL：1 小時（team-lead 裁示；收盤後 1h 內換到新一天）。 */
const DAILY_CACHE_TTL_MS = 3_600_000;
/** KV 快取 TTL：30 分鐘（與 in-memory 對齊的較短窗口；寫入用 expirationTtl=1800）。 */
const KV_TTL_MS = 30 * 60 * 1000;
/** KV key：期近月收盤快照（精簡物件，~200 字節，絕非 806KB 原表）。 */
const KV_KEY = 'futures_nearest';

/** KV 綁定型別（Cloudflare KV Namespace 最小介面；本專案綁定名 SKYNET_CACHE）。 */
type SkynetKv = {
  get: (key: string, type?: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

/**
 * 取 KV 綁定（可能 undefined——本地 dev / 未綁定 / 非 Workers 環境，讀寫一律走 catch
 * 兜底不阻塞）。
 *
 * 透過 @opennextjs/cloudflare 的 getCloudflareContext({ async: true }) 取得 env 綁定；
 * ⚠ 不可改用 `globalThis.SKYNET_CACHE`（v1.20.1 在 Workers 生產環境不掛 globalThis
 * → 恆為 undefined，導致此 route 的 KV 快取層從未生效，一直靜默退回直接 fetch）。
 */
async function getKv(): Promise<SkynetKv | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { SKYNET_CACHE?: SkynetKv }).SKYNET_CACHE;
  } catch {
    return undefined;
  }
}

/**
 * in-flight 去重（冷啟動 CPU 風險關鍵一環）：
 * 存「進行中的 fetch Promise」而非結果，N 個並發請求只觸發 1 次 806KB fetch+parse。
 * finally 裡清空（含 rejected），避免卡住直到 isolate 重啟。
 */
let inflight: Promise<TaifexFuturesData | null> | null = null;

/**
 * 交易日級 in-memory 快取（best-effort per-isolate，不依賴 KV 寫入權限）。
 * 金鑰 = 資料 tradeDate（YYYYMMDD）+ 1h TTL。
 */
let cached: { ts: number; date: string; data: TaifexFuturesData } | null = null;

/** TAIFEX DailyMarketReportFut 單筆欄位（值皆為字串，可能為 '-' / 'NULL' / ''）。 */
type TaifexFutRow = {
  Date?: string;
  Contract?: string;
  'ContractMonth(Week)'?: string;
  Last?: string;
  Change?: string;
  '%'?: string;
  TradingSession?: string;
  [key: string]: string | undefined;
};

/**
 * 對齊前端 src/types/market.ts 的 TaifexFuturesQuote（超集：多 fetchedAt 供運維追蹤）。
 * lastPrice: number（非 nullable）——filter 已做 (parseNumOrNull(row.Last) ?? 0) > 0
 *   擋掉無效行，故 selected row 的 lastPrice 保證 > 0。
 * change/changePercent: number | null——上游哨兵值（'-'/'NULL'/''）轉 null，
 *   前端 formatChange/formatPercent 對 null 顯示 '--'，不造假數字。
 */
type TaifexFuturesData = {
  name: string;
  /** 收盤價（EOD）；保證 > 0（filter 已擋 null/0）。 */
  lastPrice: number;
  /** 漲跌點數（帶正負）；上游哨兵值轉 null。 */
  change: number | null;
  /** 漲跌百分比（帶正負）；上游哨兵值轉 null。 */
  changePercent: number | null;
  /** 前端展示用：「收盤 MM/DD」——EOD 來源連日期一起顯示。 */
  sourceLabel: string;
  source: 'taifex-openapi-close';
  /** 交易日 'YYYY-MM-DD'。 */
  date: string;
  /** 近月合約月，形如 '2026-10'。 */
  contract: string;
  /** ISO 時間戳，供運維追蹤快取新鮮度。 */
  fetchedAt: string;
};

type TaifexFuturesBody =
  | { ok: true; data: TaifexFuturesData }
  | { ok: false; message: string };

/** KV 存檔精簡物件：{ ts, date, data }（~200 字節）。 */
type KvStored = { ts: number; date: string; data: TaifexFuturesData };

/** 空值防護：'-' / 'NULL' / '' / undefined 一律回 null（絕不當 0，避免漲跌顯示成平盤）。 */
function parseNumOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === '-' || value === 'NULL') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** '%' 欄位格式：'2.06%' / '-1.11%' / '-'。去 % 後轉數字，無效回 null。 */
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

/** 當前 UTC 日 'YYYY-MM-DD'（KV 命中判定用）。 */
function currentTradeDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 寫 KV（精簡 ~200 字節快照，TTL 30 分鐘）；寫失敗不阻塞主流程（KV 是優化非必需）。 */
async function writeKv(tradeDate: string, data: TaifexFuturesData): Promise<void> {
  const kv = await getKv();
  if (!kv) return;
  const payload = JSON.stringify({ ts: Date.now(), date: tradeDate, data } satisfies KvStored);
  try {
    await kv.put(KV_KEY, payload, { expirationTtl: 1800 });
  } catch {
    /* KV 寫失敗不阻塞；log 僅供運維，避免冷啟動 console CPU 開銷 */
  }
}

/** 從全表挑 TX 近月「一般」時段收盤行；無有效行回 null（交回呼叫端決定降級）。 */
function pickNearestMonth(raw: TaifexFutRow[]): TaifexFuturesData | null {
  // 形狀斷言（必需）：在任何欄位讀取之前，雙保險擋「200 + 錯誤內容」陷阱。
  if (!Array.isArray(raw) || raw.length === 0) return null;

  // 近月：TX + /^\d{6}$/（唯一防線：排除 13 字元價差列 + 週別碼）
  // + 非 W 尾碼（冗餘保險）+ 一般時段 + (Last ?? 0) > 0（擋掉無有效收盤價的行）。
  const candidates = raw.filter((row) => {
    const m = String(row['ContractMonth(Week)'] ?? '');
    if (!/^\d{6}$/.test(m)) return false; // 唯一防線：排除價差列 + 非 6 位代碼
    if (m.toUpperCase().endsWith('W')) return false; // 週別契約冗餘保險（實測 0 筆，no-op）
    if (row.Contract !== 'TX' || row.TradingSession !== '一般') return false;
    return (parseNumOrNull(row.Last) ?? 0) > 0; // null 安全比較：'-'/'NULL'/'' → 0 → 過濾
  });

  if (candidates.length === 0) return null;

  // 嚴禁 localeCompare（見檔首）：6 位定長純數字直接字串 '<' 比較，零成本。
  let nearest = candidates[0];
  for (const row of candidates) {
    const m1 = String(nearest['ContractMonth(Week)'] ?? '');
    const m2 = String(row['ContractMonth(Week)'] ?? '');
    if (m2 < m1) nearest = row;
  }

  const lastPrice = parseNumOrNull(nearest.Last);
  // candidates 已做 (lastPrice ?? 0) > 0 過濾，故 lastPrice 此時保證 > 0；
  // 若因極端情況（上游資料異常）為 null，仍交回 ok:false，不造假數字。
  if (lastPrice === null || lastPrice <= 0) return null;

  const tradeDate = String(nearest.Date ?? '');
  const monthDay = toMonthDay(tradeDate);
  const data: TaifexFuturesData = {
    name: '台股期近月',
    lastPrice,
    // 哨兵值（'-'/'NULL'/''）轉 null——前端 formatChange 對 null 顯示 '--'，不造假數字。
    change: parseNumOrNull(nearest.Change),
    changePercent: parsePercentOrNull(nearest['%']),
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
  // fire-and-forget 寫 KV（不 await：KV 寫失敗/延遲不阻塞本次回應；catch 內建）。
  void writeKv(tradeDate, data);
  return data;
}

/**
 * 抓 806KB 全表並挑近月；網路/DNS/NXDOMAIN/逾時/非 2xx/HTML/非 JSON 一律回 null。
 * redirect 用 fetch 預設 'follow'（精確 URL 實測 0 重定向，直接 200）；
 * 若未來出現 302 陷阱，最終 200 + HTML 會由 res.json() 拋 SyntaxError 兜底 → null。
 * 不加 Accept 自訂頭（上游正確回應 content-type 是 application/octet-stream，非 json）。
 */
async function fetchNearMonthQuoteRaw(): Promise<TaifexFuturesData | null> {
  let raw: unknown;
  try {
    const res = await fetch(FUTURES_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null; // 必要但不充分（HTML 200 陷阱靠下方斷言擋）
    raw = await res.json(); // HTML 在此拋 SyntaxError → catch → null
  } catch {
    // 不區分 TimeoutError / AbortError / SyntaxError：一律 stale-on-error。
    return null;
  }
  // 形狀斷言（必需）：在任何欄位讀取之前，擋「200 + 非 array」內容。
  if (!Array.isArray(raw)) return null;
  return pickNearestMonth(raw as TaifexFutRow[]);
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
 * 回傳 header：10 分鐘共享快取標記（裁示 B；⚠ 會被 src/middleware.ts 覆寫 no-store，
 * 只是標記、不是防線）+ 資料源與交易日標註 + stale 標記。
 * ⚠ X-Skynet-Trade-Date 必須是純 ASCII 字串：HTTP header 不接受 CJK 字元
 * （非 ASCII 會觸發 ByteString TypeError，route 直接 500）。
 * sourceLabel（含中文「收盤」）只放 response body，不放 header。
 * dataKind：'kv-cache'（KV 命中）/ 'taifex-openapi-cache'（in-memory 命中）/
 * 'taifex-openapi-close'（上游新鮮抓取）。
 */
function responseHeaders(
  tradeDate: string,
  dataKind: 'fresh' | 'in-memory-cache' | 'kv-cache',
  stale: boolean,
): Record<string, string> {
  const source =
    dataKind === 'kv-cache'
      ? 'kv-cache'
      : dataKind === 'in-memory-cache'
        ? 'taifex-openapi-cache'
        : 'taifex-openapi-close';
  return {
    'Cache-Control': 'public, s-maxage=600',
    'X-Skynet-Data-Source': source,
    'X-Skynet-Trade-Date': tradeDate,
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

export async function GET(_req: NextRequest) {
  // KV 命中（跨 isolate，30 分鐘 TTL）：同日期且未過期才用。
  // EOD 語義：盤中拿到的 tradeDate 必為前一交易日 ≠ 當前 UTC 日 → 不命中，
  // 避免跨日串資料（盤中必須重抓前一交易日的新快照）。
  const kv = await getKv();
  if (kv) {
    const kvHit = (await kv.get(KV_KEY, 'json').catch(() => null)) as
      | KvStored
      | null
      | undefined;
    if (kvHit && kvHit.date === currentTradeDate() && Date.now() - kvHit.ts < KV_TTL_MS) {
      return NextResponse.json<TaifexFuturesBody>(
        { ok: true, data: kvHit.data },
        { status: 200, headers: responseHeaders(kvHit.date, 'kv-cache', false) },
      );
    }
  }

  // in-memory 快取命中（1h TTL）：直接回 cached.data，CPU ≈ 0。
  // ⚠ 不 mutate cached.data 物件（會污染後續請求），NextResponse.json 會重新序列化。
  if (cached && Date.now() - cached.ts < DAILY_CACHE_TTL_MS) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: cached.data },
      { status: 200, headers: responseHeaders(cached.date, 'in-memory-cache', false) },
    );
  }

  const fresh = await fetchNearMonthQuote();
  if (fresh) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: fresh },
      { status: 200, headers: responseHeaders(fresh.date, 'fresh', false) },
    );
  }

  // 上游失敗：降級回傳最後一個交易日快取（前一日收盤 + X-Skynet-Stale: true），絕不捏造。
  // stale=true：標記此為非新鮮資料，前端可據此顯示「前一日收盤」。
  if (cached) {
    return NextResponse.json<TaifexFuturesBody>(
      { ok: true, data: cached.data },
      { status: 200, headers: responseHeaders(cached.date, 'in-memory-cache', true) },
    );
  }

  // 無快取（冷啟動首次失敗）：200 + ok:false，前端 allSettled 顯示 '--'，不 5xx。
  // team-lead 裁示：回 200 而非 502，前端能接受 200 + ok:false，避開 502 的 UI 炸彈。
  return NextResponse.json<TaifexFuturesBody>(
    { ok: false, message: 'taifex_unavailable' },
    { status: 200, headers: { 'Cache-Control': 'public, s-maxage=600' } },
  );
}
