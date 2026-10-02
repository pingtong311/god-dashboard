/**
 * God K 線圖查看器 — 「上上升勢」判定（純函數，可單測）
 *
 * 規格來源：`screens/chart.md` §2「上上升勢指示器」：
 * - 「上上升勢」：連續出現兩根以上的「上升趨勢」K線
 *   （K線連續兩根收在均線/趨勢線之上），表示該價格區間已轉為「上升趨勢區間」。
 * - 說明文字：「上方列表：上升K線數 ≥ 4 的股票；點任一檔可看它的K線走勢與上升趨勢區間。」
 *
 * 設計原則：
 * - 純函數、不造假：所有數值（收盤/最高/最低/均線/前收/漲跌/漲%/量比）皆從
 *   傳入的 K 線序列計算，缺資料（< 2 根、無前收）回 null。
 * - 「收在均線上」判定：均線（MA，預設用 SMA20）存在時 close > ma；
 *   均線尚未形成（前 19 根）時退回「收在前收之上」（close > prevClose）。
 * - 上升K線數：連續收在均線/趨勢線之上的 K 棒數，**從最舊端往最新端掃**，
 *   回傳最新一段連續上升 K 棒（以最新一根結尾）的長度。
 * - 量比：收量 / 前 5 根均量（前 5 根不含當根）；前 5 根均量為 0 或無資料時 null。
 */

/** 判定所需的最小 K 線欄位（與 types/kline 的 ChartCandle 相容）。 */
export interface UptrendCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 該根當下的均線值（如 SMA20）；前 period-1 根為 null。 */
  ma?: number | null;
}

export interface UptrendSample {
  /** 該檔的上升K線數（最新一段連續收在均線/趨勢線之上的 K 棒數）。 */
  upCandleCount: number;
  /** 上升K線數是否達標（≥ 門檻，預設 4）。 */
  meetsThreshold: boolean;
  /** 收盤（最新一根）。 */
  close: number;
  /** 最高（最新一根）。 */
  high: number;
  /** 最低（最新一根）。 */
  low: number;
  /** 均線（最新一根的 MA）；無值時 null。 */
  ma: number | null;
  /** 均線收在：均線之上/之下的收盤（最新一根的收盤）。 */
  closeAboveMa: number | null;
  /** 前收；無前一根時 null。 */
  prevClose: number | null;
  /** 漲跌（收 - 前收）；無前收時 null。 */
  change: number | null;
  /** 漲%（漲跌/前收×100）；無前收或前收為 0 時 null。 */
  changePercent: number | null;
  /** 量比（收量/前5根均量）；均量為 0 或無資料時 null。 */
  volumeRatio: number | null;
}

/** 判定參數。 */
export interface UptrendOptions {
  /** 列出該檔需要的「上升K線數」門檻（預設 4，對應 chart.md「上升K線數 ≥ 4」）。 */
  minUpCandles?: number;
}

/** 單一檔的上升K線數 + 是否達標（列表用）。 */
export interface UptrendStatus {
  upCandleCount: number;
  meetsThreshold: boolean;
}

/**
 * 回傳「最新一段」連續收在均線/趨勢線之上的 K 棒數。
 * 序列必須以最新一根結尾；若最新一根不在上升區間，回傳 0。
 * 資料 < 2 根時回傳 0。
 */
export function countConsecutiveUpCandles(candles: UptrendCandle[]): number {
  if (candles.length < 2) return 0;

  const isUp = (i: number): boolean => {
    const c = candles[i];
    if (!Number.isFinite(c.close)) return false;
    // 均線存在 → 以「收在均線之上」為準；均線尚未形成 → 退回「收在前收之上」。
    if (c.ma != null && Number.isFinite(c.ma)) {
      return c.close > c.ma;
    }
    const prev = candles[i - 1];
    return prev ? c.close > prev.close : false;
  };

  if (!isUp(candles.length - 1)) return 0;

  let count = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (!isUp(i)) break;
    count++;
  }
  return count;
}

/** 計算單一檔的上升K線數與是否達標（列表「上升K線數 ≥ 4」判定）。 */
export function detectUptrendStatus(
  candles: UptrendCandle[],
  minUpCandles: number = 4
): UptrendStatus {
  const upCandleCount = countConsecutiveUpCandles(candles);
  return { upCandleCount, meetsThreshold: upCandleCount >= minUpCandles };
}

/** 由 K 線序列計算整份「上上升勢」表列數值（純函數，不造假）。 */
export function buildUptrendSample(
  candles: UptrendCandle[],
  options: UptrendOptions = {}
): UptrendSample | null {
  const { minUpCandles = 4 } = options;

  // 資料不足（需要最新一根 + 前一根才算漲跌/前收）→ 回 null。
  if (candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const prevClose: number | null =
    Number.isFinite(prev.close) ? prev.close : null;

  const change: number | null =
    prevClose != null ? last.close - prevClose : null;

  const changePercent: number | null =
    prevClose != null && prevClose !== 0
      ? ((last.close - prevClose) / prevClose) * 100
      : null;

  // 量比：收量 / 前 5 根均量（前 5 根不含當根）。
  const windowEnd = candles.length - 1; // 不含最後一根
  const windowStart = Math.max(0, windowEnd - 5);
  const prevWindow = candles.slice(windowStart, windowEnd);
  const avgPrevVolume =
    prevWindow.length > 0
      ? prevWindow.reduce((acc, c) => acc + (Number.isFinite(c.volume) ? c.volume : 0), 0) /
        prevWindow.length
      : 0;
  const volumeRatio: number | null =
    Number.isFinite(last.volume) && avgPrevVolume > 0
      ? last.volume / avgPrevVolume
      : null;

  const upCandleCount = countConsecutiveUpCandles(candles);
  const meetsThreshold = upCandleCount >= minUpCandles;

  const sample: UptrendSample = {
    upCandleCount,
    meetsThreshold,
    close: last.close,
    high: last.high,
    low: last.low,
    ma: last.ma != null && Number.isFinite(last.ma) ? last.ma : null,
    closeAboveMa: last.close,
    prevClose,
    change,
    changePercent,
    volumeRatio,
  };

  return sample;
}

/** 取整份序列中「最新一段」連續上升 K 棒（上升趨勢區間）。 */
export function latestUptrendInterval(candles: UptrendCandle[]): UptrendCandle[] {
  if (candles.length < 2) return [];
  const count = countConsecutiveUpCandles(candles);
  if (count === 0) return [];
  return candles.slice(candles.length - count);
}
