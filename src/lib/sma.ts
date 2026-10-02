/**
 * God K 線圖查看器 — SMA（簡單移動平均線）計算
 */

/**
 * 計算簡單移動平均線（Simple Moving Average）
 *
 * @param data    收盤價陣列（時間順序，最舊在前）
 * @param period  週期（例如 5, 10, 20, 60）
 * @returns       SMA 陣列，前 period-1 個元素為 null，
 *                索引 i >= period-1 的元素為 data[i-period+1] 到 data[i] 的算術平均值
 *
 * @example
 * calculateSMA([1, 2, 3, 4, 5], 3)
 * // => [null, null, 2, 3, 4]
 */
export function calculateSMA(data: number[], period: number): (number | null)[] {
  if (period <= 0 || !Number.isFinite(period)) {
    return data.map(() => null);
  }

  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / period;
  });
}
