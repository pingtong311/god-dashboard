/**
 * patternScan 單元測試
 * ----------------------------------------------------------------------------
 * 全部使用「人工造出來的合成 K 線序列」驗證，不觸及網路／KV：
 *   - 每個型態偵測器都有【正例】（造出該型態 → 偵測到）
 *     與【負例】（相似但不符合 → 不誤判）。
 *   - 另測序列累積器、轉折點偵測、掃描宇宙、型態閘門與結果列組裝。
 */

import {
  MIN_BARS_FOR_SCAN,
  PATTERN_ORDER,
  PATTERN_UNIVERSE_STOCKS_ONLY,
  buildPatternItem,
  createSeriesBuilder,
  detectBottomTrap,
  detectFalseBreak,
  detectHeadShouldersTop,
  detectInverseHeadShoulders,
  detectMTop,
  detectPatterns,
  detectPivotPoints,
  detectTriangle,
  detectWBottom,
  groupHitsByPattern,
  isScannableCode,
  scanSeriesList,
  toZigzag,
  zigzagOf,
  type PriceSeries,
} from '../patternScan';
import type { Bar } from '../marketBars';

// ---------------------------------------------------------------------------
// 合成序列工具
// ---------------------------------------------------------------------------

/**
 * 由「轉折路徑」線性內插出收盤序列。
 * waypoints 需依 index 升冪，第一個 index 應為 0、最後一個 index 應為 length-1。
 */
function buildCloses(waypoints: Array<[number, number]>, length: number): number[] {
  const closes = new Array<number>(length).fill(waypoints[0][1]);
  let seg = 0;
  for (let i = 0; i < length; i += 1) {
    while (seg < waypoints.length - 2 && i > waypoints[seg + 1][0]) seg += 1;
    const [i0, p0] = waypoints[seg];
    const [i1, p1] = waypoints[seg + 1];
    const t = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
    const clamped = Math.min(1, Math.max(0, t));
    closes[i] = p0 + (p1 - p0) * clamped;
  }
  return closes;
}

/** 由收盤路徑造出序列（high=close+offset、low=close-offset）。 */
function makeSeries(
  waypoints: Array<[number, number]>,
  length: number,
  offset = 0.5,
): PriceSeries {
  const closes = buildCloses(waypoints, length);
  return {
    code: 'TEST',
    highs: closes.map((c) => c + offset),
    lows: closes.map((c) => c - offset),
    closes,
    volumes: closes.map(() => 5000),
  };
}

// ---------------------------------------------------------------------------
// 轉折點與鋸齒
// ---------------------------------------------------------------------------

describe('轉折點偵測', () => {
  it('在一座「山」上找到一個高點與一個低點', () => {
    const series = makeSeries(
      [
        [0, 100],
        [10, 120],
        [20, 90],
        [29, 110],
      ],
      30,
    );
    const pivots = detectPivotPoints(series.highs, series.lows);
    const highs = pivots.filter((p) => p.kind === 'HIGH');
    const lows = pivots.filter((p) => p.kind === 'LOW');
    expect(highs.length).toBe(1);
    expect(highs[0].index).toBe(10);
    expect(lows.length).toBe(1);
    expect(lows[0].index).toBe(20);
  });

  it('toZigzag 讓 HIGH/LOW 交替', () => {
    const pivots = [
      { index: 5, price: 10, kind: 'HIGH' as const },
      { index: 9, price: 12, kind: 'HIGH' as const }, // 更高 → 取代前者
      { index: 14, price: 4, kind: 'LOW' as const },
      { index: 18, price: 3, kind: 'LOW' as const }, // 更低 → 取代前者
      { index: 22, price: 9, kind: 'HIGH' as const },
    ];
    const zz = toZigzag(pivots);
    expect(zz.map((p) => `${p.kind}${p.index}`)).toEqual(['HIGH9', 'LOW18', 'HIGH22']);
  });
});

// ---------------------------------------------------------------------------
// W底（雙重底）
// ---------------------------------------------------------------------------

describe('W底（雙重底）', () => {
  it('正例：兩個相近低點 + 中間高點 + 已回升至頸線 → 命中', () => {
    // 第二腳刻意放在近期（距今 12 根 < RECENT_PATTERN_MAX_AGE_BARS=15），
    // 確保命中是因為「型態成立且仍在檯面上」，而非僅靠久遠的歷史區間。
    const series = makeSeries(
      [
        [0, 100],
        [10, 80],
        [22, 92],
        [37, 81],
        [49, 96],
      ],
      50,
    );
    const g = detectWBottom(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.points.map((p) => p.kind)).toEqual(['LOW', 'HIGH', 'LOW']);
  });

  it('負例：只有一個底（單底）→ 不命中', () => {
    const series = makeSeries(
      [
        [0, 100],
        [15, 80],
        [45, 95],
      ],
      50,
    );
    expect(detectWBottom(series, zigzagOf(series), series.closes.length)).toBeNull();
  });

  it('負例：兩低點相近但中間幾乎沒反彈 → 不命中', () => {
    // 第二腳同樣放在近期，確保被擋下的是「中間反彈不足」，而非型態太舊。
    const series = makeSeries(
      [
        [0, 100],
        [10, 80],
        [16, 80.5],
        [37, 80],
        [49, 95],
      ],
      50,
    );
    expect(detectWBottom(series, zigzagOf(series), series.closes.length)).toBeNull();
  });

  it('負例：型態成立但現價仍停在第二腳（未回升）→ 不命中', () => {
    // 幾何完全成立（兩腳相近、中間有反彈、第二腳在近期），但現價僅 83、
    // 未達第二腳 +3%（83.43）與頸線 95%（87.4），驗證「回升」閘門確實生效。
    const series = makeSeries(
      [
        [0, 100],
        [10, 80],
        [22, 92],
        [37, 81],
        [49, 83],
      ],
      50,
    );
    expect(detectWBottom(series, zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// M頭（雙重頂）
// ---------------------------------------------------------------------------

describe('M頭（雙重頂）', () => {
  it('正例：兩個相近高點 + 中間低點 + 已回落 → 命中', () => {
    // 第二頂放在近期（距今 12 根 < RECENT_PATTERN_MAX_AGE_BARS=15）。
    const series = makeSeries(
      [
        [0, 80],
        [10, 100],
        [22, 88],
        [37, 99],
        [49, 84],
      ],
      50,
    );
    const g = detectMTop(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.points.map((p) => p.kind)).toEqual(['HIGH', 'LOW', 'HIGH']);
  });

  it('負例：只有一個頂 → 不命中', () => {
    const series = makeSeries(
      [
        [0, 80],
        [15, 100],
        [45, 85],
      ],
      50,
    );
    expect(detectMTop(series, zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 頭肩底
// ---------------------------------------------------------------------------

describe('頭肩底', () => {
  it('正例：左肩、較低頭部、右肩 + 已回升 → 命中', () => {
    const series = makeSeries(
      [
        [0, 95],
        [10, 80],
        [20, 90],
        [30, 76],
        [40, 90],
        [50, 82],
        [54, 90],
      ],
      55,
    );
    const g = detectInverseHeadShoulders(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.points.length).toBe(5);
  });

  it('負例：雙底（兩肩等高、頭不更低）→ 不命中', () => {
    const series = makeSeries(
      [
        [0, 95],
        [10, 80],
        [20, 90],
        [30, 80],
        [40, 90],
        [50, 84],
        [54, 90],
      ],
      55,
    );
    expect(
      detectInverseHeadShoulders(series, zigzagOf(series), series.closes.length),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 頭肩頂
// ---------------------------------------------------------------------------

describe('頭肩頂', () => {
  it('正例：左肩、較高頭部、右肩 + 已回落 → 命中', () => {
    const series = makeSeries(
      [
        [0, 80],
        [10, 100],
        [20, 90],
        [30, 104],
        [40, 90],
        [50, 98],
        [54, 90],
      ],
      55,
    );
    const g = detectHeadShouldersTop(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.points.length).toBe(5);
  });

  it('負例：雙頂（兩肩等高、頭不更高）→ 不命中', () => {
    const series = makeSeries(
      [
        [0, 80],
        [10, 100],
        [20, 90],
        [30, 100],
        [40, 90],
        [50, 95],
        [54, 90],
      ],
      55,
    );
    expect(detectHeadShouldersTop(series, zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 破底翻
// ---------------------------------------------------------------------------

describe('破底翻（空頭陷阱）', () => {
  it('正例：跌破前低後於近期收回 → 命中', () => {
    const series = makeSeries(
      [
        [0, 95],
        [25, 80],
        [32, 86],
        [46, 78],
        [48, 84],
        [49, 88],
      ],
      50,
    );
    const g = detectBottomTrap(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.metrics.breakDepthPct).toBeGreaterThan(0);
  });

  it('負例：跌破前低後一路走低、未收回 → 不命中', () => {
    const series = makeSeries(
      [
        [0, 95],
        [25, 80],
        [32, 85],
        [40, 77],
        [49, 76],
      ],
      50,
    );
    expect(detectBottomTrap(series, zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 假突破
// ---------------------------------------------------------------------------

describe('假突破（多頭陷阱）', () => {
  it('正例：突破前高後於近期收回 → 命中', () => {
    const series = makeSeries(
      [
        [0, 80],
        [25, 95],
        [32, 89],
        [46, 97],
        [48, 91],
        [49, 88],
      ],
      50,
    );
    const g = detectFalseBreak(series, zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.metrics.breakHeightPct).toBeGreaterThan(0);
  });

  it('負例：突破前高後持續走高、未收回 → 不命中', () => {
    const series = makeSeries(
      [
        [0, 80],
        [25, 95],
        [32, 90],
        [40, 98],
        [49, 100],
      ],
      50,
    );
    expect(detectFalseBreak(series, zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 收斂三角
// ---------------------------------------------------------------------------

describe('收斂三角', () => {
  it('正例：高點下降 + 低點上升 + 區間縮小 → 命中', () => {
    const series = makeSeries(
      [
        [0, 92],
        [10, 100],
        [18, 85],
        [28, 96],
        [38, 90],
        [49, 93],
      ],
      50,
    );
    const g = detectTriangle(zigzagOf(series), series.closes.length);
    expect(g).not.toBeNull();
    expect(g!.metrics.rangeRatio).toBeLessThanOrEqual(0.45);
  });

  it('負例：擴散（高點更高、低點更低）→ 不命中', () => {
    const series = makeSeries(
      [
        [0, 90],
        [10, 96],
        [18, 88],
        [28, 104],
        [38, 82],
        [49, 95],
      ],
      50,
    );
    expect(detectTriangle(zigzagOf(series), series.closes.length)).toBeNull();
  });

  it('負例：下降通道（高點與低點同步下降）→ 不命中', () => {
    const series = makeSeries(
      [
        [0, 100],
        [10, 100],
        [18, 88],
        [28, 94],
        [38, 82],
        [49, 90],
      ],
      50,
    );
    expect(detectTriangle(zigzagOf(series), series.closes.length)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 序列累積器 / 閘門 / 分組
// ---------------------------------------------------------------------------

describe('序列累積器與主流程', () => {
  const bar = (code: string, close: number, vol = 5000): Bar => ({
    code,
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volumeLots: vol,
  });

  it('createSeriesBuilder 依代號分組並保持升冪', () => {
    const b = createSeriesBuilder();
    b.pushBar(bar('2330', 100));
    b.pushBar(bar('2330', 101));
    b.pushBar(bar('2317', 50));
    const list = b.toSeriesList();
    const map = new Map(list.map((s) => [s.code, s]));
    expect(list.length).toBe(2);
    expect(map.get('2330')!.closes).toEqual([100, 101]);
    expect(map.get('2317')!.closes).toEqual([50]);
  });

  it('資料不足 MIN_BARS_FOR_SCAN 根 → 一律無匹配（誠實，不硬湊）', () => {
    const closes = Array.from({ length: MIN_BARS_FOR_SCAN - 1 }, (_, i) => 100 + i);
    const series: PriceSeries = {
      code: 'SHORT',
      highs: closes.map((c) => c + 0.5),
      lows: closes.map((c) => c - 0.5),
      closes,
      volumes: closes.map(() => 1000),
    };
    expect(detectPatterns(series)).toEqual([]);
  });

  it('detectPatterns 對 W 底序列回報 w_bottom', () => {
    const series = makeSeries(
      [
        [0, 100],
        [10, 80],
        [22, 92],
        [37, 81],
        [49, 96],
      ],
      50,
    );
    const matches = detectPatterns(series);
    expect(matches.some((m) => m.patternId === 'w_bottom')).toBe(true);
  });

  it('scanSeriesList 只回有命中的代號，groupHitsByPattern 依型態分組', () => {
    const wBottom = makeSeries(
      [
        [0, 100],
        [10, 80],
        [22, 92],
        [37, 81],
        [49, 96],
      ],
      50,
    );
    const flat = makeSeries(
      [
        [0, 100],
        [49, 100],
      ],
      50,
    );
    const hits = scanSeriesList([
      { ...wBottom, code: 'A' },
      { ...flat, code: 'B' },
    ]);
    expect(hits.length).toBe(1);
    expect(hits[0].code).toBe('A');
    const grouped = groupHitsByPattern(hits);
    expect(grouped.w_bottom).toEqual(['A']);
    expect(PATTERN_ORDER.every((id) => Array.isArray(grouped[id]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 結果列組裝（對齊實站 item schema）
// ---------------------------------------------------------------------------

describe('buildPatternItem', () => {
  const series: PriceSeries = {
    code: '2330',
    highs: [100.5, 110.5],
    lows: [99.5, 109.5],
    closes: [100, 110],
    volumes: [4000, 5000],
  };

  it('組出對齊實站的欄位與計算值', () => {
    const item = buildPatternItem(series, '台積電', '2026-09-24');
    expect(item.stock_id).toBe('2330');
    expect(item.stock_name).toBe('台積電');
    expect(item.label).toBe('2330 台積電');
    expect(item.close).toBe(110);
    expect(item.change_pct).toBe(10);
    expect(item.volume_lots).toBe(5000);
    // 110 × 5000 / 1e5 = 5.5 億
    expect(item.turnover_yi).toBe(5.5);
    expect(item.low_liquidity).toBe(false);
    expect(item.price_as_of).toBe('2026-09-24');
    expect(item.identity_status).toBe('ok');
    // 未提供產業別（known gap）→ 不應有此欄
    expect('industry' in item).toBe(false);
  });

  it('成交量低於門檻 → low_liquidity 為 true', () => {
    const lowVol: PriceSeries = { ...series, volumes: [1000, 1000] };
    expect(buildPatternItem(lowVol, '測試', '2026-09-24').low_liquidity).toBe(true);
  });

  it('名稱缺失時 label 僅含代號', () => {
    expect(buildPatternItem(series, '', '2026-09-24').label).toBe('2330');
  });
});

// ---------------------------------------------------------------------------
// 掃描宇宙（排除權證等衍生性商品）
// ---------------------------------------------------------------------------

describe('isScannableCode（掃描宇宙：僅 4 碼上市櫃個股）', () => {
  it('宇宙定義為「僅 4 碼上市櫃個股」', () => {
    expect(PATTERN_UNIVERSE_STOCKS_ONLY).toBe(true);
  });

  it('納入 4 碼上市櫃個股', () => {
    for (const code of ['2330', '8069', '6116', '2455', '6811']) {
      expect(isScannableCode(code)).toBe(true);
    }
  });

  it('排除 ETF（含 4 碼 00xx 與 5~6 碼、英文字尾）——本站自訂宇宙不含 ETF', () => {
    for (const code of ['0050', '0053', '0056', '006208', '00878', '00929', '00632R', '00981A']) {
      expect(isScannableCode(code)).toBe(false);
    }
  });

  it('排除 TDR（4 碼 91xx 與 6 碼 91xxxx）', () => {
    for (const code of ['9105', '9103', '911608', '911622']) {
      expect(isScannableCode(code)).toBe(false);
    }
  });

  it('排除權證、ETN 與受益證券（0[1-9]xxxx / 02xxxx / 0100xT）', () => {
    for (const code of ['030573', '071861', '020000', '01009T', '08345U']) {
      expect(isScannableCode(code)).toBe(false);
    }
  });
});
