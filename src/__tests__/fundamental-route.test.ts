/** @jest-environment node */

/**
 * QA 獨立驗證 — /api/skynet/fundamental（個股基本面/財報，spec §2-A）。
 *
 * 三來源並行降級契約（對應 route.ts 施工規格 + team-lead 裁示「比照 futures inflight+TTL」）：
 *   - 估值欄 peRatio/pbRatio/dividendYield + name ← TWSE BWIBBU_ALL（日更，30min TTL）
 *   - monthlyRevenue(+自算 YoY) ← MOPS t01x302；eps/grossMargin/roe/debtRatio ← MOPS t02bp02
 *   - eps fallback ← FinMind income_statement（僅 MOPS EPS 缺失才呼叫，節流）
 *   - 缺失欄一律 null（不補零），整包至少回一份；全掛且無快取 → 200 + ok:false
 *   - stale-on-error：估值上游掛了但有快取 → 回快取快照 + X-Skynet-Stale: true
 *
 * 全程 mock globalThis.fetch + 控制 Date.now，不打真實 TWSE/MOPS/FinMind。
 * 用 jest.isolateModules 重新 require route，取得乾淨的 module-level cache/inflight。
 */

import { NextRequest } from 'next/server';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(ticker: string): NextRequest {
  return new NextRequest(`http://localhost/api/skynet/fundamental?ticker=${ticker}`);
}

/** 一筆 TWSE BWIBBU 全表紀錄（預設 2330；空字串欄 = 無資料 → null）。 */
function bwRow(over: Record<string, string>): Record<string, string> {
  return {
    Date: '1150921',
    Code: '2330',
    Name: '台積電',
    PERatio: '25.10',
    PBratio: '6.20',
    DividendYield: '1.55',
    ...over,
  };
}

/** 一筆 MOPS t01x302 月營收紀錄。 */
function mopsMonthRow(over: Record<string, string>): Record<string, string> {
  return {
    co_id: '2330',
    co_name: '台積電',
    year: '2025',
    month: '08',
    revenue: '300000',
    ...over,
  };
}

/** 一筆 MOPS t02bp02 季別財報紀錄。 */
function mopsQuarterRow(over: Record<string, string>): Record<string, string> {
  return {
    co_name: '台積電',
    date: '2025-06-30',
    'EPS': '42.5',
    '毛利率': '58.0',
    'ROE': '20.1',
    '負債比': '18.2',
    ...over,
  };
}

/** 一筆 FinMind income_statement 紀錄。 */
function finmindRow(over: Record<string, string>): Record<string, string> {
  return {
    date: '2025-06-30',
    EPS: '41.2',
    ...over,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** MOPS「安全性封鎖頁」陷阱：200 + text/html（route 應轉 null，不崩、不造假）。 */
function htmlBlockResponse(): Response {
  return new Response('FOR SECURITY REASONS, THIS PAGE CAN NOT BE ACCESSED.', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

/** 依 URL 還原不同回應（估值 / 月營收 / 季報 / FinMind 走不同 payload）。 */
type Handler = { match: string; res: () => Response };
function mockFetch(handlers: Handler[]) {
  globalThis.fetch = jest.fn(async (url: string | URL) => {
    const u = String(url);
    const hit = handlers.find((h) => u.includes(h.match));
    // 未命中 → 500（各來源各自降級；不跨來源猜）
    return hit ? hit.res() : new Response('boom', { status: 500 });
  }) as unknown as typeof fetch;
}

/** 重新 require route 模組取得乾淨的 cache/inflight；回傳該實例的 GET。 */
function freshGet() {
  let GET:
    | ((req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>)
    | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/app/api/skynet/fundamental/route') as {
      GET: (req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>;
    };
    GET = mod.GET;
  });
  return GET!;
}

type FundamentalBody = {
  ok?: boolean;
  message?: string;
  data?: {
    ticker: string;
    name: string | null;
    monthlyRevenue: number | null;
    monthlyRevenueYoY: number | null;
    eps: number | null;
    grossMargin: number | null;
    roe: number | null;
    debtRatio: number | null;
    peRatio: number | null;
    pbRatio: number | null;
    dividendYield: number | null;
    asOfDate: string | null;
    fetchedAt: string;
  };
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/fundamental', () => {
  it('三來源皆成功：估值欄取 BWIBBU，財報欄取 MOPS；MOPS 有 EPS 就不打 FinMind', async () => {
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({}), bwRow({ Code: '00878' })]) },
      {
        match: 'ajax_t01x302',
        res: () =>
          jsonResponse([
            mopsMonthRow({ year: '2024', month: '08', revenue: '200000' }), // 去年同月（YoY 分母）
            mopsMonthRow({ year: '2025', month: '08', revenue: '300000' }), // 最新月（YoY 分子）
          ]),
      },
      { match: 'ajax_t02bp02', res: () => jsonResponse([mopsQuarterRow({})]) },
      { match: 'api.finmind.com.tw', res: () => jsonResponse([finmindRow({})]) },
    ]);

    const GET = freshGet();
    const res = await GET(makeReq('2330'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(true);
    expect(body.data?.ticker).toBe('2330');
    expect(body.data?.name).toBe('台積電');
    expect(body.data?.peRatio).toBe(25.1);
    expect(body.data?.pbRatio).toBe(6.2);
    expect(body.data?.dividendYield).toBe(1.55);
    expect(body.data?.monthlyRevenue).toBe(300000);
    // 自算 YoY：(300000-200000)/200000*100 = 50
    expect(body.data?.monthlyRevenueYoY).toBe(50);
    expect(body.data?.eps).toBe(42.5);
    expect(body.data?.grossMargin).toBe(58);
    expect(body.data?.roe).toBe(20.1);
    expect(body.data?.debtRatio).toBe(18.2);
    // MOPS 有 EPS → FinMind 不應被呼叫（節流）
    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('api.finmind'))).toBe(false);
  });

  it('MOPS 被封鎖（200+HTML）：財報欄全 null，EPS 走 FinMind fallback；估值欄不受影響', async () => {
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({})]) },
      { match: 'ajax_t01x302', res: htmlBlockResponse },
      { match: 'ajax_t02bp02', res: htmlBlockResponse },
      { match: 'api.finmind.com.tw', res: () => jsonResponse([finmindRow({})]) },
    ]);

    const GET = freshGet();
    const res = await GET(makeReq('2330'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(true);
    // 估值欄仍在（BWIBBU 成功）
    expect(body.data?.peRatio).toBe(25.1);
    // 財報欄 MOPS 失敗 → null（月營收）；EPS 由 FinMind 補上 41.2
    expect(body.data?.monthlyRevenue).toBeNull();
    expect(body.data?.monthlyRevenueYoY).toBeNull();
    expect(body.data?.grossMargin).toBeNull();
    expect(body.data?.roe).toBeNull();
    expect(body.data?.debtRatio).toBeNull();
    expect(body.data?.eps).toBe(41.2);
    // FinMind 被呼叫（MOPS EPS 缺失才走 fallback）
    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('api.finmind'))).toBe(true);
  });

  it('BWIBBU 估值欄空字串 → 該欄 null（不偽裝 0）', async () => {
    mockFetch([
      {
        match: 'openapi.twse.com.tw',
        res: () => jsonResponse([bwRow({ PERatio: '', PBratio: '', DividendYield: '3.31' })]),
      },
      { match: 'ajax_t01x302', res: () => jsonResponse([mopsMonthRow({})]) },
      { match: 'ajax_t02bp02', res: () => jsonResponse([mopsQuarterRow({})]) },
    ]);

    const GET = freshGet();
    const res = await GET(makeReq('2330'));
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(true);
    expect(body.data?.peRatio).toBeNull();
    expect(body.data?.pbRatio).toBeNull();
    expect(body.data?.dividendYield).toBe(3.31); // 只有這欄有值
  });

  it('全來源皆掛 + 無快取 → 200 + ok:false + fundamental_unavailable（不 5xx）', async () => {
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => new Response('down', { status: 503 }) },
      { match: 'ajax_t01x302', res: () => new Response('down', { status: 500 }) },
      { match: 'ajax_t02bp02', res: () => new Response('down', { status: 500 }) },
      { match: 'api.finmind.com.tw', res: () => new Response('rate limited', { status: 429 }) },
    ]);

    const GET = freshGet();
    const res = await GET(makeReq('2330'));
    expect(res.status).toBe(200); // 冷啟動全掛不 5xx，前端逐欄「未入庫」
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('fundamental_unavailable');
  });

  it('查無代號（BWIBBU 無此 ticker）+ 財報全掛 → ok:false（不補腦）', async () => {
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({ Code: '00878' })]) }, // 無 2330
      { match: 'ajax_t01x302', res: () => jsonResponse([]) },
      { match: 'ajax_t02bp02', res: () => jsonResponse([]) },
      { match: 'api.finmind.com.tw', res: () => jsonResponse([]) },
    ]);

    const GET = freshGet();
    const res = await GET(makeReq('2330'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('fundamental_unavailable');
  });

  it('非法 ticker → 200 + ok:false + invalid_ticker（不打下游）', async () => {
    mockFetch([{ match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({})]) }]);
    const GET = freshGet();
    const res = await GET(new NextRequest('http://localhost/api/skynet/fundamental?ticker=abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('invalid_ticker');
    // 未打下游
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('stale-on-error：先成功填快取，過 30min 後上游全掛 → 回快取快照 + X-Skynet-Stale', async () => {
    const GET = freshGet();

    // 第一步：全來源成功，填 module-level 快取（valuation ts=T0）
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({})]) },
      { match: 'ajax_t01x302', res: () => jsonResponse([mopsMonthRow({})]) },
      { match: 'ajax_t02bp02', res: () => jsonResponse([mopsQuarterRow({})]) },
    ]);
    await GET(makeReq('2330'));

    // 第二步：把時鐘推過 30min 估值 TTL（fetchValuation 會重新抓取並失敗）；財報 24h TTL 內仍命中快取
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000);
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => new Response('down', { status: 503 }) },
      { match: 'ajax_t01x302', res: () => jsonResponse([mopsMonthRow({})]) },
      { match: 'ajax_t02bp02', res: () => jsonResponse([mopsQuarterRow({})]) },
    ]);

    const res = await GET(makeReq('2330'));
    expect(res.status).toBe(200); // 降級成 200（非 502）
    const body = (await res.json()) as FundamentalBody;
    expect(body.ok).toBe(true);
    // 估值欄由 30min TTL 過期後的快取快照補回（stale-on-error）
    expect(body.data?.peRatio).toBe(25.1);
    expect(body.data?.pbRatio).toBe(6.2);
    expect(res.headers.get('X-Skynet-Stale')).toBe('true');
  });

  it('成功時不打已除役來源；三來源 URL 精確（不跨源猜）', async () => {
    mockFetch([
      { match: 'openapi.twse.com.tw', res: () => jsonResponse([bwRow({})]) },
      { match: 'ajax_t01x302', res: () => jsonResponse([mopsMonthRow({})]) },
      { match: 'ajax_t02bp02', res: () => jsonResponse([mopsQuarterRow({})]) },
    ]);

    const GET = freshGet();
    await GET(makeReq('2330'));

    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL'))).toBe(true);
    expect(calls.some((u) => u.includes('ajax_t01x302'))).toBe(true);
    expect(calls.some((u) => u.includes('ajax_t02bp02'))).toBe(true);
  });
});
