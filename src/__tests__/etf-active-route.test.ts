/** @jest-environment node */

/**
 * 單元測試 — `/api/skynet/etf-active`（主動式 ETF 清單 + 收盤價代理）。
 *
 * 驗證重點（誠實原則）：
 *   - 只保留「基金類型」含「主動式」的 ETF（其餘基金剔除）
 *   - 收盤價 / 月均價正確對應、民國日期正規化為 YYYY-MM-DD
 *   - holdings / changes **恆為空陣列**（本站無資料源，絕不造假）
 *   - 清單上游失敗 → 502 etf_active_upstream_error
 *   - 收盤價上游失敗 → 仍 200，但價格為 null（降級不炸）
 *
 * 全程 mock 上游 fetch，不打真實證交所。
 */

import { GET } from '@/app/api/skynet/etf-active/route';
import type { EtfActiveResponse } from '@/app/api/skynet/etf-active/route';

const ORIGINAL_FETCH = globalThis.fetch;
const LIST_URL = 't187ap47_L';
const PRICE_URL = 'STOCK_DAY_AVG_ALL';

/** 依 URL 分派回應的 fetch mock。 */
function mockFetch(handlers: {
  list?: { payload: unknown; status?: number };
  price?: { payload: unknown; status?: number };
}) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(LIST_URL)) {
      const h = handlers.list ?? { payload: [], status: 200 };
      return new Response(JSON.stringify(h.payload), {
        status: h.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(PRICE_URL)) {
      const h = handlers.price ?? { payload: [], status: 200 };
      return new Response(JSON.stringify(h.payload), {
        status: h.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/etf-active', () => {
  it('只保留「主動式」ETF，並帶出收盤價與民國日期正規化', async () => {
    mockFetch({
      list: {
        payload: [
          { 基金代號: '00400A', 基金簡稱: '主動國泰動能高息', 基金類型: '國內成分證券主動式交易所交易基金(股票)' },
          { 基金代號: '0050', 基金簡稱: '元大台灣50', 基金類型: '國內成分證券指數股票型基金' },
          { 基金代號: '00402A', 基金簡稱: '主動安聯美國科技', 基金類型: '國外成分證券主動式交易所交易基金(股票)' },
        ],
      },
      price: {
        payload: [
          { Date: '1150924', Code: '00400A', Name: '主動國泰動能高息', ClosingPrice: '15.66', MonthlyAveragePrice: '15.05' },
          { Date: '1150924', Code: '0050', Name: '元大台灣50', ClosingPrice: '188.00', MonthlyAveragePrice: '180.00' },
        ],
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as EtfActiveResponse;

    // 只有 2 檔主動式（0050 被剔除）
    expect(body.items.map((i) => i.etf_id)).toEqual(['00400A', '00402A']);
    expect(body.date).toBe('2026-09-24'); // 民國 1150924 → 2026-09-24
    expect(body.available).toBe(true);

    const first = body.items[0];
    expect(first.name).toBe('主動國泰動能高息');
    expect(first.closing_price).toBe(15.66);
    expect(first.monthly_avg_price).toBe(15.05);

    // 無收盤價的 00402A → null（不是 0）
    expect(body.items[1].closing_price).toBeNull();

    // holdings / changes 恆為空陣列（誠實留白）
    expect(first.holdings).toEqual([]);
    expect(first.changes).toEqual([]);
  });

  it('清單上游失敗 → 502 etf_active_upstream_error', async () => {
    mockFetch({ list: { payload: {}, status: 500 } });

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'etf_active_upstream_error' });
  });

  it('清單上游回非陣列 → 502', async () => {
    mockFetch({ list: { payload: { foo: 'bar' }, status: 200 } });

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'etf_active_upstream_error' });
  });

  it('收盤價上游失敗 → 仍 200，但所有價格為 null（降級不炸）', async () => {
    mockFetch({
      list: {
        payload: [
          { 基金代號: '00400A', 基金簡稱: '主動國泰動能高息', 基金類型: '主動式交易所交易基金(股票)' },
        ],
      },
      price: { payload: {}, status: 500 },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as EtfActiveResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].closing_price).toBeNull();
    expect(body.items[0].monthly_avg_price).toBeNull();
    expect(body.date).toBe(''); // 價格源失敗 → 無資料日
  });

  it('價格字串含千分位逗號與破折號 → 正確解析為數字或 null', async () => {
    mockFetch({
      list: {
        payload: [
          { 基金代號: 'A1', 基金簡稱: '主動甲', 基金類型: '主動式' },
          { 基金代號: 'A2', 基金簡稱: '主動乙', 基金類型: '主動式' },
        ],
      },
      price: {
        payload: [
          { Date: '1150924', Code: 'A1', ClosingPrice: '1,234.5', MonthlyAveragePrice: '---' },
          { Date: '1150924', Code: 'A2', ClosingPrice: '-', MonthlyAveragePrice: '' },
        ],
      },
    });

    const res = await GET();
    const body = (await res.json()) as EtfActiveResponse;
    expect(body.items[0].closing_price).toBe(1234.5);
    expect(body.items[0].monthly_avg_price).toBeNull();
    expect(body.items[1].closing_price).toBeNull();
    expect(body.items[1].monthly_avg_price).toBeNull();
  });
});
