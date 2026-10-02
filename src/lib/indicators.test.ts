/**
 * God 指標計算函式單元測試
 * 測試 calculateEMA 的核心行為
 */

import { calculateEMA } from './indicators';

describe('calculateEMA', () => {
  // ── 邊界條件 ──────────────────────────────────────────────────────────────

  it('空陣列回傳空陣列', () => {
    expect(calculateEMA([], 5)).toEqual([]);
  });

  it('period <= 0 回傳空陣列', () => {
    expect(calculateEMA([1, 2, 3], 0)).toEqual([]);
    expect(calculateEMA([1, 2, 3], -1)).toEqual([]);
  });

  it('資料長度小於 period 時全部回傳 null', () => {
    const result = calculateEMA([1, 2, 3], 5);
    expect(result).toHaveLength(3);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it('資料長度等於 period 時只有最後一個非 null（SMA 種子值）', () => {
    // period=3, data=[1,2,3] → SMA = 2
    const result = calculateEMA([1, 2, 3], 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 10);
  });

  // ── 前 period-1 個位置為 null ─────────────────────────────────────────────

  it('前 period-1 個位置回傳 null', () => {
    const result = calculateEMA([10, 20, 30, 40, 50], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).not.toBeNull();
  });

  // ── SMA 種子值（warm-up）─────────────────────────────────────────────────

  it('第 period 個位置（index = period-1）為前 period 個值的 SMA', () => {
    // data = [10, 20, 30, 40, 50], period = 3
    // SMA(10,20,30) = 20
    const result = calculateEMA([10, 20, 30, 40, 50], 3);
    expect(result[2]).toBeCloseTo(20, 10);
  });

  it('period=5 時種子值為前 5 個值的 SMA', () => {
    // SMA(1,2,3,4,5) = 3
    const result = calculateEMA([1, 2, 3, 4, 5, 6, 7], 5);
    expect(result[4]).toBeCloseTo(3, 10);
  });

  // ── 遞推公式驗證 ──────────────────────────────────────────────────────────

  it('遞推公式：EMA(t) = close(t) × k + EMA(t-1) × (1-k)', () => {
    // period=3, k = 2/(3+1) = 0.5
    // data = [10, 20, 30, 40, 50]
    // EMA[2] = SMA(10,20,30) = 20
    // EMA[3] = 40 × 0.5 + 20 × 0.5 = 30
    // EMA[4] = 50 × 0.5 + 30 × 0.5 = 40
    const result = calculateEMA([10, 20, 30, 40, 50], 3);
    expect(result[3]).toBeCloseTo(30, 10);
    expect(result[4]).toBeCloseTo(40, 10);
  });

  it('period=2 時 k=2/3，遞推計算正確', () => {
    // k = 2/(2+1) = 2/3
    // data = [1, 2, 3, 4]
    // EMA[1] = SMA(1,2) = 1.5
    // EMA[2] = 3 × (2/3) + 1.5 × (1/3) = 2 + 0.5 = 2.5
    // EMA[3] = 4 × (2/3) + 2.5 × (1/3) = 8/3 + 5/6 = 16/6 + 5/6 = 21/6 = 3.5
    const result = calculateEMA([1, 2, 3, 4], 2);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeCloseTo(1.5, 10);
    expect(result[2]).toBeCloseTo(2.5, 10);
    expect(result[3]).toBeCloseTo(3.5, 10);
  });

  // ── 輸出長度與輸入相同 ────────────────────────────────────────────────────

  it('輸出陣列長度與輸入相同', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = calculateEMA(data, 3);
    expect(result).toHaveLength(data.length);
  });

  // ── 不拋出例外 ────────────────────────────────────────────────────────────

  it('不拋出例外（各種邊界輸入）', () => {
    expect(() => calculateEMA([], 0)).not.toThrow();
    expect(() => calculateEMA([1], 1)).not.toThrow();
    expect(() => calculateEMA([1, 2], 10)).not.toThrow();
  });
});
