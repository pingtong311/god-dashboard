/**
 * God 指標計算函式 — Property-Based Tests
 * 使用 fast-check + Jest
 *
 * **Validates: Requirements 2.1, 2.2, 2.4, 2.7**
 */

import * as fc from 'fast-check';
import {
  calculateMACD,
  calculateKD,
  calculateBollingerBands,
} from '../lib/indicators';

// ─── Property 3：MACD 輸出陣列長度一致性 ────────────────────────────────────
// **Validates: Requirements 2.1, 2.7**

describe('Property 3：MACD 輸出陣列長度一致性', () => {
  it('對任意長度 ≥ 1 的 closes 陣列，dif/signal/hist 長度必須與輸入相同', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 1,
          maxLength: 200,
        }),
        (closes) => {
          const result = calculateMACD(closes);
          return (
            result.dif.length === closes.length &&
            result.signal.length === closes.length &&
            result.hist.length === closes.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('使用自訂週期時，輸出長度仍與輸入相同', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 1,
          maxLength: 200,
        }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 11, max: 30 }),
        fc.integer({ min: 1, max: 15 }),
        (closes, fast, slow, signal) => {
          const result = calculateMACD(closes, fast, slow, signal);
          return (
            result.dif.length === closes.length &&
            result.signal.length === closes.length &&
            result.hist.length === closes.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4：KD 值域限制 ────────────────────────────────────────────────
// **Validates: Requirements 2.2, 2.7**

describe('Property 4：KD 值域限制', () => {
  /**
   * 產生有效的 OHLCV 資料：
   * - high >= low
   * - close 在 [low, high] 範圍內
   */
  const validOHLCVArray = fc.array(
    fc
      .tuple(
        fc.float({ min: 1, max: 9000, noNaN: true }),  // low base
        fc.float({ min: 0, max: 1000, noNaN: true }),  // spread (high - low)
        fc.float({ min: 0, max: 1, noNaN: true })      // close ratio in [0,1]
      )
      .map(([base, spread, ratio]) => {
        const low = base;
        const high = base + spread;
        const close = low + ratio * spread;
        return { high, low, close };
      }),
    { minLength: 1, maxLength: 100 }
  );

  it('所有非 null K 值必須在 [0, 100] 範圍內', () => {
    fc.assert(
      fc.property(validOHLCVArray, (candles) => {
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const closes = candles.map((c) => c.close);

        const result = calculateKD(highs, lows, closes);

        return result.k.every(
          (v) => v === null || (v >= 0 && v <= 100)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('所有非 null D 值必須在 [0, 100] 範圍內', () => {
    fc.assert(
      fc.property(validOHLCVArray, (candles) => {
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const closes = candles.map((c) => c.close);

        const result = calculateKD(highs, lows, closes);

        return result.d.every(
          (v) => v === null || (v >= 0 && v <= 100)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('high === low 時（RSV=50），K 與 D 仍在 [0, 100] 範圍內', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({ min: 1, max: 9000, noNaN: true }).map((price) => ({
            high: price,
            low: price,
            close: price,
          })),
          { minLength: 9, maxLength: 50 }
        ),
        (candles) => {
          const highs = candles.map((c) => c.high);
          const lows = candles.map((c) => c.low);
          const closes = candles.map((c) => c.close);

          const result = calculateKD(highs, lows, closes);

          return (
            result.k.every((v) => v === null || (v >= 0 && v <= 100)) &&
            result.d.every((v) => v === null || (v >= 0 && v <= 100))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5：Bollinger Bands 上中下軌順序 ────────────────────────────────
// **Validates: Requirements 2.4**

describe('Property 5：Bollinger Bands 上軌 ≥ 中軌 ≥ 下軌', () => {
  it('對任意長度 ≥ 20 的 closes 陣列，所有非 null 值必須滿足 upper ≥ middle ≥ lower', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 20,
          maxLength: 200,
        }),
        (closes) => {
          const result = calculateBollingerBands(closes);

          for (let i = 0; i < closes.length; i++) {
            const u = result.upper[i];
            const m = result.middle[i];
            const l = result.lower[i];

            // 若任一為 null，三者應同為 null（前 period-1 個位置）
            if (u === null || m === null || l === null) {
              if (u !== null || m !== null || l !== null) return false;
              continue;
            }

            // 非 null 時必須滿足 upper >= middle >= lower
            if (!(u >= m && m >= l)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('使用自訂 multiplier 時，上中下軌順序仍成立', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 20,
          maxLength: 200,
        }),
        fc.float({ min: 0.5, max: 5, noNaN: true }),
        (closes, multiplier) => {
          const result = calculateBollingerBands(closes, 20, multiplier);

          for (let i = 0; i < closes.length; i++) {
            const u = result.upper[i];
            const m = result.middle[i];
            const l = result.lower[i];

            if (u === null || m === null || l === null) continue;

            if (!(u >= m && m >= l)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7：資料不足時指標回傳 null 而非拋出錯誤 ────────────────────────
// **Validates: Requirements 2.7**

describe('Property 7：資料不足時指標回傳 null 而非拋出錯誤', () => {
  // MACD 最小週期 = slowPeriod + signalPeriod - 1 = 26 + 9 - 1 = 34
  // 但實際上只要 closes.length < slowPeriod(26)，dif 全為 null
  // 更嚴格：closes.length < slowPeriod 時，dif/signal/hist 全為 null

  it('calculateMACD：輸入長度 < 26 時，dif/signal/hist 全為 null，不拋出例外', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 1,
          maxLength: 25,
        }),
        (closes) => {
          let result: ReturnType<typeof calculateMACD> | undefined;
          expect(() => {
            result = calculateMACD(closes);
          }).not.toThrow();

          // 資料不足 slowPeriod(26) 時，dif 全為 null
          // 因此 signal 與 hist 也全為 null
          return (
            result!.dif.every((v: number | null) => v === null) &&
            result!.signal.every((v: number | null) => v === null) &&
            result!.hist.every((v: number | null) => v === null)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateKD：輸入長度 < 9（預設 period）時，k/d 全為 null，不拋出例外', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 1,
          maxLength: 8,
        }),
        (prices) => {
          let result: ReturnType<typeof calculateKD> | undefined;
          expect(() => {
            result = calculateKD(prices, prices, prices);
          }).not.toThrow();

          return (
            result!.k.every((v: number | null) => v === null) &&
            result!.d.every((v: number | null) => v === null)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateBollingerBands：輸入長度 < 20（預設 period）時，upper/middle/lower 全為 null，不拋出例外', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 1, max: 10000, noNaN: true }), {
          minLength: 1,
          maxLength: 19,
        }),
        (closes) => {
          let result: ReturnType<typeof calculateBollingerBands> | undefined;
          expect(() => {
            result = calculateBollingerBands(closes);
          }).not.toThrow();

          return (
            result!.upper.every((v: number | null) => v === null) &&
            result!.middle.every((v: number | null) => v === null) &&
            result!.lower.every((v: number | null) => v === null)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('空陣列輸入時，所有指標不拋出例外', () => {
    expect(() => calculateMACD([])).not.toThrow();
    expect(() => calculateKD([], [], [])).not.toThrow();
    expect(() => calculateBollingerBands([])).not.toThrow();
  });
});
