/**
 * 個股研究頁（/stock?id=2330）— 純資料整理與格式化邏輯
 * ----------------------------------------------------------------------------
 * 複刻「股市大佬 TradeBoss」的個股研究頁。本檔只放**純函式**（無 React、無 fetch），
 * 讓頁面元件與 API route 共用同一套「原始資料 → 顯示值」的推導，並可獨立單元測試。
 *
 * 誠實原則（沿用本專案 chips / fundamental route 慣例）：
 * - 上游取不到的欄位一律 `null`，顯示層標「資料未入庫」，**絕不補 0、絕不捏造**。
 * - 所有數字皆由真實來源推導（報價 / 法人 / 融資券 / TDCC 集保 / 估值），
 *   無 `Math.random()`、無硬編碼樣本值。
 */

// ── 型別 ────────────────────────────────────────────────

/** 漲跌色調（對應 Tailwind text-up / text-down / text-ink）。 */
export type Tone = 'up' | 'down' | 'flat';

/** 市場狀態（由台北時間推導；非交易日/非盤中皆視為已收盤）。 */
export type MarketStatus = 'open' | 'closed';

/** 標準化後的報價輸入。 */
export interface QuoteInput {
  price: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volumeLots: number | null;
  /** 資料日 'YYYY-MM-DD'。 */
  tradeDate: string | null;
  /** 最後更新時間 'HH:mm'。 */
  asOf: string | null;
  name: string | null;
}

/** 三大法人單日（單位：張）。 */
export interface InstitutionalRow {
  date: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
}

/** 融資融券單日（單位：張）。 */
export interface MarginRow {
  date: string;
  marginBalance: number;
  shortBalance: number;
}

/** TDCC 集保級距（合併後）。 */
export interface TdccRow {
  level: string;
  lots: number;
  pct: number;
}

/** 基本面輸入（估值 + 月營收）。 */
export interface FundamentalInput {
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  /** 月營收（新台幣元）。 */
  monthlyRevenue: number | null;
  /** 月營收年增率（%）。 */
  monthlyRevenueYoY: number | null;
  /** 財報截至日。 */
  asOfDate: string | null;
}

/** 日 K 收盤（由新到舊或由舊到新皆可，函式內會排序）。 */
export interface ClosePoint {
  date: string;
  close: number;
}

/** 頁面需要的所有原始輸入（由 route 從各上游正規化後填入）。 */
export interface RawStockInputs {
  quote: QuoteInput | null;
  institutionalHistory: InstitutionalRow[];
  marginHistory: MarginRow[];
  tdcc: TdccRow[] | null;
  concentration: number | null;
  fundamental: FundamentalInput | null;
  dailyCloses: ClosePoint[] | null;
}

/** 連續買/賣超結果（張）。 */
export interface Streak {
  days: number;
  net: number;
}

/** 單一「事實卡」。 */
export interface FactCard {
  key: string;
  label: string;
  /** 右上小標籤（偏強/偏弱/持平 等）。 */
  badge: string | null;
  badgeTone: Tone;
  /** 主值文字（null = 未入庫）。 */
  value: string | null;
  valueTone: Tone;
  /** 副標文字。 */
  sub: string | null;
  /** 資料是否入庫（false → 顯示未入庫）。 */
  available: boolean;
}

/** 研究摘要其中一條。 */
export interface SummaryLine {
  label: string;
  text: string;
  available: boolean;
}

/** 完整個股研究資料（API route 回傳、頁面消費）。 */
export interface StockResearchData {
  ticker: string;
  name: string | null;
  /** 產業名稱（本站無公開分類來源 → 目前固定 null）。 */
  industry: string | null;
  dataDate: string | null;

  quote: QuoteInput | null;
  projected: {
    status: MarketStatus | 'unknown';
    actualLots: number | null;
    estimatedLots: number | null;
    note: string;
  };
  institutional: {
    date: string | null;
    foreignNet: number | null;
    trustNet: number | null;
    dealerNet: number | null;
    totalNet: number | null;
    foreignStreak: Streak | null;
    trustStreak: Streak | null;
  };
  margin: {
    date: string | null;
    marginLots: number | null;
    shortLots: number | null;
  };
  holders: {
    date: string | null;
    bigPct: number | null;
    concentration: number | null;
  };
  valuation: {
    date: string | null;
    per: number | null;
    pbr: number | null;
    yieldPct: number | null;
  };
  revenue: {
    revenueYi: number | null;
    yoyPct: number | null;
    asOfDate: string | null;
  };
  /** 成交額（億）；rank 無跨股排行來源 → null。 */
  turnover: {
    amountYi: number | null;
    rank: number | null;
    date: string | null;
  };
  /** 近 6 日累計漲跌（%）。 */
  cum6dPct: number | null;
  /** 近 6 日累計計算所用的交易日數（樣本不足時 < 6）。 */
  cum6dSamples: number;
  /** 供頁面使用的來源標註。 */
  sources: string[];
}

// ── 格式化工具 ──────────────────────────────────────────

/** 整數千分位；非有限值回 '--'。 */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return Math.round(value).toLocaleString('zh-TW');
}

/** 帶正負號整數（+1,234 / -1,234）。 */
export function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-TW')}`;
}

/** 固定小數（預設 2 位）。 */
export function formatFixed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

/** 百分比（帶正負號，預設 2 位）。 */
export function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

/** 以「萬張」為單位：12,989 → '1.3 萬 張'（無值回 null）。 */
export function formatWanLots(lots: number | null | undefined): string | null {
  if (lots === null || lots === undefined || !Number.isFinite(lots)) return null;
  return `${(lots / 1e4).toFixed(1)} 萬 張`;
}

/** 以「億」為單位：32,203,265,000 → '322.0 億'（無值回 null）。 */
export function formatYi(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${(value / 1e8).toFixed(1)} 億`;
}

/** 'YYYY-MM-DD' → 'MM-DD'；其餘原樣回傳。 */
export function toShortDate(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date ?? '';
  return `${date.slice(5, 7)}-${date.slice(8, 10)}`;
}

/** 數值 → 色調（正 up / 負 down / 其餘 flat）。 */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** 漲跌 → 偏強/偏弱/持平 文案。 */
export function priceBadge(changePct: number | null | undefined): string | null {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) return null;
  if (changePct > 0) return '偏強';
  if (changePct < 0) return '偏弱';
  return '持平';
}

// ── 市場狀態（台北時間） ────────────────────────────────

/**
 * 依台北時間判斷台股是否盤中。
 * 規則：週一至週五、09:00 ≤ 台北時間 < 13:30 視為盤中；其餘（含週末）視為已收盤。
 * 註：不含國定假日行事曆，假日會誤判為「盤中」，但僅影響「預估量」是否顯示，非交易訊號。
 *
 * @param now 基準時間（預設為當下）。
 */
export function marketStatus(now: Date = new Date()): MarketStatus {
  // 台北 = UTC+8（無日光節約）。
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = taipei.getUTCDay(); // 0=Sun
  const minutes = taipei.getUTCHours() * 60 + taipei.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const inSession = minutes >= 9 * 60 && minutes < 13 * 60 + 30;
  return isWeekday && inSession ? 'open' : 'closed';
}

/** 台北時間的當日已交易分鐘數（盤中才有意義）。 */
export function elapsedSessionMinutes(now: Date = new Date()): number {
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const minutes = taipei.getUTCHours() * 60 + taipei.getUTCMinutes();
  return Math.max(0, Math.min(270, minutes - 9 * 60));
}

/**
 * 預估今日總成交量（複刻博主時間比例試算）。
 * - 已收盤 → 直接回實量，不預估。
 * - 盤中且已交易分鐘 > 10 且 ≤ 270 → 累計張數 × 270 ÷ 已交易分鐘。
 * - 其餘（前 10 分鐘 / 無報價）→ 不預估。
 */
export function deriveProjectedVolume(input: {
  volumeLots: number | null;
  status: MarketStatus | 'unknown';
  elapsedMinutes?: number;
}): { status: MarketStatus | 'unknown'; actualLots: number | null; estimatedLots: number | null; note: string } {
  const actual = input.volumeLots !== null && Number.isFinite(input.volumeLots) ? input.volumeLots : null;

  if (input.status === 'closed') {
    return { status: 'closed', actualLots: actual, estimatedLots: null, note: '已收盤，不預估。' };
  }
  if (input.status === 'open' && actual !== null) {
    const minutes = input.elapsedMinutes ?? 0;
    if (minutes > 10 && minutes <= 270) {
      const estimated = Math.round((actual * 270) / minutes);
      return {
        status: 'open',
        actualLots: actual,
        estimatedLots: estimated,
        note: '時間比例試算：當下累計張數 × 270 ÷ 開盤至資料時間的分鐘數。未套歷史分時量曲線，不代表最終成交量。',
      };
    }
    return { status: 'open', actualLots: actual, estimatedLots: null, note: '盤中前 10 分鐘不估算。' };
  }
  return { status: 'unknown', actualLots: actual, estimatedLots: null, note: '暫無報價，無法估算。' };
}

// ── 連續買賣超 ──────────────────────────────────────────

/**
 * 由「最新交易日往回」計算連續同向（買/賣超）天數與最新一日淨額。
 * history 需含 date（'YYYY-MM-DD'）；函式內部自行排序，呼叫端不需排序。
 *
 * @param history 逐日資料（至少含 date 與取值）。
 * @param pick 取每日淨額的函式（例如 row => row.foreignNet）。
 * @returns 連續天數與最新一日淨額；資料不足或最新一日為 0 時回 null。
 */
export function computeStreak<T extends { date: string }>(
  history: T[],
  pick: (row: T) => number
): Streak | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const latestNet = pick(latest);
  if (!Number.isFinite(latestNet) || latestNet === 0) return null;

  const sign = Math.sign(latestNet);
  let days = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const net = pick(sorted[i]);
    if (!Number.isFinite(net) || Math.sign(net) !== sign) break;
    days += 1;
  }
  return { days, net: Math.round(latestNet) };
}

// ── 近 N 日累計漲跌 ─────────────────────────────────────

/**
 * 近 `days` 個交易日累計漲跌（%）：以最後 `days + 1` 個收盤價，
 * 用 (末值 / 起值 − 1) × 100 計算。樣本不足時以實際樣本數計算並回傳 samples。
 *
 * @returns { pct, samples }；樣本 < 2 時 pct 為 null。
 */
export function computeCumulativePct(
  closes: ClosePoint[] | null,
  days: number
): { pct: number | null; samples: number } {
  if (!closes || closes.length < 2) return { pct: null, samples: closes?.length ?? 0 };
  const sorted = [...closes]
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { pct: null, samples: sorted.length };

  const windowSize = Math.min(days, sorted.length - 1);
  const startIdx = sorted.length - 1 - windowSize;
  const start = sorted[startIdx].close;
  const end = sorted[sorted.length - 1].close;
  if (start <= 0) return { pct: null, samples: windowSize };
  return { pct: Number((((end / start) - 1) * 100).toFixed(2)), samples: windowSize };
}

// ── 事實卡 ──────────────────────────────────────────────

/** 建立 8 張事實卡（對應「個股事實導航」）。 */
export function buildFactCards(data: StockResearchData): FactCard[] {
  const q = data.quote;
  const priceTone = toneOf(q?.changePct);
  const badge = priceBadge(q?.changePct);
  const volumeWan = formatWanLots(q?.volumeLots);

  const cards: FactCard[] = [];

  // 1. 價量
  cards.push({
    key: 'price',
    label: '價量',
    badge,
    badgeTone: priceTone,
    value: q && q.price !== null ? `${formatInt(q.price)}（${formatFixed(q.changePct, 0)}%）` : null,
    valueTone: priceTone,
    sub: badge && volumeWan ? `${badge} · 量 ${volumeWan}` : volumeWan ? `量 ${volumeWan}` : null,
    available: q !== null && q.price !== null,
  });

  // 2. 三大法人
  cards.push({
    key: 'institutional',
    label: '三大法人',
    badge: null,
    badgeTone: 'flat',
    value:
      data.institutional.foreignNet !== null
        ? `外資 ${formatSigned(data.institutional.foreignNet)} 張`
        : null,
    valueTone: 'flat',
    sub: data.institutional.date ? '最新資料日' : null,
    available: data.institutional.foreignNet !== null,
  });

  // 3. 分點（本站無逐股分點公開來源）
  cards.push({
    key: 'broker',
    label: '分點',
    badge: null,
    badgeTone: 'flat',
    value: null,
    valueTone: 'flat',
    sub: '分點買賣超未入庫',
    available: false,
  });

  // 4. 大戶級距（TDCC 集保 1000 張以上佔比）
  cards.push({
    key: 'holder',
    label: '大戶級距',
    badge: null,
    badgeTone: 'flat',
    value: data.holders.bigPct !== null ? `1000張+ 佔 ${formatFixed(data.holders.bigPct, 2)}%` : null,
    valueTone: 'flat',
    sub: data.holders.date ? `資料日 ${toShortDate(data.holders.date)}` : null,
    available: data.holders.bigPct !== null,
  });

  // 5. 當沖（需逐股當沖統計，本站無公開來源）
  cards.push({
    key: 'daytrade',
    label: '當沖',
    badge: null,
    badgeTone: 'flat',
    value: null,
    valueTone: 'flat',
    sub: '當沖統計未入庫',
    available: false,
  });

  // 6. 融資券
  cards.push({
    key: 'margin',
    label: '融資券',
    badge: null,
    badgeTone: 'flat',
    value:
      data.margin.marginLots !== null ? `融資 ${formatWanLots(data.margin.marginLots)}` : null,
    valueTone: 'flat',
    sub: data.margin.shortLots !== null ? `融券 ${formatInt(data.margin.shortLots)} 張` : null,
    available: data.margin.marginLots !== null,
  });

  // 7. 籌碼體檢（需換手估算，本站未接）
  cards.push({
    key: 'chipHealth',
    label: '籌碼體檢',
    badge: null,
    badgeTone: 'flat',
    value: null,
    valueTone: 'flat',
    sub: '換手估算未入庫',
    available: false,
  });

  // 8. 監理
  cards.push({
    key: 'regulatory',
    label: '監理',
    badge: null,
    badgeTone: 'flat',
    value: data.cum6dPct !== null ? `6 日累計 ${formatSignedPct(data.cum6dPct)}` : null,
    valueTone: 'flat',
    sub: '看注意臨界值',
    available: data.cum6dPct !== null,
  });

  return cards;
}

// ── 研究摘要 ────────────────────────────────────────────

/** 建立研究摘要各條（誠實標示 available）。 */
export function buildResearchSummary(data: StockResearchData): SummaryLine[] {
  const lines: SummaryLine[] = [];

  // 分點條件（未入庫）
  lines.push({ label: '分點條件', text: '分點買賣超資料未入庫。', available: false });

  // 大戶籌碼（TDCC 集保）
  if (data.holders.bigPct !== null) {
    lines.push({
      label: '大戶籌碼',
      text: `集保 1000 張以上持股佔 ${formatFixed(data.holders.bigPct, 2)}%${data.holders.date ? `（資料日 ${toShortDate(data.holders.date)}）` : ''}。`,
      available: true,
    });
  } else {
    lines.push({ label: '大戶籌碼', text: '集保大戶級距資料未入庫。', available: false });
  }

  // 法人連買／連賣
  const fs = data.institutional.foreignStreak;
  const ts = data.institutional.trustStreak;
  if (fs || ts) {
    const parts: string[] = [];
    if (fs) {
      parts.push(`外資連${fs.net > 0 ? '買' : '賣'}約 ${fs.days} 日（今日 ${formatSigned(fs.net)} 張）`);
    }
    if (ts) {
      parts.push(`投信連${ts.net > 0 ? '買' : '賣'}約 ${ts.days} 日（今日 ${formatSigned(ts.net)} 張）`);
    }
    lines.push({ label: '法人連買／連賣（最新交易日往回）', text: parts.join('｜'), available: true });
  } else {
    lines.push({ label: '法人連買／連賣（最新交易日往回）', text: '法人連續買賣資料未入庫。', available: false });
  }

  // 估值
  const v = data.valuation;
  if (v.per !== null || v.pbr !== null || v.yieldPct !== null) {
    lines.push({
      label: '估值',
      text: `本益比 ${formatFixed(v.per)}｜淨值比 ${formatFixed(v.pbr)}｜殖利率 ${formatFixed(v.yieldPct)}%${v.date ? `（資料日 ${v.date}）` : ''}`,
      available: true,
    });
  } else {
    lines.push({ label: '估值', text: '估值資料未入庫。', available: false });
  }

  // 資券
  if (data.margin.marginLots !== null || data.margin.shortLots !== null) {
    lines.push({
      label: '資券',
      text: `融資餘額 ${formatInt(data.margin.marginLots)} ／ 融券 ${formatInt(data.margin.shortLots)}（張或股依來源，供參考）`,
      available: true,
    });
  } else {
    lines.push({ label: '資券', text: '融資融券資料未入庫。', available: false });
  }

  // 月營收
  if (data.revenue.revenueYi !== null) {
    const yoy = data.revenue.yoyPct !== null ? `（年增 ${formatSignedPct(data.revenue.yoyPct, 1)}）` : '';
    lines.push({
      label: '月營收',
      text: `最近${data.revenue.asOfDate ? ` ${data.revenue.asOfDate}` : ''} 約 ${formatFixed(data.revenue.revenueYi)} 億${yoy}`,
      available: true,
    });
  } else {
    lines.push({ label: '月營收', text: '月營收資料未入庫。', available: false });
  }

  return lines;
}

// ── 組裝 ────────────────────────────────────────────────

/**
 * 將各上游原始資料組裝為頁面所需的 `StockResearchData`。
 * 所有取不到的欄位一律 null，不補 0。
 *
 * @param ticker 股票代號。
 * @param raw 正規化後的原始輸入。
 * @param now 基準時間（測試可注入）。
 */
export function buildStockResearchData(
  ticker: string,
  raw: RawStockInputs,
  now: Date = new Date()
): StockResearchData {
  const q = raw.quote;

  const inst = raw.institutionalHistory;
  const instLatest = inst.length > 0 ? [...inst].sort((a, b) => a.date.localeCompare(b.date))[inst.length - 1] : null;

  const marg = raw.marginHistory;
  const margLatest = marg.length > 0 ? [...marg].sort((a, b) => a.date.localeCompare(b.date))[marg.length - 1] : null;

  const thousandPlus = raw.tdcc?.find((row) => row.level === '1000張以上') ?? null;
  const tdccDate = raw.quote?.tradeDate ?? null;

  const status = marketStatus(now);
  const projected = deriveProjectedVolume({
    volumeLots: q?.volumeLots ?? null,
    status,
    elapsedMinutes: elapsedSessionMinutes(now),
  });

  const cum = computeCumulativePct(raw.dailyCloses, 6);

  const amountTwd =
    q && q.price !== null && q.volumeLots !== null ? q.price * q.volumeLots * 1000 : null;

  const f = raw.fundamental;

  const sources: string[] = ['本站行情管線（盤中）', '交易所公開資料（盤後統計）'];
  if (raw.tdcc) sources.push('TDCC 集保戶股權分散表');
  if (f) sources.push('TWSE BWIBBU / MOPS 月營收');

  return {
    ticker,
    name: q?.name ?? null,
    industry: null,
    dataDate: q?.tradeDate ?? instLatest?.date ?? null,

    quote: q,
    projected,

    institutional: {
      date: instLatest?.date ?? null,
      foreignNet: instLatest?.foreignNet ?? null,
      trustNet: instLatest?.trustNet ?? null,
      dealerNet: instLatest?.dealerNet ?? null,
      totalNet: instLatest?.totalNet ?? null,
      foreignStreak: computeStreak(inst, (row) => row.foreignNet),
      trustStreak: computeStreak(inst, (row) => row.trustNet),
    },

    margin: {
      date: margLatest?.date ?? null,
      marginLots: margLatest?.marginBalance ?? null,
      shortLots: margLatest?.shortBalance ?? null,
    },

    holders: {
      date: thousandPlus ? tdccDate : null,
      bigPct: thousandPlus ? thousandPlus.pct : null,
      concentration: raw.concentration,
    },

    valuation: {
      date: f?.asOfDate ?? null,
      per: f?.peRatio ?? null,
      pbr: f?.pbRatio ?? null,
      yieldPct: f?.dividendYield ?? null,
    },

    revenue: {
      revenueYi: f?.monthlyRevenue !== null && f?.monthlyRevenue !== undefined ? Number((f.monthlyRevenue / 1e8).toFixed(2)) : null,
      yoyPct: f?.monthlyRevenueYoY ?? null,
      asOfDate: f?.asOfDate ?? null,
    },

    turnover: {
      amountYi: amountTwd !== null ? Number((amountTwd / 1e8).toFixed(1)) : null,
      rank: null,
      date: q?.tradeDate ?? null,
    },

    cum6dPct: cum.pct,
    cum6dSamples: cum.samples,

    sources,
  };
}
