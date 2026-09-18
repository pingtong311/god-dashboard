import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';


const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const TERMINAL_WEBHOOK = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;
const TIMEOUT_MS = 60000;

type MarketPreset = 'TW' | 'HK' | 'US';

function cleanTickerByMarket(ticker: string, market: MarketPreset): string | null {
  const value = ticker.trim().toUpperCase();
  if (market === 'TW') {
    return /^\d{4,6}[A-Z]?$/.test(value) ? value : null;
  }
  if (market === 'HK') {
    return /^\d{5}$/.test(value) ? value : null;
  }
  if (/^[A-Z0-9.\-]{1,10}$/.test(value)) return value;
  return null;
}

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'skynet:analyze', maxRequests: 10 });
  if (guard) return guard;

  try {
    const body = await request.json();
    const ticker = String(body?.ticker || '');
    const market = (String(body?.market || 'TW').toUpperCase() as MarketPreset);

    if (!['TW', 'HK', 'US'].includes(market)) {
      return NextResponse.json({ error: 'invalid_market' }, { status: 400 });
    }

    const cleanTicker = cleanTickerByMarket(ticker, market);
    if (!cleanTicker) {
      return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(TERMINAL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cleanTicker,
          market,
          chatId: 6375207034,
          Source: `Review-${market}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
      }

      const text = await response.text();

      if (!text || text.trim() === '') {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
      }

      try {
        const data = JSON.parse(text);
        return NextResponse.json({
          ...data,
          analysisMeta: {
            source: 'n8n-terminal-sync-v1',
            market,
            responseKind: 'json',
            receivedAt: new Date().toISOString(),
            rawPreview: text.slice(0, 1200),
            rawBody: text,
          },
        });
      } catch {
        return NextResponse.json({
          ticker: cleanTicker,
          market,
          message: text,
          analysisMeta: {
            source: 'n8n-terminal-sync-v1',
            market,
            responseKind: 'text',
            receivedAt: new Date().toISOString(),
            rawPreview: text.slice(0, 1200),
            rawBody: text,
          },
        });
      }

    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'analysis_timeout', message: '分析逾時，請稍後再試' },
          { status: 504 }
        );
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Analyze API Error:', error);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500 }
    );
  }
}
