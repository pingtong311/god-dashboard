/**
 * signalEngine.ts — 技術分析純函式引擎
 * ----------------------------------------------------------------------------
 * /signal 頁的指標計算（SMA／EMA／RSI／量比／位階／支撐壓力／POC／斐波那契）。
 * 全部為無副作用純函式，輸入日 K 陣列（舊→新），輸出對齊
 * captured/login-capture/html/signal-2330.html 的呈現欄位。
 *
 * 設計原則：資料不足時回 null（不補 0、不造假），由前端誠實標示「—」。
 */

/** 標準日 K（順序：舊→新）。 */
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 技術分析結果（任一欄位無資料時為 null）。 */
export interface SignalResult {
  /** 收盤價（最新一日）。 */
  close: number | null;
  /** 前一日收盤。 */
  prevClose: number | null;
  /** 漲跌幅（%）。 */
  changePercent: number | null;
  /** 開高低收（最新一日）。 */
  last: { date: string; open: number; high: number; low: number; close: number; volume: number } | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ema20: number | null;
  ema100: number | null;
  rsi14: number | null;
  /** 量比熱度＝今日量 ÷ 近 5 日平均量。 */
  volumeRatio: number | null;
  /** 20 日位階（0–100%）。 */
  level20: number | null;
  /** EMA20 乖離（%）。 */
  deviation20: number | null;
  support: number | null;
  resistance: number | null;
  poc: number | null;
  fib: { '38.2': number | null; '50': number | null; '61.8': number | null };
  /** 趨勢標籤（對齊實站「上升趨勢／下降趨勢／盤整」用語）。 */
  trend: '上升趨勢' | '下降趨勢' | '盤整' | null;
  ma5Series: readonly (number | null)[];
  ma20Series: readonly (number | null)[];
  ma60Series: readonly (number | null)[];
  ema20Series: readonly (number | null)[];
  ema100Series: readonly (number | null)[];
  rsiSeries: readonly (number | null)[];
  /** MACD：DIF／DEA／柱狀（ newest 在最後）。 */
  macd: { dif: readonly number[]; dea: readonly number[]; hist: readonly number[] };
  /** 布林：中軌／上軌／下軌（對齊 ma20 序列長度）。 */
  boll: { mid: readonly (number | null)[]; upper: readonly (number | null)[]; lower: readonly (number | null)[] };
}

/** 簡單移動平均：回傳與輸入等長、前方不足期數為 null 的序列。 */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** 指數移動平均（種子值為前 period 個收盤的 SMA）。 */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** 取序列最後一個非 null 值。 */
function lastValid(series: readonly (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

/** RSI（14，Wilder 平滑）；資料不足回 null。 */
export function rsi(closes: readonly number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** RSI 序列（對齊 closes 長度，前方不足為 null）。 */
export function rsiSeries(closes: readonly number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD（12, 26, 9）：回傳 DIF／DEA／柱狀序列。 */
export function macd(closes: readonly number[]): {
  dif: number[];
  dea: number[];
  hist: number[];
} {
  const difSeries: (number | null)[] = new Array(closes.length).fill(null);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      difSeries[i] = (ema12[i] as number) - (ema26[i] as number);
    }
  }
  const difValues = difSeries.map((v) => v ?? 0);
  const deaRaw = ema(difValues, 9);
  const dif: number[] = [];
  const dea: number[] = [];
  const hist: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (difSeries[i] === null || deaRaw[i] === null) continue;
    const d = difSeries[i] as number;
    const e = deaRaw[i] as number;
    dif.push(d);
    dea.push(e);
    hist.push((d - e) * 2);
  }
  return { dif, dea, hist };
}

/** 布林通道（中軌=MA20，上下軌=±2σ）。 */
export function bollinger(closes: readonly number[], period = 20): {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
} {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    const m = mid[i] as number;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (closes[j] - m) ** 2;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = m + 2 * sd;
    lower[i] = m - 2 * sd;
  }
  return { mid, upper, lower };
}

/** 量比熱度＝最後一日量 ÷ 前 5 日平均量。 */
export function volumeRatio(volumes: readonly number[], period = 5): number | null {
  if (volumes.length < period + 1) return null;
  const tail = volumes[volumes.length - 1];
  let sum = 0;
  for (let i = volumes.length - 1 - period; i < volumes.length - 1; i++) sum += volumes[i];
  const avg = sum / period;
  if (avg <= 0) return null;
  return tail / avg;
}

/** 20 日位階：(收盤−20日最低) ÷ (20日最高−20日最低)。 */
export function level20(closes: readonly number[]): number | null {
  if (closes.length < 20) return null;
  const window = closes.slice(-20);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  if (hi === lo) return null;
  return ((window[window.length - 1] - lo) / (hi - lo)) * 100;
}

/**
 * 支撐／壓力：在 window 內尋找「轉折點」（比左右各 lookahead 根 K 線都低／高者），
 * 取最近一個未跌破的轉折低點為支撐、最近一個未突破的轉折高點為壓力。
 * 無轉折點時退回視窗內最近的高低點。
 */
export function supportResistance(
  candles: readonly Candle[],
  window = 90,
  lookahead = 3,
): { support: number | null; resistance: number | null } {
  if (candles.length < lookahead * 2 + 1) return { support: null, resistance: null };
  const slice = candles.slice(-window);
  const lastClose = slice[slice.length - 1].close;
  let support: number | null = null;
  let resistance: number | null = null;
  for (let i = lookahead; i < slice.length - lookahead; i++) {
    const c = slice[i];
    let isLow = true;
    let isHigh = true;
    for (let j = i - lookahead; j <= i + lookahead; j++) {
      if (j === i) continue;
      if (slice[j].low <= c.low) isLow = false;
      if (slice[j].high >= c.high) isHigh = false;
    }
    if (isLow && c.low < lastClose && (support === null || c.low > support)) support = c.low;
    if (isHigh && c.high > lastClose && (resistance === null || c.high < resistance)) resistance = c.high;
  }
  if (support === null) {
    const lows = slice.slice(0, -1).map((c) => c.low);
    const ml = Math.min(...lows);
    if (ml < lastClose) support = ml;
  }
  if (resistance === null) {
    const highs = slice.slice(0, -1).map((c) => c.high);
    const mh = Math.max(...highs);
    if (mh > lastClose) resistance = mh;
  }
  return { support, resistance };
}

/**
 * 最大量成本區（POC）：以「最後收盤價 0.5%」為固定分箱寬度，把視窗內每根 K 線
 * 的收盤價分箱並累加成交量，取量最大的箱中點。
 * ----------------------------------------------------------------------------
 * 分箱寬度必須全視窗統一（不可逐根以自身價格算寬度——那會讓每根都落進同一箱，
 * POC 恆等於最後收盤價）。這裡以最後一根收盤價的 0.5% 為基準寬度。
 */
export function poc(candles: readonly Candle[], window = 90): number | null {
  const slice = candles.slice(-window);
  if (slice.length === 0) return null;
  const step = Math.max((slice[slice.length - 1].close ?? 1) * 0.005, 0.01);
  const bins = new Map<number, number>();
  for (const c of slice) {
    if (c.close <= 0 || c.volume <= 0) continue;
    const key = Math.round(c.close / step);
    bins.set(key, (bins.get(key) ?? 0) + c.volume);
  }
  if (bins.size === 0) return null;
  let bestKey = 0;
  let bestVol = -1;
  for (const [key, vol] of bins) {
    if (vol > bestVol) {
      bestVol = vol;
      bestKey = key;
    }
  }
  return bestKey * step;
}

/** 斐波那契回撤（38.2／50／61.8%），以視窗內最高點為基準往下量。 */
export function fibonacci(candles: readonly Candle[], window = 90): {
  '38.2': number | null;
  '50': number | null;
  '61.8': number | null;
} {
  const slice = candles.slice(-window);
  if (slice.length === 0) return { '38.2': null, '50': null, '61.8': null };
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  if (high === low) return { '38.2': null, '50': null, '61.8': null };
  const range = high - low;
  return {
    '38.2': high - range * 0.382,
    '50': high - range * 0.5,
    '61.8': high - range * 0.618,
  };
}

/** 主計算函式：由日 K 陣列推導全部呈現欄位。 */
export function analyze(candles: readonly Candle[]): SignalResult {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : null;
  const close = last ? last.close : null;
  const changePercent =
    close !== null && prevClose !== null && prevClose !== 0
      ? ((close - prevClose) / prevClose) * 100
      : null;

  const ma5Series = sma(closes, 5);
  const ma20Series = sma(closes, 20);
  const ma60Series = sma(closes, 60);
  const ema20Series = ema(closes, 20);
  const ema100Series = ema(closes, 100);
  const rsiS = rsiSeries(closes, 14);
  const boll = bollinger(closes, 20);
  const ema20 = lastValid(ema20Series);
  const ema100 = lastValid(ema100Series);

  let trend: SignalResult['trend'] = null;
  if (ema20 !== null && ema100 !== null) {
    if (ema20 > ema100) trend = '上升趨勢';
    else if (ema20 < ema100) trend = '下降趨勢';
    else trend = '盤整';
  }

  return {
    close,
    prevClose,
    changePercent,
    last: last
      ? {
          date: last.date,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
        }
      : null,
    ma5: lastValid(ma5Series),
    ma20: lastValid(ma20Series),
    ma60: lastValid(ma60Series),
    ema20,
    ema100,
    rsi14: rsi(closes, 14),
    volumeRatio: volumeRatio(volumes, 5),
    level20: level20(closes),
    deviation20:
      close !== null && ema20 !== null && ema20 !== 0
        ? ((close - ema20) / ema20) * 100
        : null,
    ...supportResistance(candles),
    poc: poc(candles),
    fib: fibonacci(candles),
    trend,
    ma5Series,
    ma20Series,
    ma60Series,
    ema20Series,
    ema100Series,
    rsiSeries: rsiS,
    macd: macd(closes),
    boll,
  };
}

/** 格式化數字：整數顯示整數、否則至多兩位小數去尾零；null 顯示「—」。 */
export function fmtNum(value: number | null, fallback = '—'): string {
  if (value === null || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toLocaleString('zh-Hant');
  return rounded.toLocaleString('zh-Hant', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** 格式化百分比：value 已為百分比數值。 */
export function fmtPct(value: number | null, fallback = '—'): string {
  if (value === null || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}
