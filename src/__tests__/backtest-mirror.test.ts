/** @jest-environment node */

/**
 * /backtest site-mirror 快照模組逐筆驗證 + 複利口徑驗算。
 *
 * 逐筆比對依據（快照 JSON）：
 *   captured/login-capture/api/blackstockai.com_api_broker-backtest_2330_mode_auto.json
 *   本測試把快照的 29 筆（entry_date / entry / exit / ret_pct，依實站順序）內嵌為
 *   期望值，逐筆與 BACKTEST_MIRROR.trades 比對（欄位值 + 順序）。
 *
 * ★複利 vs 簡單加總：total_ret_pct 是複利口徑（2.28），不是簡單加總（4.12）。
 */

import {
  BACKTEST_MIRROR,
  MIRROR_FIELD_SOURCES,
  MIRROR_META,
} from '@/app/backtest/mirror/backtest-2330-2026-09-24';
import { computeCoverageFromFields } from '@/lib/provenance';

/** 快照 29 筆期望值：[entry_date, entry, exit, ret_pct]（依實站順序）。 */
const EXPECTED_TRADES: readonly [string, number, number, number][] = [
  ['2026-09-08', 2465, 2410, -2.62],
  ['2026-08-03', 2390, 2365, -1.44],
  ['2026-07-30', 2205, 2320, 4.83],
  ['2026-07-29', 2260, 2370, 4.48],
  ['2026-07-28', 2270, 2425, 6.44],
  ['2026-07-22', 2440, 2350, -4.08],
  ['2026-07-21', 2350, 2350, -0.39],
  ['2026-07-16', 2430, 2410, -1.21],
  ['2026-07-15', 2425, 2320, -4.72],
  ['2026-07-01', 2495, 2460, -1.79],
  ['2026-06-30', 2440, 2445, -0.19],
  ['2026-06-24', 2435, 2370, -3.06],
  ['2026-06-23', 2510, 2340, -7.16],
  ['2026-06-22', 2455, 2390, -3.04],
  ['2026-06-18', 2395, 2390, -0.6],
  ['2026-06-17', 2355, 2490, 5.34],
  ['2026-06-16', 2375, 2510, 5.29],
  ['2026-06-12', 2325, 2385, 2.19],
  ['2026-06-02', 2390, 2365, -1.44],
  ['2026-06-01', 2355, 2385, 0.88],
  ['2026-05-26', 2320, 2355, 1.12],
  ['2026-05-19', 2220, 2255, 1.19],
  ['2026-05-13', 2205, 2240, 1.2],
  ['2026-05-08', 2300, 2220, -3.87],
  ['2026-05-07', 2335, 2255, -3.82],
  ['2026-04-28', 2245, 2275, 0.95],
  ['2026-04-21', 2050, 2185, 6.2],
  ['2026-04-16', 2080, 2050, -1.83],
  ['2026-04-09', 1945, 2055, 5.27],
];

describe('BACKTEST_MIRROR 逐筆比對（與快照 JSON 相同）', () => {
  it('筆數為 29，n_trades 一致', () => {
    expect(BACKTEST_MIRROR.trades).toHaveLength(29);
    expect(BACKTEST_MIRROR.n_trades).toBe(29);
  });

  it('29 筆逐筆相同（欄位值 + 順序）', () => {
    const actual = BACKTEST_MIRROR.trades.map(
      (t) => [t.entry_date, t.entry, t.exit, t.ret_pct] as const,
    );
    expect(actual).toEqual(EXPECTED_TRADES);
  });

  it('best / worst 對齊快照', () => {
    expect(BACKTEST_MIRROR.best.entry_date).toBe('2026-07-28');
    expect(BACKTEST_MIRROR.best.ret_pct).toBe(6.44);
    expect(BACKTEST_MIRROR.worst.entry_date).toBe('2026-06-23');
    expect(BACKTEST_MIRROR.worst.ret_pct).toBe(-7.16);
  });

  it('broker_options 12 筆，逐筆對齊快照', () => {
    expect(BACKTEST_MIRROR.broker_options).toEqual([
      { trader_id: '9800', trader_name: '元大', net_lots: 86009 },
      { trader_id: '9A00', trader_name: '永豐金', net_lots: 35671 },
      { trader_id: '9100', trader_name: '群益', net_lots: 30436 },
      { trader_id: '9200', trader_name: '凱基', net_lots: 21884 },
      { trader_id: '5850', trader_name: '統一', net_lots: 19803 },
      { trader_id: '6160', trader_name: '中國信託', net_lots: 12175 },
      { trader_id: '8888', trader_name: '國泰敦南', net_lots: 9769 },
      { trader_id: '8880', trader_name: '國泰綜合', net_lots: 7864 },
      { trader_id: '8840', trader_name: '玉山', net_lots: 4372 },
      { trader_id: '9600', trader_name: '富邦', net_lots: 4206 },
      { trader_id: '1260', trader_name: '宏遠', net_lots: 3579 },
      { trader_id: '5380', trader_name: '第一金證', net_lots: 3218 },
    ]);
  });
});

describe('★total_ret_pct 是複利口徑，不是簡單加總', () => {
  const rets = BACKTEST_MIRROR.trades.map((t) => t.ret_pct);

  it('簡單加總 ≈ 4.12%（錯的口徑）', () => {
    const simpleSum = rets.reduce((acc, r) => acc + r, 0);
    expect(simpleSum).toBeCloseTo(4.12, 6);
  });

  it('複利 Π(1 + r/100) - 1 ≈ 2.2764% → 四捨五入 = 2.28%', () => {
    const compound = (rets.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
    expect(compound).toBeCloseTo(2.2764, 3);
    expect(Math.round(compound * 100) / 100).toBe(2.28);
  });

  it('mirror 的 total_ret_pct 必須等於 2.28（複利口徑），而非 4.12', () => {
    expect(BACKTEST_MIRROR.total_ret_pct).toBe(2.28);
    expect(BACKTEST_MIRROR.total_ret_pct).not.toBeCloseTo(4.12, 2);
  });
});

describe('MIRROR_META 來源標記', () => {
  it('為 site-mirror，附基準日與抓取時間', () => {
    expect(MIRROR_META.source).toBe('site-mirror');
    expect(MIRROR_META.upstream).toBe(
      'https://blackstockai.com/api/broker-backtest/2330?mode=auto',
    );
    expect(MIRROR_META.snapshot_date).toBe('2026-09-24');
    // 抓取自快照檔 mtime（2026-09-24T23:39:29+0800 = 15:39:29Z）
    expect(MIRROR_META.captured_at).toBe('2026-09-24T15:39:29.000Z');
  });

  it('覆蓋率：全部欄位為 site-mirror、自產率 0', () => {
    const cov = computeCoverageFromFields(MIRROR_FIELD_SOURCES);
    expect(cov.self_produced).toBe(0);
    expect(cov.absent).toBe(0);
    expect(cov.site_unreliable).toBe(0);
    expect(cov.site_mirror).toBe(Object.keys(MIRROR_FIELD_SOURCES).length);
    expect(cov.self_produced_ratio).toBe(0);
  });
});
