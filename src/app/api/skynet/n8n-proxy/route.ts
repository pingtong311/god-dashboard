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

/**
 * 上游 base URL（2026-10-04 調整）。
 *
 * 原本 fallback 到 `https://skynet-cmd.duckdns.org`（n8n）。該服務已於 2026-10-03 退役、
 * Caddy 的 :443 站點已移除 → 連線必定失敗，且會讓呼叫端等滿 N8N_PROXY_TIMEOUT_MS（75 秒）。
 *
 * 現改為：**未設定即視為未配置**，直接快速回報不可用，絕不再打已退役的主機。
 * 若日後要接回上游，設 `SKYNET_N8N_BASE_URL` 即可，不需改程式。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
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

  // 上游未配置（n8n 已退役）→ 快速、誠實地回報不可用。
  // 重點：**不要**再讓呼叫端空等 75 秒逾時（App 開場頁的面板會因此卡住）。
  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      {
        error: 'upstream_not_configured',
        message: 'n8n 上游未設定（該服務已於 2026-10-03 退役），此資料來源目前不可用。',
      },
      { status: 503 },
    );
  }

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
