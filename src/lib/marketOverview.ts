/**
 * 看盤日記 — 大盤總覽資料抓取與解析
 *
 * 設計原則（依 team-lead 規格）：
 * 1. 所有解析邏輯集中在 lib（route 檔只能匯出 HTTP 方法，無法放額外具名匯出）。
 * 2. 唯讀，不快取會每次開首頁拉 ~7MB，故以模組層 TTL 快取（key = 解析出的日期）。
 * 3. 日期解析先探測便宜的 openapi（47KB），失敗才從「台北時區今天」往回最多 7 天逐日探測。
 * 4. 漲跌家數取「股票」欄，不是「整體市場」欄。
 */

import type {
  InstitutionalBuy,
  MarketBreadth,
  MarketIndexQuote,
  MarketMover,
  MarketOverview,
  SectorFocus,
  TurnoverCategory,
} from '@/types/market';

/** 可注入的 fetch（便於測試）。 */
export type FetchLike = typeof fetch;

/** 大盤總覽相關錯誤，只攜帶可安全外洩的自家錯誤碼。 */
export class MarketOverviewError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MarketOverviewError';
  }
}

const TWSE_UA_HEADERS: Record<string, string> = {
  // TWSE 會擋沒有 User-Agent 的請求（實測）。
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

const OPENAPI_MI_INDEX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX?type=ALL';

function rwdMiIndexUrl(date: string): string {
  return `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${date}&type=ALL&response=json`;
}

function rwdT86Url(date: string): string {
  return `https://www.twse.com.tw/rwd/zh/fund/T86?date=${date}&selectType=ALL&response=json`;
}

const DEFAULT_TTL_MS = 60_000;
const MAX_BACKTRACK_DAYS = 7;

/**
 * 舊制「總類股」指數名稱。
 *
 * tables[0] 同時並列舊制 5 檔總類股與新制細類指數，兩者會重複表達同一族群，
 * 若一併列出會產生重複且失真的排行（37 → 32 檔），故明確排除。
 */
const LEGACY_SECTOR_INDEX_NAMES: ReadonlySet<string> = new Set([
  '水泥窯製類指數',
  '塑膠化工類指數',
  '機電類指數',
  '化學生技醫療類指數',
  '電子工業類指數',
]);

/** 類股指數名稱的固定後綴。 */
const SECTOR_INDEX_SUFFIX = '類指數';

/** rwd 回應中的單張 table：真實格式為 { title, fields, data }，但容忍直接是 rows 陣列。 */
type RawTable = { data?: string[][] } | string[][] | null | undefined;

/** 取出 table 的資料列（相容 { data } 物件與純陣列兩種格式）。 */
function rowsOf(table: RawTable): string[][] {
  if (Array.isArray(table)) return table as string[][];
  if (table && Array.isArray((table as { data?: string[][] }).data)) {
    return (table as { data: string[][] }).data;
  }
  return [];
}

// ── 純解析函式 ────────────────────────────────────────────────

/**
 * 解析 TWSE 數字字串（去除千分位逗號與空白）。
 * `'45,848.90'` → `45848.9`；空值或非數字回 `NaN`（呼叫端負責過濾）。
 */
export function parseTwseNumber(raw: string): number {
  if (raw === null || raw === undefined) return NaN;
  const cleaned = String(raw).replace(/,/g, '').replace(/\s/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

/**
 * 解析漲跌方向。TWSE 的符號藏在 HTML 裡，且兩種格式不一致（有/無引號）。
 * 規則：含 `red` → `1`；含 `green` → `-1`；否則字串內找 `+` / `-`；都沒有回 `0`。
 */
export function parseTwseSign(raw: string): 1 | -1 | 0 {
  const text = String(raw ?? '');
  if (text.includes('red')) return 1;
  if (text.includes('green')) return -1;
  const plus = text.indexOf('+');
  const minus = text.indexOf('-');
  if (plus !== -1 && (minus === -1 || plus < minus)) return 1;
  if (minus !== -1 && (plus === -1 || minus < plus)) return -1;
  return 0;
}

/**
 * 解析「家數(漲跌停家數)」格式。
 * `'733(24)'` → `{count:733, limit:24}`；`'1,157'` → `{count:1157, limit:0}`。
 */
export function parseCountWithLimit(raw: string): { count: number; limit: number } {
  const text = String(raw ?? '');
  const match = text.match(/([\d,]+)\s*(?:\(\s*([\d,]+)\s*\))?/);
  if (!match) return { count: 0, limit: 0 };
  const count = parseTwseNumber(match[1]);
  const limit = match[2] ? parseTwseNumber(match[2]) : 0;
  return {
    count: Number.isFinite(count) ? count : 0,
    limit: Number.isFinite(limit) ? limit : 0,
  };
}

/**
 * 民國日期字串轉西元 ISO 日期。`'1150916'` → `'2026-09-16'`。
 * 長度不足或非數字回 `null`。
 */
export function parseRocDate(raw: string): string | null {
  const text = String(raw ?? '').trim();
  if (!/^\d{7}$/.test(text)) return null;
  const year = Number(text.slice(0, 3)) + 1911;
  const month = Number(text.slice(3, 5));
  const day = Number(text.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `'20260916'` → `'2026-09-16'`；格式不符則原樣回傳。 */
export function ymdToIso(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 從 MI_INDEX tables[0]（價格指數）取加權指數收盤。
 * 找不到時回傳 price 為 `NaN` 的佔位物件，由呼叫端判斷是否視為錯誤。
 */
export function extractIndex(tables: RawTable[]): MarketIndexQuote {
  const rows = rowsOf(tables?.[0]);
  const row = rows.find((item) => String(item?.[0] ?? '').trim() === '發行量加權股價指數');
  if (!row) {
    return { symbol: 'tse_t00.tw', name: '加權指數', price: NaN, change: 0, changePercent: 0, source: 'twse-mi-index-close' };
  }
  const price = parseTwseNumber(row[1]);
  const sign = parseTwseSign(row[2]);
  const change = parseTwseNumber(row[3]) * sign;
  // 漲跌百分比欄位本身已帶正負，不再乘 sign。
  const changePercent = parseTwseNumber(row[4]);
  return {
    symbol: 'tse_t00.tw',
    name: '加權指數',
    price: Number.isFinite(price) ? price : NaN,
    change: Number.isFinite(change) ? change : 0,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    source: 'twse-mi-index-close',
  };
}

/**
 * 從 MI_INDEX tables[0]（價格指數）取「產業焦點」：各類股指數當日表現。
 *
 * 資料陷阱（實打驗證）：
 * 1. `漲跌點數`（第 3 欄）恆為無號 → 必須乘上第 2 欄的符號（parseTwseSign）。
 * 2. `漲跌百分比`（第 4 欄）本身已帶正負 → 不可再乘符號。
 * 3. 舊制 5 檔「總類股」與新制細類並列，會重複計算，需排除（37 → 32）。
 *
 * @param tables MI_INDEX 的 tables 陣列（僅讀 tables[0]）
 * @param limit  最多回傳幾筆（依漲跌百分比由大到小）
 * @returns 已去掉「類指數」後綴的類股名稱，加上指數、漲跌點數與漲跌百分比
 */
export function extractSectorFocus(tables: RawTable[], limit = 5): SectorFocus[] {
  const rows = rowsOf(tables?.[0]);
  const result: SectorFocus[] = [];
  for (const row of rows) {
    const fullName = String(row?.[0] ?? '').trim();
    if (!fullName.endsWith(SECTOR_INDEX_SUFFIX)) continue;
    if (LEGACY_SECTOR_INDEX_NAMES.has(fullName)) continue;
    const index = parseTwseNumber(row[1]);
    if (!Number.isFinite(index)) continue;
    const sign = parseTwseSign(row[2]);
    const rawChange = parseTwseNumber(row[3]);
    const change = Number.isFinite(rawChange) ? rawChange * sign : 0;
    const rawPercent = parseTwseNumber(row[4]);
    const changePercent = Number.isFinite(rawPercent) ? rawPercent : 0;
    result.push({
      name: fullName.slice(0, fullName.length - SECTOR_INDEX_SUFFIX.length),
      index,
      change,
      changePercent,
    });
  }
  return result.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}

/**
 * 從 MI_INDEX tables[7]（漲跌證券數合計）取漲跌家數。
 * 第 3 欄為「股票」家數（原版顯示的 733 家），第 2 欄為「整體市場」（含權證 ETF）。
 */
export function extractBreadth(tables: RawTable[]): MarketBreadth {
  const rows = rowsOf(tables?.[7]);
  const find = (keyword: string) => rows.find((item) => String(item?.[0] ?? '').includes(keyword));
  const upRow = find('上漲');
  const downRow = find('下跌');
  const flatRow = find('持平');
  const noTradeRow = find('未成交');
  const up = upRow ? parseCountWithLimit(upRow[2]).count : 0;
  const upLimit = upRow ? parseCountWithLimit(upRow[2]).limit : 0;
  const down = downRow ? parseCountWithLimit(downRow[2]).count : 0;
  const downLimit = downRow ? parseCountWithLimit(downRow[2]).limit : 0;
  const flat = flatRow ? parseCountWithLimit(flatRow[2]).count : 0;
  const noTrade = noTradeRow ? parseCountWithLimit(noTradeRow[2]).count : 0;
  const denom = up + down + flat;
  return { up, down, flat, noTrade, upLimit, downLimit, upRatio: denom > 0 ? up / denom : 0 };
}

/**
 * 從 MI_INDEX tables[6]（大盤統計資訊）取成交金額。
 * 只累加 label 形如 `1.一般股票` 的列；label 含「合計」者跳過以免重複計算。
 */
export function extractTurnover(tables: RawTable[]): { total: number; categories: TurnoverCategory[] } {
  const rows = rowsOf(tables?.[6]);
  const categories: TurnoverCategory[] = [];
  for (const row of rows) {
    const label = String(row?.[0] ?? '').trim();
    if (!/^\d+\./.test(label)) continue;
    if (label.includes('合計')) continue;
    const amount = parseTwseNumber(row[1]);
    if (!Number.isFinite(amount)) continue;
    categories.push({ label, amount });
  }
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  return { total, categories };
}

/**
 * 從 MI_INDEX tables[8]（每日收盤行情）取今日強股。
 * 只保留 4 碼普通股（自動排除 00400A 這類 ETF/ETN 與權證），依漲幅由大到小取前 N。
 */
export function extractTopGainers(tables: RawTable[], limit = 5): MarketMover[] {
  const rows = rowsOf(tables?.[8]);
  const movers: MarketMover[] = [];
  for (const row of rows) {
    const symbol = String(row?.[0] ?? '').trim();
    if (!/^\d{4}$/.test(symbol)) continue;
    const price = parseTwseNumber(row[8]);
    const sign = parseTwseSign(row[9]);
    const rawChange = parseTwseNumber(row[10]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(rawChange)) continue;
    const change = rawChange * sign;
    const prevClose = price - change;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    movers.push({
      symbol,
      name: String(row?.[1] ?? '').trim(),
      price,
      change,
      changePercent,
    });
  }
  return movers.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}

/**
 * 從 T86 回應取三大法人買超。netLots = 三大法人買賣超股數 / 1000（四捨五入到整數張）。
 * 只保留 4 碼普通股，依買超張數由大到小取前 N。
 */
export function extractInstitutionalBuy(t86: unknown, limit = 5): InstitutionalBuy[] {
  const rows = rowsOf(t86 as RawTable);
  const fields =
    t86 && typeof t86 === 'object' && !Array.isArray(t86) && Array.isArray((t86 as { fields?: unknown }).fields)
      ? ((t86 as { fields: string[] }).fields)
      : [];
  let netIndex = fields.indexOf('三大法人買賣超股數');
  if (netIndex < 0) netIndex = 18;
  const result: InstitutionalBuy[] = [];
  for (const row of rows) {
    const symbol = String(row?.[0] ?? '').trim();
    if (!/^\d{4}$/.test(symbol)) continue;
    const shares = parseTwseNumber(row[netIndex]);
    if (!Number.isFinite(shares)) continue;
    result.push({
      symbol,
      name: String(row?.[1] ?? '').trim(),
      netLots: Math.round(shares / 1000),
    });
  }
  return result.sort((a, b) => b.netLots - a.netLots).slice(0, limit);
}

/** 由已抓取的 MI_INDEX / T86 JSON 組出大盤總覽（純函式）。 */
export function parseMarketOverview(
  miIndexJson: { tables?: RawTable[] } | null | undefined,
  t86Json: unknown,
  dateYmd: string,
): MarketOverview {
  const tables = Array.isArray(miIndexJson?.tables) ? (miIndexJson as { tables: RawTable[] }).tables : [];
  return {
    date: ymdToIso(dateYmd),
    indexClose: extractIndex(tables),
    breadth: extractBreadth(tables),
    turnover: extractTurnover(tables),
    topGainers: extractTopGainers(tables),
    institutionalBuy: extractInstitutionalBuy(t86Json),
    sectorFocus: extractSectorFocus(tables),
  };
}

// ── 日期解析 ──────────────────────────────────────────────────

/** 以台北時區取得今天（'YYYYMMDD'）。Worker 跑在 UTC，必須指定時區。 */
function taipeiTodayYmd(): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return formatted.replace(/-/g, '');
}

/** 將 'YYYYMMDD' 位移 deltaDays 天（負數為往前）。 */
function shiftYmd(ymd: string, deltaDays: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * 探測指定日期（'YYYYMMDD'）的 rwd MI_INDEX 是否為有效交易日（`stat === 'OK'`）。
 * 非 200、解析失敗或拋出例外一律視為「非交易日」。
 */
async function probeTradingDay(doFetch: FetchLike, ymd: string): Promise<boolean> {
  try {
    const res = await doFetch(rwdMiIndexUrl(ymd), { headers: TWSE_UA_HEADERS, cache: 'no-store' });
    if (!res.ok) return false;
    const json = (await res.json()) as { stat?: string };
    return json?.stat === 'OK';
  } catch {
    return false;
  }
}

/**
 * 解析最近一個交易日（'YYYYMMDD'）。
 *
 * 步驟：
 * 1. 先用便宜的 openapi MI_INDEX（47KB）取第一列的民國日期 → `openapiYmd`。
 * 2. `openapiYmd` 已是今天（或更晚）→ 直接回傳（快路徑，不額外抓取）。
 * 3. `openapiYmd` 落後於今天 → 探測「今天」的 rwd MI_INDEX：
 *    - `stat === 'OK'`（今天已是交易日且資料已發布）→ 回傳今天。
 *    - 否則（週末／假日／資料尚未發布）→ 回傳 `openapiYmd`。
 * 4. openapi 完全探測失敗 → 從台北今天往回最多 7 天，逐一檢查 rwd MI_INDEX 的 `stat === 'OK'`。
 *
 * 為什麼需要步驟 3：openapi 常落後一整個交易日。若照舊直接回傳 openapi 日期，
 * /diary 會出現「即時指數是今天、漲跌家數／成交金額／產業焦點卻是昨天」的混日現象。
 */
export async function resolveLatestTradingDate(fetchImpl?: FetchLike): Promise<string | null> {
  // 可選參數在本體內解析，並在真的沒有 fetch 時丟出可被 catch 的領域錯誤（而非裸的 ReferenceError）。
  // 注意：此守衛必須在 try 之外，否則會被下方 catch 吞掉。
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new MarketOverviewError('此執行環境沒有可用的 fetch，請於呼叫時傳入 fetchImpl。');
  }

  const today = taipeiTodayYmd();

  // 步驟 1：便宜的 openapi 探測（47KB）。
  let openapiYmd: string | null = null;
  try {
    const res = await doFetch(OPENAPI_MI_INDEX_URL, { headers: TWSE_UA_HEADERS, cache: 'no-store' });
    if (res.ok) {
      const rows = (await res.json()) as Array<Record<string, string>>;
      if (Array.isArray(rows) && rows.length > 0) {
        const iso = parseRocDate(String(rows[0]?.['日期'] ?? ''));
        if (iso) openapiYmd = iso.replace(/-/g, '');
      }
    }
  } catch {
    // openapi 探測失敗 → 保持 null，稍後改用逐日回推
  }

  // 步驟 2：openapi 已是最新（今天或更晚）→ 直接回傳，不額外抓取。
  if (openapiYmd && openapiYmd >= today) return openapiYmd;

  // 步驟 3：openapi 落後於今天 → 探測今天是否已是有資料的交易日。
  if (openapiYmd) {
    const todayIsTradingDay = await probeTradingDay(doFetch, today);
    return todayIsTradingDay ? today : openapiYmd;
  }

  // 步驟 4：openapi 探測失敗 → 維持既有逐日回推邏輯（行為與舊版一致）。
  for (let offset = 0; offset <= MAX_BACKTRACK_DAYS - 1; offset += 1) {
    const ymd = shiftYmd(today, -offset);
    try {
      const res = await doFetch(rwdMiIndexUrl(ymd), { headers: TWSE_UA_HEADERS, cache: 'no-store' });
      if (!res.ok) continue;
      const json = (await res.json()) as { stat?: string };
      if (json?.stat === 'OK') return ymd;
    } catch {
      // 換下一天
    }
  }
  return null;
}

// ── 抓取 + TTL 快取 ───────────────────────────────────────────

type OverviewCacheEntry = { data: MarketOverview; expiresAt: number };
const overviewCache = new Map<string, OverviewCacheEntry>();

function cacheTtlMs(): number {
  const raw = Number(process.env.SKYNET_MARKET_OVERVIEW_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

/**
 * 取得大盤總覽（含 TTL 快取）。
 * 並行抓取 rwd MI_INDEX（4.8MB）與 rwd T86（2.17MB），兩者皆帶 User-Agent。
 */
export async function loadMarketOverview(date?: string, fetchImpl?: FetchLike): Promise<MarketOverview> {
  // 同 resolveLatestTradingDate：可選參數在本體內解析，無 fetch 時丟可被 catch 的領域錯誤。
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new MarketOverviewError('此執行環境沒有可用的 fetch，請於呼叫時傳入 fetchImpl。');
  }

  const requested = date && /^\d{8}$/.test(date) ? date : null;
  const resolved = requested ?? (await resolveLatestTradingDate(doFetch));
  if (!resolved) throw new MarketOverviewError('no_trading_date');

  const cached = overviewCache.get(resolved);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const [miRes, t86Res] = await Promise.all([
    doFetch(rwdMiIndexUrl(resolved), { headers: TWSE_UA_HEADERS, cache: 'no-store' }),
    doFetch(rwdT86Url(resolved), { headers: TWSE_UA_HEADERS, cache: 'no-store' }),
  ]);

  if (!miRes.ok) throw new MarketOverviewError('upstream_error');
  const miJson = (await miRes.json()) as { stat?: string; tables?: RawTable[] };
  if (miJson?.stat !== 'OK') throw new MarketOverviewError('upstream_error');

  let t86Json: unknown = null;
  if (t86Res.ok) {
    t86Json = await t86Res.json().catch(() => null);
  }

  const overview = parseMarketOverview(miJson, t86Json, resolved);
  overviewCache.set(resolved, { data: overview, expiresAt: Date.now() + cacheTtlMs() });
  return overview;
}

/** 清空快取（測試用）。 */
export function clearMarketOverviewCache(): void {
  overviewCache.clear();
}
