/**
 * 鉅額交易（Block Trades）資料層 — 自產資料，非抄實站快照
 * ============================================================================
 * 上游：證交所「鉅額交易日成交資訊」BFIAUU（免費官方 API、免金鑰）
 *   https://www.twse.com.tw/rwd/zh/block/BFIAUU?response=json&date=YYYYMMDD
 * 回傳：{ stat:'OK', date:'20260924', title, fields, data:[[...]], selectType }
 *   data 每列 = [證券代號, 證券名稱, 交易別, 成交價, 成交股數, 成交金額]
 *
 * 關鍵處理：
 * 1. 同一檔股票當日可能有多筆（不同交易別／成交價），需**按證券代號彙總**：
 *    筆數 n ＝ 該代號列數；money_yi ＝ 各列成交金額（元）加總 ÷ 1e8，四捨五入 2 位。
 * 2. 上游最後一列為「總計」彙總列（證券代號＝總計、名稱為空），**必須剔除**，
 *    否則會被當成一檔股票、金額也會翻倍。
 * 3. 非交易日或當日尚未公布時 data 為空陣列，需回推前一個有資料的交易日
 *    （LOOKBACK_DAYS = 10，照抄 /api/skynet/t86 的回推模式）。
 *
 * 資料範圍說明（誠實揭露，不補值、不捏造）：
 * BFIAUU 涵蓋「單一證券」與「配對交易」等交易別；實測 2026-09-24 有 21 檔
 * （實站同日 24 檔，另 3 檔不在 BFIAUU 中）。本層只陳述上游實際提供者，
 * 上游沒給的代號就不會出現，絕不以 0 或隨機值補齊。
 *
 * 已知缺口（gaps）：實站 block-trades 為「TWSE 上市 + TPEX 上櫃」合併。實測
 * 2026-09-24 實站 24 檔中，5274 信驊、5347 世界、6187 萬潤 為**上櫃（TPEX）**股，
 * 不在 TWSE BFIAUU 內。本層目前僅涵蓋 TWSE 上市部分，上櫃部分未接入 → 於
 * 回傳的 gaps 欄位誠實標註，不以 0 或猜測值補齊。
 *
 * ── TPEX 上櫃鉅額交易端點調查紀錄（2026-09-28 實測，供後續接手）─────────────
 *   ✅ 有找到、但**只有全市場分類彙總、無個股代號**（故不可用於個股清單）：
 *      https://www.tpex.org.tw/www/zh-tw/blockTrade/dailyStat?date=YYYY/MM/DD&response=json
 *      回 { date, tables:[{ title:'鉅額交易日成交量值統計',
 *        fields:[成交日期,類別,成交筆數,成交股數,成交金額(元),占全市場比重%],
 *        data:[[ '1150901','逐筆交易-組合型','0','0','0',... ], ...] }] }
 *      （類別＝逐筆/配對 × 單一型/組合型；**完全沒有證券代號**）
 *   ✅ 有找到、但**只封存遠古日期**的「個股鉅額交易」靜態頁（Big5 編碼）：
 *      https://hist.tpex.org.tw/Hist/STOCK/BLOCK_TRADE/DAILY_TRADE_INFOR/Huge_<民國YYYMMDD>.html
 *      例：Huge_951229.html（2006-12-29）確實有逐筆「資料種類/證券代號/證券名稱/
 *      成交價格/成交股數/成交值(元)/成交時間」；但 2026 年日期（Huge_1150924.html
 *      等）一律 302 → https://www.tpex.org.tw/storage/error.htm，封存已停止更新。
 *   ❌ 已試但 302（路徑不存在）：
 *      /www/zh-tw/blockTrade/{stockStat,detail,list,dailyDetail,stock,dailyStock,
 *        stockDaily,detailStat,info,stockInfo,statistic,dailyStatStock,individualStat,
 *        tradeDetail,huge,HUGE}
 *      /www/zh-tw/afterTrading/{blockTrade,blockTrading,block,bigTrade,blockDeal,blockTrades}
 *      /www/zh-tw/{mainboard/blockTrade,trading/blockTrade,blockTrade/otc}
 *      /openapi/v1/tpex_block_trade
 *   ❌ 新站區塊子頁 /zh-tw/mainboard/trading/block-trading/{stock,detail,list,query,daily}.html → 302
 *   結論：**未找到可用的「TPEX 上櫃個股鉅額交易」公開端點**；上櫃標的缺漏，如實標註。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 證交所鉅額交易 rwd 端點基底（勿加尾斜線）。 */
const TWSE_BLOCK_BASE = 'https://www.twse.com.tw/rwd/zh/block/BFIAUU';
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

/** 資料層回傳：整頁資料 + 實際命中的上游 URL（供 provenance 標記）。 */
export interface BlockTradeResult {
  data: BlockTradeData;
  /** 實際命中的上游 URL（含 date 參數） */
  upstream: string;
}

/** 固定口徑文字（逐字對齊實站 /api/p1/block-trades 的 body）。 */
const DATA_SCOPE = '盤後';
const NEXT_UPDATE = '下一交易日 23:08';
const NOTE = '盤後鉅額成交金額加總，不是進出場。';

/**
 * 已知資料缺口（誠實揭露）。
 * 實站為 TWSE 上市 + TPEX 上櫃合併；上櫃鉅額交易端點未找到（調查紀錄見檔頭註解），
 * 故本清單僅涵蓋 TWSE 上市 BFIAUU，上櫃標的（如 5274/5347/6187）缺漏。
 */
const GAPS: string[] = [
  'TPEX 上櫃個股鉅額交易端點未找到，故上櫃標的缺漏；本清單僅涵蓋證交所（上市）BFIAUU 鉅額交易。',
];

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

/** 四捨五入至小數 2 位（避免浮點尾差）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 解析含千分位逗號的成交金額字串 → 元（無法解析回 0）。 */
export function parseAmountYuan(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * 依證券代號彙總鉅額交易列。
 * - 剔除「總計」彙總列與欄位不足的畸形列。
 * - 以「元」為單位加總後再換算億元，避免逐列四捨五入造成的誤差累積。
 * - 依成交金額（元）由大到小排序；金額相同時維持上游出現順序（穩定排序）。
 */
export function aggregateBlockTrades(rows: string[][]): BlockTradeItem[] {
  const byCode = new Map<string, { name: string; amountYuan: number; n: number }>();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const code = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();
    // 「總計」彙總列的證券代號為「總計」、名稱為空 → 剔除。
    if (!code || code === '總計') continue;

    const amountYuan = parseAmountYuan(row[5]);
    const current = byCode.get(code) ?? { name, amountYuan: 0, n: 0 };
    current.name = name || current.name;
    current.amountYuan += amountYuan;
    current.n += 1;
    byCode.set(code, current);
  }

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

/** 上游 BFIAUU 回應形狀（只取需要的欄位）。 */
interface BlockTradeRaw {
  stat?: string;
  date?: string;
  data?: string[][];
}

/**
 * 取得最近一個有資料交易日的鉅額交易。
 * 從今天往回最多 LOOKBACK_DAYS 天，逐日嘗試；單日失敗或空資料就繼續往前。
 * 全部失敗回 null（由呼叫端轉成誠實的錯誤狀態，不回假資料）。
 */
async function fetchLatestBlockTrades(): Promise<BlockTradeResult | null> {
  const now = new Date();
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const ymd = formatTwseDate(d);
    const url = `${TWSE_BLOCK_BASE}?response=json&date=${ymd}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const raw = (await res.json()) as BlockTradeRaw;
      if (raw?.stat !== 'OK' || !Array.isArray(raw.data) || raw.data.length === 0) continue;

      const items = aggregateBlockTrades(raw.data);
      // 只有「總計」列而無任何個股時，視為無資料，繼續回推。
      if (items.length === 0) continue;

      const date = formatDisplayDate(String(raw.date || ymd));
      return {
        data: {
          available: true,
          date,
          data_scope: DATA_SCOPE,
          next_update: NEXT_UPDATE,
          note: NOTE,
          items,
          gaps: GAPS,
        },
        upstream: url,
      };
    } catch {
      // 單日失敗就繼續往回找，不中斷整體流程。
      continue;
    }
  }
  return null;
}

/**
 * 對外主入口：取得鉅額交易整頁資料。
 * @returns 成功回 { data, upstream }；上游全部失敗回 null。
 */
export async function getBlockTrades(): Promise<BlockTradeResult | null> {
  return fetchLatestBlockTrades();
}
