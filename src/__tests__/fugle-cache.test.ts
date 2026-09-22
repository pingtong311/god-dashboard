/** @jest-environment node */

/**
 * QA 驗證 — Fugle 請求層 cache（spec §2-C，防爆 100 req/hr + 5 req/min）。
 *
 * 覆蓋三層：
 * 1. src/lib/fugleCache.ts 原語（inflight 去重 + 60s TTL + stale-on-error + miss）
 * 2. /api/skynet/kline route 包層：
 *    - 第一次請求 → 打下游 1 次
 *    - 60s 內同參數第二次 → 不打下游（cache 命中，fugle fetch 數不變）
 *    - 不同 ticker → 各自 cache key（互不命中）
 *    - 上游掛 → 回 stale 快取 + X-Skynet-Stale: true header（body shape 不變）
 *    - 全掛無快取 → 200 + ok:false（不 5xx）
 * 3. /api/skynet/fusion route 包層：同 ticker 60s 內第二次 → Fugle quote/kline 不重打
 *
 * 全程 mock globalThis.fetch + mock Date.now（TTL 推進）；不打真實 Fugle/Yahoo/n8n。
 * 用 jest.isolateModules 重新 require route，取得乾淨的 module-level cache/inflight。
 */

import { NextRequest } from 'next/server';
import {
  fetchFugleCached,
  buildFugleCacheKey,
  FUGLE_CACHE_TTL_MS,
  type FugleAttempt,
} from '@/lib/fugleCache';

const ORIGINAL_FETCH = globalThis.fetch;

// ── 時間控制（helper 只用 Date.now 做 TTL 判定；new Date() 保留真實時間，不影響斷言）──
let nowBase = 1_761_000_000_000; // 固定基準（2025-10-20），避免跨測試污染
function mockNow(): void {
  jest.spyOn(Date, 'now').mockImplementation(() => nowBase);
}
function advanceMs(ms: number): void {
  nowBase += ms;
}
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});
beforeEach(() => {
  nowBase = 1_761_000_000_000;
});

// ── fetch mock ─────────────────────────────────────────
type Handler = { match: (url: string) => boolean; make: (url: string) => Response };

function mockFetch(handlers: Handler[]): jest.Mock {
  const fn = jest.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    for (const h of handlers) {
      if (h.match(url)) return h.make(url);
    }
    return new Response('not_matched', { status: 404 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const isFugle = (url: string) => url.startsWith('https://api.fugle.tw');
const isYahoo = (url: string) => url.startsWith('https://query1.finance.yahoo.com');
const isN8n = (url: string) => url.includes('skynet-cmd.duckdns.org');

/** Fugle intraday/quote 回應（單一物件，非 candles 陣列）。 */
function quoteObject(): Record<string, unknown> {
  return {
    symbol: '2330',
    name: 'Test',
    closePrice: 120,
    previousClose: 100,
    change: 20,
    changePercent: 20,
  };
}

/** 依 URL 分發 Fugle 回應：intraday/quote → 物件；historical/candles → 陣列。 */
function fugleHandler(tag: string): Handler {
  return {
    match: isFugle,
    make: (url: string) => {
      if (url.includes('/intraday/quote/')) return jsonRes({ ...quoteObject(), _tag: tag });
      return jsonRes(dailyCandles(tag));
    },
  };
}

/** 22 根日K（≥21 根，fusion 的真實 21 點門檻可用）。 */
function dailyCandles(tag: string): Record<string, unknown> {
  const candles = Array.from({ length: 22 }, (_, i) => ({
    date: `2025-10-${String(i + 1).padStart(2, '0')}`,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1000 + i * 10,
  }));
  return { data: candles, sort: 'desc', _tag: tag };
}

// ── 1. helper 原語單測 ───────────────────────────────────
describe('lib/fugleCache 原語', () => {
  it('buildFugleCacheKey：per-(namespace, 參數) 唯一金鑰；缺失轉 ""', () => {
    expect(buildFugleCacheKey('kline', ['2330', 'daily', undefined])).toBe('kline:2330:daily:');
    expect(buildFugleCacheKey('kline', ['2404', 'daily', '2025-01-01'])).toBe(
      'kline:2404:daily:2025-01-01'
    );
    expect(buildFugleCacheKey('fusion', ['quote', '2330'])).toBe('fusion:quote:2330');
  });

  it('inflight 去重：同 key 併發 2 次 → 上游只打 1 次', async () => {
    mockNow();
    let attempts = 0;
    const attempt = (): Promise<FugleAttempt<number>> =>
      new Promise((resolve) => {
        attempts += 1;
        // 延遲回（microtask）讓第二次呼叫來得及看到 inflight
        queueMicrotask(() => resolve({ kind: 'data', data: 42 }));
      });
    const [a, b] = await Promise.all([
      fetchFugleCached<number>('unit-inflight', attempt),
      fetchFugleCached<number>('unit-inflight', attempt),
    ]);
    expect(attempts).toBe(1);
    expect(a.source).toBe('fugle-fresh');
    expect(a.data).toBe(42);
    expect(b.source).toBe('fugle-fresh');
    expect(b.data).toBe(42);
  });

  it('60s 內同 key → cache 命中不打下游；60s 後 → miss 重抓', async () => {
    mockNow();
    const attempt = jest.fn((): Promise<FugleAttempt<string>> => Promise.resolve({ kind: 'data', data: 'v1' }));
    const first = await fetchFugleCached<string>('unit-ttl', attempt);
    expect(first.source).toBe('fugle-fresh');
    expect(attempt).toHaveBeenCalledTimes(1);

    advanceMs(FUGLE_CACHE_TTL_MS - 1_000); // 59s
    const hit = await fetchFugleCached<string>('unit-ttl', attempt);
    expect(hit.source).toBe('fugle-cache');
    expect(hit.data).toBe('v1');
    expect(attempt).toHaveBeenCalledTimes(1); // 不打下游

    advanceMs(FUGLE_CACHE_TTL_MS); // 已過 60s
    const refreshed = await fetchFugleCached<string>('unit-ttl', attempt);
    expect(refreshed.source).toBe('fugle-fresh');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('stale-on-error：上游掛 → 回過期快照；無快照 → miss（data null）', async () => {
    mockNow();
    // 先 seed 一份成功快照
    await fetchFugleCached<string>('unit-stale', async () => ({ kind: 'data', data: 'snapshot' }));
    advanceMs(FUGLE_CACHE_TTL_MS + 1_000); // 快照過期
    const stale = await fetchFugleCached<string>(
      'unit-stale',
      async () => ({ kind: 'upstream-failure', status: 500 })
    );
    expect(stale.source).toBe('fugle-stale');
    expect(stale.data).toBe('snapshot');
    expect(stale.upstreamStatus).toBe(500);

    // 無快照的 key：上游掛 → miss
    const miss = await fetchFugleCached<string>(
      'unit-miss',
      async () => ({ kind: 'upstream-failure', status: 500 })
    );
    expect(miss.source).toBe('fugle-miss');
    expect(miss.data).toBeNull();
    expect(miss.upstreamStatus).toBe(500);
  });

  it('失敗結果不寫 cache：上游 500 後再成功 → 重新打下游（不被壞快照污染）', async () => {
    mockNow();
    const attempt = jest.fn(async (): Promise<FugleAttempt<string>> => {
      if (attempt.mock.calls.length === 1) return { kind: 'upstream-failure', status: 503 };
      return { kind: 'data', data: 'recovered' };
    });
    const failed = await fetchFugleCached<string>('unit-nopollute', attempt);
    expect(failed.source).toBe('fugle-miss');
    const recovered = await fetchFugleCached<string>('unit-nopollute', attempt);
    expect(recovered.source).toBe('fugle-fresh');
    expect(recovered.data).toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});

// ── 2. kline route 包層 ─────────────────────────────────
describe('GET /api/skynet/kline（§2-C 請求層 cache）', () => {
  type KlineRoute = {
    GET: (req: NextRequest) => Promise<{
      status: number;
      json: () => Promise<Record<string, unknown>>;
      headers: Headers;
    }>;
  };

  function freshKline() {
    let GET: KlineRoute['GET'] | null = null;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@/app/api/skynet/kline/route') as KlineRoute;
      GET = mod.GET;
    });
    return GET!;
  }

  function klineReq(path: string): NextRequest {
    return new NextRequest(`http://localhost${path}`);
  }

  const saveKey = process.env.FUGLE_API_KEY;
  beforeAll(() => {
    process.env.FUGLE_API_KEY = 'test-key';
  });
  afterAll(() => {
    if (saveKey === undefined) delete process.env.FUGLE_API_KEY;
    else process.env.FUGLE_API_KEY = saveKey;
  });

  it('第一次請求打下游 1 次；60s 內同參數第二次不打下游（cache 命中）', async () => {
    mockNow();
    const fetchMock = mockFetch([
      { match: isFugle, make: () => jsonRes(dailyCandles('first')) },
      { match: isYahoo, make: () => jsonRes({}, 500) },
    ]);

    const GET = freshKline();
    const first = await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily'));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect((firstBody as { candles: unknown[] }).candles.length).toBe(22);
    expect(first.headers.get('X-Skynet-Stale')).toBeNull();
    const fugleCallsAfterFirst = fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length;
    expect(fugleCallsAfterFirst).toBe(1); // 第一次 → 打下游 1 次

    const second = await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily'));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect((secondBody as { candles: unknown[] }).candles.length).toBe(22); // shape 不變
    const fugleCallsAfterSecond = fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length;
    expect(fugleCallsAfterSecond).toBe(1); // 60s 內同參數 → 不打下游
  });

  it('不同 ticker → 各自 cache key（互不命中，各打 1 次）', async () => {
    mockNow();
    const fetchMock = mockFetch([
      { match: isFugle, make: () => jsonRes(dailyCandles('per-ticker')) },
      { match: isYahoo, make: () => jsonRes({}, 500) },
    ]);

    const GET = freshKline();
    await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily'));
    await GET(klineReq('/api/skynet/kline?ticker=2404&type=daily'));
    const fugleCalls = fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length;
    expect(fugleCalls).toBe(2); // 2330、2404 各 1 次（不同 key 互不命中）

    // 再問 2330 → 命中 2330 自己的 key，不新打下游
    await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily'));
    expect(fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length).toBe(2);
  });

  it('上游掛 → 回 stale 快取 + X-Skynet-Stale: true（body shape 不變）', async () => {
    mockNow();
    let fugleOk = true;
    const fetchMock = mockFetch([
      {
        match: isFugle,
        make: () => (fugleOk ? jsonRes(dailyCandles('stale-seed')) : jsonRes({}, 500)),
      },
      { match: isYahoo, make: () => jsonRes({}, 500) },
    ]);

    const GET = freshKline();
    await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily')); // seed 快取
    fugleOk = false; // Fugle 掛了
    advanceMs(FUGLE_CACHE_TTL_MS + 1_000); // 快取過期（>60s 後才該走 stale 路徑）

    const staleRes = await GET(klineReq('/api/skynet/kline?ticker=2330&type=daily'));
    expect(staleRes.status).toBe(200);
    expect(staleRes.headers.get('X-Skynet-Stale')).toBe('true'); // stale 標記
    const staleBody = await staleRes.json();
    // 快照 shape 與正常回應一致（對前端透明）
    expect((staleBody as { candles: unknown[] }).candles.length).toBe(22);
    // seed 1 次 + stale 時重抓 1 次（抓掛後回快照，失敗不寫 cache）
    const fugleCalls = fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length;
    expect(fugleCalls).toBe(2);
  });

  it('全掛無快取 → 200 + ok:false（不 5xx）', async () => {
    mockNow();
    mockFetch([
      { match: isFugle, make: () => jsonRes({}, 500) }, // Fugle 掛
      { match: isYahoo, make: () => jsonRes({}, 500) }, // Yahoo 也掛
    ]);

    const GET = freshKline(); // 全新 isolate：無快取
    const res = await GET(klineReq('/api/skynet/kline?ticker=2803&type=daily'));
    expect(res.status).toBe(200); // 不 5xx
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('upstream_error');
  });
});

// ── 3. fusion route 包層 ────────────────────────────────
describe('GET /api/skynet/fusion（Fugle 子來源走同 helper）', () => {
  type FusionRoute = {
    GET: (req: NextRequest) => Promise<{
      status: number;
      json: () => Promise<Record<string, unknown>>;
      headers: Headers;
    }>;
  };

  function freshFusion() {
    let GET: FusionRoute['GET'] | null = null;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@/app/api/skynet/fusion/route') as FusionRoute;
      GET = mod.GET;
    });
    return GET!;
  }

  const saveKey = process.env.FUGLE_API_KEY;
  beforeAll(() => {
    process.env.FUGLE_API_KEY = 'test-key';
  });
  afterAll(() => {
    if (saveKey === undefined) delete process.env.FUGLE_API_KEY;
    else process.env.FUGLE_API_KEY = saveKey;
  });

  it('同 ticker 60s 內第二次 → Fugle quote/kline 不重打（各自 cache key）', async () => {
    mockNow();
    const fetchMock = mockFetch([
      { match: isN8n, make: () => jsonRes({}, 500) }, // n8n 掛（fusion 降級不帶崩）
      fugleHandler('fusion-seed'), // intraday/quote → 報價物件；historical/candles → 22 根日K
      { match: isYahoo, make: () => jsonRes({}, 500) },
    ]);

    const GET = freshFusion();
    const first = await GET(new NextRequest('http://localhost/api/skynet/fusion?ticker=2330'));
    expect(first.status).toBe(200);
    const firstPayload = (await first.json()) as { quote: { price: number } | null };
    expect(firstPayload.quote?.price).toBe(120); // Fugle 報價 closePrice（非日K收盤價）
    const fugleAfterFirst = fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length;
    expect(fugleAfterFirst).toBe(2); // quote + historical 各 1 次

    const second = await GET(new NextRequest('http://localhost/api/skynet/fusion?ticker=2330'));
    expect(second.status).toBe(200);
    const secondPayload = (await second.json()) as { quote: { price: number } | null };
    expect(secondPayload.quote?.price).toBe(120);
    // 60s 內第二次 → Fugle 兩個端點皆 cache 命中，fetch 數不變
    expect(fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length).toBe(2);
  });

  it('不同 ticker → 各自 cache key（Fugle 各打 1 次）', async () => {
    mockNow();
    const fetchMock = mockFetch([
      { match: isN8n, make: () => jsonRes({}, 500) },
      fugleHandler('fusion-per-ticker'),
      { match: isYahoo, make: () => jsonRes({}, 500) },
    ]);

    const GET = freshFusion();
    await GET(new NextRequest('http://localhost/api/skynet/fusion?ticker=2330'));
    await GET(new NextRequest('http://localhost/api/skynet/fusion?ticker=2404'));
    // 2330（quote+kline=2）+ 2404（quote+kline=2）= 4
    expect(fetchMock.mock.calls.filter(([u]) => isFugle(String(u))).length).toBe(4);
  });
});
