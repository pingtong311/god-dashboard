/** @jest-environment node */

/**
 * /api/skynet/treemap —— 路由 ＋ 組裝邏輯測試（第一層 QA）。
 *
 * 2026-10-04 起本端點改為「離線預算 ＋ 邊緣零解析直送」。本檔驗證：
 *
 *   A. 組裝邏輯（`buildTreemapFromMiIndex`，純函式）
 *      - stat 非 OK → null（**絕不捏造**）
 *      - 只收 4 碼普通股、價 <= 0 或漲跌無法解析者剔除
 *      - 產業聚合、市值加權漲跌幅、每產業上限 20 檔、依市值排序
 *      - 回應形狀與既有 route 完全一致（ok/date/sectors/marketGroups/totalStocks/fetchedAt）
 *
 *   B. route
 *      - 有預算 → 零解析直送（`X-Skynet-Data-Source: precomputed-kv`）
 *      - 無預算 → 200 + ready:false（**不 5xx、不 fallthrough 重算**）
 *      - `date=YYYYMMDD` → 讀變體 key `scan:treemap:dYYYYMMDD`
 *      - date 格式錯 → 400
 *      - KV 未綁定 → 走即時計算；且**未指定日期時自動解析最近交易日**
 *        （修掉「週末／休市日一律 502」的既有缺陷）
 */

import { NextRequest } from 'next/server';
import { buildTreemapFromMiIndex, classifySector } from '@/lib/treemap';

const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;

type Res = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: Headers;
};
type RouteModule = { GET: (req: NextRequest) => Promise<Res> };

function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/treemap/route') as RouteModule;
    GET = mod.GET;
  });
  return GET!;
}

function makeKvStore(entries: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(entries));
  return {
    map,
    kv: {
      get: jest.fn(async (key: string) => map.get(key) ?? null),
      put: jest.fn(async (key: string, value: string) => {
        map.set(key, value);
      }),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    },
  };
}

function req(url: string): NextRequest {
  return new NextRequest(url);
}

const BASE = 'http://localhost/api/skynet/treemap';

/** 一行每日收盤行情：symbol, name, _, volume, _, _, _, _, price, sign, change。 */
function row(symbol: string, name: string, volume: string, price: string, sign: string, change: string) {
  return [symbol, name, '30,000,000', volume, '2', '1000', '1010', '990', price, sign, change];
}

/** 造出含 tables[8] 的 MI_INDEX 回應。 */
function miIndex(rows: string[][], stat = 'OK') {
  const tables = Array.from({ length: 9 }, () => ({ title: 'x', fields: [], data: [] as string[][] }));
  tables[8] = { title: '每日收盤行情(全部)', fields: [], data: rows };
  return { stat, tables };
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// A. 組裝邏輯（純函式）
// ─────────────────────────────────────────────────────────────

describe('treemap：buildTreemapFromMiIndex（純函式）', () => {
  it('stat 非 OK → null（絕不捏造）', () => {
    expect(buildTreemapFromMiIndex({ stat: '很抱歉，沒有符合條件的資料!', tables: [] }, new Map(), '20261004')).toBeNull();
    expect(buildTreemapFromMiIndex(null, new Map(), '20261004')).toBeNull();
    expect(buildTreemapFromMiIndex({ stat: 'OK' }, new Map(), '20261004')).toBeNull();
  });

  it('只收 4 碼普通股；價 <= 0 或漲跌無法解析者剔除', () => {
    const payload = buildTreemapFromMiIndex(
      miIndex([
        row('2330', '台積電', '30000', '1005', '<p>+</p>', '5'), // ✓
        row('00625K', '無成交', '0', '--', '<p> </p>', '0'), // ✗ 非 4 碼
        row('2317', '鴻海', '12000', '--', '<p>+</p>', '5'), // ✗ 價無法解析
        row('2454', '聯發科', '8000', '0', '<p>+</p>', '5'), // ✗ 價 <= 0
      ]),
      new Map(),
      '20261002',
      '2026-10-02T00:00:00.000Z',
    );

    expect(payload).not.toBeNull();
    expect(payload!.totalStocks).toBe(1);
    expect(payload!.date).toBe('20261002');
    expect(payload!.fetchedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(payload!.sectors.flatMap((s) => s.items).map((i) => i.symbol)).toEqual(['2330']);
  });

  it('漲跌幅以「前一日收盤」為分母，且符號正確', () => {
    // price=1005, change=+5 → prevClose=1000 → +0.5%
    const payload = buildTreemapFromMiIndex(
      miIndex([row('2330', '台積電', '30000', '1005', '<p>+</p>', '5')]),
      new Map(),
      '20261002',
    )!;
    const item = payload.sectors[0].items[0];
    expect(item.change).toBe(5);
    expect(item.changePercent).toBeCloseTo(0.5, 6);

    // 跌：sign 為 '-' → change 為負
    const down = buildTreemapFromMiIndex(
      miIndex([row('2317', '鴻海', '30000', '995', '<p>-</p>', '5')]),
      new Map(),
      '20261002',
    )!;
    expect(down.sectors[0].items[0].change).toBe(-5);
    expect(down.sectors[0].items[0].changePercent).toBeCloseTo((-5 / 1000) * 100, 6);
  });

  it('產業聚合：依市值排序、changePercent 為市值加權、每產業最多 20 檔', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row(`23${String(i).padStart(2, '0')}`, '半導體測試', String(1000 + i), '1005', '<p>+</p>', '5'),
    );
    const payload = buildTreemapFromMiIndex(miIndex(rows), new Map(), '20261002')!;

    expect(payload.totalStocks).toBe(25);
    const semi = payload.sectors.find((s) => s.sector === '半導體')!;
    expect(semi.count).toBe(25);
    expect(semi.items).toHaveLength(20); // 上限 20
    // items 依市值（= 價 × 量）由大到小
    const caps = semi.items.map((i) => i.marketCap);
    expect([...caps].sort((a, b) => b - a)).toEqual(caps);
    // 全部同漲跌幅 → 加權平均等於該值
    expect(semi.changePercent).toBeCloseTo(0.5, 6);
  });

  it('正式產業別：industryMap 命中時優先於關鍵字', () => {
    // 代號 2330 在 industryMap 中為「半導體業」→ 即便名稱無關鍵字也應歸「半導體業」
    const industryMap = new Map([['2330', '半導體業']]);
    const payload = buildTreemapFromMiIndex(
      miIndex([row('2330', '台積電', '30000', '1005', '<p>+</p>', '5')]),
      industryMap,
      '20261002',
    )!;
    const sector = payload.sectors.find((s) => s.items.some((i) => i.symbol === '2330'))!;
    expect(sector.sector).toBe('半導體業');
  });

  it('回應形狀與既有 route 完全一致', () => {
    const payload = buildTreemapFromMiIndex(
      miIndex([row('2330', '半導體測試', '30000', '1005', '<p>+</p>', '5')]),
      new Map(),
      '20261002',
    )!;
    expect(Object.keys(payload).sort()).toEqual(
      ['date', 'fetchedAt', 'marketGroups', 'ok', 'sectors', 'totalStocks'].sort(),
    );
    expect(Object.keys(payload.marketGroups).sort()).toEqual(['ETF', '上市', '上櫃', '其他'].sort());
    expect(payload.ok).toBe(true);
  });

  it('classifySector：依名稱關鍵字分類；未命中回「其他」', () => {
    const empty = new Map<string, string>();
    expect(classifySector('2330', '半導體測試', empty)).toBe('半導體');
    expect(classifySector('2330', '晶圓製造', empty)).toBe('半導體');
    expect(classifySector('2330', 'LED光電', empty)).toBe('光電');
    // ⚠ 已知限制（沿用既有行為，見 lib 檔首說明第 2 點）：
    //    關鍵字表比對不到「台積電」「鴻海」這類簡稱 → 一律歸「其他」。
    //    正式版應改用 TWSE/TPEX 類股對照表，此處先把現況釘住以免無意間改變。
    expect(classifySector('2330', '台積電', empty)).toBe('其他');
    expect(classifySector('2330', '鴻海', empty)).toBe('其他');
  });

  it('classifySector：industryMap 命中時優先回正式產業別', () => {
    const industryMap = new Map([['2330', '半導體業']]);
    expect(classifySector('2330', '台積電', industryMap)).toBe('半導體業');
    // 未命中代號 → 落回關鍵字 / 其他
    expect(classifySector('9999', '台積電', industryMap)).toBe('其他');
  });
});

// ─────────────────────────────────────────────────────────────
// B. route
// ─────────────────────────────────────────────────────────────

describe('treemap route：離線預算直送', () => {
  it('有預算 → 零解析直送原字串', async () => {
    const body = JSON.stringify({ ok: true, date: '20261002', sectors: [], marketGroups: {}, totalStocks: 0 });
    const { kv } = makeKvStore({ 'scan:treemap': body });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(BASE));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body); // 位元組完全一致（未經 parse/stringify）
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('precomputed-kv');
  });

  it('date=YYYYMMDD → 讀變體 key scan:treemap:dYYYYMMDD', async () => {
    const body = JSON.stringify({ ok: true, date: '20261001' });
    const { kv } = makeKvStore({ 'scan:treemap:d20261001': body });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?date=20261001`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });

  it('無預算 → 200 + ready:false（不 5xx、不 fallthrough 重算）', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()(req(BASE));
    const parsed = (await res.json()) as { ok: boolean; ready: boolean; endpoint: string };

    expect(res.status).toBe(200);
    expect(parsed.ok).toBe(true);
    expect(parsed.ready).toBe(false);
    expect(parsed.endpoint).toBe('treemap');
    // ⚠ 關鍵：KV 已綁定時**絕不**去打上游（那正是 1102 的成因）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('date 格式錯 → 400', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const res = await freshGet()(req(`${BASE}?date=2026-10-02`));
    expect(res.status).toBe(400);
  });
});

describe('treemap route：KV 未綁定（本地開發）→ 即時計算', () => {
  it('未指定日期 → 自動解析最近交易日（修掉週末 502 缺陷）', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });

    // openapi 探測回「未來」日期 → resolveLatestTradingDate 直接採用，不再探測今天。
    // ⚠ openapi 的 `日期` 是**民國 7 碼**格式（'1150916' = 2026-09-16），不是 '115年09月16日'。
    const openapiUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX?type=ALL';
    const fetchMock = jest.fn(async (url: unknown) => {
      const u = String(url);
      if (u === openapiUrl) {
        return new Response(JSON.stringify([{ 日期: '1200101' }]), { status: 200 });
      }
      if (u.includes('afterTrading/MI_INDEX')) {
        return new Response(
          JSON.stringify(miIndex([row('2330', '台積電', '30000', '1005', '<p>+</p>', '5')])),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ok: boolean; date: string; totalStocks: number };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.date).toBe('20310101'); // 由 openapi 的民國 120 年解析而來
    expect(body.totalStocks).toBe(1);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('live-compute');
  });

  it('上游 stat 非 OK → 502（不造假、不回空殼成功）', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });

    globalThis.fetch = jest.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('openapi.twse.com.tw')) {
        return new Response(JSON.stringify([{ 日期: '1200101' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ stat: '沒有符合條件的資料', tables: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await freshGet()(req(`${BASE}?date=20261004`));
    expect(res.status).toBe(502);
  });
});
