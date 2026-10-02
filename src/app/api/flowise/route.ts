import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';


// Flowise 已停用，改為直接呼叫God-03 → Omni
const N8N_BASE = process.env.SKYNET_N8N_BASE_URL || 'https://skynet-cmd.duckdns.org';
const TERMINAL_WEBHOOK = `${N8N_BASE}/webhook/skynet-terminal-sync-v1`;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'flowise', maxRequests: 12 });
  if (guard) return guard;

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
