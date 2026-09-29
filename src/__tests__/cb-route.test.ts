/** @jest-environment node */

/**
 * 單元測試 — `/api/skynet/cb`（可轉債發行資料 + 賣回權時程 + 自產轉換溢價率排序）。
 *
 * 驗證重點：
 *   - put_schedule 由 PutOptionDate / PutOptionPrice 建出、依賣回日排序、空賣回日剔除
 *   - calendar 由 IssueDate / ListingDate / MaturityDate 建出
 *   - items 由 TPEX「轉換公司債資訊看板」日行情檔（cbdrs001）自產（轉換價值＝標的股價×100÷轉換價；折價率＝CB收市價÷轉換價值−1），升冪取前 30
 *   - provenance.source === 'self-produced'
 *   - 上游失敗 → 502 cb_upstream_error
 *   - CSV 抓不到時 items 為空並附 items_unavailable_reason（誠實說明）
 *
 * 全程 mock 上游 fetch，不打真實櫃買中心。
 */

import { GET } from '@/app/api/skynet/cb/route';
import type { CbResponse } from '@/app/api/skynet/cb/route';

const ORIGINAL_FETCH = globalThis.fetch;
const ISSUANCE_URL = 'bond_ISSBD5_data';
const CB_DAILY_LIST_URL = 'www/zh-tw/bond/cbDaily';
const CB_FILE_CODE = 'cbdrs001';

/**
 * CSV fixture（與上游現行規格一致：CRLF 分隔、BIG5 編碼、20 欄）。
 *
 * 以 base64 存放「真正的 BIG5 位元組」是刻意的：若用 UTF-8 字串餵給 mock，
 * route 端解碼後中文欄位名會成亂碼、欄位對不上而靜默清空 items，測不出真實行為。
 * 產生方式：`python3 -c "...csv.encode('big5')... | base64"`（見本檔註解）。
 */
const CB_CSV_BIG5_BASE64 = [
  'VElUTEUswuC0q6S9pXG2xbjqsFSs3apPDQpEQVRBREFURSyk6bTBOjExNaZ+MDmk6zI0pOkNCkhFQURFUiy2xajppU69WCy2',
  'xajpwrK62SzC4LSrsF+k6SzC4LSrqLSk6SzC4LSru/mu5iykVaa4wuC0q7v5rualza7EpOm0wSyzzKrxveamXsV2sF+k6Syz',
  'zKrxveamXsV2qLSk6SyzzKrxveamXsV2u/mu5iyxaqjuxaumXrBfpOkssWqo7sWrpl6otKTpLLFqqO7Fq6Zeu/mu5iyy16Tu',
  'wmTCabZSveak6Syt7KlstW+m5sFgw0IspFek66mztW+m5r5sw0IswuC2xbDRptK7+a7mLMLgtKu80Kq6qtGyvLv5ruYssLGk',
  '7qXmqfawX6TpLLCxpO6l5qn2qLSk6SyyvK2xp1Gydg0KIkJPRFkiLCIxMTAxMSIsIqV4qmSkQKXDICAiLCIyMDI0LzEyLzEw',
  'IiwiMjAyOS8xMi8xMCIsIjM2LjUwMDAiLCIiLCIiLCIiLCIiLCIiLCIiLCIiLCIiLCI4LDAwMCwwMDAsMDAwIiwiIiwiMzUu',
  'MDAiLCIzNi41MCIsIiIsIiIsIjAuMDAwMDAiDQoiQk9EWSIsIjIyMjExIiwipGql0qRAICAiLCIyMDI1LzA4LzE0IiwiMjAy',
  'OC8wNS8xMyIsIjgyLjE2MDAiLCIiLCIiLCIiLCIiLCIiLCIiLCIiLCIiLCIxLDAwMCwwMDAsMDAwIiwiIiwiMTg3LjAwIiwi',
  'MTY0LjAwIiwiIiwiIiwiMC4wMDAwMCINCiJCT0RZIiwiOTk5OTkiLCK1TL3mpl4gICIsIiIsIiIsIiIsIiIsIiIsIiIsIiIs',
  'IiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIjAuMDAwMDAi',
].join('');

/** 同一份 CSV 的 UTF-8 版本（驗證解碼器也吃 UTF-8，不因編碼改變而靜默清空）。 */
function csvUtf8(): string {
  return new TextDecoder('big5').decode(Buffer.from(CB_CSV_BIG5_BASE64, 'base64'));
}

/** CSV 回應內容模式：BIG5（上游現況）／UTF-8（上游若改編碼）／缺檔。 */
type CsvMode = 'big5' | 'utf8' | 'missing';

function csvResponse(mode: CsvMode): Response {
  if (mode === 'missing') return new Response('not found', { status: 404 });
  const big5Bytes = Buffer.from(CB_CSV_BIG5_BASE64, 'base64');
  if (mode === 'big5') {
    return new Response(big5Bytes, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=big5' },
    });
  }
  return new Response(csvUtf8(), {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}

function mockFetch(payloads: Map<string, unknown>, status = 200, csvMode: CsvMode = 'big5') {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [key, payload] of payloads) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    // CSV endpoint（BIG5 或 UTF-8 位元組）
    if (url.includes('storage/bond_zone/tradeinfo/cb/')) {
      return csvResponse(csvMode);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

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

function makeIssuancePayload() {
  return [
    cbRow({ BondCode: '22211', ShortName: '大甲一', PutOptionDate: '20271210', PutOptionPrice: '101.003' }),
    cbRow({ BondCode: '11011', ShortName: '台泥一永', PutOptionDate: '20250911', PutOptionPrice: '100.0000' }),
    cbRow({ BondCode: '99999', ShortName: '無賣回', PutOptionDate: '' }),
    cbRow({ BondCode: '', ShortName: '未掛牌' }),
  ];
}

function makeCbDailyListPayload(dateStr: string = '115/09/24') {
  return {
    date: '20260930',
    tables: [
      {
        title: '轉(交)換債日統計報表',
        type: '轉換公司債資訊看板',
        fields: ['資料日期', '檔案下載'],
        data: [
          [dateStr, '/storage/bond_zone/tradeinfo/cb/2026/202609/RSdrs001.20260924-C.csv', '/storage/bond_zone/tradeinfo/cb/2026/202609/CBdrs001.20260924-C.xls'],
        ],
      },
    ],
  };
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('GET /api/skynet/cb', () => {
  it('建出 put_schedule、calendar、items（自產轉換溢價率排序，取前 30）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse;

    expect(body.available).toBe(true);
    expect(body.date).toBe('2026-09-28');
    expect(body.provenance.source).toBe('self-produced');

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

    // items：自產溢價率排序（升冪），前 30
    // 11011: 轉換價值=36.50*100/36.5=100, 折價率=(35/100-1)*100=-65.00%
    // 22211: 轉換價值=164*100/82.16=199.61, 折價率=(187/199.61-1)*100=-6.32%
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(30);
    expect(body.items[0].cb_id).toBe('11011'); // 最低折價率（最負）排第一
    expect(body.items[0].premium_pct).toBe(-65.0);
    expect(body.items.find((x) => x.cb_id === '22211')?.premium_pct).toBe(-6.32);
    // 千分位逗號（"8,000,000,000"）必須被正確解析，不能被逗號切斷成 8
    expect(body.items[0].outstanding).toBe(8_000_000_000);
    expect(body.items_unavailable_reason).toBe(''); // 有資料時為空
  });

  it('上游若改餵 UTF-8 的 CSV → 仍正確解析（不因編碼改變而靜默清空）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads, 200, 'utf8');

    const res = await GET();
    const body = (await res.json()) as CbResponse;

    expect(body.items).toHaveLength(2); // 99999 缺價被剔除
    expect(body.items[0].cb_id).toBe('11011');
    // 中文欄位名必須正確解出（亂碼會導致欄位對不上 → items 清空）
    expect(body.items[0].cb_name).toBe('台泥一永');
    expect(body.items[0].premium_pct).toBe(-65.0);
  });

  it('CSV 檔案本身 404 → items 為空、附誠實說明（不影響 put_schedule）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads, 200, 'missing');

    const res = await GET();
    const body = (await res.json()) as CbResponse;

    expect(body.items).toEqual([]);
    expect(body.items_unavailable_reason).toContain('暫時無法取得');
    expect(body.put_schedule.map((r) => r.cb_id)).toEqual(['11011', '22211']);
  });

  it('CB 日行情檔抓不到時 → items 為空、附誠實說明', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    // 故意不給 CB_DAILY_LIST_URL，或給 404
    payloads.set(CB_DAILY_LIST_URL, { stat: '參數輸入錯誤' });
    mockFetch(payloads);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as CbResponse;

    expect(body.items).toEqual([]);
    expect(body.items_unavailable_reason).toContain('暫時無法取得');
    expect(body.provenance.source).toBe('self-produced');
  });

  it('賣回價空值 → put_price 為 null（不是 0）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, [cbRow({ BondCode: '11011', PutOptionPrice: '' })]);
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const res = await GET();
    const body = (await res.json()) as CbResponse;
    expect(body.put_schedule).toHaveLength(1);
    expect(body.put_schedule[0].put_price).toBeNull();
  });

  it('上游失敗 → 502 cb_upstream_error', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, {});
    mockFetch(payloads, 500);

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'cb_upstream_error' });
  });

  it('上游回非陣列 → 502', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, { foo: 'bar' });
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'cb_upstream_error' });
  });

  it('items 排序正確：折價率升冪（負值在前）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const res = await GET();
    const body = (await res.json()) as CbResponse;

    // 驗證升冪排序
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i].premium_pct).toBeGreaterThanOrEqual(body.items[i - 1].premium_pct ?? -Infinity);
    }
  });
});