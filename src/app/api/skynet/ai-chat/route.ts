import { NextResponse } from 'next/server';
import { guardMutation, sanitizeUpstreamError } from '@/lib/apiGuard';
import {
  NVIDIA_CHAT_ENDPOINT,
  NVIDIA_MODEL,
  SYSTEM_PROMPT,
  encodeChatEvent,
  normalizeMessages,
  parseUpstreamDelta,
} from '@/lib/aiChat';

/**
 * AI 問答代理端點（串流）
 *
 * 將前端的對話請求代理到 NVIDIA NIM，並把推理模型回傳的
 * `reasoning_content`（思考過程）與 `content`（正式回覆）分流成 SSE 事件。
 *
 * 注意：本檔僅使用 Web 標準 API（fetch / ReadableStream / TextEncoder / AbortController），
 * 不含任何 Node.js 專屬 API，可在 Cloudflare Workers 執行環境運作。
 *
 * 共用的常數、型別與純函式放在 `@/lib/aiChat`：
 * App Router 的 route 檔僅允許匯出 HTTP 方法與特定設定值。
 */

export async function POST(request: Request) {
  // 寫入型端點守衛：AI 呼叫成本高，因此比一般寫入端點收緊至每分鐘 20 次。
  const guard = guardMutation(request, {
    endpoint: 'ai-chat',
    maxRequests: 20,
    allowSameOrigin: true,
  });
  if (guard) return guard;

  // 缺少金鑰時回傳明確錯誤，避免變成 500 堆疊。
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'missing_api_key',
        message: '伺服器尚未設定 NVIDIA_NIM_API_KEY，請於環境變數中補上後再試。',
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const normalized = normalizeMessages((body as { messages?: unknown } | null)?.messages);
  if (!normalized.ok) {
    // 單則使用者訊息過長：明確報錯，不做靜默截斷。
    if (normalized.error === 'message_too_long') {
      return NextResponse.json(
        { error: 'message_too_long', limit: normalized.limit },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'invalid_messages', message: 'messages 格式不正確或為空。' },
      { status: 400 }
    );
  }

  const messages = normalized.messages;

  // 系統提示固定由伺服器端注入，前端無法覆寫。
  const upstreamPayload = {
    model: NVIDIA_MODEL,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    stream: true,
    chat_template_kwargs: { enable_thinking: true },
  };

  const upstreamController = new AbortController();
  let upstream: Response;

  try {
    upstream = await fetch(NVIDIA_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamPayload),
      signal: upstreamController.signal,
    });
  } catch (error) {
    console.error('AI Chat upstream fetch failed:', error);
    return NextResponse.json(
      { error: 'upstream_error', message: '無法連線至 AI 服務，請稍後再試。' },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    console.error('AI Chat upstream responded with status:', upstream.status);
    // 不將上游原始錯誤字串外洩給前端。
    return NextResponse.json(sanitizeUpstreamError(upstream.status), { status: 502 });
  }

  const upstreamBody = upstream.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const safeEnqueue = (event: Parameters<typeof encodeChatEvent>[0]): void => {
        try {
          controller.enqueue(encodeChatEvent(event));
        } catch {
          // 串流已由前端關閉，忽略即可。
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            const delta = parseUpstreamDelta(payload);
            if (!delta) continue;

            if (delta.reasoning) safeEnqueue({ type: 'reasoning', text: delta.reasoning });
            if (delta.content) safeEnqueue({ type: 'content', text: delta.content });
          }
        }

        safeEnqueue({ type: 'done' });
      } catch (error) {
        console.error('AI Chat stream interrupted:', error);
        safeEnqueue({ type: 'error', text: 'AI 串流中斷，請稍後再試。' });
      } finally {
        try {
          controller.close();
        } catch {
          // 已關閉。
        }
        reader.releaseLock();
      }
    },
    cancel() {
      // 前端中止連線時，同步中止對上游的請求。
      upstreamController.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // 提示中間層（如 nginx）不要緩衝 SSE；Cloudflare Workers 會忽略未知標頭。
      'X-Accel-Buffering': 'no',
    },
  });
}
