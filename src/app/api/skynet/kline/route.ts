/**
 * 天網 K 線圖查看器 — Fugle MarketData API 代理路由
 *
 * GET /api/skynet/kline?ticker={ticker}&type={daily|intraday|quote}
 *
 * 職責：
 * - 保護 FUGLE_API_KEY 不暴露於前端
 * - 驗證輸入參數
 * - 代理 Fugle API 請求並標準化回應格式
 * - ETF 備援：Fugle 不支援時自動 fallback 到 Yahoo Finance
 * - 統一錯誤處理
 */


import { NextRequest, NextResponse } from 'next/server';

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
  if (!['daily', 'intraday', 'quote'].includes(type)) {
    return NextResponse.json(
      { error: 'invalid_type' },
      { status: 400 }
    );
  }

  // 3. 建立 AbortController（10 秒 timeout）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

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

    // TW：先走 Fugle，失敗再 Yahoo fallback
    const apiKey = process.env.FUGLE_API_KEY ?? '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'api_key_not_configured' },
        { status: 503 }
      );
    }

    const url = getFugleUrl(cleanTicker, type, from);

    const fugleRes = await fetch(url, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!fugleRes.ok) {
      if (fugleRes.status === 429) {
        return NextResponse.json(
          { error: 'rate_limit_exceeded' },
          { status: 429 }
        );
      }
      if (type === 'intraday') {
        return NextResponse.json(
          { error: 'upstream_error' },
          { status: fugleRes.status }
        );
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
      return NextResponse.json(
        { error: 'upstream_error' },
        { status: fugleRes.status }
      );
    }

    const rawData = await fugleRes.json();
    const normalized = type === 'daily'
      ? normalizeDaily(rawData as FugleHistoricalResponse)
      : type === 'intraday'
        ? normalizeIntraday(rawData as FugleIntradayResponse)
        : normalizeQuote(rawData as FugleQuoteResponse);

    return NextResponse.json(normalized, { status: 200 });

  } catch (err) {
    clearTimeout(timeoutId);

    // AbortController 觸發（超時）
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'upstream_timeout' },
        { status: 504 }
      );
    }

    // 其他網路錯誤
    return NextResponse.json(
      { error: 'upstream_error' },
      { status: 502 }
    );
  }
}
