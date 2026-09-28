/**
 * swingConditions 單元測試
 * ----------------------------------------------------------------------------
 * 以合成資料測試 15 個可自產條件的「正例 + 負例」，並驗證：
 *   - TDCC 兩個必踩的坑（證券代號右補空格、資料日期 key 帶 BOM）皆正確處理。
 *   - 各上游列解析函式（T86 / MI_MARGN / 月營收 / 除權息）形狀正確。
 * 全程不觸及網路。
 */

import {
  buildCodeSeries,
  changePctFromSeries,
  computeBothBuy,
  computeBreak20,
  computeFill,
  computeInstitutionalStreak,
  computeMa60,
  computeMarginDrop,
  computePullback,
  computeReclaim,
  computeRevenue,
  computeRs,
  computeSector,
  computeSmart,
  computeWhale,
  extractRefPrice,
  formatRocMonth,
  isCommonStockCode,
  normalizeKeys,
  parseExRightRows,
  parseMarginRows,
  parseRevenueRows,
  parseRocDate,
  parseT86Rows,
  parseTdccRows,
  type CodeSeriesMap,
  type ConditionContext,
  type DatedBar,
  type ExRightRow,
  type RevenueRow,
  type StockMetaMap,
  type T86Day,
  type WhaleGrade,
} from '../swingConditions';
import type { CompactBar } from '../marketBars';

// ---------------------------------------------------------------------------
// 測試替身工具
// ---------------------------------------------------------------------------

/** 由 2026-01-01 起第 i 天的 'YYYY-MM-DD'（確保升冪且唯一）。 */
function ymd(i: number): string {
  return new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
}

/** 建立單一個股的日 K 序列（自指定起始日）。 */
function barsFrom(code: string, startIso: string, closes: number[], volumes?: number[]): DatedBar[] {
  const base = new Date(`${startIso}T00:00:00Z`).getTime();
  return closes.map((c, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    code,
    open: c,
    high: c,
    low: c,
    close: c,
    volumeLots: volumes?.[i] ?? 1000,
  }));
}

/** 建立單一個股的日 K 序列。 */
function bars(code: string, closes: number[], opts?: { volumes?: number[]; highs?: number[] }): DatedBar[] {
  return closes.map((c, i) => ({
    date: ymd(i),
    code,
    open: c,
    high: opts?.highs?.[i] ?? c,
    low: c,
    close: c,
    volumeLots: opts?.volumes?.[i] ?? 1000,
  }));
}

/** 以單一 code 建立 CodeSeriesMap。 */
function seriesOf(code: string, closes: number[], opts?: { volumes?: number[]; highs?: number[] }): CodeSeriesMap {
  return new Map([[code, bars(code, closes, opts)]]);
}

/** 建立 context。 */
function ctxOf(series: CodeSeriesMap, meta: StockMetaMap = new Map(), asOf = '2026-09-24'): ConditionContext {
  return { series, meta, asOf };
}

/** 產生遞增/遞減的收盤序列。 */
function ramp(start: number, step: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/** 產生固定值的收盤序列。 */
function flat(v: number, n: number): number[] {
  return Array.from({ length: n }, () => v);
}

// ===========================================================================
// 工具函式
// ===========================================================================

describe('工具函式', () => {
  it('isCommonStockCode 僅接受 4 碼數字', () => {
    expect(isCommonStockCode('2330')).toBe(true);
    expect(isCommonStockCode('0050')).toBe(true);
    expect(isCommonStockCode('00878')).toBe(false); // 5 碼 ETF
    expect(isCommonStockCode('031234')).toBe(false); // 權證
    expect(isCommonStockCode('2330 ')).toBe(false); // 未 trim
  });

  it('normalizeKeys 去除 key 的 BOM 前綴', () => {
    const out = normalizeKeys({ '\ufeff資料日期': '20260924', 持股分級: '12' });
    expect(out['資料日期']).toBe('20260924');
    expect(out['持股分級']).toBe('12');
  });

  it('buildCodeSeries 展開 twse 與 tpex，且序列升冪', () => {
    const dayLate: { date: string; twse: CompactBar[]; tpex: CompactBar[] } = {
      date: '2026-01-02',
      twse: [['2330', 100, 101, 99, 100.5, 2000]],
      tpex: [],
    };
    const dayEarly: { date: string; twse: CompactBar[]; tpex: CompactBar[] } = {
      date: '2026-01-01',
      twse: [['2330', 99, 100, 98, 99, 1500]],
      tpex: [],
    };
    // 故意顛倒輸入順序，驗證會重新排序為升冪。
    const series = buildCodeSeries([dayLate, dayEarly]);
    const arr = series.get('2330');
    expect(arr).toBeDefined();
    expect(arr?.map((b) => b.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(arr?.[1].close).toBe(100.5);
  });

  it('changePctFromSeries 不足兩日回 null', () => {
    expect(changePctFromSeries(bars('2330', [100]))).toBeNull();
    expect(changePctFromSeries(bars('2330', [100, 110]))).toBe(10);
  });

  it('formatRocMonth / parseRocDate', () => {
    expect(formatRocMonth('11508')).toBe('2026-08');
    expect(parseRocDate('115年09月23日')).toBe('2026-09-23');
    expect(parseRocDate('bad')).toBeNull();
  });
});

// ===========================================================================
// 1. ma60
// ===========================================================================

describe('computeMa60 收盤／月線／季線排列', () => {
  it('正例：線性上升時 close > MA20 > MA60 且 MA20 增加', () => {
    const series = seriesOf('2330', ramp(100, 1, 80));
    const out = computeMa60(ctxOf(series));
    expect(out).toHaveLength(1);
    expect(out[0].stock_id).toBe('2330');
    expect(out[0].close).toBeGreaterThan(out[0].ma20 ?? 0);
    expect(out[0].ma20).toBeGreaterThan(out[0].ma60 ?? 0);
  });

  it('負例：線性下降時不符合', () => {
    const series = seriesOf('2330', ramp(200, -1, 80));
    expect(computeMa60(ctxOf(series))).toHaveLength(0);
  });

  it('負例：資料不足 61 日', () => {
    const series = seriesOf('2330', ramp(100, 1, 40));
    expect(computeMa60(ctxOf(series))).toHaveLength(0);
  });
});

// ===========================================================================
// 2. pullback
// ===========================================================================

describe('computePullback 距月線正負 2%', () => {
  it('正例：收盤略高於月線且在 2% 內、且高於季線', () => {
    // 20 日 100 → 月線 100、季線亦約 100；最後收 101（距月線 +1%）。
    const closes = [...flat(100, 60), 101];
    const series = seriesOf('2330', closes);
    const out = computePullback(ctxOf(series));
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(101);
  });

  it('負例：收盤遠離月線（> 2%）', () => {
    const closes = [...flat(100, 60), 130];
    expect(computePullback(ctxOf(seriesOf('2330', closes)))).toHaveLength(0);
  });

  it('負例：收盤低於季線', () => {
    const closes = [...flat(100, 60), 95];
    expect(computePullback(ctxOf(seriesOf('2330', closes)))).toHaveLength(0);
  });
});

// ===========================================================================
// 3. reclaim
// ===========================================================================

describe('computeReclaim 收盤由月線下方轉為上方', () => {
  it('正例：前日收盤 < 月線、當日收盤 > 月線', () => {
    const closes = [...flat(100, 20), ...flat(90, 4), 105];
    const out = computeReclaim(ctxOf(seriesOf('2330', closes)));
    expect(out).toHaveLength(1);
    expect(out[0].stock_id).toBe('2330');
  });

  it('負例：前日收盤已在月線之上', () => {
    const closes = ramp(100, 1, 30);
    expect(computeReclaim(ctxOf(seriesOf('2330', closes)))).toHaveLength(0);
  });
});

// ===========================================================================
// 4. break20
// ===========================================================================

describe('computeBreak20 20 日新高且量增', () => {
  it('正例：收盤突破前 20 日高且量為均量 2 倍', () => {
    const closes = [...flat(100, 20), 105];
    const highs = [...flat(100, 20), 110];
    const volumes = [...flat(1000, 20), 2000];
    const out = computeBreak20(ctxOf(seriesOf('2330', closes, { highs, volumes })));
    expect(out).toHaveLength(1);
    expect(out[0].vol_ratio).toBeGreaterThanOrEqual(1.5);
  });

  it('負例：收盤未突破前 20 日高', () => {
    const closes = [...flat(100, 20), 99];
    const volumes = [...flat(1000, 20), 2000];
    expect(computeBreak20(ctxOf(seriesOf('2330', closes, { volumes })))).toHaveLength(0);
  });

  it('負例：突破但量未達 1.5 倍', () => {
    const closes = [...flat(100, 20), 105];
    const volumes = [...flat(1000, 20), 1000];
    expect(computeBreak20(ctxOf(seriesOf('2330', closes, { volumes })))).toHaveLength(0);
  });
});

// ===========================================================================
// 5. rs
// ===========================================================================

describe('computeRs 20 日區間報酬排序', () => {
  it('正例：20 日報酬 30% 且量能足夠', () => {
    const closes = [...flat(100, 20), 130];
    const out = computeRs(ctxOf(seriesOf('2330', closes, { volumes: flat(1000, 21) })));
    expect(out).toHaveLength(1);
    expect(out[0].ret20).toBeCloseTo(30, 1);
  });

  it('負例：報酬未達門檻', () => {
    const closes = [...flat(100, 20), 105];
    expect(computeRs(ctxOf(seriesOf('2330', closes, { volumes: flat(1000, 21) })))).toHaveLength(0);
  });

  it('負例：量能不足', () => {
    const closes = [...flat(100, 20), 130];
    expect(computeRs(ctxOf(seriesOf('2330', closes, { volumes: flat(10, 21) })))).toHaveLength(0);
  });
});

// ===========================================================================
// 6. sector
// ===========================================================================

describe('computeSector 族群 20 日報酬排序', () => {
  const meta = new Map([
    ['2330', { name: '台積電', industry: '半導體業' }],
    ['2317', { name: '鴻海', industry: '半導體業' }],
  ]);

  it('正例：同族群個股與族群平均皆達門檻', () => {
    const series = new Map<string, DatedBar[]>([
      ['2330', bars('2330', [...flat(100, 20), 130])],
      ['2317', bars('2317', [...flat(100, 20), 125])],
    ]);
    const out = computeSector(ctxOf(series, meta));
    expect(out.length).toBe(2);
    expect(out[0].ret20).toBeGreaterThanOrEqual(out[1].ret20 ?? 0);
  });

  it('負例：族群平均未達門檻（僅一檔強、另一檔拖累）', () => {
    const series = new Map<string, DatedBar[]>([
      ['2330', bars('2330', [...flat(100, 20), 130])], // +30%
      ['2317', bars('2317', [...flat(100, 20), 70])], // -30% → 族群平均 0%
    ]);
    const out = computeSector(ctxOf(series, meta));
    expect(out).toHaveLength(0);
  });

  it('負例：無產業地圖時回空', () => {
    const series = seriesOf('2330', [...flat(100, 20), 130]);
    expect(computeSector(ctxOf(series))).toHaveLength(0);
  });
});

// ===========================================================================
// 7 & 8. foreign / trust 連買
// ===========================================================================

describe('computeInstitutionalStreak 外資／投信連買', () => {
  function day(date: string, items: T86Day['items']): T86Day {
    return { date, items };
  }

  const days: T86Day[] = [
    day('2026-09-22', [
      { symbol: '2330', name: '台積電', foreignNet: 100, trustNet: 10, dealerNet: 0, totalNet: 110 },
      { symbol: '2317', name: '鴻海', foreignNet: 100, trustNet: 10, dealerNet: 0, totalNet: 110 },
      { symbol: '2454', name: '聯發科', foreignNet: 100, trustNet: 10, dealerNet: 0, totalNet: 110 },
    ]),
    day('2026-09-23', [
      { symbol: '2330', name: '台積電', foreignNet: 200, trustNet: 20, dealerNet: 0, totalNet: 220 },
      { symbol: '2317', name: '鴻海', foreignNet: -50, trustNet: 20, dealerNet: 0, totalNet: -30 },
      { symbol: '2454', name: '聯發科', foreignNet: 200, trustNet: -5, dealerNet: 0, totalNet: 195 },
    ]),
    day('2026-09-24', [
      { symbol: '2330', name: '台積電', foreignNet: 300, trustNet: 30, dealerNet: 0, totalNet: 330 },
      { symbol: '2317', name: '鴻海', foreignNet: 100, trustNet: 30, dealerNet: 0, totalNet: 130 },
      { symbol: '2454', name: '聯發科', foreignNet: 100, trustNet: 30, dealerNet: 0, totalNet: 130 },
    ]),
  ];

  it('外資連買：正例 2330/2454（三日皆買超），負例 2317（中斷）', () => {
    const out = computeInstitutionalStreak(ctxOf(new Map()), days, 'foreignNet');
    const ids = out.map((x) => x.stock_id);
    expect(ids).toContain('2330');
    expect(ids).toContain('2454');
    expect(ids).not.toContain('2317');
  });

  it('投信連買：正例 2317（三日皆買超），負例 2454（中斷）', () => {
    const out = computeInstitutionalStreak(ctxOf(new Map()), days, 'trustNet');
    const ids = out.map((x) => x.stock_id);
    expect(ids).toContain('2317');
    expect(ids).not.toContain('2454');
  });

  it('負例：資料日不足 3 日 → 回空', () => {
    expect(computeInstitutionalStreak(ctxOf(new Map()), days.slice(0, 2), 'foreignNet')).toHaveLength(0);
  });
});

// ===========================================================================
// 9. both
// ===========================================================================

describe('computeBothBuy 雙法人同買', () => {
  const latest: T86Day = {
    date: '2026-09-24',
    items: [
      { symbol: '2330', name: '台積電', foreignNet: 300, trustNet: 30, dealerNet: 0, totalNet: 330 },
      { symbol: '2317', name: '鴻海', foreignNet: 100, trustNet: -5, dealerNet: 0, totalNet: 95 },
    ],
  };

  it('正例：外資與投信同買（2330）；負例：投信賣（2317）', () => {
    const out = computeBothBuy(ctxOf(new Map()), latest);
    const ids = out.map((x) => x.stock_id);
    expect(ids).toEqual(['2330']);
  });
});

// ===========================================================================
// 10. margin
// ===========================================================================

describe('computeMarginDrop 融資餘額下降', () => {
  it('正例：較 20 交易日前下降 1000 張；負例：未下降', () => {
    const today = new Map([
      ['2330', 8000],
      ['2317', 9000],
    ]);
    const baseline = new Map([
      ['2330', 9000], // -1000 → 下降
      ['2317', 9000], // 0 → 未下降
    ]);
    const out = computeMarginDrop(ctxOf(new Map()), today, baseline);
    const ids = out.map((x) => x.stock_id);
    expect(ids).toEqual(['2330']);
    expect(out[0].margin_delta_lots).toBe(-1000);
  });

  it('負例：降幅未達門檻（< 50 張）', () => {
    const today = new Map([['2330', 8980]]);
    const baseline = new Map([['2330', 9000]]); // -20 → 未達 50
    expect(computeMarginDrop(ctxOf(new Map()), today, baseline)).toHaveLength(0);
  });

  it('負例：基準日無此代號 → 跳過', () => {
    const today = new Map([['2330', 1000]]);
    expect(computeMarginDrop(ctxOf(new Map()), today, new Map())).toHaveLength(0);
  });
});

// ===========================================================================
// 11. revenue
// ===========================================================================

describe('computeRevenue 月營收增減條件', () => {
  it('正例：MoM 與 YoY 皆為正；負例：MoM 為負', () => {
    const rows: RevenueRow[] = [
      { code: '2330', name: '台積電', industry: '半導體業', momPct: 5, yoyPct: 10, month: '2026-08' },
      { code: '2317', name: '鴻海', industry: '其他電子業', momPct: -3, yoyPct: 8, month: '2026-08' },
    ];
    const out = computeRevenue(rows);
    const ids = out.map((x) => x.stock_id);
    expect(ids).toEqual(['2330']);
    expect(out[0].hint).toContain('MoM +5.0%');
  });

  it('負例：資料缺漏（MoM 為 null）', () => {
    expect(computeRevenue([{ code: '2330', name: '台積電', momPct: null, yoyPct: 10 }])).toHaveLength(0);
  });
});

// ===========================================================================
// 12. fill
// ===========================================================================

describe('computeFill 除權息填息', () => {
  const asOf = '2026-09-24';
  // 除權息需「已發生」，故日 K 日期須落在 exDate 之後（用 9 月日期）。
  const sepSeries = (): CodeSeriesMap =>
    new Map([['6133', barsFrom('6133', '2026-09-01', [...flat(20, 30), 25.95])]]);

  it('正例：已除權息且收盤高於參考價', () => {
    const rows: ExRightRow[] = [{ code: '6133', name: '金橋', exDate: '2026-09-09', refPrice: 23.5 }];
    const out = computeFill(ctxOf(sepSeries(), new Map(), asOf), rows);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(25.95);
  });

  it('負例：除權息日尚未到（exDate > asOf）→ 無法計算', () => {
    const rows: ExRightRow[] = [{ code: '6133', name: '金橋', exDate: '2026-10-08', refPrice: 23.5 }];
    expect(computeFill(ctxOf(sepSeries(), new Map(), asOf), rows)).toHaveLength(0);
  });

  it('負例：參考價缺漏（待公告）', () => {
    const rows: ExRightRow[] = [{ code: '6133', name: '金橋', exDate: '2026-09-09', refPrice: null }];
    expect(computeFill(ctxOf(sepSeries(), new Map(), asOf), rows)).toHaveLength(0);
  });

  it('負例：貼息（收盤低於參考價）', () => {
    const series = new Map([['6133', barsFrom('6133', '2026-09-01', [...flat(20, 30), 20])]]);
    const rows: ExRightRow[] = [{ code: '6133', name: '金橋', exDate: '2026-09-09', refPrice: 23.5 }];
    expect(computeFill(ctxOf(series, new Map(), asOf), rows)).toHaveLength(0);
  });
});

// ===========================================================================
// 13. whale
// ===========================================================================

describe('computeWhale 大戶持股', () => {
  it('正例：big_pct > 0 列入；big_pct = 0 排除；不產生 hint（對齊實站 DOM）', () => {
    const whale = new Map<string, WhaleGrade>([
      ['2520', { bigPct: 75.26, kPct: 71.3, date: '2026-09-18' }],
      ['9999', { bigPct: 0, kPct: 0, date: '2026-09-18' }],
    ]);
    const out = computeWhale(ctxOf(new Map()), whale, 1);
    expect(out).toHaveLength(1);
    expect(out[0].stock_id).toBe('2520');
    expect(out[0].big_pct).toBe(75.26);
    expect(out[0].k_pct).toBe(71.3);
    expect(out[0].hint).toBeUndefined();
  });

  it('無 fallback：delta/up_weeks 為 null（累積中），weeks 回累積週數', () => {
    const whale = new Map<string, WhaleGrade>([['2520', { bigPct: 75.26, kPct: 71.3, date: '2026-09-18' }]]);
    const out = computeWhale(ctxOf(new Map()), whale, 1);
    expect(out[0].delta_1w).toBeNull();
    expect(out[0].delta_4w).toBeNull();
    expect(out[0].up_weeks).toBeNull();
    expect(out[0].weeks).toBe(1);
  });

  it('有 site-mirror fallback：填入週序列；查無對應代號維持 null', () => {
    const whale = new Map<string, WhaleGrade>([
      ['2520', { bigPct: 75.26, kPct: 71.3, date: '2026-09-18' }],
      ['8888', { bigPct: 50, kPct: 40, date: '2026-09-18' }],
    ]);
    const fallback = new Map([
      ['2520', { delta_1w: 0.41, delta_4w: 1.09, up_weeks: 12, down_weeks: 0, weeks: 15 }],
    ]);
    const out = computeWhale(ctxOf(new Map()), whale, 1, fallback);
    const byId = Object.fromEntries(out.map((x) => [x.stock_id, x]));
    expect(byId['2520'].delta_1w).toBe(0.41);
    expect(byId['2520'].delta_4w).toBe(1.09);
    expect(byId['2520'].up_weeks).toBe(12);
    expect(byId['2520'].weeks).toBe(15);
    expect(byId['8888'].delta_4w).toBeNull(); // 快照查無 → 累積中
  });
});

// ===========================================================================
// 14. smart
// ===========================================================================

describe('computeSmart 融資／大戶／量價交集', () => {
  function smartSeries(): CodeSeriesMap {
    // 41 日：前 40 日 100、最後一日 130（量 2000 vs 前 20 日均量 1000 → 量比 2）
    const closes = [...flat(100, 40), 130];
    const volumes = [...flat(1000, 40), 2000];
    return seriesOf('4721', closes, { volumes });
  }

  it('正例：融資下降 + 大戶比例達門檻 + 量比達門檻', () => {
    const marginDelta = new Map([['4721', -500]]);
    const whale = new Map<string, WhaleGrade>([['4721', { bigPct: 55, kPct: 50, date: '2026-09-18' }]]);
    const out = computeSmart(ctxOf(smartSeries()), marginDelta, whale);
    expect(out).toHaveLength(1);
    expect(out[0].stock_id).toBe('4721');
    expect(out[0].whale_delta_pct).toBeNull();
  });

  it('負例：大戶比例未達門檻', () => {
    const marginDelta = new Map([['4721', -500]]);
    const whale = new Map<string, WhaleGrade>([['4721', { bigPct: 10, kPct: 5, date: '2026-09-18' }]]);
    expect(computeSmart(ctxOf(smartSeries()), marginDelta, whale)).toHaveLength(0);
  });

  it('負例：融資未下降', () => {
    const marginDelta = new Map([['4721', 100]]);
    const whale = new Map<string, WhaleGrade>([['4721', { bigPct: 55, kPct: 50, date: '2026-09-18' }]]);
    expect(computeSmart(ctxOf(smartSeries()), marginDelta, whale)).toHaveLength(0);
  });
});

// ===========================================================================
// 上游列解析（含 TDCC 兩個必踩的坑）
// ===========================================================================

describe('parseTdccRows（TDCC 兩坑）', () => {
  it('正確處理「證券代號右補空格」與「資料日期 key 帶 BOM」', () => {
    const raw = [
      { 證券代號: '2330  ', '占集保庫存數比例%': '1.09', 人數: '100', '\ufeff資料日期': '20260924', 股數: '1000', 持股分級: '12' },
      { 證券代號: '2330  ', '占集保庫存數比例%': '0.92', 人數: '100', '\ufeff資料日期': '20260924', 股數: '1000', 持股分級: '13' },
      { 證券代號: '2330  ', '占集保庫存數比例%': '0.75', 人數: '100', '\ufeff資料日期': '20260924', 股數: '1000', 持股分級: '14' },
      { 證券代號: '2330  ', '占集保庫存數比例%': '84.77', 人數: '100', '\ufeff資料日期': '20260924', 股數: '1000', 持股分級: '15' },
      { 證券代號: '2330  ', '占集保庫存數比例%': '0.00', 人數: '0', '\ufeff資料日期': '20260924', 股數: '0', 持股分級: '16' },
      { 證券代號: '2330  ', '占集保庫存數比例%': '100.00', 人數: '0', '\ufeff資料日期': '20260924', 股數: '0', 持股分級: '17' },
    ];
    const map = parseTdccRows(raw);
    const g = map.get('2330');
    expect(g).toBeDefined();
    // 12+13+14+15 = 1.09 + 0.92 + 0.75 + 84.77 = 87.53（16/17 已排除）
    expect(g?.bigPct).toBeCloseTo(87.53, 2);
    // 千張以上 = 分級 15
    expect(g?.kPct).toBeCloseTo(84.77, 2);
    // 日期 BOM 已被去除、正確取值
    expect(g?.date).toBe('20260924');
    // 未 trim 會拿到空 key → 此斷言確保 trim 生效
    expect(map.has('2330  ')).toBe(false);
  });

  it('負例：非陣列輸入回空 Map', () => {
    expect(parseTdccRows(null).size).toBe(0);
    expect(parseTdccRows({}).size).toBe(0);
  });
});

describe('parseT86Rows', () => {
  it('正確解析 19 欄列並換算為張', () => {
    const row = Array.from({ length: 19 }, () => '0');
    row[0] = '2330';
    row[1] = '台積電  ';
    row[4] = '6,039,352';
    row[10] = '478,401';
    row[11] = '1,361,432';
    row[18] = '7,879,185';
    const out = parseT86Rows({ data: [row] });
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('2330');
    expect(out[0].name).toBe('台積電');
    expect(out[0].foreignNet).toBe(6039);
    expect(out[0].trustNet).toBe(478);
  });

  it('負例：欄位不足的畸形列被略過', () => {
    expect(parseT86Rows({ data: [['2330', 'x']] })).toHaveLength(0);
  });
});

describe('parseMarginRows', () => {
  it('相容 OpenAPI（股票代號）、rwd 物件（代號）與 rwd 陣列（index 6）三種形狀', () => {
    const out = parseMarginRows([
      { 股票代號: '2330', 融資今日餘額: '8,000' },
      { 代號: '2317', 融資今日餘額: '9,000' },
      ['00400A', '主動國泰', '225', '250', '5', '8,027', '7,997'], // rwd 陣列列
    ]);
    expect(out.get('2330')).toBe(8000);
    expect(out.get('2317')).toBe(9000);
    expect(out.get('00400A')).toBe(7997); // index 6 = 融資今日餘額
  });
});

describe('parseRevenueRows / parseExRightRows', () => {
  it('月營收列解析出 MoM/YoY/產業', () => {
    const out = parseRevenueRows([
      { 公司代號: '2330', 公司名稱: '台積電', 產業別: '半導體業', '營業收入-上月比較增減(%)': '5.5', '營業收入-去年同月增減(%)': '10.2', 資料年月: '11508' },
    ]);
    expect(out[0].momPct).toBeCloseTo(5.5);
    expect(out[0].yoyPct).toBeCloseTo(10.2);
    expect(out[0].industry).toBe('半導體業');
    expect(out[0].month).toBe('2026-08');
  });

  it('除權息列：民國日期解析 + 參考價 HTML/待公告處理', () => {
    const out = parseExRightRows({
      data: [
        ['115年09月23日', '00930', '永豐ESG低碳高息', '息', '0', '0', '0', '0.81500000', 'x', '23.50'],
        ['115年10月08日', '00400A', '主動國泰', '息', '0', '0', '0', '0', '<p>待公告</p>', '<p style="text-align:center;">待公告實際收益分配金額</p>'],
      ],
    });
    expect(out[0].exDate).toBe('2026-09-23');
    expect(out[0].refPrice).toBe(23.5);
    expect(out[1].refPrice).toBeNull(); // 待公告 → 無參考價
    expect(extractRefPrice('<p>12.34</p>')).toBe(12.34);
    expect(extractRefPrice('待公告')).toBeNull();
  });
});
