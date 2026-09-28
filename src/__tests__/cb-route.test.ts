/** @jest-environment node */

/**
 * 單元測試 — `/api/skynet/cb`（可轉債發行資料 / 賣回權時程代理）。
 *
 * 驗證重點（誠實原則）：
 *   - put_schedule 由 PutOptionDate / PutOptionPrice 建出、依賣回日排序、空賣回日剔除
 *   - calendar 由 IssueDate / ListingDate / MaturityDate 建出
 *   - items **恆為空陣列**（無 CB 盤後成交價可算溢價率 → 絕不造假排序）
 *   - 日期正規化（民國 7 碼 / 西元 8 碼）
 *   - 上游失敗 → 502 cb_upstream_error
 *
 * 全程 mock 上游 fetch，不打真實櫃買中心。
 */

import { GET } from '@/app/api/skynet/cb/route';
import type { CbResponse } from '@/app/api/skynet/cb/route';

const ORIGINAL_FETCH = globalThis.fetch;
const ISSUANCE_URL = 'bond_ISSBD5_data';

function mockFetch(payload: unknown, status = 200) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(ISSUANCE_URL)) {
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

/** 一筆完整 CB 發行資料列。 */
function cbRow(over: Record<string, string> = {}) {
  return {
    Date: '20260928',
    IssuerCode: '1101',
    IssuerName: '台泥',
    BondCode: '11011',
    ShortName: '台泥一永',
    IssueDate: '20241210',
    MaturityDate: '20291210',
    ListingDate: '20241210',
    OutstandingAmount: '8000000000',
    CouponRate: '0.000000',
    PutOptionDate: '20271210',
    PutOptionPrice: '100.0000',
    'Conversion/ExchangePriceAtIssuance': '36.5000',
    ...over,
  };
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/cb', () => {
  it('建出 put_schedule（依賣回日排序）、calendar，且 items 恆為空', async () => {
    mockFetch([
      cbRow({ BondCode: '22211', ShortName: '大甲一', PutOptionDate: '20271210', PutOptionPrice: '101.003' }),
      cbRow({ BondCode: '11011', ShortName: '台泥一永', PutOptionDate: '20250911', PutOptionPrice: '100.0000' }),
      // 無賣回日者：不進 put_schedule
      cbRow({ BondCode: '99999', ShortName: '無賣回', PutOptionDate: '' }),
      // 無 BondCode 者：整筆剔除（未掛牌）
      cbRow({ BondCode: '', ShortName: '未掛牌' }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse;

    expect(body.available).toBe(true);
    expect(body.date).toBe('2026-09-28');

    // put_schedule：只留有賣回日者，且依日期升冪
    expect(body.put_schedule.map((r) => r.cb_id)).toEqual(['11011', '22211']);
    expect(body.put_schedule[0]).toEqual({
      cb_id: '11011',
      name: '台泥一永',
      put_price: 100,
      put_date: '2025-09-11',
      end_date: '',
    });
    expect(body.put_schedule[1].put_price).toBe(101.003);

    // calendar：有發行日者
    expect(body.calendar.map((r) => r.cb_id).sort()).toEqual(['11011', '22211', '99999']);
    expect(body.calendar[0].maturity_date).toBe('2029-12-10');

    // items 恆為空（無 CB 成交價 → 不造假排序）
    expect(body.items).toEqual([]);
    expect(body.items_unavailable_reason).toContain('CB 盤後成交價');
  });

  it('賣回價空值 → put_price 為 null（不是 0）', async () => {
    mockFetch([cbRow({ BondCode: '11011', PutOptionPrice: '' })]);

    const res = await GET();
    const body = (await res.json()) as CbResponse;
    expect(body.put_schedule).toHaveLength(1);
    expect(body.put_schedule[0].put_price).toBeNull();
  });

  it('上游失敗 → 502 cb_upstream_error', async () => {
    mockFetch({}, 500);

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'cb_upstream_error' });
  });

  it('上游回非陣列 → 502', async () => {
    mockFetch({ foo: 'bar' });

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'cb_upstream_error' });
  });
});
