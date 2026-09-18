import { analyzeStructure, structureSma, StructureAnalysis, StructureCandle } from './market-structure';

export type Candle = StructureCandle;

export function ema(values: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  return values.map((value) => {
    previous = previous == null ? value : (value - previous) * multiplier + previous;
    return previous;
  });
}

export function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function rollingStd(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    const mean = slice.reduce((sum, value) => sum + value, 0) / period;
    return Math.sqrt(slice.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period);
  });
}

export function bollinger(values: number[], period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const deviation = rollingStd(values, period);
  const upper = middle.map((value, index) => value == null || deviation[index] == null ? null : value + deviation[index]! * multiplier);
  const lower = middle.map((value, index) => value == null || deviation[index] == null ? null : value - deviation[index]! * multiplier);
  return { upper, middle, lower };
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const output: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return output;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  output[period] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  }
  return output;
}

export function macd(values: number[], fast = 10, slow = 20, signal = 7) {
  const fastValues = ema(values, fast);
  const slowValues = ema(values, slow);
  const dif = values.map((_, index) => fastValues[index] - slowValues[index]);
  const dea = ema(dif, signal);
  const histogram = dif.map((value, index) => value - dea[index]);
  return { dif, dea, histogram };
}

export function macdState(dif: number[], dea: number[], histogram: number[]): string {
  const index = dif.length - 1;
  if (index < 1) return 'INSUFFICIENT';
  if (dif[index - 1] <= dea[index - 1] && dif[index] > dea[index] && dif[index] < 0) return 'UNDERWATER_GOLDEN_CROSS';
  if (dif[index - 1] <= 0 && dif[index] > 0) return 'ZERO_AXIS_BREAKOUT';
  if (dif[index - 1] >= dea[index - 1] && dif[index] < dea[index]) return 'DEAD_CROSS';
  if (dif[index] > 0 && dea[index] > 0 && histogram[index] >= 0 && histogram[index] < histogram[index - 1]) return 'ABOVE_ZERO_PULLBACK';
  if (dif[index] > dea[index] && dif[index] > 0) return 'ABOVE_ZERO_BULLISH';
  return 'NEUTRAL';
}

function rounded(values: Array<number | null>, digits = 3): Array<number | null> {
  const factor = 10 ** digits;
  return values.map((value) => value == null ? null : Math.round(value * factor) / factor);
}

export type TechnicalNarrative = {
  status: 'STOP' | 'LIMIT_UP' | 'NEAR_LIMIT_UP' | 'WAIT_TRIGGER' | 'BULLISH' | 'WATCH' | 'WEAK';
  headline: string;
  action: string;
  location: string;
  regime: string;
  volume: string;
  risk: string;
  momentum: string;
};

function displayPrice(value?: number): string {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value).toFixed(2).replace(/\.00$/, '') : '-';
}

export function buildTechnicalNarrative(input: {
  analysis: StructureAnalysis;
  rsi14: number | null;
  current: number;
  trigger?: number;
  stop?: number;
  upperLimit?: number;
}): TechnicalNarrative {
  const { analysis, rsi14, current, trigger, stop, upperLimit } = input;
  const zone = analysis.location.activeZone;
  const zoneText = zone ? `${displayPrice(zone.lower)}–${displayPrice(zone.upper)}` : '-';
  const location = analysis.location.state === 'RESISTANCE_BREAKOUT' ? `突破 ${zoneText} 壓力區，位置轉強。`
    : analysis.location.state === 'RESISTANCE_TO_SUPPORT_RETEST' ? `回測 ${zoneText} 角色互換區，守住才延續。`
      : analysis.location.state === 'NEAR_SUPPORT' ? `靠近 ${zoneText} 支撐區，等待止跌。`
        : analysis.location.state === 'NEAR_RESISTANCE' ? `靠近 ${zoneText} 壓力區，避免直接追價。`
          : '目前在主要支撐與壓力之間，位置優勢不明顯。';
  const regime = analysis.regime.state === 'UPTREND' ? `MA${analysis.regime.period} 上彎且價格多在均線上，屬上升行情。`
    : analysis.regime.state === 'DOWNTREND' ? `MA${analysis.regime.period} 下彎且價格多在均線下，屬下降行情。`
      : analysis.regime.state === 'RANGE' ? `MA${analysis.regime.period} 走平且價格反覆穿越，屬區間行情。`
        : `MA${analysis.regime.period} 尚在轉換期，方向不穩。`;
  const ratio = analysis.volume.ratio == null ? '-' : analysis.volume.ratio.toFixed(2);
  const volume = analysis.volume.state === 'PRICE_UP_VOLUME_UP' ? `價漲量增，成交量為20日均量 ${ratio} 倍。`
    : analysis.volume.state === 'PRICE_UP_VOLUME_DOWN' ? `價漲量縮，成交量僅20日均量 ${ratio} 倍，參與度不足。`
      : analysis.volume.state === 'PRICE_DOWN_VOLUME_UP' ? `價跌量增，主動賣壓偏重，量比 ${ratio}。`
        : analysis.volume.state === 'PRICE_DOWN_VOLUME_DOWN' ? `價跌量縮，賣壓減弱但尚未轉強，量比 ${ratio}。`
          : '成交量歷史不足。';
  const risk = analysis.risk.atr == null ? 'ATR 歷史不足。' : `ATR14 ${analysis.risk.atr.toFixed(2)}（${analysis.risk.atrPct?.toFixed(2)}%），只用於防守與部位距離。`;
  const momentum = rsi14 == null ? '單一動能診斷資料不足；不重複計入 MACD／KDJ。'
    : rsi14 >= 75 ? `RSI14 ${rsi14.toFixed(1)} 過熱；只作追價警示，不與 MACD／KDJ 重複加分。`
      : rsi14 >= 55 ? `RSI14 ${rsi14.toFixed(1)} 偏強；只作動能診斷，不與 MACD／KDJ 重複加分。`
        : rsi14 >= 45 ? `RSI14 ${rsi14.toFixed(1)} 中性；不與 MACD／KDJ 重複加分。`
          : `RSI14 ${rsi14.toFixed(1)} 偏弱；超賣也不等於止跌。`;
  const result = (status: TechnicalNarrative['status'], headline: string, action: string): TechnicalNarrative => ({ status, headline, action, location, regime, volume, risk, momentum });
  if (stop && current <= stop) return result('STOP', '跌破防守，取消觀察', `現價 ${displayPrice(current)} 已低於防守 ${displayPrice(stop)}。`);
  if (upperLimit && current >= upperLimit - Math.max(0.01, upperLimit * 0.0005)) return result('LIMIT_UP', '已到漲停，不追價', `漲停價 ${displayPrice(upperLimit)}；等待下一次正常成交機會。`);
  if (upperLimit && current > 0 && (upperLimit - current) / current * 100 <= 2) return result('NEAR_LIMIT_UP', '接近漲停，避免追價', `距漲停約 ${(((upperLimit - current) / current) * 100).toFixed(1)}%，只觀察量價與鎖單。`);
  if (trigger && current < trigger) return result('WAIT_TRIGGER', '尚未觸發，先等', `現價 ${displayPrice(current)}；站上 ${displayPrice(trigger)} 才算轉強。`);
  if (analysis.decision === 'STRUCTURE_CONFIRMED') return result('BULLISH', '位置、行情與量能同向', '已過觸發價；續看壓力轉支撐是否守住，不追急拉。');
  if (analysis.decision === 'WATCH_VOLUME') return result('WATCH', '位置可看，等待量能確認', '位置與行情可觀察，但成交量尚未完成確認。');
  if (analysis.decision === 'SKIP_COUNTERTREND') return result('WEAK', '位置與長期行情衝突', '屬逆勢條件，先略過。');
  if (analysis.decision === 'WAIT_FOR_LOCATION') return result('WEAK', '離關鍵位置太遠', '等待價格靠近已驗證的支撐／壓力區。');
  return result('WEAK', '結構訊號不足', '等待位置、長均線行情與成交量重新對齊。');
}

export function buildQuickChartConfig(candles: Candle[], ticker: string, context: { current?: number; trigger?: number; stop?: number; upperLimit?: number } = {}) {
  const allCloses = candles.map((row) => row.close);
  const allRsi14 = rsi(allCloses, 14);
  const analysis = analyzeStructure(candles);
  const displayStart = Math.max(0, candles.length - 48);
  const rows = candles.slice(-48);
  const closes = allCloses.slice(displayStart);
  const rsi14 = allRsi14.slice(displayStart);
  const last = rows.at(-1);
  const lastRsi = rsi14.at(-1) ?? null;
  const longMa = analysis.regime.ma.slice(displayStart);
  const volumeMa = structureSma(candles.map((row) => Number(row.volume || 0)), 20).slice(displayStart);
  const volumes = rows.map((row) => Number(row.volume || 0));
  const current = Number(context.current) > 0 ? Number(context.current) : Number(last?.close || 0);
  const narrative = buildTechnicalNarrative({ analysis, rsi14: lastRsi == null ? null : Number(lastRsi.toFixed(1)), current, trigger: context.trigger, stop: context.stop, upperLimit: context.upperLimit });
  const selectedZones = [analysis.location.activeZone, analysis.location.nearestSupport, analysis.location.nearestResistance]
    .filter((zone, zoneIndex, array) => zone && array.findIndex((item) => item?.center === zone.center) === zoneIndex)
    .slice(0, 3);
  const fixedLine = (value?: number) => Number.isFinite(value) && Number(value) > 0 ? closes.map(() => Number(value)) : closes.map(() => null);
  const priceRangeValues = [...closes, ...selectedZones.flatMap((zone) => zone ? [zone.lower, zone.upper] : []), ...[context.trigger, context.stop].filter((value): value is number => Number.isFinite(value) && Number(value) > 0)];
  const observedMin = Math.min(...priceRangeValues);
  const observedMax = Math.max(...priceRangeValues);
  const pricePadding = Math.max((observedMax - observedMin) * 0.08, observedMax * 0.015);
  const zoneDatasets = selectedZones.flatMap((zone) => zone ? [
    { type: 'line', label: `${zone.currentRole === 'RESISTANCE' ? '壓力' : '支撐'}區上緣`, data: fixedLine(zone.upper), yAxisID: 'price', borderColor: zone.currentRole === 'RESISTANCE' ? '#ea580c' : '#16a34a', borderWidth: 3, borderDash: [10, 6], pointRadius: 0 },
    { type: 'line', label: `${zone.currentRole === 'RESISTANCE' ? '壓力' : '支撐'}區下緣`, data: fixedLine(zone.lower), yAxisID: 'price', borderColor: zone.currentRole === 'RESISTANCE' ? '#fb923c' : '#4ade80', borderWidth: 2, borderDash: [5, 6], pointRadius: 0 },
  ] : []);
  return {
    state: analysis.decision,
    structure: analysis,
    structureVersion: analysis.version,
    regimeState: analysis.regime.state,
    locationState: analysis.location.state,
    volumeState: analysis.volume.state,
    rsi14: lastRsi == null ? null : Number(lastRsi.toFixed(1)),
    priorityScore: analysis.score,
    narrative,
    quoteDate: last?.date || '',
    close: current,
    ticker,
    config: {
      type: 'bar',
      data: {
        labels: rows.map((row) => row.date.slice(5)),
        datasets: [
          { type: 'line', label: '現價', data: rounded(closes), yAxisID: 'price', borderColor: '#1d4ed8', borderWidth: 5, pointRadius: 0, tension: 0.12 },
          { type: 'line', label: `MA${analysis.regime.period}`, data: rounded(longMa), yAxisID: 'price', borderColor: '#7c3aed', borderWidth: 4, pointRadius: 0 },
          ...zoneDatasets,
          { type: 'line', label: '觸發價', data: fixedLine(context.trigger), yAxisID: 'price', borderColor: '#0f766e', borderWidth: 3, borderDash: [9, 6], pointRadius: 0 },
          { type: 'line', label: '防守價', data: fixedLine(context.stop), yAxisID: 'price', borderColor: '#dc2626', borderWidth: 3, borderDash: [9, 6], pointRadius: 0 },
          { type: 'bar', label: '成交量', data: volumes, yAxisID: 'volume', backgroundColor: rows.map((row, rowIndex) => rowIndex && row.close < rows[rowIndex - 1].close ? 'rgba(220,38,38,.50)' : 'rgba(22,163,74,.50)'), borderWidth: 0 },
          { type: 'line', label: '20日均量', data: rounded(volumeMa), yAxisID: 'volume', borderColor: '#0f766e', borderWidth: 3, pointRadius: 0 },
          { type: 'line', label: 'RSI14', data: rounded(rsi14, 1), yAxisID: 'rsi', borderColor: '#111827', borderWidth: 4, pointRadius: 0 },
          { type: 'line', label: '', data: closes.map(() => 70), yAxisID: 'rsi', borderColor: '#ef4444', borderWidth: 2, borderDash: [7, 6], pointRadius: 0 },
          { type: 'line', label: '', data: closes.map(() => 50), yAxisID: 'rsi', borderColor: '#94a3b8', borderWidth: 2, borderDash: [6, 6], pointRadius: 0 },
          { type: 'line', label: '', data: closes.map(() => 30), yAxisID: 'rsi', borderColor: '#22c55e', borderWidth: 2, borderDash: [7, 6], pointRadius: 0 },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        layout: { padding: { top: 12, right: 24, bottom: 18, left: 24 } },
        plugins: { title: { display: false }, subtitle: { display: false }, legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#475569', maxTicksLimit: 5, font: { size: 22, weight: 'bold' } } },
          rsi: { position: 'left', stack: 'panels', stackWeight: 1.35, min: 0, max: 100, grid: { color: 'rgba(148,163,184,.16)' }, ticks: { display: false }, title: { display: true, text: 'RSI（只診斷）', color: '#111827', font: { size: 25, weight: 'bold' } } },
          volume: { position: 'left', stack: 'panels', stackWeight: 1.45, beginAtZero: true, grid: { color: 'rgba(148,163,184,.16)' }, ticks: { display: false }, title: { display: true, text: '成交量／20日均量', color: '#0f766e', font: { size: 25, weight: 'bold' } } },
          price: { position: 'left', stack: 'panels', stackWeight: 4.2, min: Math.floor((observedMin - pricePadding) * 100) / 100, max: Math.ceil((observedMax + pricePadding) * 100) / 100, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { color: '#334155', includeBounds: false, maxTicksLimit: 6, font: { size: 22, weight: 'bold' } }, title: { display: true, text: `價格／支撐壓力／MA${analysis.regime.period}`, color: '#1e3a8a', font: { size: 25, weight: 'bold' } } },
        },
      },
    },
  };
}
