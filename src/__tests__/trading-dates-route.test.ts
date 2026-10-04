/** @jest-environment node */

/**
 * /api/skynet/trading-dates —— 路由行為測試（第一層 QA）。
 *
 * 2026-10-04 起本端點改為「離線預算」：母清單存 KV（`scan:trading-dates`），
 * route 依 `count` 切片。本檔驗證：
 *
 *   - 有母清單 → 依 count 切片、`current` = 第一筆（最新）
 *   - 未帶 count → 預設 30
 *   - count 超過母清單長度 → 回全部（不補假資料）
 *   - count 非法（0 / 負數 / 非數字）→ 400
 *   - 母清單形狀不符 → 200 + ready:false（**不猜、不 5xx**）
 *   - 母清單過大（> MAX_PARSE_BYTES）→ 拒絕解析 → 200 + ready:false
 *   - KV 未綁定 → 用專案日曆即時計算（純計算、零上游）
 *
 * 全程 mock @opennextjs/cloudflare；不打真實 KV、不打上游。
 */

import { NextRequest } from 'next/server';
import { MAX_PARSE_BYTES, TRADING_DATES_KV_KEY } from '@/lib/tradingDates';

const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

type Res = { status: number; json: () => Promise<unknown>; headers: Headers };
type RouteModule = { GET: (req: NextRequest) => Promise<Res> };

/** 取得乾淨的 route 模組（重跑 module-level 狀態，含 kvReadCache 的 L1）。 */
function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/trading-dates/route') as RouteModule;
    GET = mod.GET;
  });
  return GET!;
}

/** Map 實作的假 KV（只需 get / put / list）。 */
function makeKvStore(entries: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(entries));
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

function req(url: string): NextRequest {
  return new NextRequest(url);
}

const BASE = 'http://localhost/api/skynet/trading-dates';

/** 母清單（由新到舊）。 */
const LIST = ['2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29', '2026-09-26', '2026-09-25'];

function withList(): ReturnType<typeof makeKvStore> {
  return makeKvStore({ [TRADING_DATES_KV_KEY]: JSON.stringify({ ok: true, dates: LIST }) });
}

afterEach(() => {
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

describe('trading-dates：母清單命中', () => {
  it('count=3 → 回前 3 筆，current = 最新一筆', async () => {
    const { kv } = withList();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?count=3`));
    const body = (await res.json()) as { ok: boolean; dates: string[]; current: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dates).toEqual(['2026-10-02', '2026-10-01', '2026-09-30']);
    expect(body.current).toBe('2026-10-02');
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('precomputed-kv');
  });

  it('未帶 count → 預設 30（母清單只有 6 筆則全回，不補假資料）', async () => {
    const { kv } = withList();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { dates: string[] };
    expect(body.dates).toEqual(LIST);
  });

  it('count 大於母清單長度 → 回全部（不報錯）', async () => {
    const { kv } = withList();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?count=60`));
    const body = (await res.json()) as { dates: string[] };
    expect(body.dates).toEqual(LIST);
  });

  it('母清單含非日期元素 → 過濾掉，不污染回應', async () => {
    const { kv } = makeKvStore({
      [TRADING_DATES_KV_KEY]: JSON.stringify({
        ok: true,
        dates: ['2026-10-02', '', 'not-a-date', '2026-10-01', 123],
      }),
    });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?count=10`));
    const body = (await res.json()) as { dates: string[] };
    expect(body.dates).toEqual(['2026-10-02', '2026-10-01']);
  });
});

describe('trading-dates：count 參數驗證', () => {
  it.each(['0', '-3', 'abc'])('count=%s → 400 invalid_count', async (raw) => {
    const { kv } = withList();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?count=${raw}`));
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_count');
  });
});

describe('trading-dates：誠實降級（不猜、不 5xx）', () => {
  it('母清單形狀不符（dates 不是陣列）→ 200 + ready:false', async () => {
    const { kv } = makeKvStore({ [TRADING_DATES_KV_KEY]: JSON.stringify({ ok: true, dates: 'oops' }) });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ok: boolean; ready: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
  });

  it('母清單是壞 JSON → 200 + ready:false', async () => {
    const { kv } = makeKvStore({ [TRADING_DATES_KV_KEY]: '{ broken' });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ready: boolean };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
  });

  it(`母清單超過 ${MAX_PARSE_BYTES} bytes → 拒絕解析（200 + ready:false，不冒險爆 CPU）`, async () => {
    const huge = JSON.stringify({
      ok: true,
      dates: Array.from({ length: 2000 }, (_, i) => `2026-01-01`),
    });
    expect(huge.length).toBeGreaterThan(MAX_PARSE_BYTES);

    const { kv } = makeKvStore({ [TRADING_DATES_KV_KEY]: huge });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ready: boolean };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
  });
});

describe('trading-dates：KV 未綁定（本地開發）', () => {
  it('改用專案日曆即時計算（純計算、零上游），且標示資料源', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });

    const res = await freshGet()(req(`${BASE}?count=5`));
    const body = (await res.json()) as { ok: boolean; dates: string[]; current: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dates).toHaveLength(5);
    // 每筆都是 YYYY-MM-DD，且由新到舊（第一筆 >= 第二筆）
    for (const d of body.dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.dates[0] >= body.dates[1]).toBe(true);
    expect(body.current).toBe(body.dates[0]);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('local-calendar');
  });
});
