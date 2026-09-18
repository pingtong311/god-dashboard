/**
 * 天網 API 健康檢查路由
 * GET /api/skynet/health
 *
 * 同時探測 n8n 和 Google Sheets（透過 n8n warroom webhook）連線狀態
 * 回傳各服務的 status: 'ok' | 'error' | 'timeout'
 */


import { NextRequest, NextResponse } from 'next/server';

const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const N8N_API_KEY = process.env.SKYNET_N8N_API_KEY || '';

type ServiceStatus = 'ok' | 'error' | 'timeout';

interface HealthResult {
  n8n: ServiceStatus;
  sheets: ServiceStatus;
  semantic: ServiceStatus;
  details: {
    n8nApiAuthorized: boolean;
    alphaReady: boolean;
    battleReportsReachable: boolean;
    battleReportsCount: number;
    sniperFeedReachable: boolean;
    sniperCount: number;
    warnings: string[];
  };
  checkedAt: string;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<{ status: ServiceStatus; httpStatus?: number; data?: T; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: 'error', httpStatus: res.status };
    return { status: 'ok', httpStatus: res.status, data: await res.json().catch(() => undefined as T | undefined) };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') return { status: 'timeout' };
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

function hasAlphaSummary(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const root = data as Record<string, unknown>;
  const record = (root.warRoom && typeof root.warRoom === 'object')
    ? root.warRoom as Record<string, unknown>
    : root;
  const text = [
    record.summary,
    record.alphaSummary,
    record.marketSummary,
    record.todaySummary,
    record.focusSectors,
    record.avoidSectors,
    record.focusTags,
    record.avoidTags,
  ].map((item) => Array.isArray(item) ? item.join(' ') : String(item || '')).join(' ');
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(text) && text.length >= 8;
}

function arrayPayloadLength(data: unknown, key: 'reports' | 'snipers'): number | null {
  if (!data || typeof data !== 'object') return null;
  const rows = (data as Record<string, unknown>)[key];
  return Array.isArray(rows) ? rows.length : null;
}

function validBattleReportsCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const rows = (data as Record<string, unknown>).reports;
  if (!Array.isArray(rows)) return null;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return /^\d{4,6}[A-Za-z]?$/.test(String(record.ticker || '').trim())
      && ['BUY', 'WAIT', 'SELL'].includes(String(record.action || ''));
  }).length;
}

export async function GET(request: NextRequest) {
  // 使用 /api/v1/workflows 探測 n8n（比 /healthz 更可靠）
  // 加上 X-N8N-API-KEY header（若未設定則不帶，n8n 會回 401 但仍代表連線正常）
  const n8nHeaders: Record<string, string> = {};
  if (N8N_API_KEY) n8nHeaders['X-N8N-API-KEY'] = N8N_API_KEY;
  const timeoutMs = Number(process.env.SKYNET_HEALTH_TIMEOUT_MS || 30_000);

  const origin = new URL(request.url).origin;
  const [n8nProbe, alphaProbe, reportsProbe, snipersProbe] = await Promise.all([
    fetchJsonWithTimeout(`${N8N_BASE}/api/v1/workflows?limit=1`, timeoutMs, n8nHeaders),
    fetchJsonWithTimeout(`${origin}/api/skynet/n8n-proxy?type=alpha&_ts=${Date.now()}`, timeoutMs),
    fetchJsonWithTimeout(`${origin}/api/skynet/n8n-proxy?type=battle_reports&_ts=${Date.now()}`, timeoutMs),
    fetchJsonWithTimeout(`${origin}/api/skynet/n8n-proxy?type=snipers&_ts=${Date.now()}`, timeoutMs),
  ]);
  const alphaReady = alphaProbe.status === 'ok' && hasAlphaSummary(alphaProbe.data);
  const rawBattleReportsCount = arrayPayloadLength(reportsProbe.data, 'reports');
  const battleReportsCount = validBattleReportsCount(reportsProbe.data);
  const sniperCount = arrayPayloadLength(snipersProbe.data, 'snipers');
  const battleReportsReachable = reportsProbe.status === 'ok' && rawBattleReportsCount !== null;
  const sniperFeedReachable = snipersProbe.status === 'ok' && sniperCount !== null;
  const dashboardWebhookReady = battleReportsReachable || sniperFeedReachable || alphaReady;
  const n8nApiAuthorized = n8nProbe.status === 'ok';
  const n8nReachable = n8nApiAuthorized || (!N8N_API_KEY && dashboardWebhookReady);
  const warnings = [
    n8nApiAuthorized ? null : `n8n_api_${n8nProbe.httpStatus || n8nProbe.status}`,
    !alphaReady && !n8nApiAuthorized ? 'alpha_summary_empty_or_invalid' : null,
    !battleReportsReachable && !n8nApiAuthorized ? 'battle_reports_unreachable_or_invalid' : null,
    !n8nApiAuthorized && battleReportsReachable && battleReportsCount === 0 ? 'battle_reports_no_tradable_candidates_today' : null,
    !sniperFeedReachable && !n8nApiAuthorized ? 'snipers_unreachable_or_invalid' : null,
  ].filter((item): item is string => Boolean(item));

  const result: HealthResult = {
    n8n: n8nReachable ? 'ok' : n8nProbe.status,
    sheets: dashboardWebhookReady || n8nApiAuthorized ? 'ok' : alphaProbe.status,
    semantic: dashboardWebhookReady || n8nApiAuthorized ? 'ok' : 'error',
    details: {
      n8nApiAuthorized,
      alphaReady,
      battleReportsReachable,
      battleReportsCount: battleReportsCount || 0,
      sniperFeedReachable,
      sniperCount: sniperCount || 0,
      warnings,
    },
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(result, {
    status: 200,
    headers: {
      // 前端快取 30 秒，避免過度探測
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
