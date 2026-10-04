
import { NextRequest, NextResponse } from 'next/server';
import {
  buildEmbeddedLiaoCandidates,
  buildExtremeResponse,
  buildFusionStocks,
} from '@/lib/fusionCore';
import type { BattleReport, ExtremeResponse, FusionStock, LiaoCandidate, Position, Sniper } from '@/lib/fusionCore';
import {
  FUGLE_UPSTREAM_TIMEOUT_MS,
  buildFugleCacheKey,
  fetchFugleCached,
  type FugleAttempt,
} from '@/lib/fugleCache';

/**
 * 上游 base URL（2026-10-04 調整）。
 * 原本 fallback 到 `https://skynet-cmd.duckdns.org`（n8n），該服務已於 2026-10-03 退役、
 * 連線必定失敗。現改為「未設定即視為未配置」，直接走既有 fallback，不再打已退役的主機、
 * 也不再為此空等 N8N_FETCH_TIMEOUT_MS（75 秒）。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const DASHBOARD_WEBHOOK = `${N8N_BASE}/webhook/skynet-dashboard`;
const FUSION_STORE_PREFIX = process.env.SKYNET_FUSION_STORE_PREFIX || 'skynet:fusion';
const OBSERVATION_INTERVAL_MS = 10 * 60 * 1000;
const N8N_FETCH_TIMEOUT_MS = Number(process.env.SKYNET_N8N_FETCH_TIMEOUT_MS || 75_000);
const KV_ACCOUNT_ID = process.env.SKYNET_KV_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const KV_NAMESPACE_ID = process.env.SKYNET_KV_NAMESPACE_ID || '';
const KV_API_TOKEN = process.env.SKYNET_KV_API_TOKEN || '';

type SourceHealth = {
  id: string;
  label: string;
  status: 'online' | 'degraded' | 'offline';
  rows: number;
  latencyMs: number;
};

type FusionPayload = {
  date: string;
  generatedAt: string;
  core: {
    status: 'ok' | 'degraded';
    mode: string;
    novacoreRequired: false;
    healthScore: number;
    cache: {
      mode: 'live' | 'stale-replay';
      restoredFromCache: boolean;
      ageSeconds: number;
    };
    sourceHealth: SourceHealth[];
    n8n: {
      battle_reports: boolean;
      positions: false;
      snipers: boolean;
    };
    database?: {
      status: 'online' | 'degraded';
      path: string;
    };
    warnings: string[];
  };
  reports: BattleReport[];
  positions: Position[]; // 降級保留相容欄位；永遠不作候選來源。
  snipers: Sniper[];
  liaoCandidates: LiaoCandidate[];
  fusionStocks: FusionStock[];
  extreme: ExtremeResponse;
  quote: MarketQuote | null;
  intradaySeries?: IntradaySeriesPoint[];
};

type MarketQuote = {
  ticker: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  source: 'fugle' | 'yahoo';
  fetchedAt: string;
};

type HistoricalCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CandidateState = {
  ticker: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeenDate: string;
  lastMissingAt?: string;
  seenCount: number;
  observationCount: number;
  streakDays: number;
  missedCount: number;
  lastFusionScore: number;
  lastRank: number;
};

type CandidateStateStore = Record<string, CandidateState>;

type IntradaySeriesPoint = {
  generatedAt: string;
  ticker: string;
  rank: number | null;
  fusionScore: number | null;
  phaseLabel: string | null;
  dataQuality: number | null;
  ma21Diff: number | null;
  volumeRatio: number | null;
  changePercent: number | null;
  chiefNet: number | null;
};

type IntradayTrend = {
  observations: number;
  scoreSlope: number;
  rankSlope: number;
  ma21Slope: number;
  volumeSlope: number;
  latestScore: number | null;
  latestRank: number | null;
};

let memoryCachedPayload: FusionPayload | null = null;
let memoryCandidateState: CandidateStateStore = {};
const memoryIntradaySeries: Record<string, IntradaySeriesPoint[]> = {};

type YahooChartResponse = {
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
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

type FugleCandlesResponse = {
  data?: HistoricalCandle[];
  candles?: HistoricalCandle[];
  sort?: 'asc' | 'desc';
};

async function fetchN8nType<T>(type: string, fallback: T): Promise<{ data: T; ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();

  function hasSemanticData(data: unknown): boolean {
    if (type !== 'positions') return true;
    const positions = (data as { positions?: unknown[] })?.positions;
    return Array.isArray(positions) && positions.length > 0;
  }

  async function attempt(): Promise<{ data: T; ok: boolean; error?: string }> {
    // 上游未配置（n8n 已退役）→ 直接回 fallback，不做無謂的連線與重試。
    if (!N8N_CONFIGURED) {
      return { data: fallback, ok: false, error: `n8n_${type}_not_configured` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${DASHBOARD_WEBHOOK}?type=${encodeURIComponent(type)}&_ts=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        return { data: fallback, ok: false, error: `n8n_${type}_${response.status}` };
      }

      const data = await response.json() as T;
      if (!hasSemanticData(data)) {
        return { data: fallback, ok: false, error: `n8n_${type}_empty_semantic` };
      }
      return { data, ok: true };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let result = await attempt();
    for (let i = 0; !result.ok && i < 2 && result.error === `n8n_${type}_empty_semantic`; i += 1) {
      result = await attempt();
    }
    return { ...result, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const firstError = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: fallback,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: `n8n_${type}_timeout`,
      };
    }
    try {
      let result = await attempt();
      for (let i = 0; !result.ok && i < 2 && result.error === `n8n_${type}_empty_semantic`; i += 1) {
        result = await attempt();
      }
      return {
        ...result,
        latencyMs: Date.now() - startedAt,
        error: result.ok ? `n8n_${type}_retry_after_${firstError}` : result.error,
      };
    } catch (retryError) {
      return {
        data: fallback,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: retryError instanceof Error ? retryError.message : String(retryError),
      };
    }
  }
}

function cleanTicker(value: string | null): string | null {
  const ticker = String(value || '').trim();
  if (/^\d{4,6}[A-Za-z]?$/.test(ticker)) return ticker;
  return null;
}

function isDecisionAction(value: unknown): value is 'BUY' | 'WAIT' | 'SELL' {
  return value === 'BUY' || value === 'WAIT' || value === 'SELL';
}

function isTradableTicker(value: unknown): boolean {
  return cleanTicker(String(value || '')) !== null;
}

function normalizeBattleReports(rows: BattleReport[]): { tradableReports: BattleReport[]; nonTradableCount: number } {
  const tradableReports = rows.filter((report) => isTradableTicker(report.ticker) && isDecisionAction(report.action));
  return {
    tradableReports,
    nonTradableCount: Math.max(0, rows.length - tradableReports.length),
  };
}

function normalizeSnipers(rows: Sniper[]): Sniper[] {
  return rows.filter((sniper) => isTradableTicker(sniper.ticker));
}

function pickFocusTickerFromSignals(reports: BattleReport[], snipers: Sniper[]): string | null {
  const buyReport = reports
    .filter((report) => report.action === 'BUY')
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0];
  const reportTicker = cleanTicker(buyReport?.ticker || null);
  if (reportTicker) return reportTicker;

  const sniperTicker = cleanTicker(snipers.find((sniper) => String(sniper.status || '').includes('待'))?.ticker || null);
  if (sniperTicker) return sniperTicker;

  return cleanTicker(reports[0]?.ticker || null);
}

function toYahooSymbol(ticker: string): string {
  if (/[A-Za-z]$/.test(ticker)) return `${ticker}.TWO`;
  return `${ticker}.TW`;
}

function normalizeFinite(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchMarketQuote(ticker: string): Promise<{ quote: MarketQuote | null; ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  const apiKey = process.env.FUGLE_API_KEY || '';

  if (apiKey) {
    // §2-C Fugle 請求層 cache：inflight 去重 + 60s TTL + stale-on-error（redirect:'manual' + AbortSignal.timeout(4000)）
    const cached = await fetchFugleCached<Record<string, unknown>>(buildFugleCacheKey('fusion', ['quote', ticker]), async (): Promise<FugleAttempt<Record<string, unknown>>> => {
      const signal = AbortSignal.timeout(FUGLE_UPSTREAM_TIMEOUT_MS);
      try {
        const response = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${ticker}`, {
          headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
          signal,
          redirect: 'manual',
        });
        if (!response.ok) return { kind: 'upstream-failure', status: response.status };
        const raw = (await response.json()) as Record<string, unknown>;
        // 形狀斷言：無有效價格 → 失敗（不寫 cache、不補零）
        const price = normalizeFinite(raw.closePrice ?? raw.lastPrice);
        if (price === null) return { kind: 'upstream-failure' };
        return { kind: 'data', data: raw };
      } catch {
        // 逾時 / 網路錯誤 / JSON 解析失敗：一律失敗（不寫 cache）；signal.aborted 判定逾時
        return { kind: 'upstream-failure', timeout: signal.aborted };
      }
    });

    if (cached.data !== null) {
      const raw = cached.data;
      const price = normalizeFinite(raw.closePrice ?? raw.lastPrice);
      const previousClose = normalizeFinite(raw.previousClose);
      const change = normalizeFinite(raw.change ?? raw.lastChange);
      const changePercent = normalizeFinite(raw.changePercent ?? raw.lastChangePercent);
      if (price !== null) {
        return {
          ok: true,
          latencyMs: Date.now() - startedAt,
          quote: {
            ticker,
            name: raw.name as string | undefined,
            price,
            change: change ?? (previousClose !== null ? price - previousClose : 0),
            changePercent: changePercent ?? (previousClose ? ((price - previousClose) / previousClose) * 100 : 0),
            source: 'fugle',
            fetchedAt: cached.fetchedAt ?? new Date().toISOString(),
          },
        };
      }
    }
  }

  const yahooController = new AbortController();
  const yahooTimer = setTimeout(() => yahooController.abort(), 5_000);
  try {
    const symbol = toYahooSymbol(ticker);
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { Accept: 'application/json' }, signal: yahooController.signal }
    );
    clearTimeout(yahooTimer);
    if (!response.ok) {
      return { quote: null, ok: false, latencyMs: Date.now() - startedAt, error: `quote_yahoo_${response.status}` };
    }
    const raw = await response.json() as YahooChartResponse;
    const meta = raw.chart?.result?.[0]?.meta;
    const price = normalizeFinite(meta?.regularMarketPrice);
    const previousClose = normalizeFinite(meta?.previousClose ?? meta?.chartPreviousClose);
    if (price === null) {
      return { quote: null, ok: false, latencyMs: Date.now() - startedAt, error: 'quote_yahoo_missing_price' };
    }
    const change = previousClose !== null ? price - previousClose : 0;
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      quote: {
        ticker,
        name: meta?.shortName,
        price,
        change,
        changePercent: previousClose ? (change / previousClose) * 100 : 0,
        source: 'yahoo',
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    clearTimeout(yahooTimer);
    return {
      quote: null,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeHistoricalCandles(raw: FugleCandlesResponse): HistoricalCandle[] {
  const source = raw.data ?? raw.candles ?? [];
  const sorted = raw.sort === 'desc' ? [...source].reverse() : source;
  return sorted
    .map((item) => ({
      date: String(item.date || ''),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume || 0),
    }))
    .filter((item) =>
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      [item.open, item.high, item.low, item.close, item.volume].every(Number.isFinite)
    );
}

async function fetchHistoricalKlines(ticker: string): Promise<{ candles: HistoricalCandle[]; ok: boolean; source?: 'fugle' | 'yahoo'; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  const apiKey = process.env.FUGLE_API_KEY || '';

  if (apiKey) {
    // §2-C Fugle 請求層 cache：inflight 去重 + 60s TTL + stale-on-error（redirect:'manual' + AbortSignal.timeout(4000)）
    const cached = await fetchFugleCached<Record<string, unknown>>(buildFugleCacheKey('fusion', ['kline', ticker]), async (): Promise<FugleAttempt<Record<string, unknown>>> => {
      const signal = AbortSignal.timeout(FUGLE_UPSTREAM_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://api.fugle.tw/marketdata/v1.0/stock/historical/candles/${ticker}?timeframe=D`,
          { headers: { Accept: 'application/json', 'X-API-KEY': apiKey }, signal, redirect: 'manual' }
        );
        if (!response.ok) return { kind: 'upstream-failure', status: response.status };
        const raw = (await response.json()) as Record<string, unknown>;
        // 形狀斷言：`data` / `candles` 必須是陣列（可為空——合法「無資料」，緩衝額度；缺失視同失敗）
        const array = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.candles) ? raw.candles : null;
        if (array === null) return { kind: 'upstream-failure' };
        return { kind: 'data', data: raw };
      } catch {
        // 逾時 / 網路錯誤 / JSON 解析失敗：一律失敗（不寫 cache）；signal.aborted 判定逾時
        return { kind: 'upstream-failure', timeout: signal.aborted };
      }
    });

    if (cached.data !== null) {
      const candles = normalizeHistoricalCandles({
        data: cached.data.data as HistoricalCandle[] | undefined,
        candles: cached.data.candles as HistoricalCandle[] | undefined,
        sort: cached.data.sort as 'asc' | 'desc' | undefined,
      });
      if (candles.length >= 21) {
        return { candles, ok: true, source: 'fugle', latencyMs: Date.now() - startedAt };
      }
      // < 21 根：與現況一致落 Yahoo 回退（快照已寫 cache，Yahoo 回退成功不污染 Fugle 快照）
    }
  }

  const yahooController = new AbortController();
  const yahooTimer = setTimeout(() => yahooController.abort(), 8_000);
  try {
    const symbol = toYahooSymbol(ticker);
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 210 * 24 * 60 * 60;
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${startTs}&period2=${endTs}&events=history`,
      { headers: { Accept: 'application/json' }, signal: yahooController.signal }
    );
    clearTimeout(yahooTimer);
    if (!response.ok) {
      return { candles: [], ok: false, latencyMs: Date.now() - startedAt, error: `kline_yahoo_${response.status}` };
    }
    const raw = await response.json() as YahooChartResponse;
    const result = raw.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) {
      return { candles: [], ok: false, latencyMs: Date.now() - startedAt, error: 'kline_yahoo_missing_data' };
    }
    const candles = timestamps
      .map((timestamp, index) => {
        const open = quote.open?.[index];
        const high = quote.high?.[index];
        const low = quote.low?.[index];
        const close = quote.close?.[index];
        const volume = quote.volume?.[index] ?? 0;
        if (open == null || high == null || low == null || close == null) return null;
        return {
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((item): item is HistoricalCandle => item !== null);
    if (candles.length < 21) {
      return { candles: [], ok: false, latencyMs: Date.now() - startedAt, error: 'kline_yahoo_too_short' };
    }
    return { candles, ok: true, source: 'yahoo', latencyMs: Date.now() - startedAt };
  } catch (error) {
    clearTimeout(yahooTimer);
    return {
      candles: [],
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildRealLiaoCandidate(ticker: string, name: string, candles: HistoricalCandle[], strategy: string): LiaoCandidate | null {
  const last = candles.at(-1);
  const prev = candles.at(-2) ?? last;
  if (!last || !prev || candles.length < 21) return null;

  const maWindow = candles.slice(-21);
  const ma21 = maWindow.reduce((sum, item) => sum + item.close, 0) / maWindow.length;
  const diff = ((last.close - ma21) / ma21) * 100;
  let points = diff > 2 ? 18 : diff > 0 ? 11 : 0;
  if (strategy === 'sell_black_tail' || strategy === 'breakdown') {
    points = points === 18 ? 21 : points === 11 ? 10 : 3;
  }
  const changePct = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const volumeRatio = prev.volume ? last.volume / prev.volume : 1;
  const chiefNet = ((last.close - last.open) / (last.high - last.low + 0.001)) * last.volume * 0.4;
  const amount = (last.close * last.volume) / 100000000;
  const rankScore = points * 10 + Math.max(-20, Math.min(20, diff * 2)) + changePct * 3 + Math.min(18, volumeRatio * 4);

  return {
    symbol: ticker,
    name,
    points,
    price: Number(last.close.toFixed(2)),
    open: Number(last.open.toFixed(2)),
    diff: Number(diff.toFixed(2)),
    change_pct: Number(changePct.toFixed(2)),
    volume: Math.round(last.volume),
    prev_volume: Math.round(prev.volume),
    volume_ratio: Number(volumeRatio.toFixed(2)),
    amount: Number(amount.toFixed(2)),
    stop_loss: Number((last.close * (strategy === 'sell_black_tail' || strategy === 'breakdown' ? 1.02 : 0.98)).toFixed(2)),
    chief_net: Math.round(chiefNet),
    rank_score: Number(rankScore.toFixed(2)),
  };
}

function buildRealExtremeResponse(ticker: string, name: string, candles: HistoricalCandle[]): ExtremeResponse | null {
  const last = candles.at(-1);
  if (!last) return null;
  const items = [30, 60, 120].map((window) => {
    const windowRows = candles.slice(-window);
    const maxVolume = windowRows.reduce((best, item) => item.volume > best.volume ? item : best, windowRows[0]);
    const changePct = ((last.close - maxVolume.close) / maxVolume.close) * 100;
    return {
      window,
      date: maxVolume.date,
      price: Number(maxVolume.close.toFixed(2)),
      volume: Math.round(maxVolume.volume),
      change_pct: Number(changePct.toFixed(2)),
      kind: maxVolume.close >= maxVolume.open ? 'red' as const : 'black' as const,
    };
  });
  return {
    symbol: ticker,
    name,
    latest_date: last.date,
    latest_price: Number(last.close.toFixed(2)),
    items,
  };
}

function canRunReplayTest(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return (
    process.env.SKYNET_FUSION_REPLAY_TEST === '1' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:')
  );
}

function kvEnabled(): boolean {
  return Boolean(KV_ACCOUNT_ID && KV_NAMESPACE_ID && KV_API_TOKEN);
}

function kvKey(key: string): string {
  return `${FUSION_STORE_PREFIX}:${key}`;
}

function cacheRequest(key: string): Request {
  return new Request(`https://skynet.local/${encodeURIComponent(kvKey(key))}`);
}

function edgeCache(): Cache | null {
  const maybeGlobal = globalThis as typeof globalThis & {
    caches?: CacheStorage & { default?: Cache };
  };
  return maybeGlobal.caches?.default ?? null;
}

async function readKvJson<T>(key: string): Promise<T | null> {
  if (!kvEnabled()) return null;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(KV_ACCOUNT_ID)}/storage/kv/namespaces/${encodeURIComponent(KV_NAMESPACE_ID)}/values/${encodeURIComponent(kvKey(key))}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${KV_API_TOKEN}`,
      },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`kv_read_${response.status}`);
  return await response.json() as T;
}

async function writeKvJson(key: string, value: unknown): Promise<void> {
  if (!kvEnabled()) return;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(KV_ACCOUNT_ID)}/storage/kv/namespaces/${encodeURIComponent(KV_NAMESPACE_ID)}/values/${encodeURIComponent(kvKey(key))}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KV_API_TOKEN}`,
      },
      body: JSON.stringify(value),
    }
  );
  if (!response.ok) throw new Error(`kv_write_${response.status}`);
}

async function readCacheJson<T>(key: string): Promise<T | null> {
  const cache = edgeCache();
  if (!cache) return null;
  const response = await cache.match(cacheRequest(key));
  if (!response?.ok) return null;
  return await response.json() as T;
}

async function writeCacheJson(key: string, value: unknown): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  await cache.put(
    cacheRequest(key),
    new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  );
}

async function readCachedPayload(): Promise<FusionPayload | null> {
  try {
    const fromKv = await readKvJson<FusionPayload>('latest');
    if (fromKv?.generatedAt) {
      memoryCachedPayload = fromKv;
      return fromKv;
    }
  } catch {
    // Fall through to the in-memory cache; health warnings are emitted during persistence.
  }
  try {
    const fromCache = await readCacheJson<FusionPayload>('latest');
    if (fromCache?.generatedAt) {
      memoryCachedPayload = fromCache;
      return fromCache;
    }
  } catch {}
  return memoryCachedPayload;
}

async function writeCachedPayload(payload: FusionPayload): Promise<void> {
  memoryCachedPayload = payload;
  if (payload.reports.length > 0 || payload.positions.length > 0 || payload.fusionStocks.length > 0) {
    try {
      await writeCacheJson('latest', payload);
    } catch {}
  }
  try {
    await writeKvJson('latest', payload);
  } catch {}
}

async function readCandidateState(): Promise<CandidateStateStore> {
  try {
    const fromKv = await readKvJson<CandidateStateStore>('candidate-state');
    if (fromKv && typeof fromKv === 'object') {
      memoryCandidateState = fromKv;
      return fromKv;
    }
  } catch {}
  return memoryCandidateState;
}

async function writeCandidateState(state: CandidateStateStore): Promise<void> {
  memoryCandidateState = state;
  try {
    await writeKvJson('candidate-state', state);
  } catch {}
}

function intradayKey(tradingDate: string): string {
  return `intraday:${tradingDate}`;
}

function buildIntradayPointsFromPayload(payload: FusionPayload): IntradaySeriesPoint[] {
  return payload.fusionStocks.map((stock) => ({
    generatedAt: payload.generatedAt,
    ticker: stock.ticker,
    rank: stock.tracking?.rank ?? null,
    fusionScore: stock.fusionScore ?? null,
    phaseLabel: stock.tracking?.phaseLabel ?? null,
    dataQuality: stock.dataQuality ?? null,
    ma21Diff: stock.liaoDiff ?? null,
    volumeRatio: stock.volumeRatio ?? null,
    changePercent: stock.changePct ?? null,
    chiefNet: stock.chiefNet ?? null,
  }));
}

function sqlString(value: unknown): string {
  if (value === undefined || value === null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? String(num) : 'NULL';
}

async function runSqlite(sql: string): Promise<void> {
  void sql;
  throw new Error('sqlite_unavailable_in_edge_runtime');
}

async function persistFusionPayload(payload: FusionPayload): Promise<{ ok: boolean; error?: string }> {
  const points = buildIntradayPointsFromPayload(payload);
  const key = intradayKey(payload.date);
  try {
    const previous = await readKvJson<IntradaySeriesPoint[]>(key).catch(() => null);
    const previousCached = previous || await readCacheJson<IntradaySeriesPoint[]>(key).catch(() => null);
    const merged = [...(previousCached || memoryIntradaySeries[payload.date] || []), ...points]
      .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
      .slice(-1200);
    memoryIntradaySeries[payload.date] = merged;
    await Promise.all([
      writeCacheJson(key, merged),
      writeCacheJson(`snapshot:${payload.date}:${payload.generatedAt}`, payload),
      writeCacheJson('latest', payload),
      writeKvJson(key, merged),
      writeKvJson(`snapshot:${payload.date}:${payload.generatedAt}`, payload),
      writeKvJson('latest', payload),
    ]);
    return { ok: true };
  } catch (error) {
    if (kvEnabled()) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    memoryIntradaySeries[payload.date] = [
      ...(memoryIntradaySeries[payload.date] || []),
      ...points,
    ].slice(-1200);
    return { ok: true };
  }
}

async function _persistFusionPayloadSqliteDisabled(payload: FusionPayload): Promise<{ ok: boolean; error?: string }> {
  const schema = `
CREATE TABLE IF NOT EXISTS fusion_snapshots (
  generated_at TEXT PRIMARY KEY,
  trading_date TEXT,
  health_score INTEGER,
  cache_mode TEXT,
  fusion_count INTEGER,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS fusion_candidates (
  generated_at TEXT,
  ticker TEXT,
  name TEXT,
  rank INTEGER,
  fusion_score REAL,
  data_quality INTEGER,
  phase TEXT,
  phase_label TEXT,
  score_delta REAL,
  rank_delta INTEGER,
  source_json TEXT,
  raw_json TEXT,
  PRIMARY KEY (generated_at, ticker)
);
CREATE TABLE IF NOT EXISTS source_health (
  generated_at TEXT,
  source_id TEXT,
  label TEXT,
  status TEXT,
  rows_count INTEGER,
  latency_ms INTEGER,
  PRIMARY KEY (generated_at, source_id)
);
CREATE TABLE IF NOT EXISTS market_quotes (
  generated_at TEXT PRIMARY KEY,
  ticker TEXT,
  price REAL,
  change_value REAL,
  change_percent REAL,
  source TEXT,
  fetched_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS kline_metrics (
  generated_at TEXT,
  ticker TEXT,
  points INTEGER,
  ma21_diff REAL,
  volume_ratio REAL,
  change_percent REAL,
  chief_net REAL,
  stop_loss REAL,
  PRIMARY KEY (generated_at, ticker)
);
`;

  const candidateSql = payload.fusionStocks.map((stock) => `
INSERT OR REPLACE INTO fusion_candidates VALUES (
  ${sqlString(payload.generatedAt)},
  ${sqlString(stock.ticker)},
  ${sqlString(stock.name)},
  ${sqlNumber(stock.tracking?.rank)},
  ${sqlNumber(stock.fusionScore)},
  ${sqlNumber(stock.dataQuality)},
  ${sqlString(stock.tracking?.phase)},
  ${sqlString(stock.tracking?.phaseLabel)},
  ${sqlNumber(stock.tracking?.scoreDelta)},
  ${sqlNumber(stock.tracking?.rankDelta)},
  ${sqlString(JSON.stringify(stock.source))},
  ${sqlString(JSON.stringify(stock))}
);`).join('\n');

  const sourceSql = payload.core.sourceHealth.map((source) => `
INSERT OR REPLACE INTO source_health VALUES (
  ${sqlString(payload.generatedAt)},
  ${sqlString(source.id)},
  ${sqlString(source.label)},
  ${sqlString(source.status)},
  ${sqlNumber(source.rows)},
  ${sqlNumber(source.latencyMs)}
);`).join('\n');

  const quoteSql = payload.quote ? `
INSERT OR REPLACE INTO market_quotes VALUES (
  ${sqlString(payload.generatedAt)},
  ${sqlString(payload.quote.ticker)},
  ${sqlNumber(payload.quote.price)},
  ${sqlNumber(payload.quote.change)},
  ${sqlNumber(payload.quote.changePercent)},
  ${sqlString(payload.quote.source)},
  ${sqlString(payload.quote.fetchedAt)},
  ${sqlString(JSON.stringify(payload.quote))}
);` : '';

  const klineSql = payload.fusionStocks
    .filter((stock) => stock.liaoPoints !== undefined || stock.liaoDiff !== undefined)
    .map((stock) => `
INSERT OR REPLACE INTO kline_metrics VALUES (
  ${sqlString(payload.generatedAt)},
  ${sqlString(stock.ticker)},
  ${sqlNumber(stock.liaoPoints)},
  ${sqlNumber(stock.liaoDiff)},
  ${sqlNumber(stock.volumeRatio)},
  ${sqlNumber(stock.changePct)},
  ${sqlNumber(stock.chiefNet)},
  ${sqlNumber(stock.stopLoss)}
);`).join('\n');

  const sql = `
PRAGMA busy_timeout=5000;
PRAGMA journal_mode=WAL;
${schema}
BEGIN;
INSERT OR REPLACE INTO fusion_snapshots VALUES (
  ${sqlString(payload.generatedAt)},
  ${sqlString(payload.date)},
  ${sqlNumber(payload.core.healthScore)},
  ${sqlString(payload.core.cache.mode)},
  ${sqlNumber(payload.fusionStocks.length)},
  ${sqlString(JSON.stringify(payload))}
);
${candidateSql}
${sourceSql}
${quoteSql}
${klineSql}
COMMIT;
`;

  try {
    await runSqlite(sql);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function readIntradaySeries(tickers: string[], tradingDate: string): Promise<IntradaySeriesPoint[]> {
  const uniqueTickers = Array.from(new Set(tickers.filter(Boolean))).slice(0, 40);
  if (uniqueTickers.length === 0) return [];
  const allowed = new Set(uniqueTickers);
  try {
    const fromKv = await readKvJson<IntradaySeriesPoint[]>(intradayKey(tradingDate));
    const rows = fromKv || memoryIntradaySeries[tradingDate] || [];
    return rows
      .filter((point) => allowed.has(point.ticker))
      .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.generatedAt.localeCompare(b.generatedAt));
  } catch {
    return (memoryIntradaySeries[tradingDate] || [])
      .filter((point) => allowed.has(point.ticker))
      .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.generatedAt.localeCompare(b.generatedAt));
  }
}

function slopeOf(points: Array<number | null>, lowerRankIsBetter = false): number {
  const clean = points.filter((point): point is number => Number.isFinite(point));
  if (clean.length < 2) return 0;
  const delta = clean[clean.length - 1] - clean[0];
  return Number((lowerRankIsBetter ? -delta : delta).toFixed(2));
}

function buildIntradayTrend(series: IntradaySeriesPoint[]): IntradayTrend {
  const latest = series[series.length - 1];
  return {
    observations: series.length,
    scoreSlope: slopeOf(series.map((point) => point.fusionScore)),
    rankSlope: slopeOf(series.map((point) => point.rank), true),
    ma21Slope: slopeOf(series.map((point) => point.ma21Diff)),
    volumeSlope: slopeOf(series.map((point) => point.volumeRatio)),
    latestScore: latest?.fusionScore ?? null,
    latestRank: latest?.rank ?? null,
  };
}

function attachIntradayTrends(stocks: FusionStock[], series: IntradaySeriesPoint[]): FusionStock[] {
  const seriesByTicker = new Map<string, IntradaySeriesPoint[]>();
  for (const point of series) {
    const group = seriesByTicker.get(point.ticker) || [];
    group.push(point);
    seriesByTicker.set(point.ticker, group);
  }

  for (const stock of stocks) {
    const tickerSeries = seriesByTicker.get(stock.ticker) || [];
    if (tickerSeries.length === 0) continue;
    stock.intradayTrend = buildIntradayTrend(tickerSeries);
  }
  return stocks;
}

function cacheAgeSeconds(payload: FusionPayload | null): number {
  if (!payload?.generatedAt) return 0;
  const generatedAt = Date.parse(payload.generatedAt);
  if (!Number.isFinite(generatedAt)) return 0;
  return Math.max(0, Math.round((Date.now() - generatedAt) / 1000));
}

function buildCachedReplayPayload(payload: FusionPayload, reason: string): FusionPayload {
  const { tradableReports } = normalizeBattleReports(payload.reports || []);
  const fusionStocks = (payload.fusionStocks || []).filter((stock) =>
    isTradableTicker(stock.ticker) &&
    !stock.source.some((source) => /交易紀錄|持倉|持股|自選|watchlist|position/i.test(source))
  );
  const hasUsableCandidates = tradableReports.length > 0 || fusionStocks.length > 0;
  const staleWarnings = (payload.core.warnings || []).filter((warning) =>
    !/position|持倉|持股|自選|watchlist|fusion_no_non_etf_position_focus/i.test(warning)
  );
  const sourceHealth: SourceHealth[] = [
    {
      id: 'fusion_cache_replay',
      label: 'Fusion 快照回放',
      status: hasUsableCandidates ? 'online' : 'degraded',
      rows: fusionStocks.length,
      latencyMs: 0,
    },
    ...(payload.core.sourceHealth || []).filter((source) => source.id !== 'n8n_positions'),
  ];

  return {
    ...payload,
    reports: tradableReports,
    positions: [],
    fusionStocks,
    core: {
      ...payload.core,
      status: hasUsableCandidates ? 'ok' : 'degraded',
      healthScore: hasUsableCandidates ? Math.max(payload.core.healthScore || 0, 72) : Math.min(payload.core.healthScore || 0, 65),
      cache: {
        mode: 'stale-replay',
        restoredFromCache: true,
        ageSeconds: cacheAgeSeconds(payload),
      },
      sourceHealth,
      n8n: {
        ...payload.core.n8n,
        positions: false,
      },
      warnings: hasUsableCandidates ? [reason] : Array.from(new Set([...staleWarnings, reason])),
    },
  };
}

function daysBetweenDates(previousDate: string, currentDate: string): number {
  const prev = Date.parse(`${previousDate}T00:00:00Z`);
  const curr = Date.parse(`${currentDate}T00:00:00Z`);
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return 999;
  return Math.round((curr - prev) / 86400000);
}

function classifyCandidatePhase(
  previous: CandidateState | undefined,
  streakDays: number,
  scoreDelta: number,
  fusionScore: number,
  rankDelta: number
): { phase: NonNullable<FusionStock['tracking']>['phase']; phaseLabel: string } {
  if (!previous) return { phase: 'new', phaseLabel: '新進雷達' };
  if (scoreDelta >= 4 || rankDelta >= 3) return { phase: 'warming', phaseLabel: '升溫' };
  if (scoreDelta <= -6) return { phase: 'fading', phaseLabel: '轉弱' };
  if (scoreDelta < 0 || rankDelta <= -3) return { phase: 'cooling', phaseLabel: '降溫' };
  if (streakDays >= 2 && fusionScore >= 45) return { phase: 'persistent', phaseLabel: '續強追蹤' };
  return { phase: 'persistent', phaseLabel: '穩定觀察' };
}

async function applyCandidateTracking(stocks: FusionStock[], generatedAt: string): Promise<FusionStock[]> {
  const today = generatedAt.slice(0, 10);
  const state = await readCandidateState();
  const seenTickers = new Set(stocks.map((stock) => stock.ticker));

  for (const [ticker, previous] of Object.entries(state)) {
    if (seenTickers.has(ticker)) continue;
    state[ticker] = {
      ...previous,
      missedCount: (previous.missedCount || 0) + 1,
      lastMissingAt: generatedAt,
    };
  }

  const tracked = stocks.map((stock, index) => {
    const previous = state[stock.ticker];
    const nowScore = Number(stock.fusionScore.toFixed(2));
    const rank = index + 1;
    const scoreDelta = previous ? Number((nowScore - previous.lastFusionScore).toFixed(2)) : 0;
    const rankDelta = previous?.lastRank ? previous.lastRank - rank : 0;
    const lastObservedAt = previous?.lastSeenAt ? Date.parse(previous.lastSeenAt) : 0;
    const shouldCountObservation =
      !previous ||
      previous.lastSeenDate !== today ||
      !Number.isFinite(lastObservedAt) ||
      Date.parse(generatedAt) - lastObservedAt >= OBSERVATION_INTERVAL_MS;

    let seenCount = previous?.seenCount ?? 0;
    let observationCount = previous?.observationCount ?? previous?.seenCount ?? 0;
    let streakDays = previous?.streakDays ?? 0;
    let missedCount = previous?.missedCount ?? 0;
    if (!previous) {
      seenCount = 1;
      observationCount = 1;
      streakDays = 1;
      missedCount = 0;
    } else if (previous.lastSeenDate !== today) {
      seenCount += 1;
      observationCount += 1;
      streakDays = daysBetweenDates(previous.lastSeenDate, today) <= 1 ? streakDays + 1 : 1;
      missedCount = 0;
    } else if (shouldCountObservation) {
      observationCount += 1;
    }

    const nextState: CandidateState = {
      ticker: stock.ticker,
      firstSeenAt: previous?.firstSeenAt ?? generatedAt,
      lastSeenAt: generatedAt,
      lastSeenDate: today,
      lastMissingAt: previous?.lastMissingAt,
      seenCount,
      observationCount,
      streakDays,
      missedCount,
      lastFusionScore: nowScore,
      lastRank: rank,
    };
    state[stock.ticker] = nextState;
    const phase = classifyCandidatePhase(previous, streakDays, scoreDelta, nowScore, rankDelta);

    return {
      ...stock,
      tracking: {
        firstSeenAt: nextState.firstSeenAt,
        lastSeenAt: nextState.lastSeenAt,
        seenCount,
        observationCount,
        streakDays,
        missedCount,
        lastMissingAt: nextState.lastMissingAt,
        scoreDelta,
        rankDelta,
        previousScore: previous?.lastFusionScore,
        previousRank: previous?.lastRank,
        rank,
        phase: phase.phase,
        phaseLabel: phase.phaseLabel,
      },
    };
  });

  await writeCandidateState(state);
  return tracked;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const strategy = searchParams.get('strategy') || 'buy_red_tail';
  const period = searchParams.get('period') || '日';
  const requestedTicker = cleanTicker(searchParams.get('ticker'));
  const cacheOnly = searchParams.get('mode') === 'cache';
  const replayTest = searchParams.get('replayTest') === '1' && canRunReplayTest(request);

  if (cacheOnly) {
    const cachedPayload = await readCachedPayload();
    if (cachedPayload) {
      return NextResponse.json(buildCachedReplayPayload(cachedPayload, 'fusion_cache_fast_path'));
    }

    return NextResponse.json(
      {
        error: 'fusion_cache_miss',
        core: {
          status: 'degraded',
          cache: { mode: 'stale-replay', restoredFromCache: false, ageSeconds: 0 },
          warnings: ['fusion_cache_miss'],
        },
      },
      { status: 404 }
    );
  }

  const [reportsResult, snipersResult] = replayTest
    ? [
        { data: { reports: [] }, ok: false, latencyMs: 0, error: 'fusion_replay_test_battle_reports' },
        { data: { snipers: [] }, ok: false, latencyMs: 0, error: 'fusion_replay_test_snipers' },
      ]
    : await Promise.all([
        fetchN8nType<{ reports?: BattleReport[] }>('battle_reports', { reports: [] }),
        fetchN8nType<{ snipers?: Sniper[] }>('snipers', { snipers: [] }),
      ]);

  const rawReports = Array.isArray(reportsResult.data.reports) ? reportsResult.data.reports : [];
  const { tradableReports: reports, nonTradableCount } = normalizeBattleReports(rawReports);
  const positions: Position[] = [];
  const rawSnipers = Array.isArray(snipersResult.data.snipers) ? snipersResult.data.snipers : [];
  const snipers = normalizeSnipers(rawSnipers);
  const generatedAt = new Date().toISOString();
  const syntheticFusionEnabled = process.env.SKYNET_ALLOW_SYNTHETIC_FUSION === '1';
  const focusTicker = requestedTicker ?? pickFocusTickerFromSignals(reports, snipers);
  const noFocusTickerResult = {
    ok: false,
    latencyMs: 0,
    error: 'fusion_no_candidate_focus',
  };
  const [quoteResult, klineResult] = replayTest || !focusTicker
    ? [
        { quote: null, ...noFocusTickerResult },
        { candles: [], ...noFocusTickerResult },
      ]
    : await Promise.all([
        fetchMarketQuote(focusTicker),
        fetchHistoricalKlines(focusTicker),
      ]);
  const quote = quoteResult.quote;
  const realName = quote?.name || focusTicker || '';
  const realCandidate = focusTicker && klineResult.ok
    ? buildRealLiaoCandidate(focusTicker, realName, klineResult.candles, strategy)
    : null;
  const liaoCandidates = buildEmbeddedLiaoCandidates(strategy, period, 48)
    .filter((candidate) => candidate.symbol !== focusTicker);
  if (realCandidate) {
    liaoCandidates.unshift(realCandidate);
  }
  const liaoSourceLabel = realCandidate
    ? '真實K線21點'
    : syntheticFusionEnabled
      ? '內建21點核心'
      : '無樣本候選';
  if (!realCandidate && !syntheticFusionEnabled) {
    // 沒有真實日K時，不再用合成候選充數。
    // 讓上游可以清楚看見資料缺口，而不是把樣本當盤面。
  }
  const baseFusionStocks = buildFusionStocks({ reports, positions: [], snipers, liaoCandidates });
  if (realCandidate) {
    for (const stock of baseFusionStocks) {
      if (stock.ticker !== focusTicker) continue;
      stock.source = stock.source.map((source) => source === '內建21點' ? '真實21點' : source);
      stock.signalTags = Array.from(new Set([...(stock.signalTags || []), `${klineResult.source?.toUpperCase() || 'REAL'}日K`]));
      stock.dataQuality = Math.min(100, (stock.dataQuality || 0) + 12);
    }
  }
  if (quote && focusTicker && !baseFusionStocks.some((stock) => stock.ticker === focusTicker)) {
    baseFusionStocks.push({
      ticker: focusTicker,
      name: quote.name || focusTicker,
      source: ['即時報價'],
      signalTags: [`${quote.source.toUpperCase()}報價`, quote.changePercent >= 0 ? '即時上漲' : '即時下跌'],
      price: quote.price,
      changePct: Number(quote.changePercent.toFixed(2)),
      dataQuality: 28,
      fusionScore: 8 + Math.min(12, Math.abs(quote.changePercent) * 2),
    });
  }
  const fusionStocks = await applyCandidateTracking(baseFusionStocks, generatedAt);
  if (quote) {
    for (const stock of fusionStocks) {
      if (stock.ticker !== focusTicker) continue;
      stock.price = quote.price;
      stock.changePct = Number(quote.changePercent.toFixed(2));
      stock.source = Array.from(new Set([...stock.source, '即時報價']));
      stock.signalTags = Array.from(new Set([...(stock.signalTags || []), `${quote.source.toUpperCase()}報價`]));
      stock.dataQuality = Math.min(100, (stock.dataQuality || 0) + 10);
    }
  }
  const extreme = (focusTicker && klineResult.ok ? buildRealExtremeResponse(focusTicker, realName, klineResult.candles) : null)
    || (focusTicker ? buildExtremeResponse(focusTicker, period) : {
      symbol: '',
      name: '',
      latest_date: generatedAt.slice(0, 10),
      latest_price: 0,
      items: [],
    });
  const sourceHealth: SourceHealth[] = [
    {
      id: 'n8n_battle_reports',
      label: '戰報來源',
      status: reportsResult.ok ? 'online' : 'degraded',
      rows: reports.length,
      latencyMs: reportsResult.latencyMs,
    },
    {
      id: 'n8n_report_text_filter',
      label: '非股票戰報過濾',
      status: 'online',
      rows: nonTradableCount,
      latencyMs: 0,
    },
    {
      id: 'n8n_snipers',
      label: '狙擊來源',
      status: snipersResult.ok ? 'online' : 'degraded',
      rows: snipers.length,
      latencyMs: snipersResult.latencyMs,
    },
    {
      id: 'embedded_liao_21',
      label: liaoSourceLabel,
      status: realCandidate || syntheticFusionEnabled ? 'online' : 'degraded',
      rows: liaoCandidates.length,
      latencyMs: realCandidate ? klineResult.latencyMs : 0,
    },
    {
      id: 'embedded_extreme',
      label: klineResult.ok ? '真實K線極大量' : '極大量核心',
      status: 'online',
      rows: extreme.items.length,
      latencyMs: klineResult.ok ? klineResult.latencyMs : 0,
    },
    {
      id: 'historical_kline',
      label: '單一歷史K線',
      status: klineResult.ok ? 'online' : 'degraded',
      rows: klineResult.candles.length,
      latencyMs: klineResult.latencyMs,
    },
    {
      id: 'market_quote',
      label: focusTicker ? '單一即時報價' : '焦點報價未啟用',
      status: quoteResult.ok ? 'online' : 'degraded',
      rows: quote ? 1 : 0,
      latencyMs: quoteResult.latencyMs,
    },
  ];
  const onlineSources = sourceHealth.filter((source) => source.status === 'online').length;
  const healthScore = Math.round((onlineSources / sourceHealth.length) * 100);
  const warnings = Array.from(new Set([
    reportsResult.error,
    rawReports.length > 0 && reports.length === 0 ? 'battle_reports_no_tradable_candidates' : null,
    rawSnipers.length > 0 && snipers.length === 0 ? 'snipers_no_tradable_candidates' : null,
    reports.length === 0 ? snipersResult.error : null,
    reports.length === 0 && !realCandidate ? quoteResult.error : null,
    reports.length === 0 && !realCandidate ? klineResult.error : null,
    !focusTicker ? noFocusTickerResult.error : null,
  ].filter((warning): warning is string => Boolean(warning))));
  const cachedPayload = await readCachedPayload();
  const shouldReplayCache =
    reports.length === 0 &&
    snipers.length === 0 &&
    warnings.length > 0 &&
    !quote &&
    cachedPayload !== null;

  if (shouldReplayCache) {
    const replayPayload = buildCachedReplayPayload(cachedPayload, 'fusion_cache_replay_active');
    if (replayPayload.reports.length === 0 && replayPayload.fusionStocks.length === 0) {
      replayPayload.core.healthScore = healthScore;
      replayPayload.core.sourceHealth = sourceHealth;
      replayPayload.core.warnings = Array.from(new Set([...warnings, 'fusion_cache_replay_active']));
    }
    return NextResponse.json(replayPayload);
  }

  const keyN8nOnline = reportsResult.ok || snipersResult.ok;
  const payload: FusionPayload = {
    date: generatedAt.slice(0, 10),
    generatedAt,
    core: {
      status: keyN8nOnline ? 'ok' : 'degraded',
      mode: 'embedded-fusion-core',
      novacoreRequired: false,
      healthScore,
      cache: {
        mode: 'live',
        restoredFromCache: false,
        ageSeconds: 0,
      },
      sourceHealth,
      n8n: {
        battle_reports: reportsResult.ok,
        positions: false,
        snipers: snipersResult.ok,
      },
      warnings,
    },
    reports,
    positions,
    snipers,
    liaoCandidates,
    fusionStocks,
    extreme,
    quote,
  };

  payload.core.database = {
    status: 'degraded',
    path: kvEnabled() ? 'cloudflare-kv-rest' : 'edge-memory',
  };
  payload.core.sourceHealth.push({
    id: 'fusion_persistence',
    label: kvEnabled() ? 'Fusion KV 持久化' : 'Fusion Edge 記憶體',
    status: kvEnabled() ? 'degraded' : 'online',
    rows: payload.fusionStocks.length,
    latencyMs: 0,
  });
  payload.core.healthScore = Math.round(
    (payload.core.sourceHealth.filter((source) => source.status === 'online').length / payload.core.sourceHealth.length) * 100
  );

  const databaseResult = await persistFusionPayload(payload);
  if (!databaseResult.ok && databaseResult.error) {
    payload.core.database.status = 'degraded';
    const databaseSource = payload.core.sourceHealth.find((source) => source.id === 'fusion_persistence');
    if (databaseSource) databaseSource.status = 'degraded';
    payload.core.warnings.push(`fusion_persistence_${databaseResult.error.slice(0, 120)}`);
    payload.core.healthScore = Math.round(
      (payload.core.sourceHealth.filter((source) => source.status === 'online').length / payload.core.sourceHealth.length) * 100
    );
  } else {
    payload.core.database.status = 'online';
    const databaseSource = payload.core.sourceHealth.find((source) => source.id === 'fusion_persistence');
    if (databaseSource) databaseSource.status = 'online';
    const intradaySeries = await readIntradaySeries(
      [focusTicker || '', ...payload.fusionStocks.map((stock) => stock.ticker)],
      payload.date
    );
    payload.fusionStocks = attachIntradayTrends(payload.fusionStocks, intradaySeries);
    payload.intradaySeries = focusTicker ? intradaySeries.filter((point) => point.ticker === focusTicker) : [];
  }

  await writeCachedPayload(payload);
  return NextResponse.json(payload);
}
