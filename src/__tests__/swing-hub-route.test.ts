/** @jest-environment node */

/**
 * `/api/skynet/swing-hub` 路由測試
 * ----------------------------------------------------------------------------
 * 以 mock 上游 fetch + mock godBridge.getKv 驗證：
 *   1. 各資料源正常時，對應 tab 有 items；badnews 固定留白。
 *   2. 大戶 delta 欄位為 null（累積中），回應帶 weeksAccumulated。
 *   3. KV 可用時，日 K 條件（ma60）能命中（端到端走 loadRange）。
 *   4. 反向實驗：所有上游失敗時，HTTP 仍為 200，且每個 tab 皆 items 空 +
 *      unavailable_reason（絕不以假資料或整體 500 回應）。
 *
 * 全程不打真實上游。
 */

import { GET } from '@/app/api/skynet/swing-hub/route';

const mockGetKv = jest.fn();
jest.mock('@/lib/godBridge', () => ({ getKv: () => mockGetKv() }));

const TDCC_URL = 'https://openapi.tdcc.com.tw/v1/opendata/1-5';
const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86';
const MARGN_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN';
const REV_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const EXRIGHT_URL = 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mockGetKv.mockReset();
});

// ---------------------------------------------------------------------------
// 上游 payload 產生器
// ---------------------------------------------------------------------------

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tdccPayload() {
  const grade = (g: string, pct: string) => ({
    證券代號: '2330  ',
    '占集保庫存數比例%': pct,
    人數: '1',
    '\ufeff資料日期': '20260918',
    股數: '1',
    持股分級: g,
  });
  return [grade('12', '10.00'), grade('13', '5.00'), grade('14', '3.00'), grade('15', '60.00'), grade('16', '0'), grade('17', '100')];
}

function t86Payload(date: string) {
  const row = (code: string, name: string, foreignLots: number, trustLots: number) => {
    const r = Array.from({ length: 19 }, () => '0');
    r[0] = code;
    r[1] = name;
    r[4] = String(foreignLots * 1000);
    r[10] = String(trustLots * 1000);
    r[18] = String((foreignLots + trustLots) * 1000);
    return r;
  };
  return {
    stat: 'OK',
    date,
    data: [row('2330', '台積電', 100, 10), row('2317', '鴻海', 50, 5), row('2454', '聯發科', 80, 8)],
  };
}

function margnPayload(date: string) {
  const bal = date >= '20260901' ? '8000' : '9000';
  const r = Array.from({ length: 16 }, () => '0');
  r[0] = '2330';
  r[1] = '台積電';
  r[6] = bal; // index 6 = 融資今日餘額
  return { stat: 'OK', date, tables: [{ data: [] }, { data: [r] }] };
}

function revPayload() {
  return [
    {
      公司代號: '2330',
      公司名稱: '台積電',
      產業別: '半導體業',
      '營業收入-上月比較增減(%)': '5',
      '營業收入-去年同月增減(%)': '10',
      資料年月: '11508',
    },
  ];
}

// ---------------------------------------------------------------------------
// fetch 安裝器
// ---------------------------------------------------------------------------

function twseYmd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 最近 10 個日曆天中最新的 3 天（＝視為有 T86 資料的日期）。 */
function latestThreeDates(): Set<string> {
  const now = new Date();
  const all: string[] = [];
  for (let off = 0; off < 10; off += 1) all.push(twseYmd(new Date(now.getTime() - off * 86_400_000)));
  all.sort();
  return new Set(all.slice(-3));
}

function installFetch(opts: { ok: boolean; okDates?: Set<string> }): void {
  globalThis.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (!opts.ok) return new Response('upstream down', { status: 500 });
    if (url.startsWith(TDCC_URL)) return json(tdccPayload());
    if (url.startsWith(T86_URL)) {
      const date = /date=(\d{8})/.exec(url)?.[1] ?? '';
      if (opts.okDates && !opts.okDates.has(date)) return json({ stat: '很抱歉，沒有符合條件的資料!' });
      return json(t86Payload(date));
    }
    if (url.startsWith(MARGN_URL)) {
      const date = /date=(\d{8})/.exec(url)?.[1] ?? '';
      return json(margnPayload(date));
    }
    if (url.startsWith(REV_URL)) return json(revPayload());
    if (url.startsWith(EXRIGHT_URL)) return json({ stat: 'OK', data: [] });
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

/** 假 KV：對每個 mkt:bars:<date> 回一個單調遞增的 2330 序列。 */
const fakeKv = {
  get: async (key: string): Promise<string | null> => {
    const m = /mkt:bars:(\d{4}-\d{2}-\d{2})/.exec(key);
    if (!m) return null;
    const date = m[1];
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse('2020-01-01T00:00:00Z')) / 86_400_000);
    const close = 100 + days;
    return JSON.stringify({
      date,
      twse: [['2330', close, close, close, close, 1000]],
      tpex: [],
      counts: { twse: 1, tpex: 0 },
      rawCounts: { twse: 1, tpex: 0 },
      fetchedAt: 't',
      provenance: { source: 'self-produced', upstream: 'x' },
    });
  },
  put: async (): Promise<void> => {},
};

// ---------------------------------------------------------------------------
// 測試
// ---------------------------------------------------------------------------

type Tab = { id: string; title: string; desc: string; items: Array<Record<string, unknown>>; unavailable_reason?: string; note?: string };
type Body = {
  ok: boolean;
  data_date: string;
  week: string;
  weeksAccumulated: number;
  tabs: Tab[];
  note: string;
  provenance: { source: string; upstreams: string[] };
  fetchedAt: string;
};

describe('GET /api/skynet/swing-hub', () => {
  it('上游正常（KV 未綁定）：上游 tab 有 items、日 K tab 誠實留白、badnews 固定留白', async () => {
    mockGetKv.mockResolvedValue(undefined);
    installFetch({ ok: true, okDates: latestThreeDates() });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    const byId = Object.fromEntries(body.tabs.map((t) => [t.id, t])) as Record<string, Tab>;

    expect(body.ok).toBe(true);
    expect(body.provenance.source).toBe('self-produced');
    expect(typeof body.fetchedAt).toBe('string');
    expect(body.tabs).toHaveLength(16);

    // 上游可自產的 tab
    expect(byId.foreign.items.length).toBeGreaterThan(0);
    expect(byId.trust.items.length).toBeGreaterThan(0);
    expect(byId.both.items.length).toBeGreaterThan(0);
    expect(byId.whale_in.items.length).toBeGreaterThan(0);
    expect(byId.whale_out.items.length).toBeGreaterThan(0);
    expect(byId.margin.items.length).toBeGreaterThan(0);
    expect(byId.revenue.items.length).toBeGreaterThan(0);

    // 大戶 delta 累積中
    expect(byId.whale_in.items[0].delta_1w).toBeNull();
    expect(byId.whale_in.items[0].delta_4w).toBeNull();
    expect(byId.whale_in.items[0].up_weeks).toBeNull();
    expect(body.weeksAccumulated).toBe(1);
    expect(byId.whale_in.note).toBeTruthy();

    // 日 K tab：KV 未綁定 → 誠實留白
    expect(byId.ma60.items).toHaveLength(0);
    expect(byId.ma60.unavailable_reason).toBeTruthy();

    // badnews 固定留白
    expect(byId.badnews.items).toHaveLength(0);
    expect(byId.badnews.unavailable_reason).toBe('本站尚無新聞資料源。');
  });

  it('KV 可用：日 K 條件（ma60）能命中（端到端走 loadRange）', async () => {
    mockGetKv.mockResolvedValue(fakeKv);
    installFetch({ ok: true, okDates: latestThreeDates() });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    const ma60 = body.tabs.find((t) => t.id === 'ma60') as Tab;
    expect(ma60.items.length).toBeGreaterThan(0);
    expect(ma60.unavailable_reason).toBeUndefined();
    expect(ma60.items[0].stock_id).toBe('2330');
  });

  it('反向實驗：所有上游失敗 → HTTP 200，且每個 tab items 空 + unavailable_reason', async () => {
    mockGetKv.mockResolvedValue(undefined);
    installFetch({ ok: false });

    const res = await GET();
    expect(res.status).toBe(200); // 絕不整體 500
    const body = (await res.json()) as Body;

    for (const tab of body.tabs) {
      expect(tab.items).toHaveLength(0);
      expect(tab.unavailable_reason).toBeTruthy();
    }
    // 大戶 tab 亦誠實標示上游無回應
    const whale = body.tabs.find((t) => t.id === 'whale_in') as Tab;
    expect(whale.unavailable_reason).toContain('TDCC');
    expect(body.weeksAccumulated).toBe(0);
  });
});
