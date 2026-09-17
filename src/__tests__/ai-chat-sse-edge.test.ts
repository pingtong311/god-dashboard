/** @jest-environment node */

/**
 * ai-chat SSE 邊界情況測試（QA 補充）
 *
 * 目的：證明上游 SSE 的各種異常狀況，都不會讓使用者看到崩潰或卡在載入中。
 * 涵蓋：
 *   E1. 同一個 JSON 行被 TCP 分段切斷（跨兩次 read 抵達）
 *   E2. 無法解析的畸形 JSON 行（應被跳過，不中斷串流）
 *   E3. 上游缺少 `data: [DONE]` 結尾（模型提前結束）
 *   E4. 串流中途斷線（reader.read() 拋錯）
 *   E5. 上游回傳非 SSE 的 HTML 錯誤頁（非 2xx）
 *   E6. 上游 2xx 但沒有 body
 *   E7. 上游 2xx 但內容根本不是 SSE（純文字）
 *
 * 全程使用 mock 的 fetch，不呼叫真實上游。
 */

import { POST } from '@/app/api/skynet/ai-chat/route';

const ORIGINAL_NIM_KEY = process.env.NVIDIA_NIM_API_KEY;
const ORIGINAL_WRITE_TOKEN = process.env.SKYNET_DASHBOARD_API_TOKEN;
const ORIGINAL_ALT_TOKEN = process.env.SKYNET_API_WRITE_TOKEN;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/skynet/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-host': 'localhost',
      origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  });
}

/** 以「多次 enqueue」的方式模擬分段抵達的上游串流。 */
function chunkedStream(chunks: string[], opts?: { errorAfter?: Error }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      if (opts?.errorAfter) controller.error(opts.errorAfter);
      else controller.close();
    },
  });
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ai-chat SSE 邊界情況', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.NVIDIA_NIM_API_KEY = 'test-key';
    delete process.env.SKYNET_DASHBOARD_API_TOKEN;
    delete process.env.SKYNET_API_WRITE_TOKEN;
  });

  afterAll(() => {
    if (ORIGINAL_NIM_KEY === undefined) delete process.env.NVIDIA_NIM_API_KEY;
    else process.env.NVIDIA_NIM_API_KEY = ORIGINAL_NIM_KEY;
    if (ORIGINAL_WRITE_TOKEN === undefined) delete process.env.SKYNET_DASHBOARD_API_TOKEN;
    else process.env.SKYNET_DASHBOARD_API_TOKEN = ORIGINAL_WRITE_TOKEN;
    if (ORIGINAL_ALT_TOKEN === undefined) delete process.env.SKYNET_API_WRITE_TOKEN;
    else process.env.SKYNET_API_WRITE_TOKEN = ORIGINAL_ALT_TOKEN;
  });

  it('E1 單行 JSON 被切成兩段抵達時仍能正確拼接', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        chunkedStream([
          'data: {"choices":[{"delta":{"content":"hel',
          'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        ])
      )
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    const text = await res.text();

    expect(text).toContain('"text":"hello"');
    expect(text).toContain('"text":" world"');
    expect(text).toContain('"type":"done"');
  });

  it('E2 畸形 JSON 行被跳過，不影響後續內容與收尾', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        chunkedStream([
          'data: {this is not json}\n\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      )
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    const text = await res.text();

    expect(text).toContain('"text":"ok"');
    expect(text).toContain('"type":"done"');
    expect(text).not.toContain('this is not json');
  });

  it('E3 上游缺少 [DONE] 結尾時仍會補上 done 事件', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        chunkedStream(['data: {"choices":[{"delta":{"content":"end early"}}]}\n\n'])
      )
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    const text = await res.text();

    expect(text).toContain('"text":"end early"');
    expect(text).toContain('"type":"done"');
  });

  it('E4 串流中途斷線時送出 error 事件並正常關閉（不崩潰）', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        chunkedStream(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'], {
          errorAfter: new Error('connection reset by peer'),
        })
      )
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(text).toContain('"type":"error"');
    // 不應外洩上游的原始錯誤字串
    expect(text).not.toContain('connection reset by peer');
  });

  it('E5 上游回傳 HTML 錯誤頁（非 2xx）時以 502 JSON 回應，不外洩 HTML', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>502 Bad Gateway from nginx</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));

    expect(res.status).toBe(502);
    const data = (await res.json()) as { error?: string; status?: number };
    expect(data).toEqual({ error: 'upstream_error', status: 502 });
  });

  it('E6 上游 2xx 但沒有 body 時以 502 回應', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));

    expect(res.status).toBe(502);
  });

  it('E7 上游 2xx 但內容非 SSE 時不會崩潰，仍以 done 收尾', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(chunkedStream(['this is just plain text, not SSE at all']))
    );

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(text).toContain('"type":"done"');
    expect(text).not.toContain('plain text');
  });
});
