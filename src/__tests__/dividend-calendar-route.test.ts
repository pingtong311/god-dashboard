/** @jest-environment node */

/**
 * /api/skynet/dividend-calendar 與除權息資料層（純函式）單元測試。
 *
 * 重點驗證：
 *   - 民國年日期轉換（「115年10月08日」→「2026-10-08」、緊湊「1150924」）
 *   - 距今天數計算、未來 30 天視窗篩選、依除息日＋代號排序
 *   - 現金殖利率自算（現金股利 ÷ 收盤價 × 100%）；缺收盤價 → null（顯示「—」，不填 0）
 *   - 無償配股率 → 元（× 面額 10 元）
 *   - 「待公告」現金股利（非數字）→ 整列剔除
 *   - 上游失敗 → 502 dividend_calendar_upstream_error（不回假資料）
 *
 * 2026-10-04 追加（P1-B1 離線預算遷移）：
 *   - 有預算 → **零解析直送**（位元組與 KV 內字串完全一致）
 *   - **KV 已綁定但無預算 → 降級即時計算**（寬鬆模式；**絕不回 `ready:false`**）
 *     ⚠ 這是本端點與 treemap / trading-dates 嚴格模式最關鍵的差異：
 *       `/dividend` 頁要求 `available === true` 且 `items` 為陣列，
 *       回 `ready:false` 會讓「原本可用的頁面」變成錯誤狀態。
 *   - KV 讀取拋錯 → 同樣降級，不把錯誤鎖在快取裡
 *
 * 全程 mock 上游 fetch，不打真實證交所。
 */

import { GET } from '@/app/api/skynet/dividend-calendar/route';
import {
  buildCloseMap,
  buildDividendItems,
  buildIndustryMap,
  computeCashYield,
  daysUntil,
  parseRocCompactDate,
  parseRocDate,
  stockDividendToYuan,
} from '@/app/dividend/dividend-data';

/**
 * KV 綁定以 `@opennextjs/cloudflare` 的 `getCloudflareContext` 為唯一入口
 * （見 src/lib/godBridge.ts 的說明）。這裡把它換成可注入的替身，
 * 讓「KV 已綁定 / 未綁定」兩種情境都能測。
 */
const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 把西元 Date 轉成民國年中文（對齊 TWT48U 日期格式）。 */
function rocDate(d: Date): string {
  const roc = d.getFullYear() - 1911;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${roc}年${mm}月${dd}日`;
}

/** 造一列 13 欄的 TWT48U 資料。 */
function exRow(over: Partial<Record<number, string>> & { 0: string; 1: string; 2: string }): string[] {
  const base = Array.from({ length: 13 }, () => '0');
  for (const key of Object.keys(over)) base[Number(key)] = over[Number(key)] as string;
  return base;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  // ⚠ 一定要重置：否則前一個測試殘留的 KV 綁定會被下一個測試讀到。
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

describe('dividend 純函式', () => {
  it('parseRocDate：民國年中文 → ISO；格式不符回 null', () => {
    expect(parseRocDate('115年10月08日')).toBe('2026-10-08');
    expect(parseRocDate('115年01月01日')).toBe('2026-01-01');
    expect(parseRocDate('亂碼')).toBeNull();
  });

  it('parseRocCompactDate：民國年緊湊 → ISO；不符回 null', () => {
    expect(parseRocCompactDate('1150924')).toBe('2026-09-24');
    expect(parseRocCompactDate('bad')).toBeNull();
  });

  it('daysUntil：以日曆日計算天數差', () => {
    const today = new Date(2026, 8, 24); // 2026-09-24
    expect(daysUntil(today, '2026-09-24')).toBe(0);
    expect(daysUntil(today, '2026-10-01')).toBe(7);
    expect(daysUntil(today, '2026-09-20')).toBe(-4);
  });

  it('computeCashYield：現金股利 ÷ 收盤價 × 100%；缺收盤價或無現金股利回 null', () => {
    expect(computeCashYield(0.5, 35.5)).toBe(1.41);
    expect(computeCashYield(5, 70.2)).toBe(7.12);
    expect(computeCashYield(0.5, 15)).toBe(3.33);
    expect(computeCashYield(0, 35.5)).toBeNull();
    expect(computeCashYield(5, null)).toBeNull();
    expect(computeCashYield(5, 0)).toBeNull();
  });

  it('stockDividendToYuan：無償配股率 × 面額 10 元', () => {
    expect(stockDividendToYuan('0.04999999')).toBe(0.5);
    expect(stockDividendToYuan('0.08000000')).toBe(0.8);
    expect(stockDividendToYuan('0')).toBe(0);
    expect(stockDividendToYuan('')).toBe(0);
  });

  it('buildCloseMap / buildIndustryMap：只收有效值', () => {
    const close = buildCloseMap([
      { Code: '1235', ClosingPrice: '35.50' },
      { Code: '2109', ClosingPrice: '15.00' },
      { Code: '9999', ClosingPrice: '--' },
    ]);
    expect(close.get('1235')).toBe(35.5);
    expect(close.get('2109')).toBe(15);
    expect(close.has('9999')).toBe(false);

    const industry = buildIndustryMap([
      { 公司代號: '1235', 產業別: '02' },
      { 公司代號: '2109', 產業別: '11' },
      { 公司代號: '8888', 產業別: 'ZZ' },
    ]);
    expect(industry.get('1235')).toBe('食品工業');
    expect(industry.get('2109')).toBe('橡膠工業');
    expect(industry.get('8888')).toBe('');
  });

  it('buildDividendItems：篩選 30 天視窗、排序、殖利率自算、待公告剔除', () => {
    const today = new Date(2026, 8, 24); // 2026-09-24
    const closeMap = new Map<string, number>([
      ['1235', 35.5],
      ['2109', 15],
    ]);
    const industryMap = new Map<string, string>([
      ['1235', '食品工業'],
      ['2109', '橡膠工業'],
    ]);

    const rows: string[][] = [
      exRow({ 0: '115年09月24日', 1: '1235', 2: '興泰', 3: '權息', 4: '0.04999999', 7: '0.50000000' }),
      exRow({ 0: '115年09月29日', 1: '2109', 2: '華豐', 3: '息', 7: '0.50000000' }),
      exRow({ 0: '115年10月02日', 1: '6834', 2: '天二科技', 3: '權', 7: '0.00000000' }), // 權-only → cash 0 保留
      exRow({ 0: '115年10月05日', 1: '00400A', 2: '主動國泰動能高息', 3: '息', 7: '<p>待公告實際收益分配金額</p>' }), // 待公告 → 剔除
      exRow({ 0: '115年01月01日', 1: '9999', 2: '舊資料', 3: '息', 7: '1.00000000' }), // 過期 → 剔除
      exRow({ 0: '115年12月31日', 1: '8888', 2: '太遠', 3: '息', 7: '1.00000000' }), // 超過 30 天 → 剔除
    ];

    const items = buildDividendItems(rows, closeMap, industryMap, today);
    expect(items.map((i) => i.stock_id)).toEqual(['1235', '2109', '6834']);

    const first = items[0];
    expect(first.label).toBe('1235 興泰');
    expect(first.industry).toBe('食品工業');
    expect(first.ex_date).toBe('2026-09-24');
    expect(first.days_left).toBe(0);
    expect(first.cash_dividend).toBe(0.5);
    expect(first.stock_dividend).toBe(0.5);
    expect(first.close).toBe(35.5);
    expect(first.cash_yield_pct).toBe(1.41);

    // 6834 天二科技：無收盤價 → 殖利率 null（顯示「—」，不填 0）
    const third = items[2];
    expect(third.stock_id).toBe('6834');
    expect(third.cash_dividend).toBe(0);
    expect(third.close).toBeNull();
    expect(third.cash_yield_pct).toBeNull();
  });
});

describe('GET /api/skynet/dividend-calendar', () => {
  function mockUpstream(twRows: string[][]): void {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('TWT48U')) return jsonRes({ stat: 'OK', data: twRows });
      if (url.includes('STOCK_DAY_AVG_ALL')) {
        return jsonRes([
          { Date: '1150924', Code: '1235', Name: '興泰', ClosingPrice: '35.50', MonthlyAveragePrice: '37.94' },
          { Date: '1150924', Code: '2109', Name: '華豐', ClosingPrice: '15.00', MonthlyAveragePrice: '15.20' },
        ]);
      }
      if (url.includes('t187ap03_L')) {
        return jsonRes([
          { 公司代號: '1235', 產業別: '02' },
          { 公司代號: '2109', 產業別: '11' },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  }

  it('成功：回 200、未來 30 天 items、殖利率自算、provenance 標記', async () => {
    const today = new Date();
    const in5 = new Date(today.getTime() + 5 * 86_400_000);
    mockUpstream([
      exRow({ 0: rocDate(today), 1: '1235', 2: '興泰', 3: '權息', 4: '0.04999999', 7: '0.50000000' }),
      exRow({ 0: rocDate(in5), 1: '2109', 2: '華豐', 3: '息', 7: '0.50000000' }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      items: Array<{
        stock_id: string;
        industry: string;
        ex_date: string;
        days_left: number;
        cash_yield_pct: number | null;
      }>;
      note: string;
      provenance: { source: string; upstream: string };
      fetchedAt: string;
    };

    expect(body.available).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].stock_id).toBe('1235');
    expect(body.items[0].days_left).toBe(0);
    expect(body.items[0].cash_yield_pct).toBe(1.41);
    expect(body.items[0].industry).toBe('食品工業');
    expect(body.items[1].stock_id).toBe('2109');
    expect(body.items[1].days_left).toBe(5);
    expect(body.items[1].cash_yield_pct).toBe(3.33);
    expect(body.note).toContain('非投資建議');
    expect(body.provenance.source).toBe('self-produced');
    expect(body.provenance.upstream).toContain('TWT48U');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('主要上游失敗 → 502，不回假資料', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'dividend_calendar_upstream_error' });
  });

  it('輔助上游（收盤價／產業別）失敗時仍回 200，殖利率與產業別誠實留空', async () => {
    const today = new Date();
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('TWT48U')) {
        return jsonRes({
          stat: 'OK',
          data: [exRow({ 0: rocDate(today), 1: '1235', 2: '興泰', 3: '息', 7: '0.50000000' })],
        });
      }
      return new Response('nope', { status: 500 }); // 收盤價／產業別失敗
    }) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ stock_id: string; close: number | null; cash_yield_pct: number | null; industry: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].close).toBeNull();
    expect(body.items[0].cash_yield_pct).toBeNull(); // 不填 0
    expect(body.items[0].industry).toBe(''); // 誠實留空
  });
});

// ─────────────────────────────────────────────────────────────
// C. route：離線預算（P1-B1，2026-10-04）
// ─────────────────────────────────────────────────────────────

type Res = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: Headers;
};
type RouteModule = { GET: () => Promise<Res> };

/**
 * 取一份「全新 registry」的 GET。
 *
 * ⚠ 為什麼不能用檔首 import 的那個 `GET`：`src/lib/kvReadCache.ts` 的 L1 是
 *   **模組層級 Map**，會在同一測試檔的 `it()` 之間存活 → 前一個測試塞進去的
 *   預算結果會被下一個測試讀到，造成「明明 KV 無值卻回命中」這類**假失敗**。
 *   `jest.isolateModules` 每次給一份新的模組 registry（連帶新的空 Map）。
 */
function freshGet(): () => Promise<Res> {
  let GET: (() => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/dividend-calendar/route') as RouteModule;
    GET = mod.GET;
  });
  return GET!;
}

/** 造一個最小可用的 KV 替身（`getThrows` 用來模擬 KV 讀取拋錯）。 */
function makeKvStore(entries: Record<string, string> = {}, opts: { getThrows?: boolean } = {}) {
  const map = new Map<string, string>(Object.entries(entries));
  return {
    map,
    kv: {
      get: jest.fn(async (key: string) => {
        if (opts.getThrows) throw new Error('kv read failed');
        return map.get(key) ?? null;
      }),
      put: jest.fn(async (key: string, value: string) => {
        map.set(key, value);
      }),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    },
  };
}

/** 讓「降級即時計算」可用的上游替身（今日＋5 天後各一列除權息）。 */
function mockLiveUpstream(): jest.Mock {
  const today = new Date();
  const in5 = new Date(today.getTime() + 5 * 86_400_000);
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('TWT48U')) {
      return jsonRes({
        stat: 'OK',
        data: [
          exRow({ 0: rocDate(today), 1: '1235', 2: '興泰', 3: '權息', 4: '0.04999999', 7: '0.50000000' }),
          exRow({ 0: rocDate(in5), 1: '2109', 2: '華豐', 3: '息', 7: '0.50000000' }),
        ],
      });
    }
    if (url.includes('STOCK_DAY_AVG_ALL')) {
      return jsonRes([
        { Date: '1150924', Code: '1235', Name: '興泰', ClosingPrice: '35.50', MonthlyAveragePrice: '37.94' },
        { Date: '1150924', Code: '2109', Name: '華豐', ClosingPrice: '15.00', MonthlyAveragePrice: '15.20' },
      ]);
    }
    if (url.includes('t187ap03_L')) {
      return jsonRes([
        { 公司代號: '1235', 產業別: '02' },
        { 公司代號: '2109', 產業別: '11' },
      ]);
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('dividend-calendar route：離線預算直送（P1-B1）', () => {
  /** 一份「形狀與線上 route 完全一致」的預算結果（攤平，非 { ok, data } 包裝）。 */
  const PRECOMPUTED_BODY = JSON.stringify({
    available: true,
    items: [
      {
        stock_id: '1235',
        label: '1235 興泰',
        industry: '食品工業',
        ex_date: '2026-10-08',
        days_left: 4,
        cash_dividend: 0.5,
        stock_dividend: 0.5,
        close: 35.5,
        cash_yield_pct: 1.41,
      },
    ],
    note: '除息＝發現金、除權＝發股票…非投資建議。',
    provenance: {
      source: 'self-produced',
      upstream: 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json',
    },
    fetchedAt: '2026-10-04T08:35:00.000Z',
  });

  it('有預算 → 零解析直送，位元組與 KV 內字串完全一致', async () => {
    const { kv } = makeKvStore({ 'scan:dividend-calendar': PRECOMPUTED_BODY });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PRECOMPUTED_BODY); // 未經 parse/stringify
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('precomputed-kv');
    // ⚠ 關鍵：命中時**絕不**打上游（那正是 cpuTime 中位數 76ms 的成因）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KV 已綁定但無預算（missing）→ 降級即時計算，不回 ready:false', async () => {
    const { kv } = makeKvStore(); // 空 KV
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    const fetchMock = mockLiveUpstream();

    const res = await freshGet()();
    const body = (await res.json()) as {
      available?: boolean;
      items?: unknown[];
      ready?: boolean;
    };

    expect(res.status).toBe(200);
    // 🔴 本端點的核心契約：**不可以**回 ready:false
    //    （DividendClient 要求 available===true 且 items 為陣列，否則整頁進錯誤狀態）
    expect(body.ready).toBeUndefined();
    expect(body.available).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('live-compute');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('KV 讀取拋錯（error）→ 同樣降級即時計算，不把錯誤鎖進快取', async () => {
    const { kv } = makeKvStore({}, { getThrows: true });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    mockLiveUpstream();

    const res = await freshGet()();
    const body = (await res.json()) as { available?: boolean; ready?: boolean };

    expect(res.status).toBe(200);
    expect(body.ready).toBeUndefined();
    expect(body.available).toBe(true);
  });

  it('KV 未綁定（本地 dev）→ 走即時計算，維持本機可開發性', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    mockLiveUpstream();

    const res = await freshGet()();
    const body = (await res.json()) as { available?: boolean; items?: unknown[] };

    expect(res.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('live-compute');
  });

  it('降級路徑的上游失敗仍誠實回 502（不因降級就放寬誠實原則）', async () => {
    const { kv } = makeKvStore();
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    globalThis.fetch = jest.fn(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch;

    const res = await freshGet()();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'dividend_calendar_upstream_error' });
  });
});
