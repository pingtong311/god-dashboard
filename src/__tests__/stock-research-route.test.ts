/** @jest-environment node */

/**
 * /api/skynet/stock-research 路由契約測試
 * 覆蓋：ok 契約、invalid_ticker、全來源失敗、部分來源失敗仍回 ok。
 * 以 mock fetch 提供 4 個同源子來源的回應。
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/stock-research/route';

const TWSE_BODY = {
  items: [
    {
      symbol: '2330',
      name: '台積電',
      price: 2475,
      change: -25,
      changePercent: -1,
      open: 2480,
      high: 2490,
      low: 2470,
      prevClose: 2500,
      volume: 12989,
      timestamp: '2026-09-24 13:30:00',
      tradeDate: '20260924',
    },
  ],
  fetchedAt: '2026-09-24T05:30:00.000Z',
};

const CHIPS_BODY = {
  ticker: '2330',
  name: '台積電',
  tradeDate: '2026-09-24',
  institutionalHistory: [
    { date: '2026-09-23', foreignNet: -100, trustNet: -10, dealerNet: 5, totalNet: -105 },
    { date: '2026-09-24', foreignNet: -4668, trustNet: -1288, dealerNet: 2718, totalNet: -3238 },
  ],
  marginHistory: [{ date: '2026-09-24', marginBalance: 29707, shortBalance: 16 }],
  tdcc: [
    { level: '100-1000張', lots: 1000, pct: 5 },
    { level: '1000張以上', lots: 2000, pct: 84.7 },
  ],
  concentration: 0.847,
  fetchedAt: '2026-09-24T05:30:00.000Z',
};

const FUND_BODY = {
  ok: true,
  data: {
    ticker: '2330',
    name: '台積電',
    monthlyRevenue: 514805000000,
    monthlyRevenueYoY: 10.1,
    eps: null,
    grossMargin: null,
    roe: null,
    debtRatio: null,
    peRatio: 28.69,
    pbRatio: 9.98,
    dividendYield: 0.89,
    asOfDate: '2026-08',
    fetchedAt: '2026-09-24T05:30:00.000Z',
  },
};

const KLINE_BODY = {
  candles: [
    { date: '2026-09-22', open: 2400, high: 2450, low: 2390, close: 2440, volume: 10000 },
    { date: '2026-09-23', open: 2440, high: 2520, low: 2430, close: 2500, volume: 12000 },
    { date: '2026-09-24', open: 2480, high: 2490, low: 2470, close: 2475, volume: 12989 },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 依 URL 分派 mock 回應。 */
function mockFetchRouter(overrides: Partial<Record<'twse' | 'chips' | 'fundamental' | 'kline', Response>> = {}) {
  return jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/skynet/twse')) return Promise.resolve(overrides.twse ?? jsonResponse(TWSE_BODY));
    if (url.includes('/api/skynet/chips')) return Promise.resolve(overrides.chips ?? jsonResponse(CHIPS_BODY));
    if (url.includes('/api/skynet/fundamental')) return Promise.resolve(overrides.fundamental ?? jsonResponse(FUND_BODY));
    if (url.includes('/api/skynet/kline')) return Promise.resolve(overrides.kline ?? jsonResponse(KLINE_BODY));
    return Promise.resolve(jsonResponse({ error: 'not_found' }, 404));
  });
}

const makeReq = (ticker: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/skynet/stock-research?ticker=${ticker}`);

describe('/api/skynet/stock-research', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常：回 ok:true 並聚合各來源欄位', async () => {
    global.fetch = mockFetchRouter() as unknown as typeof fetch;
    const res = await GET(makeReq('2330'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.ticker).toBe('2330');
    expect(body.data.name).toBe('台積電');
    expect(body.data.institutional.foreignNet).toBe(-4668);
    expect(body.data.margin.marginLots).toBe(29707);
    expect(body.data.holders.bigPct).toBe(84.7);
    expect(body.data.valuation.per).toBe(28.69);
    expect(body.data.revenue.revenueYi).toBeCloseTo(5148.05, 2);
    expect(body.data.cum6dPct).not.toBeNull();
  });

  it('非法代號：400 + reason invalid_ticker（不呼叫上游）', async () => {
    const fetchMock = mockFetchRouter();
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await GET(makeReq('ABC'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ ok: false, reason: 'invalid_ticker' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('全部子來源失敗：200 + ok:false（不 5xx）', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    const res = await GET(makeReq('2330'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('stock_research_unavailable');
  });

  it('部分來源失敗：仍回 ok:true，缺的欄位為 null（不補 0）', async () => {
    global.fetch = mockFetchRouter({
      fundamental: jsonResponse({ ok: false, message: 'fundamental_unavailable' }),
      kline: jsonResponse({ error: 'api_key_not_configured' }, 503),
    }) as unknown as typeof fetch;

    const res = await GET(makeReq('2330'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.valuation.per).toBeNull();
    expect(body.data.revenue.revenueYi).toBeNull();
    expect(body.data.cum6dPct).toBeNull();
    // 仍保有報價與籌碼
    expect(body.data.institutional.foreignNet).toBe(-4668);
  });
});
