/** @jest-environment node */

/**
 * /api/skynet/radar 路由驗證測試（QA 獨立驗證）
 *
 * 以真實 API 回應樣本（2026-09-18 收盤，2330 台積電）驅動 route handler，
 * 釘住下列純計算邏輯：
 *   - 股 → 張換算（TradeVolume 40892688 → 40893 張）
 *   - 漲跌幅 = Change / (Close - Change) × 100 → 1.4433%
 *   - 三大法人欄位索引：外資 4 / 投信 10 / 自營商 11 / 合計 18
 *   - 民國年 1150918 → 2026-09-18
 *   - 資金集中度 = |totalNet| / volumeLots
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/radar/route';

/** TWSE STOCK_DAY_ALL 真實樣本列（2330）。 */
const TWSE_SAMPLE = [
  {
    Date: '1150918',
    Code: '2330',
    Name: '台積電',
    TradeVolume: '40892688',
    TradeValue: '100394074139',
    OpeningPrice: '2460.00',
    HighestPrice: '2460.00',
    LowestPrice: '2435.00',
    ClosingPrice: '2460.00',
    Change: '35.0000',
    Transaction: '69571',
  },
];

/** T86 真實樣本列（2330，19 欄）。 */
const T86_ROW = [
  '2330', '台積電          ', '32,975,037', '26,935,685', '6,039,352', '0', '0', '0',
  '1,615,969', '1,137,568', '478,401', '1,361,432', '1,064,550', '86,005', '978,545',
  '422,996', '40,109', '382,887', '7,879,185',
];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (url: string, init?: RequestInit) => Response;

function installFetch(routes: Array<[string, Handler]>): jest.Mock {
  const mock = jest.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String((input as Request).url);
    for (const [needle, handler] of routes) {
      if (url.includes(needle)) return handler(url, init);
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

const radarReq = (sort: string) =>
  new NextRequest(`http://localhost/api/skynet/radar?sort=${sort}`);

type RadarRowLite = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volumeLots: number;
  foreignNet: number | null;
  trustNet: number | null;
  dealerNet: number | null;
  totalNet: number | null;
  concentration: number | null;
};

describe('GET /api/skynet/radar — 計算邏輯（真實樣本 2330）', () => {
  it('股→張、漲跌幅、法人索引、集中度、民國年全部正確', async () => {
    installFetch([
      ['STOCK_DAY_ALL', () => json(TWSE_SAMPLE)],
      ['tpex_mainboard_daily_close_quotes', () => json([])],
      ['tpex_3insti_daily_trading', () => json([])],
      ['fund/T86', () => json({ stat: 'OK', date: '20260918', data: [T86_ROW] })],
    ]);

    const res = await GET(radarReq('concentration'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      rows: RadarRowLite[];
      tradeDate: string;
      source: string;
    };
    const row = body.rows.find((r) => r.symbol === '2330');
    expect(row).toBeDefined();
    if (!row) return;

    // 股 → 張：40892688 / 1000 = 40892.688 → 四捨五入 40893
    expect(row.volumeLots).toBe(40893);

    // 漲跌幅：35 / (2460 - 35) × 100 = 1.443298… %
    expect(Number((row.changePercent as number).toFixed(4))).toBe(1.4433);

    // 三大法人索引：外資 4 / 投信 10 / 自營商 11 / 合計 18
    expect(row.foreignNet).toBe(6039);
    expect(row.trustNet).toBe(478);
    expect(row.dealerNet).toBe(1361); // ★ 必須是 index 11；index 14 會得 979
    expect(row.totalNet).toBe(7879);

    // 資金集中度 = |7879| / 40893
    expect(row.concentration).toBeCloseTo(7879 / 40893, 6);

    // 交易日期：T86 優先
    expect(body.tradeDate).toBe('2026-09-18');
    expect(body.source).toContain('twse-t86');
  });

  it('T86 不可用時，tradeDate 回退用上市行情的民國年（1150917 → 2026-09-17）', async () => {
    installFetch([
      ['STOCK_DAY_ALL', () => json([{ ...TWSE_SAMPLE[0], Date: '1150917' }])],
      ['tpex_mainboard_daily_close_quotes', () => json([])],
      ['tpex_3insti_daily_trading', () => json([])],
      ['fund/T86', () => json({ stat: 'NO', data: [] })],
    ]);

    const res = await GET(radarReq('concentration'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      tradeDate: string;
      source: string;
      rows: RadarRowLite[];
    };

    // 民國 115 → 2026；0917 → 09-17
    expect(body.tradeDate).toBe('2026-09-17');
    expect(body.source).toContain('twse-t86-unavailable');

    // 法人欄位應為 null（未入庫），不得捏造為 0
    const row = body.rows.find((r) => r.symbol === '2330');
    expect(row?.foreignNet).toBeNull();
    expect(row?.dealerNet).toBeNull();
    expect(row?.concentration).toBeNull();
  });

  it('價量來源全部失敗時回 502，且不捏造資料', async () => {
    installFetch([
      ['STOCK_DAY_ALL', () => new Response('boom', { status: 500 })],
      ['tpex_mainboard_daily_close_quotes', () => new Response('boom', { status: 500 })],
      ['tpex_3insti_daily_trading', () => new Response('boom', { status: 500 })],
      ['fund/T86', () => new Response('boom', { status: 500 })],
    ]);

    const res = await GET(radarReq('concentration'));
    expect([502, 504]).toContain(res.status);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/radar_(upstream_error|timeout)/);
  });
});
