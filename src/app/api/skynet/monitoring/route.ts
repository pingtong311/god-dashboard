import { NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';


const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const N8N_ENDPOINT = `${N8N_BASE}/webhook/skynet-dashboard`;

export async function GET() {
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
