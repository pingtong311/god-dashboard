/** @jest-environment node */

/**
 * QA 獨立驗證（第二輪）— /api/skynet/futures 的「KV 三層快取」未提交增量。
 *
 * 驗證範圍（對應未提交 diff：KV 綁定 + currentTradeDate + writeKv + responseHeaders(dataKind)）：
 *   1. KV 命中條件（date === currentTradeDate()）是否與寫入端（pickNearestMonth 的
 *      nearest.Date，YYYYMMDD）格式一致 —— 若不一致，KV 層為死碼
 *   2. KV 讀取拋錯 → 不阻塞主流程（catch 兜底）
 *   3. KV 寫入：expirationTtl=1800 且 payload 為精簡物件（非 806KB 原表）
 *   4. KV 未綁定（globalThis.SKYNET_CACHE undefined）→ 一切正常
 *   5. 失敗契約：200 + { ok:false }（非 502）—— 覆蓋舊測試檔的過時斷言
 *   6. in-memory 命中 → X-Skynet-Data-Source: taifex-openapi-cache 且不再打上游
 *   7. X-Skynet-Trade-Date 純 ASCII（CJK 會觸發 ByteString TypeError → 500）
 *   8. change / changePercent 哨兵值 → null（前端 '--' 顯示的前提）
 *
 * 全程 mock globalThis.fetch，不打真實 TAIFEX；不打真實 KV。
 */

import { NextRequest } from 'next/server';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/futures');
}

/** 一筆 TAIFEX DailyMarketReportFut 紀錄（照抄 shioaji-research 2026-09-18 實測值）。 */
function futRow(over: Record<string, string> = {}): Record<string, string> {
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

/** 記錄呼叫次數的 fetch mock；所有 URL 都回同一份 payload。 */
function mockFetchOk(payload: unknown) {
  const fn = jest.fn(async () => jsonResponse(payload));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** 讓上游必失敗（非 2xx）。 */
function mockFetchFail() {
  const fn = jest.fn(async () => new Response('boom', { status: 503 }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

type Res = { status: number; json: () => Promise<unknown>; headers: Headers };

/** 重新 require route 取得乾淨 module-level 狀態（inflight / cached）。 */
function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/app/api/skynet/futures/route') as {
      GET: (req: NextRequest) => Promise<Res>;
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
    lastPrice: number;
    change: number | null;
    changePercent: number | null;
    sourceLabel: string;
    source: string;
    date: string;
    contract: string;
    fetchedAt?: string;
  };
};

/** 今天（UTC）'YYYY-MM-DD'——route 端 currentTradeDate() 的格式。 */
function todayDashed(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 今天（UTC）'YYYYMMDD'——route 端寫入 KV 的 date 欄格式（nearest.Date）。 */
function todayYmd(): string {
  return todayDashed().replace(/-/g, '');
}

/** 塞入假 KV 綁定，回傳 put 的 jest.fn 供斷言。 */
function installKv(stored: unknown | null, getThrows = false) {
  const put = jest.fn(async () => undefined);
  const get = jest.fn(async () => {
    if (getThrows) throw new Error('KV unavailable');
    return stored;
  });
  (globalThis as unknown as { SKYNET_CACHE?: unknown }).SKYNET_CACHE = { get, put };
  return { get, put };
}

function clearKv() {
  delete (globalThis as unknown as { SKYNET_CACHE?: unknown }).SKYNET_CACHE;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  clearKv();
  jest.restoreAllMocks();
});

describe('KV 快取層（未提交增量）', () => {
  it('【缺陷】KV 命中條件用 currentTradeDate() 的 YYYY-MM-DD 比對寫入端的 YYYYMMDD → KV 永不命中', async () => {
    // 依 writeKv() 的實際行為造一份 KV 內容：date = nearest.Date（YYYYMMDD）
    const stored = {
      ts: Date.now(),
      date: todayYmd(),
      data: {
        name: '台股期近月',
        lastPrice: 11111,
        change: 1,
        changePercent: 0.01,
        sourceLabel: '收盤 09/18',
        source: 'taifex-openapi-close',
        date: '2026-09-18',
        contract: '2026-10',
        fetchedAt: new Date().toISOString(),
      },
    };
    const { get } = installKv(stored);

    // 上游回一個「明顯不同」的價格，用來判別資料來自 KV 還是上游
    const fetchMock = mockFetchOk([futRow({ Last: '48000', Change: '582', '%': '1.23%' })]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(get).toHaveBeenCalled(); // KV 有被讀
    // 若 KV 命中，lastPrice 應為 11111 且 header 為 kv-cache；
    // 實測為上游新鮮值 → 證明 date 格式不符，KV 命中分支不可達。
    expect(body.data?.lastPrice).toBe(48000);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('taifex-openapi-close');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('KV 讀取拋錯 → 不阻塞，仍回 200 + ok:true（走上游）', async () => {
    installKv(null, true);
    const fetchMock = mockFetchOk([futRow()]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.lastPrice).toBe(47418);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('KV 未綁定（globalThis.SKYNET_CACHE undefined）→ 一切正常，不拋錯', async () => {
    clearKv();
    mockFetchOk([futRow()]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.contract).toBe('2026-10');
  });

  it('KV 寫入：expirationTtl=1800，且 payload 為精簡物件（<1KB，絕非 806KB 原表）', async () => {
    const { put } = installKv(null);
    mockFetchOk([futRow()]);

    const GET = freshGet();
    await GET(makeReq());
    // writeKv 是 fire-and-forget（void），讓 microtask 佇列排空
    await new Promise((r) => setTimeout(r, 0));

    expect(put).toHaveBeenCalledTimes(1);
    const [key, value, options] = put.mock.calls[0] as unknown as [string, string, { expirationTtl: number }];
    expect(key).toBe('futures_nearest');
    expect(options).toEqual({ expirationTtl: 1800 });
    expect(value.length).toBeLessThan(1024); // 精簡快照
    const parsed = JSON.parse(value) as { ts: number; date: string; data: { lastPrice: number } };
    expect(parsed.data.lastPrice).toBe(47418);
    expect(typeof parsed.ts).toBe('number');
  });

  it('上游失敗且無快取 → 200 + { ok:false, message:"taifex_unavailable" }（非 502）', async () => {
    clearKv();
    mockFetchFail();

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.message).toBe('taifex_unavailable');
  });
});

describe('in-memory 快取層與 header 契約', () => {
  it('第二次請求走 in-memory → X-Skynet-Data-Source: taifex-openapi-cache，且不再打上游', async () => {
    clearKv();
    const fetchMock = mockFetchOk([futRow()]);

    const GET = freshGet();
    const first = await GET(makeReq());
    const second = await GET(makeReq());

    expect(first.headers.get('X-Skynet-Data-Source')).toBe('taifex-openapi-close');
    expect(second.headers.get('X-Skynet-Data-Source')).toBe('taifex-openapi-cache');
    expect(fetchMock).toHaveBeenCalledTimes(1); // 第二次未回源
    expect((await second.json() as FuturesBody).data?.lastPrice).toBe(47418);
  });

  it('X-Skynet-Trade-Date 為純 ASCII（無 CJK）；中文「收盤」只出現在 body 的 sourceLabel', async () => {
    clearKv();
    mockFetchOk([futRow()]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const headerValue = res.headers.get('X-Skynet-Trade-Date') ?? '';
    const body = (await res.json()) as FuturesBody;

    // 非 ASCII 會讓 Response header 建構拋 ByteString TypeError（route 500）
    expect(/^[\x20-\x7E]*$/.test(headerValue)).toBe(true);
    expect(headerValue).not.toContain('收盤');
    expect(body.data?.sourceLabel).toContain('收盤');
  });

  it('Cache-Control 帶 s-maxage=600（僅標記；middleware 對 /api/skynet/* 另有處置）', async () => {
    clearKv();
    mockFetchOk([futRow()]);

    const GET = freshGet();
    const res = await GET(makeReq());
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=600');
  });
});

describe('挑選規則與空值契約（回歸）', () => {
  it('排除價差列 / 週別 W / 盤後 / 非 TX，取 6 位月中最小者為近月', async () => {
    clearKv();
    mockFetchOk([
      futRow({ 'ContractMonth(Week)': '202610/202611', Last: '99' }),
      futRow({ 'ContractMonth(Week)': '202610W4', Last: '98' }),
      futRow({ 'ContractMonth(Week)': '202610', TradingSession: '盤後', Last: '97' }),
      futRow({ Contract: 'MTX', 'ContractMonth(Week)': '202610', Last: '96' }),
      futRow({ 'ContractMonth(Week)': '202612', Last: '99999' }),
      futRow({ 'ContractMonth(Week)': '202611', Last: '47581' }),
      futRow({ 'ContractMonth(Week)': '202610', Last: '47418', Change: '959', '%': '2.06%' }),
    ]);

    const GET = freshGet();
    const body = (await (await GET(makeReq())).json()) as FuturesBody;

    expect(body.data?.contract).toBe('2026-10'); // 202610 最小
    expect(body.data?.lastPrice).toBe(47418);
    expect(body.data?.date).toBe('2026-09-18');
    expect(body.data?.sourceLabel).toBe('收盤 09/18');
  });

  it('Change / % 為哨兵值 → null（不偽裝 0）；lastPrice 仍為有效值', async () => {
    clearKv();
    mockFetchOk([futRow({ Change: '-', '%': 'NULL' })]);

    const GET = freshGet();
    const body = (await (await GET(makeReq())).json()) as FuturesBody;

    expect(body.ok).toBe(true);
    expect(body.data?.lastPrice).toBe(47418);
    expect(body.data?.change).toBeNull();
    expect(body.data?.changePercent).toBeNull();
  });

  it('Last 為空值（"-"）→ ok:false（不造假收盤價）', async () => {
    clearKv();
    mockFetchOk([futRow({ Last: '-' }), futRow({ 'ContractMonth(Week)': '202611', Last: '-' })]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.message).toBe('taifex_unavailable');
  });

  it('上游回 HTML（200 + text/html）→ res.json() 拋 SyntaxError → ok:false，不 500', async () => {
    clearKv();
    globalThis.fetch = jest.fn(async () =>
      new Response('<!DOCTYPE html><html><body>Swagger UI</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })) as unknown as typeof fetch;

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
  });
});
