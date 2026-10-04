/**
 * God每日績效摘要 API
 * GET /api/skynet/performance
 *
 * 從 n8n God-API webhook 取得當日 BUY 訊號的實際表現摘要
 * n8n 端需回傳格式：
 * {
 *   date: string,
 *   totalSignals: number,
 *   buySignals: number,
 *   triggered: number,
 *   winCount: number,
 *   lossCount: number,
 *   winRate: number,        // 0-100
 *   avgReturn: number,      // 百分比，可負
 *   bestTicker: string,
 *   bestReturn: number,
 *   worstTicker: string,
 *   worstReturn: number,
 *   summary: string,
 * }
 */


import { NextResponse } from 'next/server';

/**
 * 2026-10-04：n8n 已於 2026-10-03 退役，原本 fallback 到 skynet-cmd.duckdns.org 必定失敗
 * 且會讓呼叫端空等 75 秒。改為「未設定即視為未配置」，快速誠實回報。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const DASHBOARD_API = `${N8N_BASE}/webhook/skynet-dashboard`;
const PERFORMANCE_TIMEOUT_MS = Number(process.env.SKYNET_PERFORMANCE_TIMEOUT_MS || 75_000);

export async function GET() {
  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: '績效資料上游未設定（n8n 已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  async function fetchPerformance() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PERFORMANCE_TIMEOUT_MS);
    try {
      return await fetch(`${DASHBOARD_API}?type=daily_performance&_ts=${Date.now()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let res = await fetchPerformance();
    if (!res.ok && res.status >= 500) {
      res = await fetchPerformance();
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'upstream_error', status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout', timeoutMs: PERFORMANCE_TIMEOUT_MS }, { status: 504 });
    }
    return NextResponse.json({ error: 'network_error' }, { status: 502 });
  }
}
