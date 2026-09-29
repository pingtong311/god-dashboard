/** @jest-environment node */

/**
 * /api/skynet/swing-hub —— 路由行為測試（離線預算版）
 * ----------------------------------------------------------------------------
 * 背景：本端點原本在單次請求內讀約 65 個交易日全市場日 K + 打 5 個上游，
 *   在 Cloudflare Free plan（CPU 上限 10ms）上直接爆 503 error code: 1102。
 *   業主裁示改為「離線預算 + 寫入 KV」：route **只讀 KV key `scan:swing-hub`**。
 *
 * 本測試驗證：
 *   1. KV 有預算結果 → 原樣回傳（16 個 tab）+ `computedAt` + `precomputed:true`。
 *   2. KV 無值 → 200 + `ready:false` + `reason:'not_precomputed'` + 誠實文案
 *      （說清楚是「每日盤後離線預算」，**不可**長得像「載入中」），且不帶 tabs。
 *   3. KV 值損壞 → 不崩，回 ready:false。
 *   4. KV 未綁定 → 回 ready:false（不拋錯）。
 *   5. 反向實驗：route **不得**在 Edge 上重算——只讀一次 `scan:swing-hub`，
 *      且不打任何上游（globalThis.fetch 全程不得被呼叫）。
 *
 * 純計算邏輯的測試在 src/lib/__tests__/swing-conditions.test.ts 與
 * src/lib/__tests__/scanPayload.test.ts（組裝層），兩者皆需保持全綠。
 */

import { SCAN_KV_KEY_SWING_HUB, type SwingHubTab } from '@/lib/scanPayload';

const mockGetKv = jest.fn();
jest.mock('@/lib/godBridge', () => ({ getKv: () => mockGetKv() }));

const ORIGINAL_FETCH = globalThis.fetch;

/** 16 個頁籤的 id（對齊實站 schema；預算結果應含全部 16 個）。 */
const TAB_IDS = [
  'whale_in',
  'whale_out',
  'ma60',
  'pullback',
  'foreign',
  'trust',
  'both',
  'reclaim',
  'break20',
  'rs',
  'sector',
  'margin',
  'revenue',
  'fill',
  'badnews',
  'smart',
];

/** 預算結果範例（與 scripts/precompute-scan.mjs 寫入 KV 的形狀一致）。 */
const STORED_PAYLOAD = {
  ok: true,
  ready: true,
  data_date: '2026-09-24',
  data_scope: '盤後歷史條件',
  next_update: '下一交易日盤後',
  week: '2026-09-18',
  weeksAccumulated: 1,
  tabs: TAB_IDS.map((id) => ({
    id,
    title: id,
    desc: `${id} 說明`,
    items: id === 'ma60' ? [{ stock_id: '2330', label: '2330 台積電', close: 600 }] : [],
    ...(id === 'badnews' ? { unavailable_reason: '本站尚無新聞資料源。' } : {}),
  })),
  note: '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
  provenance: { source: 'self-produced', upstreams: ['tdcc', 't86'] },
  whale_delta_provenance: { source: 'site-mirror', snapshot_date: '2026-09-18' },
  computedAt: '2026-09-24T14:10:00.000Z',
};

/** Map 實作的假 KV。 */
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

describe('swing-hub route：KV 有預算結果', () => {
  it('原樣回傳 16 個 tab + computedAt + precomputed:true', async () => {
    const store = makeKvStore({ [SCAN_KV_KEY_SWING_HUB]: JSON.stringify(STORED_PAYLOAD) });
    mockGetKv.mockResolvedValue(store.kv);
    const fetchSpy = installFetchGuard();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/swing-hub/route') as {
      GET: () => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.precomputed).toBe(true);
    expect(body.computedAt).toBe('2026-09-24T14:10:00.000Z');
    expect(body.data_date).toBe('2026-09-24');

    const tabs = body.tabs as SwingHubTab[];
    expect(tabs).toHaveLength(16);
    expect(tabs.map((t) => t.id)).toEqual(TAB_IDS);
    expect(tabs.find((t) => t.id === 'ma60')?.items).toHaveLength(1);
    // 大戶週增減來源（實站快照）如實保留。
    expect(body.whale_delta_provenance).toEqual({
      source: 'site-mirror',
      snapshot_date: '2026-09-18',
    });

    // 反向實驗：只讀一次 scan:swing-hub，且不打任何上游。
    expect(store.kv.get).toHaveBeenCalledTimes(1);
    expect(store.kv.get).toHaveBeenCalledWith(SCAN_KV_KEY_SWING_HUB);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('swing-hub route：尚未預算（誠實 not-ready）', () => {
  it('KV 無值 → 200 + ready:false + reason:not_precomputed，不帶 tabs 冒充', async () => {
    const store = makeKvStore();
    mockGetKv.mockResolvedValue(store.kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/swing-hub/route') as {
      GET: () => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET();
    const body = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      reason: string;
      message: string;
      tabs?: unknown;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('not_precomputed');
    expect(body.message).toContain('離線預算');
    expect(body.message).toContain('不是載入中');
    // 不可回空 tabs 假裝掃過。
    expect(body.tabs).toBeUndefined();
  });

  it('KV 值損壞（非 JSON）→ 不崩，回 ready:false', async () => {
    const store = makeKvStore({ [SCAN_KV_KEY_SWING_HUB]: '<<<broken' });
    mockGetKv.mockResolvedValue(store.kv);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/swing-hub/route') as {
      GET: () => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET();
    const body = (await res.json()) as { ready: boolean; tabs?: unknown };

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.tabs).toBeUndefined();
  });

  it('KV 未綁定 → 200 + ready:false，不拋錯', async () => {
    mockGetKv.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/skynet/swing-hub/route') as {
      GET: () => Promise<{ status: number; json: () => Promise<unknown> }>;
    };
    const res = await GET();
    const body = (await res.json()) as { ok: boolean; ready: boolean; reason: string; message: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('not_precomputed');
    expect(body.message).toContain('KV 尚未綁定');
  });
});
