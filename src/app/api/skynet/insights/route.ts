import { NextResponse } from 'next/server';


const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
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
