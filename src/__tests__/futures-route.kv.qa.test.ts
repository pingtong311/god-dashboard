/** @jest-environment node */

/**
 * QA 獨立驗證（第二輪）— /api/skynet/futures 的「KV 三層快取」未提交增量。
 *
 * 驗證範圍（對應未提交 diff：KV 綁定 + currentTradeDate + writeKv + responseHeaders(dataKind)）：
 *   1. KV 命中條件（date === currentTradeDate()）與寫入端格式一致（皆 YYYY-MM-DD）——
 *      修復前寫入端存 nearest.Date（YYYYMMDD）導致 KV 層為死碼；現以此為回歸守衛
 *   2. KV 讀取拋錯 → 不阻塞主流程（catch 兜底）
 *   3. KV 寫入：expirationTtl=1800 且 payload 為精簡物件（非 806KB 原表）
 *   4. KV 未綁定（getCloudflareContext 回傳空 env）→ 一切正常
 *   5. 失敗契約：200 + { ok:false }（非 502）—— 覆蓋舊測試檔的過時斷言
 *   6. in-memory 命中 → X-Skynet-Data-Source: taifex-openapi-cache 且不再打上游
 *   7. X-Skynet-Trade-Date 純 ASCII（CJK 會觸發 ByteString TypeError → 500）
 *   8. change / changePercent 哨兵值 → null（前端 '--' 顯示的前提）
 *
 * 全程 mock globalThis.fetch 與 @opennextjs/cloudflare，不打真實 TAIFEX；不打真實 KV。
 */

import { NextRequest } from 'next/server';

// ⚠ @opennextjs/cloudflare 為 ESM-only，Jest（CJS）無法直接載入 → 以 mock 模組取代。
// 用「委派到 module-scope 的 jest.fn」寫法：freshGet() 會用 jest.isolateModules 重新
// require route，mock 工廠會被重跑；若在工廠內新建 jest.fn，會與測試中操作的實例不同，
// 委派可確保所有 registry 共用同一個 mock 實例（測試才有鑑別力）。
const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

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

/** 今天（UTC）'YYYYMMDD'——上游 nearest.Date 的原始格式（route 內部再正規化為 YYYY-MM-DD）。 */
function todayYmd(): string {
  return todayDashed().replace(/-/g, '');
}

/** 塞入假 KV 綁定（透過 getCloudflareContext 的 env），回傳 get/put 供斷言。 */
function installKv(stored: unknown | null, getThrows = false) {
  const put = jest.fn(async () => undefined);
  const get = jest.fn(async () => {
    if (getThrows) throw new Error('KV unavailable');
    return stored;
  });
  mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: { get, put } } });
  return { get, put };
}

/** 模擬「KV 未綁定」：getCloudflareContext 回傳空 env（env.SKYNET_CACHE 缺席）。 */
function clearKv() {
  mockGetCloudflareContext.mockResolvedValue({ env: {} });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  clearKv();
  jest.restoreAllMocks();
});

describe('KV 快取層（未提交增量）', () => {
  it('KV 命中：寫入端 date 為 YYYY-MM-DD（與 currentTradeDate() 同格式）→ 同一天寫入後即命中', async () => {
    // 共用一個假 KV store（存「已解析物件」，模擬 kv.get(key, 'json')）。
    const store = new Map<string, unknown>();
    const put = jest.fn(async (key: string, value: string) => {
      store.set(key, JSON.parse(value) as unknown);
    });
    const get = jest.fn(async (key: string) => store.get(key) ?? null);
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: { get, put } } });

    // 第一個 module 實例：上游成功（Last=11111）→ fire-and-forget 寫入 KV。
    const fetch1 = mockFetchOk([
      futRow({ Date: todayYmd(), Last: '11111', Change: '582', '%': '1.23%' }),
    ]);
    const GET1 = freshGet();
    const first = await GET1(makeReq());
    expect((await first.json() as FuturesBody).data?.lastPrice).toBe(11111);
    await new Promise((r) => setTimeout(r, 0)); // 排空 fire-and-forget 的 writeKv
    expect(fetch1).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);

    // 第二個 module 實例（乾淨 in-memory，只能靠 KV）：上游改成「明顯不同」的價格以判別來源。
    const fetch2 = mockFetchOk([
      futRow({ Date: todayYmd(), Last: '48000', Change: '582', '%': '1.23%' }),
    ]);
    const GET2 = freshGet();
    const second = await GET2(makeReq());
    const body = (await second.json()) as FuturesBody;

    // 同一天 → KV 命中：回 KV 的 11111（非上游 48000），header 為 kv-cache，且不回源。
    expect(body.data?.lastPrice).toBe(11111);
    expect(second.headers.get('X-Skynet-Data-Source')).toBe('kv-cache');
    expect(fetch2).not.toHaveBeenCalled();
  });

  it('KV 日期非當天（EOD 語義）→ 不命中，改走上游（不放寬命中條件）', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const stored = {
      ts: Date.now(),
      date: yesterday,
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
    installKv(stored);
    const fetchMock = mockFetchOk([futRow({ Last: '48000', Change: '582', '%': '1.23%' })]);

    const GET = freshGet();
    const res = await GET(makeReq());
    const body = (await res.json()) as FuturesBody;

    // 跨日不串資料：KV 命中失敗 → 走上游新鮮值（EOD 語義不得放寬）。
    expect(body.data?.lastPrice).toBe(48000);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('taifex-openapi-close');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('回歸守衛：寫入 KV 的 date 與 currentTradeDate() 同格式（YYYY-MM-DD），否則命中永不成立', async () => {
    const { put } = installKv(null);
    // 讓上游日期 = 今天（YYYYMMDD），使寫入值可與 currentTradeDate() 直接比對。
    mockFetchOk([futRow({ Date: todayYmd() })]);

    const GET = freshGet();
    await GET(makeReq());
    await new Promise((r) => setTimeout(r, 0)); // writeKv 為 fire-and-forget

    expect(put).toHaveBeenCalledTimes(1);
    const [, value] = put.mock.calls[0] as unknown as [string, string, { expirationTtl: number }];
    const parsed = JSON.parse(value) as { date: string };

    // 格式守衛：必須是 YYYY-MM-DD（與 currentTradeDate() 一致），不得漂移回 YYYYMMDD。
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.date).not.toMatch(/^\d{8}$/);
    // 同一天時，寫入值必須等於命中判斷式所用的 currentTradeDate()。
    expect(parsed.date).toBe(todayDashed());
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

  it('KV 未綁定（getCloudflareContext 回空 env）→ 一切正常，不拋錯', async () => {
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
