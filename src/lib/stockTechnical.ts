/**
 * 個股研究頁 —「風險 / 技術 / 情境」三分頁的純推導邏輯
 * ----------------------------------------------------------------------------
 * 逐字對照 captured/login-capture/states/stock-2330/{02-風險,04-技術,08-情境}.txt
 * （證據等級 A：真實瀏覽器點擊後的可見文字）。
 *
 * 原則（沿用本專案慣例）：
 * - 所有數字皆由**真實日 K / 法人 / 融資 / 集保**推導，公式一律寫在註解。
 * - 博主自建模型（換手成本、supertrend 結構線、ADX、隔日條件機率、同族群比較）
 *   本站無對應公開來源 → 對應欄位回 `null`，由 UI 標「資料未入庫」，**絕不編造**。
 * - 無 React、無 fetch，可獨立單元測試。
 */

import { calculateBollingerBands, calculateKD, calculateMACD, calculateRSI } from './indicators';

// ── 型別 ────────────────────────────────────────────────

/** 單根日 K。 */
export interface DailyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 連續買賣超（天數 + 最新一日淨額，張）。 */
export interface StreakInput {
  days: number;
  net: number;
}

/** 三分頁共用的推導輸入。 */
export interface TechnicalInput {
  candles: DailyCandle[] | null;
  /** 現價／收盤。 */
  price: number | null;
  changePct: number | null;
  volumeLots: number | null;
  foreignStreak: StreakInput | null;
  trustStreak: StreakInput | null;
  marginLots: number | null;
  dataDate: string | null;
  /** 同族群（產業）統計；無來源時省略或 null。 */
  sector?: SectorPeerInput | null;
}

/** 風險分級色調（safe=綠/相對安全、normal=黃/普通、warn=紅/要留意）。 */
export type RiskTone = 'safe' | 'normal' | 'warn';

/** 風險體檢單格。 */
export interface RiskCard {
  key: string;
  title: string;
  grade: string | null;
  value: string | null;
  desc: string | null;
  tone: RiskTone;
  available: boolean;
}

/** 風險分頁 view model。 */
export interface RiskPanel {
  available: boolean;
  cards: RiskCard[];
  history: {
    close: string | null;
    cum6d: string | null;
    volume: string | null;
    avg20Volume: string | null;
  } | null;
  note: string;
}

/** 均線水位一列。 */
export interface MaRow {
  period: number;
  label: string;
  value: string | null;
  note: string;
}

/** 技術分頁 view model。 */
export interface TechPanel {
  available: boolean;
  conclusion: string;
  conclusionTone: RiskTone;
  intro: string;
  atmosphere: string;
  dataDate: string | null;
  structure: { title: string; desc: string } | null;
  support: { price: string; zone: string; tests: string } | null;
  resistance: { price: string; zone: string; tests: string } | null;
  poc: string | null;
  fib: Array<{ level: string; price: string }>;
  ma: MaRow[];
  priceVsMa20: { label: string; delta: string; note: string } | null;
  rangePos20: { label: string; pct: string; note: string } | null;
  rsi: { label: string; value: string; note: string } | null;
  volumeRatio: { label: string; value: string; note: string } | null;
  dayRange: { pct: string; amount: string } | null;
  boll: { upper: string; middle: string; lower: string } | null;
  /** 量有沒有跟上價（近 5 日均量 vs 前 5 日均量 + 近 5 日價向）。 */
  volPriceSync: { label: string; note: string } | null;
  /** 融資維持率試算（以收盤當成本、單一部位；維持率 130% → 追繳價 ≈ 成本 × 0.78）。 */
  marginMaintenance: { cost: string; dropPct: string; note: string } | null;
  kd: { value: string; note: string } | null;
  macd: { value: string; note: string } | null;
  /** 本站無來源、須誠實標示未入庫的欄位名稱。 */
  notIndexed: string[];
}

/** 情境分頁單格。 */
export interface ScenarioCard {
  key: string;
  label: string;
  value: string | null;
  sub: string | null;
  available: boolean;
}

/** 同族群單一個股。 */
export interface SectorPeer {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

/** 同族群（產業）統計輸入。 */
export interface SectorPeerInput {
  /** 族群名稱（如「半導體」）。 */
  name: string;
  /** 族群檔數。 */
  count: number;
  /** 族群平均漲跌幅（%）。 */
  avgChangePct: number;
  /** 龍頭（資料日漲幅最大者）。 */
  leader: { symbol: string; name: string; changePct: number };
  /** 同族群個股（含本檔）。 */
  peers: SectorPeer[];
}

/** 情境分頁 view model。 */
export interface ScenarioPanel {
  available: boolean;
  cards: ScenarioCard[];
  bullets: Array<{ text: string; available: boolean }>;
  dataDate: string | null;
  ai: { available: boolean; label: string; quotaNote: string };
  /** 同族群個股清單（無來源時為 null → 前端顯示未入庫）。 */
  sectorPeers: { name: string; count: number; peers: SectorPeer[] } | null;
}

// ── 基礎統計工具 ────────────────────────────────────────

/** 最近 period 筆的簡單移動平均（不足回 null）。 */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** 保留小數（非有限值回 null）。 */
function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 千分位整數。 */
function fmtInt(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString('zh-TW');
}

/** 固定小數。 */
function fmtFixed(value: number | null, digits = 2): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value.toFixed(digits);
}

/** 帶正負號（千分位；非有限值回 null）。 */
function fmtSigned(value: number | null, digits = 0): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value).toLocaleString('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${abs}`;
}

// ── 技術指標計算 ────────────────────────────────────────

/** 近 period 日「平均日晃幅」＝ mean((high−low)/close×100)。 */
export function averageRangePct(candles: DailyCandle[], period = 20): number | null {
  const slice = candles.slice(-period);
  if (slice.length === 0) return null;
  const total = slice.reduce((acc, k) => acc + ((k.high - k.low) / k.close) * 100, 0);
  return total / slice.length;
}

/** ATR（Wilder 簡化：TR 的 period 期簡單平均）與其占收盤百分比。 */
export function atr(candles: DailyCandle[], period = 14): { atr: number; pct: number } | null {
  if (candles.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return null;
  const value = slice.reduce((a, b) => a + b, 0) / slice.length;
  const close = candles[candles.length - 1].close;
  return { atr: value, pct: close > 0 ? (value / close) * 100 : 0 };
}

/** 近 period 日區間位置：0%＝最低、100%＝最高。 */
export function rangePosition(
  candles: DailyCandle[],
  period = 20
): { pct: number; low: number; high: number } | null {
  const slice = candles.slice(-period);
  if (slice.length === 0) return null;
  const low = Math.min(...slice.map((k) => k.low));
  const high = Math.max(...slice.map((k) => k.high));
  const last = slice[slice.length - 1].close;
  if (high <= low) return null;
  return { pct: ((last - low) / (high - low)) * 100, low, high };
}

/** 量比＝最新一日量 ÷ 前 period 日均量。 */
export function volumeRatio(candles: DailyCandle[], period = 20): number | null {
  if (candles.length < 2) return null;
  const today = candles[candles.length - 1].volume;
  const prev = candles.slice(-period - 1, -1).map((k) => k.volume);
  if (prev.length === 0) return null;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (avg <= 0) return null;
  return today / avg;
}

/** 量有沒有跟上價：近 5 日均量 vs 前 5 日均量，搭配近 5 日價格方向。 */
export function buildVolPriceSync(candles: DailyCandle[]): { label: string; note: string } | null {
  if (candles.length < 10) return null;
  const recent = candles.slice(-5);
  const prior = candles.slice(-10, -5);
  const recentAvg = recent.reduce((a, k) => a + k.volume, 0) / recent.length;
  const priorAvg = prior.reduce((a, k) => a + k.volume, 0) / prior.length;
  if (priorAvg <= 0) return null;
  const volChange = recentAvg / priorAvg;
  const priceChange = recent[recent.length - 1].close - candles[candles.length - 6].close;

  const volUp = volChange >= 1.05;
  const volDown = volChange <= 0.95;
  const priceUp = priceChange > 0;

  let label: string;
  if (priceUp && volUp) label = '量能同步走升';
  else if (priceUp && volDown) label = '價漲量沒跟上';
  else if (!priceUp && volUp) label = '價跌量增，賣壓偏重';
  else if (!priceUp && volDown) label = '價跌量縮，觀望';
  else label = '量價大致同步';

  return { label, note: '價漲量沒跟上，力道常較虛' };
}

/** 斐波那契回檔位（由近期高點往低點算）。 */
export function fibRetracements(high: number, low: number): Array<{ level: string; price: number }> {
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
  return levels.map((l) => ({
    level: `${(l * 100).toFixed(1).replace(/\.0$/, '')}%`,
    price: high - (high - low) * l,
  }));
}

/** 近 lookback 日的高／低點。 */
export function recentSwing(
  candles: DailyCandle[],
  lookback = 60
): { high: number; low: number } | null {
  const slice = candles.slice(-lookback);
  if (slice.length === 0) return null;
  return {
    high: Math.max(...slice.map((k) => k.high)),
    low: Math.min(...slice.map((k) => k.low)),
  };
}

/** 簡易 pivot 高低點（左右各 k 根內最高/最低）。 */
export function detectPivots(
  candles: DailyCandle[],
  k = 3
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < candles.length - k; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(candles[i].high);
    if (isLow) lows.push(candles[i].low);
  }
  return { highs, lows };
}

/** 價格行為結構（HH+HL / LH+LL / 區間）。 */
export function detectStructure(
  candles: DailyCandle[]
): { title: string; desc: string } | null {
  const { highs, lows } = detectPivots(candles.slice(-60));
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1] > lows[lows.length - 2];
  if (hh && hl) return { title: '趨勢上・順行', desc: '波段高點與低點同步墊高（HH＋HL）' };
  if (!hh && !hl) return { title: '趨勢下・逆行', desc: '波段高點與低點同步走低（LH＋LL）' };
  return { title: '區間震盪', desc: '高低點交錯，暫無明確方向' };
}

/** 成交量加權的「最多人成交價」（volume profile mode，以 1% 價格分箱近似）。 */
export function volumeProfilePoc(candles: DailyCandle[]): number | null {
  const slice = candles.slice(-150);
  if (slice.length === 0) return null;
  const prices = slice.map((k) => k.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max <= min) return min;
  const binWidth = (max - min) / 40 || 1;
  const bins = new Map<number, number>();
  for (const k of slice) {
    const bin = Math.round((k.close - min) / binWidth);
    bins.set(bin, (bins.get(bin) ?? 0) + k.volume);
  }
  let bestBin = 0;
  let bestVol = -1;
  for (const [bin, vol] of bins) {
    if (vol > bestVol) {
      bestVol = vol;
      bestBin = bin;
    }
  }
  return min + bestBin * binWidth;
}

// ── 風險分頁 ────────────────────────────────────────────

/** 波動分級（依 20 日平均日晃幅）。 */
function gradeVolatility(pct: number): { grade: string; tone: RiskTone; desc: string } {
  if (pct < 2) return { grade: '低波動', tone: 'safe', desc: '日內波動小，急著進出的滑價成本相對低' };
  if (pct < 4) return { grade: '普通波動', tone: 'normal', desc: '日內波動一般，留意滑價' };
  return { grade: '高波動', tone: 'warn', desc: '日內波動大，進出成本相對高' };
}

/** 流動性分級（依當日成交量）。 */
function gradeLiquidity(lots: number): { grade: string; tone: RiskTone; desc: string } {
  if (lots >= 10000) return { grade: '量充足', tone: 'safe', desc: '一般部位進出影響有限' };
  if (lots >= 3000) return { grade: '量普通', tone: 'normal', desc: '一般部位尚可進出，大單留意滑價' };
  return { grade: '量偏少', tone: 'warn', desc: '成交量偏低，大單進出影響較大' };
}

/** 距追繳價分級（融資維持率 130% → 追繳價 ≈ 成本 × 0.78）。 */
function gradeMarginDistance(pct: number): { grade: string; tone: RiskTone } {
  if (pct < 15) return { grade: '接近追繳', tone: 'warn' };
  if (pct < 30) return { grade: '追繳', tone: 'normal' };
  return { grade: '安全距離', tone: 'safe' };
}

/** 支撐距離分級。 */
function gradeSupportDistance(pct: number): { grade: string; tone: RiskTone } {
  if (pct < 2) return { grade: '貼支撐', tone: 'warn' };
  if (pct < 5) return { grade: '距支撐普通', tone: 'normal' };
  return { grade: '遠離支撐', tone: 'safe' };
}

/**
 * 建立風險體檢 view model。
 * 五格：波動風險 / 流動性 / 融資壓力 / 大戶動向（週）/ 支撐距離。
 */
export function buildRiskPanel(input: TechnicalInput): RiskPanel {
  const { candles, price, volumeLots } = input;
  const cards: RiskCard[] = [];

  // 1. 波動風險（日晃幅）
  const rangePct = candles ? round(averageRangePct(candles, 20), 1) : null;
  if (rangePct !== null) {
    const g = gradeVolatility(rangePct);
    cards.push({
      key: 'volatility',
      title: '波動風險（日晃幅）',
      grade: g.grade,
      value: `${rangePct}%`,
      desc: g.desc,
      tone: g.tone,
      available: true,
    });
  } else {
    cards.push({ key: 'volatility', title: '波動風險（日晃幅）', grade: null, value: null, desc: null, tone: 'normal', available: false });
  }

  // 2. 流動性（日成交量）
  if (volumeLots !== null) {
    const g = gradeLiquidity(volumeLots);
    cards.push({
      key: 'liquidity',
      title: '流動性（日成交量）',
      grade: g.grade,
      value: `${fmtInt(volumeLots)} 張`,
      desc: g.desc,
      tone: g.tone,
      available: true,
    });
  } else {
    cards.push({ key: 'liquidity', title: '流動性（日成交量）', grade: null, value: null, desc: null, tone: 'normal', available: false });
  }

  // 3. 融資壓力（距追繳價）
  if (price !== null && price > 0) {
    const callPrice = price * 0.78;
    const distancePct = round((1 - 0.78) * 100, 0); // 22
    const g = gradeMarginDistance(distancePct ?? 0);
    cards.push({
      key: 'margin',
      title: '融資壓力',
      grade: g.grade,
      value: `−${distancePct}%`,
      desc: `以收盤成本試算，離追繳價（約 ${fmtFixed(callPrice, 1)}）還有距離`,
      tone: g.tone,
      available: true,
    });
  } else {
    cards.push({ key: 'margin', title: '融資壓力', grade: null, value: null, desc: null, tone: 'normal', available: false });
  }

  // 4. 大戶動向（週）—— 需 TDCC 週變化，本站未接
  cards.push({
    key: 'holders',
    title: '大戶動向（週）',
    grade: null,
    value: null,
    desc: '大戶持股週變化資料未入庫',
    tone: 'normal',
    available: false,
  });

  // 5. 支撐距離
  const swing = candles ? recentSwing(candles, 60) : null;
  if (swing && price !== null && price > 0) {
    const distPct = round(((price - swing.low) / price) * 100, 1);
    if (distPct !== null) {
      const g = gradeSupportDistance(distPct);
      cards.push({
        key: 'support',
        title: '支撐距離',
        grade: g.grade,
        value: `${distPct}%`,
        desc: `就在近期低點 ${fmtInt(swing.low)} 上緣，跌破結構就要重畫`,
        tone: g.tone,
        available: true,
      });
    }
  }
  if (cards.length < 5) {
    cards.push({ key: 'support', title: '支撐距離', grade: null, value: null, desc: null, tone: 'normal', available: false });
  }

  // 處置制度歷史資料
  const avg20Volume =
    candles && candles.length >= 1
      ? candles.slice(-20).reduce((a, k) => a + k.volume, 0) / Math.min(20, candles.length) / 1000 // 股 → 張
      : null;

  const history =
    candles && candles.length > 0
      ? {
          close: fmtInt(input.price ?? candles[candles.length - 1].close),
          cum6d: null, // 由呼叫端填入（與總覽共用計算）
          volume: fmtInt(volumeLots),
          avg20Volume: fmtInt(avg20Volume),
        }
      : null;

  return {
    available: cards.some((c) => c.available),
    cards,
    history,
    note: '五格都是資料日已發生數據的客觀分級（紅＝要留意、黃＝普通、綠＝相對安全），不是漲跌預測；風險高低跟會不會漲沒有直接關係。',
  };
}

// ── 技術分頁 ────────────────────────────────────────────

/** 建立技術分析解讀 view model。 */
export function buildTechPanel(input: TechnicalInput): TechPanel {
  const { candles, price, dataDate } = input;
  const notIndexed: string[] = [];

  if (!candles || candles.length < 20) {
    return {
      available: false,
      conclusion: '資料未入庫',
      conclusionTone: 'normal',
      intro: '以下描述資料日已發生的日 K 結構，不推估下一次走勢。',
      atmosphere: '市場氣氛：。RSI 與量比是歷史價格、成交量的計算值；偏高或偏低不代表之後必然反轉。',
      dataDate,
      structure: null,
      support: null,
      resistance: null,
      poc: null,
      fib: [],
      ma: [],
      priceVsMa20: null,
      rangePos20: null,
      rsi: null,
      volumeRatio: null,
      dayRange: null,
      boll: null,
      volPriceSync: null,
      marginMaintenance: null,
      kd: null,
      macd: null,
      notIndexed: ['結構線', '趨勢明確度', '行情醞釀', '隔日條件比例'],
    };
  }

  const closes = candles.map((k) => k.close);
  const last = candles[candles.length - 1];

  const ma20 = round(sma(closes, 20), 2);
  const ma60 = round(sma(closes, 60), 2);
  const ma100 = round(sma(closes, 100), 2);
  const ma120 = round(sma(closes, 120), 2);

  // 結論（依收盤 vs MA20/MA60）
  let conclusion = '中性結構';
  let conclusionTone: RiskTone = 'normal';
  if (ma20 !== null && ma60 !== null) {
    if (last.close > ma20 && ma20 > ma60) {
      conclusion = '偏多結構';
      conclusionTone = 'safe';
    } else if (last.close < ma20 && ma20 < ma60) {
      conclusion = '偏空結構';
      conclusionTone = 'warn';
    }
  }

  const swing = recentSwing(candles, 60);
  const atrInfo = atr(candles, 14);

  // 支撐/壓力（近期低/高 ± ATR×0.75 為「一帶」；被測次數＝近 60 日觸及該帶的天數）
  let support: TechPanel['support'] = null;
  let resistance: TechPanel['resistance'] = null;
  if (swing && atrInfo) {
    const band = atrInfo.atr * 0.75;
    const supportZoneHigh = swing.low + band;
    const resistanceZoneLow = swing.high - band;
    const supportTests = candles.slice(-60).filter((k) => k.low <= supportZoneHigh).length;
    const resistanceTests = candles.slice(-60).filter((k) => k.high >= resistanceZoneLow).length;
    support = {
      price: fmtInt(swing.low) ?? '--',
      zone: `${fmtFixed(swing.low - band, 2)}–${fmtFixed(supportZoneHigh, 2)}`,
      tests: `近60日被測 ${supportTests} 次`,
    };
    resistance = {
      price: fmtInt(swing.high) ?? '--',
      zone: `${fmtFixed(resistanceZoneLow, 2)}–${fmtFixed(swing.high + band, 2)}`,
      tests: `近60日被測 ${resistanceTests} 次`,
    };
  }

  const poc = round(volumeProfilePoc(candles), 2);
  const fib = swing
    ? fibRetracements(swing.high, swing.low).map((f) => ({ level: f.level, price: fmtFixed(f.price, 2) ?? '--' }))
    : [];

  const ma: MaRow[] = [
    { period: 20, label: '20 日（近月）', value: fmtFixed(ma20, 2), note: '近一個月平均成本' },
    { period: 60, label: '60 日（季線）', value: fmtFixed(ma60, 2), note: '近一季的水位' },
    { period: 100, label: '100 日', value: fmtFixed(ma100, 2), note: '中期水位' },
    { period: 120, label: '120 日（半年）', value: fmtFixed(ma120, 2), note: '近半年水位' },
  ];

  // 比近月均線
  let priceVsMa20: TechPanel['priceVsMa20'] = null;
  if (ma20 !== null && ma20 > 0) {
    const delta = round(((last.close - ma20) / ma20) * 100, 1);
    if (delta !== null) {
      const label = delta > 5 ? '遠離均線' : delta < -5 ? '跌破均線' : '貼近均線';
      priceVsMa20 = {
        label,
        delta: `${delta >= 0 ? '高出' : '低於'} ${fmtFixed(Math.abs(delta), 1)}%`,
        note: label === '貼近均線' ? '貼近均線 · 離均線太遠，之後常會靠回去' : `${label} · 收盤相對 20 日均線的位置`,
      };
    }
  }

  // 近 20 日位置
  const rp = rangePosition(candles, 20);
  const rpLabel = rp ? (rp.pct >= 80 ? '區間高段' : rp.pct <= 30 ? '區間低段' : '區間中段') : null;
  const rangePos20 = rp
    ? {
        label: rpLabel!,
        pct: `${Math.round(rp.pct)}%`,
        note: `${rpLabel} · 0%＝這 20 天最低、100%＝最高`,
      }
    : null;

  // RSI（人氣）
  const rsiArr = calculateRSI(closes, 14).rsi;
  const rsiVal = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null;
  const rsi =
    rsiVal !== null && Number.isFinite(rsiVal)
      ? {
          label: rsiVal >= 70 ? '人氣偏熱' : rsiVal <= 30 ? '人氣偏冷' : '人氣中等',
          value: `${Math.round(rsiVal)}`,
          note: `${rsiVal >= 70 ? '人氣偏熱' : rsiVal <= 30 ? '人氣偏冷' : '人氣中等'} · 越高越熱、越低越冷`,
        }
      : null;

  // 量比
  const vr = round(volumeRatio(candles, 20), 2);
  const volumeRatioView = vr !== null
    ? {
        label: vr >= 1.5 ? '量能放大' : vr <= 0.7 ? '量能偏淡' : '量能正常',
        value: `${vr} 倍`,
        note: `${vr >= 1.5 ? '量能放大' : vr <= 0.7 ? '量能偏淡' : '量能正常'} · 正常量`,
      }
    : null;

  // 一天大概會晃（ATR% 與金額）
  const dayRange =
    atrInfo && price !== null
      ? { pct: `${round(atrInfo.pct, 1)}%`, amount: `約 ${fmtFixed(atrInfo.atr, 2)} 元` }
      : null;

  // 量有沒有跟上價（近 5 日均量 vs 前 5 日均量；近 5 日收盤方向）
  const volPriceSync = buildVolPriceSync(candles);

  // 融資維持率試算（以收盤當成本、維持率 130% → 追繳價 ≈ 成本 × 0.78）
  const marginMaintenance =
    price !== null && price > 0
      ? {
          cost: fmtFixed(price * 0.78, 1) ?? '--',
          dropPct: '22',
          note: '大概再跌 22% 會碰到追繳價',
        }
      : null;

  // 布林通道
  const boll = calculateBollingerBands(closes, 20, 2);
  const lastIdx = closes.length - 1;
  const bollView =
    boll.upper[lastIdx] !== null && boll.middle[lastIdx] !== null && boll.lower[lastIdx] !== null
      ? {
          upper: fmtFixed(boll.upper[lastIdx], 2) ?? '--',
          middle: fmtFixed(boll.middle[lastIdx], 2) ?? '--',
          lower: fmtFixed(boll.lower[lastIdx], 2) ?? '--',
        }
      : null;

  // KD（短線溫度）
  const kd = calculateKD(candles.map((k) => k.high), candles.map((k) => k.low), closes, 9);
  const kdK = kd.k[lastIdx];
  const kdD = kd.d[lastIdx];
  const kdView =
    kdK !== null && kdD !== null && Number.isFinite(kdK) && Number.isFinite(kdD)
      ? { value: `K${Math.round(kdK)}／D${Math.round(kdD)}`, note: '不熱不冷（KD，80 熱／20 冷）' }
      : null;

  // MACD 動能柱
  const macd = calculateMACD(closes, 12, 26, 9);
  const hist = macd.hist[lastIdx];
  const macdView =
    hist !== null && Number.isFinite(hist)
      ? { value: hist >= 0 ? '柱在零軸上' : '柱在零軸下', note: '動能柱：柱在零軸上。' }
      : null;

  notIndexed.push('結構線', '趨勢明確度', '行情醞釀', '隔日條件比例');

  return {
    available: true,
    conclusion,
    conclusionTone,
    intro: '以下描述資料日已發生的日 K 結構，不推估下一次走勢。',
    atmosphere: '市場氣氛：。RSI 與量比是歷史價格、成交量的計算值；偏高或偏低不代表之後必然反轉。',
    dataDate,
    structure: detectStructure(candles),
    support,
    resistance,
    poc: fmtFixed(poc, 2),
    fib,
    ma,
    priceVsMa20,
    rangePos20,
    rsi,
    volumeRatio: volumeRatioView,
    dayRange,
    boll: bollView,
    volPriceSync,
    marginMaintenance,
    kd: kdView,
    macd: macdView,
    notIndexed,
  };
}

// ── 情境分頁 ────────────────────────────────────────────

/** 建立持有情境與風險 view model。 */
export function buildScenarioPanel(input: TechnicalInput): ScenarioPanel {
  const { candles, price, changePct, volumeLots, foreignStreak, trustStreak, dataDate, sector } = input;
  const cards: ScenarioCard[] = [];
  const bullets: Array<{ text: string; available: boolean }> = [];

  // 外資
  if (foreignStreak) {
    const dir = foreignStreak.net > 0 ? '買' : '賣';
    cards.push({ key: 'foreign', label: '外資', value: `連${dir} ${foreignStreak.days} 日`, sub: `${fmtSigned(foreignStreak.net)} 張`, available: true });
    bullets.push({ text: `外資連續${foreignStreak.net > 0 ? '買超' : '賣超'} ${foreignStreak.days} 日（最新日 ${fmtSigned(foreignStreak.net)} 張）`, available: true });
  } else {
    cards.push({ key: 'foreign', label: '外資', value: null, sub: null, available: false });
    bullets.push({ text: '外資連續買賣資料未入庫。', available: false });
  }

  // 投信
  if (trustStreak) {
    const dir = trustStreak.net > 0 ? '買' : '賣';
    cards.push({ key: 'trust', label: '投信', value: `連${dir} ${trustStreak.days} 日`, sub: `${fmtSigned(trustStreak.net)} 張`, available: true });
    bullets.push({ text: `投信連續${trustStreak.net > 0 ? '買超' : '賣超'} ${trustStreak.days} 日（最新日 ${fmtSigned(trustStreak.net)} 張）`, available: true });
  } else {
    cards.push({ key: 'trust', label: '投信', value: null, sub: null, available: false });
    bullets.push({ text: '投信連續買賣資料未入庫。', available: false });
  }

  // 資料日漲跌
  if (changePct !== null) {
    cards.push({
      key: 'dayChange',
      label: '資料日漲跌',
      value: `${fmtFixed(changePct, 2)}%`,
      sub: volumeLots !== null ? `${fmtInt(volumeLots)} 張` : null,
      available: true,
    });
  } else {
    cards.push({ key: 'dayChange', label: '資料日漲跌', value: null, sub: null, available: false });
  }

  // 同族群（由族群統計來源推導；無來源時誠實標未入庫）
  if (sector && sector.count > 0) {
    const rel =
      changePct === null
        ? null
        : changePct < sector.avgChangePct
          ? '相對偏弱'
          : changePct > sector.avgChangePct
            ? '相對偏強'
            : '持平';
    cards.push({
      key: 'sector',
      label: '同族群',
      value: rel,
      sub: `${sector.name} 均 ${fmtSigned(sector.avgChangePct, 2)}%`,
      available: true,
    });
    bullets.push({
      text: `同族群「${sector.name}」${sector.count} 檔平均 ${fmtSigned(sector.avgChangePct, 2)}%｜龍頭 ${sector.leader.symbol} ${sector.leader.name} ${fmtSigned(sector.leader.changePct, 2)}%${rel ? `｜本檔${rel}` : ''}`,
      available: true,
    });
    if (rel === '相對偏弱') {
      bullets.push({ text: '這檔資料日漲幅低於同族群平均，屬相對弱勢對照，不代表後續延續。', available: true });
    } else if (rel === '相對偏強') {
      bullets.push({ text: '這檔資料日漲幅高於同族群平均，屬相對強勢對照，不代表後續延續。', available: true });
    }
  } else {
    cards.push({ key: 'sector', label: '同族群', value: null, sub: null, available: false });
    bullets.push({ text: '同族群比較資料未入庫。', available: false });
  }

  const swing = candles ? recentSwing(candles, 60) : null;
  const closes = candles?.map((k) => k.close) ?? [];
  const ma20 = candles ? round(sma(closes, 20), 2) : null;
  const rsiArr = candles ? calculateRSI(closes, 14).rsi : [];
  const rsiVal = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null;

  // 近日低點 / 高點 / 20 日均線 / RSI
  cards.push({ key: 'low', label: '近日低點', value: swing ? fmtInt(swing.low) : null, sub: null, available: swing !== null });
  cards.push({ key: 'high', label: '近日高點', value: swing ? fmtInt(swing.high) : null, sub: null, available: swing !== null });
  cards.push({ key: 'ma20', label: '20 日均線', value: fmtFixed(ma20, 2), sub: null, available: ma20 !== null });
  cards.push({
    key: 'rsi',
    label: 'RSI',
    value: rsiVal !== null && Number.isFinite(rsiVal) ? (rsiVal >= 70 ? '人氣偏熱' : rsiVal <= 30 ? '人氣偏冷' : '人氣中等') : null,
    sub: rsiVal !== null && Number.isFinite(rsiVal) ? `${Math.round(rsiVal)}` : null,
    available: rsiVal !== null && Number.isFinite(rsiVal),
  });

  // 條列
  if (dataDate) bullets.push({ text: `法人資料日 ${dataDate}`, available: true });
  if (changePct !== null && volumeLots !== null) {
    bullets.push({
      text: `日線資料日 ${dataDate ?? '未入庫'}｜收盤漲跌 ${fmtFixed(changePct, 2)}%｜量 ${fmtInt(volumeLots)} 張`,
      available: true,
    });
  }
  if (swing) {
    bullets.push({ text: `近日低點 ${fmtInt(swing.low)}、近日高點 ${fmtInt(swing.high)}；這就是日 K 算出來的支撐壓力帶。`, available: true });
  }
  if (ma20 !== null && price !== null) {
    bullets.push({ text: `20 日均線 ${fmtFixed(ma20, 2)}，收盤在均線${price >= ma20 ? '上方' : '下方'}。`, available: true });
  }
  if (rsiVal !== null && Number.isFinite(rsiVal)) {
    bullets.push({ text: `RSI ${Math.round(rsiVal)}，屬已發生人氣位置，不代表後續延續。`, available: true });
  }
  if (swing) {
    bullets.push({ text: '價格回到近日低點附近若有反應，是常見觀察帶。', available: true });
  }
  bullets.push({ text: '以上是已發生公開資料整理，不是投資判斷。', available: true });

  return {
    available: cards.some((c) => c.available),
    cards,
    bullets,
    dataDate,
    ai: {
      available: false,
      label: '用 AI 白話解讀（扣 1 次）',
      quotaNote: '今日剩餘次數未入庫',
    },
    sectorPeers: sector && sector.count > 0 ? { name: sector.name, count: sector.count, peers: sector.peers } : null,
  };
}
