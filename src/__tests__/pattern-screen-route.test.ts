/** @jest-environment node */

/**
 * /api/skynet/pattern-screen —— 路由行為測試（離線預算版）
 * ----------------------------------------------------------------------------
 * 背景：本端點在 Edge（Cloudflare Free plan，CPU 上限 10ms）上重算 70 天全市場日 K
 *   會爆 503 error code: 1102，故改為「離線預算 + 寫入 KV」：route **只讀 KV**。
 *
 * 本測試驗證：
 *   1. KV 有預算結果 → 原樣回傳 + `computedAt` + `precomputed:true`（前端欄位不變）。
 *   2. KV 無值 → 200 + `ready:false` + `reason:'not_precomputed'` + 誠實文案
 *      （說清楚是「每日盤後離線預算」，**不可**長得像「載入中」）。
 *   3. KV 值損壞 → 不崩，回 ready:false。
 *   4. KV 未綁定 → 回 ready:false（不拋錯）。
 *   5. 反向實驗：route **不得**在 Edge 上重算——只讀一次 `scan:pattern-screen`，
 *      且不打任何上游（globalThis.fetch 全程不得被呼叫）。
 *
 * 全程 mock godBridge.getKv；不打真實 KV、不打真實上游。
 */

import { NextRequest } from 'next/server';
import { SCAN_KV_KEY_PATTERN_SCREEN } from '@/lib/scanPayload';

const mockGetKv = jest.fn();
jest.mock('@/lib/godBridge', () => ({ getKv: () => mockGetKv() }));

const ORIGINAL_FETCH = globalThis.fetch;

/** 預算結果範例（與 scripts/precompute-scan.mjs 寫入 KV 的形狀一致）。 */
const STORED_PAYLOAD = {
  ok: true,
  ready: true,
  patterns: {
    w_bottom: {
      meta: { name: 'W底（雙重底）', desc: '兩個相近低點與中間高點形成的歷史日 K 幾何分類。', structure: '底部幾何' },
      items: [
        {
          stock_id: '2330',
          stock_name: '台積電',
          label: '2330 台積電',
          close: 600,
          change_pct: 1.2,
          volume_lots: 50000,
          turnover_yi: 300.5,
          low_liquidity: false,
        },
      ],
      count: 1,
    },
  },
  data_date: '2026-09-24',
  data_scope: '盤後日 K',
  next_update: '下一交易日盤後',
  scope: 'historical_geometry',
  note: '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
  criteria: { minBars: 40 },
  availableDays: 70,
  windowDays: 70,
  scannedStocks: 1800,
  missing: [],
  gaps: [],
  provenance: { source: 'self-produced', upstream: 'twse+tpex' },
  computedAt: '2026-09-24T14:05:00.000Z',
};

/** Map 實作的假 KV（只 get/put；route 不該用到 list）。 */
function makeKvStore(initial?: Record<string, string>): {
  map: Map<string, string>;
  kv: { get: jest.Mock; put: jest.Mock };
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    map,
    kv: {
      get: jest.fn(async (key: string) => map.get(key) ?? null),
      put: jest.fn(async (key: string, value: string) => {
        map.set(key, value);
      }),
    },
  };
}

function req(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/pattern-screen');
}

/** 監視上游 fetch：route 一旦打上游就視為違規（Edge 不得重算）。 */
function installFetchGuard(): jest.Mock {
  const fn = jest.fn(async () => new Response('{}', { status: 200 }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mockGetKv.mockReset();
  jest.restoreAllMocks();
});

describe('pattern-screen route：KV 有預算結果', () => {
  it('原樣回傳 + computedAt + precomputed:true', async () => {
    const store = makeKvStore({ [SCAN_KV_KEY_PATTERN_SCREEN]: JSON.stringify(STORED_PAYLOAD) });
    mockGetKv.mockResolvedValue(store.kv);
    const fetchSpy = installFetchGuard();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.precomputed).toBe(true);
    expect(body.computedAt).toBe('2026-09-24T14:05:00.000Z');
    expect(body.data_date).toBe('2026-09-24');
    expect(body.patterns).toEqual(STORED_PAYLOAD.patterns);
    expect(body.criteria).toEqual(STORED_PAYLOAD.criteria);
    expect(typeof body.fetchedAt).toBe('string');

    // 反向實驗：只讀一次 scan:pattern-screen，且不打任何上游。
    expect(store.kv.get).toHaveBeenCalledTimes(1);
    expect(store.kv.get).toHaveBeenCalledWith(SCAN_KV_KEY_PATTERN_SCREEN);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('pattern-screen route：尚未預算（誠實 not-ready）', () => {
  it('KV 無值 → 200 + ready:false + reason:not_precomputed + 說明預算機制（不寫成載入中）', async () => {
    const store = makeKvStore();
    mockGetKv.mockResolvedValue(store.kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      reason: string;
      message: string;
      minDaysRequired: number;
      criteria: Record<string, number>;
      gaps: string[];
      patterns?: unknown;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('not_precomputed');
    // 誠實：說清楚是「每日盤後離線預算、目前沒有結果」。
    expect(body.message).toContain('離線預算');
    expect(body.message).toContain('不是載入中');
    // 不可回空 patterns 假裝掃過。
    expect(body.patterns).toBeUndefined();
    expect(body.minDaysRequired).toBe(40);
    expect(body.criteria).toBeTruthy();
    expect(body.gaps.length).toBeGreaterThan(0);
  });

  it('KV 值損壞（非 JSON）→ 不崩，回 ready:false', async () => {
    const store = makeKvStore({ [SCAN_KV_KEY_PATTERN_SCREEN]: 'this-is-not-json{{{' });
    mockGetKv.mockResolvedValue(store.kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as { ready: boolean; reason: string; patterns?: unknown };

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('not_precomputed');
    expect(body.patterns).toBeUndefined();
  });

  it('KV 值是合法 JSON 但形狀不符 → 視為尚未預算，不崩', async () => {
    const store = makeKvStore({ [SCAN_KV_KEY_PATTERN_SCREEN]: JSON.stringify({ hello: 'world' }) });
    mockGetKv.mockResolvedValue(store.kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as { ready: boolean; patterns?: unknown };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.patterns).toBeUndefined();
  });

  it('KV 未綁定 → 200 + ready:false，不拋錯', async () => {
    mockGetKv.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; ready: boolean; reason: string; message: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('not_precomputed');
    expect(body.message).toContain('KV 尚未綁定');
  });

  it('KV get 拋錯 → 視為尚未預算，不拋錯', async () => {
    const kv = { get: jest.fn(async () => { throw new Error('kv down'); }), put: jest.fn() };
    mockGetKv.mockResolvedValue(kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/pattern-screen/route') as {
      GET: (r: NextRequest) => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET(req());
    const body = (await res.json()) as { ready: boolean };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
  });
});
