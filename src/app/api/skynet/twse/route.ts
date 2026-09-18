/**
 * TWSE MIS 即時報價代理
 * GET /api/skynet/twse?tickers=t99,0050,2330
 *
 * 代理 TWSE MIS API，標準化回應格式
 * t99 = 加權指數（特殊代號）
 * 上市股票：tse_{代號}.tw
 * 上櫃股票：otc_{代號}.tw
 */


import { NextRequest, NextResponse } from 'next/server';

const TWSE_MIS_BASE = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
const TWSE_OPENAPI_BASE = 'https://openapi.twse.com.tw/v1/exchangeReport';
const TWSE_LIVE_PROXY_BASE = process.env.SKYNET_TWSE_LIVE_PROXY_BASE || 'https://skynet-dashboard-vert.vercel.app';

export interface TWSEMISItem {
  symbol: string;       // 代號（去除 tse_/otc_ 前綴）
  name: string;
  price: number;        // 現價（z 欄位）
  change: number;       // 漲跌（z - y）
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;    // y 欄位
  volume: number;       // v 欄位（張）
  timestamp: string;    // t 欄位
  tradeDate?: string;   // d 欄位（YYYYMMDD）
  source?: 'twse-mis-live' | 'twse-openapi-fallback';
}

export interface TWSEMISResponse {
  items: TWSEMISItem[];
  fetchedAt: string;
}

/**
 * 將 ticker 代號轉換為 TWSE MIS 格式
 * t99 → tse_t00.tw（外部保留 t99 別名；TWSE MIS 實際加權指數代號為 t00）
 * 0050 → tse_0050.tw（上市）
 * 上櫃股票需在 ticker 前加 otc: 前綴，例如 otc:6488
 */
function toExCh(ticker: string): string {
  if (ticker.startsWith('otc:')) {
    return `otc_${ticker.slice(4)}.tw`;
  }
  if (ticker.toLowerCase() === 't99' || ticker.toLowerCase() === 't00') {
    return 'tse_t00.tw';
  }
  return `tse_${ticker}.tw`;
}

function parseNumber(val: string | undefined): number {
  if (!val || val === '-' || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseFirstPrice(value: string | undefined): number {
  if (!value) return 0;
  const first = value.split('_').find(Boolean);
  return parseNumber(first);
}

function parseLivePrice(item: Record<string, string>): number {
  const tradedPrice = parseNumber(item.z);
  if (tradedPrice > 0) return tradedPrice;
  const previousTrade = parseNumber(item.pz);
  if (previousTrade > 0) return previousTrade;
  const bestBid = parseFirstPrice(item.b);
  const bestAsk = parseFirstPrice(item.a);
  if (bestBid > 0 && bestAsk > 0) return Number(((bestBid + bestAsk) / 2).toFixed(4));
  return bestBid || bestAsk || 0;
}

function formatTwseOpenDate(value: string | undefined): string {
  if (!value || !/^\d{7}$/.test(value)) return '';
  const year = Number(value.slice(0, 3)) + 1911;
  return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

function formatTwseTradeDate(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchOpenApiFallback(tickers: string[]): Promise<TWSEMISResponse | null> {
  const cleanTickers = Array.from(new Set(tickers.map((ticker) => ticker.trim()).filter(Boolean)));
  if (cleanTickers.length === 0) return null;

  const needsIndex = cleanTickers.includes('t99');
  const stockTickers = cleanTickers.filter((ticker) => ticker !== 't99' && !ticker.startsWith('otc:'));
  const [indexRows, stockRows] = await Promise.all([
    needsIndex
      ? fetchJsonWithTimeout<Array<Record<string, string>>>(`${TWSE_OPENAPI_BASE}/MI_INDEX`, 8_000)
      : Promise.resolve(null),
    stockTickers.length > 0
      ? fetchJsonWithTimeout<Array<Record<string, string>>>(`${TWSE_OPENAPI_BASE}/STOCK_DAY_AVG_ALL`, 8_000)
      : Promise.resolve(null),
  ]);

  const items: TWSEMISItem[] = [];
  if (needsIndex && Array.isArray(indexRows)) {
    const row = indexRows.find((item) => item['指數'] === '發行量加權股價指數');
    if (row) {
      const price = parseNumber(row['收盤指數']);
      const signedChange = parseNumber(row['漲跌點數']) * (row['漲跌'] === '-' ? -1 : 1);
      const prevClose = price - signedChange;
      items.push({
        symbol: 't99',
        name: row['指數'] || '加權指數',
        price,
        change: signedChange,
        changePercent: parseNumber(row['漲跌百分比']) * (row['漲跌'] === '-' ? -1 : 1),
        open: 0,
        high: 0,
        low: 0,
        prevClose,
        volume: 0,
        timestamp: formatTwseOpenDate(row['日期']),
        tradeDate: formatTwseOpenDate(row['日期']),
        source: 'twse-openapi-fallback',
      });
    }
  }

  if (Array.isArray(stockRows)) {
    const byCode = new Map(stockRows.map((row) => [row.Code, row]));
    for (const ticker of stockTickers) {
      const row = byCode.get(ticker);
      if (!row) continue;
      const price = parseNumber(row.ClosingPrice);
      items.push({
        symbol: ticker,
        name: row.Name || ticker,
        price,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        prevClose: price,
        volume: 0,
        timestamp: formatTwseOpenDate(row.Date),
        tradeDate: formatTwseOpenDate(row.Date),
        source: 'twse-openapi-fallback',
      });
    }
  }

  if (items.length === 0) return null;
  return {
    items,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchLiveProxyFallback(tickers: string[], requestHost: string): Promise<TWSEMISResponse | null> {
  if (!TWSE_LIVE_PROXY_BASE) return null;
  const proxy = new URL(TWSE_LIVE_PROXY_BASE);
  if (proxy.host === requestHost) return null;
  proxy.pathname = '/api/skynet/twse';
  proxy.search = new URLSearchParams({
    tickers: tickers.join(','),
    _ts: String(Date.now()),
  }).toString();

  const data = await fetchJsonWithTimeout<TWSEMISResponse>(proxy.toString(), 8_000);
  if (!data || !Array.isArray(data.items) || data.items.length === 0) return null;
  const hasLiveItems = data.items.some((item) => item.source === 'twse-mis-live');
  return hasLiveItems ? data : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestHost = req.nextUrl.host;
  const tickersParam = searchParams.get('tickers');

  if (!tickersParam) {
    return NextResponse.json({ error: 'missing_tickers' }, { status: 400 });
  }

  const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);
  if (tickers.length === 0) {
    return NextResponse.json({ error: 'empty_tickers' }, { status: 400 });
  }

  const exCh = tickers.map(toExCh).join('|');
  const url = `${TWSE_MIS_BASE}?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json,text/javascript,*/*;q=0.01',
        'Referer': 'https://mis.twse.com.tw/stock/index.jsp',
        'User-Agent': 'Mozilla/5.0',
      },
      
    });
    clearTimeout(timer);

    if (!res.ok) {
      const liveProxy = await fetchLiveProxyFallback(tickers, requestHost);
      if (liveProxy) {
        return NextResponse.json(liveProxy, {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'X-Skynet-Data-Source': 'twse-live-proxy',
            'X-Skynet-Upstream-Status': String(res.status),
          },
        });
      }
      const fallback = await fetchOpenApiFallback(tickers);
      if (fallback) {
        return NextResponse.json(fallback, {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'X-Skynet-Data-Source': 'twse-openapi-fallback',
            'X-Skynet-Upstream-Status': String(res.status),
          },
        });
      }
      return NextResponse.json({ error: 'twse_upstream_error', status: res.status }, { status: 502 });
    }

    const raw = await res.json();
    // TWSE MIS 回應格式：{ msgArray: [...], queryTime: {...} }
    const msgArray: Record<string, string>[] = raw?.msgArray ?? [];

    const items: TWSEMISItem[] = msgArray.map((item): TWSEMISItem => {
      const rawSymbol = (item.c || '').replace(/^(tse_|otc_)/, '').replace(/\.tw$/, '');
      const symbol = rawSymbol === 't00' ? 't99' : rawSymbol;
      const prevClose = parseNumber(item.y);
      const price = parseLivePrice(item);
      const change = prevClose > 0 && price > 0 ? price - prevClose : 0;
      const changePercent = prevClose > 0 && price > 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol,
        name: item.n || symbol,
        price,
        change,
        changePercent,
        open: parseNumber(item.o),
        high: parseNumber(item.h),
        low: parseNumber(item.l),
        prevClose,
        volume: parseNumber(item.v),
        timestamp: item.t || '',
        tradeDate: formatTwseTradeDate(item.d),
        source: 'twse-mis-live' as const,
      };
    }).filter((item) => item.symbol && item.price > 0);

    const response: TWSEMISResponse = {
      items,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Skynet-Data-Source': 'twse-mis-live',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const liveProxy = await fetchLiveProxyFallback(tickers, requestHost);
    if (liveProxy) {
      return NextResponse.json(liveProxy, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Skynet-Data-Source': 'twse-live-proxy',
        },
      });
    }
    const fallback = await fetchOpenApiFallback(tickers);
    if (fallback) {
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Skynet-Data-Source': 'twse-openapi-fallback',
        },
      });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'twse_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'twse_fetch_error' }, { status: 500 });
  }
}
