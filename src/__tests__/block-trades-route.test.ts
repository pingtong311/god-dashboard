/** @jest-environment node */

/**
 * /api/skynet/block-trades 與鉅額交易資料層（純函式）單元測試。
 *
 * 重點驗證：
 *   - 日期轉換（YYYYMMDD → YYYY-MM-DD）
 *   - 成交金額解析（千分位逗號）
 *   - 依證券代號彙總、剔除「總計」列、依金額由大到小排序
 *   - 非交易日回推（首日空 → 次日有資料）
 *   - 上游全數失敗 → 502 block_trades_upstream_error（不回假資料）
 *
 * 全程 mock 上游 fetch，不打真實證交所。
 */

import { GET } from '@/app/api/skynet/block-trades/route';
import {
  aggregateBlockTrades,
  formatDisplayDate,
  formatTwseDate,
  parseAmountYuan,
} from '@/app/block-trades/block-trades-data';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
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

  it('parseAmountYuan：去千分位逗號；無法解析回 0', () => {
    expect(parseAmountYuan('220,020,000')).toBe(220_020_000);
    expect(parseAmountYuan(' 1,000 ')).toBe(1000);
    expect(parseAmountYuan('')).toBe(0);
    expect(parseAmountYuan(undefined)).toBe(0);
  });

  it('aggregateBlockTrades：同代號彙總、剔除「總計」、依金額由大到小排序', () => {
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
    // 「總計」不得出現在結果中
    expect(items.some((i) => i.stock_id === '總計')).toBe(false);
  });
});

describe('GET /api/skynet/block-trades', () => {
  it('成功：回 200、彙總後 items、provenance 標記與 fetchedAt', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonRes({
        stat: 'OK',
        date: '20260924',
        data: [
          ['6669', '緯穎', '逐筆交易', '100', '1,000', '1,000,000,000'],
          ['6669', '緯穎', '配對交易', '100', '500', '500,000,000'],
          ['2330', '台積電', '逐筆交易', '500', '1,000', '2,000,000,000'],
          ['總計', '', '', '', '2,500', '3,500,000,000'],
        ],
      }),
    ) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      date: string;
      data_scope: string;
      next_update: string;
      items: Array<{ stock_id: string; money_yi: number }>;
      provenance: { source: string; upstream: string };
      fetchedAt: string;
    };

    expect(body.available).toBe(true);
    expect(body.date).toBe('2026-09-24');
    expect(body.data_scope).toBe('盤後');
    expect(body.next_update).toBe('下一交易日 23:08');
    expect(body.items.map((i) => i.stock_id)).toEqual(['2330', '6669']);
    expect(body.items[0].money_yi).toBe(20);
    expect(body.provenance.source).toBe('self-produced');
    expect(body.provenance.upstream).toContain('BFIAUU');
    expect(body.provenance.upstream).toContain('date=');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('非交易日回推：首日空資料 → 次日有資料', async () => {
    let call = 0;
    globalThis.fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) return jsonRes({ stat: 'OK', date: '20260928', data: [] });
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
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(2);
  });

  it('上游全數失敗（10 天回推都失敗）→ 502，不回假資料', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'block_trades_upstream_error' });
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('上游只有「總計」列 → 視為無資料 → 502', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonRes({
        stat: 'OK',
        date: '20260924',
        data: [['總計', '', '', '', '2,500', '3,500,000,000']],
      }),
    ) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'block_trades_upstream_error' });
  });
});
