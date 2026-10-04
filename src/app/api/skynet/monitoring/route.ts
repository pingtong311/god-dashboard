import { NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';


/**
 * 2026-10-04：n8n 已於 2026-10-03 退役，原本 fallback 到 skynet-cmd.duckdns.org 必定失敗。
 * 改為「未設定即視為未配置」，快速誠實回報。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const N8N_ENDPOINT = `${N8N_BASE}/webhook/skynet-dashboard`;

export async function GET() {
  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: '監控資料上游未設定（n8n 已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(N8N_ENDPOINT, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`n8n responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Monitoring API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'skynet:monitoring', maxRequests: 18 });
  if (guard) return guard;

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { success: false, error: 'upstream_not_configured', message: 'n8n 已於 2026-10-03 退役。' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const response = await fetch(N8N_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(sanitizeUpstreamError(response.status), { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Action API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Command failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
