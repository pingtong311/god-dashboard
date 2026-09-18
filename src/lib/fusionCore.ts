export type BattleReport = {
  ticker: string;
  name: string;
  action: string;
  confidence: number;
  price?: string;
  target?: string;
  stopLoss?: string;
  strategyType?: string;
  reason?: string;
  fairValue?: number | string;
  fairValueConfidence?: string;
  fairValueModelCount?: number | string;
  fairValueSource?: string;
};

export type Position = {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number | null;
  targetPrice?: number;
  stopPrice?: number;
  type?: string;
};

export type Sniper = {
  ticker: string;
  name: string;
  triggerPrice: string;
  stopPrice: string;
  status: string;
  source: string;
};

export type LiaoCandidate = {
  symbol: string;
  name: string;
  points: number;
  price: number;
  open: number;
  diff: number;
  change_pct: number;
  volume: number;
  prev_volume: number;
  volume_ratio: number;
  amount: number;
  stop_loss: number;
  chief_net: number;
  rank_score: number;
};

export type ExtremeItem = {
  window: number;
  date: string;
  price: number;
  volume: number;
  change_pct: number;
  kind: 'red' | 'black';
};

export type ExtremeResponse = {
  symbol: string;
  name: string;
  latest_date: string;
  latest_price: number;
  items: ExtremeItem[];
};

export type FusionStock = {
  ticker: string;
  name: string;
  source: string[];
  signalTags: string[];
  skynetAction?: string;
  confidence?: number;
  liaoPoints?: number;
  liaoDiff?: number;
  volumeRatio?: number;
  changePct?: number;
  chiefNet?: number;
  price?: number | string;
  fairValue?: number | string;
  fairValueUpsidePct?: number;
  fairValueDistancePct?: number;
  fairValueSignal?: 'UNAVAILABLE' | 'UNDERVALUED' | 'SLIGHT_UNDERVALUE' | 'NEAR_FAIR' | 'SLIGHT_OVERVALUE' | 'OVERVALUED';
  fairValueConfidence?: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
  fairValueNote?: string;
  fairValueModelCount?: number;
  fairValueSource?: string;
  targetPrice?: number | string;
  targetBasis?: string;
  stopLoss?: number | string;
  triggerPrice?: string;
  status?: string;
  dataQuality: number;
  tradable?: boolean;
  calibratedConfidence?: number;
  executionScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  decisionLabel?: '可執行' | '觀察等觸發' | '防守優先';
  decisionNote?: string;
  riskReward?: number;
  qualityWarnings?: string[];
  tracking?: {
    firstSeenAt: string;
    lastSeenAt: string;
    lastMissingAt?: string;
    seenCount: number;
    observationCount: number;
    streakDays: number;
    missedCount?: number;
    scoreDelta: number;
    rankDelta: number;
    previousScore?: number;
    previousRank?: number;
    rank: number;
    phase: 'new' | 'warming' | 'persistent' | 'cooling' | 'fading';
    phaseLabel: string;
  };
  intradayTrend?: {
    observations: number;
    scoreSlope: number;
    rankSlope: number;
    ma21Slope: number;
    volumeSlope: number;
    latestScore: number | null;
    latestRank: number | null;
  };
  fusionScore: number;
};

type KLine = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const ALLOW_SYNTHETIC_FUSION = process.env.SKYNET_ALLOW_SYNTHETIC_FUSION === '1';

const STOCK_UNIVERSE: Array<[string, string]> = [
  ['2330', '台積電'], ['2317', '鴻海'], ['2454', '聯發科'], ['2308', '台達電'],
  ['2382', '廣達'], ['3231', '緯創'], ['2345', '智邦'], ['2357', '華碩'],
  ['2379', '瑞昱'], ['3661', '世芯-KY'], ['6669', '緯穎'], ['3037', '欣興'],
  ['3711', '日月光投控'], ['2303', '聯電'], ['3035', '智原'], ['8046', '南電'],
  ['2603', '長榮'], ['2609', '陽明'], ['2615', '萬海'], ['2618', '長榮航'],
  ['2610', '華航'], ['2881', '富邦金'], ['2882', '國泰金'], ['2891', '中信金'],
  ['2886', '兆豐金'], ['2892', '第一金'], ['2884', '玉山金'], ['2890', '永豐金'],
  ['2002', '中鋼'], ['1101', '台泥'], ['1102', '亞泥'], ['1216', '統一'],
  ['1301', '台塑'], ['1303', '南亞'], ['1326', '台化'], ['6505', '台塑化'],
  ['2409', '友達'], ['3481', '群創'], ['2377', '微星'], ['2376', '技嘉'],
  ['2356', '英業達'], ['2324', '仁寶'], ['2353', '宏碁'], ['2301', '光寶科'],
  ['3008', '大立光'], ['3406', '玉晶光'], ['5269', '祥碩'], ['6415', '矽力-KY'],
  ['3532', '台勝科'], ['5871', '中租-KY'], ['5876', '上海商銀'], ['8454', '富邦媒'],
  ['6409', '旭隼'], ['9921', '巨大'], ['9945', '潤泰新'], ['2912', '統一超'],
];

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tradingDateOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function basePriceFor(symbol: string): number {
  const numeric = Number.parseInt(symbol.replace(/\D/g, ''), 10) || hashSeed(symbol);
  if (symbol === '2330') return 2400;
  if (numeric % 13 === 0) return 650;
  if (numeric % 7 === 0) return 260;
  if (numeric % 5 === 0) return 120;
  if (numeric % 3 === 0) return 80;
  return 45;
}

function buildSyntheticKlines(symbol: string, period: string, days = 180): KLine[] {
  const step = period === '月' ? 30 : period === '周' ? 7 : 1;
  const random = seededRandom(hashSeed(`${symbol}-${period}-${tradingDateOffset(0)}`));
  let close = basePriceFor(symbol) * (0.92 + random() * 0.16);
  const rows: KLine[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const drift = 0.0015 + (random() - 0.48) * 0.045;
    const open = close * (1 + (random() - 0.5) * 0.024);
    close = Math.max(5, close * (1 + drift));
    const high = Math.max(open, close) * (1 + random() * 0.022);
    const low = Math.min(open, close) * (1 - random() * 0.022);
    const volumeBase = 1500 + random() * 98000;
    const volumeBoost = close > open ? 1.08 : 0.92;
    rows.push({
      date: tradingDateOffset(i * step),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(volumeBase * volumeBoost * (period === '月' ? 20 : period === '周' ? 5 : 1)),
    });
  }

  return rows;
}

function calculateRecord(symbol: string, name: string, strategy: string, period: string): LiaoCandidate {
  const rows = buildSyntheticKlines(symbol, period);
  const last = rows.at(-1) as KLine;
  const prev = rows.at(-2) ?? last;
  const maWindow = rows.slice(-21);
  const ma21 = maWindow.reduce((sum, row) => sum + row.close, 0) / maWindow.length;
  const diff = ((last.close - ma21) / ma21) * 100;
  let points = diff > 2 ? 18 : diff > 0 ? 11 : 0;

  if (strategy === 'sell_black_tail' || strategy === 'breakdown') {
    points = points === 18 ? 21 : points === 11 ? 10 : 3;
  }

  const changePct = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const amount = (last.close * last.volume) / 100000000;
  const chiefNet = ((last.close - last.open) / (last.high - last.low + 0.001)) * last.volume * 0.4;
  const volumeRatio = prev.volume ? last.volume / prev.volume : 1;
  const rankScore = points * 10 + Math.max(-20, Math.min(20, diff * 2)) + changePct * 3 + Math.min(18, volumeRatio * 4);

  return {
    symbol,
    name,
    points,
    price: round(last.close),
    open: round(last.open),
    diff: round(diff),
    change_pct: round(changePct),
    volume: last.volume,
    prev_volume: prev.volume,
    volume_ratio: round(volumeRatio),
    amount: round(amount),
    stop_loss: round(last.close * (strategy === 'sell_black_tail' || strategy === 'breakdown' ? 1.02 : 0.98)),
    chief_net: Math.round(chiefNet),
    rank_score: round(rankScore),
  };
}

function filterByStrategy(record: LiaoCandidate, strategy: string): boolean {
  if (strategy === 'buy_red_tail') return [18, 11, 0].includes(record.points) && record.diff <= 6;
  if (strategy === 'breakout') return record.points >= 11 && record.change_pct >= 0;
  if (strategy === 'sell_black_tail') return [21, 10, 3].includes(record.points) && record.diff >= -6;
  if (strategy === 'breakdown') return record.points <= 10 && record.change_pct <= 0;
  return true;
}

export function buildEmbeddedLiaoCandidates(strategy = 'buy_red_tail', period = '日', limit = 48): LiaoCandidate[] {
  if (!ALLOW_SYNTHETIC_FUSION) return [];
  return STOCK_UNIVERSE
    .map(([symbol, name]) => calculateRecord(symbol, name, strategy, period))
    .filter((record) => filterByStrategy(record, strategy))
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, limit);
}

export function buildExtremeResponse(symbol: string, period = '日'): ExtremeResponse {
  const name = STOCK_UNIVERSE.find(([id]) => id === symbol)?.[1] ?? symbol;
  const rows = buildSyntheticKlines(symbol, period);
  const last = rows.at(-1) as KLine;
  const items = [30, 60, 120].map((window) => {
    const windowRows = rows.slice(-window);
    const maxVolume = windowRows.reduce((best, row) => row.volume > best.volume ? row : best, windowRows[0]);
    const changePct = ((last.close - maxVolume.close) / maxVolume.close) * 100;
    return {
      window,
      date: maxVolume.date,
      price: maxVolume.close,
      volume: maxVolume.volume,
      change_pct: round(changePct),
      kind: maxVolume.close >= maxVolume.open ? 'red' as const : 'black' as const,
    };
  });

  return {
    symbol,
    name,
    latest_date: last.date,
    latest_price: last.close,
    items,
  };
}

function scoreAction(action?: string): number {
  if (action === 'BUY') return 24;
  // WAIT 是觀察，不是可直接放大的交易訊號
  if (action === 'WAIT') return 4;
  if (action === 'SELL') return -20;
  return 0;
}

function scoreLiao(points?: number, diff?: number): number {
  if (points === undefined) return 0;
  const pointScore = points >= 18 ? 30 : points >= 11 ? 22 : points === 0 ? 12 : 4;
  const diffScore = diff !== undefined ? Math.max(-8, Math.min(12, 8 - Math.abs(diff) * 0.45)) : 0;
  return pointScore + diffScore;
}

function isEtfLikePosition(position: Position): boolean {
  const ticker = String(position.ticker || '').trim().toUpperCase();
  const name = String(position.name || '').trim();
  const type = String(position.type || '').trim().toUpperCase();
  return (
    /^00\d{3}[A-Z]?$/.test(ticker) ||
    type.includes('ETF') ||
    name.includes('ETF') ||
    name.includes('主動') ||
    name.includes('群益台灣') ||
    name.includes('國泰永續') ||
    name.includes('大華優利') ||
    name.includes('半導體')
  );
}

function toNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isTradableTaiwanTicker(value: unknown): boolean {
  return /^\d{4,6}[A-Za-z]?$/.test(String(value || '').trim());
}

function isDecisionAction(value: unknown): value is 'BUY' | 'WAIT' | 'SELL' {
  return value === 'BUY' || value === 'WAIT' || value === 'SELL';
}

function addPct(price: number, pct: number): number {
  return round(price * (1 + pct / 100));
}

function calculateTargetPct(stock: FusionStock): number {
  const base = stock.skynetAction === 'SELL' ? -3.5 : stock.skynetAction === 'WAIT' ? 2.2 : 4.2;
  const confidenceBoost = Math.max(0, Math.min(1.6, ((stock.confidence || 0) - 65) / 25));
  const liaoBoost = stock.liaoPoints !== undefined ? (stock.liaoPoints >= 18 ? 1.3 : stock.liaoPoints >= 11 ? 0.7 : -0.4) : 0;
  const volumeBoost = stock.volumeRatio !== undefined ? Math.max(-0.7, Math.min(1.1, (stock.volumeRatio - 1) * 1.2)) : 0;
  const trendBoost = stock.changePct !== undefined ? Math.max(-0.8, Math.min(0.9, stock.changePct * 0.15)) : 0;
  return Math.max(stock.skynetAction === 'SELL' ? -8 : 1.2, Math.min(8, base + confidenceBoost + liaoBoost + volumeBoost + trendBoost));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fairValueConfidenceFor(value: unknown, modelCount = 0): NonNullable<FusionStock['fairValueConfidence']> {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'high' || raw === '高' || raw === '高信心') return 'HIGH';
  if (raw === 'medium' || raw === 'mid' || raw === '中' || raw === '中等') return 'MEDIUM';
  if (raw === 'low' || raw === '低' || raw === '低信心') return 'LOW';
  if (modelCount >= 10) return 'MEDIUM';
  if (modelCount >= 5) return 'LOW';
  return 'UNKNOWN';
}

function evaluateFairValueForStock(stock: FusionStock, price: number | null) {
  const fairValue = toNumber(stock.fairValue);
  const modelCount = toNumber(stock.fairValueModelCount) ?? 0;
  const confidence = fairValueConfidenceFor(stock.fairValueConfidence, modelCount);
  const weakEvidence = confidence === 'UNKNOWN' || confidence === 'LOW' || (modelCount > 0 && modelCount < 5);

  if (!price || !fairValue) {
    return {
      available: false,
      signal: 'UNAVAILABLE' as const,
      confidence,
      modelCount,
      scoreDelta: 0,
      risk: 'UNKNOWN' as const,
      warnings: ['fair_value_unavailable'],
      note: '公允值資料不足，不能用估值支撐買賣結論。',
    };
  }

  const upsidePct = round(((fairValue - price) / price) * 100);
  const distancePct = round(((price - fairValue) / fairValue) * 100);
  const warnings: string[] = [];
  if (weakEvidence) warnings.push('fair_value_low_confidence');

  if (upsidePct >= 20) {
    return {
      available: true,
      fairValue,
      upsidePct,
      distancePct,
      signal: 'UNDERVALUED' as const,
      confidence,
      modelCount,
      scoreDelta: weakEvidence ? 4 : 8,
      risk: weakEvidence ? 'medium' as const : 'low' as const,
      warnings,
      note: '公允值有安全邊際，但仍需技術與籌碼確認。',
    };
  }

  if (upsidePct >= 8) {
    return {
      available: true,
      fairValue,
      upsidePct,
      distancePct,
      signal: 'SLIGHT_UNDERVALUE' as const,
      confidence,
      modelCount,
      scoreDelta: weakEvidence ? 2 : 4,
      risk: 'medium' as const,
      warnings,
      note: '現價略低於公允值，等待進場觸發。',
    };
  }

  if (upsidePct <= -25) {
    return {
      available: true,
      fairValue,
      upsidePct,
      distancePct,
      signal: 'OVERVALUED' as const,
      confidence,
      modelCount,
      scoreDelta: weakEvidence ? -6 : -14,
      risk: 'high' as const,
      warnings: [...warnings, 'fair_value_overvalued'],
      note: '現價明顯高於公允值，正式 BUY 應降權。',
    };
  }

  if (upsidePct <= -10) {
    return {
      available: true,
      fairValue,
      upsidePct,
      distancePct,
      signal: 'SLIGHT_OVERVALUE' as const,
      confidence,
      modelCount,
      scoreDelta: weakEvidence ? -3 : -7,
      risk: 'medium' as const,
      warnings: [...warnings, 'fair_value_premium'],
      note: '現價高於公允值，追價風險升高。',
    };
  }

  return {
    available: true,
    fairValue,
    upsidePct,
    distancePct,
    signal: 'NEAR_FAIR' as const,
    confidence,
    modelCount,
    scoreDelta: 0,
    risk: 'medium' as const,
    warnings,
    note: '現價接近公允值，估值不支持追價，也不支持恐慌砍倉。',
  };
}

function calibratedConfidenceFor(stock: FusionStock, dataQuality: number, warnings: string[]): number {
  const base = clamp(stock.confidence ?? (stock.skynetAction === 'BUY' ? 58 : stock.skynetAction === 'SELL' ? 54 : 48), 0, 100);
  const sourceBoost = Math.min(10, Math.max(0, stock.source.length - 1) * 5);
  const technicalBoost = stock.liaoPoints !== undefined
    ? stock.liaoPoints >= 18 ? 8 : stock.liaoPoints >= 11 ? 5 : 1
    : 0;
  const volumeBoost = stock.volumeRatio !== undefined ? clamp((stock.volumeRatio - 1) * 8, -5, 8) : -2;
  const qualityAdjustment = clamp((dataQuality - 60) * 0.22, -12, 9);
  const warningPenalty = warnings.length * 6;
  const actionPenalty = stock.skynetAction === 'WAIT' ? 10 : stock.skynetAction === 'SELL' ? 6 : 0;
  return Math.round(clamp(base + sourceBoost + technicalBoost + volumeBoost + qualityAdjustment - warningPenalty - actionPenalty, 5, 92));
}

function executionScoreFor(stock: FusionStock, dataQuality: number, calibratedConfidence: number, riskReward?: number, fairValueScoreDelta = 0): number {
  const actionBase = stock.skynetAction === 'BUY' ? 28 : stock.skynetAction === 'SELL' ? 14 : 8;
  const sourceScore = Math.min(18, stock.source.length * 6);
  const technicalScore = stock.liaoPoints !== undefined
    ? stock.liaoPoints >= 18 ? 18 : stock.liaoPoints >= 11 ? 12 : 5
    : 0;
  const volumeScore = stock.volumeRatio !== undefined ? clamp((stock.volumeRatio - 0.8) * 12, -5, 12) : -3;
  const riskRewardScore = riskReward !== undefined ? clamp((riskReward - 1) * 12, -8, 16) : -8;
  const qualityScore = clamp((dataQuality - 45) * 0.45, -12, 18);
  const confidenceScore = clamp((calibratedConfidence - 50) * 0.35, -10, 14);
  return Math.round(clamp(actionBase + sourceScore + technicalScore + volumeScore + riskRewardScore + qualityScore + confidenceScore + fairValueScoreDelta, 0, 100));
}

function riskLevelFor(stock: FusionStock, dataQuality: number, riskReward?: number, warnings: string[] = [], fairValueRisk?: 'UNKNOWN' | 'low' | 'medium' | 'high'): NonNullable<FusionStock['riskLevel']> {
  if (fairValueRisk === 'high' && stock.skynetAction === 'BUY') return 'high';
  if (stock.skynetAction === 'SELL' || dataQuality < 50 || warnings.length >= 2) return 'high';
  if (riskReward !== undefined && riskReward < 1.2) return 'high';
  if (dataQuality >= 72 && stock.source.length >= 2 && (riskReward ?? 0) >= 1.6 && warnings.length === 0) return 'low';
  return 'medium';
}

function decisionLabelFor(stock: FusionStock, executionScore: number, riskLevel: NonNullable<FusionStock['riskLevel']>): NonNullable<FusionStock['decisionLabel']> {
  if (stock.skynetAction === 'SELL') return '防守優先';
  if (stock.qualityWarnings?.includes('fair_value_overvalued')) return '防守優先';
  if (stock.qualityWarnings?.includes('fair_value_premium')) return '觀察等觸發';
  if (riskLevel === 'high') return stock.skynetAction === 'BUY' ? '防守優先' : '觀察等觸發';
  if (stock.skynetAction === 'BUY' && executionScore >= 68 && stock.tradable) return '可執行';
  return '觀察等觸發';
}

function decisionNoteFor(stock: FusionStock, riskLevel: NonNullable<FusionStock['riskLevel']>, warnings: string[]): string {
  if (stock.skynetAction === 'SELL') return '撤退或降曝險訊號優先，不做進攻解讀。';
  if (warnings.includes('fair_value_overvalued')) return '公允值顯示明顯溢價，暫不把動能訊號放大成可執行 BUY。';
  if (warnings.includes('fair_value_premium')) return '現價高於公允值，先不追，等待回落或基本面上修。';
  if (warnings.includes('single_source_signal')) return '只有單一來源，不足以直接放大成高勝率進場。';
  if (warnings.includes('missing_technical_confirm')) return '缺少量價或技術確認，需等待盤中觸發。';
  if (warnings.includes('low_data_quality')) return '資料品質不足，信心已自動降權。';
  if (riskLevel === 'high') return '風險報酬或資料條件不足，先控風險。';
  if (stock.skynetAction === 'BUY' && stock.tradable) return '來源、技術與風控條件較完整，仍需人工確認觸發價。';
  return '目前適合追蹤，不宜把觀察訊號包裝成進場。';
}

function enrichFusionStock(stock: FusionStock): FusionStock {
  const price = toNumber(stock.price);
  const stop = toNumber(stock.stopLoss);
  const hasCrossSource = stock.source.length >= 2;
  const hasTechnical = stock.liaoPoints !== undefined || stock.liaoDiff !== undefined || stock.volumeRatio !== undefined;
  const warnings: string[] = [];
  let fusionScore = stock.fusionScore;
  let dataQuality = stock.dataQuality;

  if (!hasCrossSource) {
    fusionScore *= 0.72;
    warnings.push('single_source_signal');
  }
  if (!hasTechnical && stock.skynetAction === 'BUY') {
    fusionScore *= 0.86;
    warnings.push('missing_technical_confirm');
  }
  if (dataQuality < 55 && stock.skynetAction === 'BUY') {
    fusionScore *= 0.84;
    warnings.push('low_data_quality');
  }
  if (price && price >= 1000 && !hasCrossSource) {
    fusionScore -= 8;
    dataQuality = Math.max(0, dataQuality - 6);
    warnings.push('high_price_without_cross_check');
  }

  const fairValue = evaluateFairValueForStock(stock, price);
  for (const warning of fairValue.warnings) {
    if (!warnings.includes(warning) && warning !== 'fair_value_unavailable') warnings.push(warning);
  }
  if (stock.skynetAction === 'BUY' && fairValue.signal === 'OVERVALUED') fusionScore *= 0.72;
  if (stock.skynetAction === 'BUY' && fairValue.signal === 'SLIGHT_OVERVALUE') fusionScore *= 0.86;
  if (fairValue.signal === 'UNDERVALUED' && hasTechnical) fusionScore += fairValue.scoreDelta;

  const targetPct = price ? calculateTargetPct(stock) : 0;
  const targetPrice = price ? addPct(price, targetPct) : stock.targetPrice;
  const fallbackStop = price
    ? addPct(price, stock.skynetAction === 'SELL' ? 2.2 : -Math.max(2.2, Math.min(4.8, Math.abs(targetPct) * 0.65)))
    : stock.stopLoss;
  const resolvedStop = stop || fallbackStop;
  const riskReward = price && typeof targetPrice === 'number' && typeof resolvedStop === 'number'
    ? Math.abs((targetPrice - price) / Math.max(0.01, price - resolvedStop))
    : undefined;

  const tradable = stock.skynetAction === 'BUY'
    ? dataQuality >= 55 && (hasCrossSource || hasTechnical) && price !== null && fairValue.signal !== 'OVERVALUED'
    : dataQuality >= 45;
  const normalizedDataQuality = Math.max(0, Math.min(100, Math.round(dataQuality)));
  const calibratedConfidence = calibratedConfidenceFor(stock, normalizedDataQuality, warnings);
  const executionScore = executionScoreFor(stock, normalizedDataQuality, calibratedConfidence, riskReward, fairValue.scoreDelta);
  const riskLevel = riskLevelFor(stock, normalizedDataQuality, riskReward, warnings, fairValue.risk);
  const stockWithTradable = { ...stock, tradable, qualityWarnings: warnings };
  const decisionLabel = decisionLabelFor(stockWithTradable, executionScore, riskLevel);

  return {
    ...stock,
    dataQuality: normalizedDataQuality,
    fusionScore: round(Math.max(-20, fusionScore), 2),
    fairValue: fairValue.available ? fairValue.fairValue : stock.fairValue,
    fairValueUpsidePct: fairValue.available ? fairValue.upsidePct : undefined,
    fairValueDistancePct: fairValue.available ? fairValue.distancePct : undefined,
    fairValueSignal: fairValue.signal,
    fairValueConfidence: fairValue.confidence,
    fairValueNote: fairValue.note,
    fairValueModelCount: fairValue.modelCount || undefined,
    fairValueSource: stock.fairValueSource,
    targetPrice,
    targetBasis: price ? `品質${Math.round(dataQuality)}・來源${stock.source.length}・目標${round(targetPct, 2)}%` : undefined,
    stopLoss: resolvedStop,
    riskReward: riskReward !== undefined ? round(riskReward, 2) : undefined,
    tradable,
    calibratedConfidence,
    executionScore,
    riskLevel,
    decisionLabel,
    decisionNote: decisionNoteFor(stock, riskLevel, warnings),
    qualityWarnings: warnings,
  };
}

export function buildFusionStocks(input: {
  reports: BattleReport[];
  positions: Position[];
  snipers: Sniper[];
  liaoCandidates: LiaoCandidate[];
}): FusionStock[] {
  const map = new Map<string, FusionStock>();

  for (const report of input.reports) {
    const ticker = String(report.ticker || '').trim();
    if (!isTradableTaiwanTicker(ticker) || !isDecisionAction(report.action)) continue;
    map.set(ticker, {
      ticker,
      name: report.name || ticker,
      source: ['Omni'],
      signalTags: [report.action ? `Omni ${report.action}` : 'Omni'],
      skynetAction: report.action,
      confidence: report.confidence,
      price: report.price,
      fairValue: report.fairValue,
      fairValueConfidence: fairValueConfidenceFor(report.fairValueConfidence, toNumber(report.fairValueModelCount) ?? 0),
      fairValueModelCount: toNumber(report.fairValueModelCount) ?? undefined,
      fairValueSource: report.fairValueSource,
      stopLoss: report.stopLoss,
      targetPrice: report.target,
      dataQuality: 34,
      fusionScore: scoreAction(report.action) + Math.max(0, Math.min(18, (report.confidence || 0) * 0.18)),
    });
  }

  for (const sniper of input.snipers) {
    const ticker = String(sniper.ticker || '').trim();
    if (!isTradableTaiwanTicker(ticker)) continue;
    const prev = map.get(ticker);
    map.set(ticker, {
      ticker,
      name: prev?.name || sniper.name || ticker,
      source: Array.from(new Set([...(prev?.source || []), '狙擊'])),
      signalTags: Array.from(new Set([...(prev?.signalTags || []), sniper.status || '狙擊追蹤'])),
      skynetAction: prev?.skynetAction,
      confidence: prev?.confidence,
      price: prev?.price,
      fairValue: prev?.fairValue,
      fairValueConfidence: prev?.fairValueConfidence,
      fairValueModelCount: prev?.fairValueModelCount,
      fairValueSource: prev?.fairValueSource,
      triggerPrice: sniper.triggerPrice,
      stopLoss: prev?.stopLoss || sniper.stopPrice,
      status: sniper.status,
      dataQuality: Math.min(100, (prev?.dataQuality || 0) + 18),
      fusionScore: (prev?.fusionScore || 0) + (sniper.status === '待觸發' ? 16 : 6),
    });
  }

  // 持倉/自選/交易紀錄已從主候選排行移除：它們只能做風險提示，不能創建或加權飆股候選。

  for (const candidate of input.liaoCandidates) {
    const ticker = String(candidate.symbol || '').trim();
    if (!isTradableTaiwanTicker(ticker)) continue;
    const prev = map.get(ticker);
    map.set(ticker, {
      ticker,
      name: prev?.name || candidate.name || ticker,
      source: Array.from(new Set([...(prev?.source || []), '內建21點'])),
      signalTags: Array.from(new Set([
        ...(prev?.signalTags || []),
        `${candidate.points}點`,
        candidate.volume_ratio >= 1.2 ? '量增' : '量縮/平量',
        candidate.change_pct >= 0 ? '紅K動能' : '回測整理',
      ])),
      skynetAction: prev?.skynetAction,
      confidence: prev?.confidence,
      price: prev?.price || candidate.price,
      fairValue: prev?.fairValue,
      fairValueConfidence: prev?.fairValueConfidence,
      fairValueModelCount: prev?.fairValueModelCount,
      fairValueSource: prev?.fairValueSource,
      triggerPrice: prev?.triggerPrice,
      liaoPoints: candidate.points,
      liaoDiff: candidate.diff,
      volumeRatio: candidate.volume_ratio,
      changePct: candidate.change_pct,
      chiefNet: candidate.chief_net,
      stopLoss: prev?.stopLoss || candidate.stop_loss,
      status: prev?.status,
      dataQuality: Math.min(100, (prev?.dataQuality || 0) + 32),
      fusionScore: (prev?.fusionScore || 0) + scoreLiao(candidate.points, candidate.diff),
    });
  }

  return Array.from(map.values())
    .map(enrichFusionStock)
    .sort((a, b) => (b.executionScore ?? 0) - (a.executionScore ?? 0) || b.fusionScore - a.fusionScore)
    .slice(0, 24);
}
