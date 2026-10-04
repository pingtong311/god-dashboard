import { NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';


/**
 * 上游 base URL（2026-10-04 調整）。
 * 原本 fallback 到 `https://skynet-cmd.duckdns.org`（n8n），該服務已於 2026-10-03 退役、
 * 連線必定失敗。現改為「未設定即視為未配置」，快速誠實回報，不再打已退役的主機。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const WEBHOOK_URL = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'webhook', maxRequests: 18 });
  if (guard) return guard;

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: 'n8n 上游未設定（該服務已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  try {
    const data = await request.json();

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      return NextResponse.json(sanitizeUpstreamError(response.status), { status: 502 });
    }

    const n8nData = await response.json();
    return NextResponse.json(n8nData);
  } catch (error) {
    console.error('API Webhook Proxy Error:', error);
    return NextResponse.json(
      { error: 'Failed to deploy to n8n webhook' },
      { status: 500 }
    );
  }
}
