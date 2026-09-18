import { bollinger, buildQuickChartConfig, buildTechnicalNarrative, ema, macd, macdState, rsi, rollingStd, sma } from '../macd-chart';
import { analyzeStructure, classifyMarketRegime } from '../market-structure';

describe('MACD evidence chart', () => {
  test('computes stable EMA, SMA and MACD lengths', () => {
    expect(ema([1, 2, 3], 3)).toEqual([1, 1.5, 2.25]);
    expect(sma([1, 2, 3, 4, 5], 5)).toEqual([null, null, null, null, 3]);
    expect(macd(Array.from({ length: 40 }, (_, i) => 100 + i)).dif).toHaveLength(40);
  });

  test('labels an underwater golden cross', () => {
    expect(macdState([-2, -1], [-1.5, -1.2], [-0.5, 0.2])).toBe('UNDERWATER_GOLDEN_CROSS');
  });

  test('computes Bollinger bands and RSI without future leakage', () => {
    const values = Array.from({ length: 40 }, (_, i) => 100 + i);
    const bands = bollinger(values);
    expect(bands.middle[18]).toBeNull();
    expect(bands.middle[19]).toBeCloseTo(109.5, 6);
    expect(rollingStd(values, 20)[19]).toBeGreaterThan(0);
    expect(rsi(values, 14)[13]).toBeNull();
    expect(rsi(values, 14)[14]).toBe(100);
  });

  test('builds chart data only from supplied candles', () => {
    const candles = Array.from({ length: 260 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, open: 99.5 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 100000 + i * 1000 }));
    const result = buildQuickChartConfig(candles, '2330');
    expect(result.close).toBe(359);
    expect(result.config.data.labels).toHaveLength(48);
    expect(result.config.data.datasets.length).toBeGreaterThanOrEqual(10);
    expect(result.priorityScore).toBeGreaterThanOrEqual(0);
    expect(result.rsi14).not.toBeNull();
    expect(result.narrative.headline).toBeTruthy();
    expect(result.structureVersion).toBe('STRUCTURE_FIRST_SHADOW_V1');
    expect(result.structure.regime.period).toBe(200);
    expect(result.config.options.plugins.legend.display).toBe(false);
    expect(result.config.options.plugins.title.display).toBe(false);
    expect(result.config.options.scales.price.min).toBeGreaterThan(0);
  });

  test('calculates technical values from full history while displaying 48 sessions', () => {
    const candles = Array.from({ length: 90 }, (_, i) => ({ date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`, close: 120 + Math.sin(i / 4) * 8 + i * 0.1 }));
    const full = buildQuickChartConfig(candles, '2337');
    const expectedRsi = rsi(candles.map((item) => item.close), 14).at(-1)!;
    expect(full.rsi14).toBe(Number(expectedRsi.toFixed(1)));
    expect(full.config.data.labels).toHaveLength(48);
  });

  test('writes direct action language for trigger, defense and limit-up states', () => {
    const candles = Array.from({ length: 260 }, (_, i) => ({ date: `D${i}`, open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100 + i * 0.1, volume: 100000 + i * 1000 }));
    const analysis = analyzeStructure(candles);
    const base = { analysis, rsi14: 58 };
    expect(buildTechnicalNarrative({ ...base, current: 121, trigger: 122.5, stop: 119.5 }).status).toBe('WAIT_TRIGGER');
    expect(buildTechnicalNarrative({ ...base, current: 119, trigger: 122.5, stop: 119.5 }).status).toBe('STOP');
    expect(buildTechnicalNarrative({ ...base, current: 124.5, upperLimit: 124.5 }).status).toBe('LIMIT_UP');
    expect(buildTechnicalNarrative({ ...base, current: 123, upperLimit: 124.5 }).status).toBe('NEAR_LIMIT_UP');
    expect(['BULLISH', 'WATCH', 'WEAK']).toContain(buildTechnicalNarrative({ ...base, current: 123, trigger: 122.5, stop: 119.5 }).status);
  });

  test('does not count RSI, MACD and KDJ as independent structure votes', () => {
    const candles = Array.from({ length: 260 }, (_, i) => ({ date: `D${i}`, open: 100 + i * 0.08, high: 101 + i * 0.08, low: 99 + i * 0.08, close: 100 + i * 0.08, volume: 100000 + i * 300 }));
    const result = buildQuickChartConfig(candles, '2330');
    expect(result.narrative.momentum).toContain('不與 MACD／KDJ 重複加分');
    expect(result.structure.score).toBe(result.priorityScore);
    expect(result.structure.regime.quality).toBe('MA200_FULL');
    expect(classifyMarketRegime(candles).state).toBe('UPTREND');
  });
});
