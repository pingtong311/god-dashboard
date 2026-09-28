/**
 * K 線型態辨識（/patterns 的自算口徑）
 * ============================================================================
 * 目的：
 *   把「線圖老手用肉眼找的型態」寫成**可檢視、可調整**的幾何規則，對全市場日 K
 *   逐檔分類出 7 種型態：W底、頭肩底、破底翻、M頭、頭肩頂、假突破、收斂三角。
 *   輸出對齊實站 https://blackstockai.com/api/pattern-screen 的 schema（僅結果欄位）。
 *
 * 資料來源：
 *   全市場日 K 由 src/lib/marketBars.ts 的 KV（`mkt:bars:<date>`）提供；本檔只做
 *   純幾何運算，**不觸及網路／KV**，可獨立單元測試（合成 K 線序列即可驗證）。
 *
 * 與既有函式的關係（複用決策，非重造輪子）：
 *   - `stockTechnical.detectPivots`（L294）只回傳「高/低點的**價格陣列**」，
 *     **不帶索引**，無法還原轉折點的時序與間距；型態辨識必須知道每個轉折點是第幾根，
 *     故本檔自行實作 `detectPivotPoints`（回傳 `{ index, price, kind }`）。
 *   - `market-structure.buildPriceZones`（L58）會把轉折點**聚類成支撐壓力區**，
 *     聚類後遺失時序與交替結構，不適合作為型態的序列輸入。
 *   兩者與本檔的核心概念一致（左右各 k 根的區域極值），本檔沿用同一精神
 *   （k = PIVOT_LOOKBACK），並沿用其 `k=3` 的預設值。
 *
 * 誠實原則：
 *   資料不足（< MIN_BARS_FOR_SCAN 根）一律回「無匹配」，**絕不用 0 或隨機值補齊**；
 *   無匹配就是無匹配。所有參數皆為具名常數，改動一處即可調整口徑。
 *
 * 紅漲綠跌：本檔只做幾何，不涉顏色。
 */

import type { Bar } from './marketBars';

// ---------------------------------------------------------------------------
// 具名參數（＝我們的「口徑」，全部集中於此，改動可被檢視）
// ---------------------------------------------------------------------------

/**
 * 轉折點（pivot）偵測：以「左右各 k 根的區域極值」認定。
 * 選 3 的理由：沿用專案既有 `stockTechnical.detectPivots` 的預設值 k=3。
 * 經真實資料回測，k=3 對實站 W底樣本的召回最佳（36/38）；k 越大召回掉得越快。
 */
export const PIVOT_LOOKBACK = 3;

/**
 * 可進行型態辨識的最少日 K 根數。
 * 選 40 的理由：一個雙底/頭肩型態至少需要「兩個以上轉折點 + 中間點」，
 * 加上 PIVOT_LOOKBACK 前後各 3 根與型態間距，40 根（約 2 個月）是能穩定判定的下限；
 * 不足 40 根一律不判定（回無匹配），避免用過短序列硬湊型態。
 */
export const MIN_BARS_FOR_SCAN = 40;

/**
 * 雙重底/雙重頂（W底/M頭）兩腳（兩頂）的「相近」容差（%）。
 * 選 2.5% 的理由：實務上兩腳很難完全等高，容差太小會漏掉；太大又會把「單腳」
 * 誤判成雙腳。以較高者為基準計算相對差；經真實資料回測（對照實站 38 檔樣本），
 * 2.5% 兼顧召回與精度。
 */
export const DOUBLE_TOLERANCE_PCT = 2.5;

/**
 * 雙重底/頂兩腳（兩頂）之間的最少間隔根數。
 * 選 6 的理由：兩腳若太近（<6 根）只是同一段震盪，不構成「兩個底」。
 */
export const DOUBLE_MIN_GAP_BARS = 6;

/**
 * 雙重底/頂兩腳（兩頂）之間的最多間隔根數。
 * 選 40 的理由：兩腳相隔超過約 2 個月（≈40 交易日）時，中間已隔著多段行情，
 * 較像是兩個獨立底部而非同一組型態。
 */
export const DOUBLE_MAX_GAP_BARS = 40;

/**
 * 雙重底（頂）中間反彈（回落）幅度的最小門檻（%）。
 * 選 4.0% 的理由：兩腳之間若沒有明顯的中間高點（反彈 <4%），代表這其實是一段
 * 貼底盤整而非「W」，需要一個可辨識的頸線雛型。
 */
export const DOUBLE_MID_MIN_BOUNCE_PCT = 4.0;

/**
 * 雙重底「第二腳之後已回升」的最小幅度（%）。
 * 選 3.0% 的理由：型態要「正在形成」，價格須已自第二腳往上回升（≥3%）才算底部成形；
 * 只停在第二腳、尚未回升者，屬「仍在打底」而非已形成的 W。
 * （經真實資料回測：加上此條件後 W底 命中由 555 降到 352，且仍保留高召回。）
 */
export const DOUBLE_RECOVER_MIN_PCT = 3.0;

/**
 * 「已回到頸線附近」的判定比例（現價 ≥ 中間高點 × 本值）。
 * 選 0.95 的理由：型態接近完成時，價格通常已回升到中間高點（頸線）附近或突破；
 * 要求現價達頸線的 95% 以上，可濾掉「只有右腳、離頸線還很遠」的半成品。
 */
export const DOUBLE_NECK_PROXIMITY = 0.95;

/**
 * 頭肩型態「兩肩」的相近容差（%）。
 * 選 6.0% 的理由：兩肩不像雙重底的兩腳那樣要求等高，容差放寬到 6%，
 * 但仍要求對稱度，避免把「一肩高一肩低」的趨勢段誤判為頭肩。
 */
export const SHOULDER_TOLERANCE_PCT = 6.0;

/**
 * 頭肩型態「頭部」相對兩肩的最小突出幅度（%）。
 * 選 1.5% 的理由：頭部必須明確高於（頭肩頂）/低於（頭肩底）兩肩，
 * 1.5% 是「肉眼可辨」的最小深度，太小會被當成雜訊。
 */
export const HEAD_MIN_DEPTH_PCT = 1.5;

/**
 * 頭肩型態三個轉折點的總跨度上限（根）。
 * 選 90 的理由：左肩到右肩超過約 4.5 個月時，期間行情已換了好幾段，
 * 不應再視為同一個頭肩型態。
 */
export const HS_MAX_SPAN_BARS = 90;

/**
 * 破底翻/假突破的觀察窗長度（根）。
 * 選 45 的理由：需要「先有一個前低/前高，之後跌破/突破，再收回」，
 * 45 根（約 2 個月）足以涵蓋這三段；與 DOUBLE_MAX_GAP_BARS 同量級。
 */
export const TRAP_LOOKBACK_BARS = 45;

/**
 * 破底翻/假突破「收回」距今的最大允許根數。
 * 選 3 的理由：這類型態的意義在於「剛發生」，收回若距今超過 3 個交易日，
 * 狀態多半已改變，不應列為當前狀態（實站此兩類僅 3、14 檔，屬少數）。
 */
export const TRAP_RECOVER_MAX_AGE_BARS = 3;

/**
 * 破底翻「跌破前低」/假突破「突破前高」的最小幅度（%）。
 * 選 1.0% 的理由：只破 0.1%~0.5% 可能只是跳動誤差；1.0% 才算「確實破線」。
 */
export const TRAP_BREAK_MIN_PCT = 1.0;

/**
 * 被破的「前低／前高」必須是近 N 根的顯著極值（真支撐/壓力）。
 * 選 20 的理由：若前低只是 3、5 根前的小回檔低點，破它沒有意義；要求它是
 * 近 20 根（約 1 個月）的最低（最高），才代表破了「真的」支撐（壓力）。
 */
export const TRAP_SIGNIFICANT_LOOKBACK_BARS = 20;

/**
 * 收斂三角「區間縮小」的門檻（後段區間 ≤ 前段區間 × 本值）。
 * 選 0.45 的理由：收斂必須有感；後段振幅要縮到前段的 4.5 成以內，
 * 才叫「收斂」，否則只是平行整理或緩升緩降。
 */
export const TRIANGLE_MAX_RANGE_RATIO = 0.45;

/**
 * 收斂三角的總跨度上限（根）。
 * 選 60 的理由：三角收斂是中期型態，跨度過長（>3 個月）通常已轉為其他結構。
 */
export const TRIANGLE_MAX_SPAN_BARS = 60;

/**
 * 任一型態「最後一個轉折點」距今的最大允許根數（根）。
 * 選 15 的理由：只列「仍在檯面上」的型態；最後轉折點距今超過約 3 週（≈15 交易日），
 * 型態多半已走完或失效，不再列示。
 */
export const RECENT_PATTERN_MAX_AGE_BARS = 15;

/**
 * 「量小」門檻（張）。低於此值的個股標記 low_liquidity。
 * 選 3000 的理由：沿用專案 `stockTechnical.gradeLiquidity` 的「量偏少/量普通」
 * 分界（3000 張），與實站低流動性標記的量級一致。
 */
export const LOW_LIQUIDITY_LOTS_THRESHOLD = 3000;

/**
 * 可掃描的證券類別判斷（決定「全市場」的宇宙）。
 *
 * 為什麼需要：證交所 MI_INDEX 的「每日收盤行情(全部)」含大量**權證、ETN、牛熊證**
 * （例如 030573、071861、020000），全市場唯一代號高達 4 萬多檔；實站的型態清單
 * 只涵蓋「股票 / ETF / TDR」（約 1,800 檔）。若不過濾，W底會被權證灌爆（實測
 * 未過濾時命中 2,224 檔，過濾後才回到與實站同量級）。
 *
 * 保留規則（三種）：
 *   - `\d{4}`：4 碼普通股（2330、8069）與 4 碼 TDR（9105）。
 *   - `00\d{2,4}[A-Z]?`：ETF（0050、006208、00878、00929），可帶英文字尾（00632R、00981A）。
 *   - `91\d{4}`：6 碼 TDR（911608）。
 * 其餘（權證 0[1-9]xxxx、ETN 02xxxx 等衍生性商品）一律排除。
 *
 * @param code 證券代號
 */
export function isScannableCode(code: string): boolean {
  return /^\d{4}$/.test(code) || /^00\d{2,4}[A-Z]?$/.test(code) || /^91\d{4}$/.test(code);
}

/** 7 種型態 id（順序對齊實站頁籤）。 */
export const PATTERN_ORDER = [
  'w_bottom',
  'inv_hs',
  'bottom_trap',
  'm_top',
  'hs_top',
  'false_break',
  'triangle',
] as const;

/** 型態 id 聯合型別。 */
export type PatternId = (typeof PATTERN_ORDER)[number];

/** 每個型態的 meta（name/desc/structure 逐字對齊實站 capture）。 */
export const PATTERN_META: Record<PatternId, { name: string; desc: string; structure: string }> = {
  w_bottom: {
    name: 'W底（雙重底）',
    desc: '兩個相近低點與中間高點形成的歷史日 K 幾何分類。',
    structure: '底部幾何',
  },
  inv_hs: {
    name: '頭肩底',
    desc: '左肩、較低中點與右肩形成的歷史日 K 幾何分類。',
    structure: '底部幾何',
  },
  bottom_trap: {
    name: '破底翻（空頭陷阱）',
    desc: '價格曾低於前低，之後於同一觀察窗收回的歷史狀態。',
    structure: '跌破收回',
  },
  m_top: {
    name: 'M頭（雙重頂）',
    desc: '兩個相近高點與中間低點形成的歷史日 K 幾何分類。',
    structure: '頂部幾何',
  },
  hs_top: {
    name: '頭肩頂',
    desc: '左肩、較高中點與右肩形成的歷史日 K 幾何分類。',
    structure: '頂部幾何',
  },
  false_break: {
    name: '假突破（多頭陷阱）',
    desc: '價格曾高於前高，之後於同一觀察窗收回的歷史狀態。',
    structure: '突破收回',
  },
  triangle: {
    name: '收斂三角',
    desc: '高點下降、低點上升且區間縮小的歷史日 K 幾何分類。',
    structure: '區間收斂',
  },
};

/**
 * 對外揭露的「口徑」摘要（供頁面與 API 顯示，透明性要求）。
 * 只放人類可讀的門檻，方便使用者檢視我們的分類標準。
 */
export const PATTERN_CRITERIA = {
  minBars: MIN_BARS_FOR_SCAN,
  pivotLookback: PIVOT_LOOKBACK,
  doubleTolerancePct: DOUBLE_TOLERANCE_PCT,
  doubleMidMinBouncePct: DOUBLE_MID_MIN_BOUNCE_PCT,
  doubleRecoverMinPct: DOUBLE_RECOVER_MIN_PCT,
  doubleNeckProximity: DOUBLE_NECK_PROXIMITY,
  shoulderTolerancePct: SHOULDER_TOLERANCE_PCT,
  headMinDepthPct: HEAD_MIN_DEPTH_PCT,
  trapLookbackBars: TRAP_LOOKBACK_BARS,
  trapBreakMinPct: TRAP_BREAK_MIN_PCT,
  trapRecoverMaxAgeBars: TRAP_RECOVER_MAX_AGE_BARS,
  trapSignificantLookbackBars: TRAP_SIGNIFICANT_LOOKBACK_BARS,
  triangleMaxRangeRatio: TRIANGLE_MAX_RANGE_RATIO,
  recentPatternMaxAgeBars: RECENT_PATTERN_MAX_AGE_BARS,
  lowLiquidityLotsThreshold: LOW_LIQUIDITY_LOTS_THRESHOLD,
} as const;

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

/** 個股升冪日 K 序列（僅保留型態判定所需欄位，以節省 Workers 記憶體）。 */
export type PriceSeries = {
  code: string;
  highs: number[];
  lows: number[];
  closes: number[];
  /** 成交量（張）。 */
  volumes: number[];
};

/** 轉折點：以 index 定位，price 為該根的 high（HIGH）或 low（LOW）。 */
export type PivotPoint = { index: number; price: number; kind: 'HIGH' | 'LOW' };

/** 型態幾何（供測試與口徑檢視；不進 API 結果欄位）。 */
export type PatternGeometry = {
  points: PivotPoint[];
  metrics: Record<string, number>;
};

/** 單一型態命中。 */
export type PatternMatch = { patternId: PatternId; geometry: PatternGeometry };

/** 單一代號的掃描結果。 */
export type CodePatternHit = { code: string; patterns: PatternMatch[] };

// ---------------------------------------------------------------------------
// 序列累積器（逐日 push，避免一次載入全部日 K）
// ---------------------------------------------------------------------------

/** 逐日累積全市場序列的 builder 介面。 */
export type SeriesBuilder = {
  /** 推入一根 bar（呼叫端需依日期升冪順序推入）。 */
  pushBar: (bar: Bar) => void;
  /** 取出全部序列（升冪）。 */
  toSeriesList: () => PriceSeries[];
};

/**
 * 建立序列累積器。
 * 逐日呼叫 `pushBar` 可避免同時持有「全部 StoredMarketDay」，降低記憶體峰值。
 */
export function createSeriesBuilder(): SeriesBuilder {
  const map = new Map<string, { highs: number[]; lows: number[]; closes: number[]; volumes: number[] }>();
  return {
    pushBar(bar: Bar): void {
      let s = map.get(bar.code);
      if (!s) {
        s = { highs: [], lows: [], closes: [], volumes: [] };
        map.set(bar.code, s);
      }
      s.highs.push(bar.high);
      s.lows.push(bar.low);
      s.closes.push(bar.close);
      s.volumes.push(bar.volumeLots);
    },
    toSeriesList(): PriceSeries[] {
      const out: PriceSeries[] = [];
      for (const [code, s] of map) {
        out.push({ code, highs: s.highs, lows: s.lows, closes: s.closes, volumes: s.volumes });
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// 轉折點偵測
// ---------------------------------------------------------------------------

/**
 * 偵測區域轉折點（左右各 k 根的嚴格極值）。
 * @param highs 升冪的高點序列
 * @param lows 升冪的低點序列
 * @param k 左右各取幾根（預設 PIVOT_LOOKBACK）
 * @returns 依 index 升冪的轉折點
 */
export function detectPivotPoints(
  highs: number[],
  lows: number[],
  k: number = PIVOT_LOOKBACK,
): PivotPoint[] {
  const n = highs.length;
  const pivots: PivotPoint[] = [];
  if (n < 2 * k + 1) return pivots;
  for (let i = k; i < n - k; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) {
        isHigh = false;
      }
      if (lows[j] <= lows[i]) {
        isLow = false;
      }
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: highs[i], kind: 'HIGH' });
    if (isLow) pivots.push({ index: i, price: lows[i], kind: 'LOW' });
  }
  return pivots;
}

/**
 * 把轉折點整理成 HIGH/LOW 交替的「鋸齒」序列。
 * 相鄰同類時只保留更極端者（HIGH 取更高、LOW 取更低），確保後續型態判定
 * 能以 `[LOW, HIGH, LOW]` 這種固定節奏取用。
 */
export function toZigzag(pivots: PivotPoint[]): PivotPoint[] {
  const out: PivotPoint[] = [];
  for (const p of pivots) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...p });
      continue;
    }
    if (last.kind === p.kind) {
      if (p.kind === 'HIGH' && p.price > last.price) out[out.length - 1] = { ...p };
      else if (p.kind === 'LOW' && p.price < last.price) out[out.length - 1] = { ...p };
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/** 兩價相對差（%），以較大者為基準，避免除以 0。 */
function relDiffPct(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return (Math.abs(a - b) / denom) * 100;
}

/** 由序列建立鋸齒（對外便利函式，供測試使用）。 */
export function zigzagOf(series: Pick<PriceSeries, 'highs' | 'lows'>): PivotPoint[] {
  return toZigzag(detectPivotPoints(series.highs, series.lows));
}

// ---------------------------------------------------------------------------
// 型態偵測器（每個皆為純函式：輸入鋸齒與長度，輸出幾何或 null）
// ---------------------------------------------------------------------------

/** W底（雙重底）：兩個相近低點 + 中間高點，且現價已自第二腳回升至頸線附近。 */
export function detectWBottom(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { closes } = series;
  for (let i = 0; i + 2 < zigzag.length; i += 1) {
    const l1 = zigzag[i];
    const mid = zigzag[i + 1];
    const l2 = zigzag[i + 2];
    if (l1.kind !== 'LOW' || mid.kind !== 'HIGH' || l2.kind !== 'LOW') continue;

    const gap = l2.index - l1.index;
    if (gap < DOUBLE_MIN_GAP_BARS || gap > DOUBLE_MAX_GAP_BARS) continue;

    const lowDiffPct = relDiffPct(l1.price, l2.price);
    if (lowDiffPct > DOUBLE_TOLERANCE_PCT) continue;

    const base = Math.max(l1.price, l2.price);
    if (base <= 0) continue;
    const bouncePct = (mid.price / base - 1) * 100;
    if (bouncePct < DOUBLE_MID_MIN_BOUNCE_PCT) continue;

    // 型態須仍在檯面上：最後一個低點距今不可太久。
    if (n - 1 - l2.index > RECENT_PATTERN_MAX_AGE_BARS) continue;

    // 正在形成：現價須已自第二腳回升，且已回到中間高點（頸線）附近或突破。
    const lastClose = closes[n - 1];
    if (lastClose < l2.price * (1 + DOUBLE_RECOVER_MIN_PCT / 100)) continue;
    if (lastClose < mid.price * DOUBLE_NECK_PROXIMITY) continue;

    return {
      points: [l1, mid, l2],
      metrics: { gap, lowDiffPct, bouncePct },
    };
  }
  return null;
}

/** M頭（雙重頂）：兩個相近高點 + 中間低點，且現價已自第二頂回落至頸線附近。 */
export function detectMTop(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { closes } = series;
  for (let i = 0; i + 2 < zigzag.length; i += 1) {
    const h1 = zigzag[i];
    const mid = zigzag[i + 1];
    const h2 = zigzag[i + 2];
    if (h1.kind !== 'HIGH' || mid.kind !== 'LOW' || h2.kind !== 'HIGH') continue;

    const gap = h2.index - h1.index;
    if (gap < DOUBLE_MIN_GAP_BARS || gap > DOUBLE_MAX_GAP_BARS) continue;

    const highDiffPct = relDiffPct(h1.price, h2.price);
    if (highDiffPct > DOUBLE_TOLERANCE_PCT) continue;

    const base = Math.min(h1.price, h2.price);
    if (base <= 0) continue;
    const dipPct = (1 - mid.price / base) * 100;
    if (dipPct < DOUBLE_MID_MIN_BOUNCE_PCT) continue;

    if (n - 1 - h2.index > RECENT_PATTERN_MAX_AGE_BARS) continue;

    // 正在形成：現價須已自第二頂回落，且已回到中間低點（頸線）附近或跌破。
    const lastClose = closes[n - 1];
    if (lastClose > h2.price * (1 - DOUBLE_RECOVER_MIN_PCT / 100)) continue;
    if (lastClose > mid.price / DOUBLE_NECK_PROXIMITY) continue;

    return {
      points: [h1, mid, h2],
      metrics: { gap, highDiffPct, dipPct },
    };
  }
  return null;
}

/** 頭肩底：三低點，中間（頭）最低，兩肩相近，且現價已自右肩回升。 */
export function detectInverseHeadShoulders(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { closes } = series;
  for (let i = 0; i + 4 < zigzag.length; i += 1) {
    const s1 = zigzag[i];
    const neck1 = zigzag[i + 1];
    const head = zigzag[i + 2];
    const neck2 = zigzag[i + 3];
    const s2 = zigzag[i + 4];
    if (
      s1.kind !== 'LOW' ||
      neck1.kind !== 'HIGH' ||
      head.kind !== 'LOW' ||
      neck2.kind !== 'HIGH' ||
      s2.kind !== 'LOW'
    ) {
      continue;
    }

    // 頭必須低於兩肩。
    if (!(head.price < s1.price && head.price < s2.price)) continue;

    const shoulderDiffPct = relDiffPct(s1.price, s2.price);
    if (shoulderDiffPct > SHOULDER_TOLERANCE_PCT) continue;

    const shoulderBase = Math.min(s1.price, s2.price);
    if (shoulderBase <= 0) continue;
    const headDepthPct = (1 - head.price / shoulderBase) * 100;
    if (headDepthPct < HEAD_MIN_DEPTH_PCT) continue;

    const span = s2.index - s1.index;
    if (span > HS_MAX_SPAN_BARS) continue;

    if (n - 1 - s2.index > RECENT_PATTERN_MAX_AGE_BARS) continue;

    // 右肩必須是最新的低點（型態仍在檯面上）。
    if (zigzag.slice(i + 5).some((p) => p.kind === 'LOW')) continue;

    // 正在形成：現價須已自右肩回升。
    if (closes[n - 1] < s2.price * (1 + DOUBLE_RECOVER_MIN_PCT / 100)) continue;

    return {
      points: [s1, neck1, head, neck2, s2],
      metrics: { shoulderDiffPct, headDepthPct, span },
    };
  }
  return null;
}

/** 頭肩頂：三高點，中間（頭）最高，兩肩相近，且現價已自右肩回落。 */
export function detectHeadShouldersTop(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { closes } = series;
  for (let i = 0; i + 4 < zigzag.length; i += 1) {
    const s1 = zigzag[i];
    const neck1 = zigzag[i + 1];
    const head = zigzag[i + 2];
    const neck2 = zigzag[i + 3];
    const s2 = zigzag[i + 4];
    if (
      s1.kind !== 'HIGH' ||
      neck1.kind !== 'LOW' ||
      head.kind !== 'HIGH' ||
      neck2.kind !== 'LOW' ||
      s2.kind !== 'HIGH'
    ) {
      continue;
    }

    if (!(head.price > s1.price && head.price > s2.price)) continue;

    const shoulderDiffPct = relDiffPct(s1.price, s2.price);
    if (shoulderDiffPct > SHOULDER_TOLERANCE_PCT) continue;

    const shoulderBase = Math.max(s1.price, s2.price);
    if (shoulderBase <= 0) continue;
    const headHeightPct = (head.price / shoulderBase - 1) * 100;
    if (headHeightPct < HEAD_MIN_DEPTH_PCT) continue;

    const span = s2.index - s1.index;
    if (span > HS_MAX_SPAN_BARS) continue;

    if (n - 1 - s2.index > RECENT_PATTERN_MAX_AGE_BARS) continue;

    // 右肩必須是最新的高點（型態仍在檯面上）。
    if (zigzag.slice(i + 5).some((p) => p.kind === 'HIGH')) continue;

    // 正在形成：現價須已自右肩回落。
    if (closes[n - 1] > s2.price * (1 - DOUBLE_RECOVER_MIN_PCT / 100)) continue;

    return {
      points: [s1, neck1, head, neck2, s2],
      metrics: { shoulderDiffPct, headHeightPct, span },
    };
  }
  return null;
}

/** 破底翻（空頭陷阱）：曾跌破前低，之後於同一觀察窗收回。 */
export function detectBottomTrap(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { lows, closes } = series;
  const minStart = Math.max(0, n - 1 - TRAP_LOOKBACK_BARS);
  for (const p of zigzag) {
    if (p.kind !== 'LOW') continue;
    if (p.index < minStart) continue;
    // 前低本身要早於「收回」至少幾根，才有觀察空間。
    if (p.index > n - 1 - 2) continue;

    const priorLow = p.price;
    if (priorLow <= 0) continue;

    // 前低必須是近 TRAP_SIGNIFICANT_LOOKBACK_BARS 根的顯著低點（真支撐），否則只是小回檔。
    let significant = true;
    const from = Math.max(0, p.index - TRAP_SIGNIFICANT_LOOKBACK_BARS);
    for (let i = from; i <= p.index; i += 1) {
      if (lows[i] < priorLow * 0.999) {
        significant = false;
        break;
      }
    }
    if (!significant) continue;

    // 1) 跌破：前低之後出現 low < 前低 × (1 - 門檻)。
    const breakThreshold = priorLow * (1 - TRAP_BREAK_MIN_PCT / 100);
    let breakIndex = -1;
    for (let i = p.index + 1; i < n; i += 1) {
      if (lows[i] < breakThreshold) {
        breakIndex = i;
        break;
      }
    }
    if (breakIndex < 0) continue;

    // 2) 收回：跌破之後出現 close > 前低。
    let recoverIndex = -1;
    for (let i = breakIndex + 1; i < n; i += 1) {
      if (closes[i] > priorLow) {
        recoverIndex = i;
        break;
      }
    }
    if (recoverIndex < 0) continue;

    // 3) 收回須夠新。
    if (n - 1 - recoverIndex > TRAP_RECOVER_MAX_AGE_BARS) continue;

    const breakPoint: PivotPoint = { index: breakIndex, price: lows[breakIndex], kind: 'LOW' };
    const recoverPoint: PivotPoint = { index: recoverIndex, price: closes[recoverIndex], kind: 'HIGH' };
    return {
      points: [p, breakPoint, recoverPoint],
      metrics: {
        breakDepthPct: (1 - lows[breakIndex] / priorLow) * 100,
        recoverPct: (closes[recoverIndex] / priorLow - 1) * 100,
        recoverAgeBars: n - 1 - recoverIndex,
      },
    };
  }
  return null;
}

/** 假突破（多頭陷阱）：曾突破前高，之後於同一觀察窗收回。 */
export function detectFalseBreak(
  series: Pick<PriceSeries, 'highs' | 'lows' | 'closes'>,
  zigzag: PivotPoint[],
  n: number,
): PatternGeometry | null {
  const { highs, closes } = series;
  const minStart = Math.max(0, n - 1 - TRAP_LOOKBACK_BARS);
  for (const p of zigzag) {
    if (p.kind !== 'HIGH') continue;
    if (p.index < minStart) continue;
    if (p.index > n - 1 - 2) continue;

    const priorHigh = p.price;
    if (priorHigh <= 0) continue;

    // 前高必須是近 TRAP_SIGNIFICANT_LOOKBACK_BARS 根的顯著高點（真壓力），否則只是小反彈。
    let significant = true;
    const from = Math.max(0, p.index - TRAP_SIGNIFICANT_LOOKBACK_BARS);
    for (let i = from; i <= p.index; i += 1) {
      if (highs[i] > priorHigh * 1.001) {
        significant = false;
        break;
      }
    }
    if (!significant) continue;

    // 1) 突破：前高之後出現 high > 前高 × (1 + 門檻)。
    const breakThreshold = priorHigh * (1 + TRAP_BREAK_MIN_PCT / 100);
    let breakIndex = -1;
    for (let i = p.index + 1; i < n; i += 1) {
      if (highs[i] > breakThreshold) {
        breakIndex = i;
        break;
      }
    }
    if (breakIndex < 0) continue;

    // 2) 收回：突破之後出現 close < 前高。
    let recoverIndex = -1;
    for (let i = breakIndex + 1; i < n; i += 1) {
      if (closes[i] < priorHigh) {
        recoverIndex = i;
        break;
      }
    }
    if (recoverIndex < 0) continue;

    if (n - 1 - recoverIndex > TRAP_RECOVER_MAX_AGE_BARS) continue;

    const breakPoint: PivotPoint = { index: breakIndex, price: highs[breakIndex], kind: 'HIGH' };
    const recoverPoint: PivotPoint = { index: recoverIndex, price: closes[recoverIndex], kind: 'LOW' };
    return {
      points: [p, breakPoint, recoverPoint],
      metrics: {
        breakHeightPct: (highs[breakIndex] / priorHigh - 1) * 100,
        recoverPct: (1 - closes[recoverIndex] / priorHigh) * 100,
        recoverAgeBars: n - 1 - recoverIndex,
      },
    };
  }
  return null;
}

/** 收斂三角：高點下降 + 低點上升 + 區間縮小。 */
export function detectTriangle(zigzag: PivotPoint[], n: number): PatternGeometry | null {
  const highs = zigzag.filter((p) => p.kind === 'HIGH');
  const lows = zigzag.filter((p) => p.kind === 'LOW');
  if (highs.length < 2 || lows.length < 2) return null;

  const h1 = highs[highs.length - 2];
  const h2 = highs[highs.length - 1];
  const l1 = lows[lows.length - 2];
  const l2 = lows[lows.length - 1];

  // 高點下降、低點上升。
  if (!(h2.price < h1.price)) return null;
  if (!(l2.price > l1.price)) return null;

  // 不可退化（後段高點仍須高於後段低點）。
  if (h2.price <= l2.price) return null;

  const rangeEarly = h1.price - l1.price;
  const rangeLate = h2.price - l2.price;
  if (rangeEarly <= 0) return null;
  const rangeRatio = rangeLate / rangeEarly;
  if (rangeRatio > TRIANGLE_MAX_RANGE_RATIO) return null;

  const span = Math.max(h2.index, l2.index) - Math.min(h1.index, l1.index);
  if (span > TRIANGLE_MAX_SPAN_BARS) return null;

  if (n - 1 - Math.max(h2.index, l2.index) > RECENT_PATTERN_MAX_AGE_BARS) return null;

  return {
    points: [h1, l1, h2, l2].sort((a, b) => a.index - b.index),
    metrics: { rangeEarly, rangeLate, rangeRatio, span },
  };
}

// ---------------------------------------------------------------------------
// 對外主函式
// ---------------------------------------------------------------------------

/**
 * 對單一個股序列執行 7 種型態偵測。
 * 不足 MIN_BARS_FOR_SCAN 根一律回空陣列（誠實：資料不足即不判定）。
 * 一個代號可同時命中多種型態（各型態獨立判定，與實站一致）。
 */
export function detectPatterns(series: PriceSeries): PatternMatch[] {
  const n = series.closes.length;
  if (n < MIN_BARS_FOR_SCAN) return [];
  const zigzag = zigzagOf(series);

  const matches: PatternMatch[] = [];
  const wBottom = detectWBottom(series, zigzag, n);
  if (wBottom) matches.push({ patternId: 'w_bottom', geometry: wBottom });
  const invHs = detectInverseHeadShoulders(series, zigzag, n);
  if (invHs) matches.push({ patternId: 'inv_hs', geometry: invHs });
  const bottomTrap = detectBottomTrap(series, zigzag, n);
  if (bottomTrap) matches.push({ patternId: 'bottom_trap', geometry: bottomTrap });
  const mTop = detectMTop(series, zigzag, n);
  if (mTop) matches.push({ patternId: 'm_top', geometry: mTop });
  const hsTop = detectHeadShouldersTop(series, zigzag, n);
  if (hsTop) matches.push({ patternId: 'hs_top', geometry: hsTop });
  const falseBreak = detectFalseBreak(series, zigzag, n);
  if (falseBreak) matches.push({ patternId: 'false_break', geometry: falseBreak });
  const triangle = detectTriangle(zigzag, n);
  if (triangle) matches.push({ patternId: 'triangle', geometry: triangle });
  return matches;
}

/** 對一批序列執行掃描，回傳有命中的代號與其型態。 */
export function scanSeriesList(list: PriceSeries[]): CodePatternHit[] {
  const out: CodePatternHit[] = [];
  for (const series of list) {
    const patterns = detectPatterns(series);
    if (patterns.length > 0) out.push({ code: series.code, patterns });
  }
  return out;
}

/** 將命中依型態分組為 `patternId -> code[]`。 */
export function groupHitsByPattern(hits: CodePatternHit[]): Record<PatternId, string[]> {
  const grouped = {} as Record<PatternId, string[]>;
  for (const id of PATTERN_ORDER) grouped[id] = [];
  for (const hit of hits) {
    for (const m of hit.patterns) grouped[m.patternId].push(hit.code);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// API 結果列（對齊實站 item schema）
// ---------------------------------------------------------------------------

/** 實站 pattern-screen item 形狀（7 型態共用）。 */
export type PatternItem = {
  stock_id: string;
  stock_name: string;
  label: string;
  close: number;
  change_pct: number;
  volume_lots: number;
  turnover_yi: number;
  low_liquidity: boolean;
  price_unit: 'TWD';
  price_scope: 'eod_close';
  price_as_of: string;
  price_status: 'ok';
  change_scope: 'eod';
  change_as_of: string;
  change_status: 'ok';
  volume_unit: 'lots';
  volume_scope: 'eod';
  volume_as_of: string;
  volume_status: 'ok';
  identity_status: 'ok';
  /** 產業別：本站尚無代碼→名稱對照表，未提供時省略（列為 known gap）。 */
  industry?: string;
};

/** 四捨五入至指定小數位。 */
function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * 由序列與名稱組出 API 結果列。
 * @param series 個股序列（升冪）
 * @param name 股票名稱（無對照時傳空字串）
 * @param dataDate 資料日 'YYYY-MM-DD'
 */
export function buildPatternItem(series: PriceSeries, name: string, dataDate: string): PatternItem {
  const n = series.closes.length;
  const close = series.closes[n - 1];
  const prevClose = n >= 2 ? series.closes[n - 2] : close;
  const volumeLots = series.volumes[n - 1];
  const changePct = prevClose > 0 ? roundTo(((close - prevClose) / prevClose) * 100, 2) : 0;
  // 成交金額（億元）＝ 收盤 × 成交張數 × 1000(股/張) ÷ 1e8。
  const turnoverYi = roundTo((close * volumeLots) / 1e5, 1);
  const code = series.code;
  const trimmedName = name.trim();
  return {
    stock_id: code,
    stock_name: trimmedName,
    label: `${code} ${trimmedName}`.trim(),
    close,
    change_pct: changePct,
    volume_lots: volumeLots,
    turnover_yi: turnoverYi,
    low_liquidity: volumeLots < LOW_LIQUIDITY_LOTS_THRESHOLD,
    price_unit: 'TWD',
    price_scope: 'eod_close',
    price_as_of: dataDate,
    price_status: 'ok',
    change_scope: 'eod',
    change_as_of: dataDate,
    change_status: 'ok',
    volume_unit: 'lots',
    volume_scope: 'eod',
    volume_as_of: dataDate,
    volume_status: 'ok',
    identity_status: 'ok',
  };
}
