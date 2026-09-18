/**
 * n8n Webhook 代理
 * GET  /api/skynet/n8n-proxy?type=alpha|positions|p1_triggers|snipers|battle_reports|personal_performance|daily_performance|decision_reviews
 * POST /api/skynet/n8n-proxy  → 轉發 body 至 n8n webhook
 *
 * 統一錯誤處理：
 *   逾時 → HTTP 504
 *   n8n 非 200 → HTTP 502
 *   其他 → HTTP 500
 */


import { NextRequest, NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';

const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const DASHBOARD_WEBHOOK = `${N8N_BASE}/webhook/skynet-dashboard`;
const N8N_PROXY_TIMEOUT_MS = Number(process.env.SKYNET_N8N_PROXY_TIMEOUT_MS || 75_000);

const VALID_GET_TYPES = new Set([
  'alpha',
  'positions',
  'p1_triggers',
  'snipers',
  'battle_reports',
  'personal_performance',
  'daily_performance',
  'decision_reviews',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (!type || !VALID_GET_TYPES.has(type)) {
    return NextResponse.json(
      { error: 'invalid_type', validTypes: Array.from(VALID_GET_TYPES) },
      { status: 400 }
    );
  }
  const safeType = type;

  async function fetchUpstream() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_PROXY_TIMEOUT_MS);
    const upstreamUrl = `${DASHBOARD_WEBHOOK}?type=${encodeURIComponent(safeType)}&_ts=${Date.now()}`;
    try {
      return await fetch(upstreamUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function hasSemanticData(data: unknown): boolean {
    if (safeType !== 'positions') return true;
    const positions = (data as { positions?: unknown[] })?.positions;
    return Array.isArray(positions) && positions.length > 0;
  }

  try {
    let res = await fetchUpstream();
    if (!res.ok && res.status >= 500) {
      res = await fetchUpstream();
    }
    if (!res.ok) {
      return NextResponse.json(
        sanitizeUpstreamError(res.status),
        { status: 502 }
      );
    }

    let data = await res.json();
    for (let i = 0; !hasSemanticData(data) && i < 2; i += 1) {
      const retry = await fetchUpstream();
      if (!retry.ok) break;
      data = await retry.json();
    }
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      try {
        const retry = await fetchUpstream();
        if (retry.ok) {
          let data = await retry.json();
          for (let i = 0; !hasSemanticData(data) && i < 2; i += 1) {
            const semanticRetry = await fetchUpstream();
            if (!semanticRetry.ok) break;
            data = await semanticRetry.json();
          }
          return NextResponse.json(data, {
            status: 200,
            headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Skynet-Retry': 'n8n-timeout' },
          });
        }
      } catch {}
      return NextResponse.json({ error: 'n8n_timeout', timeoutMs: N8N_PROXY_TIMEOUT_MS }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'n8n_fetch_error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json_body' }, { status: 400 });
  }

  const actionType = typeof body === 'object' && body !== null && 'type' in body
    ? String((body as { type?: unknown }).type || '')
    : '';
  const allowedPostTypes = new Set(['update_monitoring', 'add_monitoring', 'review_notification']);
  if (!allowedPostTypes.has(actionType)) {
    return NextResponse.json(
      { error: 'invalid_action_type', validTypes: Array.from(allowedPostTypes) },
      { status: 400 }
    );
  }

  const guard = guardMutation(req, {
    endpoint: `skynet:n8n-proxy:${actionType}`,
    maxRequests: actionType === 'review_notification' ? 30 : 18,
    allowSameOrigin: actionType === 'review_notification',
  });
  if (guard) return guard;

  async function postUpstream() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_PROXY_TIMEOUT_MS);
    try {
      return await fetch(DASHBOARD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let res = await postUpstream();
    if (!res.ok && res.status >= 500) {
      res = await postUpstream();
    }
    if (!res.ok) {
      return NextResponse.json(
        sanitizeUpstreamError(res.status),
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      try {
        const retry = await postUpstream();
        if (retry.ok) {
          const data = await retry.json().catch(() => ({ ok: true }));
          return NextResponse.json(data, {
            status: 200,
            headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Skynet-Retry': 'n8n-timeout' },
          });
        }
      } catch {}
      return NextResponse.json({ error: 'n8n_timeout', timeoutMs: N8N_PROXY_TIMEOUT_MS }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'n8n_fetch_error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
