/** @jest-environment node */

/**
 * QA 獨立驗證 — `/api/skynet/t86`（個股三大法人買賣超代理）。
 *
 * 重點驗證（對應 team-lead 清單）：
 *   - 自營商取 index **11**（合計），不是 index 14（僅自行買賣）
 *   - 千分位逗號、前後空白、名稱 trim
 *   - 股 → 張（/1000 四捨五入）
 *   - ?tickers= 過濾、省略則回全市場
 *   - ?date= 指定日期、10 天回推
 *   - 欄位不足的畸形列被跳過
 *   - 上游失敗 → 502 t86_upstream_error
 *
 * 全程 mock 上游 fetch，不打真實證交所。
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/t86/route';

const ORIGINAL_FETCH = globalThis.fetch;

/** 建 19 欄的 T86 資料列。 */
function row(over: Partial<Record<number, string>> & { 0: string; 1: string }): string[] {
  const base = Array.from({ length: 19 }, () => '0');
  base[0] = over[0];
  base[1] = over[1];
  for (const key of Object.keys(over)) {
    const idx = Number(key);
    base[idx] = over[idx] as string;
  }
  return base;
}

function okBody(data: string[][], date = '20260918') {
  return {
    stat: 'OK',
    date,
    fields: [],
    data,
  };
}

function mockUpstream(payload: unknown, status = 200) {
  globalThis.fetch = jest.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as unknown as typeof fetch;
}

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/skynet/t86${qs}`);
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/t86', () => {
  it('自營商取 index 11（不是 index 14）＋逗號/空白/張數換算', async () => {
    const data = [
      row({
        0: '2330',
        1: ' 台積電 ',
        4: '6,000,000', // 外資
        10: '478,401', // 投信
        11: '1,361,432', // 自營商（合計）← 必須取這個
        14: '999,999', // 自營商（自行買賣）← 不可取這個
        18: '7,879,185', // 合計
      }),
    ];
    mockUpstream(okBody(data));

    const res = await GET(req('?tickers=2330'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tradeDate: string;
      items: Array<{ symbol: string; name: string; foreignNet: number; trustNet: number; dealerNet: number; totalNet: number }>;
    };

    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.symbol).toBe('2330');
    expect(item.name).toBe('台積電'); // trim
    expect(item.foreignNet).toBe(6000); // 6,000,000 股 → 6000 張
    expect(item.trustNet).toBe(478); // 478.401 → 478
    expect(item.dealerNet).toBe(1361); // index 11（1361.432→1361），不是 index 14（1000）
    expect(item.dealerNet).not.toBe(1000);
    expect(item.totalNet).toBe(7879); // 7879.185 → 7879
    expect(body.tradeDate).toBe('2026-09-18');
  });

  it('?tickers= 只回被查詢的個股', async () => {
    const data = [
      row({ 0: '2330', 1: '台積電', 18: '1,000,000' }),
      row({ 0: '0050', 1: '元大台灣50', 18: '500,000' }),
      row({ 0: '2317', 1: '鴻海', 18: '300,000' }),
    ];
    mockUpstream(okBody(data));

    const res = await GET(req('?tickers=2330,2317'));
    const body = (await res.json()) as { items: Array<{ symbol: string }> };
    expect(body.items.map((i) => i.symbol).sort()).toEqual(['2317', '2330']);
  });

  it('省略 tickers → 回傳全市場', async () => {
    const data = [
      row({ 0: '2330', 1: '台積電', 18: '1,000,000' }),
      row({ 0: '0050', 1: '元大台灣50', 18: '500,000' }),
    ];
    mockUpstream(okBody(data));

    const res = await GET(req(''));
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });

  it('欄位不足（<19）的畸形列被跳過', async () => {
    const data = [
      row({ 0: '2330', 1: '台積電', 18: '1,000,000' }),
      ['0050', '元大台灣50', '1', '2'], // 只有 4 欄 → 應被跳過
    ];
    mockUpstream(okBody(data));

    const res = await GET(req(''));
    const body = (await res.json()) as { items: Array<{ symbol: string }> };
    expect(body.items.map((i) => i.symbol)).toEqual(['2330']);
  });

  it('?date=YYYYMMDD → 直接查該日（URL 帶 date）', async () => {
    mockUpstream(okBody([row({ 0: '2330', 1: '台積電', 18: '1,000,000' })], '20260918'));

    const res = await GET(req('?tickers=2330&date=20260918'));
    expect(res.status).toBe(200);
    const calls = (globalThis.fetch as jest.Mock).mock.calls;
    expect(String(calls[0][0])).toContain('date=20260918');
  });

  it('?date= 格式錯誤 → 502（不亂打上游）', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const res = await GET(req('?tickers=2330&date=not-a-date'));
    expect(res.status).toBe(502);
    expect(spy).not.toHaveBeenCalled();
  });

  it('上游全數失敗（10 天回推都失敗）→ 502 t86_upstream_error', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

    const res = await GET(req('?tickers=2330'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 't86_upstream_error' });
    // 10 天回推，最多打 10 次
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('未指定 date 時會回推（首日失敗、次日成功）', async () => {
    let call = 0;
    globalThis.fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) return new Response('fail', { status: 500 });
      return new Response(JSON.stringify(okBody([row({ 0: '2330', 1: '台積電', 18: '1,000,000' })])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const res = await GET(req('?tickers=2330'));
    expect(res.status).toBe(200);
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(2);
  });
});
