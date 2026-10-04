import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';


/**
 * 2026-10-04：n8n 已於 2026-10-03 退役，原本 fallback 到 skynet-cmd.duckdns.org 必定失敗。
 * 改為「未設定即視為未配置」，快速誠實回報。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const WATCH_WEBHOOK = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;
const TIMEOUT_MS = 10000;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'skynet:watch', maxRequests: 18 });
  if (guard) return guard;

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: '到價提醒通道未設定（n8n 已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { ticker, triggerPrice, source } = body;

    // Validate ticker: must be 4-6 digits
    if (!ticker || !/^\d{4,6}$/.test(String(ticker).trim())) {
      return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
    }

    // Validate triggerPrice: optional, defaults to 0, must be >= 0
    const price = triggerPrice !== undefined && triggerPrice !== null ? Number(triggerPrice) : 0;
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'invalid_trigger_price' }, { status: 400 });
    }

    const cleanTicker = String(ticker).trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(WATCH_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `/watch ${cleanTicker} ${price}`,
          chatId: 6375207034,
          Source: source || 'Dashboard',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
      }

      const text = await response.text();

      try {
        const data = JSON.parse(text);
        return NextResponse.json({ success: true, ticker: cleanTicker, ...data });
      } catch {
        return NextResponse.json({ success: true, ticker: cleanTicker, message: text });
      }
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'watch_timeout' }, { status: 504 });
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Watch API Error:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
