/** @jest-environment node */

/**
 * QA 獨立驗證 — /api/skynet/channel（券商分點資料狀態 flag，spec §2-B）。
 *
 * 契約（誠實骨架，複刻 B 路定案）：
 *   - GET ?ticker=2330 → 200 + { ok: true, data: { hasChannelData, source, asOfDate } }
 *   - 現況無免費分點資料源（券商分點逐筆 = FinMind Sponsor-only 付費）：
 *     hasChannelData 恆 false、source/asOfDate 恆 null（不補零、不造假分點數字）
 *   - route 不打任何上游（不引入付費來源）：fetch 呼叫數必須為 0
 *   - 回 ok:true（骨架可用），不 5xx
 *   - 非法/缺 ticker → 200 + { ok: false, message: 'invalid_ticker' }（誠實骨架不下游）
 *
 * 用 jest.isolateModules 重新 require route，取得乾淨的 module-level inflight/cache。
 */

import { NextRequest } from 'next/server';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(urlPath: string): NextRequest {
  return new NextRequest(`http://localhost${urlPath}`);
}

type ChannelBody = {
  ok?: boolean;
  message?: string;
  data?: {
    hasChannelData: boolean;
    source?: string | null;
    asOfDate?: string | null;
  };
};

/** 重新 require route 模組取得乾淨的 inflight/cache 實例；回傳該實例的 GET。 */
function freshGet() {
  let GET:
    | ((req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>)
    | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/app/api/skynet/channel/route') as {
      GET: (req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>;
    };
    GET = mod.GET;
  });
  return GET!;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/channel', () => {
  it('誠實骨架：200 + ok:true + hasChannelData:false + source:null + asOfDate:null', async () => {
    // route 現況不打任何上游：fetch 全程不該被呼叫（不引入付費來源）
    globalThis.fetch = jest.fn(async () => new Response('should_not_be_called', { status: 500 })) as unknown as typeof fetch;

    const GET = freshGet();
    const res = await GET(makeReq('/api/skynet/channel?ticker=2330'));

    expect(res.status).toBe(200); // 不 5xx
    const body = (await res.json()) as ChannelBody;
    expect(body.ok).toBe(true); // 骨架可用（誠實的無資料 ≠ 上游故障）
    expect(body.data?.hasChannelData).toBe(false); // 現況永遠 false（無免費分點資料源）
    expect(body.data?.source).toBeNull(); // 缺失一律 null，不補零
    expect(body.data?.asOfDate).toBeNull();
    // 未打任何上游（FinMind Sponsor 付費來源未接）
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('回傳 header 標註 flag 狀態（X-Skynet-Channel-Data: false，純 ASCII）', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const GET = freshGet();
    const res = await GET(makeReq('/api/skynet/channel?ticker=2330'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Skynet-Channel-Data')).toBe('false');
  });

  it('同 ticker 併發請求都回同一契約（inflight 結構穩定，不 5xx）', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const GET = freshGet();
    const [a, b] = await Promise.all([
      GET(makeReq('/api/skynet/channel?ticker=2330')),
      GET(makeReq('/api/skynet/channel?ticker=2330')),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const bodyA = (await a.json()) as ChannelBody;
    const bodyB = (await b.json()) as ChannelBody;
    expect(bodyA.ok).toBe(true);
    expect(bodyB.ok).toBe(true);
    expect(bodyA.data?.hasChannelData).toBe(false);
    expect(bodyB.data?.hasChannelData).toBe(false);
  });

  it('缺 ticker → 200 + ok:false + invalid_ticker（誠實骨架不下游、不 5xx）', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const GET = freshGet();
    const res = await GET(makeReq('/api/skynet/channel'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChannelBody;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('invalid_ticker');
  });

  it('非法 ticker（abc / 空字串）→ 200 + ok:false + invalid_ticker，未打下游', async () => {
    globalThis.fetch = jest.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const GET = freshGet();
    for (const query of ['ticker=abc', 'ticker=', 'ticker=1234567']) {
      const res = await GET(makeReq(`/api/skynet/channel?${query}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as ChannelBody;
      expect(body.ok).toBe(false);
      expect(body.message).toBe('invalid_ticker');
    }
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });
});
