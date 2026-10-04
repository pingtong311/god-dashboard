import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

/**
 * LINE 事件轉發目標（2026-10-04 調整）。
 * 原本硬編碼到 `https://skynet-cmd.duckdns.org`（n8n），該服務已於 2026-10-03 退役。
 * 現改為由環境變數提供；未設定時**不轉發**（僅收下事件並回 accepted），
 * 避免對已退役的主機發出無謂請求。
 */
const N8N_LINE_AIDE = (process.env.SKYNET_LINE_AIDE_WEBHOOK_URL ?? '').trim();
const LINE_AIDE_CONFIGURED = N8N_LINE_AIDE.length > 0;
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

  const forward = LINE_AIDE_CONFIGURED
    ? fetch(N8N_LINE_AIDE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(signature ? { 'x-line-signature': signature } : {}),
        },
        body,
      }).catch(() => undefined)
    : Promise.resolve(undefined);

  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(forward);
  } catch {
    void forward;
  }

  return NextResponse.json({ accepted: true }, { status: 200 });
}
