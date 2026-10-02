/**
 * God K 線圖查看器 — Fugle MarketData API 代理路由
 *
 * GET /api/skynet/kline?ticker={ticker}&type={daily|intraday|quote}
 *
 * 職責：
 * - 保護 FUGLE_API_KEY 不暴露於前端
 * - 驗證輸入參數
 * - 代理 Fugle API 請求並標準化回應格式
 * - ETF 備援：Fugle 不支援時自動 fallback 到 Yahoo Finance
 * - 統一錯誤處理
 *
 * §2-C Fugle 請求層 cache（src/lib/fugleCache.ts，防爆 100 req/hr + 5 req/min）：
 * - per-(ticker, fetchType, from) inflight 去重 + 60s TTL cache
 * - redirect:'manual' + AbortSignal.timeout(4000)（比對 futures/route.ts 架構）
 * - stale-on-error：上游掛了 → 回快取快照 + X-Skynet-Stale: true
 * - 全掛無快取 → 200 + { ok:false, error }（不 5xx）
 * - 純包 cache 層：不改 Fugle 端點、不改回傳 shape（對前端透明）；
 *   缺失一律 null（不補零、不硬編碼）
 */


import { NextRequest, NextResponse } from 'next/server';
import {
  FUGLE_UPSTREAM_TIMEOUT_MS,
  buildFugleCacheKey,
  fetchFugleCached,
  type FugleAttempt,
} from '@/lib/fugleCache';

// ── Fugle API 端點 ─────────────────────────────────────

const FUGLE_BASE = 'https://api.fugle.tw/marketdata/v1.0/stock';
type MarketPreset = 'TW' | 'HK' | 'US';

function getFugleUrl(ticker: string, type: string, from?: string): string {
  switch (type) {
    case 'daily': {
      // Fugle 要求 from 必須在一年內，超過則不帶 from（回傳最近約 20 個交易日）
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setDate(oneYearAgo.getDate() + 2); // 留 2 天緩衝
      const safeFrom = from && new Date(from) >= oneYearAgo ? from : undefined;
      return safeFrom
        ? `${FUGLE_BASE}/historical/candles/${ticker}?timeframe=D&from=${safeFrom}`
        : `${FUGLE_BASE}/historical/candles/${ticker}?timeframe=D`;
    }
    case 'intraday':
      return `${FUGLE_BASE}/intraday/candles/${ticker}?timeframe=1`;
    case 'quote':
      return `${FUGLE_BASE}/intraday/quote/${ticker}`;
    default:
      throw new Error('invalid_type');
  }
}

// ── Yahoo Finance 備援（ETF 日K） ──────────────────────

/**
 * 將代號轉換為 Yahoo Finance 格式
 * 台股：00919 → 00919.TW，00919B → 00919B.TWO
 * 港股：00700 → 00700.HK
 * 美股：AAPL → AAPL
 */
function toYahooSymbol(ticker: string, market: MarketPreset): string {
  if (market === 'HK') return `${ticker}.HK`;
  if (market === 'US') return ticker;
  // 含字母後綴（如 B、L、R）的 ETF 通常掛牌於 OTC（TWO）
  if (/[A-Za-z]$/.test(ticker)) {
    return `${ticker}.TWO`;
  }
  return `${ticker}.TW`;
}

/**
 * 從 Yahoo Finance v8 chart API 取得日K資料
 * 回傳標準化的 FugleHistoricalResponse 格式，方便共用 normalizeDaily
 */
async function fetchYahooDaily(
  ticker: string,
  market: MarketPreset,
  from: string | undefined,
  signal: AbortSignal
): Promise<FugleHistoricalResponse | null> {
  const symbol = toYahooSymbol(ticker, market);

  // 計算時間範圍（Unix timestamp）
  const endTs = Math.floor(Date.now() / 1000);
  let startTs: number;
  if (from) {
    startTs = Math.floor(new Date(from).getTime() / 1000);
  } else {
    // 預設 6 個月
    startTs = endTs - 180 * 24 * 60 * 60;
  }

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&period1=${startTs}&period2=${endTs}&events=history`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal,
    });
    if (!res.ok) return null;

    const json = await res.json() as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv || timestamps.length === 0) return null;

    const candles: FugleHistoricalCandle[] = timestamps
      .map((ts, i) => {
        const o = ohlcv.open?.[i];
        const h = ohlcv.high?.[i];
        const l = ohlcv.low?.[i];
        const c = ohlcv.close?.[i];
        const v = ohlcv.volume?.[i];
        // 過濾掉 null/undefined 的資料點
        if (o == null || h == null || l == null || c == null) return null;
        const date = new Date(ts * 1000).toISOString().split('T')[0];
        return { date, open: o, high: h, low: l, close: c, volume: v ?? 0 };
      })
      .filter((c): c is FugleHistoricalCandle => c !== null);

    return { candles };
  } catch {
    return null;
  }
}

/**
 * 從 Yahoo Finance 取得即時報價（ETF 備援）
 */
async function fetchYahooQuote(
  ticker: string,
  market: MarketPreset,
  signal: AbortSignal
): Promise<FugleQuoteResponse | null> {
  const symbol = toYahooSymbol(ticker, market);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal,
    });
    if (!res.ok) return null;

    const json = await res.json() as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta?.regularMarketPrice ?? 0;
    const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? 0;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: ticker,
      name: meta?.shortName ?? ticker,
      closePrice: price,
      previousClose: prevClose,
      change,
      changePercent,
    };
  } catch {
    return null;
  }
}

// ── 型別定義 ───────────────────────────────────────────

interface FugleHistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FugleIntradayCandle {
  date: string;  // ISO 8601 格式
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FugleHistoricalResponse {
  candles?: FugleHistoricalCandle[];
  data?: FugleHistoricalCandle[];  // Fugle API 實際回傳欄位
  sort?: string;                   // 'asc' | 'desc'
}

interface FugleIntradayResponse {
  candles?: FugleIntradayCandle[];
  data?: FugleIntradayCandle[];    // Fugle API 實際回傳欄位
}

interface FugleQuoteResponse {
  symbol: string;
  name: string;
  referencePrice?: number;
  previousClose?: number;
  closePrice?: number;
  change?: number;
  changePercent?: number;
  // 備用欄位
  lastPrice?: number;
  lastChange?: number;
  lastChangePercent?: number;
}

// Yahoo Finance v8 chart API 回應型別
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        shortName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}

// ── 標準化函式 ─────────────────────────────────────────

function normalizeDaily(raw: FugleHistoricalResponse) {
  // Fugle API 回傳欄位為 `data`，但保留 `candles` 相容性（Yahoo Finance fallback 使用）
  const source = raw.data ?? raw.candles ?? [];
  // Fugle 預設 sort: desc（最新在前），需反轉為 asc（舊→新）讓圖表左→右正確顯示
  const sorted = raw.sort === 'desc' ? [...source].reverse() : source;
  const candles = sorted.map((c) => ({
    date: c.date,
    open: Number(c.open) || 0,
    high: Number(c.high) || 0,
    low: Number(c.low) || 0,
    close: Number(c.close) || 0,
    volume: Number(c.volume) || 0,
  }));
  return { candles };
}

/**
 * 將日K重採樣為週K
 * 每週以週五收盤為基準（若該週無週五則取最後一個交易日）
 */
function resampleToWeekly(dailyCandles: { date: string; open: number; high: number; low: number; close: number; volume: number }[]) {
  const weeklyMap = new Map<string, typeof dailyCandles[0][]>();
  
  for (const candle of dailyCandles) {
    const date = new Date(candle.date);
    // 取得該週的週五日期作為 key（ISO 週數：年份-週數）
    const year = date.getUTCFullYear();
    const week = getISOWeek(date);
    const key = `${year}-W${week.toString().padStart(2, '0')}`;
    
    if (!weeklyMap.has(key)) {
      weeklyMap.set(key, []);
    }
    weeklyMap.get(key)!.push(candle);
  }
  
  const weeklyCandles = Array.from(weeklyMap.entries())
    .map(([key, candles]) => {
      // 依日期排序
      candles.sort((a, b) => a.date.localeCompare(b.date));
      const first = candles[0];
      const last = candles[candles.length - 1];
      const high = Math.max(...candles.map(c => c.high));
      const low = Math.min(...candles.map(c => c.low));
      const volume = candles.reduce((sum, c) => sum + c.volume, 0);
      
      return {
        date: last.date, // 週五或該週最後交易日
        open: first.open,
        high,
        low,
        close: last.close,
        volume,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return { candles: weeklyCandles };
}

/**
 * 將日K重採樣為月K
 */
function resampleToMonthly(dailyCandles: { date: string; open: number; high: number; low: number; close: number; volume: number }[]) {
  const monthlyMap = new Map<string, typeof dailyCandles[0][]>();
  
  for (const candle of dailyCandles) {
    const date = new Date(candle.date);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-12
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, []);
    }
    monthlyMap.get(key)!.push(candle);
  }
  
  const monthlyCandles = Array.from(monthlyMap.entries())
    .map(([key, candles]) => {
      candles.sort((a, b) => a.date.localeCompare(b.date));
      const first = candles[0];
      const last = candles[candles.length - 1];
      const high = Math.max(...candles.map(c => c.high));
      const low = Math.min(...candles.map(c => c.low));
      const volume = candles.reduce((sum, c) => sum + c.volume, 0);
      
      return {
        date: last.date, // 月底或該月最後交易日
        open: first.open,
        high,
        low,
        close: last.close,
        volume,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return { candles: monthlyCandles };
}

/**
 * 取得 ISO 週數
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function normalizeIntraday(raw: FugleIntradayResponse) {
  // Fugle API 回傳欄位為 `data`，但保留 `candles` 相容性
  const source = raw.data ?? raw.candles ?? [];
  const candles = source.map((c) => {
    // 從 ISO 8601 字串提取 HH:MM
    const timePart = c.date.includes('T')
      ? c.date.split('T')[1].substring(0, 5)
      : c.date;
    return {
      time: timePart,
      open: Number(c.open) || 0,
      high: Number(c.high) || 0,
      low: Number(c.low) || 0,
      close: Number(c.close) || 0,
      volume: Number(c.volume) || 0,
    };
  });
  return { candles };
}

function normalizeQuote(raw: FugleQuoteResponse) {
  return {
    price: Number(raw.closePrice ?? raw.lastPrice ?? 0) || 0,
    change: Number(raw.change ?? raw.lastChange ?? 0) || 0,
    changePercent: Number(raw.changePercent ?? raw.lastChangePercent ?? 0) || 0,
    name: raw.name ?? '',
  };
}

// ── GET Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') ?? '';
  const type = searchParams.get('type') ?? '';
  const from = searchParams.get('from') ?? undefined; // YYYY-MM-DD, optional
  const market = (searchParams.get('market') ?? 'TW').toUpperCase() as MarketPreset;

  if (!['TW', 'HK', 'US'].includes(market)) {
    return NextResponse.json({ error: 'invalid_market' }, { status: 400 });
  }

  const cleanTicker = ticker.trim().toUpperCase();
  const validTicker =
    market === 'TW'
      ? /^\d{4,6}[A-Z]?$/.test(cleanTicker)
      : market === 'HK'
        ? /^\d{5}$/.test(cleanTicker)
        : /^[A-Z0-9.\-]{1,10}$/.test(cleanTicker);

  // 1. 驗證 ticker 格式
  if (!validTicker) {
    return NextResponse.json(
      { error: 'invalid_ticker' },
      { status: 400 }
    );
  }

  // 2. 驗證 type 值
  if (!['daily', 'weekly', 'monthly', 'intraday', 'quote'].includes(type)) {
    return NextResponse.json(
      { error: 'invalid_type' },
      { status: 400 }
    );
  }

  try {
    const yahooDirect = market === 'HK' || market === 'US';
    if (yahooDirect) {
      if (type === 'intraday') {
        return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
      }
      const yahooController = new AbortController();
      const yahooTimeout = setTimeout(() => yahooController.abort(), 8_000);
      try {
        if (type === 'daily') {
          const yahooData = await fetchYahooDaily(cleanTicker, market, from, yahooController.signal);
          clearTimeout(yahooTimeout);
          if (yahooData?.candles && yahooData.candles.length > 0) {
            return NextResponse.json(normalizeDaily(yahooData), { status: 200 });
          }
        } else if (type === 'quote') {
          const yahooQuote = await fetchYahooQuote(cleanTicker, market, yahooController.signal);
          clearTimeout(yahooTimeout);
          if (yahooQuote) {
            return NextResponse.json(normalizeQuote(yahooQuote), { status: 200 });
          }
        }
      } catch {
        clearTimeout(yahooTimeout);
      }
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }

    // TW：先走 Fugle（§2-C 請求層 cache：inflight 去重 + 60s TTL + stale-on-error），失敗再 Yahoo fallback
    const apiKey = process.env.FUGLE_API_KEY ?? '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'api_key_not_configured' },
        { status: 503 }
      );
    }

    // 對於 weekly/monthly，我們需要先取得 daily 資料再重採樣（cache key 也照 fetchType 收斂）
    const fetchType = (type === 'weekly' || type === 'monthly') ? 'daily' : type;
    const cacheKey = buildFugleCacheKey('kline', [cleanTicker, fetchType, fetchType === 'daily' ? (from ?? '') : '']);

    // Fugle 上游嘗試（helper 內含 inflight 去重 + 60s TTL；redirect:'manual' + AbortSignal.timeout(4000)）
    const attemptFugle = async (): Promise<FugleAttempt<Record<string, unknown>>> => {
      const res = await fetch(getFugleUrl(cleanTicker, fetchType, from), {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FUGLE_UPSTREAM_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { kind: 'upstream-failure', status: res.status };
      }
      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        // JSON 解析失敗絕不寫 cache（不補零、不造假數字）
        return { kind: 'upstream-failure' };
      }
      // 形狀斷言：非物件一律失敗（不寫 cache）
      if (raw === null || typeof raw !== 'object') return { kind: 'upstream-failure' };
      const record = raw as Record<string, unknown>;
      if (fetchType === 'quote') {
        // quote 回應是單一物件（closePrice/lastPrice 等），非 data/candles 陣列
        return { kind: 'data', data: record };
      }
      // candles 型（daily/intraday）：`data` 或 `candles` 陣列必須存在（可為空陣列——
      // 合法「無資料」狀態，緩衝額度；僅缺欄位視為失敗，不補零）
      const hasArray = Array.isArray(record.data) || Array.isArray(record.candles);
      if (!hasArray) return { kind: 'upstream-failure' };
      return { kind: 'data', data: record };
    };

    const cachedRaw = await fetchFugleCached<Record<string, unknown>>(cacheKey, attemptFugle);

    // ── Fugle 命中（fresh / cache / stale 快照）：shape 對前端透明 ──
    if (cachedRaw.data !== null) {
      const rawData = cachedRaw.data;
      let normalized;
      if (type === 'daily') {
        normalized = normalizeDaily(rawData as unknown as FugleHistoricalResponse);
      } else if (type === 'weekly') {
        const dailyNormalized = normalizeDaily(rawData as unknown as FugleHistoricalResponse);
        normalized = resampleToWeekly(dailyNormalized.candles);
      } else if (type === 'monthly') {
        const dailyNormalized = normalizeDaily(rawData as unknown as FugleHistoricalResponse);
        normalized = resampleToMonthly(dailyNormalized.candles);
      } else if (type === 'intraday') {
        normalized = normalizeIntraday(rawData as unknown as FugleIntradayResponse);
      } else {
        normalized = normalizeQuote(rawData as unknown as FugleQuoteResponse);
      }
      // stale-on-error：上游掛了 → 回快取快照 + X-Skynet-Stale: true（純標記，body shape 不變）
      return NextResponse.json(normalized, {
        status: 200,
        headers: cachedRaw.source === 'fugle-stale' ? { 'X-Skynet-Stale': 'true' } : {},
      });
    }

    // ── Fugle 全掛無快取（fugle-miss）：200 + ok:false，不 5xx（futures 模式）──
    if (cachedRaw.source === 'fugle-miss') {
      // 429：額度用罄（100 req/hr + 5 req/min）→ 可操作錯誤，保留 rate_limit_exceeded 代碼
      if (cachedRaw.upstreamStatus === 429) {
        return NextResponse.json(
          { ok: false, error: 'rate_limit_exceeded' },
          { status: 200, headers: { 'X-Skynet-Data-Source': 'fugle-rate-limited' } }
        );
      }
      // intraday 401/403：需付費訂閱 → 保留 intraday_not_subscribed 代碼（可操作）
      if (type === 'intraday' && (cachedRaw.upstreamStatus === 401 || cachedRaw.upstreamStatus === 403)) {
        return NextResponse.json(
          { ok: false, error: 'intraday_not_subscribed' },
          { status: 200, headers: { 'X-Skynet-Data-Source': 'fugle-not-subscribed' } }
        );
      }
      // 逾時且無快照：保留 upstream_timeout 代碼（ok:false，不 5xx）
      if (cachedRaw.upstreamTimeout) {
        return NextResponse.json(
          { ok: false, error: 'upstream_timeout' },
          { status: 200, headers: { 'X-Skynet-Data-Source': 'fugle-timeout' } }
        );
      }

      // Yahoo tertiary（daily/weekly/monthly/quote；intraday 無 Yahoo 路徑）
      const yahooController = new AbortController();
      const yahooTimeout = setTimeout(() => yahooController.abort(), 8_000);
      try {
        if (type === 'daily' || type === 'weekly' || type === 'monthly') {
          const yahooData = await fetchYahooDaily(cleanTicker, market, from, yahooController.signal);
          clearTimeout(yahooTimeout);
          if (yahooData?.candles && yahooData.candles.length > 0) {
            const dailyNormalized = normalizeDaily(yahooData);
            if (type === 'weekly') {
              return NextResponse.json(resampleToWeekly(dailyNormalized.candles), { status: 200 });
            }
            if (type === 'monthly') {
              return NextResponse.json(resampleToMonthly(dailyNormalized.candles), { status: 200 });
            }
            return NextResponse.json(dailyNormalized, { status: 200 });
          }
        } else if (type === 'quote') {
          const yahooQuote = await fetchYahooQuote(cleanTicker, market, yahooController.signal);
          clearTimeout(yahooTimeout);
          if (yahooQuote) {
            return NextResponse.json(normalizeQuote(yahooQuote), { status: 200 });
          }
        }
      } catch {
        clearTimeout(yahooTimeout);
      }
      // Fugle + Yahoo 全掛無快取：200 + ok:false（前端 allSettled 顯示 '--'，不 5xx 帶崩頁面）
      return NextResponse.json(
        { ok: false, error: 'upstream_error' },
        { status: 200, headers: { 'X-Skynet-Data-Source': 'yahoo-fallback-missed' } }
      );
    }

    // 理論上不會走到（miss 已在上面處理）
    return NextResponse.json({ ok: false, error: 'upstream_error' }, { status: 200 });

  } catch (err) {
    // 未預期錯誤兜底（yahoo 路徑的 abort 等）
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { ok: false, error: 'upstream_timeout' },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { ok: false, error: 'upstream_error' },
      { status: 200 }
    );
  }
}
