import { NextResponse } from 'next/server';


/**
 * 上游 base URL（2026-10-04 調整）。
 * 原本 fallback 到 `https://skynet-cmd.duckdns.org`（n8n），該服務已於 2026-10-03 退役、
 * 連線必定失敗。現改為「未設定即視為未配置」，直接快速回報不可用，不再打已退役的主機。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const DASHBOARD_WEBHOOK = `${N8N_BASE}/webhook/skynet-dashboard`;

type InsightSignal = {
  time?: string;
  action?: string;
  ticker?: string;
  name?: string;
  strategy?: string;
  reasoning?: string;
};

export async function GET() {
  // 上游未配置（n8n 已退役）→ 誠實回報，不做無謂的連線嘗試。
  if (!N8N_CONFIGURED) {
    return NextResponse.json([
      { time: '--:--:--', type: 'INIT', msg: '雲端情報服務未設定（n8n 已退役），目前無即時分析信號。', isAlert: false },
    ]);
  }

  try {
    const response = await fetch(DASHBOARD_WEBHOOK, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      throw new Error(`n8n API failed with status: ${response.status}`);
    }

    const data = await response.json();

    const signals = Array.isArray(data.signals) ? data.signals as InsightSignal[] : [];
    const logs = signals.map((s) => ({
      time: s.time || new Date().toLocaleTimeString('zh-TW', { hour12: false }),
      type: s.action === 'BUY' ? 'ALERT' : s.action === 'SELL' ? 'SCAN' : 'THOUGHT',
      msg: `[${s.ticker} ${s.name}] ${s.strategy}: ${s.reasoning}`,
      isAlert: s.action === 'BUY',
    }));

    logs.unshift({
      time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
      type: 'INIT',
      msg: `同步成功：已從雲端擷取 ${data.totalAnalyzed || logs.length} 筆即時分析信號。`,
      isAlert: false,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Insights API Error:', error);
    return NextResponse.json(
      [{ time: '--:--:--', type: 'ERROR', msg: '無法連線至雲端情報服務', isAlert: true }],
      { status: 500 }
    );
  }
}
