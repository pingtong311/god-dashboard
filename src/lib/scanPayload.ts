/**
 * 全市場掃描結果「組裝層」（離線預算腳本 與 Edge route 共用同一份實作）
 * ============================================================================
 * 為什麼要有這一層（架構背景，務必先讀懂）：
 *   `/api/skynet/pattern-screen` 與 `/api/skynet/swing-hub` 原本在**單次請求內**
 *   讀 KV 裡 70 個交易日的全市場日 K（每日約 2.5MB）、展開約 2,000 檔 × 70 根
 *   ≈ 14 萬根 K 棒，再跑 7 種型態幾何辨識／16 個條件頁籤——數百毫秒量級。
 *   而 Cloudflare Free plan 的 Worker CPU 上限是 **10ms**，實測線上直接
 *   **503 error code: 1102**（超出資源限制）。本機 `npx jest` 全綠，證明不是邏輯錯，
 *   是 Edge 的資源天花板。
 *
 *   業主裁示的解法：**離線預算 + 寫入 KV**。重計算搬到本機腳本（沒有 CPU 限制），
 *   Worker 只讀 KV 的精簡結果。為了讓「本機預算腳本」與「Edge route」產出的
 *   payload **完全一致**（不出現第二份拷貝而漂移），兩邊共用本檔的組裝函式。
 *
 * 職責分界（重要）：
 *   - 本檔：組裝 payload（純資料處理）＋ 抓取上游（僅供離線腳本呼叫）。
 *   - route：只做「讀 KV → parse → 回傳」，**絕不**重算（見各 route 檔首說明）。
 *   - 計算本身沿用既有 lib，本檔不重寫：
 *       src/lib/patternScan.ts（幾何辨識）、src/lib/swingConditions.ts（16 條件）、
 *       src/app/swing/mirror/whale-weekly-2026-09-18（大戶週增減快照）、
 *       src/lib/marketBars.ts（日 K 展開／日期工具）。
 *
 * 資料誠實（業主明令）：
 *   - 缺資料一律「—」或誠實說明，**絕不以 0 代替、不捏造、不用 Math.random**。
 *   - 尚未預算（KV 無值）→ ready:false + reason:'not_precomputed' + 明確文案，
 *     **絕不可回空 patterns／空 tabs 假裝掃過**，也**不可**寫成「載入中」
 *     （那是永久拿不到的狀態，長得像載入中就是誤導）。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import { WHALE_MIRROR_MAP, WHALE_MIRROR_META } from '@/app/swing/mirror/whale-weekly-2026-09-18';
import {
  TPEX_OTC_URL,
  TWSE_MI_INDEX_URL,
  UPSTREAM_TIMEOUT_MS,
  buildTradingDayWindow,
  expandBars,
  parseYmdToDate,
  todayTaipeiYmd,
  type CompactBar,
} from '@/lib/marketBars';
import {
  MA_LONG,
  RS_LOOKBACK,
  SMART_RANGE_LOOKBACK,
  buildCodeSeries,
  computeBothBuy,
  computeBreak20,
  computeFill,
  computeInstitutionalStreak,
  computeMa60,
  computeMarginDrop,
  computePullback,
  computeReclaim,
  computeRevenue,
  computeRs,
  computeSector,
  computeSmart,
  computeWhale,
  parseExRightRows,
  parseMarginRows,
  parseRevenueRows,
  parseT86Rows,
  parseTdccRows,
  type CodeSeriesMap,
  type ConditionContext,
  type ExRightRow,
  type RevenueRow,
  type StockMetaMap,
  type SwingItem,
  type T86Day,
  type WhaleGrade,
} from '@/lib/swingConditions';
import {
  MIN_BARS_FOR_SCAN,
  PATTERN_CRITERIA,
  PATTERN_META,
  PATTERN_ORDER,
  buildPatternItem,
  createSeriesBuilder,
  groupHitsByPattern,
  isScannableCode,
  scanSeriesList,
  type PatternId,
  type PatternItem,
} from '@/lib/patternScan';

// ===========================================================================
// 一、KV key 與共用常數（離線腳本與 route 共用，單一真相來源）
// ===========================================================================

/** pattern-screen 預算結果的 KV key。 */
export const SCAN_KV_KEY_PATTERN_SCREEN = 'scan:pattern-screen';

/** swing-hub 預算結果的 KV key。 */
export const SCAN_KV_KEY_SWING_HUB = 'scan:swing-hub';

/** 型態掃描回看視窗（交易日）：70 天足以涵蓋雙底/頭肩/收斂三角的間距上限。 */
export const SCAN_WINDOW_TRADING_DAYS = 70;

/** 讀 KV 全市場日 K 的交易日天數（MA60 需 60 日，+5 餘裕）。 */
export const SWING_BARS_TRADING_DAYS = MA_LONG + 5;

/** 尚未預算時的共同 reason 值。 */
export const NOT_PRECOMPUTED_REASON = 'not_precomputed';

/**
 * 重新匯出掃描門檻（patternScan.MIN_BARS_FOR_SCAN）。
 * 供離線預算腳本判斷「日 K 是否足夠」時共用同一個數字，避免兩邊漂移。
 */
export { MIN_BARS_FOR_SCAN };

/** 統一的上游來源字串（本站自產，非代理第三方）。 */
const UPSTREAM = `${TWSE_MI_INDEX_URL} + ${TPEX_OTC_URL}`;

/** 統一的來源追蹤欄位（pattern-screen）。 */
const PROVENANCE = { source: 'self-produced' as const, upstream: UPSTREAM };

/** 下次更新文案（不承諾具體時刻，只說下一交易日盤後）。 */
const NEXT_UPDATE = '下一交易日盤後';

/** 實站口徑註記（逐字照抄）。 */
const NOTE = '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。';

/** 已知缺口說明。 */
const GAPS: readonly string[] = [
  'industry（產業別名稱）：TWSE t187ap03_L 僅提供產業「數字代碼」，本站尚無代碼→名稱對照表，故未提供此欄。',
  'stock_name：以 TWSE BWIBBU_ALL 與 TPEX 收盤行情 OpenAPI 盡力補齊；抓不到時名稱留空（label 僅顯示代號），不捏造。',
];

/** 尚未預算時的人讀文案（業主要求：說清楚是「每日盤後離線預算」，不可偽裝成載入中）。 */
export const PATTERN_SCREEN_NOT_READY_MESSAGE =
  '本站採「每日盤後離線預算」：全市場日 K 型態掃描已移至本機預算腳本執行，目前 KV 尚無預算結果，故本頁暫無清單（不是載入中）。請於盤後執行預算腳本寫入 KV。';

/** swing-hub 尚未預算時的人讀文案。 */
export const SWING_HUB_NOT_READY_MESSAGE =
  '本站採「每日盤後離線預算」：16 個波段條件已移至本機預算腳本執行，目前 KV 尚無預算結果，故本頁暫無清單（不是載入中）。請於盤後執行預算腳本寫入 KV。';

/** KV 未綁定時的補充文案。 */
const KV_UNBOUND_SUFFIX = '（目前 KV 尚未綁定，無法讀取預算結果。）';

/** KV 內容損壞時的補充文案。 */
const KV_CORRUPT_SUFFIX = '（已寫入的預算結果無法解析，視為尚未預算，不以空清單冒充。）';

// ===========================================================================
// 二、型別
// ===========================================================================

/** 組裝輸入的單一日 K 形狀（KV `mkt:bars:<date>` 的精簡投影；欄位寬鬆以容忍髒資料）。 */
export type ScanDayInput = {
  /** 交易日 'YYYY-MM-DD'。 */
  date: string;
  /** 上市（TWSE）緊湊 bars。 */
  twse?: unknown;
  /** 上櫃（TPEX）緊湊 bars。 */
  tpex?: unknown;
};

/** 單一型態的 API 區塊（對齊實站 patterns.<id>）。 */
export type PatternScreenPattern = {
  meta: { name: string; desc: string; structure: string };
  items: PatternItem[];
  count: number;
};

/** pattern-screen 回應形狀（ready 與 not-ready 共用，選配欄位依狀態出現）。 */
export type PatternScreenResponse = {
  ok: boolean;
  ready: boolean;
  patterns?: Record<PatternId, PatternScreenPattern>;
  data_date?: string;
  data_scope?: string;
  next_update?: string;
  scope?: string;
  note?: string;
  criteria?: Record<string, number>;
  availableDays?: number;
  windowDays?: number;
  scannedStocks?: number;
  missing?: string[];
  gaps?: string[];
  minDaysRequired?: number;
  message?: string;
  reason?: string;
  provenance?: { source: string; upstream: string };
  /** 離線預算的產出時間（ISO 字串）；尚未預算時不出現（不捏造時間）。 */
  computedAt?: string;
  /** route 由 KV 讀出並回傳時為 true（前端可據此辨識來源）。 */
  precomputed?: boolean;
  /** route 實際回應時間（ISO 字串）。 */
  fetchedAt?: string;
};

/** 單一波段條件頁籤（對齊實站 schema）。 */
export type SwingHubTab = {
  id: string;
  title: string;
  desc: string;
  items: SwingItem[];
  unavailable_reason?: string;
  note?: string;
};

/** swing-hub 回應形狀。 */
export type SwingHubResponse = {
  ok: boolean;
  ready: boolean;
  data_date?: string;
  data_scope?: string;
  next_update?: string;
  week?: string;
  weeksAccumulated?: number;
  tabs?: SwingHubTab[];
  note?: string;
  provenance?: { source: string; upstreams: string[] };
  whale_delta_provenance?: unknown;
  message?: string;
  reason?: string;
  /** 離線預算的產出時間（ISO 字串）；尚未預算時不出現。 */
  computedAt?: string;
  /** route 由 KV 讀出並回傳時為 true。 */
  precomputed?: boolean;
  /** route 實際回應時間（ISO 字串）。 */
  fetchedAt?: string;
};

// ===========================================================================
// 三、上游抓取工具（僅供離線預算腳本呼叫；route 絕不呼叫）
// ===========================================================================

/** 名稱對照上游（皆為免費官方 OpenAPI）。 */
const TWSE_NAME_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL';
const TPEX_NAME_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';

/** 瀏覽器 UA（證交所／櫃買會檢查 UA 與 Referer）。 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * 上游 fetch（8 秒 timeout；失敗回 null，不拋錯）。
 * @param url 目標網址
 * @param referer Referer 標頭（可省略）
 */
async function fetchJson(url: string, referer?: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        ...(referer ? { Referer: referer } : {}),
        'User-Agent': UA,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 盡力取得「代號 → 名稱」對照（TWSE 上市 + TPEX 上櫃）。
 * 任一來源失敗皆不影響主流程（名稱留空，label 僅顯示代號，不捏造）。
 */
export async function fetchNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const twse = await fetchJson(TWSE_NAME_URL, 'https://www.twse.com.tw/zh/');
  if (Array.isArray(twse)) {
    for (const row of twse as Array<Record<string, unknown>>) {
      const code = row?.Code;
      const name = row?.Name;
      if (typeof code === 'string' && typeof name === 'string' && code) {
        map.set(code.trim(), name.trim());
      }
    }
  }

  const tpex = await fetchJson(TPEX_NAME_URL, 'https://www.tpex.org.tw/zh-tw/');
  if (Array.isArray(tpex)) {
    for (const row of tpex as Array<Record<string, unknown>>) {
      const code = row?.SecuritiesCompanyCode;
      const name = row?.CompanyName;
      if (typeof code === 'string' && typeof name === 'string' && code && !map.has(code.trim())) {
        map.set(code.trim(), name.trim());
      }
    }
  }

  return map;
}

// ===========================================================================
// 四、pattern-screen 組裝
// ===========================================================================

/** 將寬鬆輸入轉成緊湊 bar 陣列（非陣列一律視為空，不拋錯）。 */
function toCompactBars(raw: unknown): CompactBar[] {
  return Array.isArray(raw) ? (raw as CompactBar[]) : [];
}

/**
 * 由「多日全市場日 K」組出 pattern-screen 的完整回應（純資料處理，不觸及網路／KV）。
 *
 * 資料誠實：日數不足 MIN_BARS_FOR_SCAN 一律回 ready:false（reason:'insufficient_data'），
 * **絕不回空 patterns 假裝掃過**。
 *
 * @param input.days 升冪的多日全市場日 K（KV 存檔形狀）
 * @param input.nameMap 代號→名稱對照（可省略；缺名稱時 label 僅顯示代號）
 * @param input.missing 視窗內缺漏的日期（可省略；誠實列出）
 * @param input.windowDays 視窗天數（可省略；預設為 days.length）
 * @param input.computedAt 預算產出時間（可省略；預設為呼叫當下）
 */
export function buildPatternScreenPayload(input: {
  days: ScanDayInput[];
  nameMap?: Map<string, string>;
  missing?: string[];
  windowDays?: number;
  computedAt?: string;
}): PatternScreenResponse {
  const days = Array.isArray(input.days) ? input.days : [];
  const nameMap = input.nameMap ?? new Map<string, string>();
  const missing = input.missing ?? [];
  const computedAt = input.computedAt ?? new Date().toISOString();

  const usedDates: string[] = [];
  for (const day of days) {
    if (day && typeof day.date === 'string' && day.date.length > 0) usedDates.push(day.date);
  }

  // 誠實底線：序列不足 MIN_BARS_FOR_SCAN 根不判定（不回空 patterns 冒充掃過）。
  if (usedDates.length < MIN_BARS_FOR_SCAN) {
    return {
      ok: true,
      ready: false,
      availableDays: usedDates.length,
      minDaysRequired: MIN_BARS_FOR_SCAN,
      reason: 'insufficient_data',
      message: `日 K 資料累積中，尚無法辨識型態（目前 ${usedDates.length} 天，至少需 ${MIN_BARS_FOR_SCAN} 天）。`,
      criteria: PATTERN_CRITERIA,
      gaps: [...GAPS],
      provenance: PROVENANCE,
      computedAt,
    };
  }

  // 宇宙：僅 4 碼上市櫃個股（見 patternScan.PATTERN_UNIVERSE_STOCKS_ONLY 說明），
  // 排除 ETF / TDR / 權證 / ETN 等（見 isScannableCode 說明）。
  const builder = createSeriesBuilder();
  for (const day of days) {
    for (const bar of expandBars(toCompactBars(day?.twse))) {
      if (isScannableCode(bar.code)) builder.pushBar(bar);
    }
    for (const bar of expandBars(toCompactBars(day?.tpex))) {
      if (isScannableCode(bar.code)) builder.pushBar(bar);
    }
  }

  const seriesList = builder.toSeriesList();
  const hits = scanSeriesList(seriesList);
  const grouped = groupHitsByPattern(hits);

  const seriesByCode = new Map(seriesList.map((s) => [s.code, s]));
  const dataDate = usedDates[usedDates.length - 1];

  const patterns = {} as Record<PatternId, PatternScreenPattern>;
  for (const id of PATTERN_ORDER) {
    const items: PatternItem[] = [];
    for (const code of grouped[id]) {
      const series = seriesByCode.get(code);
      if (!series) continue;
      items.push(buildPatternItem(series, nameMap.get(code) ?? '', dataDate));
    }
    patterns[id] = { meta: PATTERN_META[id], items, count: items.length };
  }

  return {
    ok: true,
    ready: true,
    patterns,
    data_date: dataDate,
    data_scope: '盤後日 K',
    next_update: NEXT_UPDATE,
    scope: 'historical_geometry',
    note: NOTE,
    criteria: PATTERN_CRITERIA,
    availableDays: usedDates.length,
    windowDays: input.windowDays ?? days.length,
    scannedStocks: seriesList.length,
    missing,
    gaps: [...GAPS],
    provenance: PROVENANCE,
    computedAt,
  };
}

/**
 * pattern-screen 的「尚未預算」回應（Edge route 專用；純資料，不觸及網路／KV）。
 *
 * ⚠ 文案必須說清楚是「每日盤後離線預算、目前沒有結果」，**不可**寫成「載入中」——
 *   那是永久拿不到的狀態，長得像載入中就是誤導使用者。
 *
 * @param suffix 依情境（KV 未綁定／內容損壞）附加的補充說明
 */
export function buildPatternScreenNotReady(suffix = ''): PatternScreenResponse {
  return {
    ok: true,
    ready: false,
    reason: NOT_PRECOMPUTED_REASON,
    message: `${PATTERN_SCREEN_NOT_READY_MESSAGE}${suffix}`,
    minDaysRequired: MIN_BARS_FOR_SCAN,
    criteria: PATTERN_CRITERIA,
    gaps: [...GAPS],
    provenance: PROVENANCE,
  };
}

/** KV 未綁定時的 pattern-screen 回應。 */
export function buildPatternScreenKvUnbound(): PatternScreenResponse {
  return buildPatternScreenNotReady(KV_UNBOUND_SUFFIX);
}

/** KV 內容損壞（無法解析／形狀不符）時的 pattern-screen 回應。 */
export function buildPatternScreenKvCorrupt(): PatternScreenResponse {
  return buildPatternScreenNotReady(KV_CORRUPT_SUFFIX);
}

// ===========================================================================
// 五、swing-hub 上游（僅離線腳本呼叫）
// ===========================================================================

/** TDCC 集保戶股權分散表（免費、免 key）。 */
const TDCC_URL = 'https://openapi.tdcc.com.tw/v1/opendata/1-5';
/** TWSE T86 三大法人買賣超日報。 */
const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86';
/** TWSE MI_MARGN 融資融券（rwd，可指定日期；供「約 20 交易日前」比較）。 */
const MI_MARGN_RWD_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN';
/** TWSE 月營收 OpenAPI（同時提供公司名稱與產業別）。 */
const REVENUE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
/** TWSE 除權除息預告表。 */
const EXRIGHT_URL = 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U';

/** T86 回推抓取的天數（日曆天；足以涵蓋 3 個「資料日」，含連假緩衝）。 */
const T86_LOOKBACK_CALENDAR_DAYS = 10;

/** 融資基準日回推的交易日數（21 個交易日，取 [0] = 20 交易日前）。 */
const MARGIN_WINDOW_TRADING_DAYS = 21;

/** swing-hub 統一的來源追蹤欄位。 */
const SWING_PROVENANCE = {
  source: 'self-produced' as const,
  upstreams: [TDCC_URL, T86_URL, MI_MARGN_RWD_URL, REVENUE_URL, EXRIGHT_URL, TWSE_MI_INDEX_URL, TPEX_OTC_URL],
};

/** swing-hub 頁面的固定註記。 */
const SWING_NOTE = '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。';

/** swing-hub 全部上游（已解析成 lib 可直接吃的形狀）。 */
export type SwingUpstreams = {
  /** 三大法人數個資料日（升冪）。 */
  t86Days: T86Day[];
  /** 集保大戶比例（代號 → 級距彙總）。 */
  tdcc: Map<string, WhaleGrade>;
  /** 月營收列。 */
  revenueRows: RevenueRow[];
  /** 除權息列。 */
  exRightRows: ExRightRow[];
  /** 融資今日餘額（代號 → 張）；抓不到為 null。 */
  marginToday: Map<string, number> | null;
  /** 約 20 交易日前的融資餘額（代號 → 張）；抓不到為 null。 */
  marginBaseline: Map<string, number> | null;
};

/** '20260924' → '2026-09-24'（格式不符原樣回傳）。 */
function formatDisplayDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 抓取指定日期的 MI_MARGN（rwd）→ 代號 → 融資今日餘額（張）。 */
async function fetchMarginMap(ymd: string): Promise<Map<string, number> | null> {
  const raw = await fetchJson(
    `${MI_MARGN_RWD_URL}?date=${ymd}&selectType=ALL&response=json`,
    'https://www.twse.com.tw/zh/trading/margin/mi-margn.html',
  );
  if (!raw || (raw as { stat?: string }).stat !== 'OK') return null;
  const tables = (raw as { tables?: Array<{ data?: unknown }> }).tables;
  if (!Array.isArray(tables) || tables.length < 2) return null;
  const stockTable = tables[1];
  if (!stockTable || !Array.isArray(stockTable.data)) return null;
  const map = parseMarginRows(stockTable.data);
  return map.size > 0 ? map : null;
}

/** 抓取最近數個「資料日」的 T86（並行），回傳升冪、僅含有效日。 */
async function fetchT86Days(): Promise<T86Day[]> {
  const now = new Date();
  const requests: Promise<T86Day | null>[] = [];
  for (let offset = 0; offset < T86_LOOKBACK_CALENDAR_DAYS; offset += 1) {
    const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    requests.push(
      fetchJson(`${T86_URL}?response=json&date=${ymd}&selectType=ALLBUT0999`, 'https://www.twse.com.tw/zh/trading/foreign/t86.html')
        .then((raw) => {
          if (!raw || (raw as { stat?: string }).stat !== 'OK') return null;
          const items = parseT86Rows(raw);
          if (items.length === 0) return null;
          const dateRaw = String((raw as { date?: string }).date ?? ymd);
          return { date: formatDisplayDate(dateRaw), items } satisfies T86Day;
        })
        .catch(() => null),
    );
  }
  const results = await Promise.all(requests);
  const days = results.filter((d): d is T86Day => d !== null);
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

/**
 * 抓取 swing-hub 的全部上游（各自 try/catch，單一上游失敗不影響其他）。
 * 僅供離線預算腳本呼叫；Edge route 絕不呼叫（會爆 subrequest 與 CPU）。
 */
export async function fetchSwingUpstreams(): Promise<SwingUpstreams> {
  const [t86Days, tdccRaw, revenueRaw, exRightRaw] = await Promise.all([
    fetchT86Days(),
    fetchJson(TDCC_URL),
    fetchJson(REVENUE_URL),
    fetchJson(EXRIGHT_URL, 'https://www.twse.com.tw/zh/trading/historical/ex-rights.html'),
  ]);

  const tdcc = tdccRaw ? parseTdccRows(tdccRaw) : new Map<string, WhaleGrade>();
  const revenueRows = revenueRaw ? parseRevenueRows(revenueRaw) : [];
  const exRightRows = exRightRaw ? parseExRightRows(exRightRaw) : [];

  // 價格資料日：以 T86 最新資料日為準；無 T86 時退回今天（台北時區）。
  const priceDate = t86Days.length > 0 ? t86Days[t86Days.length - 1].date : todayTaipeiYmd();
  const priceDateObj = parseYmdToDate(priceDate) ?? new Date();

  // 融資：今日 + 約 20 交易日前（2 次上游）。
  // 視窗取自 marketBars.buildTradingDayWindow（升冪），[0] 即 20 交易日前。
  const priceYmd = priceDate.replace(/-/g, '');
  const marginWindow = buildTradingDayWindow(priceDateObj, MARGIN_WINDOW_TRADING_DAYS);
  const baselineDate =
    marginWindow.length >= MARGIN_WINDOW_TRADING_DAYS ? marginWindow[0] : null;
  const baselineYmd = baselineDate ? baselineDate.replace(/-/g, '') : null;
  const [marginToday, marginBaseline] = await Promise.all([
    fetchMarginMap(priceYmd),
    baselineYmd ? fetchMarginMap(baselineYmd) : Promise.resolve(null),
  ]);

  return {
    t86Days,
    tdcc,
    revenueRows,
    exRightRows,
    marginToday,
    marginBaseline,
  };
}

// ===========================================================================
// 六、swing-hub 組裝
// ===========================================================================

/** 16 個頁籤的 id／title／desc（逐字對齊實站 schema）。 */
const TAB_META: ReadonlyArray<{ id: string; title: string; desc: string }> = [
  { id: 'whale_in', title: '大戶持股比例增加', desc: '400 張以上持股級距的四週比例增加。' },
  { id: 'whale_out', title: '大戶持股比例減少', desc: '400 張以上持股級距的四週比例減少。' },
  { id: 'ma60', title: '收盤／月線／季線排列', desc: '資料日收盤 > MA20 > MA60，且 MA20 較前值增加。' },
  { id: 'pullback', title: '距月線正負 2%', desc: '資料日收盤高於 MA60，且距 MA20 在正負 2% 內。' },
  { id: 'foreign', title: '外資連買', desc: '外資連續 3 個資料日買超。' },
  { id: 'trust', title: '投信連買', desc: '投信連續 3 個資料日買超。' },
  { id: 'both', title: '雙法人同買', desc: '當日外資＋投信同時買超。' },
  { id: 'reclaim', title: '收盤由月線下方轉為上方', desc: '前一資料日收盤低於 MA20，本資料日收盤高於 MA20。' },
  { id: 'break20', title: '20 日新高且量增', desc: '資料日收盤為近 20 日新高，且成交量符合量增條件。' },
  { id: 'rs', title: '20 日區間報酬排序', desc: '近 20 日區間報酬與成交金額皆符合門檻。' },
  { id: 'sector', title: '族群 20 日報酬排序', desc: '族群 20 日平均報酬及個股區間報酬符合門檻。' },
  { id: 'margin', title: '融資餘額下降', desc: '融資餘額較約 20 日前下降，並列同期區間報酬。' },
  { id: 'revenue', title: '月營收增減條件', desc: '最近月營收 MoM 與 YoY 符合頁面所列門檻。' },
  { id: 'fill', title: '除權息填息', desc: '近期除權息個股相對參考價回升進度——填息／貼息觀察。' },
  { id: 'badnews', title: '負面敘事與當日跌幅', desc: '新聞標題規則分類為負面，並列資料日實際漲跌幅。' },
  { id: 'smart', title: '融資／大戶／量價交集', desc: '同時符合融資餘額、400 張以上持股級距與量價門檻。' },
];

/** 建立單一 tab（含可選的 unavailable_reason / note）。 */
function makeTab(
  id: string,
  items: SwingItem[],
  extra?: { unavailable_reason?: string; note?: string },
): SwingHubTab {
  const meta = TAB_META.find((t) => t.id === id);
  if (!meta) throw new Error(`unknown tab id: ${id}`);
  return {
    id: meta.id,
    title: meta.title,
    desc: meta.desc,
    items,
    ...(extra?.unavailable_reason ? { unavailable_reason: extra.unavailable_reason } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  };
}

/** 日 K 不足時的誠實理由文字（不捏造天數，也不說「載入中」）。 */
function barsReason(kvBound: boolean, days: number, needed: number): string {
  if (!kvBound) return '全市場日 K 尚未綁定 KV，無法計算均線條件。';
  return `全市場日 K 目前僅累積 ${days} 個交易日，尚未達本條件所需的 ${needed} 日；資料累積中。`;
}

/**
 * 由「多日全市場日 K + 上游資料」組出 swing-hub 的完整回應（純資料處理）。
 *
 * 資料誠實：任一上游缺席時，該 tab 回空 items + unavailable_reason，
 * **絕不以 0 或假資料填充**；badnews 本站無新聞源，固定留白。
 *
 * @param input.days 升冪的多日全市場日 K（KV 存檔形狀）
 * @param input.upstreams 上游抓取結果（可省略＝全部缺席，各 tab 誠實留白）
 * @param input.computedAt 預算產出時間（可省略；預設為呼叫當下）
 */
export function buildSwingHubPayload(input: {
  days: ScanDayInput[];
  upstreams?: Partial<SwingUpstreams>;
  computedAt?: string;
}): SwingHubResponse {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const days = Array.isArray(input.days) ? input.days : [];
  const up = input.upstreams ?? {};

  const t86Days: T86Day[] = up.t86Days ?? [];
  const tdcc: Map<string, WhaleGrade> = up.tdcc ?? new Map<string, WhaleGrade>();
  const revenueRows: RevenueRow[] = up.revenueRows ?? [];
  const exRightRows: ExRightRow[] = up.exRightRows ?? [];
  const marginToday = up.marginToday ?? null;
  const marginBaseline = up.marginBaseline ?? null;

  const t86Ready = t86Days.length > 0;
  const tdccReady = tdcc.size > 0;
  const revenueReady = revenueRows.length > 0;
  const exRightReady = exRightRows.length > 0;
  const marginReady = marginToday !== null && marginBaseline !== null;

  // 1. 價格資料日：以 T86 最新資料日為準；無 T86 時退回今天（台北時區）。
  const priceDate = t86Ready ? t86Days[t86Days.length - 1].date : todayTaipeiYmd();

  // 2. 全市場日 K 序列（呼叫端已確保升冪）。
  const series: CodeSeriesMap = buildCodeSeries(
    days.map((d) => ({
      date: d?.date ?? '',
      twse: toCompactBars(d?.twse),
      tpex: toCompactBars(d?.tpex),
    })),
  );
  const barsDays = days.length;

  // 3. 名稱／產業地圖（來源：月營收 OpenAPI）＋ T86 名稱補位。
  const meta: StockMetaMap = new Map();
  for (const r of revenueRows) {
    meta.set(r.code, { name: r.name || undefined, industry: r.industry });
  }
  for (const day of t86Days) {
    for (const it of day.items) {
      const existing = meta.get(it.symbol);
      if (!existing) meta.set(it.symbol, { name: it.name || undefined });
      else if (!existing.name && it.name) existing.name = it.name;
    }
  }

  const ctx: ConditionContext = { series, meta, asOf: priceDate };

  // 4. 融資變化（張）：代號 → delta（今日 − 約 20 交易日前）。
  const marginDelta = new Map<string, number>();
  if (marginReady && marginToday && marginBaseline) {
    for (const [code, bal] of marginToday) {
      const prev = marginBaseline.get(code);
      if (prev !== undefined) marginDelta.set(code, bal - prev);
    }
  }

  // 5. 逐 tab 計算。
  const barsEnoughMa = barsDays >= MA_LONG + 1;
  const barsEnoughShort = barsDays >= RS_LOOKBACK + 1;
  const kvBound = barsDays > 0;

  const tabs: SwingHubTab[] = [];

  // whale_in / whale_out（TDCC + site-mirror 週序列 fallback）
  // ⚠ 週增減（delta_1w/delta_4w/up_weeks）本站尚無法自算 → 以實站 2026-09-18 快照
  //   fallback；查無對應代號時回 null（前端顯示「累積中」）。
  const whaleItems = tdccReady ? computeWhale(ctx, tdcc, 1, WHALE_MIRROR_MAP) : [];
  const whaleExtra = tdccReady ? {} : { unavailable_reason: 'TDCC 集保戶股權分散表上游無回應。' };
  tabs.push(makeTab('whale_in', whaleItems, whaleExtra));
  tabs.push(makeTab('whale_out', whaleItems, whaleExtra));

  // ma60 / pullback（需 60 日）
  if (barsEnoughMa) {
    tabs.push(makeTab('ma60', computeMa60(ctx)));
    tabs.push(makeTab('pullback', computePullback(ctx)));
  } else {
    const reason = barsReason(kvBound, barsDays, MA_LONG + 1);
    tabs.push(makeTab('ma60', [], { unavailable_reason: reason }));
    tabs.push(makeTab('pullback', [], { unavailable_reason: reason }));
  }

  // foreign / trust / both（T86）
  if (t86Ready) {
    tabs.push(makeTab('foreign', computeInstitutionalStreak(ctx, t86Days, 'foreignNet')));
    tabs.push(makeTab('trust', computeInstitutionalStreak(ctx, t86Days, 'trustNet')));
    tabs.push(makeTab('both', computeBothBuy(ctx, t86Days[t86Days.length - 1])));
  } else {
    const reason = 'TWSE T86 三大法人上游無回應。';
    tabs.push(makeTab('foreign', [], { unavailable_reason: reason }));
    tabs.push(makeTab('trust', [], { unavailable_reason: reason }));
    tabs.push(makeTab('both', [], { unavailable_reason: reason }));
  }

  // reclaim / break20 / rs / sector（需 21 日）
  if (barsEnoughShort) {
    tabs.push(makeTab('reclaim', computeReclaim(ctx)));
    tabs.push(makeTab('break20', computeBreak20(ctx)));
    tabs.push(makeTab('rs', computeRs(ctx)));
    tabs.push(
      makeTab('sector', computeSector(ctx), {
        ...(meta.size === 0
          ? { unavailable_reason: '產業分類來源（TWSE 月營收 OpenAPI）無回應，無法分族群。' }
          : {}),
      }),
    );
  } else {
    const reason = barsReason(kvBound, barsDays, RS_LOOKBACK + 1);
    tabs.push(makeTab('reclaim', [], { unavailable_reason: reason }));
    tabs.push(makeTab('break20', [], { unavailable_reason: reason }));
    tabs.push(makeTab('rs', [], { unavailable_reason: reason }));
    tabs.push(makeTab('sector', [], { unavailable_reason: reason }));
  }

  // margin
  tabs.push(
    makeTab(
      'margin',
      marginReady
        ? computeMarginDrop(ctx, marginToday as Map<string, number>, marginBaseline as Map<string, number>)
        : [],
      marginReady
        ? {}
        : { unavailable_reason: 'TWSE MI_MARGN 融資融券上游無回應或無法取得 20 交易日前基準。' },
    ),
  );

  // revenue
  tabs.push(
    makeTab(
      'revenue',
      revenueReady ? computeRevenue(revenueRows) : [],
      revenueReady ? {} : { unavailable_reason: 'TWSE 月營收 OpenAPI 無回應。' },
    ),
  );

  // fill
  const fillItems = exRightReady && barsDays > 0 ? computeFill(ctx, exRightRows) : [];
  const fillExtra = !exRightReady
    ? { unavailable_reason: 'TWSE 除權除息預告表上游無回應。' }
    : barsDays === 0
      ? { unavailable_reason: '需全市場日 K 才能計算除權息後相對參考價的回升進度。' }
      : {};
  tabs.push(makeTab('fill', fillItems, fillExtra));

  // badnews（留白）
  tabs.push(makeTab('badnews', [], { unavailable_reason: '本站尚無新聞資料源。' }));

  // smart
  const smartReady = marginReady && tdccReady && barsDays >= SMART_RANGE_LOOKBACK + 1;
  tabs.push(
    makeTab(
      'smart',
      smartReady ? computeSmart(ctx, marginDelta, tdcc) : [],
      smartReady
        ? {}
        : { unavailable_reason: '需同時具備融資餘額、集保大戶比例與全市場日 K（40 日）三項資料。' },
    ),
  );

  // 6. 組裝回應（對齊實站 schema）。
  const whaleWeek = tdcc.size > 0 ? [...tdcc.values()][0].date : '';
  const week = whaleWeek ? formatDisplayDate(whaleWeek) : '';

  return {
    ok: true,
    ready: true,
    data_date: priceDate,
    data_scope: '盤後歷史條件',
    next_update: NEXT_UPDATE,
    week,
    weeksAccumulated: tdccReady ? 1 : 0,
    tabs,
    note: SWING_NOTE,
    provenance: SWING_PROVENANCE,
    // 大戶持股週增減欄位的來源（本站無法自算 → 實站快照）。
    whale_delta_provenance: WHALE_MIRROR_META,
    computedAt,
  };
}

/**
 * swing-hub 的「尚未預算」回應（Edge route 專用）。
 * ⚠ 不帶 tabs（空 tabs 會被誤讀成「掃過但沒結果」），以 message 誠實說明。
 */
export function buildSwingHubNotReady(suffix = ''): SwingHubResponse {
  return {
    ok: true,
    ready: false,
    reason: NOT_PRECOMPUTED_REASON,
    message: `${SWING_HUB_NOT_READY_MESSAGE}${suffix}`,
    provenance: SWING_PROVENANCE,
    whale_delta_provenance: WHALE_MIRROR_META,
  };
}

/** KV 未綁定時的 swing-hub 回應。 */
export function buildSwingHubKvUnbound(): SwingHubResponse {
  return buildSwingHubNotReady(KV_UNBOUND_SUFFIX);
}

/** KV 內容損壞（無法解析／形狀不符）時的 swing-hub 回應。 */
export function buildSwingHubKvCorrupt(): SwingHubResponse {
  return buildSwingHubNotReady(KV_CORRUPT_SUFFIX);
}

// ===========================================================================
// 七、KV 讀取後的合法性檢查（route 共用）
// ===========================================================================

/**
 * 檢查自 KV 讀出的 pattern-screen 值是否為「可用的預算結果」。
 * 形狀不符一律視為尚未預算（交由 route 回誠實 not-ready），**不修補、不捏造**。
 */
export function isUsablePatternScreenPayload(value: unknown): value is PatternScreenResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<PatternScreenResponse>;
  return v.ok === true && typeof v.ready === 'boolean' && typeof v.data_date === 'string';
}

/**
 * 檢查自 KV 讀出的 swing-hub 值是否為「可用的預算結果」。
 */
export function isUsableSwingHubPayload(value: unknown): value is SwingHubResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<SwingHubResponse>;
  return v.ok === true && typeof v.ready === 'boolean' && typeof v.data_date === 'string';
}
