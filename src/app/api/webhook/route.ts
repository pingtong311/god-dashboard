import { NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';


const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const WEBHOOK_URL = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'webhook', maxRequests: 18 });
  if (guard) return guard;

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
