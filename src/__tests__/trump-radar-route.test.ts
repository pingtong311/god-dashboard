/** @jest-environment node */

/**
 * /api/skynet/trump-radar —— 資料層（純函式）＋ route 測試。
 *
 * 2026-10-04 起本端點改為「離線預算 ＋ 邊緣零解析直送」。本檔驗證：
 *
 *   A. 資料層（src/app/trump/trump-data.ts）
 *      - clampDays 夾範圍（非法 → 45；0 → 1；999 → 90）
 *      - buildEnUrl / buildTwUrl 的 query 與 `when:<days>d` 控窗
 *      - buildTrumpRadarResponse 的**形狀**（攤平、upstream 為字串陣列、13 個鍵）
 *
 *   B. route：離線預算（**嚴格模式**）
 *      - 有預算 → 零解析直送（位元組與 KV 內字串完全一致、**不打上游**）
 *      - 無預算 → 200 + ready:false，且**絕不打上游**
 *        ⚠ 這是本端點與 dividend-calendar / block-trades 的關鍵差異：
 *          那兩支遷移前是「好的」，回 ready:false 會把可用頁面改壞 → 用寬鬆模式；
 *          本端點遷移前**本來就是壞的**（邊緣端三條上游全不可達、8.48s 後回
 *          upstream_error），回 ready:false 對使用者等價、且省下 8.48s。
 *      - KV 讀取拋錯 → 同樣回 ready:false（不 fallthrough 燒 8 秒逾時）
 *      - `days != 45` → **不讀** scan:trump-radar，走即時計算（保留 API 相容性）
 *
 *   C. route：KV 未綁定（本地開發）→ 即時計算
 *      - 三條上游正常 → ok:true 且 items 為陣列
 *      - 主要上游（英文 Google News）失敗 → 200 + ok:false（**不 5xx、不回空陣列**）
 *
 * 全程 mock 上游 fetch，不打真實 Google News／白宮。
 */

import { NextRequest } from 'next/server';
import { DEFAULT_DAYS, buildEnUrl, buildTwUrl, clampDays } from '@/app/trump/trump-data';

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

/**
 * 取一份「全新 registry」的 GET。
 *
 * ⚠ `src/lib/kvReadCache.ts` 的 L1 是**模組層級 Map**，會在同一測試檔的 `it()`
 *   之間存活 → 前一個測試塞進去的預算結果會被下一個測試讀到（假命中）。
 *   `jest.isolateModules` 每次給一份新的模組 registry（連帶新的空 Map）。
 */
function freshGet(): (req: NextRequest) => Promise<Res> {
  let GET: ((req: NextRequest) => Promise<Res>) | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/app/api/skynet/trump-radar/route') as RouteModule;
    GET = mod.GET;
  });
  return GET!;
}

function makeKvStore(entries: Record<string, string> = {}, opts: { getThrows?: boolean } = {}) {
  const map = new Map<string, string>(Object.entries(entries));
  const kv = {
    get: jest.fn(async (key: string) => {
      if (opts.getThrows) throw new Error('kv read failed');
      return map.get(key) ?? null;
    }),
    put: jest.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    list: jest.fn(async () => ({ keys: [], list_complete: true })),
  };
  return { map, kv };
}

function req(url: string): NextRequest {
  return new NextRequest(url);
}

const BASE = 'http://localhost/api/skynet/trump-radar';

/** 落在觀察窗內的 RFC 822 日期（測試執行當下的前 1 天）。 */
const RECENT_PUBDATE = new Date(Date.now() - 24 * 60 * 60 * 1000).toUTCString();

type FixtureItem = { title: string; link: string; pubDate?: string; source?: string };

/** 造一份最小可用的 RSS 2.0。 */
function rss(items: FixtureItem[]): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link>` +
        `<pubDate>${i.pubDate ?? RECENT_PUBDATE}</pubDate>` +
        (i.source ? `<source url="https://example.com">${i.source}</source>` : '') +
        `</item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${body}</channel></rss>`;
}

/** 三條上游的 mock；`enStatus` 非 200 時模擬主要上游失敗。 */
function mockUpstreams(opts: { enStatus?: number } = {}): jest.Mock {
  const enStatus = opts.enStatus ?? 200;
  const fn = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('whitehouse.gov')) {
      return new Response(
        rss([{ title: 'Fact Sheet: Tariff Adjustment - The White House', link: 'https://wh.gov/a' }]),
        { status: 200 },
      );
    }
    if (url.includes('hl=zh-TW')) {
      return new Response(
        rss([{ title: '川普關稅新政 - Yahoo股市', link: 'https://news.example/tw1', source: 'Yahoo股市' }]),
        { status: 200 },
      );
    }
    if (url.includes('news.google.com')) {
      if (enStatus !== 200) return new Response('nope', { status: enStatus });
      return new Response(
        rss([
          { title: 'Nvidia chip export control tightens - CNBC', link: 'https://news.example/en1', source: 'CNBC' },
          { title: 'Fed rate decision looms - Reuters', link: 'https://news.example/en2', source: 'Reuters' },
        ]),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mockGetCloudflareContext.mockReset();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// A. 資料層（純函式）
// ─────────────────────────────────────────────────────────────

describe('trump-data：純函式', () => {
  it('clampDays：非法 → 預設 45；夾在 [1, 90]', () => {
    expect(clampDays(null)).toBe(45);
    expect(clampDays('')).toBe(45);
    expect(clampDays('abc')).toBe(45);
    expect(clampDays('30')).toBe(30);
    expect(clampDays('0')).toBe(1);
    expect(clampDays('-5')).toBe(1);
    expect(clampDays('999')).toBe(90);
  });

  it('buildEnUrl / buildTwUrl：含主題詞與 when:<days>d 控窗', () => {
    const en = buildEnUrl(45);
    expect(en.startsWith('https://news.google.com/rss/search?q=')).toBe(true);
    expect(decodeURIComponent(en)).toContain('when:45d');
    expect(en).toContain('hl=en-US');
    expect(en).toContain('ceid=US:en');

    const tw = buildTwUrl(45);
    expect(decodeURIComponent(tw)).toContain('川普 關稅');
    expect(decodeURIComponent(tw)).toContain('when:45d');
    expect(tw).toContain('hl=zh-TW');
    expect(tw).toContain('ceid=TW:zh-Hant');
  });

  it('DEFAULT_DAYS 為 45（對齊實站與 /trump 頁）', () => {
    expect(DEFAULT_DAYS).toBe(45);
  });

  it('buildTrumpRadarResponse：攤平形狀、upstream 為字串陣列、13 個鍵', async () => {
    const { buildTrumpRadarPayload } = await import('@/lib/trumpRadar');
    const payload = buildTrumpRadarPayload({
      enXml: rss([{ title: 'Nvidia chip export control tightens - CNBC', link: 'https://x/1', source: 'CNBC' }]),
      twXml: '',
      whXml: '',
      days: 45,
    });
    const { buildTrumpRadarResponse } = await import('@/app/trump/trump-data');

    const resp = buildTrumpRadarResponse(
      { payload, upstream: ['https://a', 'https://b', 'https://c'], gaps: [] },
      '2026-10-04T12:00:00.000Z',
    );

    expect(Object.keys(resp)).toEqual([
      'ok', 'days', 'total', 'themes', 'trend', 'items', 'tw_items',
      'hot_stocks', 'method', 'note', 'omitted_fields', 'provenance', 'fetchedAt',
    ]);
    expect(resp.ok).toBe(true);
    expect(Array.isArray(resp.provenance.upstream)).toBe(true);
    expect(resp.provenance.source).toBe('self-produced');
    expect(resp.fetchedAt).toBe('2026-10-04T12:00:00.000Z');
    // 主題分類沿用純函式層的關鍵字規則
    expect(resp.items[0].theme).toBe('晶片管制');
    expect(resp.items[0].title).toBe('Nvidia chip export control tightens'); // 已去 ` - Publisher`
    expect(resp.items[0].title_en).toBe('Nvidia chip export control tightens - CNBC');
  });
});

// ─────────────────────────────────────────────────────────────
// B. route：離線預算（嚴格模式）
// ─────────────────────────────────────────────────────────────

describe('trump-radar route：離線預算直送（嚴格模式）', () => {
  /** 一份「形狀與 route 完全一致」的預算結果（攤平、upstream 為字串陣列）。 */
  const PRECOMPUTED_BODY = JSON.stringify({
    ok: true,
    days: 45,
    total: 1,
    themes: [{ theme: '晶片管制', count: 1, sectors: ['半導體'] }],
    trend: [{ date: '2026-10-03', n: 1 }],
    items: [
      {
        date: '2026-10-03',
        stock_id: '',
        title: 'Nvidia chip export control tightens',
        title_en: 'Nvidia chip export control tightens - CNBC',
        link: 'https://news.example/en1',
        source: 'CNBC',
        theme: '晶片管制',
        origin: 'us',
      },
    ],
    tw_items: [],
    hot_stocks: [],
    method: 'm',
    note: 'n',
    omitted_fields: { fields: ['sentiment'], reason: 'r' },
    provenance: {
      source: 'self-produced',
      upstream: ['https://news.google.com/rss/search?q=en', 'https://www.whitehouse.gov/news/feed/', 'https://news.google.com/rss/search?q=tw'],
    },
    fetchedAt: '2026-10-04T08:35:00.000Z',
  });

  it('有預算 → 零解析直送，位元組與 KV 內字串完全一致', async () => {
    const { kv } = makeKvStore({ 'scan:trump-radar': PRECOMPUTED_BODY });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()(req(BASE));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PRECOMPUTED_BODY); // 未經 parse/stringify
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('precomputed-kv');
    // ⚠ 關鍵：命中時**絕不**打上游（遷移前這裡要燒 8.48s 才失敗）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('無預算（missing）→ 200 + ready:false，且絕不打上游', async () => {
    const { kv } = makeKvStore(); // 空 KV
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ok: boolean; ready: boolean; endpoint: string; message: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(false);
    expect(body.endpoint).toBe('trump-radar');
    // 🔴 嚴格模式的核心：**不 fallthrough 到即時計算**
    //    （線上邊緣端三條上游全不可達，fallthrough 只會多燒 8.48s 再失敗）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KV 讀取拋錯（error）→ 同樣回 ready:false，不把錯誤鎖進快取', async () => {
    const { kv } = makeKvStore({}, { getThrows: true });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });

    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ready: boolean };

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('days != 45 → 不讀 scan:trump-radar，走即時計算（保留 API 相容性）', async () => {
    const { kv } = makeKvStore({ 'scan:trump-radar': PRECOMPUTED_BODY });
    mockGetCloudflareContext.mockResolvedValue({ env: { SKYNET_CACHE: kv } });
    mockUpstreams();

    const res = await freshGet()(req(`${BASE}?days=30`));
    const body = (await res.json()) as { ok: boolean; days: number; items: unknown[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.days).toBe(30);
    expect(Array.isArray(body.items)).toBe(true);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('rss-fresh');
    // 預算 key 不該被讀到（那是 days=45 專用）
    expect(kv.get).not.toHaveBeenCalledWith('scan:trump-radar');
  });
});

// ─────────────────────────────────────────────────────────────
// C. route：KV 未綁定（本地開發）→ 即時計算
// ─────────────────────────────────────────────────────────────

describe('trump-radar route：KV 未綁定 → 即時計算', () => {
  it('三條上游正常 → ok:true 且 items 為陣列（前端驗證條件成立）', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    mockUpstreams();

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as {
      ok: boolean;
      days: number;
      items: Array<{ theme: string; title: string }>;
      tw_items: unknown[];
      total: number;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.days).toBe(45);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(3); // 2 則英文 + 1 則白宮
    expect(body.items.map((i) => i.theme).sort()).toEqual(['利率匯率', '晶片管制', '關稅貿易'].sort());
    expect(body.tw_items).toHaveLength(1);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('rss-fresh');
  });

  it('主要上游（英文 Google News）失敗 → 200 + ok:false（不 5xx、不回空陣列）', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });
    mockUpstreams({ enStatus: 503 });

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ok: boolean; error: string; days: number };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('upstream_error');
    expect(body.days).toBe(45);
    expect(res.headers.get('X-Skynet-Data-Source')).toBe('upstream-error');
  });

  it('輔助上游失敗（白宮／繁中）不阻塞：仍回 ok:true，只是該區塊缺席', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {} });

    globalThis.fetch = jest.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('news.google.com') && url.includes('hl=en-US')) {
        return new Response(
          rss([{ title: 'Fed rate decision looms - Reuters', link: 'https://news.example/en2', source: 'Reuters' }]),
          { status: 200 },
        );
      }
      return new Response('down', { status: 500 }); // 白宮與繁中皆失敗
    }) as unknown as typeof fetch;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await freshGet()(req(BASE));
    const body = (await res.json()) as { ok: boolean; items: unknown[]; tw_items: unknown[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.tw_items).toHaveLength(0);
    // 誠實出聲：輔助上游失敗必須留下紀錄（block-trades 的教訓：靜默降級＝缺陷）
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('輔助上游缺漏');

    warnSpy.mockRestore();
  });
});
