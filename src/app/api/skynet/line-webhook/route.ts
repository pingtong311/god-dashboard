import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

const N8N_LINE_AIDE = 'https://skynet-cmd.duckdns.org/webhook/skynet-line-aide-v1';
const MAX_BODY_BYTES = 256_000;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let eventCount = 0;
  try {
    const payload = JSON.parse(body || '{}') as { events?: unknown[] };
    eventCount = Array.isArray(payload.events) ? payload.events.length : 0;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const signature = request.headers.get('x-line-signature') || '';
  if (eventCount > 0 && !signature) {
    return NextResponse.json({ error: 'missing_line_signature' }, { status: 401 });
  }

  const forward = fetch(N8N_LINE_AIDE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'x-line-signature': signature } : {}),
    },
    body,
  }).catch(() => undefined);

  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(forward);
  } catch {
    void forward;
  }

  return NextResponse.json({ accepted: true }, { status: 200 });
}
