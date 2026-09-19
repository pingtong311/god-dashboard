/** @jest-environment node */

/**
 * /api/skynet/chips 路由驗證測試（QA 獨立驗證）
 *
 * 以真實 API 回應樣本（2026-09-18，2330 台積電）驅動 route handler：
 *   - T86 三大法人欄位索引（外資 4 / 投信 10 / 自營商 11 / 合計 18）
 *   - MI_MARGN 取 tables[1]、跳過「合計」列、融資/融券今日餘額（index 6 / 12）
 *   - TDCC 集保 CSV：剝 BOM、trim 代號、排除分級 16/17、5 區間合併、集中度 0.847
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/chips/route';

/** T86 真實樣本列（2330，19 欄）。 */
const T86_ROW = [
  '2330', '台積電          ', '32,975,037', '26,935,685', '6,039,352', '0', '0', '0',
  '1,615,969', '1,137,568', '478,401', '1,361,432', '1,064,550', '86,005', '978,545',
  '422,996', '40,109', '382,887', '7,879,185',
];

/** MI_MARGN：tables[0] 空、tables[1] 含合計列與 2330 列。 */
const MARGN_BODY = {
  stat: 'OK',
  tables: [
    {},
    {
      fields: [
        '代號', '名稱', '買進', '賣出', '現金償還', '前日餘額', '今日餘額', '次一營業日限額',
        '買進', '賣出', '現券償還', '前日餘額', '今日餘額', '次一營業日限額', '資券互抵', '註記',
      ],
      data: [
        // 合計列：代號是全形空白，必須跳過
        ['\u3000', '合計', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', ' '],
        ['2330', '台積電', '472', '834', '23', '29,148', '28,763', '6,483,092', '1', '5', '0', '11', '15', '6,483,092', '1', ' '],
      ],
    },
  ],
};

/** TDCC 集保 CSV（含 BOM、sep 列、尾隨空白代號、分級 16/17 干擾列）。 */
const TDCC_CSV =
  '\uFEFF' +
  [
    'sep=,',
    '資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%',
    '20260918,2330  ,1,2496562,291447275,1.12',
    '20260918,2330  ,2,100000,12000000,0.30',
    '20260918,2330  ,3,0,0,0',
    '20260918,2330  ,4,0,0,0',
    '20260918,2330  ,5,0,0,0',
    '20260918,2330  ,6,0,0,0',
    '20260918,2330  ,7,0,0,0',
    '20260918,2330  ,8,0,0,0',
    '20260918,2330  ,9,0,0,0',
    '20260918,2330  ,10,0,0,0',
    '20260918,2330  ,11,0,0,0',
    '20260918,2330  ,12,0,0,0',
    '20260918,2330  ,13,0,0,0',
    '20260918,2330  ,14,0,0,0',
    '20260918,2330  ,15,1481,21966711289,84.70',
    // 分級 16（差異數調整）／17（合計）必須排除
    '20260918,2330  ,16,1111111,88888888888,0.00',
    '20260918,2330  ,17,2222222,99999999999,100.00',
    // 其他代號：必須被忽略
    '20260918,9999  ,1,5,5,0.01',
  ].join('\n');

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

const chipsReq = (ticker: string, days = 5) =>
  new NextRequest(`http://localhost/api/skynet/chips?ticker=${ticker}&days=${days}`);

describe('GET /api/skynet/chips — 計算邏輯（真實樣本 2330）', () => {
  beforeEach(() => {
    installFetch([
      ['fund/T86', () => json({ stat: 'OK', date: '20260918', data: [T86_ROW] })],
      ['MI_MARGN', () => json(MARGN_BODY)],
      ['opendata.tdcc.com.tw', () => new Response(TDCC_CSV, { status: 200 })],
    ]);
  });

  it('T86 自營商必須取 index 11（1,361 張），不可取 index 14（979 張）', async () => {
    const res = await GET(chipsReq('2330'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      institutionalHistory: Array<{ foreignNet: number; trustNet: number; dealerNet: number; totalNet: number }>;
    };
    const latest = body.institutionalHistory[body.institutionalHistory.length - 1];
    expect(latest).toBeDefined();

    expect(latest.foreignNet).toBe(6039);
    expect(latest.trustNet).toBe(478);
    // ★ 契約：自營商 = index 11 = 1,361,432 股 → 1,361 張
    expect(latest.dealerNet).toBe(1361);
    expect(latest.totalNet).toBe(7879);
  });

  it('MI_MARGN 取 tables[1]、跳過合計列、融資/融券餘額正確（單位：張）', async () => {
    const res = await GET(chipsReq('2330'));
    const body = (await res.json()) as {
      marginHistory: Array<{ marginBalance: number; shortBalance: number; marginRatio: number | null }>;
    };
    const latest = body.marginHistory[body.marginHistory.length - 1];
    expect(latest).toBeDefined();

    expect(latest.marginBalance).toBe(28763);
    expect(latest.shortBalance).toBe(15);
    // 資券比 = 28763 / 15 = 1917.53（倍）
    expect(latest.marginRatio).toBeCloseTo(1917.53, 2);
  });

  it('TDCC：剝 BOM、trim 代號、排除分級 16/17、5 區間合併、集中度 0.847', async () => {
    const res = await GET(chipsReq('2330'));
    const body = (await res.json()) as {
      tdcc: Array<{ level: string; holders: number; lots: number; pct: number }> | null;
      concentration: number | null;
    };

    expect(body.tdcc).not.toBeNull();
    const tdcc = body.tdcc ?? [];
    expect(tdcc.map((r) => r.level)).toEqual([
      '1張以下', '1-10張', '10-100張', '100-1000張', '1000張以上',
    ]);

    const thousandPlus = tdcc.find((r) => r.level === '1000張以上');
    expect(thousandPlus?.pct).toBe(84.7);
    expect(thousandPlus?.lots).toBe(Math.round(21966711289 / 1000));

    // 集中度 = 84.70 / 100 = 0.847
    expect(body.concentration).toBe(0.847);

    // 分級 16/17 必須被排除：人數總和 = 2496562 + 100000 + 1481 = 2598043
    // （若誤含分級 16 的 1,111,111 或分級 17 的 2,222,222，總和會明顯不同）
    const totalHolders = tdcc.reduce((sum, r) => sum + r.holders, 0);
    expect(totalHolders).toBe(2598043);
  });

  it('代號格式錯誤回 400 invalid_ticker', async () => {
    const res = await GET(chipsReq('ABC'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_ticker' });
  });
});
