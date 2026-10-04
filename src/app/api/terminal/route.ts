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
const TIMEOUT_MS = 8000;

const ASYNC_MSG = (cmd: string) =>
  `⏳ God AI 分析中...\n\n指令「${cmd}」已送達，Omni 引擎正在處理。\n\n📱 完整戰報將同步推送至 Telegram。\n💡 約 20-30 秒後可在 Telegram 查看結果。`;

export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'terminal', maxRequests: 12 });
  if (guard) return guard;

  if (!N8N_CONFIGURED) {
    return NextResponse.json(
      { error: 'upstream_not_configured', message: '指令通道未設定（n8n 已於 2026-10-03 退役）。' },
      { status: 503 },
    );
  }

  try {
    const data = await request.json();
    const cmd = data.command || '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(TERMINAL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          { error: `n8n server returned ${response.status}` },
          { status: response.status }
        );
      }

      const text = await response.text();

      // 空回應
      if (!text || text.trim() === '') {
        return NextResponse.json({ message: ASYNC_MSG(cmd), success: true, async: true });
      }

      try {
        const json = JSON.parse(text);
        // n8n onReceived 模式：立即回傳 {"message":"Workflow was started"}
        if (json.message === 'Workflow was started' || json.code === 0) {
          return NextResponse.json({ message: ASYNC_MSG(cmd), success: true, async: true });
        }
        return NextResponse.json(json);
      } catch {
        return NextResponse.json({ message: text, success: true });
      }

    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({ message: ASYNC_MSG(cmd), success: true, async: true });
      }
      throw err;
    }

  } catch (error) {
    console.error('Terminal Proxy Error:', error);
    return NextResponse.json(
      { error: '伺服器連線失敗，請確認 Oracle n8n 服務狀態。' },
      { status: 500 }
    );
  }
}
