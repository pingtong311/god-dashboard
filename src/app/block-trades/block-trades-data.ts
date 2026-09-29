/**
 * 鉅額交易（Block Trades）資料層 — 自產資料，非抄實站快照
 * ============================================================================
 * 兩個上游（皆為免費官方 API、免金鑰）：
 *
 * 1) 證交所（上市）「鉅額交易日成交資訊」BFIAUU
 *      https://www.twse.com.tw/rwd/zh/block/BFIAUU?response=json&date=YYYYMMDD
 *      回 { stat:'OK', date:'20260924', title, fields, data:[[...]], selectType }
 *      data 每列 = [證券代號, 證券名稱, 交易別, 成交價, 成交股數, 成交金額]
 *
 * 2) 櫃買中心（上櫃）「上櫃鉅額交易日成交資訊」openapi
 *      https://www.tpex.org.tw/openapi/v1/tpex_daily_qutoes_block
 *      （資料集名稱是 qutoes，非 quotes，為 TPEX 官方拼字）
 *      回陣列 [{ Date:'1150924', TransactionType, SettlementPeriod, Code:'5274',
 *               Name:'信驊', TradePrice, NumberOfSharesTraded, TradeValue:'20485000',
 *               TradingTime }, ...]
 *      ⚠ 此端點 **swagger 無 parameters → 不支援日期參數**，一律回「最近一個有
 *        鉅額交易的交易日」。（規格書在 https://www.tpex.org.tw/openapi/swagger.json，
 *        注意不是 /openapi/v1/swagger.json。）
 *
 * 關鍵處理：
 * 1. 同一檔股票當日可能有多筆（不同交易別／成交價），需**按證券代號彙總**：
 *    筆數 n ＝ 該代號列數；money_yi ＝ 各列成交金額（元）加總 ÷ 1e8，四捨五入 2 位。
 * 2. TWSE BFIAUU 最後一列為「總計」彙總列（證券代號＝總計、名稱為空），**必須剔除**，
 *    否則會被當成一檔股票、金額也會翻倍。
 * 3. TWSE 非交易日或當日尚未公布時 data 為空陣列，需回推前一個有資料的交易日
 *    （LOOKBACK_DAYS = 10，照抄 /api/skynet/t86 的回推模式）。
 * 4. TPEX 欄位 Code/Name 會右補空白 → 一律 trim；Date 為民國年 1150924，西元＝民國+1911。
 * 5. 兩市（上市/上櫃）標的互斥，合併＝聯集後再依金額降冪排序。
 *    實站 block-trades 即為「TWSE 上市 + TPEX 上櫃」合併（實測 2026-09-24 = 24 檔）。
 *
 * 日期對齊原則：以 TWSE 日期為準。TPEX 端點無日期參數，若其回傳日期與 TWSE 不同，
 * **不硬湊**，僅在 gaps 誠實標註該批未併入。
 *
 * 資料誠實原則：上游沒給的代號就不會出現，絕不以 0 或隨機值補齊；缺漏一律記在 gaps。
 *
 * ── TPEX 端點調查紀錄（2026-09-28 實測，供後續接手，別重走冤枉路）─────────────
 *   方法論：TPEX 新站 SPA 的 API 樣板是 `/www/{LANG}/{ACTION}`（LANG=zh-tw）；
 *   要挖某頁呼叫哪個 action，抓該頁 HTML 找 inline 的
 *   `tables.init({action:"..."})`。例：block-trading/day.html → action "blockTrade/dailyStat"。
 *   但——**鉅額交易的「個股清單」不在 SPA，而在 openapi 的 tpex_daily_qutoes_block**。
 *   ✅ 可用（本次採用）：/openapi/v1/tpex_daily_qutoes_block（個股逐筆，含代號/名稱/金額）
 *   ⚠️ /www/zh-tw/blockTrade/dailyStat 只有「全市場分類彙總」，**無證券代號**，不可用於個股清單。
 *   ⚠️ hist.tpex.org.tw/.../DAILY_TRADE_INFOR/Huge_<民國YYYMMDD>.html 為個股鉅額靜態頁，
 *      但只封存遠古日期（如 2006-12），近年日期一律 302 → error.htm，不可用。
 *   ❌ 已試但 302：/www/zh-tw/blockTrade/*（多個猜名）、/www/zh-tw/afterTrading/block*、
 *      /openapi/v1/tpex_block_trade（名字錯，正解是 tpex_daily_qutoes_block）。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 證交所（上市）鉅額交易 rwd 端點基底（勿加尾斜線）。 */
const TWSE_BLOCK_BASE = 'https://www.twse.com.tw/rwd/zh/block/BFIAUU';
/** 櫃買中心（上櫃）鉅額交易日成交資訊 openapi 端點（無日期參數）。 */
const TPEX_BLOCK_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_daily_qutoes_block';
/** 上游 fetch 逾時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 未指定日期時，往回尋找最近有資料交易日的最大天數。 */
const LOOKBACK_DAYS = 10;

/** 單一鉅額交易統計列（對齊實站 /api/p1/block-trades 的 items 元素）。 */
export interface BlockTradeItem {
  /** 證券代號 */
  stock_id: string;
  /** 顯示標籤（「6669 緯穎」） */
  label: string;
  /** 當日成交筆數 */
  n: number;
  /** 成交金額（億元，四捨五入至小數 2 位） */
  money_yi: number;
}

/** 鉅額交易整頁資料（對齊實站 /api/p1/block-trades 的 body）。 */
export interface BlockTradeData {
  /** 是否有資料（上游取得且彙總成功為 true） */
  available: boolean;
  /** 資料日（YYYY-MM-DD） */
  date: string;
  /** 資料口徑（固定「盤後」） */
  data_scope: string;
  /** 下次更新說明 */
  next_update: string;
  /** 口徑提醒（逐字對齊實站） */
  note: string;
  /** 依成交金額由大到小排序的統計列 */
  items: BlockTradeItem[];
  /** 已知資料缺口（誠實揭露；無缺口時為空陣列） */
  gaps: string[];
}

/** 上游來源標記（同時記錄上市與上櫃兩個來源）。 */
export interface BlockTradeUpstream {
  /** 證交所（上市）BFIAUU 實際命中的 URL（含 date 參數） */
  twse: string;
  /** 櫃買中心（上櫃）openapi URL；未取得時為 null */
  tpex: string | null;
}

/** 資料層回傳：整頁資料 + 上游來源標記。 */
export interface BlockTradeResult {
  data: BlockTradeData;
  upstream: BlockTradeUpstream;
}

/** 櫃買中心（上櫃）openapi 回傳列形狀（只取需要的欄位）。 */
export interface TpexBlockRow {
  Date?: string;
  TransactionType?: string;
  SettlementPeriod?: string;
  Code?: string;
  Name?: string;
  TradePrice?: string;
  NumberOfSharesTraded?: string;
  TradeValue?: string;
  TradingTime?: string;
}

/** 固定口徑文字（逐字對齊實站 /api/p1/block-trades 的 body）。 */
const DATA_SCOPE = '盤後';
const NEXT_UPDATE = '下一交易日 23:08';
const NOTE = '盤後鉅額成交金額加總，不是進出場。';

/** 產生證交所 rwd 端點要的西元日期（YYYYMMDD）。 */
export function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 把「20260924」轉成「2026-09-24」；格式不符則原樣回傳。 */
export function formatDisplayDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 把民國年緊湊日期「1150924」轉成西元「2026-09-24」；格式不符回 null。 */
export function parseRocCompactDate(raw: string): string | null {
  const m = /^(\d{3})(\d{2})(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  return `${year}-${m[2]}-${m[3]}`;
}

/**
 * 金額四捨五入至小數 2 位，**刻意對齊參考站口徑**（不是「數學上最正確」）。
 *
 * ⚠ 不要改成 Math.round —— 存證實例（2026-09-24 的 2376 技嘉）：
 *     原始金額 = 109,500,000 元 = 1.095 億（剛好踩在中點值上）
 *     Math.round(1.095 * 100) / 100 = 1.1      ← 數學上「正確」，但與參考站不符
 *     Number((1.095).toFixed(2))    = 1.09     ← 參考站實際顯示值，本函式採用
 *   原因：1.095 在 float64 無法精確表示，實際存成 1.09499999999999997335…，
 *   故 toFixed(2) 自然截到 1.09。這是浮點表示 + toFixed 語意的結果，非參考站算錯。
 *   對齊的目的不是「誰的數學對」，而是「行為一致」。
 *
 *   ⚠ 此處刻意使用 toFixed 對齊參考站口徑，**不要改成 Math.round**
 *     （數學上更正確，但會與參考站不一致）。
 *   實測 2026-09-24 全部 24 檔以此規則逐值吻合。
 */
function round2(n: number): number {
  return Number(n.toFixed(2));
}

/** 解析含千分位逗號的金額字串 → 元（無法解析回 0）。 */
export function parseAmountYuan(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** 彙總用的可變結構（代號 → 名稱 / 累計金額元 / 筆數）。 */
interface CodeAgg {
  name: string;
  amountYuan: number;
  n: number;
}

/** 把 Map<代號, CodeAgg> 轉成依成交金額（元）降冪排序的 items。 */
function toSortedItems(byCode: Map<string, CodeAgg>): BlockTradeItem[] {
  const entries = Array.from(byCode.entries()).map(([code, value]) => ({
    stock_id: code,
    label: `${code} ${value.name}`.trim(),
    n: value.n,
    money_yi: round2(value.amountYuan / 1e8),
    // 排序用的原始金額（元）；僅內部使用，輸出前移除。
    sortKeyYuan: value.amountYuan,
  }));
  entries.sort((a, b) => b.sortKeyYuan - a.sortKeyYuan);
  return entries.map((entry) => ({
    stock_id: entry.stock_id,
    label: entry.label,
    n: entry.n,
    money_yi: entry.money_yi,
  }));
}

/**
 * 依證券代號彙總「證交所（上市）BFIAUU 原始列」。
 * - 剔除「總計」彙總列與欄位不足的畸形列。
 * - 以「元」為單位加總後再換算億元，避免逐列四捨五入造成的誤差累積。
 * - 依成交金額（元）由大到小排序。
 */
export function aggregateBlockTrades(rows: string[][]): BlockTradeItem[] {
  const byCode = new Map<string, CodeAgg>();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const code = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();
    // 「總計」彙總列的證券代號為「總計」、名稱為空 → 剔除。
    if (!code || code === '總計') continue;

    const current = byCode.get(code) ?? { name, amountYuan: 0, n: 0 };
    current.name = name || current.name;
    current.amountYuan += parseAmountYuan(row[5]);
    current.n += 1;
    byCode.set(code, current);
  }

  return toSortedItems(byCode);
}

/**
 * 依證券代號彙總「櫃買中心（上櫃）openapi 列」。
 * - Code/Name 右補空白 → trim。
 * - 以 TradeValue（元）加總；無法解析視為 0。
 */
export function aggregateTpexBlockTrades(rows: TpexBlockRow[]): BlockTradeItem[] {
  const byCode = new Map<string, CodeAgg>();

  for (const row of rows) {
    const code = String(row?.Code ?? '').trim();
    const name = String(row?.Name ?? '').trim();
    if (!code) continue;

    const current = byCode.get(code) ?? { name, amountYuan: 0, n: 0 };
    current.name = name || current.name;
    current.amountYuan += parseAmountYuan(row?.TradeValue);
    current.n += 1;
    byCode.set(code, current);
  }

  return toSortedItems(byCode);
}

/**
 * 合併多來源 items（上市 + 上櫃）：
 * 兩市標的互斥，正常情況即為聯集；若同代號意外重複則筆數相加、金額相加。
 * 最後依 money_yi 降冪排序。
 */
export function mergeBlockTradeItems(...lists: BlockTradeItem[][]): BlockTradeItem[] {
  const byCode = new Map<string, BlockTradeItem>();
  for (const list of lists) {
    for (const item of list) {
      const current = byCode.get(item.stock_id);
      if (current) {
        current.n += item.n;
        current.money_yi = round2(current.money_yi + item.money_yi);
      } else {
        byCode.set(item.stock_id, { ...item });
      }
    }
  }
  return Array.from(byCode.values()).sort((a, b) => b.money_yi - a.money_yi);
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

/** 證交所 BFIAUU 回應形狀（只取需要的欄位）。 */
interface TwseBlockRaw {
  stat?: string;
  date?: string;
  data?: string[][];
}

/** 證交所（上市）命中結果。 */
interface TwseFound {
  raw: TwseBlockRaw;
  ymd: string;
  url: string;
}

/**
 * 取得最近一個有資料交易日的「證交所（上市）」鉅額交易。
 * 從今天往回最多 LOOKBACK_DAYS 天，逐日嘗試；單日失敗或空資料就繼續往前。
 * 全部失敗回 null（由呼叫端轉成誠實的錯誤狀態，不回假資料）。
 */
async function fetchLatestTwseBlockTrades(): Promise<TwseFound | null> {
  const now = new Date();
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const ymd = formatTwseDate(d);
    const url = `${TWSE_BLOCK_BASE}?response=json&date=${ymd}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const raw = (await res.json()) as TwseBlockRaw;
      if (raw?.stat !== 'OK' || !Array.isArray(raw.data) || raw.data.length === 0) continue;
      // 只有「總計」列而無任何個股時，視為無資料，繼續回推。
      if (aggregateBlockTrades(raw.data).length === 0) continue;
      return { raw, ymd, url };
    } catch {
      // 單日失敗就繼續往回找，不中斷整體流程。
      continue;
    }
  }
  return null;
}

/**
 * 取得「櫃買中心（上櫃）」鉅額交易（openapi，無日期參數 → 回最近一個有資料交易日）。
 * @returns 成功回 { rows, date }；失敗或無資料回 null。
 */
async function fetchTpexBlockTrades(): Promise<{ rows: TpexBlockRow[]; date: string | null } | null> {
  try {
    const res = await fetchWithTimeout(TPEX_BLOCK_URL);
    if (!res.ok) return null;
    const rows = (await res.json()) as TpexBlockRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // 同批應為同一交易日，取第一筆的 Date（民國年）轉西元。
    const date = parseRocCompactDate(String(rows[0]?.Date ?? ''));
    return { rows, date };
  } catch {
    return null;
  }
}

/**
 * 對外主入口：取得鉅額交易整頁資料（證交所上市 + 櫃買上櫃合併）。
 * 以 TWSE 日期為準；TPEX 若日期不同則不併入，僅記 gaps。
 * @returns 成功回 { data, upstream }；證交所上游全數失敗回 null。
 */
export async function getBlockTrades(): Promise<BlockTradeResult | null> {
  const found = await fetchLatestTwseBlockTrades();
  if (!found) return null;

  const twseDate = formatDisplayDate(String(found.raw.date || found.ymd));
  const twseItems = aggregateBlockTrades(found.raw.data ?? []);

  // 併入櫃買中心（上櫃）鉅額交易；其端點無日期參數，故須核對資料日。
  const tpex = await fetchTpexBlockTrades();
  const gaps: string[] = [];
  let items = twseItems;
  let tpexUrl: string | null = null;

  if (!tpex) {
    gaps.push('TPEX 上櫃鉅額交易暫時無法取得，本清單僅含上市（TWSE）部分。');
  } else {
    tpexUrl = TPEX_BLOCK_URL;
    if (tpex.date === twseDate) {
      items = mergeBlockTradeItems(twseItems, aggregateTpexBlockTrades(tpex.rows));
    } else {
      gaps.push(
        `TPEX 上櫃鉅額交易資料日為 ${tpex.date ?? '未知'}，與本頁資料日 ${twseDate} 不同，未併入（不硬湊）。`,
      );
    }
  }

  return {
    data: {
      available: true,
      date: twseDate,
      data_scope: DATA_SCOPE,
      next_update: NEXT_UPDATE,
      note: NOTE,
      items,
      gaps,
    },
    upstream: { twse: found.url, tpex: tpexUrl },
  };
}
