/** @jest-environment node */

/**
 * /api/skynet/market-bars —— 路由行為測試（第一層 QA）。
 *
 * 重點：
 *   - KV 未綁定 → read / status 回 ready:false 的誠實訊息，**不拋錯**
 *   - ingest 需權杖（allowSameOrigin:false）；無權杖 → 403
 *   - ingest 非交易日（週六）→ stored:false + reason，且**不打上游**（不假裝成功）
 *   - ingest 單日成功 → 寫入 KV（key mkt:bars:<date>、TTL 180 天）
 *   - ingest 區間超過 40 天 → 400 range_too_large
 *   - ingest 區間交易日超過 subrequest 預算 → 400 subrequest_budget_exceeded
 *   - read 誠實回報 available / missing
 *   - status 列出已累積日期
 *   - 未知 action → 400
 *
 * 全程 mock @opennextjs/cloudflare 與 globalThis.fetch；不打真實上游、不打真實 KV。
 */

import { NextRequest } from 'next/server';

// @opennextjs/cloudflare 為 ESM-only，Jest（CJS）無法直接載入 → 以 mock 模組取代。
const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_TOKEN = process.env.SKYNET_DASHBOARD_API_TOKEN;

type Res = { status: number; json: () => Promise<unknown>; headers: Headers };
type RouteModule = { GET: (req: NextRequest) => Promise<Res> };

/** 取得乾淨的 route 模組（重跑 module-level 狀態與 rate bucket）。 */
function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/market-bars/route') as RouteModule;
    GET = mod.GET;
  });
  return GET!;
}

/** Map 實作的假 KV（get / put / list）。 */
function makeKvStore() {
  const map = new Map<string, string>();
  return {
    map,
    kv: {
      get: jest.fn(async (key: string) => map.get(key) ?? null),
      put: jest.fn(async (key: string, value: string) => {
        map.set(key, value);
      }),
      list: jest.fn(async (options?: { prefix?: string }) => {
        const prefix = options?.prefix ?? '';
        return {
          keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
          list_complete: true,
        };
      }),
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** mock 上游：TWSE MI_INDEX + TPEX otc。 */
function mockUpstream() {
  const fn = jest.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('twse.com.tw') && u.includes('MI_INDEX')) {
      return jsonResponse({
        stat: 'OK',
        date: '20260924',
        tables: [
          { title: '115年09月24日 價格指數', fields: [], data: [['x']] },
          {
            title: '115年09月24日 每日收盤行情(全部)',
            fields: [],
            data: [
              ['2330', '台積電', '30,000,000', '1', '2', '1000', '1010', '990', '1005', '<p>+</p>', '5'],
              ['00625K', '無成交', '0', '0', '0', '--', '--', '--', '--', '<p> </p>', '0'],
            ],
          },
        ],
      });
    }
    if (u.includes('tpex.org.tw')) {
      return jsonResponse({
        stat: 'ok',
        date: '20260924',
        tables: [
          {
            title: '上櫃股票每日收盤行情(不含定價)',
            data: [['6488', '環球晶', '500', '5', '495', '505', '490', '1,000,000', '0', '1']],
          },
        ],
      });
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function req(url: string, token?: string): NextRequest {
  return new NextRequest(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
}

const BASE = 'http://localhost/api/skynet/market-bars';

beforeEach(() => {
  // ingest 需權杖：設定全域權杖供成功案例使用。
  process.env.SKYNET_DASHBOARD_API_TOKEN = 'test-token';
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env.SKYNET_DASHBOARD_API_TOKEN = ORIGINAL_TOKEN;
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

describe('market-bars route：KV 未綁定（優雅降級）', () => {
  it('read 回 200 + ok:false + ready:false，不拋錯', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=read&days=5&to=20260924`));
    const body = (await res.json()) as { ok: boolean; ready: boolean; error: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.error).toBe('kv_unavailable');
  });

  it('status 回 200 + ready:false，不拋錯', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=status`));
    const body = (await res.json()) as { ok: boolean; ready: boolean };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
  });
});

describe('market-bars route：read', () => {
  it('誠實回報 available / missing，並附帶指定 codes 的序列', async () => {
    const { kv, map } = makeKvStore();
    map.set(
      'mkt:bars:2026-09-24',
      JSON.stringify({
        date: '2026-09-24',
        twse: [['2330', 1000, 1010, 990, 1005, 30000], ['2317', 200, 205, 198, 203, 12000]],
        tpex: [],
        counts: { twse: 2, tpex: 0 },
        rawCounts: { twse: 35605, tpex: 1015 },
        fetchedAt: '2026-09-24T00:00:00.000Z',
        provenance: { source: 'self-produced', upstream: 'twse' },
      }),
    );
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=read&days=2&to=20260924&codes=2330`));
    const body = (await res.json()) as {
      ok: boolean;
      available: string[];
      missing: string[];
      seriesIncluded: boolean;
      days: Array<{ twse: unknown[][] }>;
      provenance: { source: string };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.available).toEqual(['2026-09-24']);
    expect(body.missing).toEqual(['2026-09-23']); // 2026-09-23 為交易日但 KV 無資料 → 誠實列出
    expect(body.seriesIncluded).toBe(true);
    expect(body.days[0].twse).toEqual([['2330', 1000, 1010, 990, 1005, 30000]]); // 已被 codes 過濾
    expect(body.provenance.source).toBe('self-produced');
  });
});

describe('market-bars route：status', () => {
  it('列出已累積日期（升冪）', async () => {
    const { kv, map } = makeKvStore();
    map.set('mkt:bars:2026-09-24', '{}');
    map.set('mkt:bars:2026-09-23', '{}');
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=status`));
    const body = (await res.json()) as { ok: boolean; count: number; dates: string[] };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.dates).toEqual(['2026-09-23', '2026-09-24']);
  });
});

describe('market-bars route：ingest（需權杖）', () => {
  it('無權杖 → 403（allowSameOrigin:false）', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=ingest&date=20260924`));
    expect(res.status).toBe(403);
  });

  it('單日成功 → 寫入 KV（key mkt:bars:<date>、TTL 180 天）', async () => {
    const { kv, map } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    mockUpstream();

    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=ingest&date=20260924`, 'test-token'));
    const body = (await res.json()) as {
      ok: boolean;
      stored: boolean;
      counts: { twse: number; tpex: number };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stored).toBe(true);
    expect(body.counts.twse).toBe(1); // 無成交列被濾除
    expect(body.counts.tpex).toBe(1);

    // 寫入正確 key 與 TTL
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, , options] = kv.put.mock.calls[0] as unknown as [string, string, { expirationTtl: number }];
    expect(key).toBe('mkt:bars:2026-09-24');
    expect(options).toEqual({ expirationTtl: 180 * 24 * 60 * 60 });
    expect(map.has('mkt:bars:2026-09-24')).toBe(true);
  });

  it('非交易日（週六）→ stored:false + reason，且不打上游（不假裝成功）', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const fetchMock = mockUpstream();

    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=ingest&date=20260926`, 'test-token'));
    const body = (await res.json()) as { ok: boolean; stored: boolean; reason: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stored).toBe(false);
    expect(body.reason).toBe('not_a_trading_day');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('區間超過 40 天 → 400 range_too_large', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=ingest&from=20260101&to=20260401`, 'test-token'));
    const body = (await res.json()) as { ok: boolean; error: string; maxDays: number };
    expect(res.status).toBe(400);
    expect(body.error).toBe('range_too_large');
    expect(body.maxDays).toBe(40);
  });

  it('區間交易日超過 subrequest 預算 → 400 subrequest_budget_exceeded', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const GET = freshGet();
    // 30 個日曆天（2026-09-01~2026-09-30）含約 22 個交易日 > 15 → 擋下
    const res = await GET(req(`${BASE}?action=ingest&from=20260901&to=20260930`, 'test-token'));
    const body = (await res.json()) as { ok: boolean; error: string; maxTradingDays: number };
    expect(res.status).toBe(400);
    expect(body.error).toBe('subrequest_budget_exceeded');
    expect(body.maxTradingDays).toBe(15);
  });

  it('缺少參數 → 400 missing_params', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=ingest`, 'test-token'));
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('missing_params');
  });
});

describe('market-bars route：入口', () => {
  it('未知 action → 400 unknown_action', async () => {
    const GET = freshGet();
    const res = await GET(req(`${BASE}?action=bogus`));
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(res.status).toBe(400);
    expect(body.error).toBe('unknown_action');
    expect(body.allowed).toEqual(['read', 'ingest', 'status']);
  });

  it('預設 action 為 read', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    const GET = freshGet();
    const res = await GET(req(BASE));
    const body = (await res.json()) as { action: string };
    expect(body.action).toBe('read');
  });
});
