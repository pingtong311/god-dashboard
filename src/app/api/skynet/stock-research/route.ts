/**
 * 個股研究資料聚合（BFF）
 * GET /api/skynet/stock-research?ticker=2330
 *
 * 複刻「股市大佬 TradeBoss」個股研究頁（/stock?id=2330）所需的資料層。
 * 本站已有多支獨立 route 負責單一資料源，本 route 作為「頁面用聚合層」，
 * 以同源內部呼叫彙整，並用 src/lib/stockResearch.ts 的純函式推導顯示值：
 *
 *   1. /api/skynet/twse?tickers=2330        → 即時報價（價量）
 *   2. /api/skynet/chips?ticker=2330&days=N → 三大法人 / 融資券 / TDCC 集保
 *   3. /api/skynet/fundamental?ticker=2330  → 估值（PE/PB/殖利率）+ 月營收
 *   4. /api/skynet/kline?ticker=2330&type=daily → 日 K（近 6 日累計漲跌）
 *
 * 設計原則（沿用本專案慣例）：
 * - 任一子來源失敗不拖垮其他：取到幾欄回幾欄，缺欄一律 null（**絕不補 0**）。
 * - 全來源皆失敗 → 200 + { ok:false, reason }（比照 futures / chips 慣例，不 5xx）。
 * - 非法代號 → 400 + { ok:false, reason:'invalid_ticker' }。
 * - 無跨股排行來源 → turnover.rank 恆 null；分點/當沖/籌碼體檢/研究熱度/新聞
 *   本站無公開來源 → 由前端標「資料未入庫」。
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildStockResearchData,
  type DailyCandle,
  type FundamentalInput,
  type InstitutionalRow,
  type MarginRow,
  type QuoteInput,
  type RawStockInputs,
  type SectorPeerInput,
  type StockResearchData,
  type TdccRow,
} from '@/lib/stockResearch';

/** 內部子來源呼叫逾時（毫秒）；chips 需逐日抓 T86/MI_MARGN，留足預算。 */
const INTERNAL_TIMEOUT_MS = 18_000;
/** chips route 取幾個交易日的法人/資券（供連續買賣超推導；10 日足夠算連買連賣）。 */
const CHIPS_DAYS = 10;

/** 台股 4~6 位數字（可帶一個字母後綴）。 */
const TICKER_RE = /^\d{4,6}[A-Z]?$/;

interface InternalFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** 同源內部 GET；逾時/非 JSON/網路錯誤一律回 ok:false（不拋）。 */
async function fetchInternal(url: string): Promise<InternalFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** 數字防護：非有限值回 null（不當 0）。 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** TWSE 日期 'YYYYMMDD' → 'YYYY-MM-DD'；已是 ISO 則原樣。 */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return null;
}

/** 'HH:MM'（取時間戳的時分）。 */
function toHm(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const m = value.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

// ── 各子來源 → 正規化 ──────────────────────────────────

function normalizeQuote(body: unknown): QuoteInput | null {
  if (!body || typeof body !== 'object') return null;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0] as Record<string, unknown>;
  if (!first) return null;
  return {
    price: num(first.price),
    changePct: num(first.changePercent),
    open: num(first.open),
    high: num(first.high),
    low: num(first.low),
    prevClose: num(first.prevClose),
    volumeLots: num(first.volume),
    tradeDate: toIsoDate(first.tradeDate),
    asOf: toHm(first.timestamp),
    name: typeof first.name === 'string' && first.name.trim() ? first.name.trim() : null,
  };
}

function normalizeChips(body: unknown): Pick<RawStockInputs, 'institutionalHistory' | 'marginHistory' | 'tdcc' | 'concentration'> {
  const empty = { institutionalHistory: [] as InstitutionalRow[], marginHistory: [] as MarginRow[], tdcc: null, concentration: null };
  if (!body || typeof body !== 'object') return empty;
  const b = body as Record<string, unknown>;

  const institutionalHistory: InstitutionalRow[] = Array.isArray(b.institutionalHistory)
    ? (b.institutionalHistory as Record<string, unknown>[])
        .map((row) => ({
          date: toIsoDate(row.date) ?? '',
          foreignNet: num(row.foreignNet) ?? 0,
          trustNet: num(row.trustNet) ?? 0,
          dealerNet: num(row.dealerNet) ?? 0,
          totalNet: num(row.totalNet) ?? 0,
        }))
        .filter((row) => row.date !== '')
    : [];

  const marginHistory: MarginRow[] = Array.isArray(b.marginHistory)
    ? (b.marginHistory as Record<string, unknown>[])
        .map((row) => ({
          date: toIsoDate(row.date) ?? '',
          marginBalance: num(row.marginBalance) ?? 0,
          shortBalance: num(row.shortBalance) ?? 0,
        }))
        .filter((row) => row.date !== '')
    : [];

  const tdcc: TdccRow[] | null = Array.isArray(b.tdcc)
    ? (b.tdcc as Record<string, unknown>[]).map((row) => ({
        level: String(row.level ?? ''),
        lots: num(row.lots) ?? 0,
        pct: num(row.pct) ?? 0,
      }))
    : null;

  return { institutionalHistory, marginHistory, tdcc, concentration: num(b.concentration) };
}

function normalizeFundamental(body: unknown): FundamentalInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true || !b.data || typeof b.data !== 'object') return null;
  const d = b.data as Record<string, unknown>;
  return {
    peRatio: num(d.peRatio),
    pbRatio: num(d.pbRatio),
    dividendYield: num(d.dividendYield),
    monthlyRevenue: num(d.monthlyRevenue),
    monthlyRevenueYoY: num(d.monthlyRevenueYoY),
    asOfDate: toIsoDate(d.asOfDate),
  };
}

/** kline route → 完整 OHLCV 日 K（供走勢／技術／風險／情境推導）。 */
function normalizeKline(body: unknown): DailyCandle[] | null {
  if (!body || typeof body !== 'object') return null;
  const candles = (body as { candles?: unknown }).candles;
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const points: DailyCandle[] = [];
  for (const c of candles as Record<string, unknown>[]) {
    const date = toIsoDate(c.date);
    const close = num(c.close);
    if (date && close !== null && close > 0) {
      // 缺 OHLC 時以收盤回填（僅用於避免 NaN；不無中生有波動）。
      const open = num(c.open);
      const high = num(c.high);
      const low = num(c.low);
      const volume = num(c.volume);
      points.push({
        date,
        open: open ?? close,
        high: high ?? close,
        low: low ?? close,
        close,
        volume: volume ?? 0,
      });
    }
  }
  return points.length >= 2 ? points : null;
}

/**
 * treemap route → 本檔所屬族群統計（同族群 peers）。
 * 在 sectors 中找到包含本檔的族群；找不到或欄位缺損回 null。
 */
function normalizeSectorPeers(body: unknown, ticker: string): SectorPeerInput | null {
  if (!body || typeof body !== 'object') return null;
  const sectors = (body as { sectors?: unknown }).sectors;
  if (!Array.isArray(sectors)) return null;
  for (const s of sectors as Record<string, unknown>[]) {
    const items = Array.isArray(s.items) ? (s.items as Record<string, unknown>[]) : [];
    const self = items.find((it) => String(it.symbol ?? '').trim() === ticker);
    if (!self) continue;
    const name = typeof s.sector === 'string' && s.sector.trim() ? s.sector.trim() : null;
    const count = num(s.count);
    if (!name || count === null) return null;
    const avgChangePct = num(s.changePercent);
    if (avgChangePct === null) return null;
    // 龍頭：族內漲幅最高者。
    let leader: SectorPeerInput['leader'] | null = null;
    for (const it of items) {
      const cp = num(it.changePercent);
      if (cp === null) continue;
      if (!leader || cp > leader.changePct) {
        leader = {
          symbol: String(it.symbol ?? '').trim(),
          name: String(it.name ?? '').trim(),
          changePct: cp,
        };
      }
    }
    if (!leader || !leader.symbol || !leader.name) return null;
    const peers: SectorPeerInput['peers'] = [];
    for (const it of items) {
      const price = num(it.price);
      const cp = num(it.changePercent);
      if (price === null || cp === null) continue;
      peers.push({
        symbol: String(it.symbol ?? '').trim(),
        name: String(it.name ?? '').trim(),
        price,
        changePct: cp,
      });
    }
    if (peers.length === 0) return null;
    return { name, count, avgChangePct, leader, peers };
  }
  return null;
}

// ── GET Handler ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').trim().toUpperCase();

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ ok: false, reason: 'invalid_ticker' }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const enc = encodeURIComponent(ticker);

  const [quoteRes, chipsRes, fundRes, klineRes, treemapRes] = await Promise.all([
    fetchInternal(`${origin}/api/skynet/twse?tickers=${enc}`),
    fetchInternal(`${origin}/api/skynet/chips?ticker=${enc}&days=${CHIPS_DAYS}`),
    fetchInternal(`${origin}/api/skynet/fundamental?ticker=${enc}`),
    fetchInternal(`${origin}/api/skynet/kline?ticker=${enc}&type=daily`),
    fetchInternal(`${origin}/api/skynet/treemap`),
  ]);

  const quote = quoteRes.ok ? normalizeQuote(quoteRes.body) : null;
  const chips = chipsRes.ok ? normalizeChips(chipsRes.body) : { institutionalHistory: [], marginHistory: [], tdcc: null, concentration: null };
  const fundamental = fundRes.ok ? normalizeFundamental(fundRes.body) : null;
  const dailyCandles = klineRes.ok ? normalizeKline(klineRes.body) : null;
  const sectorPeers = treemapRes.ok ? normalizeSectorPeers(treemapRes.body, ticker) : null;

  const hasAnyData =
    quote !== null ||
    chips.institutionalHistory.length > 0 ||
    chips.marginHistory.length > 0 ||
    chips.tdcc !== null ||
    fundamental !== null ||
    dailyCandles !== null;

  if (!hasAnyData) {
    return NextResponse.json({ ok: false, reason: 'stock_research_unavailable' }, { status: 200 });
  }

  const raw: RawStockInputs = {
    quote,
    institutionalHistory: chips.institutionalHistory,
    marginHistory: chips.marginHistory,
    tdcc: chips.tdcc,
    concentration: chips.concentration,
    fundamental,
    dailyCandles,
    sectorPeers,
  };

  const data: StockResearchData = buildStockResearchData(ticker, raw);

  return NextResponse.json(
    { ok: true, data, fetchedAt: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
