/**
 * signalEngine 純函式測試（技術分析引擎）
 * ----------------------------------------------------------------------------
 * 鐵律：資料不足時一律回 null，絕不補 0 或幻造數字。本測試逐一驗證：
 *   - sma/ema：前方不足期數為 null、期數內為平均、等長輸出。
 *   - rsi：Wilder 平滑、全漲 100、不足 null。
 *   - macd：DIF＝EMA12−EMA26、DEA 為 DIF 的 EMA9、hist＝2×(DIF−DEA)。
 *   - bollinger：中軌＝SMA20、上/下軌＝中軌±2σ。
 *   - volumeRatio/level20：窗口不足回 null。
 *   - supportResistance/poc/fibonacci：轉折點與分箱行為。
 *   - analyze：端到端整合，空陣列不炸。
 */

import {
  analyze,
  bollinger,
  ema,
  fibonacci,
  fmtNum,
  fmtPct,
  level20,
  macd,
  poc,
  rsi,
  rsiSeries,
  sma,
  supportResistance,
  volumeRatio,
  type Candle,
} from './signalEngine';

/** 產生 n 根收盤的合成序列（i+1 線性上升，方便預測平均）。 */
function lineCloses(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** 產生 n 栀 K 線（open=close=high=low=i+1，volume 固定 100）。 */
function lineCandles(n: number): Candle[] {
  return lineCloses(n).map((v) => ({
    date: `2026-01-${String(v).padStart(2, '0')}`,
    open: v,
    high: v,
    low: v,
    close: v,
    volume: 100,
  }));
}

/** 產生 n 根「全程同一價位」的 K 線（high===low，用來測不除以零）。 */
function flatCandles(n: number, price: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 100,
  }));
}

describe('signalEngine：移動平均', () => {
  it('sma：不足期數為 null，其後為視窗平均', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it('sma：空序列與 period 大於長度皆為全 null', () => {
    expect(sma([], 3)).toEqual([]);
    expect(sma([1, 2], 3)).toEqual([null, null]);
  });

  it('ema：種子為前 period 個 SMA，其後逐步加權', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 6);
    // k = 2/(3+1) = 0.5：prev = 2 → 4*0.5 + 2*0.5 = 3
    expect(out[3]).toBeCloseTo(3, 6);
    expect(out[4]).toBeCloseTo(4, 6);
  });

  it('ema：長度不足回全 null 且等長', () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });
});

describe('signalEngine：RSI', () => {
  it('全漲序列 RSI 為 100', () => {
    expect(rsi(lineCloses(30))).toBe(100);
  });

  it('全跌序列 RSI 為 0', () => {
    const closes = lineCloses(30).reverse();
    expect(rsi(closes)).toBeCloseTo(0, 6);
  });

  it('資料不足回 null', () => {
    expect(rsi(lineCloses(14))).toBeNull();
    expect(rsi([])).toBeNull();
  });

  it('rsiSeries：等長、前方為 null、末值等於 rsi()', () => {
    const closes = lineCloses(40);
    const series = rsiSeries(closes);
    expect(series).toHaveLength(closes.length);
    // out[period] 才是第一個非 null（index 0..13 皆 null）
    expect(series.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(series[series.length - 1]).toBeCloseTo(rsi(closes) as number, 6);
  });
});

describe('signalEngine：MACD', () => {
  it('DIF＝EMA12−EMA26，hist＝2×(DIF−DEA)', () => {
    const closes = lineCloses(60);
    const { dif, dea, hist } = macd(closes);
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    const last = closes.length - 1;
    expect(dif[dif.length - 1]).toBeCloseTo(
      (e12[last] as number) - (e26[last] as number),
      6,
    );
    expect(hist[hist.length - 1]).toBeCloseTo(
      (dif[dif.length - 1] - dea[dea.length - 1]) * 2,
      6,
    );
  });

  it('長度不足時 DIF/DEA/hist 為空陣列（不炸）', () => {
    const { dif, dea, hist } = macd(lineCloses(5));
    expect(dif).toHaveLength(0);
    expect(dea).toHaveLength(0);
    expect(hist).toHaveLength(0);
  });
});

describe('signalEngine：布林、量比、位階', () => {
  it('bollinger：中軌＝SMA20，上下軌對稱', () => {
    const closes = lineCloses(30);
    const { mid, upper, lower } = bollinger(closes);
    const m20 = sma(closes, 20);
    const last = closes.length - 1;
    expect(mid[last]).toBeCloseTo(m20[last] as number, 6);
    expect(upper[last]).toBeGreaterThan(mid[last] as number);
    expect(lower[last]).toBeLessThan(mid[last] as number);
    expect((upper[last] as number) - (mid[last] as number)).toBeCloseTo(
      (mid[last] as number) - (lower[last] as number),
      6,
    );
  });

  it('volumeRatio：末量 ÷ 前 5 日均量；不足回 null', () => {
    expect(volumeRatio([100, 100, 100, 100, 100, 200], 5)).toBeCloseTo(2, 6);
    expect(volumeRatio([100, 100, 100], 5)).toBeNull();
    expect(volumeRatio([0, 0, 0, 0, 0, 100], 5)).toBeNull();
  });

  it('level20：視窗內最高＝100、最低＝0；不足回 null', () => {
    const closes = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(level20(closes)).toBeNull();
    const full = closes.concat([20]);
    expect(level20(full)).toBeCloseTo(100, 6);
    const atLow = [10, ...Array.from({ length: 19 }, (_, i) => 10 - i)];
    expect(level20(atLow)).toBeCloseTo(0, 6);
  });
});

describe('signalEngine：支撐壓力、POC、斐波那契', () => {
  it('supportResistance：高低交替序列可找到支撐與壓力', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const v = i % 2 === 0 ? 100 : 110;
      candles.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        open: v,
        high: v + 2,
        low: v - 2,
        close: v,
        volume: 100,
      });
    }
    const { support, resistance } = supportResistance(candles, 90, 3);
    expect(support).not.toBeNull();
    expect(resistance).not.toBeNull();
    expect(resistance as number).toBeGreaterThan(support as number);
  });

  it('supportResistance：K 線太少回 null', () => {
    expect(supportResistance(lineCandles(3))).toEqual({
      support: null,
      resistance: null,
    });
  });

  it('poc：量最大的價格分箱中點落在最大量的價格帶', () => {
    const candles = lineCandles(30).map((c, i) => ({
      ...c,
      close: i < 20 ? 100 : 120,
      volume: i < 20 ? 500 : 100,
    }));
    const p = poc(candles);
    expect(p).not.toBeNull();
    // 量大者集中在 100 元一帶，POC 應貼近該價格帶（而非最後收盤 120）
    expect(p as number).toBeLessThan(115);
    expect(p as number).toBeGreaterThan(95);
  });

  it('poc：成交量全為 0 或價格為 0 回 null', () => {
    const zeroVol = lineCandles(10).map((c) => ({ ...c, volume: 0 }));
    expect(poc(zeroVol)).toBeNull();
  });

  it('poc：空序列回 null', () => {
    expect(poc([])).toBeNull();
  });

  it('fibonacci：38.2/50/61.8 由視窗最高點往下量', () => {
    const candles = lineCandles(30).map((c) => ({
      ...c,
      high: c.close + 10,
      low: c.close - 10,
    }));
    const fib = fibonacci(candles);
    const hi = Math.max(...candles.map((c) => c.high));
    const lo = Math.min(...candles.map((c) => c.low));
    const range = hi - lo;
    expect(fib['38.2']).toBeCloseTo(hi - range * 0.382, 6);
    expect(fib['50']).toBeCloseTo(hi - range * 0.5, 6);
    expect(fib['61.8']).toBeCloseTo(hi - range * 0.618, 6);
  });

  it('fibonacci：高低相同回 null（不除以零）', () => {
    const flat = flatCandles(5, 100);
    expect(fibonacci(flat)).toEqual({
      '38.2': null,
      '50': null,
      '61.8': null,
    });
  });
});

describe('signalEngine：analyze 與格式化', () => {
  it('空 K 線不炸，關鍵欄位為 null', () => {
    const r = analyze([]);
    expect(r.close).toBeNull();
    expect(r.rsi14).toBeNull();
    expect(r.macd.dif).toHaveLength(0);
    expect(r.changePercent).toBeNull();
    expect(r.poc).toBeNull();
    expect(r.trend).toBeNull();
  });

  it('一般序列可算出均線、RSI、量比、位階與趨勢', () => {
    const n = 120;
    const candles = lineCandles(n).map((c, i) => ({
      ...c,
      high: c.close + 5,
      low: c.close - 5,
      volume: i === n - 1 ? 300 : 100,
    }));
    const r = analyze(candles);
    expect(r.close).toBe(n);
    expect(r.rsi14).toBeCloseTo(100, 6);
    expect(r.volumeRatio).toBeCloseTo(3, 6);
    expect(r.level20).toBeCloseTo(100, 6);
    expect(r.ma5).toBeCloseTo(n - 2, 6);
    // 線性上升序列：EMA20 > EMA100 → 上升趨勢
    expect(r.trend).toBe('上升趨勢');
  });

  it('fmtNum：千分位與 fallback', () => {
    expect(fmtNum(1055500)).toBe('1,055,500');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(null, '無資料')).toBe('無資料');
  });

  it('fmtPct：百分比字串與 fallback（正負號由呼叫端組合）', () => {
    expect(fmtPct(3.5)).toBe('3.5%');
    expect(fmtPct(-2.25)).toBe('-2.25%');
    expect(fmtPct(null)).toBe('—');
  });
});
