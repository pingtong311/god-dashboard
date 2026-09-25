/**
 * src/lib/stockResearch 純函式測試
 * 覆蓋：格式化、色調、市場狀態、預估量、連續買賣超、累計漲跌、事實卡、研究摘要。
 */

import {
  buildFactCards,
  buildResearchSummary,
  buildStockResearchData,
  computeCumulativePct,
  computeStreak,
  deriveProjectedVolume,
  elapsedSessionMinutes,
  formatFixed,
  formatInt,
  formatSigned,
  formatSignedPct,
  formatWanLots,
  formatYi,
  marketStatus,
  priceBadge,
  toShortDate,
  toneOf,
  type RawStockInputs,
  type StockResearchData,
} from '@/lib/stockResearch';

describe('格式化工具', () => {
  it('formatInt 千分位且對 null/NaN 回 --', () => {
    expect(formatInt(12989)).toBe('12,989');
    expect(formatInt(2475)).toBe('2,475');
    expect(formatInt(null)).toBe('--');
    expect(formatInt(undefined)).toBe('--');
    expect(formatInt(Number.NaN)).toBe('--');
  });

  it('formatSigned 帶正負號', () => {
    expect(formatSigned(1036)).toBe('+1,036');
    expect(formatSigned(-4668)).toBe('-4,668');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(null)).toBe('--');
  });

  it('formatFixed 固定小數', () => {
    expect(formatFixed(87.478, 2)).toBe('87.48');
    expect(formatFixed(-1, 0)).toBe('-1');
    expect(formatFixed(null)).toBe('--');
  });

  it('formatSignedPct 百分比', () => {
    expect(formatSignedPct(2.06)).toBe('+2.06%');
    expect(formatSignedPct(-1.5)).toBe('-1.50%');
    expect(formatSignedPct(null)).toBe('--');
  });

  it('formatWanLots 以萬張為單位', () => {
    expect(formatWanLots(12989)).toBe('1.3 萬 張');
    expect(formatWanLots(29707)).toBe('3.0 萬 張');
    expect(formatWanLots(null)).toBeNull();
  });

  it('formatYi 以億為單位', () => {
    expect(formatYi(32203265000)).toBe('322.0 億');
    expect(formatYi(null)).toBeNull();
  });

  it('toShortDate 轉 MM-DD', () => {
    expect(toShortDate('2026-09-24')).toBe('09-24');
    expect(toShortDate('20260924')).toBe('20260924');
    expect(toShortDate(null)).toBe('');
  });

  it('toneOf / priceBadge', () => {
    expect(toneOf(1)).toBe('up');
    expect(toneOf(-1)).toBe('down');
    expect(toneOf(0)).toBe('flat');
    expect(toneOf(null)).toBe('flat');
    expect(priceBadge(-1)).toBe('偏弱');
    expect(priceBadge(2)).toBe('偏強');
    expect(priceBadge(0)).toBe('持平');
    expect(priceBadge(null)).toBeNull();
  });
});

describe('市場狀態（台北時間）', () => {
  it('平日盤中視為 open', () => {
    // 2026-09-24（四）台北 10:00 = UTC 02:00
    expect(marketStatus(new Date('2026-09-24T02:00:00Z'))).toBe('open');
  });
  it('收盤後視為 closed', () => {
    // 台北 13:30 之後
    expect(marketStatus(new Date('2026-09-24T05:30:00Z'))).toBe('closed');
    // 台北 08:00（開盤前）
    expect(marketStatus(new Date('2026-09-24T00:00:00Z'))).toBe('closed');
  });
  it('週末視為 closed', () => {
    // 2026-09-26 為週六
    expect(marketStatus(new Date('2026-09-26T02:00:00Z'))).toBe('closed');
  });
  it('elapsedSessionMinutes 邊界夾在 0~270', () => {
    expect(elapsedSessionMinutes(new Date('2026-09-24T01:00:00Z'))).toBe(0); // 台北 09:00
    expect(elapsedSessionMinutes(new Date('2026-09-24T02:30:00Z'))).toBe(90); // 台北 10:30
    expect(elapsedSessionMinutes(new Date('2026-09-24T06:00:00Z'))).toBe(270); // 台北 14:00 → 夾到 270
  });
});

describe('deriveProjectedVolume', () => {
  it('已收盤回實量、不預估', () => {
    const r = deriveProjectedVolume({ volumeLots: 12989, status: 'closed' });
    expect(r.status).toBe('closed');
    expect(r.actualLots).toBe(12989);
    expect(r.estimatedLots).toBeNull();
  });
  it('盤中且逾 10 分鐘才估算（累計 × 270 ÷ 分鐘）', () => {
    const r = deriveProjectedVolume({ volumeLots: 1000, status: 'open', elapsedMinutes: 60 });
    expect(r.estimatedLots).toBe(Math.round((1000 * 270) / 60)); // 4500
  });
  it('盤中前 10 分鐘不估算', () => {
    const r = deriveProjectedVolume({ volumeLots: 1000, status: 'open', elapsedMinutes: 8 });
    expect(r.estimatedLots).toBeNull();
  });
  it('無報價回 unknown', () => {
    const r = deriveProjectedVolume({ volumeLots: null, status: 'unknown' });
    expect(r.status).toBe('unknown');
    expect(r.actualLots).toBeNull();
  });
});

describe('computeStreak', () => {
  const hist = [
    { date: '2026-09-18', foreignNet: 100 },
    { date: '2026-09-19', foreignNet: -200 },
    { date: '2026-09-22', foreignNet: -300 },
    { date: '2026-09-23', foreignNet: -400 },
    { date: '2026-09-24', foreignNet: -4668 },
  ];
  it('由最新往回算連續賣超天數', () => {
    const s = computeStreak(hist, (r) => r.foreignNet);
    expect(s).toEqual({ days: 4, net: -4668 });
  });
  it('最新一日為 0 回 null', () => {
    const s = computeStreak([{ date: '2026-09-24', foreignNet: 0 }], (r) => r.foreignNet);
    expect(s).toBeNull();
  });
  it('空陣列回 null', () => {
    expect(computeStreak<{ date: string }>([], () => 0)).toBeNull();
  });
});

describe('computeCumulativePct', () => {
  const closes = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-09-${String(16 + i).padStart(2, '0')}`,
    close: 100 + i, // 100..106
  }));
  it('近 6 日累計 = 末/起 − 1', () => {
    const r = computeCumulativePct(closes, 6);
    // 起 = 100（第 1 筆），末 = 106 → +6%
    expect(r.samples).toBe(6);
    expect(r.pct).toBeCloseTo(6, 2);
  });
  it('樣本不足 2 筆回 null', () => {
    expect(computeCumulativePct([{ date: '2026-09-24', close: 100 }], 6).pct).toBeNull();
    expect(computeCumulativePct(null, 6).pct).toBeNull();
  });
});

// ── 組裝與卡片 ──────────────────────────────────────────

const RAW: RawStockInputs = {
  quote: {
    price: 2475,
    changePct: -1,
    open: 2480,
    high: 2490,
    low: 2470,
    prevClose: 2500,
    volumeLots: 12989,
    tradeDate: '2026-09-24',
    asOf: '13:30',
    name: '台積電',
  },
  institutionalHistory: [
    { date: '2026-09-23', foreignNet: -100, trustNet: -10, dealerNet: 5, totalNet: -105 },
    { date: '2026-09-24', foreignNet: -4668, trustNet: -1288, dealerNet: 2718, totalNet: -3238 },
  ],
  marginHistory: [{ date: '2026-09-24', marginBalance: 29707, shortBalance: 16 }],
  tdcc: [
    { level: '100-1000張', lots: 1000, pct: 5 },
    { level: '1000張以上', lots: 2000, pct: 84.7 },
  ],
  concentration: 0.847,
  fundamental: {
    peRatio: 28.69,
    pbRatio: 9.98,
    dividendYield: 0.89,
    monthlyRevenue: 514805000000,
    monthlyRevenueYoY: 10.1,
    asOfDate: '2026-08',
  },
  dailyCloses: [
    { date: '2026-09-16', close: 2400 },
    { date: '2026-09-17', close: 2410 },
    { date: '2026-09-18', close: 2420 },
    { date: '2026-09-19', close: 2430 },
    { date: '2026-09-22', close: 2440 },
    { date: '2026-09-23', close: 2500 },
    { date: '2026-09-24', close: 2475 },
  ],
};

describe('buildStockResearchData', () => {
  const now = new Date('2026-09-24T06:00:00Z'); // 台北 14:00 → 已收盤
  const data: StockResearchData = buildStockResearchData('2330', RAW, now);

  it('基本欄位與來源', () => {
    expect(data.ticker).toBe('2330');
    expect(data.name).toBe('台積電');
    expect(data.dataDate).toBe('2026-09-24');
    expect(data.industry).toBeNull();
    expect(data.sources.length).toBeGreaterThan(0);
  });

  it('法人/資券/集保/估值/營收推導正確', () => {
    expect(data.institutional.foreignNet).toBe(-4668);
    expect(data.institutional.foreignStreak).toEqual({ days: 2, net: -4668 });
    expect(data.margin.marginLots).toBe(29707);
    expect(data.holders.bigPct).toBe(84.7);
    expect(data.valuation.per).toBe(28.69);
    expect(data.revenue.revenueYi).toBeCloseTo(5148.05, 2);
  });

  it('已收盤 → 預估量不估算', () => {
    expect(data.projected.status).toBe('closed');
    expect(data.projected.estimatedLots).toBeNull();
  });

  it('成交額（億）由價 × 量推導', () => {
    // 2475 × 12989 × 1000 / 1e8
    expect(data.turnover.amountYi).toBeCloseTo((2475 * 12989 * 1000) / 1e8, 1);
    expect(data.turnover.rank).toBeNull();
  });

  it('缺來源時欄位一律 null（不補 0）', () => {
    const empty = buildStockResearchData('2330', {
      quote: null,
      institutionalHistory: [],
      marginHistory: [],
      tdcc: null,
      concentration: null,
      fundamental: null,
      dailyCloses: null,
    });
    expect(empty.institutional.foreignNet).toBeNull();
    expect(empty.margin.marginLots).toBeNull();
    expect(empty.holders.bigPct).toBeNull();
    expect(empty.valuation.per).toBeNull();
    expect(empty.revenue.revenueYi).toBeNull();
    expect(empty.cum6dPct).toBeNull();
  });
});

describe('buildFactCards', () => {
  const now = new Date('2026-09-24T06:00:00Z');
  const data = buildStockResearchData('2330', RAW, now);
  const cards = buildFactCards(data);

  it('共 8 張卡且順序固定', () => {
    expect(cards.map((c) => c.key)).toEqual([
      'price',
      'institutional',
      'broker',
      'holder',
      'daytrade',
      'margin',
      'chipHealth',
      'regulatory',
    ]);
  });

  it('價量卡：偏弱 + 現價（-1%）+ 量 1.3 萬', () => {
    const price = cards[0];
    expect(price.badge).toBe('偏弱');
    expect(price.badgeTone).toBe('down');
    expect(price.value).toBe('2,475（-1%）');
    expect(price.sub).toBe('偏弱 · 量 1.3 萬 張');
    expect(price.available).toBe(true);
  });

  it('無公開來源的卡片標示未入庫', () => {
    const broker = cards.find((c) => c.key === 'broker')!;
    const daytrade = cards.find((c) => c.key === 'daytrade')!;
    const chipHealth = cards.find((c) => c.key === 'chipHealth')!;
    expect(broker.available).toBe(false);
    expect(broker.value).toBeNull();
    expect(daytrade.available).toBe(false);
    expect(chipHealth.available).toBe(false);
  });

  it('三大法人 / 融資券 / 大戶級距 / 監理 有真實值', () => {
    expect(cards.find((c) => c.key === 'institutional')!.value).toBe('外資 -4,668 張');
    expect(cards.find((c) => c.key === 'margin')!.value).toBe('融資 3.0 萬 張');
    expect(cards.find((c) => c.key === 'holder')!.value).toBe('1000張+ 佔 84.70%');
    expect(cards.find((c) => c.key === 'regulatory')!.value).toContain('6 日累計');
  });
});

describe('buildResearchSummary', () => {
  const now = new Date('2026-09-24T06:00:00Z');
  const data = buildStockResearchData('2330', RAW, now);
  const lines = buildResearchSummary(data);

  it('每條都有 label 與 available 旗標', () => {
    expect(lines.length).toBe(6);
    for (const l of lines) {
      expect(typeof l.label).toBe('string');
      expect(typeof l.available).toBe('boolean');
      expect(typeof l.text).toBe('string');
    }
  });

  it('法人連賣字串含連賣天數', () => {
    const inst = lines.find((l) => l.label.includes('法人連買／連賣'))!;
    expect(inst.available).toBe(true);
    expect(inst.text).toContain('外資連賣約 2 日');
  });

  it('估值與月營收有真實值', () => {
    expect(lines.find((l) => l.label === '估值')!.text).toContain('本益比 28.69');
    expect(lines.find((l) => l.label === '月營收')!.text).toContain('5148.05 億');
  });

  it('分點條件未入庫', () => {
    expect(lines.find((l) => l.label === '分點條件')!.available).toBe(false);
  });
});
