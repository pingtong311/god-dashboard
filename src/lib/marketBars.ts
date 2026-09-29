/**
 * 全市場歷史日 K 共用資料基礎設施（/patterns、/swing 等頁面的共同上游）
 * ============================================================================
 * 目的：
 *   /patterns（7 種技術型態辨識）與 /swing（16 個條件篩選）都需要「全市場的歷史
 *   日 K 序列」。本檔把「抓取 → 壓縮 → 存 KV → 組裝序列」抽成單一共用層，
 *   避免每個頁面各自打上游、各自爆掉 Cloudflare Workers 的 subrequest 上限。
 *
 * 架構約束（決定整個設計）：
 *   Cloudflare Workers 免費方案每個 request 最多 50 個 subrequest。
 *   抓「一天全市場」需 2 次上游 fetch（TWSE + TPEX）+ 1 次 KV put = 3 subrequests，
 *   故單一 request 不可能抓 120 天。設計因此拆成三層：
 *
 *   第一層（寫入）：抓「某一天」TWSE + TPEX 全市場 OHLC → 壓縮 → 存 KV。
 *     KV key：mkt:bars:<YYYY-MM-DD>；值：緊湊格式 { date, twse, tpex, counts, ... }。
 *   第二層（回填）：route 接受單日或區間；區間硬限制見 MAX_INGEST_* 常數（呼叫端自行迴圈）。
 *   第三層（讀取）：route 從 KV 組裝 N 天序列，純 KV 讀取、不打上游。
 *
 * 資料源（皆已 curl 實測，2026-09-24）：
 *   TWSE：MI_INDEX?date=YYYYMMDD&type=ALL&response=json
 *     → { stat, date, tables:[...] }，取 title 含「每日收盤行情」那張表（實測 35,605 列，
 *       其中 17,112 列有有效 OHLC、18,493 列為當日無成交（成交股數 0、價位為 '--'））。
 *     ⚠ 另一經典端點 STOCK_DAY_ALL?response=json 實測回「CSV 純文字」而非 JSON
 *       （內容開頭為 "日期,證券代號,證券..."），無法可靠解析，故不採用；本層一律用 MI_INDEX。
 *   TPEX：otc?date=YYYY/MM/DD&type=EW&response=json
 *     → { stat:'ok', date, tables:[{ title, fields, data }] }（實測 1,015 列，991 列有效）。
 *     ⚠ TPEX 日期格式帶斜線（YYYY/MM/DD），與 TWSE 的 YYYYMMDD 不同——最易出錯處。
 *
 * 非交易日上游行為（已實測，供「反向實驗」與 null 判斷）：
 *   TWSE：HTTP 200，body 為 { stat:'很抱歉，沒有符合條件的資料!', type:[...] }（無 tables）。
 *   TPEX：HTTP 200，stat:'ok' 但 tables[0].data 為空陣列。
 *   兩者皆非 HTTP 錯誤，故必須靠「內容形狀」判斷「無資料」，不可只看 res.ok。
 *
 * KV 綁定取得方式：一律透過 src/lib/godBridge.ts 的 getKv()（內部用
 *   getCloudflareContext({ async: true })）。⚠ 不可用 globalThis.SKYNET_CACHE
 *   （@opennextjs/cloudflare v1.20.1 在生產環境不掛 globalThis，該寫法恆為 undefined）。
 *
 * 紅漲綠跌：本層只做資料，不涉顏色。
 */

import { getTradingDayStatus } from '@/lib/tradingSessionUtils';
import type { SkynetKv } from '@/lib/godBridge';
import type { Provenance } from '@/lib/provenance';

/** 上游 TWSE「每日收盤行情(全部)」來源（MI_INDEX，type=ALL）。 */
export const TWSE_MI_INDEX_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX';
/** 上游 TPEX「上櫃股票每日收盤行情(不含定價)」來源。 */
export const TPEX_OTC_URL = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/otc';

/** 上游 fetch 超時：8 秒（任務規格）。 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

/** KV key 前綴：全市場日 K 命名空間，避免與 god:、futures_* 等其他 key 混淆。 */
export const MARKET_BARS_KV_PREFIX = 'mkt:bars:';

/** KV TTL：180 天（≈ 126 個交易日；足以覆蓋 /patterns、/swing 的回看視窗）。 */
export const MARKET_BARS_KV_TTL_SECONDS = 180 * 24 * 60 * 60;

/**
 * 單次 ingest 的「日曆天數」硬上限（超過回 400）。
 * 任務規格：每次呼叫最多抓 40 天。
 */
export const MAX_INGEST_DAYS = 40;

/**
 * 單次 ingest 的「實際交易日」硬上限（超過回 400，呼叫端自行分段）。
 *
 * ⚠ 為何比 40 更嚴：每個交易日需 2 次上游 fetch（TWSE + TPEX）+ 1 次 KV put
 *   = 3 個 subrequests；Cloudflare Workers 免費方案每 request 上限 50。
 *   15 × 3 = 45 ≤ 50（保留 5 個餘裕給其他用途）。
 *   若取滿 40 個日曆天（約 28 個交易日），需 28 × 3 = 84 個 subrequests，
 *   遠超免費方案上限，故以本常數為真正的安全防線。
 */
export const MAX_INGEST_TRADING_DAYS = 15;

/** 單次 read 可回看的交易日上限（僅限制日期清單長度）。 */
export const MAX_READ_DAYS = 180;

/**
 * 單次 read 直接回傳「完整全市場序列」的天數上限。
 *
 * ⚠ 記憶體/回應體積考量：實測單日全市場緊湊序列約 0.76 MB（18,103 檔 × ~42 bytes）。
 *   30 天 ≈ 23 MB（僅序列本體），仍在 Workers 128 MB 記憶體與合理回應體積內；
 *   若一次回 120 天（≈ 91 MB）會逼近記憶體上限且回應過大無法下載。
 *   超過此天數時，read 改為只回「日期清單 + 缺漏清單」，或由呼叫端改用 codes= 過濾。
 */
export const MAX_FULL_SERIES_DAYS = 30;

/** 統一 bar 形狀（正規化後）。 */
export type Bar = {
  /** 證券代號（如 '2330'）。 */
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量（張）；上游為「股」，已換算。 */
  volumeLots: number;
};

/**
 * 緊湊 bar：以陣列取代物件，省掉每列重複的 key 名。
 * 順序固定為 [代號, 開, 高, 低, 收, 成交量(張)]。
 */
export type CompactBar = [string, number, number, number, number, number];

/**
 * 來源追蹤欄位（統一格式）。
 *
 * 已抽出為跨頁共用的 @/lib/provenance（含 self-produced / site-mirror /
 * site-unreliable / absent 四種分類與 Coverage）。此處僅 re-export，
 * 以維持既有 import（本檔與 market-bars route）不變；本層的抓取／KV 邏輯不受影響。
 */
export type { Provenance };

/** 存進 KV 的單日全市場資料（緊湊格式）。 */
export type StoredMarketDay = {
  /** 交易日 'YYYY-MM-DD'。 */
  date: string;
  /** 上市（TWSE）緊湊 bars。 */
  twse: CompactBar[];
  /** 上櫃（TPEX）緊湊 bars。 */
  tpex: CompactBar[];
  /** 各自的有效筆數（與陣列長度一致，供快速校驗）。 */
  counts: { twse: number; tpex: number };
  /** 上游原始列數（含當日無成交列），供運維確認抓取完整度。 */
  rawCounts: { twse: number; tpex: number };
  /** 寫入時間（ISO 字串）。 */
  fetchedAt: string;
  provenance: Provenance;
};

/** 單一上游單日抓取結果。 */
export type DayFetchResult = {
  /** 由上游回傳內容解析出的交易日 'YYYY-MM-DD'。 */
  tradeDate: string;
  /** 正規化後的有效 bars（已濾除當日無成交列）。 */
  bars: Bar[];
  /** 上游原始列數（含無成交列）。 */
  rawCount: number;
  /** 實際請求的 URL。 */
  upstream: string;
};

// ---------------------------------------------------------------------------
// 日期工具（一律以 UTC 運算，避免伺服器時區造成跨日漂移）
// ---------------------------------------------------------------------------

/** 以 UTC 午夜建立日期，杜絕本地時區造成的跨日偏移。 */
function utcDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** Date → 'YYYYMMDD'（TWSE 格式）。以 UTC 取值。 */
export function formatTwseDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** Date → 'YYYY/MM/DD'（TPEX 格式，帶斜線）。以 UTC 取值。 */
export function formatTpexDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

/** Date → 'YYYY-MM-DD'（本層統一使用的顯示／KV 格式）。 */
export function formatYmd(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 'YYYYMMDD' 或 'YYYY-MM-DD' → UTC 午夜 Date；格式異常回 null。
 * @param ymd 8 碼純數字或含破折號的日期字串
 */
export function parseYmdToDate(ymd: string): Date | null {
  if (typeof ymd !== 'string') return null;
  const trimmed = ymd.trim();
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dashed) {
    return utcDate(Number(dashed[1]), Number(dashed[2]), Number(dashed[3]));
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (compact) {
    return utcDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }
  return null;
}

/**
 * 解析 TWSE 的日期字串 → 'YYYY-MM-DD'。
 * 支援兩種實測格式：
 *   - '20260924'（response 的 date 欄）
 *   - '115年09月24日'（table.title 的民國年中文格式；西元 = 民國 + 1911）
 * 解析失敗回 null。
 */
export function parseTwseRocDate(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const western = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (western) return `${western[1]}-${western[2]}-${western[3]}`;
  const roc = /^(\d{2,3})年(\d{1,2})月(\d{1,2})日/.exec(trimmed);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    return `${year}-${roc[2].padStart(2, '0')}-${roc[3].padStart(2, '0')}`;
  }
  return null;
}

/**
 * 解析 TPEX 的日期字串 → 'YYYY-MM-DD'。
 * 支援實測格式 '20260924'，並相容民國年（'115/09/24'、'115年09月24日'）。
 * 解析失敗回 null。
 */
export function parseTpexDate(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const western = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (western) return `${western[1]}-${western[2]}-${western[3]}`;
  const dashedWestern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (dashedWestern) {
    return `${dashedWestern[1]}-${dashedWestern[2].padStart(2, '0')}-${dashedWestern[3].padStart(2, '0')}`;
  }
  const roc = /^(\d{2,3})[年/](\d{1,2})[月/](\d{1,2})日?/.exec(trimmed);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    return `${year}-${roc[2].padStart(2, '0')}-${roc[3].padStart(2, '0')}`;
  }
  return null;
}

/**
 * 是否為台股交易日（週一至週五且非休市日）。
 * 複用 tradingSessionUtils 的台北時區判斷與 2026 休市表，避免重造輪子。
 * @param date 任意 Date（建議以 UTC 午夜建立，避免跨日漂移）
 */
export function isTradingDay(date: Date): boolean {
  return getTradingDayStatus(date).isTradingDay;
}

/** 當前台北日期 'YYYY-MM-DD'（read 預設 to 用）。 */
export function todayTaipeiYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * 由 endDate（含）往前取最近 count 個「交易日」（weekday 且非休市），以升冪回傳。
 *
 * ⚠ 回傳順序是「最舊 → 最新」（升冪），此為**刻意**設計、非偶然：
 *   日 K 是時間序列，下游（loadRange 組裝的序列、圖表、patternScan／swingConditions
 *   掃描器）都預期時間軸由舊到新；維持升冪讓呼叫端不必再自行排序。
 *   實作上「由 endDate 往回蒐集、最後 reverse()」，故天然得到升冪。
 *
 *   副作用（操作時須知）：回填工具 backfill-market-bars.mjs 依此陣列順序逐日寫入，
 *   因此是「先補最舊、後補最新」。若回填中途中斷，缺的會是**最近**幾天——而
 *   /patterns、/swing 需要的正是最近的日 K。故中斷後務必重跑補齊（工具冪等，
 *   已存在的 key 會自動跳過）；或改用較小的 --to／視窗，優先補最近 N 天。
 *
 * @param endDate 視窗結束日（UTC 午夜 Date）
 * @param count 需要幾個交易日
 */
export function buildTradingDayWindow(endDate: Date, count: number): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  // 上限保護：最多往前找 count*2 + 30 天，避免休市日過多造成無限迴圈。
  const maxLookback = count * 2 + 30;
  for (let i = 0; i < maxLookback && out.length < count; i += 1) {
    const d = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    if (isTradingDay(d)) out.push(formatYmd(d));
  }
  // 由新到舊蒐集後反轉 → 刻意回傳「最舊 → 最新」升冪（理由與副作用見上方 JSDoc）。
  return out.reverse();
}

/**
 * 列出 fromYmd 至 toYmd（含頭尾）的所有日曆日期 'YYYY-MM-DD'（升冪）。
 * 任一日期格式異常或 from > to 時回空陣列。
 */
export function eachDateInRange(fromYmd: string, toYmd: string): string[] {
  const from = parseYmdToDate(fromYmd);
  const to = parseYmdToDate(toYmd);
  if (!from || !to) return [];
  if (from.getTime() > to.getTime()) return [];
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 24 * 60 * 60 * 1000) {
    out.push(formatYmd(new Date(t)));
  }
  return out;
}

/** 回傳 dates 中「交易日」的數量（供 ingest 的 subrequest 預算判斷）。 */
export function countTradingDays(dates: string[]): number {
  let n = 0;
  for (const ymd of dates) {
    const d = parseYmdToDate(ymd);
    if (d && isTradingDay(d)) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 數值工具
// ---------------------------------------------------------------------------

/**
 * 解析含千分位逗號的數字字串 → number；無效（'--' / 'X' / '' / 非數字）回 null。
 * ⚠ 絕不把無效值當 0，否則會把「當日無成交」誤判為「收盤 0 元」。
 */
export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (s === '' || s === '--' || s === '---' || s === 'X' || s === 'x' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 股 → 張（四捨五入）；非有限值回 0。 */
export function sharesToLots(shares: number): number {
  if (!Number.isFinite(shares)) return 0;
  return Math.round(shares / 1000);
}

// ---------------------------------------------------------------------------
// 正規化（上游列 → 統一 bar）
// ---------------------------------------------------------------------------

/**
 * TWSE MI_INDEX「每日收盤行情(全部)」列 → Bar[]。
 * 欄位索引（實測 16 欄）：
 *   0 證券代號　1 證券名稱　2 成交股數　3 成交筆數　4 成交金額
 *   5 開盤價　6 最高價　7 最低價　8 收盤價　9 漲跌(+/-)　10 漲跌價差 ...
 * 規則：當日無成交列（價位為 '--'）予以濾除（無價即無 K 棒，不可捏造）。
 */
export function normalizeTwseRows(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) return [];
  const out: Bar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 9) continue;
    const code = String(row[0] ?? '').trim();
    if (!code) continue;
    const open = parseNumber(row[5]);
    const high = parseNumber(row[6]);
    const low = parseNumber(row[7]);
    const close = parseNumber(row[8]);
    // 任一根價無效 → 當日無成交，濾除。
    if (open === null || high === null || low === null || close === null) continue;
    const shares = parseNumber(row[2]) ?? 0;
    out.push({ code, open, high, low, close, volumeLots: sharesToLots(shares) });
  }
  return out;
}

/**
 * TPEX otc「上櫃股票每日收盤行情(不含定價)」列 → Bar[]。
 * ⚠ 欄位順序與 TWSE 不同（收盤在開盤之前！），實測 17 欄：
 *   0 代號　1 名稱　2 收盤　3 漲跌　4 開盤　5 最高　6 最低　7 成交股數　8 成交金額　9 成交筆數 ...
 * 規則：當日無成交列予以濾除。
 */
export function normalizeTpexRows(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) return [];
  const out: Bar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const code = String(row[0] ?? '').trim();
    if (!code) continue;
    const close = parseNumber(row[2]);
    const open = parseNumber(row[4]);
    const high = parseNumber(row[5]);
    const low = parseNumber(row[6]);
    if (open === null || high === null || low === null || close === null) continue;
    const shares = parseNumber(row[7]) ?? 0;
    out.push({ code, open, high, low, close, volumeLots: sharesToLots(shares) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 壓縮 / 展開
// ---------------------------------------------------------------------------

/** Bar[] → CompactBar[]（物件轉陣列，省掉重複 key 名）。 */
export function compactBars(bars: Bar[]): CompactBar[] {
  return bars.map((b) => [b.code, b.open, b.high, b.low, b.close, b.volumeLots]);
}

/** CompactBar[] → Bar[]（展開；畸形列予以略過）。 */
export function expandBars(compact: CompactBar[]): Bar[] {
  if (!Array.isArray(compact)) return [];
  const out: Bar[] = [];
  for (const c of compact) {
    if (!Array.isArray(c) || c.length < 6) continue;
    const [code, open, high, low, close, volumeLots] = c;
    out.push({
      code: String(code),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volumeLots: Number(volumeLots),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 上游抓取
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, referer: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        // 證交所／櫃買會檢查 Referer；缺 Referer 時非最新日期可能被限流。
        Referer: referer,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

interface TwseMiIndexResponse {
  stat?: string;
  date?: string;
  tables?: Array<{ title?: string; fields?: string[]; data?: string[][] }>;
}

interface TpexOtcResponse {
  stat?: string;
  date?: string;
  tables?: Array<{ title?: string; fields?: string[]; data?: string[][] }>;
}

/**
 * 抓取「單一交易日」TWSE 全市場 OHLC。
 *
 * 選用端點：MI_INDEX?type=ALL（理由見檔首；STOCK_DAY_ALL 回 CSV 不可用）。
 * 非交易日（或無資料）上游回 { stat:'很抱歉…' }，本函式回 null（絕不回空陣列假裝成功）。
 *
 * @param date 交易日（UTC 午夜 Date）
 * @returns 成功帶 bars；非交易日／上游錯誤回 null
 */
export async function fetchTwseDay(date: Date): Promise<DayFetchResult | null> {
  const url = `${TWSE_MI_INDEX_URL}?date=${formatTwseDate(date)}&type=ALL&response=json`;
  let payload: TwseMiIndexResponse;
  try {
    const res = await fetchWithTimeout(url, 'https://www.twse.com.tw/zh/trading/historical/mi-index.html');
    if (!res.ok) return null;
    payload = (await res.json()) as TwseMiIndexResponse;
  } catch {
    return null;
  }

  // 非交易日：stat 非 'OK'、或沒有 tables。
  if (!payload || payload.stat !== 'OK' || !Array.isArray(payload.tables)) return null;

  const table = payload.tables.find((t) => typeof t?.title === 'string' && t.title.includes('每日收盤行情'));
  if (!table || !Array.isArray(table.data) || table.data.length === 0) return null;

  const bars = normalizeTwseRows(table.data);
  const tradeDate = parseTwseRocDate(table.title ?? '') ?? parseTwseRocDate(payload.date ?? '') ?? formatYmd(date);

  return { tradeDate, bars, rawCount: table.data.length, upstream: url };
}

/**
 * 抓取「單一交易日」TPEX 全市場 OHLC。
 *
 * ⚠ 日期格式為 YYYY/MM/DD（帶斜線），與 TWSE 的 YYYYMMDD 不同。
 * 非交易日上游回 stat:'ok' 但 tables[0].data 為空，本函式回 null。
 *
 * @param date 交易日（UTC 午夜 Date）
 * @returns 成功帶 bars；非交易日／上游錯誤回 null
 */
export async function fetchTpexDay(date: Date): Promise<DayFetchResult | null> {
  const url = `${TPEX_OTC_URL}?date=${formatTpexDate(date)}&type=EW&response=json`;
  let payload: TpexOtcResponse;
  try {
    const res = await fetchWithTimeout(url, 'https://www.tpex.org.tw/zh-tw/mainboard/trading/info/otc.html');
    if (!res.ok) return null;
    payload = (await res.json()) as TpexOtcResponse;
  } catch {
    return null;
  }

  if (!payload || !Array.isArray(payload.tables) || payload.tables.length === 0) return null;
  const table = payload.tables[0];
  if (!table || !Array.isArray(table.data) || table.data.length === 0) return null;

  const bars = normalizeTpexRows(table.data);
  const tradeDate = parseTpexDate(payload.date ?? '') ?? formatYmd(date);

  return { tradeDate, bars, rawCount: table.data.length, upstream: url };
}

// ---------------------------------------------------------------------------
// KV 存取
// ---------------------------------------------------------------------------

/** 產生 `mkt:bars:<YYYY-MM-DD>` 的 KV key。 */
export function marketBarKey(date: string): string {
  return `${MARKET_BARS_KV_PREFIX}${date}`;
}

/**
 * 寫入單日全市場資料至 KV（TTL 180 天）。
 * 失敗時往上拋，由呼叫端回 503（不假裝成功）。
 */
export async function storeDay(kv: SkynetKv, date: string, payload: StoredMarketDay): Promise<void> {
  await kv.put(marketBarKey(date), JSON.stringify(payload), {
    expirationTtl: MARKET_BARS_KV_TTL_SECONDS,
  });
}

/**
 * 讀取單日全市場資料；不存在或格式異常回 null。
 */
export async function loadDay(kv: SkynetKv, date: string): Promise<StoredMarketDay | null> {
  try {
    const raw = await kv.get(marketBarKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMarketDay;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.twse) || !Array.isArray(parsed.tpex)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 組裝多日序列：逐日從 KV 讀取，回傳實際命中的日期與「缺失日期清單」。
 * ⚠ 缺漏日期一律誠實列出，絕不以空資料假裝成功。
 *
 * 逐日循序讀取（非並行）以控制記憶體峰值；呼叫端應先以 MAX_FULL_SERIES_DAYS 節制天數。
 *
 * @param kv KV 綁定
 * @param dates 目標日期清單（'YYYY-MM-DD'）
 * @returns { days: 命中的日期（依輸入順序）, missing: 未命中的日期（依輸入順序） }
 */
export async function loadRange(
  kv: SkynetKv,
  dates: string[],
): Promise<{ days: StoredMarketDay[]; missing: string[] }> {
  const days: StoredMarketDay[] = [];
  const missing: string[] = [];
  for (const date of dates) {
    const day = await loadDay(kv, date);
    if (day) days.push(day);
    else missing.push(date);
  }
  return { days, missing };
}

/** 具備 list 能力的 KV（Cloudflare KV Namespace 的 list 最小介面）。 */
export type SkynetKvWithList = SkynetKv & {
  list?: (options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }) => Promise<{ keys: { name: string }[]; list_complete?: boolean; cursor?: string }>;
};

/**
 * 列出 KV 中已累積的日期（供 status 端點人工確認進度）。
 * 綁定不支援 list 時回 null（呼叫端據此優雅降級）。
 * @param limit 最多回傳幾筆（預設 1000）
 */
export async function listStoredDates(
  kv: SkynetKvWithList,
  limit = 1000,
): Promise<string[] | null> {
  if (typeof kv.list !== 'function') return null;
  const dates: string[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 20; page += 1) {
      const res = await kv.list({ prefix: MARKET_BARS_KV_PREFIX, limit: 1000, cursor });
      for (const key of res.keys) {
        const date = key.name.slice(MARKET_BARS_KV_PREFIX.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
      }
      if (res.list_complete !== false || !res.cursor) break;
      cursor = res.cursor;
      if (dates.length >= limit) break;
    }
  } catch {
    return null;
  }
  dates.sort();
  return dates.slice(0, limit);
}

/** 組合單日 StoredMarketDay（供 ingest 使用）。 */
export function buildStoredDay(
  tradeDate: string,
  twse: Bar[],
  tpex: Bar[],
  rawCounts: { twse: number; tpex: number },
): StoredMarketDay {
  return {
    date: tradeDate,
    twse: compactBars(twse),
    tpex: compactBars(tpex),
    counts: { twse: twse.length, tpex: tpex.length },
    rawCounts,
    fetchedAt: new Date().toISOString(),
    provenance: {
      source: 'self-produced',
      upstream: TWSE_MI_INDEX_URL,
      upstreams: [TWSE_MI_INDEX_URL, TPEX_OTC_URL],
    },
  };
}
