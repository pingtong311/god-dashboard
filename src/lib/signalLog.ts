/**
 * 訊號日誌（signal log）共用層：寫入 → 對帳 → 統計
 * ============================================================================
 * 目的（這是本檔存在的唯一理由）
 * ----------------------------------------------------------------------------
 *   業主要「準確而且有幫助的投資建議」，而且要有回測、複驗、佐證，要能得出勝率。
 *   盤點現況：KV key 全集（mkt:bars:、scan:*、god:*）**無一存歷史訊號**，
 *   data/api/app/*.json 每天覆蓋、無日期後綴 → 勝率**完全算不出來**。
 *   本層就是補上這個基礎設施：把每一筆「有失效條件、有停損」的建議**留下來**，
 *   日後用日 K 事後對帳，才有勝率可談。
 *
 * 設計（team-lead 裁示）
 * ----------------------------------------------------------------------------
 *   1. 不引 cron 排程（Workers 上排程麻煩、Free plan 有限制）→ **lazy reconcile**：
 *      訊號寫入時只存原始欄位；要結果時才讀日 K 對帳。
 *   2. KV key 帶日期後綴 `signal:log:<YYYYMMDD>`，**同日多筆用陣列 append，
 *      絕對不覆蓋**（歷史留存是回測的前提）。
 *   3. 硬閘門：缺 `invalid_condition` 或 `stop_loss` → 拒絕寫入。
 *      「沒有失效條件的建議」不准進系統（業主要求的「一針見血」底線）。
 *   4. 取不到日 K → outcome 回 **null** 並標記原因（'no_bars_available'），
 *      **絕不當 0、絕不當 loss、絕不捏造、絕不用 Math.random**。
 *   5. 已結算樣本 < 30 → `sample_sufficient: false` + 說明「樣本不足，不足以判斷勝率」。
 *
 * ★ 為何不用 loadDay() 整包 JSON.parse（本層最關鍵的效能決策）
 * ----------------------------------------------------------------------------
 *   `mkt:bars:<YYYY-MM-DD>` 單日約 0.76 MB / ~18,100 檔（見 src/lib/marketBars.ts
 *   的 MAX_FULL_SERIES_DAYS 註解）。實測（futures/route.ts 檔頭）：806KB 整包
 *   JSON.parse 在 Cloudflare Workers 上就有 2–3% 機率越過 Free plan 的 10ms CPU
 *   上限——也就是說**一天的成本就已經吃掉整個 CPU 預算**。對帳需要連續多天，
 *   若每天整包 parse，30 天 ≈ 240ms CPU，必然 1102。
 *
 *   故本層改走**快速抽取**：
 *     ① `kv.get(marketBarKey(date))` 只取原始字串（KV 讀取本身是 I/O，不計 CPU）；
 *     ② 用 `String.prototype.indexOf('"2330"')` 在原始字串上直接定位該檔的
 *        CompactBar 元組（原生 memmem，760KB 約 0.05–0.1ms），只 JSON.parse
 *        那一個 ~40 bytes 的小陣列；
 *     ③ 全部代號都沒抽到時，才退回整包 JSON.parse 做一次完整掃描（正確性保底）。
 *   成本：每天 ≈ 1 次 KV 讀（I/O）+ N 次 indexOf + N 次極小 parse，
 *         約 0.3–1ms CPU/天，30 天 ≈ 10–30ms，遠低於整包 parse。
 *
 * 對帳語義（避免前視偏誤 look-ahead bias，務必看懂）
 * ----------------------------------------------------------------------------
 *   訊號日 D 的 entry_price 代表「D 當下的價格」，D 當日的高低點**已經發生在訊號
 *   之前**。若從 D 當日開始判定，等於用「訊號成立前的價格」去算勝負，會把勝率
 *   系統性高估。故對帳區間一律是 **D 的次一交易日起** → D+window 日止。
 *
 *   單日 K 棒只提供 high/low，無法還原盤中先後順序：
 *     - high ≥ target 且 low ≤ stop（同一天）→ **ambiguous**，誠實標「無法判定」，
 *       不硬選一邊（選 win 或 loss 都是捏造）。
 *     - 只觸 target → win；只觸 stop → loss；都沒觸 → open。
 *
 * Cloudflare Free plan 配額估算（寫在這裡供維運對照）
 * ----------------------------------------------------------------------------
 *   - 單一 KV value 上限 25 MiB：本層單日訊號上限 200 筆 × ~450 bytes ≈ 90 KB，
 *     離上限 3 個數量級，安全。
 *   - 寫入 1,000 次/日：每筆訊號 1 次寫入 → 200 筆/日 = 配額的 20%。
 *     （對帳端**不寫入**，只讀，避免吃掉寫入配額。）
 *   - 讀取 100,000 次/日：單日對帳 ~7 個交易日、統計端上限 40 個日 K 日 →
 *     每次請求數十次以內，安全。
 *   - list 次數配額最稀缺 → 統計端預設優先吃 `from`/`to`，不得已才用 list。
 *   - CPU 10ms/request：見上方「快速抽取」；並以 window / MAX_STATS_BAR_DAYS
 *     讓呼叫端自行節制，超過預算時**誠實截斷並回報**（不偷偷少算）。
 *
 * 紅漲綠跌：本層只做資料與判定，不涉顏色。
 */

import {
  eachDateInRange,
  isTradingDay,
  marketBarKey,
  parseYmdToDate,
  todayTaipeiYmd,
} from '@/lib/marketBars';
import type { SkynetKv } from '@/lib/godBridge';

// ---------------------------------------------------------------------------
// 常數
// ---------------------------------------------------------------------------

/** KV key 前綴：訊號日誌命名空間（與 mkt:bars:、god:、scan: 互不干擾）。 */
export const SIGNAL_LOG_KV_PREFIX = 'signal:log:';

/**
 * KV TTL：365 天。
 * 訊號日誌是回測的唯一來源，刻意取長（比 mkt:bars 的 180 天更長），
 * 讓「一年前的訊號」仍有日 K 可比對。⚠ 到期即消失，長期仍需匯出歸檔。
 */
export const SIGNAL_LOG_KV_TTL_SECONDS = 365 * 24 * 60 * 60;

/** 單日訊號筆數上限（超過回 400；同時是 KV value 體積的防線）。 */
export const MAX_SIGNALS_PER_DAY = 200;

/** 對帳窗口預設值（日曆天）。約 7 個交易日，CPU 估算 ~3–7ms，Free plan 安全區。 */
export const RECONCILE_WINDOW_DAYS_DEFAULT = 10;

/** 對帳窗口硬上限（日曆天）。超過會明顯越過 Free plan CPU 預算，故不開放更大。 */
export const RECONCILE_WINDOW_DAYS_MAX = 45;

/** 統計端對帳窗口預設值（日曆天，較單日對帳保守，因為要乘上訊號日數）。 */
export const STATS_WINDOW_DAYS_DEFAULT = 10;

/** 統計端最多納入幾個「有訊號的日期」（取最近的）。 */
export const MAX_STATS_SIGNAL_DAYS = 30;

/** 統計端單次最多讀幾個日 K 日（CPU 防線；超過則從最舊的訊號日開始截斷並誠實回報）。 */
export const MAX_STATS_BAR_DAYS = 40;

/** 統計端單次最多納入幾筆訊號（記憶體／回應體積防線）。 */
export const MAX_STATS_SIGNALS = 1000;

/**
 * 「樣本足夠」門檻：已結算筆數（win + loss）達 30 才宣稱勝率。
 * 這是本專案鐵律：未達門檻一律 sample_sufficient:false + 說明，
 * 不可為了好看而省略標示。
 */
export const SAMPLE_SUFFICIENT_MIN = 30;

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

/** 存進 KV 的單筆訊號（= 業主要求的「一針見血」最小集合）。 */
export type StoredSignal = {
  /** 冪等鍵 `${signal_date}|${ticker}|${source}`，同時供去重與前端 key 使用。 */
  id: string;
  /** 證券代號，如 '2330'。 */
  ticker: string;
  /** 訊號日 'YYYYMMDD'（正規化後的唯一格式）。 */
  signal_date: string;
  /** 進場參考價（> 0）。 */
  entry_price: number;
  /** 目標價（> entry_price）。 */
  target_price: number;
  /** 停損價（< entry_price）。**硬閘門欄位**。 */
  stop_loss: number;
  /** 理由（可為空字串，但欄位存在）。 */
  reason: string;
  /** 失效條件（「什麼狀況代表我看錯了」）。**硬閘門欄位**。 */
  invalid_condition: string;
  /** 信心 0–100；來源未給或無法解析時為 null（絕不補 0）。 */
  confidence: number | null;
  /** 訊號來源（provenance 要求：資料要能追溯來源）。 */
  source: string;
  /** 寫入時間（ISO 字串）。 */
  logged_at: string;
};

/** 寫入驗證失敗的機器可判代碼。 */
export type SignalRejectCode =
  | 'invalid_body'
  | 'missing_ticker'
  | 'missing_signal_date'
  | 'invalid_signal_date'
  | 'missing_entry_price'
  | 'invalid_entry_price'
  | 'missing_target_price'
  | 'invalid_target_price'
  | 'missing_stop_loss'
  | 'invalid_stop_loss'
  | 'missing_invalid_condition'
  | 'invalid_price_relation'
  | 'missing_source';

export type ParseSignalResult =
  | { ok: true; value: StoredSignal }
  | { ok: false; error: SignalRejectCode; message: string };

/** 對帳結果代碼（null 表示「無法判定」，不是「輸」也不是 0）。 */
export type OutcomeCode = 'win' | 'loss' | 'ambiguous' | 'open';

/** 無法結算／無法判定的原因代碼（供前端與維運機器判讀）。 */
export type OutcomeReasonCode =
  | 'target_touched'
  | 'stop_touched'
  | 'both_touched_same_day'
  | 'no_resolution_yet'
  | 'window_exhausted'
  | 'no_bars_available'
  | 'window_not_started';

/** 對帳後的單筆訊號（= StoredSignal + 判定結果）。 */
export type ReconciledSignal = {
  id: string;
  ticker: string;
  signal_date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  reason: string;
  invalid_condition: string;
  confidence: number | null;
  source: string;
  logged_at: string;

  /** 判定結果；**null = 取不到日 K、無法判定**（不可解讀為虧損或 0）。 */
  outcome: OutcomeCode | null;
  /** 判定原因代碼。 */
  outcome_reason: OutcomeReasonCode;
  /** 給人看的繁中說明（含發生日期與價格，可稽核）。 */
  outcome_message: string;
  /** 勝負底定日（'YYYY-MM-DD'）；未結算為 null。 */
  resolved_date: string | null;
  /** 實際比對到的日 K 天數。 */
  bars_checked: number;
  /** 有日 K 的最早／最晚日期（供判斷資料新鮮度）。 */
  first_bar_date: string | null;
  last_bar_date: string | null;
  /** 最近一根日 K 收盤價（尚未結算時供參考；取不到為 null）。 */
  last_close: number | null;
  /** 已結算報酬率（%）：win 用目標價、loss 用停損價計算；未結算一律 null。 */
  return_pct: number | null;
  /** 未結算時的浮動報酬率（%，以 last_close 計）；已結算為 null。 */
  unrealized_pct: number | null;
  /** 對帳窗口是否已完整走完（走完仍未結算 → 長期 open，不是「讀取中」）。 */
  window_exhausted: boolean;
};

/** 單日單檔日 K（由 mkt:bars 抽取而來）。 */
export type DailyBar = {
  /** 'YYYY-MM-DD'。 */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeLots: number;
};

/** 日 K 索引：date → code → bar。 */
export type BarIndex = Map<string, Map<string, DailyBar>>;

export type BarLoadResult = {
  index: BarIndex;
  /** 有讀到日 K 的日期（升冪）。 */
  availableDates: string[];
  /** 掃描了但取不到日 K 的日期（升冪；誠實列出，不隱匿）。 */
  missingDates: string[];
};

/** 對帳上下文（視窗資訊，供產生誠實文案）。 */
export type ReconcileContext = {
  /** 實際掃描的交易日（升冪），含取不到日 K 的日期。 */
  scannedDates: string[];
  /** scannedDates 中取不到日 K 的日期（升冪）。 */
  missingDates: string[];
  /** 對帳窗口起訖（'YYYY-MM-DD'，皆為訊號日之後）。 */
  windowStart: string;
  windowEnd: string;
  /** 對帳窗口天數（日曆天）。 */
  windowDays: number;
  /** 今天（台北，'YYYY-MM-DD'），判斷窗口是否已走完。 */
  today: string;
};

/** 統計結果。 */
export type SignalStats = {
  /** 納入統計的訊號總數。 */
  total_signals: number;
  /** 已結算筆數（win + loss，可納入勝率分母）。 */
  settled_signals: number;
  win_count: number;
  loss_count: number;
  /** 單日同時觸及目標與停損、日 K 無法判定先後 → 不計勝負。 */
  ambiguous_count: number;
  /** 有日 K 但尚未結算。 */
  open_count: number;
  /** 取不到日 K、完全無法判定（≠ 虧損）。 */
  unresolved_count: number;
  /** 勝率（%）；已結算 0 筆時為 **null**（不是 0）。 */
  win_rate: number | null;
  /** 樣本是否足夠（已結算 ≥ SAMPLE_SUFFICIENT_MIN）。 */
  sample_sufficient: boolean;
  /** 樣本不足／為零時給人看的說明。 */
  sample_note: string;
  /** 平均報酬（%，以結算價位計）；無已結算筆數時為 null。 */
  avg_return_pct: number | null;
  /** 最大回撤（%，負值；以結算順序累積報酬曲線計）；無已結算筆數時為 null。 */
  max_drawdown_pct: number | null;
};

// ---------------------------------------------------------------------------
// 日期工具
// ---------------------------------------------------------------------------

/** 'YYYYMMDD' → 'YYYY-MM-DD'；格式不符回 null。 */
export function compactToDashed(compact: string): string | null {
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** 'YYYY-MM-DD' → 'YYYYMMDD'；格式不符回 null。 */
export function dashedToCompact(dashed: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dashed)) return null;
  return dashed.replace(/-/g, '');
}

/** 'YYYY-MM-DD' 位移 days 天後回 'YYYY-MM-DD'；基準解析失敗回 null。 */
export function shiftYmd(ymd: string, days: number): string | null {
  const base = parseYmdToDate(ymd);
  if (!base) return null;
  const moved = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return moved.toISOString().slice(0, 10);
}

/**
 * 訊號日正規化：接受 'YYYYMMDD' 或 'YYYY-MM-DD'，一律轉 'YYYYMMDD'。
 * 非字串、格式不符、或不是真實存在的日期（如 20260231）→ null。
 */
export function normalizeSignalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  const candidate = dashed ? `${dashed[1]}${dashed[2]}${dashed[3]}` : compact ? trimmed : null;
  if (!candidate) return null;
  // 真實性檢查：20260231 這種「格式對但不存在」的日期要擋掉（Date 會進位成 3/3）。
  const asDashed = compactToDashed(candidate);
  if (!asDashed) return null;
  const parsed = parseYmdToDate(asDashed);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10).replace(/-/g, '') === candidate ? candidate : null;
}

/** 產生 `signal:log:<YYYYMMDD>` 的 KV key。 */
export function signalLogKey(signalDateCompact: string): string {
  return `${SIGNAL_LOG_KV_PREFIX}${signalDateCompact}`;
}

// ---------------------------------------------------------------------------
// 寫入端：驗證（硬閘門在此）
// ---------------------------------------------------------------------------

/** 非空白字串 → 去空白結果；否則 null。 */
function textField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 正數（> 0）解析；接受 number 或數字字串；其餘回 null（絕不把 null/'' 當 0）。 */
function positiveNumber(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

/**
 * 驗證並正規化一筆訊號輸入。
 *
 * 硬閘門（業主「一針見血」底線）：
 *   - 缺 `stop_loss`   → 拒絕（'missing_stop_loss'）
 *   - 缺 `invalid_condition` → 拒絕（'missing_invalid_condition'）
 *   空白字串、null、undefined 一律視為「缺」，不接受「有欄位但空值」鑽漏洞。
 *
 * 價格關係：本端點只收多方訊號，故要求 `stop_loss < entry_price < target_price`，
 * 否則回 'invalid_price_relation'（停損在進場價之上、或目標在進場價之下，
 * 都是自相矛盾的建議，會污染勝率）。
 *
 * @param body 已解析的 JSON（未知形狀）
 * @param nowIso 寫入時間（測試可注入固定值；預設當下）
 */
export function parseSignalBody(body: unknown, nowIso: string = new Date().toISOString()): ParseSignalResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body', message: '請求內容必須是 JSON 物件。' };
  }
  const record = body as Record<string, unknown>;

  const ticker = textField(record.ticker);
  if (!ticker) {
    return { ok: false, error: 'missing_ticker', message: '缺少 ticker（證券代號）。' };
  }

  if (record.signal_date === undefined || record.signal_date === null || record.signal_date === '') {
    return { ok: false, error: 'missing_signal_date', message: '缺少 signal_date（訊號日）。' };
  }
  const signalDate = normalizeSignalDate(record.signal_date);
  if (!signalDate) {
    return {
      ok: false,
      error: 'invalid_signal_date',
      message: 'signal_date 格式錯誤，需為 YYYYMMDD 或 YYYY-MM-DD 的真實日期。',
    };
  }

  if (record.entry_price === undefined || record.entry_price === null || record.entry_price === '') {
    return { ok: false, error: 'missing_entry_price', message: '缺少 entry_price（進場參考價）。' };
  }
  const entryPrice = positiveNumber(record.entry_price);
  if (entryPrice === null) {
    return { ok: false, error: 'invalid_entry_price', message: 'entry_price 必須是大於 0 的數字。' };
  }

  if (record.target_price === undefined || record.target_price === null || record.target_price === '') {
    return { ok: false, error: 'missing_target_price', message: '缺少 target_price（目標價）。' };
  }
  const targetPrice = positiveNumber(record.target_price);
  if (targetPrice === null) {
    return { ok: false, error: 'invalid_target_price', message: 'target_price 必須是大於 0 的數字。' };
  }

  // ★ 硬閘門一：沒有停損的建議不准進系統。
  if (record.stop_loss === undefined || record.stop_loss === null || record.stop_loss === '') {
    return {
      ok: false,
      error: 'missing_stop_loss',
      message: '缺少 stop_loss（停損價）。沒有停損的建議不予記錄。',
    };
  }
  const stopLoss = positiveNumber(record.stop_loss);
  if (stopLoss === null) {
    return { ok: false, error: 'invalid_stop_loss', message: 'stop_loss 必須是大於 0 的數字。' };
  }

  // ★ 硬閘門二：沒有失效條件的建議不准進系統（業主要求的「一針見血」）。
  const invalidCondition = textField(record.invalid_condition);
  if (!invalidCondition) {
    return {
      ok: false,
      error: 'missing_invalid_condition',
      message: '缺少 invalid_condition（失效條件）。說不出「什麼狀況代表我看錯」的建議不予記錄。',
    };
  }

  // provenance 要求：資料要能追溯來源，故 source 為必填。
  const source = textField(record.source);
  if (!source) {
    return { ok: false, error: 'missing_source', message: '缺少 source（訊號來源），資料需可追溯來源。' };
  }

  // 價格關係自相矛盾 → 拒絕，避免污染勝率統計。
  if (!(stopLoss < entryPrice && entryPrice < targetPrice)) {
    return {
      ok: false,
      error: 'invalid_price_relation',
      message: '價格關係矛盾：多方訊號需滿足 stop_loss < entry_price < target_price。',
    };
  }

  const confidenceRaw = record.confidence;
  let confidence: number | null = null;
  if (typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)) {
    confidence = confidenceRaw;
  } else if (typeof confidenceRaw === 'string' && confidenceRaw.trim() !== '') {
    const parsed = Number(confidenceRaw.trim());
    confidence = Number.isFinite(parsed) ? parsed : null; // 無法解析 → null，不補 0
  }

  return {
    ok: true,
    value: {
      id: `${signalDate}|${ticker}|${source}`,
      ticker,
      signal_date: signalDate,
      entry_price: entryPrice,
      target_price: targetPrice,
      stop_loss: stopLoss,
      reason: textField(record.reason) ?? '',
      invalid_condition: invalidCondition,
      confidence,
      source,
      logged_at: nowIso,
    },
  };
}

/** 單筆訊號是否符合 StoredSignal 形狀（讀取端校驗用）。 */
function isStoredSignal(value: unknown): value is StoredSignal {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.ticker === 'string' &&
    typeof r.signal_date === 'string' &&
    typeof r.entry_price === 'number' &&
    typeof r.target_price === 'number' &&
    typeof r.stop_loss === 'number' &&
    typeof r.reason === 'string' &&
    typeof r.invalid_condition === 'string' &&
    typeof r.source === 'string' &&
    typeof r.logged_at === 'string'
  );
}

export type ParsedSignalDay = {
  list: StoredSignal[];
  /** 形狀不良被略過的筆數（誠實回報，不靜默丟資料）。 */
  dropped: number;
  /** 值不是陣列（KV 損壞）→ true。 */
  corrupted: boolean;
};

/**
 * 解析 KV 中的單日訊號陣列。
 * 值為 null/空 → 空陣列；值損壞 → corrupted:true；個別筆數形狀不良 → 略過並計入 dropped。
 */
export function parseSignalDay(raw: string | null): ParsedSignalDay {
  if (raw === null || raw === '') return { list: [], dropped: 0, corrupted: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { list: [], dropped: 0, corrupted: true };
  }
  if (!Array.isArray(parsed)) return { list: [], dropped: 0, corrupted: true };
  const list: StoredSignal[] = [];
  let dropped = 0;
  for (const item of parsed) {
    if (isStoredSignal(item)) list.push(item);
    else dropped += 1;
  }
  return { list, dropped, corrupted: false };
}

export type MergeResult =
  | { ok: true; list: StoredSignal[]; deduplicated: boolean }
  | { ok: false; error: 'daily_limit_reached'; limit: number };

/**
 * 併入一筆訊號（同 id 覆蓋 = 冪等，推送端重試不會重複計入勝率）。
 * 超過 MAX_SIGNALS_PER_DAY 且為新 id 時拒絕（KV value 體積防線）。
 */
export function mergeSignalList(existing: StoredSignal[], incoming: StoredSignal): MergeResult {
  const index = existing.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    const list = existing.slice();
    list[index] = incoming;
    return { ok: true, list, deduplicated: true };
  }
  if (existing.length >= MAX_SIGNALS_PER_DAY) {
    return { ok: false, error: 'daily_limit_reached', limit: MAX_SIGNALS_PER_DAY };
  }
  return { ok: true, list: [...existing, incoming], deduplicated: false };
}

// ---------------------------------------------------------------------------
// 讀取端：日 K 抽取（快速路徑，見檔首說明）
// ---------------------------------------------------------------------------

/** 從引號位置往回找 '[' 的最大距離（CompactBar 元組開頭緊鄰代號）。 */
const MAX_TUPLE_SCAN_BACK = 8;
/** 從引號位置往後找 ']' 的最大距離（6 個數字欄位，含千張成交量，寬鬆給 256）。 */
const MAX_TUPLE_SCAN_FORWARD = 256;

/**
 * 在 mkt:bars 原始字串中定位單一代號的 CompactBar 元組。
 *
 * 為什麼不用整包 JSON.parse：見檔首「快速抽取」。本函式只 JSON.parse 那 ~40 bytes
 * 的小陣列，成本約 0.05–0.1ms，比 parse 0.76MB 便宜一到兩個數量級。
 *
 * @param raw mkt:bars 的原始 JSON 字串
 * @param code 證券代號
 * @returns 抽到的五價一量（不含日期，由呼叫端補）；找不到或形狀不符回 null
 */
export function extractDailyBarFields(raw: string, code: string): Omit<DailyBar, 'date'> | null {
  // 代號在 JSON 裡一定是帶雙引號的字串（"2330"），且 StoredMarketDay 中
  // 除代號外沒有其他會被誤匹配的字串（date 為 'YYYY-MM-DD'、upstream 為 URL、
  // fetchedAt 為 ISO 時間戳，皆不可能等於 `"<代號>"`）。
  const needle = `"${code}"`;
  let from = 0;
  for (;;) {
    const at = raw.indexOf(needle, from);
    if (at < 0) return null;

    // 往回找 '['
    let open = -1;
    for (let i = at; i >= Math.max(0, at - MAX_TUPLE_SCAN_BACK); i -= 1) {
      if (raw[i] === '[') {
        open = i;
        break;
      }
    }
    // 往後找 ']'
    let close = -1;
    const limit = Math.min(raw.length - 1, at + MAX_TUPLE_SCAN_FORWARD);
    for (let i = at + needle.length - 1; i <= limit; i += 1) {
      if (raw[i] === ']') {
        close = i;
        break;
      }
    }
    if (open >= 0 && close > open) {
      const tuple = safeParseTuple(raw.slice(open, close + 1));
      if (tuple && String(tuple[0]) === code) {
        return {
          open: tuple[1],
          high: tuple[2],
          low: tuple[3],
          close: tuple[4],
          volumeLots: tuple[5],
        };
      }
    }
    // 找到但不是 valid 元組（例如代號字串出現在別處）→ 繼續找下一個出現位置
    from = at + needle.length;
  }
}

/** 解析 `["2330",o,h,l,c,v]`；形狀或數值不符回 null。 */
function safeParseTuple(text: string): [string, number, number, number, number, number] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 6) return null;
  const code = String(parsed[0]);
  const nums = [1, 2, 3, 4, 5].map((i) => Number(parsed[i]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return [code, nums[0], nums[1], nums[2], nums[3], nums[4]];
}

/**
 * 保底路徑：整包 JSON.parse 後掃描 twse / tpex 兩個陣列。
 * 僅在快速路徑「一個代號都沒抽到」時使用（正確性優先於效能）。
 */
function extractByFullParse(raw: string, codes: Set<string>): Map<string, Omit<DailyBar, 'date'>> {
  const found = new Map<string, Omit<DailyBar, 'date'>>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return found;
  }
  if (parsed === null || typeof parsed !== 'object') return found;
  const record = parsed as Record<string, unknown>;
  for (const market of ['twse', 'tpex'] as const) {
    const rows = record[market];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const code = String(row[0]);
      if (!codes.has(code) || found.has(code)) continue;
      const nums = [1, 2, 3, 4, 5].map((i) => Number(row[i]));
      if (nums.some((n) => !Number.isFinite(n))) continue;
      found.set(code, {
        open: nums[0],
        high: nums[1],
        low: nums[2],
        close: nums[3],
        volumeLots: nums[4],
      });
    }
  }
  return found;
}

/**
 * 讀取多個交易日的日 K，但**只抽出需要的代號**（快速路徑，見檔首）。
 *
 * 逐日**循序**讀取（非並行）以控制記憶體峰值：
 *   單日原始字串 ~0.76MB，若並行 40 天會同時持有 ~30MB。
 *
 * @param kv KV 綁定
 * @param dates 交易日 'YYYY-MM-DD'（升冪）
 * @param codes 需要的證券代號
 */
export async function loadBars(kv: SkynetKv, dates: string[], codes: string[]): Promise<BarLoadResult> {
  const index: BarIndex = new Map();
  const availableDates: string[] = [];
  const missingDates: string[] = [];
  if (dates.length === 0 || codes.length === 0) {
    return { index, availableDates, missingDates };
  }
  const wanted = new Set(codes);

  for (const date of dates) {
    let raw: string | null = null;
    try {
      raw = await kv.get(marketBarKey(date));
    } catch {
      raw = null; // KV 讀取失敗視同「該日無資料」，誠實列入 missingDates
    }
    if (raw === null || raw === undefined || raw === '') {
      missingDates.push(date);
      continue;
    }

    const perCode = new Map<string, DailyBar>();
    for (const code of wanted) {
      const fields = extractDailyBarFields(raw, code);
      if (fields) perCode.set(code, { date, ...fields });
    }
    // 保底：一個都沒抽到時，做一次整包 parse 確認（可能是快速路徑沒涵蓋的格式變體）。
    if (perCode.size === 0) {
      const fallback = extractByFullParse(raw, wanted);
      for (const [code, fields] of fallback) perCode.set(code, { date, ...fields });
    }

    if (perCode.size > 0) {
      index.set(date, perCode);
      availableDates.push(date);
    } else {
      missingDates.push(date);
    }
  }

  return { index, availableDates, missingDates };
}

/** 依日期清單從索引取出單一標的的日 K（升冪，只含有資料的日期）。 */
export function pickBars(index: BarIndex, dates: string[], code: string): DailyBar[] {
  const out: DailyBar[] = [];
  for (const date of dates) {
    const bar = index.get(date)?.get(code);
    if (bar) out.push(bar);
  }
  return out;
}

/**
 * 計算對帳視窗的交易日清單（訊號日**次日**起，避免前視偏誤）。
 * @param signalDateCompact 訊號日 'YYYYMMDD'
 * @param windowDays 視窗日曆天數
 * @param today 今天 'YYYY-MM-DD'（台北）；視窗末端不超過今天
 */
export function buildReconcileWindow(
  signalDateCompact: string,
  windowDays: number,
  today: string = todayTaipeiYmd(),
): { windowStart: string; windowEnd: string; scannedDates: string[] } | null {
  const dashed = compactToDashed(signalDateCompact);
  if (!dashed) return null;
  const start = shiftYmd(dashed, 1);
  const rawEnd = shiftYmd(dashed, windowDays);
  if (!start || !rawEnd) return null;
  // 視窗末端不超過今天（未來還沒發生，不可當成「取不到資料」）。
  const windowEnd = rawEnd < today ? rawEnd : today;
  const all = eachDateInRange(start, windowEnd);
  return {
    windowStart: start,
    windowEnd,
    scannedDates: all.filter((date) => isTradingDay(parseYmdToDate(date) ?? new Date())),
  };
}

// ---------------------------------------------------------------------------
// 對帳（純函式）
// ---------------------------------------------------------------------------

/** 百分比計算；分母無效回 null（絕不回 0）。 */
function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

/** 無條件捨去到小數第 2 位，供訊息顯示（不做四捨五入，避免看起來比實際漂亮）。 */
function floor2(value: number): number {
  return Math.floor(value * 100) / 100;
}

/**
 * 對帳單筆訊號。
 *
 * @param signal 原始訊號
 * @param bars 該標的在掃描區間內的日 K（升冪，只含有資料的日期）
 * @param ctx 視窗上下文
 */
export function evaluateSignal(
  signal: StoredSignal,
  bars: DailyBar[],
  ctx: ReconcileContext,
): ReconciledSignal {
  const base = {
    id: signal.id,
    ticker: signal.ticker,
    signal_date: signal.signal_date,
    entry_price: signal.entry_price,
    target_price: signal.target_price,
    stop_loss: signal.stop_loss,
    reason: signal.reason,
    invalid_condition: signal.invalid_condition,
    confidence: signal.confidence,
    source: signal.source,
    logged_at: signal.logged_at,
  };
  const firstBarDate = bars.length > 0 ? bars[0].date : null;
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const lastClose = lastBar ? lastBar.close : null;

  // ① 完全沒有日 K：誠實回 null，不當 0、不當虧損。
  if (bars.length === 0) {
    const notStarted = ctx.windowStart > ctx.today;
    return {
      ...base,
      outcome: null,
      outcome_reason: notStarted ? 'window_not_started' : 'no_bars_available',
      outcome_message: notStarted
        ? `對帳窗口尚未開始（${ctx.windowStart} 起），尚無任何可比對的日 K。`
        : `取不到 ${signal.ticker} 的日 K（窗口內 ${ctx.scannedDates.length} 個交易日皆無 mkt:bars，缺 ${ctx.missingDates.length} 天），無法判定結果；此處不做任何數字填補。`,
      resolved_date: null,
      bars_checked: 0,
      first_bar_date: null,
      last_bar_date: null,
      last_close: null,
      return_pct: null,
      unrealized_pct: null,
      window_exhausted: false,
    };
  }

  // ② 逐日判定（升冪，先發生者先定勝負）
  for (const bar of bars) {
    const hitTarget = bar.high >= signal.target_price;
    const hitStop = bar.low <= signal.stop_loss;

    if (hitTarget && hitStop) {
      // 單日 K 棒無盤中先後順序 → 誠實標「無法判定」，不選邊、不捏造。
      return {
        ...base,
        outcome: 'ambiguous',
        outcome_reason: 'both_touched_same_day',
        outcome_message: `${bar.date} 當日高低點同時跨越目標價 ${signal.target_price} 與停損價 ${signal.stop_loss}（高 ${bar.high} / 低 ${bar.low}），日 K 無盤中先後順序，無法判定勝負，故不計入勝率。`,
        resolved_date: bar.date,
        bars_checked: bars.length,
        first_bar_date: firstBarDate,
        last_bar_date: bar.date,
        last_close: bar.close,
        return_pct: null,
        unrealized_pct: pctChange(signal.entry_price, bar.close),
        window_exhausted: false,
      };
    }

    if (hitTarget) {
      return {
        ...base,
        outcome: 'win',
        outcome_reason: 'target_touched',
        outcome_message: `${bar.date} 最高 ${bar.high} 觸及目標價 ${signal.target_price}（進場 ${signal.entry_price}）。`,
        resolved_date: bar.date,
        bars_checked: bars.length,
        first_bar_date: firstBarDate,
        last_bar_date: bar.date,
        last_close: bar.close,
        return_pct: pctChange(signal.entry_price, signal.target_price),
        unrealized_pct: null,
        window_exhausted: false,
      };
    }

    if (hitStop) {
      return {
        ...base,
        outcome: 'loss',
        outcome_reason: 'stop_touched',
        outcome_message: `${bar.date} 最低 ${bar.low} 觸及停損價 ${signal.stop_loss}（進場 ${signal.entry_price}）。`,
        resolved_date: bar.date,
        bars_checked: bars.length,
        first_bar_date: firstBarDate,
        last_bar_date: bar.date,
        last_close: bar.close,
        return_pct: pctChange(signal.entry_price, signal.stop_loss),
        unrealized_pct: null,
        window_exhausted: false,
      };
    }
  }

  // ③ 都沒觸及 → open。窗口已走完者明說「走完」，避免看起來像「還在載入」。
  const exhausted = ctx.windowEnd <= ctx.today;
  return {
    ...base,
    outcome: 'open',
    outcome_reason: exhausted ? 'window_exhausted' : 'no_resolution_yet',
    outcome_message: exhausted
      ? `對帳窗口 ${ctx.windowDays} 天已完整走完（${ctx.windowStart}–${ctx.windowEnd}），目標價與停損價皆未觸及，尚未結算。`
      : `截至 ${lastBar?.date ?? ctx.windowEnd}（最新收盤 ${lastClose ?? '—'}）尚未觸及目標價 ${signal.target_price} 或停損價 ${signal.stop_loss}，尚未結算。`,
    resolved_date: null,
    bars_checked: bars.length,
    first_bar_date: firstBarDate,
    last_bar_date: lastBar?.date ?? null,
    last_close: lastClose,
    return_pct: null,
    unrealized_pct: lastClose === null ? null : pctChange(signal.entry_price, lastClose),
    window_exhausted: exhausted,
  };
}

// ---------------------------------------------------------------------------
// 統計（純函式）
// ---------------------------------------------------------------------------

/**
 * 由對帳結果計算統計。
 *
 * 誠實規則（本專案鐵律，不可為了好看省略）：
 *   - 已結算 0 筆 → win_rate / avg_return_pct / max_drawdown_pct 一律 **null**（不是 0）。
 *   - 已結算 < SAMPLE_SUFFICIENT_MIN(30) → sample_sufficient:false + 說明
 *     「樣本不足，不足以判斷勝率」。
 *   - ambiguous（同日雙觸）不計入勝率分子與分母；unresolved（無日 K）同理。
 */
export function computeStats(records: ReconciledSignal[]): SignalStats {
  let win = 0;
  let loss = 0;
  let ambiguous = 0;
  let open = 0;
  let unresolved = 0;

  /** 已結算（win/loss）的報酬率，依結算日排序後供平均與回撤計算。 */
  const settled: { sortKey: string; returnPct: number }[] = [];

  for (const record of records) {
    if (record.outcome === 'win') win += 1;
    else if (record.outcome === 'loss') loss += 1;
    else if (record.outcome === 'ambiguous') ambiguous += 1;
    else if (record.outcome === 'open') open += 1;
    else unresolved += 1;

    if ((record.outcome === 'win' || record.outcome === 'loss') && record.return_pct !== null) {
      settled.push({
        sortKey: `${record.resolved_date ?? '9999-99-99'}|${record.signal_date}|${record.id}`,
        returnPct: record.return_pct,
      });
    }
  }

  const settledCount = win + loss;
  const sampleSufficient = settledCount >= SAMPLE_SUFFICIENT_MIN;
  const winRate = settledCount > 0 ? (win / settledCount) * 100 : null;

  let sampleNote: string;
  if (settledCount === 0) {
    sampleNote = '尚無已結算樣本，無法計算勝率（此處不回傳 0，0 會被誤讀為「勝率 0%」）。';
  } else if (!sampleSufficient) {
    sampleNote = `樣本不足，不足以判斷勝率：目前已結算 ${settledCount} 筆，需達 ${SAMPLE_SUFFICIENT_MIN} 筆。此數字僅供累積紀錄，不可作為策略有效性結論。`;
  } else {
    sampleNote = `已結算 ${settledCount} 筆，達樣本門檻 ${SAMPLE_SUFFICIENT_MIN} 筆，勝率可供參考（仍應搭配平均報酬與最大回撤一併判讀）。`;
  }

  let avgReturnPct: number | null = null;
  let maxDrawdownPct: number | null = null;
  if (settled.length > 0) {
    settled.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
    const sum = settled.reduce((acc, item) => acc + item.returnPct, 0);
    avgReturnPct = sum / settled.length;

    // 累積報酬曲線的最大回撤（峰到谷，負值）。
    let cumulative = 0;
    let peak = 0;
    let worst = 0;
    for (const item of settled) {
      cumulative += item.returnPct;
      if (cumulative > peak) peak = cumulative;
      const drawdown = cumulative - peak;
      if (drawdown < worst) worst = drawdown;
    }
    maxDrawdownPct = worst;
  }

  return {
    total_signals: records.length,
    settled_signals: settledCount,
    win_count: win,
    loss_count: loss,
    ambiguous_count: ambiguous,
    open_count: open,
    unresolved_count: unresolved,
    win_rate: winRate,
    sample_sufficient: sampleSufficient,
    sample_note: sampleNote,
    avg_return_pct: avgReturnPct,
    max_drawdown_pct: maxDrawdownPct,
  };
}

// ---------------------------------------------------------------------------
// KV：列出有訊號的日期
// ---------------------------------------------------------------------------

/** 具備 list 能力的 KV（Cloudflare KV Namespace 的 list 最小介面）。 */
export type SkynetKvWithList = SkynetKv & {
  list?: (options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }) => Promise<{ keys: { name: string }[]; list_complete?: boolean; cursor?: string }>;
};

/**
 * 列出 `signal:log:` 下已累積的訊號日（升冪 'YYYYMMDD'）。
 *
 * ⚠ Free plan 的 list 次數配額最稀缺，故統計端優先吃 from/to，只有沒給區間才會呼叫本函式。
 * 綁定不支援 list 時回 null（呼叫端據此優雅降級並要求帶 from/to）。
 */
export async function listSignalLogDates(kv: SkynetKv, limit = MAX_STATS_SIGNAL_DAYS): Promise<string[] | null> {
  const kvWithList = kv as SkynetKvWithList;
  if (typeof kvWithList.list !== 'function') return null;
  const dates: string[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 20; page += 1) {
      const res = await kvWithList.list({ prefix: SIGNAL_LOG_KV_PREFIX, limit: 1000, cursor });
      for (const key of res?.keys ?? []) {
        const date = key.name.slice(SIGNAL_LOG_KV_PREFIX.length);
        if (/^\d{8}$/.test(date)) dates.push(date);
      }
      if (res?.list_complete !== false || !res?.cursor) break;
      cursor = res.cursor;
      if (dates.length >= limit) break;
    }
  } catch {
    return null;
  }
  dates.sort();
  return dates.slice(0, limit);
}
