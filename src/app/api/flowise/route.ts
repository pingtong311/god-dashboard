import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';


/**
 * 上游 base URL（2026-10-04 調整）。
 * 原本 fallback 到 `https://skynet-cmd.duckdns.org`（n8n），該服務已於 2026-10-03 退役、
 * 連線必定失敗。現改為「未設定即視為未配置」，快速誠實回報，不再打已退役的主機。
 */
const N8N_BASE = (process.env.SKYNET_N8N_BASE_URL ?? '').trim();
const N8N_CONFIGURED = N8N_BASE.length > 0;
const TERMINAL_WEBHOOK = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'flowise', maxRequests: 12 });
  if (guard) return guard;

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: 'AI 分析上游未設定（n8n 已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  try {
    const { question } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // 提取代號（如果問題包含股票代號）
    const tickerMatch = question.match(/\b\d{4,6}\b/);
    const command = tickerMatch ? tickerMatch[0] : question;

    const response = await fetch(TERMINAL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        chatId: 6375207034,
        Source: 'Terminal',
      }),
    });

    if (!response.ok) {
      throw new Error(`n8n returned status: ${response.status}`);
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return NextResponse.json({ text: '分析中，請稍後查看 Telegram 回報。' });
    }

    try {
      const data = JSON.parse(text);
      const message = data.message || data.text || data.Reason || JSON.stringify(data);
      return NextResponse.json({ text: message });
    } catch {
      return NextResponse.json({ text });
    }
  } catch (error) {
    console.error('AI Query Error:', error);
    return NextResponse.json(
      { error: 'God AI 分析服務暫時無法連線' },
      { status: 500 }
    );
  }
}
