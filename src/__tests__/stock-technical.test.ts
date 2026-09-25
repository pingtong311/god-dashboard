/**
 * src/lib/stockTechnical 純函式測試
 * 覆蓋：統計工具、技術指標、風險／技術／情境三分頁 view model 組裝。
 * 所有數字皆由注入的合成日 K 推導（可手算驗證），不使用隨機值。
 */

import {
  atr,
  averageRangePct,
  buildRiskPanel,
  buildScenarioPanel,
  buildTechPanel,
  buildVolPriceSync,
  detectPivots,
  detectStructure,
  fibRetracements,
  rangePosition,
  recentSwing,
  sma,
  volumeProfilePoc,
  volumeRatio,
  type DailyCandle,
  type TechnicalInput,
} from '@/lib/stockTechnical';

/** 產生鋸齒狀（每 6 根一浪、淨 +3）日 K；高點與低點皆同步墊高（HH＋HL）。 */
function makeZigzag(count = 60): DailyCandle[] {
  const out: DailyCandle[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    const cycle = i % 6;
    price += cycle < 3 ? 2 : -1;
    out.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + i,
    });
  }
  return out;
}

describe('基礎統計工具', () => {
  it('sma 取最近 period 筆平均；不足回 null', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([2, 4, 6], 3)).toBe(4);
    expect(sma([1, 2], 5)).toBeNull();
    expect(sma([], 3)).toBeNull();
  });

  it('averageRangePct ＝ 平均 (high−low)/close×100', () => {
    const candles: DailyCandle[] = [
      { date: 'd1', open: 100, high: 102, low: 98, close: 100, volume: 1 },
      { date: 'd2', open: 100, high: 105, low: 95, close: 100, volume: 1 },
    ];
    // (4/100 + 10/100)/2 × 100 = 7
    expect(averageRangePct(candles, 20)).toBeCloseTo(7, 6);
  });

  it('atr 回傳 TR 平均與其占收盤百分比', () => {
    const candles: DailyCandle[] = [
      { date: 'd1', open: 100, high: 102, low: 98, close: 100, volume: 1 },
      { date: 'd2', open: 100, high: 104, low: 99, close: 103, volume: 1 },
    ];
    const r = atr(candles, 14);
    expect(r).not.toBeNull();
    // TR(2) = max(104−99, |104−100|, |99−100|) = 5
    expect(r!.atr).toBeCloseTo(5, 6);
    expect(r!.pct).toBeCloseTo((5 / 103) * 100, 6);
    expect(atr([], 14)).toBeNull();
  });

  it('rangePosition 近 period 日 0%＝最低、100%＝最高', () => {
    const candles: DailyCandle[] = [
      { date: 'd1', open: 100, high: 110, low: 90, close: 100, volume: 1 },
      { date: 'd2', open: 100, high: 110, low: 90, close: 100, volume: 1 },
      { date: 'd3', open: 100, high: 110, low: 90, close: 100, volume: 1 },
    ];
    // low=90, high=110, last close=100 → 50%
    expect(rangePosition(candles, 20)!.pct).toBeCloseTo(50, 6);
  });

  it('volumeRatio ＝ 最新量 ÷ 前 period 日均量', () => {
    const candles: DailyCandle[] = [
      { date: 'd1', open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { date: 'd2', open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { date: 'd3', open: 1, high: 1, low: 1, close: 1, volume: 200 },
    ];
    // 200 / avg(100,100) = 2
    expect(volumeRatio(candles, 2)).toBeCloseTo(2, 6);
    expect(volumeRatio([candles[0]], 20)).toBeNull();
  });

  it('fibRetracements 由高往低算 5 檔', () => {
    const fib = fibRetracements(110, 90);
    expect(fib).toHaveLength(5);
    expect(fib[0]).toEqual({ level: '23.6%', price: 110 - 20 * 0.236 });
    expect(fib[2].level).toBe('50%');
    expect(fib[2].price).toBeCloseTo(100, 6);
  });

  it('recentSwing 取近 N 日高低', () => {
    const candles: DailyCandle[] = [
      { date: 'd1', open: 1, high: 120, low: 80, close: 100, volume: 1 },
      { date: 'd2', open: 1, high: 110, low: 90, close: 100, volume: 1 },
    ];
    expect(recentSwing(candles, 60)).toEqual({ high: 120, low: 80 });
  });

  it('detectPivots 找出局部高低點', () => {
    const zig = makeZigzag(24);
    const { highs, lows } = detectPivots(zig, 3);
    expect(highs.length).toBeGreaterThan(0);
    expect(lows.length).toBeGreaterThan(0);
  });

  it('detectStructure：高點與低點同步墊高 → 趨勢上・順行', () => {
    const s = detectStructure(makeZigzag(60));
    expect(s).toEqual({ title: '趨勢上・順行', desc: '波段高點與低點同步墊高（HH＋HL）' });
  });

  it('detectStructure：資料太少回 null', () => {
    expect(detectStructure(makeZigzag(6))).toBeNull();
  });

  it('volumeProfilePoc 回傳最多人成交價（落在區間內）', () => {
    const candles = makeZigzag(60);
    const poc = volumeProfilePoc(candles);
    expect(poc).not.toBeNull();
    const lows = candles.map((c) => c.close);
    expect(poc!).toBeGreaterThanOrEqual(Math.min(...lows));
    expect(poc!).toBeLessThanOrEqual(Math.max(...lows));
  });

  it('buildVolPriceSync：價漲量縮 → 價漲量沒跟上', () => {
    const candles: DailyCandle[] = [];
    // 前 5 日大量、後 5 日小量；價格整體走高
    for (let i = 0; i < 5; i += 1) {
      candles.push({ date: `a${i}`, open: 100, high: 101, low: 99, close: 100 + i, volume: 2000 });
    }
    for (let i = 0; i < 5; i += 1) {
      candles.push({ date: `b${i}`, open: 100, high: 101, low: 99, close: 110 + i, volume: 800 });
    }
    const r = buildVolPriceSync(candles);
    expect(r!.label).toBe('價漲量沒跟上');
    expect(buildVolPriceSync(candles.slice(0, 5))).toBeNull();
  });
});

// ── 三分頁 view model ───────────────────────────────────

const CANDLES = makeZigzag(60);
const INPUT: TechnicalInput = {
  candles: CANDLES,
  price: CANDLES[CANDLES.length - 1].close,
  changePct: 1.5,
  volumeLots: 12989,
  foreignStreak: { days: 2, net: -4668 },
  trustStreak: { days: 3, net: -1288 },
  marginLots: 29707,
  dataDate: '2026-09-24',
};

describe('buildRiskPanel', () => {
  const panel = buildRiskPanel(INPUT);

  it('五格風險體檢且順序固定', () => {
    expect(panel.cards.map((c) => c.key)).toEqual([
      'volatility',
      'liquidity',
      'margin',
      'holders',
      'support',
    ]);
  });

  it('有來源的格子 available=true；大戶動向（週）未入庫', () => {
    expect(panel.available).toBe(true);
    expect(panel.cards.find((c) => c.key === 'volatility')!.available).toBe(true);
    expect(panel.cards.find((c) => c.key === 'liquidity')!.available).toBe(true);
    expect(panel.cards.find((c) => c.key === 'margin')!.available).toBe(true);
    expect(panel.cards.find((c) => c.key === 'support')!.available).toBe(true);
    const holders = panel.cards.find((c) => c.key === 'holders')!;
    expect(holders.available).toBe(false);
    expect(holders.desc).toContain('未入庫');
  });

  it('處置制度歷史含收盤與 20 日均量；cum6d 由呼叫端填入（此處為 null）', () => {
    expect(panel.history).not.toBeNull();
    expect(panel.history!.close).not.toBeNull();
    expect(panel.history!.avg20Volume).not.toBeNull();
    expect(panel.history!.cum6d).toBeNull();
  });

  it('無日 K 時：所有格 available=false 且 history=null', () => {
    const empty = buildRiskPanel({ ...INPUT, candles: null, price: null, volumeLots: null });
    expect(empty.available).toBe(false);
    expect(empty.history).toBeNull();
    expect(empty.cards.every((c) => !c.available)).toBe(true);
  });
});

describe('buildTechPanel', () => {
  const panel = buildTechPanel(INPUT);

  it('available=true 且有 4 條均線水位', () => {
    expect(panel.available).toBe(true);
    expect(panel.ma).toHaveLength(4);
    expect(panel.ma.map((m) => m.period)).toEqual([20, 60, 100, 120]);
  });

  it('斐波那契 5 檔且結論為合法字串', () => {
    expect(panel.fib).toHaveLength(5);
    expect(['偏多結構', '偏空結構', '中性結構']).toContain(panel.conclusion);
  });

  it('未入庫欄位誠實列出（結構線／趨勢明確度／行情醞釀／隔日條件比例）', () => {
    expect(panel.notIndexed).toEqual(
      expect.arrayContaining(['結構線', '趨勢明確度', '行情醞釀', '隔日條件比例'])
    );
  });

  it('融資維持率試算 ＝ 收盤 × 0.78，追繳距離 22%', () => {
    expect(panel.marginMaintenance).not.toBeNull();
    expect(Number(panel.marginMaintenance!.cost)).toBeCloseTo(INPUT.price! * 0.78, 1);
    expect(panel.marginMaintenance!.dropPct).toBe('22');
  });

  it('日 K 不足 20 根 → available=false 且標未入庫', () => {
    const thin = buildTechPanel({ ...INPUT, candles: makeZigzag(5) });
    expect(thin.available).toBe(false);
    expect(thin.conclusion).toBe('資料未入庫');
  });
});

describe('buildScenarioPanel', () => {
  const panel = buildScenarioPanel(INPUT);

  it('available=true，含外資／投信連賣卡', () => {
    expect(panel.available).toBe(true);
    const foreign = panel.cards.find((c) => c.key === 'foreign')!;
    const trust = panel.cards.find((c) => c.key === 'trust')!;
    expect(foreign.value).toBe('連賣 2 日');
    expect(foreign.sub).toBe('-4,668 張');
    expect(trust.value).toBe('連賣 3 日');
  });

  it('同族群卡未入庫（本站無族群即時均價來源）', () => {
    const sector = panel.cards.find((c) => c.key === 'sector')!;
    expect(sector.available).toBe(false);
  });

  it('含近日低點／高點／20 日均線／RSI 卡', () => {
    const keys = panel.cards.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['low', 'high', 'ma20', 'rsi']));
  });

  it('條列說明含法人連賣與免責句', () => {
    const text = panel.bullets.map((b) => b.text).join('\n');
    expect(text).toContain('外資連續賣超 2 日');
    expect(text).toContain('以上是已發生公開資料整理，不是投資判斷。');
  });

  it('無法人資料時：外資/投信卡未入庫且有誠實條列', () => {
    const empty = buildScenarioPanel({ ...INPUT, foreignStreak: null, trustStreak: null });
    expect(empty.cards.find((c) => c.key === 'foreign')!.available).toBe(false);
    expect(empty.bullets.some((b) => b.text.includes('未入庫'))).toBe(true);
  });
});
