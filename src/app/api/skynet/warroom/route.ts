import { NextResponse } from 'next/server';


// 讀取 Google Sheets 的God 數據
// 透過 n8n God-API 工作流取得資料（已有 webhook 端點）
// 2026-10-04：n8n 已於 2026-10-03 退役，原本 fallback 到 skynet-cmd.duckdns.org 必定失敗
// 且會讓呼叫端空等 75 秒。改為「未設定即視為未配置」，快速誠實回報。
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const DASHBOARD_API = `${N8N_BASE}/webhook/skynet-dashboard`;
const VALID_TYPES = new Set(['alpha', 'positions', 'p1_triggers', 'snipers', 'battle_reports', 'personal_performance', 'daily_performance']);
const WARROOM_TIMEOUT_MS = Number(process.env.SKYNET_WARROOM_TIMEOUT_MS || 75_000);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'alpha';

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'invalid_type', validTypes: Array.from(VALID_TYPES) }, { status: 400 });
  }

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: 'n8n 上游未設定（該服務已於 2026-10-03 退役）。', type },
      { status: 503 },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WARROOM_TIMEOUT_MS);
    const response = await fetch(`${DASHBOARD_API}?type=${encodeURIComponent(type)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Dashboard API failed: ${response.status} ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('WarRoom API Error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        error: 'warroom_timeout',
        timeoutMs: WARROOM_TIMEOUT_MS,
        type,
      }, { status: 504 });
    }
    return NextResponse.json({
      error: 'Failed to fetch war room data',
      detail: error instanceof Error ? error.message : String(error),
      type,
    }, { status: 500 });
  }
}
