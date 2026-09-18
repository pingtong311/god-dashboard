/**
 * SkyNet x NovaCore proxy
 *
 * This route keeps the browser pointed at one SkyNet origin while allowing the
 * new combined war room to call the local/remote NovaCore FastAPI service.
 */

import { NextRequest, NextResponse } from 'next/server';

const NOVACORE_API_BASE = process.env.NOVACORE_API_BASE || 'http://127.0.0.1:8000';

const ALLOWED_ENDPOINTS = new Set([
  'status',
  'stock_name',
  'stock',
  'candidates',
  'quick',
  'multi',
  'shareholders',
  'chart',
  'extreme',
  'intraday',
]);

function cleanSymbol(value: string | null): string {
  const raw = String(value || '').trim();
  if (/^[A-Za-z0-9]{1,8}$/.test(raw)) return raw;
  return '';
}

function buildNovaPath(req: NextRequest): string | null {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint') || 'status';
  if (!ALLOWED_ENDPOINTS.has(endpoint)) return null;

  const upstream = new URL(NOVACORE_API_BASE);
  const params = new URLSearchParams(searchParams);
  params.delete('endpoint');

  if (endpoint === 'status') upstream.pathname = '/api/status';
  if (endpoint === 'candidates') upstream.pathname = '/api/candidates';
  if (endpoint === 'quick') upstream.pathname = '/api/screener/quick';
  if (endpoint === 'multi') upstream.pathname = '/api/screener/multi';
  if (endpoint === 'shareholders') upstream.pathname = '/api/shareholders/screen';

  if (['stock_name', 'stock', 'chart', 'extreme', 'intraday'].includes(endpoint)) {
    const symbol = cleanSymbol(searchParams.get('symbol'));
    if (!symbol) return null;
    params.delete('symbol');
    if (endpoint === 'stock_name') upstream.pathname = `/api/stock/name/${symbol}`;
    if (endpoint === 'stock') upstream.pathname = `/api/stock/${symbol}`;
    if (endpoint === 'chart') upstream.pathname = `/api/chart/${symbol}`;
    if (endpoint === 'extreme') upstream.pathname = `/api/extreme/${symbol}`;
    if (endpoint === 'intraday') upstream.pathname = `/api/intraday/${symbol}`;
  }

  upstream.search = params.toString();
  return upstream.toString();
}

export async function GET(req: NextRequest) {
  const upstreamUrl = buildNovaPath(req);
  if (!upstreamUrl) {
    return NextResponse.json({ error: 'invalid_novacore_endpoint' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'SkyNet-LiangJia-WarRoom' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: 'novacore_upstream_error', status: response.status, detail: text.slice(0, 300) },
        { status: 502 }
      );
    }

    try {
      return NextResponse.json(JSON.parse(text), { status: 200 });
    } catch {
      return NextResponse.json({ raw: text }, { status: 200 });
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'novacore_timeout' }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'novacore_fetch_error', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
