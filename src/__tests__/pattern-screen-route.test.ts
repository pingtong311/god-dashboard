/** @jest-environment node */

/**
 * /api/skynet/pattern-screen —— 路由行為測試（含反向實驗）
 * ----------------------------------------------------------------------------
 * 重點（資料誠實）：
 *   - KV 未綁定 → ok:true + ready:false + reason:'kv_unavailable'，不拋錯。
 *   - KV 有資料但不足 MIN_BARS_FOR_SCAN 天 → ready:false + availableDays + 明確訊息，
 *     **絕不回空 patterns 假裝掃過**（反向實驗）。
 *   - KV 累積足夠 + 有 W 底序列 → ready:true，patterns.w_bottom 命中該檔，
 *     並附 criteria / provenance。
 *
 * 全程 mock @opennextjs/cloudflare 與 globalThis.fetch；不打真實上游、不打真實 KV。
 */

import { NextRequest } from 'next/server';
import { MIN_BARS_FOR_SCAN } from '@/lib/patternScan';

const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;

type Res = { status: number; json: () => Promise<unknown> };
type RouteModule = { GET: (req: NextRequest) => Promise<Res> };

/** 取得乾淨的 route 模組。 */
function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/pattern-screen/route') as RouteModule;
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

/** 名稱對照上游（回傳可辨識的名稱；其餘上游一律 404）。 */
function mockNameUpstream() {
  const fn = jest.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('BWIBBU_ALL')) {
      return new Response(JSON.stringify([{ Code: '2330', Name: '台積電' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** 由收盤路徑線性內插。 */
function closesFromWaypoints(waypoints: Array<[number, number]>, length: number): number[] {
  const closes = new Array<number>(length).fill(waypoints[0][1]);
  let seg = 0;
  for (let i = 0; i < length; i += 1) {
    while (seg < waypoints.length - 2 && i > waypoints[seg + 1][0]) seg += 1;
    const [i0, p0] = waypoints[seg];
    const [i1, p1] = waypoints[seg + 1];
    const t = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
    closes[i] = p0 + (p1 - p0) * Math.min(1, Math.max(0, t));
  }
  return closes;
}

/** 產生連續日期 'YYYY-MM-DD'。 */
function datesFrom(startYmd: string, count: number): string[] {
  const [y, m, d] = startYmd.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    out.push(`${dt.getUTCFullYear()}-${mm}-${dd}`);
  }
  return out;
}

/** 寫入 N 天「單一 W 底個股」的假 KV。 */
function seedWBottom(kvStore: ReturnType<typeof makeKvStore>, days: number): string[] {
  const dates = datesFrom('2026-07-01', days);
  const waypoints: Array<[number, number]> = [
    [0, 100],
    [Math.round(days * 0.22), 80],
    [Math.round(days * 0.44), 92],
    [Math.round(days * 0.67), 81],
    [days - 1, 95],
  ];
  const closes = closesFromWaypoints(waypoints, days);
  dates.forEach((date, i) => {
    const c = closes[i];
    kvStore.map.set(
      `mkt:bars:${date}`,
      JSON.stringify({
        date,
        twse: [['2330', c, c + 0.5, c - 0.5, c, 5000]],
        tpex: [],
        counts: { twse: 1, tpex: 0 },
        rawCounts: { twse: 1, tpex: 0 },
        fetchedAt: `${date}T00:00:00.000Z`,
        provenance: { source: 'self-produced', upstream: 'test' },
      }),
    );
  });
  return dates;
}

function req(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/pattern-screen');
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

describe('pattern-screen route：資料尚未就緒（誠實狀態）', () => {
  it('KV 未綁定 → ready:false + reason:kv_unavailable，不拋錯', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    const GET = freshGet();
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; ready: boolean; reason: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('kv_unavailable');
  });

  it('反向實驗：KV 為空 → ready:false、availableDays:0、不偽造 patterns', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const GET = freshGet();
    const res = await GET(req());
    const body = (await res.json()) as {
      ready: boolean;
      availableDays: number;
      minDaysRequired: number;
      patterns?: unknown;
      message: string;
    };
    expect(body.ready).toBe(false);
    expect(body.availableDays).toBe(0);
    expect(body.minDaysRequired).toBe(MIN_BARS_FOR_SCAN);
    expect(body.patterns).toBeUndefined();
    expect(body.message).toContain('累積中');
  });

  it('反向實驗：KV 只有 3 天（不足門檻）→ ready:false、availableDays:3、不偽造 patterns', async () => {
    const store = makeKvStore();
    seedWBottom(store, 3);
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: store.kv } });
    const GET = freshGet();
    const res = await GET(req());
    const body = (await res.json()) as { ready: boolean; availableDays: number; patterns?: unknown };
    expect(body.ready).toBe(false);
    expect(body.availableDays).toBe(3);
    expect(body.patterns).toBeUndefined();
  });
});

describe('pattern-screen route：資料足夠 → 自算型態', () => {
  it('累積 45 天 + W 底序列 → ready:true，w_bottom 命中 2330，附 criteria/provenance', async () => {
    const store = makeKvStore();
    seedWBottom(store, 45);
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: store.kv } });
    mockNameUpstream();

    const GET = freshGet();
    const res = await GET(req());
    const body = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      data_date: string;
      criteria: Record<string, number>;
      provenance: { source: string };
      patterns: Record<string, { count: number; items: Array<{ stock_id: string; stock_name: string }> }>;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.patterns.w_bottom.count).toBeGreaterThanOrEqual(1);
    expect(body.patterns.w_bottom.items.some((i) => i.stock_id === '2330')).toBe(true);
    expect(body.patterns.w_bottom.items[0].stock_name).toBe('台積電');
    expect(body.criteria.minBars).toBe(MIN_BARS_FOR_SCAN);
    expect(body.provenance.source).toBe('self-produced');
    expect(body.data_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
