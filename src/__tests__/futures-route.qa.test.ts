/** @jest-environment node */

/**
 * QA 獨立驗證 — /api/skynet/futures（台指期 TX 近月收盤，TAIFEX OpenAPI 單源 + in-memory 快取）。
 *
 * 重點驗證（對應 #67 施工規格 + team-lead 裁示）：
 *   - 近月判定：Contract === 'TX' + 6 位月（排價差列含 '/'）+ 非 W 週別 + 一般時段，
 *     取 ContractMonth(Week) 最小者
 *   - 排除「盤後」時段列（取錯會拿到夜盤價）
 *   - Change / % 哨兵值（'-' / 'NULL' / ''）轉 null，不偽裝 0（避免顯示成平盤）
 *   - Last 空值 → ok:false（不造假收盤價）
 *   - 上游失敗 + 無快取 → 200 + ok:false（taifex_unavailable，避開 5xx 的 UI 炸彈）
 *   - 上游失敗 + 有已過期快取 → stale-on-error：回前一日收盤 + X-Skynet-Stale: true
 *   - 上游成功 → 只打 TAIFEX OpenAPI 單一 URL（route 已除役 taiex.com.tw 備源）
 *
 * 全程 mock globalThis.fetch + 控制 Date.now，不打真實 TAIFEX。
 * 用 jest.isolateModules 重新 require route，取得乾淨的 module-level dailyCache。
 */

import { NextRequest } from 'next/server';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/futures');
}

/** 一筆 TAIFEX DailyMarketReportFut 紀錄（預設值照抄研究員 2026-09-18 實測）。 */
function futRow(over: Record<string, string>): Record<string, string> {
  return {
    Date: '20260918',
    Contract: 'TX',
    'ContractMonth(Week)': '202610',
    Open: '47080',
    High: '47464',
    Low: '46897',
    Last: '47418',
    Change: '959',
    '%': '2.06%',
    Volume: '44655',
    SettlementPrice: '47428',
    OpenInterest: '101893',
    TradingSession: '一般',
    ...over,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 依 URL 還原不同回應（主源 / 備源走不同 payload）。 */
function mockFetchByHost(handlers: Array<{ match: string; res: () => Response }>) {
  globalThis.fetch = jest.fn(async (url: string | URL) => {
    const u = String(url);
    const hit = handlers.find((h) => u.includes(h.match));
    return hit ? hit.res() : jsonResponse([], 500);
  }) as unknown as typeof fetch;
}

/** 重新 require route 模組取得乾淨的 dailyCache；回傳該實例的 GET。 */
function freshGet() {
  let GET: ((req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/app/api/skynet/futures/route') as {
      GET: (req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>;
    };
    GET = mod.GET;
  });
  return GET!;
}

type FuturesBody = {
  ok?: boolean;
  message?: string;
  data?: {
    name: string;
    lastPrice: number | null;
    change: number | null;
    changePercent: number | null;
    sourceLabel: string;
    source: string;
    date: string;
    contract: string;
  };
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/futures', () => {
  it('近月取「TX + 6 位月 + 非 W + 一般時段」最小者；排價差列 / 週別 / 盤後 / 其他商品', async () => {
    const rows = [
      futRow({ 'ContractMonth(Week)': '202610/202611', Last: '99', Change: '99', '%': '99%' }), // 價差列（含 /）→ 排除
      futRow({ 'ContractMonth(Week)': '202609W4', Last: '98' }), // 週別（W 尾）→ 排除
      futRow({ 'ContractMonth(Week)': '202610', TradingSession: '盤後', Last: '97' }), // 盤後 → 排除
      futRow({ Contract: 'MTX', 'ContractMonth(Week)': '202610', Last: '96' }), // 小型臺指 → 排除
      futRow({ 'ContractMonth(Week)': '202611', Last: '47581', Change: '120', '%': '0.25%' }), // 次月
      futRow({ 'ContractMonth(Week)': '202610', Last: '47418', Change: '959', '%': '2.06%' }), // ← 近月（最小）
    ];
    mockFetchByHost([{ match: 'openapi.taifex', res: () => jsonResponse(rows) }]);

    const GET = freshGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as FuturesBody;
    expect(body.ok).toBe(true);
    expect(body.data?.lastPrice).toBe(47418);
    expect(body.data?.contract).toBe('2026-10');
    expect(body.data?.sourceLabel).toBe('收盤 09/18');
    expect(body.data?.change).toBe(959);
    expect(body.data?.changePercent).toBe(2.06);
  });

  it('Change / % 為哨兵值（"-"）→ null，不偽裝 0', async () => {
    const rows = [futRow({ Change: '-', '%': '-' })];
    mockFetchByHost([{ match: 'openapi.taifex', res: () => jsonResponse(rows) }]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;
    expect(body.ok).toBe(true);
    expect(body.data?.lastPrice).toBe(47418); // Last 正常
    expect(body.data?.change).toBeNull();
    expect(body.data?.changePercent).toBeNull();
    // sourceLabel 仍依 Date 顯示
    expect(body.data?.sourceLabel).toBe('收盤 09/18');
  });

  it('Last 為空值（"-"）→ ok:false（不造假收盤價）', async () => {
    const rows = [
      futRow({ 'ContractMonth(Week)': '202610', Last: '-' }),
      futRow({ 'ContractMonth(Week)': '202611', Last: '-' }),
    ];
    mockFetchByHost([{ match: 'openapi.taifex', res: () => jsonResponse(rows) }]);

    const GET = freshGet();
    const res = await GET(makeReq());
    // 無快取可降級 → 回 200 + ok:false（team-lead 裁示：避開 502 的 UI 炸彈，前端 allSettled 顯示 '--'）
    expect(res.status).toBe(200);
    const body = (await res.json()) as FuturesBody;
    expect(body.ok).toBe(false);
  });

  it('上游失敗 + 無快取 → 200 + ok:false + taifex_unavailable', async () => {
    mockFetchByHost([{ match: 'openapi.taifex', res: () => new Response('boom', { status: 500 }) }]);

    const GET = freshGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(200); // route.ts L344-348：冷啟動首次失敗不 5xx，前端顯示 '--'
    const body = (await res.json()) as FuturesBody;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('taifex_unavailable');
  });

  it('上游失敗 + 有已過期快取 → stale-on-error：回前一日收盤 + X-Skynet-Stale', async () => {
    // 第一步：上游成功，填入 dailyCache
    const GET = freshGet();
    mockFetchByHost([{ match: 'openapi.taifex', res: () => jsonResponse([futRow({})]) }]);
    await GET(makeReq());

    // 第二步：把快取時間推過 TTL（1 小時），再讓上游失敗
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);
    mockFetchByHost([{ match: 'openapi.taifex', res: () => new Response('down', { status: 503 }) }]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200); // 降級成 200（非 502），帶 stale 標記
    const body = (await res.json()) as FuturesBody;
    expect(body.ok).toBe(true);
    expect(body.data?.lastPrice).toBe(47418);
    expect(res.headers.get('X-Skynet-Stale')).toBe('true');
  });

  it('上游成功 → 只打 TAIFEX URL（不含已除役的 taiex 備源）', async () => {
    mockFetchByHost([{ match: 'openapi.taifex', res: () => jsonResponse([futRow({})]) }]);

    const GET = freshGet();
    await GET(makeReq());

    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('openapi.taifex'))).toBe(true);
    // route.ts 已單源，絕不會再打 taiex.com.tw
    expect(calls.some((u) => u.includes('taiex'))).toBe(false);
  });
});
