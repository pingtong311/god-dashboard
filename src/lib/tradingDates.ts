/**
 * src/lib/tradingDates.ts
 * ────────────────────────────────────────────────────────────────────────────
 * 近期交易日清單（供前端日期切換器下拉選單使用）。
 *
 * 為什麼要獨立成 lib（務必先讀懂）：
 *   原本 `/api/skynet/trading-dates` 在**請求時**做兩件昂貴的事：
 *     1. `resolveLatestTradingDate()` —— 探測 TWSE openapi 再逐日回推；
 *     2. 為了湊滿 count 個交易日，對每個候選日呼叫 `loadMarketOverview(candidate)`
 *        —— 每次是 TWSE MI_INDEX（4.8MB）＋ T86（2.17MB）兩發上游。
 *   最多 61 次上游抓取，2026-10-04 實測 **12.9 秒**；且在 Cloudflare Free plan
 *   的 10ms CPU 上限下會**間歇性** 503 `error code: 1102`（isolate 冷啟動時爆表，
 *   暖機時僥倖通過 —— 這種「有時好有時壞」最難查）。
 *
 *   ⇒ 交易日清單一天最多變一次，是**離線預算**的完美對象：
 *     本機算好寫進 KV，邊緣端只讀一個 key。
 *
 * ⚠ 這個端點與其他 P1 端點不同：它的 payload 只有幾百 bytes，因此**允許在邊緣端
 *   解析**（見下方 `MAX_PARSE_BYTES` 的說明）。「邊緣零解析」規則的目的是避免
 *   解析 MB 級 JSON，不是禁止一切 `JSON.parse`。
 *
 * KV key：`scan:trading-dates`（單一 key，存「最多 60 筆」的母清單）。
 *   route 依 `count` 從母清單切片 → 一個 key 支援所有 count，不必為每個 count 各存一份。
 */

import { buildTradingDayWindow, parseYmdToDate, todayTaipeiYmd } from '@/lib/marketBars';

/** `count` 上限（與 route 既有行為一致）。 */
export const MAX_TRADING_DATES = 60;

/** `count` 預設值（與 route 既有行為一致）。 */
export const DEFAULT_TRADING_DATES_COUNT = 30;

/** 母清單的 KV key（單一 key，含最多 `MAX_TRADING_DATES` 筆）。 */
export const TRADING_DATES_KV_KEY = 'scan:trading-dates';

/**
 * 允許在邊緣端解析的 payload 大小上限（bytes）。
 *
 * 算術（2026-10-04 實測）：
 *   - Free plan CPU 上限 10ms；OpenNext 執行期初始化 ＋ 一次 KV 讀取的地板值 **7ms**。
 *   - 母清單 60 筆日期 ≈ 60 × 12 bytes ≈ **720 bytes**。
 *   - `JSON.parse` ＋ `slice` ＋ `JSON.stringify` 處理 720 bytes 約 **0.2–0.4ms**。
 *   ⇒ 7ms + 0.4ms = 7.4ms，安全落在 10ms 內。
 *
 * 這個常數是**防禦性**的：若未來有人把母清單撐大（例如改成存全市場代號），
 * 解析成本會線性上升並再度撞上 1102。與其等到線上爆掉，不如在讀到過大的值時
 * **直接拒絕解析**並回 `ready:false`。
 */
export const MAX_PARSE_BYTES = 4 * 1024;

/** 母清單的形狀（KV 內存的就是這個物件的序列化結果）。 */
export type TradingDatesList = { ok: true; dates: string[] };

/** 端點回應形狀（與既有 route 完全一致）。 */
export type TradingDatesPayload = { ok: true; dates: string[]; current: string };

/** `'YYYYMMDD'` → `'YYYY-MM-DD'`；長度不符時原樣回傳（不猜）。 */
export function ymdToDashed(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 正規化 `count` 查詢參數。
 *
 * @returns 合法則回 1..`MAX_TRADING_DATES` 的整數；非法（非數字／< 1）回 `null`，
 *          由呼叫端決定要回 400 還是用預設值。
 *
 * ⚠ 與既有 route 的差異：原實作用 `Math.min(parseInt(x,10), 60)`，`count=0` 或負數
 *   會落到 `count < 1` 的 400 分支；這裡保持一致。
 */
export function normalizeTradingDatesCount(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return DEFAULT_TRADING_DATES_COUNT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, MAX_TRADING_DATES);
}

/**
 * 由母清單切出 `count` 筆並組出端點回應。
 *
 * @param allDescending 母清單（**由新到舊**，`'YYYY-MM-DD'`）
 * @param count         要回幾筆
 */
export function buildTradingDatesPayload(
  allDescending: string[],
  count: number,
): TradingDatesPayload {
  const dates = allDescending.slice(0, count);
  return { ok: true, dates, current: dates[0] ?? '' };
}

/**
 * 組母清單：最近 `MAX_TRADING_DATES` 個交易日，**由新到舊**（`'YYYY-MM-DD'`）。
 *
 * 為什麼是「由新到舊」：前端下拉選單第一個要顯示最新日期，route 的
 * `current: dates[0]` 也依賴這個順序。`buildTradingDayWindow` 回的是升冪
 * （最舊→最新），故在此反轉一次。
 *
 * ⚠ 這是**純日曆計算**（weekday ＋ 專案休市表），不打上游。這與
 *   `mkt:bars:` 回填、pattern-screen／swing-hub 用的是**同一份日曆**
 *   （`isTradingDay`），因此清單與「哪些日期真的有資料」天然一致。
 *
 * @param endYmd 視窗結束日 `'YYYYMMDD'`；省略時用台北今天
 * @param count  要幾個交易日
 */
export function buildTradingDatesList(
  endYmd?: string,
  count: number = MAX_TRADING_DATES,
): string[] {
  const ymd = endYmd && /^\d{8}$/.test(endYmd) ? endYmd : todayTaipeiYmd();
  const end = parseYmdToDate(ymd);
  if (!end) return [];
  return buildTradingDayWindow(end, count).map(ymdToDashed).reverse();
}

/**
 * 從 KV 母清單文字安全取出日期陣列。
 *
 * 三層防線（任一不過即回 `null`，**絕不半信半疑地用**）：
 *   1. 長度超過 `MAX_PARSE_BYTES` → 拒解析（見該常數的算術說明）。
 *   2. `JSON.parse` 失敗 → 回 `null`。
 *   3. 形狀不符（不是物件／`dates` 不是字串陣列）→ 回 `null`。
 *
 * 回傳值已過濾成「只保留 `'YYYY-MM-DD'` 格式」的元素，避免上游污染值混進來。
 */
export function parseTradingDatesList(text: string): string[] | null {
  if (text.length > MAX_PARSE_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const dates = (parsed as { dates?: unknown }).dates;
  if (!Array.isArray(dates)) return null;
  return dates.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
}
