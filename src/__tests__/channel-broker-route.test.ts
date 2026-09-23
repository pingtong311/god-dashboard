/** @jest-environment node */

/**
 * QA 獨立驗證 — /api/skynet/channel-broker（TPEX 上櫃券商分點營業金額彙總，spec §2-D「B3」）。
 *
 * 重點驗證（對應 route.ts 施工規格 + team-lead 裁示「照抄 futures inflight+TTL」）：
 *   - 成功路徑：TPEX 回 JSON array → ok:true + topBrokers 依 tradingAmount 降序 + note 誠實
 *     （「僅分點營業金額彙總，非逐股分點買賣」）+ asOfDate ROC→AD 轉換
 *   - 上游 500 → 200 + ok:false（tpex_broker_unavailable，不 5xx）+ 失敗不寫 cache
 *   - 上游回 HTML（阻擋頁，200 + text/html）→ content-type 主動擋 + Array.isArray 斷言 → ok:false
 *   - TTL 命中：同 key 第二次不打上游（cache 命中，fetch 總呼叫數不變）
 *   - 全 null 結果不寫 cache：TPEX 回全哨兵值 → ok:true + hasBrokerActivity:false；
 *     後續真實資料仍能重新抓取（不被全 null 快取污染鎖死）
 *
 * 全程 mock globalThis.fetch，不真打 TPEX。用 jest.isolateModules 重新 require route，
 * 取得乾淨的 module-level inflight / cached。
 */

import { NextRequest } from 'next/server';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(ticker?: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/skynet/channel-broker${ticker ? `?ticker=${ticker}` : ''}`,
  );
}

/** 一筆 TPEX tpex_daily_broker1 紀錄（預設值照抄 2026-09-22 實測；ROC 115 = AD 2026）。 */
function brokerRow(over: Record<string, string>): Record<string, string> {
  return {
    Date: '1150922',
    Ranking: '1',
    Code: '9887',
    Name: '元大總公司',
    TradingAmount: '42393911',
    DayClosingRatio: '7.37%',
    ...over,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** TPEX「阻擋頁」陷阱：200 + text/html（route 應轉 null，不崩、不造假）。 */
function htmlBlockResponse(): Response {
  return new Response('<html>FOR SECURITY REASONS</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

/** 依 URL 還原回應（單一 TPEX 來源；未命中 → 500）。 */
function mockFetch(res: () => Response) {
  globalThis.fetch = jest.fn(async (_url: string | URL, _init?: unknown) => res()) as unknown as typeof fetch;
}

/** 重新 require route 模組取得乾淨的 inflight / cached；回傳該實例的 GET。 */
function freshGet() {
  let GET:
    | ((req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>)
    | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/app/api/skynet/channel-broker/route') as {
      GET: (req: NextRequest) => Promise<{ status: number; json: () => Promise<unknown>; headers: Headers }>;
    };
    GET = mod.GET;
  });
  return GET!;
}

type Body = {
  ok?: boolean;
  message?: string;
  data?: {
    hasBrokerActivity: boolean;
    source: string | null;
    asOfDate: string | null;
    topBrokers: Array<{
      code: string;
      name: string;
      tradingAmount: number | null;
      dayClosingRatio: string | null;
    }>;
    note: string;
  };
};

function fetchCalls(): string[] {
  return (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/channel-broker', () => {
  it('成功路徑：topBrokers 依 tradingAmount 降序、null 沉底、note 誠實 + asOfDate ROC→AD', async () => {
    mockFetch(() =>
      jsonResponse([
        brokerRow({ Ranking: '3', Code: 'C', Name: '小分點', TradingAmount: '100', DayClosingRatio: '0.01%' }),
        brokerRow({ Ranking: '1', Code: 'A', Name: '大分點', TradingAmount: '300', DayClosingRatio: '0.05%' }),
        brokerRow({ Ranking: '2', Code: 'B', Name: '中分點', TradingAmount: '200', DayClosingRatio: '0.03%' }),
      ]),
    );

    const GET = freshGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.ok).toBe(true);
    expect(body.data?.hasBrokerActivity).toBe(true);
    expect(body.data?.source).toBe('TPEX tpex_daily_broker1');
    // ROC 1150922 → AD 2026-09-22
    expect(body.data?.asOfDate).toBe('2026-09-22');
    // 誠實註記（固定文案）
    expect(body.data?.note).toBe('僅分點營業金額彙總，非逐股分點買賣');
    // 依 tradingAmount 降序：300 / 200 / 100
    expect(body.data?.topBrokers.map((r) => r.tradingAmount)).toEqual([300, 200, 100]);
    expect(body.data?.topBrokers.map((r) => r.code)).toEqual(['A', 'B', 'C']);
    expect(body.data?.topBrokers[0].dayClosingRatio).toBe('0.05%');
  });

  it('上游 500 → 200 + ok:false（不 5xx）+ 未寫 cache（恢復後能重抓）', async () => {
    const GET = freshGet();

    // 第一步：500 → 冷啟動失敗，無快取可降級
    mockFetch(() => new Response('upstream down', { status: 500 }));
    const res = await GET(makeReq());
    expect(res.status).toBe(200); // route.ts：一律 200 不 5xx
    const body = (await res.json()) as Body;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('tpex_broker_unavailable');
    expect(res.headers.get('X-Skynet-Stale')).toBeNull();

    // 第二步：恢復成功 → 能重新抓到真資料（證明失敗結果未被寫進 cache 污染）
    mockFetch(() => jsonResponse([brokerRow({})]));
    const res2 = await GET(makeReq());
    const body2 = (await res2.json()) as Body;
    expect(body2.ok).toBe(true);
    expect(body2.data?.hasBrokerActivity).toBe(true);
  });

  it('上游回 HTML 阻擋頁（200 + text/html）→ 主動擋 + ok:false（不造假分點資料）', async () => {
    const GET = freshGet();
    mockFetch(htmlBlockResponse);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.ok).toBe(false);
    expect(body.message).toBe('tpex_broker_unavailable');
  });

  it('TTL 命中：同 key 第二次不打上游（fetch 總呼叫數不變）', async () => {
    const GET = freshGet();
    mockFetch(() => jsonResponse([brokerRow({})]));

    await GET(makeReq()); // 第一次：抓上游，填 in-memory cache
    const callsAfterFirst = fetchCalls().length;
    expect(callsAfterFirst).toBe(1);

    const res2 = await GET(makeReq()); // 第二次：TTL 內命中 cache，不抓上游
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as Body;
    expect(body.ok).toBe(true);
    expect(body.data?.hasBrokerActivity).toBe(true);
    // 上游呼叫總數仍為 1（第二次純 cache 命中，零 fetch）
    expect(fetchCalls().length).toBe(callsAfterFirst);
  });

  it('全 null 結果不寫 cache：全哨兵值 → ok:true + hasBrokerActivity:false；後續真資料仍能重抓', async () => {
    const GET = freshGet();

    // 第一步：TPEX 回全哨兵值（TradingAmount 皆 '-'）→ 誠實 hasBrokerActivity:false，不寫 cache
    mockFetch(() =>
      jsonResponse([
        brokerRow({ Code: 'A', TradingAmount: '-', DayClosingRatio: '-' }),
        brokerRow({ Code: 'B', TradingAmount: 'NULL', DayClosingRatio: 'nan' }),
      ]),
    );
    const res1 = await GET(makeReq());
    const body1 = (await res1.json()) as Body;
    expect(body1.ok).toBe(true); // 有效抓取，只是無活躍分點
    expect(body1.data?.hasBrokerActivity).toBe(false);
    expect(body1.data?.topBrokers).toEqual([]);
    expect(body1.data?.source).toBeNull(); // 無有效資料，source 標 null（誠實）

    // 第二步：TPEX 這次回真資料 → 若全 null 有被寫進 cache，第二步會在 30min TTL 內
    // 命中全 null 快照而不再重抓，hasBrokerActivity 會停在 false。
    // 故「第二步拿到 hasBrokerActivity:true + 真數字」即證明全 null 結果未寫 cache。
    mockFetch(() => jsonResponse([brokerRow({})]));
    const res2 = await GET(makeReq());
    const body2 = (await res2.json()) as Body;
    expect(body2.ok).toBe(true);
    expect(body2.data?.hasBrokerActivity).toBe(true);
    expect(body2.data?.topBrokers[0].tradingAmount).toBe(42393911);
  });
});
