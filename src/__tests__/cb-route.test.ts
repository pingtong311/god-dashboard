/** @jest-environment node */

/**
 * 單元測試 — `/api/skynet/cb`（只讀 KV 的離線預算結果）
 *
 * 重構後的行為契約（與原本「Edge 上即時打上游」完全不同）：
 *   1. KV（`scan:cb`）有值 → 200 + 內容原樣回傳 + `computedAt` + `precomputed:true`
 *   2. KV 無值 → 200 + `available:false` + 誠實說明（不是 502、不是空陣列假裝成功）
 *   3. KV 值損壞（非 JSON）→ 不崩，一樣走 not-ready
 *   4. KV 未綁定 / KV get 拋錯 → 一樣走 not-ready
 *   5. 舊格式（裸 CbResponse，無信封）→ computedAt 退回 fetchedAt
 *
 * ★ 最重要的回歸守衛：**route 絕對不得打上游、不得重算**。
 *   因此每個測試都把 `globalThis.fetch` 換成「一被呼叫就丟錯」的 mock——
 *   若哪天有人在 route 裡加回 fetch TPEX，測試會立刻紅（線上會立刻回到 502/1102）。
 *
 * 純計算邏輯（BIG5／UTF-8 編碼、20 欄對位、千分位、升冪取前 30、CSV 404…）
 * 的覆蓋已搬到 `src/lib/__tests__/cbPremium.test.ts`，本檔不再重複。
 */

import { GET } from '@/app/api/skynet/cb/route';
import { CB_KV_KEY, buildCbKvValue, type CbResponse } from '@/lib/cbPremium';

// ⚠ @opennextjs/cloudflare 為 ESM-only，Jest（CJS）無法直接載入 → 以 mock 模組取代。
// 委派到 module-scope 的 jest.fn（見 futures-route.kv.qa.test.ts 同款寫法）。
const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;

/** 一筆完整的預算結果（模擬本機腳本算完寫進 KV 的內容）。 */
function samplePayload(): CbResponse {
  return {
    available: true,
    date: '2026-09-28',
    data_scope: '盤後',
    next_update: '下一交易日盤後',
    items: [
      {
        cb_id: '11011',
        cb_name: '台泥一永',
        conversion_price: 36.5,
        underlying_price: 36.5,
        cb_price: 35.0,
        conversion_value: 100,
        premium_pct: -65.0,
        outstanding: 8_000_000_000,
        coupon_rate: 0,
        due_date: '2029-12',
      },
    ],
    put_schedule: [
      { cb_id: '11011', name: '台泥一永', put_price: 100, put_date: '2025-09-11', end_date: '' },
    ],
    calendar: [
      {
        cb_id: '11011',
        name: '台泥一永',
        issue_date: '2024-12-10',
        listing_date: '2024-12-10',
        maturity_date: '2029-12-10',
      },
    ],
    note: '轉換溢價率＝可轉債市價相對轉換價值的差異。',
    items_unavailable_reason: '',
    provenance: { source: 'self-produced', upstream: 'https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data' },
    fetchedAt: '2026-09-29T05:00:00.000Z',
  };
}

/** 每次測試開始：把 fetch 換成「一被呼叫就丟錯」的守衛。 */
function guardNoUpstreamFetch() {
  globalThis.fetch = jest.fn(() => {
    throw new Error('route 不得打上游：CB 已改為離線預算 + 讀 KV');
  }) as unknown as typeof fetch;
}

/** 模擬 KV 綁定：store 為 key → 原始字串值；getThrows 可模擬 KV 讀取拋錯。 */
function mockKv(store: Map<string, string>, getThrows = false) {
  const get = jest.fn(async (key: string) => {
    if (getThrows) throw new Error('KV unavailable');
    return store.get(key) ?? null;
  });
  const put = jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  });
  mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: { get, put } } });
  return { get, put };
}

/** 模擬「KV 未綁定」：env.SKYNET_CACHE 缺席。 */
function mockKvUnbound() {
  mockGetCloudflareContext.mockResolvedValue({ env: {} });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/cb（只讀 KV）', () => {
  it('KV 有 scan:cb → 內容原樣回傳 + computedAt + precomputed:true', async () => {
    guardNoUpstreamFetch();
    const payload = samplePayload();
    const store = new Map<string, string>([
      [CB_KV_KEY, buildCbKvValue(payload, '2026-09-29T13:45:00.000Z')],
    ]);
    const { get } = mockKv(store);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & { computedAt: string; precomputed: boolean };

    expect(get).toHaveBeenCalledWith(CB_KV_KEY);
    expect(body.precomputed).toBe(true);
    expect(body.computedAt).toBe('2026-09-29T13:45:00.000Z');
    // 其餘欄位與預算結果逐欄一致（前端不用改）
    expect(body.available).toBe(true);
    expect(body.date).toBe('2026-09-28');
    expect(body.items).toEqual(payload.items);
    expect(body.put_schedule).toEqual(payload.put_schedule);
    expect(body.calendar).toEqual(payload.calendar);
    expect(body.provenance.source).toBe('self-produced');
    // 守衛：route 全程不得呼叫 fetch
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('舊格式（裸 CbResponse 無信封）→ 讀得動，computedAt 退回 fetchedAt', async () => {
    guardNoUpstreamFetch();
    const store = new Map<string, string>([[CB_KV_KEY, JSON.stringify(samplePayload())]]);
    mockKv(store);

    const res = await GET();
    const body = (await res.json()) as CbResponse & { computedAt: string; precomputed: boolean };

    expect(res.status).toBe(200);
    expect(body.precomputed).toBe(true);
    expect(body.computedAt).toBe('2026-09-29T05:00:00.000Z');
    expect(body.items).toHaveLength(1);
  });

  it('KV 無值 → 200 + available:false + 誠實說明（不是 502）', async () => {
    guardNoUpstreamFetch();
    mockKv(new Map<string, string>());

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & {
      ok: boolean;
      computedAt: string;
      precomputed: boolean;
    };

    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
    expect(body.precomputed).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.put_schedule).toEqual([]);
    expect(body.calendar).toEqual([]);
    // 誠實說明：講清楚是「盤後離線預算，目前尚無結果」，且不能寫得像載入中
    expect(body.items_unavailable_reason).toContain('預算');
    expect(body.items_unavailable_reason).not.toContain('載入中');
    expect(body.computedAt).toBe('');
    expect(body.provenance.source).toBe('self-produced');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('KV 值損壞（非 JSON）→ 不崩，走 not-ready', async () => {
    guardNoUpstreamFetch();
    mockKv(new Map<string, string>([[CB_KV_KEY, '{ this is not json ]}']]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & { ok: boolean; precomputed: boolean };

    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
    expect(body.precomputed).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.items_unavailable_reason).toContain('預算');
  });

  it('KV 值是 JSON 但缺 items（形狀不對）→ 走 not-ready', async () => {
    guardNoUpstreamFetch();
    mockKv(new Map<string, string>([[CB_KV_KEY, JSON.stringify({ date: '2026-09-28' })]]));

    const res = await GET();
    const body = (await res.json()) as CbResponse & { ok: boolean; precomputed: boolean };

    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.precomputed).toBe(false);
  });

  it('KV 未綁定（env.SKYNET_CACHE 缺席）→ 走 not-ready', async () => {
    guardNoUpstreamFetch();
    mockKvUnbound();

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & { ok: boolean; precomputed: boolean };

    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
    expect(body.precomputed).toBe(false);
    expect(body.items_unavailable_reason).toContain('預算');
  });

  it('KV get 拋錯 → 不拋 5xx，走 not-ready', async () => {
    guardNoUpstreamFetch();
    mockKv(new Map<string, string>([[CB_KV_KEY, 'whatever']]), true);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & { ok: boolean; precomputed: boolean };

    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
    expect(body.precomputed).toBe(false);
  });

  it('getCloudflareContext 本身拋錯（非 Workers 環境）→ 走 not-ready', async () => {
    guardNoUpstreamFetch();
    mockGetCloudflareContext.mockRejectedValue(new Error('no cloudflare context'));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse & { ok: boolean; precomputed: boolean };

    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
  });
});
