/**
 * 除權息行事曆（Dividend Calendar）資料層 — 自產資料，非抄實站快照
 * ============================================================================
 * 上游（皆為免費官方 API、免金鑰）：
 * 1. 除權除息預告表 TWT48U
 *      https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json
 *      fields = [除權除息日期, 股票代號, 名稱, 除權息, 無償配股率,
 *                現金增資配股率, 現金增資認購價, 現金股利, 詳細資料, ...]
 *      日期為民國年中文（例：「115年10月08日」）；西元 = 民國 + 1911。
 * 2. 上市個股日收盤價 STOCK_DAY_AVG_ALL（用於自算現金殖利率）
 *      https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL
 *      { Date:'1150924', Code, Name, ClosingPrice, MonthlyAveragePrice }
 * 3. 上市公司基本資料 t187ap03_L（用於產業別；取不到則留空，非必要）
 *      https://openapi.twse.com.tw/v1/opendata/t187ap03_L
 *      { 公司代號, 產業別:'02', ... }
 *
 * 關鍵處理（誠實原則）：
 * - TWT48U 是「預告表」，需**篩選未來 30 天內**（0 ≤ days_left ≤ 30）的項目，
 *   並依除息日、代號排序（對齊實站「即將除權息（30 天內）」）。
 * - 現金殖利率上游沒給 → **自算**：現金股利 ÷ 收盤價 × 100%。
 *   缺收盤價（或現金股利為 0）時殖利率為 null（前端顯示「—」），**絕不填 0**。
 * - 現金股利欄若為非數字（例：ETF「待公告實際收益分配金額」）代表金額未知，
 *   該列**整列剔除**（不確定就不呈現，不以 0 冒充）。
 * - 無償配股率為「每股配股率」，換算為「元」＝ 配股率 × 面額 10 元（對齊實站
 *   「含配股 X 元」註記；實測 1235 興泰 0.05 × 10 = 0.5 元）。
 */

/** 證交所除權除息預告表端點。 */
const TWSE_EXRIGHT_URL = 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json';
/** 證交所上市個股日收盤價端點。 */
const TWSE_AVG_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL';
/** 證交所上市公司基本資料端點（取產業別，非必要）。 */
const TWSE_COMPANY_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
/** 上游 fetch 逾時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 「即將除權息」視窗（天）。 */
const WINDOW_DAYS = 30;
/** 台股普通股面額（元）：用於把無償配股率換算成「元」。 */
const FACE_VALUE = 10;

/** 單一除權息列（對齊實站 /api/dividend-calendar 的 items 元素）。 */
export interface DividendItem {
  /** 股票代號 */
  stock_id: string;
  /** 顯示標籤（「1235 興泰」） */
  label: string;
  /** 產業別名稱（上游取不到時為空字串） */
  industry: string;
  /** 除權息日期（YYYY-MM-DD） */
  ex_date: string;
  /** 距今日天數（0 = 今日除息） */
  days_left: number;
  /** 現金股利（元） */
  cash_dividend: number;
  /** 股票股利（元，＝無償配股率 × 面額 10 元） */
  stock_dividend: number;
  /** 收盤價（元；缺值為 null） */
  close: number | null;
  /** 現金殖利率（%；缺收盤價或無現金股利為 null） */
  cash_yield_pct: number | null;
}

/** 除權息行事曆整頁資料（對齊實站 /api/dividend-calendar 的 body）。 */
export interface DividendData {
  /** 是否有資料（上游取得且整理成功為 true） */
  available: boolean;
  /** 未來 30 天內的除權息列 */
  items: DividendItem[];
  /** 口徑註記（逐字對齊實站） */
  note: string;
}

/** 資料層回傳：整頁資料 + 主要上游 URL（供 provenance 標記）。 */
export interface DividendResult {
  data: DividendData;
  /** 主要上游 URL（除權除息預告表） */
  upstream: string;
}

/** 口徑註記（逐字對齊實站 /api/dividend-calendar 的 body.note）。 */
const NOTE =
  '除息＝發現金、除權＝發股票，除完當天股價會扣掉股利（蒸發）；之後漲回原價叫「填息」，填不回叫「貼息」。殖利率高不代表會填息，要看公司體質。客觀資料、非投資建議。';

/**
 * 證交所產業別代碼 → 名稱（對齊 TWSE 上市公司產業別分類）。
 * 用於填補 t187ap03_L 的「產業別」代碼；查無對應則留空。
 */
const INDUSTRY_CODE_TO_NAME: Record<string, string> = {
  '01': '水泥工業',
  '02': '食品工業',
  '03': '塑膠工業',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '08': '玻璃陶瓷',
  '09': '造紙工業',
  '10': '鋼鐵工業',
  '11': '橡膠工業',
  '12': '汽車工業',
  '14': '建材營造',
  '15': '航運業',
  '16': '觀光餐旅',
  '17': '金融保險',
  '18': '貿易百貨',
  '20': '其他',
  '21': '化學工業',
  '22': '生技醫療',
  '23': '油電燃氣',
  '24': '半導體業',
  '25': '電腦及週邊設備業',
  '26': '光電業',
  '27': '通信網路業',
  '28': '電子零組件業',
  '29': '電子通路業',
  '30': '資訊服務業',
  '31': '其他電子業',
  '32': '文化創意業',
  '33': '農業科技業',
  '34': '電子商務',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '80': '管理股票',
};

/** 四捨五入至小數 2 位（避免浮點尾差）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 解析民國年中文日期 → 西元 ISO 日期（YYYY-MM-DD）。
 * 例：「115年10月08日」→「2026-10-08」。格式不符回 null。
 */
export function parseRocDate(raw: string): string | null {
  const m = /^(\d{2,3})年(\d{1,2})月(\d{1,2})日$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  const month = String(Number(m[2])).padStart(2, '0');
  const day = String(Number(m[3])).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 解析民國年緊湊日期 → 西元 ISO 日期。例：「1150924」→「2026-09-24」；不符回 null。 */
export function parseRocCompactDate(raw: string): string | null {
  const m = /^(\d{3})(\d{2})(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  return `${year}-${m[2]}-${m[3]}`;
}

/** 以日曆日計算 today 到 ymd（YYYY-MM-DD）的天數差（未來為正）。 */
export function daysUntil(today: Date, ymd: string): number {
  const parts = ymd.split('-').map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return Number.NaN;
  const [y, mo, d] = parts;
  const target = Date.UTC(y, mo - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/**
 * 自算現金殖利率（%）。缺收盤價或無現金股利時回 null（前端顯示「—」，不填 0）。
 */
export function computeCashYield(cash: number, close: number | null): number | null {
  if (close === null || !Number.isFinite(close) || close <= 0) return null;
  if (!Number.isFinite(cash) || cash <= 0) return null;
  return round2((cash / close) * 100);
}

/** 把「無償配股率」換算成「股票股利（元）」＝ 配股率 × 面額 10 元；無法解析回 0。 */
export function stockDividendToYuan(rate: unknown): number {
  const n = Number(String(rate ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(n * FACE_VALUE);
}

/** 解析數值欄（去逗號空白）；無法解析回 null（供判斷「待公告」）。 */
function parseNumericOrNull(raw: unknown): number | null {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** 由 STOCK_DAY_AVG_ALL 建立「代號 → 收盤價」對照表（只收 > 0 的價格）。 */
export function buildCloseMap(rows: Array<Record<string, unknown>>): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const code = String(row?.Code ?? '').trim();
    const price = parseNumericOrNull(row?.ClosingPrice);
    if (code && price !== null && price > 0) map.set(code, price);
  }
  return map;
}

/** 由 t187ap03_L 建立「代號 → 產業別名稱」對照表。 */
export function buildIndustryMap(
  rows: Array<Record<string, unknown>>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const code = String(row?.['公司代號'] ?? '').trim();
    if (!code) continue;
    const industry = INDUSTRY_CODE_TO_NAME[String(row?.['產業別'] ?? '').trim()] ?? '';
    map.set(code, industry);
  }
  return map;
}

/**
 * 由 TWT48U 原始列建構未來 30 天內的除權息清單。
 * @param rows          TWT48U 的 data（每列 13 欄）
 * @param closeMap      代號 → 收盤價
 * @param industryMap   代號 → 產業別名稱
 * @param today         基準日（預設今日）
 */
export function buildDividendItems(
  rows: string[][],
  closeMap: Map<string, number>,
  industryMap: Map<string, string>,
  today: Date = new Date(),
): DividendItem[] {
  const items: DividendItem[] = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 8) continue;

    const exDate = parseRocDate(String(row[0] ?? ''));
    if (!exDate) continue;

    const code = String(row[1] ?? '').trim();
    const name = String(row[2] ?? '').trim();
    if (!code) continue;

    const daysLeft = daysUntil(today, exDate);
    if (!Number.isFinite(daysLeft) || daysLeft < 0 || daysLeft > WINDOW_DAYS) continue;

    // 現金股利欄非數字（例：ETF「待公告」）→ 金額未知，整列剔除，不以 0 冒充。
    const cashDividend = parseNumericOrNull(row[7]);
    if (cashDividend === null) continue;

    const stockDividend = stockDividendToYuan(row[4]);
    const close = closeMap.get(code) ?? null;

    items.push({
      stock_id: code,
      label: `${code} ${name}`.trim(),
      industry: industryMap.get(code) ?? '',
      ex_date: exDate,
      days_left: daysLeft,
      cash_dividend: round2(cashDividend),
      stock_dividend: stockDividend,
      close,
      cash_yield_pct: computeCashYield(cashDividend, close),
    });
  }

  // 依除息日（近→遠）、再依代號排序，對齊實站「即將除權息（30 天內）」順序。
  items.sort((a, b) => {
    if (a.ex_date !== b.ex_date) return a.ex_date < b.ex_date ? -1 : 1;
    if (a.stock_id !== b.stock_id) return a.stock_id < b.stock_id ? -1 : 1;
    return 0;
  });

  return items;
}

/** 帶逾時的上游 fetch（逾時即 abort）。 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** TWT48U 回應形狀（只取需要的欄位）。 */
interface ExRightRaw {
  stat?: string;
  data?: string[][];
}

/** 取得 TWT48U 原始列；失敗或無資料回 null。 */
async function fetchExRightRows(): Promise<string[][] | null> {
  try {
    const res = await fetchWithTimeout(TWSE_EXRIGHT_URL);
    if (!res.ok) return null;
    const raw = (await res.json()) as ExRightRaw;
    if (raw?.stat !== 'OK' || !Array.isArray(raw.data)) return null;
    return raw.data;
  } catch {
    return null;
  }
}

/** 取得收盤價對照表；失敗回空表（不阻塞主流程）。 */
async function fetchCloseMap(): Promise<Map<string, number>> {
  try {
    const res = await fetchWithTimeout(TWSE_AVG_URL);
    if (!res.ok) return new Map();
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return Array.isArray(rows) ? buildCloseMap(rows) : new Map();
  } catch {
    return new Map();
  }
}

/** 取得產業別對照表；失敗回空表（不阻塞主流程）。 */
async function fetchIndustryMap(): Promise<Map<string, string>> {
  try {
    const res = await fetchWithTimeout(TWSE_COMPANY_URL);
    if (!res.ok) return new Map();
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return Array.isArray(rows) ? buildIndustryMap(rows) : new Map();
  } catch {
    return new Map();
  }
}

/**
 * 對外主入口：取得未來 30 天內的除權息行事曆。
 * @param today 基準日（預設今日；供測試注入固定日期）
 * @returns 成功回 { data, upstream }；主要上游（TWT48U）失敗回 null。
 */
export async function getDividendCalendar(today: Date = new Date()): Promise<DividendResult | null> {
  const rows = await fetchExRightRows();
  if (!rows) return null;

  // 收盤價與產業別為輔助資料，平行取得；個別失敗不影響主流程。
  const [closeMap, industryMap] = await Promise.all([fetchCloseMap(), fetchIndustryMap()]);

  const items = buildDividendItems(rows, closeMap, industryMap, today);
  return { data: { available: true, items, note: NOTE }, upstream: TWSE_EXRIGHT_URL };
}
