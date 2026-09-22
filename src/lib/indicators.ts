/**
 * 天網 K 線圖查看器 — 技術指標計算
 * Phase B2：MACD / KD / Bollinger Bands
 */

// ─── EMA ────────────────────────────────────────────────────────────────────

/**
 * 計算指數移動平均線（Exponential Moving Average）
 *
 * - 前 `period - 1` 個位置回傳 `null`
 * - 第 `period` 個位置（index = period - 1）用前 period 個值的 SMA 作為種子值（warm-up）
 * - 之後使用遞推公式：EMA(t) = close(t) × k + EMA(t-1) × (1-k)，k = 2 / (period + 1)
 *
 * @param data    數值陣列（時間順序，最舊在前）
 * @param period  週期（> 0）
 * @returns       EMA 陣列，長度與 data 相同；輸入為空或 period <= 0 時回傳空陣列
 */
export function calculateEMA(data: number[], period: number): (number | null)[] {
  if (!data || data.length === 0 || period <= 0) return [];

  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(data.length).fill(null);

  // 需要至少 period 個資料點才能計算第一個 EMA
  if (data.length < period) return result;

  // 種子值：前 period 個值的 SMA
  const seedSlice = data.slice(0, period);
  const seed = seedSlice.reduce((acc, v) => acc + v, 0) / period;
  result[period - 1] = seed;

  // 遞推計算後續 EMA
  for (let i = period; i < data.length; i++) {
    const prev = result[i - 1] as number;
    result[i] = data[i] * k + prev * (1 - k);
  }

  return result;
}

// ─── MACD ───────────────────────────────────────────────────────────────────

export interface MACDResult {
  dif: (number | null)[];    // EMA(fast) - EMA(slow)
  signal: (number | null)[]; // DIF 的 signalPeriod 日 EMA
  hist: (number | null)[];   // DIF - SIGNAL
}

/**
 * 計算 MACD（Moving Average Convergence Divergence）
 *
 * @param closes       收盤價陣列
 * @param fastPeriod   快線週期（預設 12）
 * @param slowPeriod   慢線週期（預設 26）
 * @param signalPeriod 訊號線週期（預設 9）
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const len = closes.length;
  const empty: MACDResult = {
    dif: new Array(len).fill(null),
    signal: new Array(len).fill(null),
    hist: new Array(len).fill(null),
  };

  if (len === 0) return empty;

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  // DIF = EMA(fast) - EMA(slow)；只有兩者都非 null 時才有值
  const dif: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  // 從 dif 中提取非 null 的連續段，計算 signal EMA
  // signal 的種子值從第一個非 null dif 開始計算
  const signal: (number | null)[] = new Array(len).fill(null);

  // 找出第一個非 null dif 的 index
  const firstDifIdx = dif.findIndex((v) => v !== null);
  if (firstDifIdx === -1) return { dif, signal, hist: new Array(len).fill(null) };

  // 從 firstDifIdx 開始，取出連續的 dif 值計算 EMA
  const difValues = dif.slice(firstDifIdx).map((v) => v as number);
  const signalValues = calculateEMA(difValues, signalPeriod);

  // 將 signalValues 對應回原始 index
  for (let i = 0; i < signalValues.length; i++) {
    signal[firstDifIdx + i] = signalValues[i];
  }

  // HIST = DIF - SIGNAL
  const hist: (number | null)[] = closes.map((_, i) => {
    const d = dif[i];
    const s = signal[i];
    return d !== null && s !== null ? d - s : null;
  });

  return { dif, signal, hist };
}

// ─── KD ─────────────────────────────────────────────────────────────────────

export interface KDResult {
  k: (number | null)[];
  d: (number | null)[];
}

/**
 * 計算 KD 隨機指標（Stochastic Oscillator）
 *
 * RSV(t) = (close(t) - lowest_low(period)) / (highest_high(period) - lowest_low(period)) × 100
 * K(t) = K(t-1) × (1 - 1/kSmooth) + RSV(t) × (1/kSmooth)
 * D(t) = D(t-1) × (1 - 1/dSmooth) + K(t) × (1/dSmooth)
 * 初始值：K(0) = D(0) = 50
 *
 * @param highs   最高價陣列
 * @param lows    最低價陣列
 * @param closes  收盤價陣列
 * @param period  RSV 週期（預設 9）
 * @param kSmooth K 平滑係數（預設 3）
 * @param dSmooth D 平滑係數（預設 3）
 */
export function calculateKD(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9,
  kSmooth = 3,
  dSmooth = 3
): KDResult {
  const len = closes.length;
  const empty: KDResult = {
    k: new Array(len).fill(null),
    d: new Array(len).fill(null),
  };

  if (len === 0 || period <= 0) return empty;

  const k: (number | null)[] = new Array(len).fill(null);
  const d: (number | null)[] = new Array(len).fill(null);

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < len; i++) {
    if (i < period - 1) continue; // 資料不足，保持 null

    const windowHighs = highs.slice(i - period + 1, i + 1);
    const windowLows = lows.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...windowHighs);
    const lowestLow = Math.min(...windowLows);

    let rsv: number;
    if (highestHigh === lowestLow) {
      // 避免除以零：RSV 設為 50
      rsv = 50;
    } else {
      rsv = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    }

    const kVal = prevK * (1 - 1 / kSmooth) + rsv * (1 / kSmooth);
    const dVal = prevD * (1 - 1 / dSmooth) + kVal * (1 / dSmooth);

    k[i] = kVal;
    d[i] = dVal;

    prevK = kVal;
    prevD = dVal;
  }

  return { k, d };
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/**
 * 計算布林通道（Bollinger Bands）
 *
 * Middle(t) = SMA(close, period)
 * StdDev(t) = √( Σ(close(i) - Middle(t))² / period )
 * Upper(t)  = Middle(t) + multiplier × StdDev(t)
 * Lower(t)  = Middle(t) - multiplier × StdDev(t)
 *
 * @param closes     收盤價陣列
 * @param period     週期（預設 20）
 * @param multiplier 標準差倍數（預設 2）
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2
): BollingerResult {
  const len = closes.length;
  const empty: BollingerResult = {
    upper: new Array(len).fill(null),
    middle: new Array(len).fill(null),
    lower: new Array(len).fill(null),
  };

  if (len === 0 || period <= 0) return empty;

  const upper: (number | null)[] = new Array(len).fill(null);
  const middle: (number | null)[] = new Array(len).fill(null);
  const lower: (number | null)[] = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((acc, v) => acc + v, 0) / period;
    const variance = slice.reduce((acc, v) => acc + (v - sma) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    middle[i] = sma;
    upper[i] = sma + multiplier * stdDev;
    lower[i] = sma - multiplier * stdDev;
  }

  return { upper, middle, lower };
}

// ─── RSI ───────────────────────────────────────────────────────────────────────

export interface RSIResult {
  rsi: (number | null)[];
}

/**
 * 計算相對強弱指標（Relative Strength Index, RSI）
 *
 * RS(t) = 平均上漲幅度 / 平均下跌幅度（過去 period 根 K 棒）
 * RSI(t) = 100 - 100 / (1 + RS)
 *
 * 使用 Wilder's Smoothing（等同 EMA with alpha = 1/period）
 * 初始種子值：前 period 根的平均漲跌幅
 *
 * @param closes    收盤價陣列
 * @param period    週期（預設 14）
 * @returns         RSI 陣列（0-100），長度與 data 相同
 */
export function calculateRSI(
  closes: number[],
  period = 14
): RSIResult {
  const len = closes.length;
  const empty: RSIResult = { rsi: new Array(len).fill(null) };

  if (len === 0 || period <= 0) return empty;

  const rsi: (number | null)[] = new Array(len).fill(null);

  if (len < period + 1) return { rsi };

  // 計算價格變化
  const changes: number[] = [];
  for (let i = 1; i < len; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // 種子值：前 period 個變化的平均上漲/下跌
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  // 第一個有效 RSI 位於 index = period
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);
  }

  // Wilder's Smoothing 遞推：alpha = 1/period
  const alpha = 1 / period;
  for (let i = period + 1; i < len; i++) {
    const change = changes[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = avgGain * (1 - alpha) + gain * alpha;
    avgLoss = avgLoss * (1 - alpha) + loss * alpha;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }

  return { rsi };
}

// ─── CDP（Central Pivot Point，最佳終點） ──────────────────────────────────

export interface CDPResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/**
 * 計算 CDP（Central Pivot Point 最佳終點，韓式指標）
 *
 * 以過去 period 根 K 棒的（High, Low, Close）平均值計算樞軸：
 *   PP     = (avgHigh + avgLow + avgClose) / 3
 *   Upper  = 2 × PP − avgLow
 *   Lower  = 2 × PP − avgHigh
 *   Middle = PP − (avgHigh − avgLow)
 *
 * 前 period − 1 根資料不足，回傳 null。
 *
 * @param highs   最高價陣列
 * @param lows    最低價陣列
 * @param closes  收盤價陣列
 * @param period  統計週期（預設 20）
 */
export function calculateCDP(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20
): CDPResult {
  const len = closes.length;
  const empty: CDPResult = {
    upper: new Array(len).fill(null),
    middle: new Array(len).fill(null),
    lower: new Array(len).fill(null),
  };

  if (len === 0 || period <= 0 || len < period) return empty;

  const upper: (number | null)[] = new Array(len).fill(null);
  const middle: (number | null)[] = new Array(len).fill(null);
  const lower: (number | null)[] = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    const sliceH = highs.slice(i - period + 1, i + 1);
    const sliceL = lows.slice(i - period + 1, i + 1);
    const sliceC = closes.slice(i - period + 1, i + 1);
    const avgHigh = sliceH.reduce((acc, v) => acc + v, 0) / period;
    const avgLow = sliceL.reduce((acc, v) => acc + v, 0) / period;
    const avgClose = sliceC.reduce((acc, v) => acc + v, 0) / period;

    const pp = (avgHigh + avgLow + avgClose) / 3;
    upper[i] = 2 * pp - avgLow;
    lower[i] = 2 * pp - avgHigh;
    middle[i] = pp - (avgHigh - avgLow);
  }

  return { upper, middle, lower };
}

// ─── BIAS ──────────────────────────────────────────────────────────────────────

export interface BIASResult {
  bias6: (number | null)[];
  bias12: (number | null)[];
  bias24: (number | null)[];
}

/**
 * 計算乖離率（BIAS）
 *
 * BIAS(n) = (Close - MA(n)) / MA(n) × 100
 *
 * @param closes  收盤價陣列
 * @returns       BIAS6, BIAS12, BIAS24 陣列
 */
export function calculateBIAS(closes: number[]): BIASResult {
  const len = closes.length;
  const empty: BIASResult = {
    bias6: new Array(len).fill(null),
    bias12: new Array(len).fill(null),
    bias24: new Array(len).fill(null),
  };

  if (len === 0) return empty;

  const periods = [6, 12, 24];
  const results: { [key: number]: (number | null)[] } = {};

  for (const p of periods) {
    const arr: (number | null)[] = new Array(len).fill(null);
    for (let i = p - 1; i < len; i++) {
      const slice = closes.slice(i - p + 1, i + 1);
      const ma = slice.reduce((acc, v) => acc + v, 0) / p;
      if (ma !== 0) {
        arr[i] = ((closes[i] - ma) / ma) * 100;
      }
    }
    results[p] = arr;
  }

  return {
    bias6: results[6],
    bias12: results[12],
    bias24: results[24],
  };
}
