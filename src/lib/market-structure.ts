export type StructureCandle = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

export type PriceZone = {
  lower: number;
  upper: number;
  center: number;
  touches: number;
  originalKind: 'SUPPORT' | 'RESISTANCE' | 'MIXED';
  currentRole: 'SUPPORT' | 'RESISTANCE' | 'ACTIVE_ZONE';
  lastTouchIndex: number;
  score: number;
};

type NormalizedCandle = Required<StructureCandle>;

const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeCandles(candles: StructureCandle[]): NormalizedCandle[] {
  return candles.map((row, index) => {
    const close = number(row.close);
    return {
      date: String(row.date || index),
      open: number(row.open, close),
      high: number(row.high, close),
      low: number(row.low, close),
      close,
      volume: Math.max(0, number(row.volume)),
    };
  }).filter((row) => row.close > 0 && row.high > 0 && row.low > 0);
}

export function structureSma(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, index) => {
    sum += number(value);
    if (index >= period) sum -= number(values[index - period]);
    if (index + 1 >= period) result[index] = sum / period;
  });
  return result;
}

export function atrSeries(candles: StructureCandle[], period = 14): Array<number | null> {
  const rows = normalizeCandles(candles);
  const ranges = rows.map((row, index) => index === 0
    ? row.high - row.low
    : Math.max(row.high - row.low, Math.abs(row.high - rows[index - 1].close), Math.abs(row.low - rows[index - 1].close)));
  return structureSma(ranges, period);
}

export function buildPriceZones(candles: StructureCandle[], maxZones = 5): PriceZone[] {
  const rows = normalizeCandles(candles);
  if (rows.length < 20) return [];
  const atr = atrSeries(rows).at(-1) || rows.at(-1)!.close * 0.02;
  const points: Array<{ index: number; price: number; kind: 'HIGH' | 'LOW' }> = [];
  for (let index = 2; index < rows.length - 2; index += 1) {
    const neighborhood = rows.slice(index - 2, index + 3);
    if (rows[index].high >= Math.max(...neighborhood.map((row) => row.high))) points.push({ index, price: rows[index].high, kind: 'HIGH' });
    if (rows[index].low <= Math.min(...neighborhood.map((row) => row.low))) points.push({ index, price: rows[index].low, kind: 'LOW' });
  }
  const clusters: Array<{ center: number; tolerance: number; points: typeof points }> = [];
  points.forEach((point) => {
    const tolerance = Math.max(atr * 0.5, point.price * 0.008);
    let cluster = clusters.find((item) => Math.abs(item.center - point.price) <= Math.max(item.tolerance, tolerance));
    if (!cluster) {
      cluster = { center: point.price, tolerance, points: [] };
      clusters.push(cluster);
    }
    const previous = cluster.points.at(-1);
    if (!previous || point.index - previous.index >= 3) cluster.points.push(point);
    cluster.center = cluster.points.reduce((sum, item) => sum + item.price, 0) / cluster.points.length;
    cluster.tolerance = Math.max(cluster.tolerance, tolerance);
  });
  const close = rows.at(-1)!.close;
  const lastIndex = rows.length - 1;
  return clusters.filter((cluster) => cluster.points.length >= 2).map((cluster): PriceZone => {
    const center = cluster.points.reduce((sum, item) => sum + item.price, 0) / cluster.points.length;
    const halfWidth = Math.max(cluster.tolerance * 0.45, center * 0.0035);
    const lower = Math.min(...cluster.points.map((point) => point.price), center - halfWidth);
    const upper = Math.max(...cluster.points.map((point) => point.price), center + halfWidth);
    const highs = cluster.points.filter((point) => point.kind === 'HIGH').length;
    const lows = cluster.points.length - highs;
    const lastTouchIndex = Math.max(...cluster.points.map((point) => point.index));
    return {
      lower,
      upper,
      center: (lower + upper) / 2,
      touches: cluster.points.length,
      originalKind: highs > lows ? 'RESISTANCE' : lows > highs ? 'SUPPORT' : 'MIXED',
      currentRole: upper < close ? 'SUPPORT' : lower > close ? 'RESISTANCE' : 'ACTIVE_ZONE',
      lastTouchIndex,
      score: cluster.points.length * 12 + Math.max(0, 20 - (lastIndex - lastTouchIndex) / 5),
    };
  }).sort((a, b) => b.score - a.score).slice(0, maxZones).sort((a, b) => a.center - b.center);
}

export type RegimeAnalysis = {
  state: 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'TRANSITION' | 'INSUFFICIENT';
  period: number;
  quality: 'MA200_FULL' | 'MA200_UNAVAILABLE_FALLBACK_MA60' | 'INSUFFICIENT_LONG_HISTORY';
  ma: Array<number | null>;
  currentMa: number | null;
  slopePct: number | null;
  sidePersistencePct: number | null;
  crossCount: number | null;
};

export function classifyMarketRegime(candles: StructureCandle[]): RegimeAnalysis {
  const rows = normalizeCandles(candles);
  const closes = rows.map((row) => row.close);
  const period = rows.length >= 220 ? 200 : rows.length >= 80 ? 60 : Math.max(20, Math.floor(rows.length / 2));
  const quality = period === 200 ? 'MA200_FULL' : period === 60 ? 'MA200_UNAVAILABLE_FALLBACK_MA60' : 'INSUFFICIENT_LONG_HISTORY';
  const ma = structureSma(closes, period);
  const currentMa = ma.at(-1) ?? null;
  if (currentMa == null) return { state: 'INSUFFICIENT', period, quality, ma, currentMa, slopePct: null, sidePersistencePct: null, crossCount: null };
  const lookback = Math.min(20, rows.length - period);
  const priorMa = ma[ma.length - 1 - lookback];
  const slopePct = priorMa ? (currentMa / priorMa - 1) * 100 : 0;
  const start = Math.max(period - 1, rows.length - 20);
  const side = closes.slice(start).map((close, offset) => close >= (ma[start + offset] ?? close) ? 1 : -1);
  const abovePct = side.filter((value) => value > 0).length / Math.max(1, side.length) * 100;
  let crossCount = 0;
  for (let index = 1; index < side.length; index += 1) if (side[index] !== side[index - 1]) crossCount += 1;
  let state: RegimeAnalysis['state'] = 'TRANSITION';
  if (slopePct > 0.5 && abovePct >= 70) state = 'UPTREND';
  else if (slopePct < -0.5 && abovePct <= 30) state = 'DOWNTREND';
  else if (Math.abs(slopePct) <= 0.6 && (crossCount >= 3 || (abovePct >= 30 && abovePct <= 70))) state = 'RANGE';
  return { state, period, quality, ma, currentMa, slopePct, sidePersistencePct: abovePct, crossCount };
}

export type VolumeAnalysis = {
  state: 'PRICE_UP_VOLUME_UP' | 'PRICE_UP_VOLUME_DOWN' | 'PRICE_DOWN_VOLUME_UP' | 'PRICE_DOWN_VOLUME_DOWN' | 'INSUFFICIENT';
  ratio: number | null;
  average20: number | null;
  confirmed: boolean;
};

export function classifyParticipation(candles: StructureCandle[]): VolumeAnalysis {
  const rows = normalizeCandles(candles);
  if (rows.length < 21) return { state: 'INSUFFICIENT', ratio: null, average20: null, confirmed: false };
  const average20 = structureSma(rows.map((row) => row.volume), 20).at(-2) ?? null;
  const current = rows.at(-1)!;
  const previous = rows.at(-2)!;
  const ratio = average20 && average20 > 0 ? current.volume / average20 : 0;
  const up = current.close >= previous.close;
  const volumeUp = ratio >= 1;
  return {
    state: up && volumeUp ? 'PRICE_UP_VOLUME_UP' : up ? 'PRICE_UP_VOLUME_DOWN' : volumeUp ? 'PRICE_DOWN_VOLUME_UP' : 'PRICE_DOWN_VOLUME_DOWN',
    ratio,
    average20,
    confirmed: ratio >= 1.2,
  };
}

export type StructureAnalysis = {
  version: 'STRUCTURE_FIRST_SHADOW_V1';
  score: number;
  decision: 'STRUCTURE_CONFIRMED' | 'WATCH_VOLUME' | 'WAIT_FOR_LOCATION' | 'SKIP_COUNTERTREND' | 'WAIT';
  zones: PriceZone[];
  location: {
    state: 'RESISTANCE_BREAKOUT' | 'RESISTANCE_TO_SUPPORT_RETEST' | 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'BETWEEN_ZONES';
    activeZone: PriceZone | null;
    nearestSupport: PriceZone | null;
    nearestResistance: PriceZone | null;
  };
  regime: RegimeAnalysis;
  volume: VolumeAnalysis;
  risk: { atr: number | null; atrPct: number | null };
};

export function analyzeStructure(candles: StructureCandle[]): StructureAnalysis {
  const rows = normalizeCandles(candles);
  const zones = buildPriceZones(rows);
  const regime = classifyMarketRegime(rows);
  const volume = classifyParticipation(rows);
  const current = rows.at(-1)!.close;
  const previous = rows.at(-2)?.close ?? current;
  const atr = atrSeries(rows).at(-1) ?? null;
  const proximity = Math.max(current * 0.015, (atr ?? current * 0.02) * 1.25);
  const support = zones.filter((zone) => zone.upper < current || (current >= zone.lower && current <= zone.upper)).sort((a, b) => b.center - a.center)[0] ?? null;
  const resistance = zones.filter((zone) => zone.lower > current || (current >= zone.lower && current <= zone.upper)).sort((a, b) => a.center - b.center)[0] ?? null;
  const crossed = zones.filter((zone) => previous <= zone.upper && current > zone.upper).sort((a, b) => b.center - a.center)[0] ?? null;
  const retest = zones.find((zone) => current >= zone.lower - proximity && current <= zone.upper + proximity && rows.slice(Math.max(0, rows.length - 21), -1).some((row) => row.close > zone.upper + proximity * 0.3) && zone.originalKind !== 'SUPPORT') ?? null;
  let location: StructureAnalysis['location'];
  if (crossed) location = { state: 'RESISTANCE_BREAKOUT', activeZone: crossed, nearestSupport: crossed, nearestResistance: resistance };
  else if (retest) location = { state: 'RESISTANCE_TO_SUPPORT_RETEST', activeZone: retest, nearestSupport: retest, nearestResistance: resistance };
  else if (support && current - support.upper <= proximity) location = { state: 'NEAR_SUPPORT', activeZone: support, nearestSupport: support, nearestResistance: resistance };
  else if (resistance && resistance.lower - current <= proximity) location = { state: 'NEAR_RESISTANCE', activeZone: resistance, nearestSupport: support, nearestResistance: resistance };
  else location = { state: 'BETWEEN_ZONES', activeZone: null, nearestSupport: support, nearestResistance: resistance };
  let locationScore = location.state === 'RESISTANCE_BREAKOUT' ? 45 : location.state === 'RESISTANCE_TO_SUPPORT_RETEST' ? 42 : location.state === 'NEAR_SUPPORT' ? 34 : location.state === 'NEAR_RESISTANCE' ? 18 : 10;
  let regimeScore = regime.state === 'UPTREND' ? 30 : regime.state === 'RANGE' ? 18 : regime.state === 'TRANSITION' ? 10 : 0;
  let volumeScore = volume.state === 'PRICE_UP_VOLUME_UP' && volume.confirmed ? 25 : volume.state === 'PRICE_UP_VOLUME_UP' ? 18 : volume.state === 'PRICE_DOWN_VOLUME_DOWN' ? 9 : 3;
  const counterTrend = regime.state === 'DOWNTREND' && ['RESISTANCE_BREAKOUT', 'RESISTANCE_TO_SUPPORT_RETEST', 'NEAR_SUPPORT'].includes(location.state);
  if (counterTrend) { locationScore = Math.min(locationScore, 18); regimeScore = 0; volumeScore = Math.min(volumeScore, 8); }
  const score = Math.round(Math.max(0, Math.min(100, locationScore + regimeScore + volumeScore)));
  const decision = counterTrend ? 'SKIP_COUNTERTREND'
    : location.state === 'BETWEEN_ZONES' ? 'WAIT_FOR_LOCATION'
      : ['RESISTANCE_BREAKOUT', 'RESISTANCE_TO_SUPPORT_RETEST'].includes(location.state) && regime.state === 'UPTREND' && volume.confirmed ? 'STRUCTURE_CONFIRMED'
        : ['RESISTANCE_BREAKOUT', 'RESISTANCE_TO_SUPPORT_RETEST', 'NEAR_SUPPORT'].includes(location.state) && regime.state !== 'DOWNTREND' ? 'WATCH_VOLUME'
          : 'WAIT';
  return { version: 'STRUCTURE_FIRST_SHADOW_V1', score, decision, zones, location, regime, volume, risk: { atr, atrPct: atr ? atr / current * 100 : null } };
}
