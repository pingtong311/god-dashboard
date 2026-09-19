/**
 * 資金雷達（Radar）代理
 * GET /api/skynet/radar?sort=concentration|streak|sync|volume
 *
 * 四大資金流向排序，找出主力正在佈局的標的。全部使用真實公開資料，取不到即為 null（顯示「未入庫」）。
 *
 * 資料來源（皆為官方公開端點）：
 * 1. 上市價量：TWSE OpenAPI exchangeReport/STOCK_DAY_ALL
 *    實際欄位（英文鍵）：Date(7 碼民國) / Code / Name / TradeVolume(成交股數) /
 *    TradeValue / OpeningPrice / HighestPrice / LowestPrice / ClosingPrice / Change(已帶正負) / Transaction
 * 2. 上櫃價量：TPEx OpenAPI tpex_mainboard_daily_close_quotes
 *    實際欄位：Date(7 碼民國) / SecuritiesCompanyCode / CompanyName / Close /
 *    Change(帶 +- 號) / Open / High / Low / Average / TradingShares(成交股數) / ...
 *    ⚠ 此端點約 11,000 筆，其中約 10,500 筆為權證（代號 7xxxxx），必須過濾，否則雷達會被權證洗版。
 * 3. 上市三大法人：TWSE rwd fund/T86（10 天回推 fallback，與 opendata/route.ts 同法）
 *    欄位索引：外陸資買賣超 4 / 投信買賣超 10 / 自營商買賣超 11（＝自行買賣＋避險）/ 三大法人合計 18；單位為「股」。
 *    ⚠ 自營商必須用 index 11（合計）；index 14 僅「自行買賣」不含避險，會低估自營商。
 *      此口徑與 /api/skynet/t86 一致（2330 驗算：6039 + 478 + 1361 = 7879 = index 18）。
 * 4. 上櫃三大法人：TPEx OpenAPI tpex_3insti_daily_trading（僅提供「最新一日」，date 參數會被忽略）
 *    ⚠ 規格原僅列 T86，但 T86 只涵蓋上市，會導致上櫃個股（本頁約 4 成）在法人排序中全為「未入庫」。
 *      故補上此官方端點，讓資金集中 / 法人同步 / 大量異常三種排序能涵蓋全市場。
 *    ⚠ 因該端點無歷史（date 參數無效），「連買動能」的上櫃個股無法計算連續天數，一律視為「未入庫」。
 *
 * 流動性門檻：成交金額 < 1,000 萬元者排除（見 MIN_TURNOVER，避免比率型指標因極小分母失真）。
 *
 * 快取：Cache-Control public, max-age=300。
 */

import { NextRequest, NextResponse } from 'next/server';

const TWSE_STOCK_DAY_ALL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_MAINBOARD = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const TPEX_3INSTI = 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading';
const TWSE_T86_BASE = 'https://www.twse.com.tw/rwd/zh/fund/T86';

/** 單一上游請求逾時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 連續買超最多計算到幾天（滿 10 天記為 10）。 */
const STREAK_LOOKBACK_DAYS = 10;
/** 為了湊到 10 個交易日，最多往前回推幾個日曆天。 */
const STREAK_SCAN_CALENDAR_DAYS = 16;
/** 連續買超歷史的並行抓取數（避免一次打太多請求被上游限流）。 */
const STREAK_FETCH_CONCURRENCY = 5;
/** 三大法人「最新一日」的回推上限（與 opendata 實作一致）。 */
const T86_FALLBACK_DAYS = 10;
/**
 * 最低成交金額門檻（元）。
 *
 * 資金集中度與大量異常皆為「法人買賣超 ÷ 成交量」的比率型指標，分母極小時會嚴重失真
 * （實測：某債券 ETF 當日僅成交 1 張、法人買超 1 張 → 集中度 100%，卻毫無意義）。
 * 故排除成交金額低於 1,000 萬元的標的，讓排行榜聚焦在真正有量能的個股 / ETF。
 * 此門檻高於 0，故頁面的「市值—小」分桶實質為 1,000 萬 ~ 1 億元。
 */
const MIN_TURNOVER = 10_000_000;

/** 市場別。 */
export type RadarMarket = '上市' | '上櫃' | 'ETF';

/** 排序模式。 */
export type RadarSort = 'concentration' | 'streak' | 'sync' | 'volume';

/** 資金雷達單一列。 */
export interface RadarRow {
  symbol: string;
  name: string;
  market: RadarMarket;
  price: number;
  change: number;
  changePercent: number;
  /** 當日成交張數（= 成交股數 / 1000）。 */
  volumeLots: number;
  /** 外資買賣超（張）；null = 未入庫。 */
  foreignNet: number | null;
  /** 投信買賣超（張）；null = 未入庫。 */
  trustNet: number | null;
  /** 自營商買賣超（張）；null = 未入庫。 */
  dealerNet: number | null;
  /** 三大法人合計買賣超（張）；null = 未入庫。 */
  totalNet: number | null;
  /** 三大法人買賣超金額（元）= totalNet × 1000 × price；null = 未入庫。 */
  netAmount: number | null;
  /** 資金集中度 = |totalNet| / volumeLots（0~1 小數）；null = 未入庫。 */
  concentration: number | null;
  /** 連續買超天數（1~10；10 代表 ≥10）；僅 sort=streak 時計算，其餘為 null；歷史查無此代號亦為 null（未入庫）。 */
  streakDays: number | null;
  /** 外資 > 0 且 投信 > 0 且 自營商 > 0。 */
  syncBuy: boolean;
  /** 大量異常：法人買超佔當日成交量比重（%）= totalNet / volumeLots × 100；null = 未入庫。 */
  volumeAnomaly: number | null;
}

/** TWSE OpenAPI STOCK_DAY_ALL 單列（僅取用到的欄位）。 */
type TwseStockRow = {
  Date?: string;
  Code?: string;
  Name?: string;
  TradeVolume?: string;
  ClosingPrice?: string;
  Change?: string;
};

/** TPEx OpenAPI 上櫃每日收盤行情單列（僅取用到的欄位）。 */
type TpexRow = {
  Date?: string;
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  Close?: string;
  Change?: string;
  TradingShares?: string;
};

/**
 * TPEx OpenAPI 上櫃三大法人單列。
 * 欄位鍵含空白且命名冗長（例如 'Foreign Investors include ...-Difference'），
 * 故不逐一宣告，改用關鍵字比對取值（見 pickTpex3iNet）。
 */
type Tpex3iRow = Record<string, string>;

/** T86 單列解析結果。 */
type T86NetRow = {
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
};

/** 單一交易日的 T86 資料。 */
type T86Day = {
  /** 'YYYY-MM-DD'。 */
  date: string;
  rows: Map<string, T86NetRow>;
};

/** 價量資料列。 */
type PriceRow = {
  symbol: string;
  name: string;
  market: RadarMarket;
  price: number;
  change: number;
  volumeLots: number;
};

/** 上游請求結果。 */
type FetchResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'timeout' }
  | { kind: 'error' };

const VALID_SORTS: readonly RadarSort[] = ['concentration', 'streak', 'sync', 'volume'];

/**
 * 解析可能帶千分位逗號或空值的數字。
 *
 * @param value 原始值。
 * @returns 解析後數字；無法解析時為 0。
 */
function parseNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 將股數換算為張數（四捨五入）。
 *
 * @param shares 股數（字串或數字）。
 * @returns 張數。
 */
function toLots(shares: unknown): number {
  return Math.round(parseNum(shares) / 1000);
}

/**
 * TWSE 7 碼民國日期（'1150918'）轉 'YYYY-MM-DD'。
 *
 * @param value 7 碼民國日期字串。
 * @returns 'YYYY-MM-DD'；格式不符時為空字串。
 */
function formatRoc7(value: string | undefined): string {
  if (!value || !/^\d{7}$/.test(value)) return '';
  const year = Number(value.slice(0, 3)) + 1911;
  return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

/**
 * TWSE 8 碼西元日期（'20260918'）轉 'YYYY-MM-DD'。
 *
 * @param value 8 碼西元日期字串。
 * @returns 'YYYY-MM-DD'；格式不符時為空字串。
 */
function formatGregorian8(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * 以本地時間取得 YYYYMMDD 字串（供 T86 date 參數使用）。
 *
 * @param offsetDays 往前回推的日曆天數。
 * @returns 'YYYYMMDD'。
 */
function toTwseDateParam(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 以本地時間取得今天的 'YYYY-MM-DD'。 */
function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 帶逾時的 JSON 取得。
 *
 * @param url 目標網址。
 * @returns 成功 / 逾時 / 失敗三態結果。
 */
async function fetchJson<T>(url: string): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 SkyNet' },
    });
    if (!res.ok) {
      return { kind: 'error' };
    }
    const data = (await res.json()) as T;
    return { kind: 'ok', data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { kind: 'timeout' };
    }
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 取得指定回推天數的 T86（三大法人）資料。
 *
 * @param offsetDays 往前回推的日曆天數。
 * @returns 該日資料；非交易日或失敗時為 null。
 */
async function fetchT86ByOffset(offsetDays: number): Promise<T86Day | null> {
  const requested = toTwseDateParam(offsetDays);
  const result = await fetchJson<{ stat?: string; date?: string; data?: string[][] }>(
    `${TWSE_T86_BASE}?response=json&date=${requested}&selectType=ALLBUT0999`,
  );
  if (result.kind !== 'ok') return null;

  const body = result.data;
  if (!body || body.stat !== 'OK' || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }

  const rows = new Map<string, T86NetRow>();
  for (const row of body.data) {
    const symbol = String(row[0] ?? '').trim();
    if (!symbol) continue;
    rows.set(symbol, {
      foreignNet: toLots(row[4]),
      trustNet: toLots(row[10]),
      // 自營商取 index 11（自行買賣＋避險合計）；index 14 僅自行買賣，會低估。
      dealerNet: toLots(row[11]),
      totalNet: toLots(row[18]),
    });
  }

  const date = formatGregorian8(body.date) || formatGregorian8(requested);
  if (!date || rows.size === 0) return null;
  return { date, rows };
}

/**
 * 取得最新一個交易日的 T86 資料（回推 fallback）。
 *
 * @returns 最新可得資料；全部失敗時為 null。
 */
async function fetchLatestT86(): Promise<T86Day | null> {
  for (let offset = 0; offset < T86_FALLBACK_DAYS; offset += 1) {
    const day = await fetchT86ByOffset(offset);
    if (day) return day;
  }
  return null;
}

/** 上櫃三大法人欄位種類。 */
type Tpex3iField = 'foreign' | 'trust' | 'dealer' | 'total';

/**
 * 由上櫃三大法人單列取出指定法人別的「買賣超」股數。
 *
 * 因原始鍵名冗長且可能含前後空白，採關鍵字比對：
 * - foreign：trim 後以 'Foreign Investors include' 開頭且以 '-Difference' 結尾（不含外資自營商）
 * - trust：含 'TrustCompanies-Difference'
 * - dealer：trim 後等於 'Dealers-Difference'
 * - total：trim 後等於 'TotalDifference'
 *
 * @param row 原始單列。
 * @param field 法人別。
 * @returns 買賣超股數字串；找不到時為 undefined。
 */
function pickTpex3iNet(row: Tpex3iRow, field: Tpex3iField): string | undefined {
  for (const rawKey of Object.keys(row)) {
    const key = rawKey.trim();
    if (
      field === 'foreign' &&
      key.startsWith('Foreign Investors include') &&
      key.endsWith('-Difference')
    ) {
      return row[rawKey];
    }
    if (field === 'trust' && key.includes('TrustCompanies-Difference')) {
      return row[rawKey];
    }
    if (field === 'dealer' && key === 'Dealers-Difference') {
      return row[rawKey];
    }
    if (field === 'total' && key === 'TotalDifference') {
      return row[rawKey];
    }
  }
  return undefined;
}

/**
 * 由上櫃三大法人原始資料建立代號 → 買賣超（張）對照表。
 *
 * @param raw 原始列陣列。
 * @returns 代號 → 三大法人買賣超（張）。
 */
function buildTpex3iMap(raw: Tpex3iRow[]): Map<string, T86NetRow> {
  const map = new Map<string, T86NetRow>();
  for (const row of raw) {
    const symbol = String(row.SecuritiesCompanyCode ?? '').trim();
    if (!symbol) continue;
    map.set(symbol, {
      foreignNet: toLots(pickTpex3iNet(row, 'foreign')),
      trustNet: toLots(pickTpex3iNet(row, 'trust')),
      dealerNet: toLots(pickTpex3iNet(row, 'dealer')),
      totalNet: toLots(pickTpex3iNet(row, 'total')),
    });
  }
  return map;
}

/**
 * 取得最近 N 個交易日的 T86 買賣超歷史（僅 sort=streak 時呼叫）。
 *
 * 以並行（每批 STREAK_FETCH_CONCURRENCY 個）抓取並以回傳日期去重，
 * 直到湊滿 STREAK_LOOKBACK_DAYS 個交易日或達回推上限。
 *
 * @returns 由新到舊的每日 T86 對照表（最多 10 筆）。
 */
async function fetchStreakHistory(): Promise<Map<string, T86NetRow>[]> {
  const seen = new Set<string>();
  const days: T86Day[] = [];

  for (
    let start = 0;
    start < STREAK_SCAN_CALENDAR_DAYS && days.length < STREAK_LOOKBACK_DAYS;
    start += STREAK_FETCH_CONCURRENCY
  ) {
    const offsets: number[] = [];
    for (let k = start; k < start + STREAK_FETCH_CONCURRENCY && k < STREAK_SCAN_CALENDAR_DAYS; k += 1) {
      offsets.push(k);
    }
    const batch = await Promise.all(offsets.map((offset) => fetchT86ByOffset(offset)));
    for (const day of batch) {
      if (!day || seen.has(day.date)) continue;
      seen.add(day.date);
      days.push(day);
    }
    days.sort((a, b) => b.date.localeCompare(a.date));
  }

  return days.slice(0, STREAK_LOOKBACK_DAYS).map((day) => day.rows);
}

/**
 * 計算某代號的連續買超天數（由最新一日往前，遇到非買超即中斷）。
 *
 * 若該代號在整段歷史中完全查無（例如上櫃個股無 T86 歷史），回傳 null（未入庫），
 * 避免誤導性地顯示為「連續 0 天」。
 *
 * @param history 由新到舊的每日 T86 對照表。
 * @param symbol 證券代號。
 * @returns 連續買超天數（0~10）；歷史中查無此代號時為 null。
 */
function computeStreakDays(history: Map<string, T86NetRow>[], symbol: string): number | null {
  let seen = false;
  let streak = 0;
  for (const day of history) {
    const entry = day.get(symbol);
    if (!entry) continue; // 該日無此代號資料，往更早的交易日續找。
    seen = true;
    if (entry.totalNet <= 0) break;
    streak += 1;
  }
  return seen ? streak : null;
}

/**
 * 判斷代號是否為「可交易的真實證券」（股票 / ETF / 特別股），用以過濾權證與 ETN。
 *
 * 規則：4 碼數字開頭為 1-9（可帶 1 個英文字尾，如特別股 1101B）或 00 開頭（ETF / 債券 ETF）。
 * 上櫃端點含約 10,500 檔權證（7xxxxx）與 ETN（02xxxx），必須排除。
 *
 * @param code 證券代號。
 * @returns 應納入雷達時為 true。
 */
function isRealSecurity(code: string): boolean {
  return /^[1-9]\d{3}[A-Z]?$/.test(code) || code.startsWith('00');
}

/**
 * 由 TWSE STOCK_DAY_ALL 建立價量資料。
 *
 * @param raw 原始列陣列。
 * @returns 價量資料列。
 */
function buildTwseRows(raw: TwseStockRow[]): PriceRow[] {
  const out: PriceRow[] = [];
  for (const row of raw) {
    const symbol = String(row.Code ?? '').trim();
    if (!symbol || !isRealSecurity(symbol)) continue;
    const price = parseNum(row.ClosingPrice);
    if (!(price > 0)) continue;
    out.push({
      symbol,
      name: String(row.Name ?? symbol).trim() || symbol,
      market: symbol.startsWith('00') ? 'ETF' : '上市',
      price,
      // STOCK_DAY_ALL 的 Change 已自帶正負號（例：'-0.7000'）。
      change: parseNum(row.Change),
      volumeLots: toLots(row.TradeVolume),
    });
  }
  return out;
}

/**
 * 由上櫃每日收盤行情建立價量資料。
 *
 * @param raw 原始列陣列。
 * @returns 價量資料列（法人欄位一律未入庫）。
 */
function buildTpexRows(raw: TpexRow[]): PriceRow[] {
  const out: PriceRow[] = [];
  for (const row of raw) {
    const symbol = String(row.SecuritiesCompanyCode ?? '').trim();
    if (!symbol || !isRealSecurity(symbol)) continue;
    const price = parseNum(row.Close);
    if (!(price > 0)) continue;
    out.push({
      symbol,
      name: String(row.CompanyName ?? symbol).trim() || symbol,
      market: symbol.startsWith('00') ? 'ETF' : '上櫃',
      price,
      // 上櫃 Change 形如 '+0.22' / '-1.10'，parseFloat 可直接處理正負號。
      change: parseNum(row.Change),
      volumeLots: toLots(row.TradingShares),
    });
  }
  return out;
}

/**
 * 依排序模式排序（null 一律排在最後）。
 *
 * @param rows 待排序資料。
 * @param sort 排序模式。
 * @returns 排序後的新陣列。
 */
function sortRows(rows: RadarRow[], sort: RadarSort): RadarRow[] {
  const copy = [...rows];
  const descNullLast = (a: number | null, b: number | null): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  };
  /** 成交金額（元）＝ 成交張數 × 1000 × 收盤價；作為同指標值時的次要排序鍵。 */
  const turnover = (row: RadarRow): number => row.volumeLots * 1000 * row.price;

  if (sort === 'concentration') {
    copy.sort((a, b) => {
      const byMetric = descNullLast(a.concentration, b.concentration);
      if (byMetric !== 0) return byMetric;
      return turnover(b) - turnover(a);
    });
    return copy;
  }
  if (sort === 'volume') {
    copy.sort((a, b) => {
      const byMetric = descNullLast(a.volumeAnomaly, b.volumeAnomaly);
      if (byMetric !== 0) return byMetric;
      return turnover(b) - turnover(a);
    });
    return copy;
  }
  if (sort === 'streak') {
    copy.sort((a, b) => {
      const byStreak = descNullLast(a.streakDays, b.streakDays);
      if (byStreak !== 0) return byStreak;
      return descNullLast(a.totalNet, b.totalNet);
    });
    return copy;
  }

  // sync：僅列三大法人同步買超者，再依合計買超張數遞減。
  const synced = copy.filter((row) => row.syncBuy);
  synced.sort((a, b) => descNullLast(a.totalNet, b.totalNet));
  return synced;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sortParam = searchParams.get('sort') ?? '';
  const sort: RadarSort = (VALID_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as RadarSort)
    : 'concentration';

  try {
    // 1. 平行抓取上市 / 上櫃價量與三大法人；連續買超模式才額外抓 10 日 T86 歷史。
    const [twseRes, tpexRes, t86, tpex3iRes, streakHistory] = await Promise.all([
      fetchJson<TwseStockRow[]>(TWSE_STOCK_DAY_ALL),
      fetchJson<TpexRow[]>(TPEX_MAINBOARD),
      fetchLatestT86(),
      fetchJson<Tpex3iRow[]>(TPEX_3INSTI),
      sort === 'streak' ? fetchStreakHistory() : Promise.resolve<Map<string, T86NetRow>[] | null>(null),
    ]);

    const twseRaw = twseRes.kind === 'ok' && Array.isArray(twseRes.data) ? twseRes.data : null;
    const tpexRaw = tpexRes.kind === 'ok' && Array.isArray(tpexRes.data) ? tpexRes.data : null;
    const tpex3iRaw = tpex3iRes.kind === 'ok' && Array.isArray(tpex3iRes.data) ? tpex3iRes.data : null;
    const tpex3iMap = tpex3iRaw ? buildTpex3iMap(tpex3iRaw) : null;

    // 價量為本頁核心；兩個來源都拿不到才視為上游失敗。
    if (!twseRaw && !tpexRaw) {
      const timedOut = twseRes.kind === 'timeout' || tpexRes.kind === 'timeout';
      return NextResponse.json(
        { error: timedOut ? 'radar_timeout' : 'radar_upstream_error' },
        { status: timedOut ? 504 : 502 },
      );
    }

    const twseDateRaw = twseRaw && twseRaw.length > 0 ? String(twseRaw[0].Date ?? '') : '';
    const twseRows = twseRaw ? buildTwseRows(twseRaw) : [];
    const tpexRows = tpexRaw ? buildTpexRows(tpexRaw) : [];

    // 上市優先，上櫃補齊（代號不重複）。
    const priceMap = new Map<string, PriceRow>();
    for (const row of twseRows) {
      if (!priceMap.has(row.symbol)) priceMap.set(row.symbol, row);
    }
    for (const row of tpexRows) {
      if (!priceMap.has(row.symbol)) priceMap.set(row.symbol, row);
    }

    // 2. 組裝 RadarRow。
    const rows: RadarRow[] = [];
    for (const price of priceMap.values()) {
      // 流動性門檻：成交金額（元）＝ 成交張數 × 1000 × 收盤價；過低者排除，避免比率型指標失真。
      if (price.volumeLots * 1000 * price.price < MIN_TURNOVER) continue;

      // 上市優先取 T86；上櫃取 TPEx 三大法人（兩者代號空間幾乎不重疊，重疊時以 T86 為準）。
      const inst =
        (t86 ? t86.rows.get(price.symbol) : undefined) ??
        (tpex3iMap ? tpex3iMap.get(price.symbol) : undefined) ??
        null;
      const foreignNet = inst ? inst.foreignNet : null;
      const trustNet = inst ? inst.trustNet : null;
      const dealerNet = inst ? inst.dealerNet : null;
      const totalNet = inst ? inst.totalNet : null;

      // 前一日收盤 = 收盤價 - 漲跌；為 0 時無法計算百分比，退化為 0。
      const prevClose = price.price - price.change;
      const changePercent = prevClose > 0 ? (price.change / prevClose) * 100 : 0;

      const netAmount =
        totalNet !== null && price.price > 0 ? totalNet * 1000 * price.price : null;
      const concentration =
        totalNet !== null && price.volumeLots > 0
          ? Math.min(1, Math.abs(totalNet) / price.volumeLots)
          : null;
      const volumeAnomaly =
        totalNet !== null && price.volumeLots > 0
          ? (totalNet / price.volumeLots) * 100
          : null;
      const streakDays = streakHistory ? computeStreakDays(streakHistory, price.symbol) : null;
      const syncBuy =
        foreignNet !== null &&
        trustNet !== null &&
        dealerNet !== null &&
        foreignNet > 0 &&
        trustNet > 0 &&
        dealerNet > 0;

      rows.push({
        symbol: price.symbol,
        name: price.name,
        market: price.market,
        price: price.price,
        change: price.change,
        changePercent,
        volumeLots: price.volumeLots,
        foreignNet,
        trustNet,
        dealerNet,
        totalNet,
        netAmount,
        concentration,
        streakDays,
        syncBuy,
        volumeAnomaly,
      });
    }

    const sorted = sortRows(rows, sort);

    // 交易日期：優先用 T86（已正規化 'YYYY-MM-DD'），其次上市行情日期，再其次上櫃三大法人日期，最後退回今日。
    const tpex3iDateRaw = tpex3iRaw && tpex3iRaw.length > 0 ? String(tpex3iRaw[0].Date ?? '') : '';
    const tradeDate =
      (t86 ? t86.date : '') ||
      formatRoc7(twseDateRaw) ||
      formatRoc7(tpex3iDateRaw) ||
      todayString();

    const sources: string[] = [];
    if (twseRaw) sources.push('twse-stock-day-all');
    if (tpexRaw) sources.push('tpex-mainboard');
    sources.push(t86 ? 'twse-t86' : 'twse-t86-unavailable');
    sources.push(tpex3iRaw ? 'tpex-3insti' : 'tpex-3insti-unavailable');

    return NextResponse.json(
      {
        rows: sorted,
        fetchedAt: new Date().toISOString(),
        tradeDate,
        source: sources.join('+'),
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'radar_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'radar_upstream_error' }, { status: 502 });
  }
}
