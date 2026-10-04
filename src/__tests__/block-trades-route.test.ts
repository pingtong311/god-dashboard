/** @jest-environment node */

/**
 * /api/skynet/block-trades 與鉅額交易資料層（純函式）單元測試。
 *
 * 重點驗證：
 *   - 日期轉換（TWSE YYYYMMDD、TPEX 民國 YYYYMMDD → ISO）
 *   - 成交金額解析（千分位逗號）
 *   - TWSE 依代號彙總、剔除「總計」列、依金額由大到小排序
 *   - TPEX（上櫃）openapi 依代號彙總（Code/Name trim）
 *   - 兩市合併（實站 = 上市 + 上櫃）後排序
 *   - 非交易日回推（首日空 → 次日有資料）
 *   - 日期不一致 → 不併入並記 gaps；TPEX 失敗 → 記 gaps（不回假資料）
 *   - 證交所上游全數失敗 → 502 block_trades_upstream_error
 *
 * 2026-10-04 追加（P1-B1d 離線預算遷移）：
 *   - 有預算 → **零解析直送**（位元組與 KV 內字串完全一致）
 *   - **KV 已綁定但無預算 → 降級即時計算**（寬鬆模式；**絕不回 `ready:false`**）
 *     ⚠ 與 dividend-calendar 同因：`/block-trades` 頁要求 `available === true`
 *       且 `items` 為陣列，回 `ready:false` 會讓「原本可用的頁面」變成錯誤狀態。
 *   - KV 讀取拋錯 → 同樣降級，不把錯誤鎖在快取裡
 *
 * 全程 mock 上游 fetch，不打真實證交所／櫃買中心。
 */

import { GET } from '@/app/api/skynet/block-trades/route';
import {
  aggregateBlockTrades,
  aggregateTpexBlockTrades,
  formatDisplayDate,
  formatTwseDate,
  mergeBlockTradeItems,
  parseAmountYuan,
  parseRocCompactDate,
  type TpexBlockRow,
} from '@/app/block-trades/block-trades-data';

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

/** 依 URL 分派 TWSE / TPEX 兩個上游的 mock。 */
function mockUpstreams(
  twse: unknown,
  tpex: unknown,
  opts: { twseStatus?: number; tpexStatus?: number } = {},
): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('tpex_daily_qutoes_block')) {
      const st = opts.tpexStatus ?? 200;
      return st === 200 ? jsonRes(tpex) : new Response('nope', { status: st });
    }
    if (url.includes('BFIAUU')) {
      const st = opts.twseStatus ?? 200;
      return st === 200 ? jsonRes(twse) : new Response('nope', { status: st });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

/** 實測 2026-09-24 的 TPEX（上櫃）6 筆原始列。 */
const TPEX_20260924: TpexBlockRow[] = [
  { Date: '1150924', Code: '5274', Name: '信驊 ', TradeValue: '20485000' },
  { Date: '1150924', Code: '5274', Name: '信驊', TradeValue: '19815290' },
  { Date: '1150924', Code: '5347', Name: '世界', TradeValue: '25527000' },
  { Date: '1150924', Code: '5347', Name: '世界', TradeValue: '21393743' },
  { Date: '1150924', Code: '5347', Name: '世界', TradeValue: '40311681' },
  { Date: '1150924', Code: '6187', Name: '萬潤', TradeValue: '28559280' },
];

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  // ⚠ 一定要重置：否則前一個測試殘留的 KV 綁定會被下一個測試讀到。
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

describe('block-trades 純函式', () => {
  it('formatTwseDate：西元 Date → YYYYMMDD', () => {
    expect(formatTwseDate(new Date(2026, 8, 24))).toBe('20260924');
    expect(formatTwseDate(new Date(2026, 0, 3))).toBe('20260103');
  });

  it('formatDisplayDate：YYYYMMDD → YYYY-MM-DD；格式不符原樣回傳', () => {
    expect(formatDisplayDate('20260924')).toBe('2026-09-24');
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
  });

  it('parseRocCompactDate：民國 YYYYMMDD → ISO；不符回 null', () => {
    expect(parseRocCompactDate('1150924')).toBe('2026-09-24');
    expect(parseRocCompactDate('1150923')).toBe('2026-09-23');
    expect(parseRocCompactDate('bad')).toBeNull();
  });

  it('parseAmountYuan：去千分位逗號；無法解析回 0', () => {
    expect(parseAmountYuan('220,020,000')).toBe(220_020_000);
    expect(parseAmountYuan(' 1,000 ')).toBe(1000);
    expect(parseAmountYuan('')).toBe(0);
    expect(parseAmountYuan(undefined)).toBe(0);
  });

  it('aggregateBlockTrades（TWSE）：同代號彙總、剔除「總計」、依金額由大到小排序', () => {
    const rows: string[][] = [
      ['6669', '緯穎', '逐筆交易', '100', '1,000', '1,000,000,000'], // 10 億
      ['6669', '緯穎', '配對交易', '100', '500', '500,000,000'], // 5 億
      ['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000'], // 20 億
      ['總計', '', '', '', '2,500', '3,500,000,000'], // 彙總列，必須剔除
      ['0050', '元大台灣50', '配對交易', '1', '2'], // 欄位不足 → 剔除
    ];
    const items = aggregateBlockTrades(rows);

    expect(items.map((i) => i.stock_id)).toEqual(['2330', '6669']);
    expect(items[0]).toMatchObject({ stock_id: '2330', label: '2330 台積電', n: 1, money_yi: 20 });
    expect(items[1]).toMatchObject({ stock_id: '6669', label: '6669 緯穎', n: 2, money_yi: 15 });
    expect(items.some((i) => i.stock_id === '總計')).toBe(false);
  });

  it('aggregateTpexBlockTrades（TPEX）：依代號彙總、trim 名稱、金額換算億元', () => {
    const items = aggregateTpexBlockTrades(TPEX_20260924);
    expect(items.map((i) => i.stock_id)).toEqual(['5347', '5274', '6187']);
    expect(items[0]).toMatchObject({ stock_id: '5347', label: '5347 世界', n: 3, money_yi: 0.87 });
    expect(items[1]).toMatchObject({ stock_id: '5274', label: '5274 信驊', n: 2, money_yi: 0.4 }); // 名稱右補空白已 trim
    expect(items[2]).toMatchObject({ stock_id: '6187', label: '6187 萬潤', n: 1, money_yi: 0.29 });
  });

  it('mergeBlockTradeItems：兩市聯集後依 money_yi 降冪', () => {
    const twse = aggregateBlockTrades([['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']]);
    const tpex = aggregateTpexBlockTrades(TPEX_20260924);
    const merged = mergeBlockTradeItems(twse, tpex);
    expect(merged.map((i) => i.stock_id)).toEqual(['2330', '5347', '5274', '6187']);
  });

  it('金額四捨五入對齊實站（toFixed(2)：1.095 → 1.09，非 1.1）', () => {
    // 實站 2376 技嘉 = 109,500,000 元 = 1.095 億 → 顯示 1.09 億。
    const items = aggregateBlockTrades([['2376', '技嘉', '逐筆交易', '100', '1,000', '109,500,000']]);
    expect(items[0].money_yi).toBe(1.09);
  });
});

describe('GET /api/skynet/block-trades', () => {
  it('成功：TWSE + TPEX 合併、provenance 同時記錄兩來源、gaps 為空', async () => {
    mockUpstreams(
      {
        stat: 'OK',
        date: '20260924',
        data: [
          ['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000'],
          ['總計', '', '', '', '1,000', '2,000,000,000'],
        ],
      },
      TPEX_20260924,
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      date: string;
      data_scope: string;
      next_update: string;
      items: Array<{ stock_id: string; label: string; n: number; money_yi: number }>;
      gaps: string[];
      provenance: { source: string; upstream: { twse: string; tpex: string | null } };
      fetchedAt: string;
    };

    expect(body.available).toBe(true);
    expect(body.date).toBe('2026-09-24');
    expect(body.data_scope).toBe('盤後');
    expect(body.next_update).toBe('下一交易日 23:08');
    // 上市 2330 + 上櫃 5347/5274/6187，合併後依金額降冪
    expect(body.items.map((i) => i.stock_id)).toEqual(['2330', '5347', '5274', '6187']);
    expect(body.items[0]).toMatchObject({ stock_id: '2330', money_yi: 20 });
    expect(body.items[1]).toMatchObject({ stock_id: '5347', n: 3, money_yi: 0.87 });
    expect(body.items[2]).toMatchObject({ stock_id: '5274', n: 2, money_yi: 0.4 });
    expect(body.items[3]).toMatchObject({ stock_id: '6187', n: 1, money_yi: 0.29 });
    expect(body.gaps).toEqual([]);
    expect(body.provenance.source).toBe('self-produced');
    expect(body.provenance.upstream.twse).toContain('BFIAUU');
    expect(body.provenance.upstream.twse).toContain('date=');
    expect(body.provenance.upstream.tpex).toContain('tpex_daily_qutoes_block');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('TPEX 失敗 → 仍回 200，items 僅上市，gaps 誠實標註（不回假資料）', async () => {
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']] },
      null,
      { tpexStatus: 500 },
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ stock_id: string }>;
      gaps: string[];
      provenance: { upstream: { tpex: string | null } };
    };
    expect(body.items.map((i) => i.stock_id)).toEqual(['2330']);
    expect(body.gaps.some((g) => g.includes('TPEX'))).toBe(true);
    expect(body.provenance.upstream.tpex).toBeNull();
  });

  it('TPEX 日期與 TWSE 不一致 → 不併入，gaps 標註日期不同', async () => {
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']] },
      [{ Date: '1150923', Code: '5274', Name: '信驊', TradeValue: '20485000' }],
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      date: string;
      items: Array<{ stock_id: string }>;
      gaps: string[];
    };
    expect(body.date).toBe('2026-09-24');
    expect(body.items.map((i) => i.stock_id)).toEqual(['2330']); // 未併入 TPEX
    expect(body.gaps.some((g) => g.includes('不同'))).toBe(true);
  });

  it('非交易日回推：首日空資料 → 次日有資料', async () => {
    let twseCall = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('tpex_daily_qutoes_block')) return jsonRes([]);
      twseCall += 1;
      if (twseCall === 1) return jsonRes({ stat: 'OK', date: '20260928', data: [] });
      return jsonRes({
        stat: 'OK',
        date: '20260924',
        data: [['6669', '緯穎', '逐筆交易', '100', '1,000', '1,000,000,000']],
      });
    }) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; items: unknown[] };
    expect(body.date).toBe('2026-09-24');
    expect(body.items).toHaveLength(1);
    expect(twseCall).toBe(2);
  });

  it('證交所上游全數失敗（10 天回推都失敗）→ 502，不回假資料', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'block_trades_upstream_error' });
  });

  it('證交所上游只有「總計」列 → 視為無資料 → 502', async () => {
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['總計', '', '', '', '2,500', '3,500,000,000']] },
      TPEX_20260924,
    );

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'block_trades_upstream_error' });
  });
});

// ─────────────────────────────────────────────────────────────
// C. route：離線預算（P1-B1d，2026-10-04）
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
    const mod = require('@/app/api/skynet/block-trades/route') as RouteModule;
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

describe('block-trades route：離線預算直送（P1-B1d）', () => {
  /** 一份「形狀與線上 route 完全一致」的預算結果（攤平，且 upstream 為物件）。 */
  const PRECOMPUTED_BODY = JSON.stringify({
    available: true,
    date: '2026-10-02',
    data_scope: '盤後',
    next_update: '下一交易日 23:08',
    note: '盤後鉅額成交金額加總，不是進出場。',
    items: [{ stock_id: '2330', label: '2330 台積電', n: 12, money_yi: 12.96 }],
    gaps: [],
    provenance: {
      source: 'self-produced',
      upstream: {
        twse: 'https://www.twse.com.tw/rwd/zh/block/BFIAUU?response=json&date=20261002',
        tpex: 'https://www.tpex.org.tw/openapi/v1/tpex_daily_qutoes_block',
      },
    },
    fetchedAt: '2026-10-04T08:35:00.000Z',
  });

  it('有預算 → 零解析直送，位元組與 KV 內字串完全一致', async () => {
    const { kv } = makeKvStore({ 'scan:block-trades': PRECOMPUTED_BODY });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PRECOMPUTED_BODY); // 未經 parse/stringify
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('precomputed-kv');
    // ⚠ 關鍵：命中時**絕不**打上游（那正是 cpuTime 中位 18ms 的成因）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KV 已綁定但無預算（missing）→ 降級即時計算，不回 ready:false', async () => {
    const { kv } = makeKvStore(); // 空 KV
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']] },
      TPEX_20260924,
    );

    const res = await freshGet()();
    const body = (await res.json()) as {
      available?: boolean;
      items?: unknown[];
      ready?: boolean;
    };

    expect(res.status).toBe(200);
    // 🔴 本端點的核心契約：**不可以**回 ready:false
    //    （BlockTradesClient 要求 available===true 且 items 為陣列，否則整頁進錯誤狀態）
    expect(body.ready).toBeUndefined();
    expect(body.available).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(4);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('live-compute');
  });

  it('KV 讀取拋錯（error）→ 同樣降級即時計算，不把錯誤鎖進快取', async () => {
    const { kv } = makeKvStore({}, { getThrows: true });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']] },
      TPEX_20260924,
    );

    const res = await freshGet()();
    const body = (await res.json()) as { available?: boolean; ready?: boolean };

    expect(res.status).toBe(200);
    expect(body.ready).toBeUndefined();
    expect(body.available).toBe(true);
  });

  it('KV 未綁定（本地 dev）→ 走即時計算，維持本機可開發性', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    mockUpstreams(
      { stat: 'OK', date: '20260924', data: [['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000']] },
      TPEX_20260924,
    );

    const res = await freshGet()();
    const body = (await res.json()) as { available?: boolean; items?: unknown[] };

    expect(res.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.items).toHaveLength(4);
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
    expect(await res.json()).toEqual({ ok: false, error: 'block_trades_upstream_error' });
  });
});
