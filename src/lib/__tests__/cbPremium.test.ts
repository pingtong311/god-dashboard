/** @jest-environment node */

/**
 * 單元測試 — `src/lib/cbPremium.ts`（CB 離線預算的純計算核心）
 *
 * 覆蓋重點（重構後的行為必須與原 route 完全一致，不能因搬家丟掉覆蓋）：
 *   - BIG5 與 UTF-8 兩種編碼的 CSV 都能正確解碼（中文欄位名沒解出 → items 靜默清空）
 *   - 20 欄對位（HEADER 解析出 20 個欄位名，關鍵欄位在正確位置）
 *   - 千分位逗號金額（"8,000,000,000"）解析正確，不被逗號切斷成 8
 *   - 轉換價值 / 折價率公式、升冪排序、取前 30
 *   - 缺任一價或轉換價為 0 → 剔除（不是補 0）
 *   - CSV 404、日行情清單抓不到 → items 為空 + 誠實說明（不影響 put_schedule）
 *   - ISSBD5 失敗 → ok:false（不以空集合冒充成功）
 *   - 空值轉 null（不是 0）
 *   - KV 信封（buildCbKvValue / parseCbKvValue）往返、舊格式相容、損壞值不拋
 *
 * 全程 mock 上游 fetch，不打真實櫃買中心。
 */

import {
  TOP_N,
  buildCbKvValue,
  buildCbPayload,
  buildItems,
  buildNotReadyPayload,
  decodeCsvBytes,
  normalizeDate,
  parseCbKvValue,
  parseCsvLine,
  toNumOrNull,
  type CbResponse,
  type RawCbIssuance,
} from '@/lib/cbPremium';

const ORIGINAL_FETCH = globalThis.fetch;
const ISSUANCE_URL = 'bond_ISSBD5_data';
const CB_DAILY_LIST_URL = 'www/zh-tw/bond/cbDaily';

/**
 * CSV fixture（與上游現行規格一致：CRLF 分隔、BIG5 編碼、HEADER 20 欄）。
 *
 * 以 base64 存放「真正的 BIG5 位元組」是刻意的：若用 UTF-8 字串餵給 mock，
 * 解碼後中文欄位名會成亂碼、欄位對不上而靜默清空 items，測不出真實編碼路徑。
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
  'IiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIjAuMDAwMDAi',
].join('');

/** 上游 CSV 的 20 個欄位名（順序即上游規格，測試對位用）。 */
const CSV_COLUMNS = [
  '債券代碼',
  '債券簡稱',
  '轉換起日',
  '轉換迄日',
  '轉換價格',
  '下次轉換價格生效日期',
  '最近賣回權起日',
  '最近賣回權迄日',
  '最近賣回權價格',
  '強制贖回起日',
  '強制贖回迄日',
  '強制贖回價格',
  '終止櫃檯買賣日',
  '原始發行總額',
  '上月底發行餘額',
  '轉債參考價格',
  '轉換標的股票價格',
  '停止交易起日',
  '停止交易迄日',
  '票面利率',
];

/** CSV 回應內容模式：BIG5（上游現況）／UTF-8（上游若改編碼）／缺檔。 */
type CsvMode = 'big5' | 'utf8' | 'missing';

/** 把 BIG5 fixture 轉成 UTF-8 字串（模擬上游改餵 UTF-8 的情境）。 */
function csvUtf8(): string {
  return new TextDecoder('big5').decode(Buffer.from(CB_CSV_BIG5_BASE64, 'base64'));
}

function csvResponse(mode: CsvMode): Response {
  if (mode === 'missing') return new Response('not found', { status: 404 });
  if (mode === 'big5') {
    return new Response(Buffer.from(CB_CSV_BIG5_BASE64, 'base64'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=big5' },
    });
  }
  return new Response(csvUtf8(), {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}

/**
 * mock 上游 fetch。
 * @param payloads URL 片段 → JSON payload
 * @param status JSON 端點的 HTTP 狀態
 * @param csvMode CSV 下載端的編碼／缺檔模式
 */
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
    if (url.includes('storage/bond_zone/tradeinfo/cb/')) {
      return csvResponse(csvMode);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

/** ISSBD5 單列（值皆字串，含千分位逗號的發行餘額）。 */
function cbRow(over: Record<string, string> = {}): RawCbIssuance {
  return {
    Date: '20260928',
    IssuerCode: '1101',
    IssuerName: '台泥',
    BondCode: '11011',
    ShortName: '台泥一永',
    IssueDate: '20241210',
    MaturityDate: '20291210',
    ListingDate: '20241210',
    OutstandingAmount: '8,000,000,000',
    CouponRate: '0.000000',
    PutOptionDate: '20271210',
    PutOptionPrice: '100.0000',
    'Conversion/ExchangePriceAtIssuance': '36.5000',
    ...over,
  };
}

function makeIssuancePayload(): RawCbIssuance[] {
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

/** CSV 欄位值 → CSV 欄位（含逗號者需加引號）。 */
function csvCell(value: string): string {
  return value.includes(',') ? `"${value}"` : `"${value}"`;
}

/** 組一條 BODY 列（20 欄，順序依上游規格）。 */
function bodyRow(fields: Partial<Record<string, string>>): string {
  const cells = CSV_COLUMNS.map((col) => csvCell(fields[col] ?? ''));
  return `"BODY",${cells.join(',')}`;
}

/** 自建一份 UTF-8 CSV（HEADER + 任意 BODY 列），供排序／剔除等純邏輯測試用。 */
function buildCsv(rows: Partial<Record<string, string>>[]): string {
  return [`HEADER,${CSV_COLUMNS.join(',')}`, ...rows.map(bodyRow)].join('\r\n');
}

/** 成功取得預算結果（共用：ISSBD5 + 日行情清單都餵好）。 */
async function buildOk(csvMode: CsvMode = 'big5') {
  const payloads = new Map<string, unknown>();
  payloads.set(ISSUANCE_URL, makeIssuancePayload());
  payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
  mockFetch(payloads, 200, csvMode);
  return buildCbPayload();
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('cbPremium — CSV 解碼與欄位對位', () => {
  it('BIG5 位元組解碼後中文欄位名正確（20 欄對位）', () => {
    // 複製一份等長的 ArrayBuffer，避免 Buffer 背後共用較大的 pool 造成解碼範圍錯誤。
    const big5Bytes = new Uint8Array(Buffer.from(CB_CSV_BIG5_BASE64, 'base64'));
    const text = decodeCsvBytes(big5Bytes.buffer as ArrayBuffer);
    const headerLine = text.split(/\r?\n/).find((l) => l.startsWith('HEADER')) ?? '';
    const cells = parseCsvLine(headerLine);
    // 第 0 格是列型別（HEADER），後面正好 20 個欄位名。
    expect(cells[0]).toBe('HEADER');
    expect(cells).toHaveLength(21);
    const columns = cells.slice(1);
    expect(columns).toEqual(CSV_COLUMNS);
    // 關鍵欄位對位正確（位置錯一格 → items 全空）
    expect(columns.indexOf('債券代碼')).toBe(0);
    expect(columns.indexOf('轉換價格')).toBe(4);
    expect(columns.indexOf('轉債參考價格')).toBe(15);
    expect(columns.indexOf('轉換標的股票價格')).toBe(16);
  });

  it('UTF-8 位元組也解得對（嚴格 UTF-8 優先）', () => {
    const bytes = new Uint8Array(new TextEncoder().encode(csvUtf8()));
    const text = decodeCsvBytes(bytes.buffer as ArrayBuffer);
    expect(text).toContain('債券代碼');
    expect(text).toContain('轉債參考價格');
  });

  it('千分位逗號金額解析正確；空值／哨兵值 → null（不是 0）', () => {
    expect(toNumOrNull('8,000,000,000')).toBe(8_000_000_000);
    expect(toNumOrNull('1,000.50')).toBe(1000.5);
    expect(toNumOrNull('')).toBeNull();
    expect(toNumOrNull('-')).toBeNull();
    expect(toNumOrNull('---')).toBeNull();
    expect(toNumOrNull('NULL')).toBeNull();
    expect(toNumOrNull('NaN')).toBeNull();
    expect(toNumOrNull('abc')).toBeNull();
    expect(toNumOrNull(undefined)).toBeNull();
  });
});

describe('cbPremium — buildItems（轉換溢價率排序）', () => {
  it('公式正確：轉換價值＝標的股價×100÷轉換價；折價率＝(CB價÷轉換價值−1)×100', () => {
    const csv = buildCsv([
      {
        債券代碼: '11011',
        債券簡稱: '台泥一永',
        轉換價格: '36.5000',
        轉債參考價格: '35.00',
        轉換標的股票價格: '36.50',
        轉換迄日: '2029/12/10',
        原始發行總額: '8,000,000,000',
        票面利率: '0.00000',
      },
    ]);
    const items = buildItems(csv, new Map());
    expect(items).toHaveLength(1);
    expect(items[0].conversion_value).toBe(100); // 36.50 × 100 ÷ 36.5
    expect(items[0].premium_pct).toBe(-65); // (35 / 100 − 1) × 100
    expect(items[0].due_date).toBe('2029-12');
    expect(items[0].coupon_rate).toBe(0);
  });

  it('升冪排序且只取前 30（餵 40 筆亂序列）', () => {
    const rows: Partial<Record<string, string>>[] = [];
    for (let i = 0; i < 40; i += 1) {
      // 轉換價值固定 100（標的 100 ÷ 轉換價 100），CB 價 50..89 → 折價率 -50..-11
      rows.push({
        債券代碼: String(50000 + i),
        債券簡稱: `測試債${i}`,
        轉換價格: '100',
        轉債參考價格: String(89 - i), // 故意反向餵，驗證有真的排序
        轉換標的股票價格: '100',
      });
    }
    const items = buildItems(buildCsv(rows), new Map());

    expect(items).toHaveLength(TOP_N);
    expect(items[0].premium_pct).toBe(-50);
    expect(items[TOP_N - 1].premium_pct).toBe(-21);
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i].premium_pct ?? 0).toBeGreaterThanOrEqual(items[i - 1].premium_pct ?? 0);
    }
  });

  it('缺任一價 / 轉換價為 0 → 剔除（不是補 0）', () => {
    const csv = buildCsv([
      { 債券代碼: 'A1', 轉換價格: '100', 轉債參考價格: '90', 轉換標的股票價格: '100' },
      { 債券代碼: 'A2', 轉換價格: '0', 轉債參考價格: '90', 轉換標的股票價格: '100' }, // 除零
      { 債券代碼: 'A3', 轉換價格: '100', 轉債參考價格: '', 轉換標的股票價格: '100' }, // 缺 CB 價
      { 債券代碼: 'A4', 轉換價格: '', 轉債參考價格: '90', 轉換標的股票價格: '100' }, // 缺轉換價
      { 債券代碼: 'A5', 轉換價格: '100', 轉債參考價格: '90', 轉換標的股票價格: '' }, // 缺標的價
      { 債券代碼: '', 轉換價格: '100', 轉債參考價格: '90', 轉換標的股票價格: '100' }, // 缺代號
    ]);
    const items = buildItems(csv, new Map());
    expect(items.map((x) => x.cb_id)).toEqual(['A1']);
  });
});

describe('cbPremium — buildCbPayload（本機預算入口）', () => {
  it('BIG5 CSV → items / put_schedule / calendar 全數正確', async () => {
    const result = await buildOk('big5');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.payload;

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

    // calendar：有發行日者（未掛牌者無代號 → 剔除）
    expect(body.calendar.map((r) => r.cb_id).sort()).toEqual(['11011', '22211', '99999']);
    expect(body.calendar[0].maturity_date).toBe('2029-12-10');

    // items：11011 轉換價值=36.50×100÷36.5=100 → 折價率 -65.00%；22211 → -6.32%
    expect(body.items).toHaveLength(2); // 99999 缺價被剔除
    expect(body.items[0].cb_id).toBe('11011');
    expect(body.items[0].cb_name).toBe('台泥一永'); // BIG5 解碼成功 → 中文名正確
    expect(body.items[0].premium_pct).toBe(-65.0);
    expect(body.items.find((x) => x.cb_id === '22211')?.premium_pct).toBe(-6.32);
    // 千分位逗號（ISSBD5 "8,000,000,000"）必須解析成 80 億，不能被逗號切斷成 8
    expect(body.items[0].outstanding).toBe(8_000_000_000);
    expect(body.items_unavailable_reason).toBe('');
  });

  it('上游若改餵 UTF-8 的 CSV → 仍正確解析（不因編碼改變而靜默清空）', async () => {
    const result = await buildOk('utf8');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.items).toHaveLength(2);
    expect(result.payload.items[0].cb_id).toBe('11011');
    expect(result.payload.items[0].cb_name).toBe('台泥一永');
    expect(result.payload.items[0].premium_pct).toBe(-65.0);
  });

  it('CSV 檔案本身 404 → items 為空 + 誠實說明（不影響 put_schedule）', async () => {
    const result = await buildOk('missing');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.items).toEqual([]);
    expect(result.payload.items_unavailable_reason).toContain('暫時無法取得');
    expect(result.payload.put_schedule.map((r) => r.cb_id)).toEqual(['11011', '22211']);
  });

  it('日行情清單抓不到（stat 參數輸入錯誤）→ items 為空 + 誠實說明', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, makeIssuancePayload());
    payloads.set(CB_DAILY_LIST_URL, { stat: '參數輸入錯誤' });
    mockFetch(payloads);

    const result = await buildCbPayload();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.items).toEqual([]);
    expect(result.payload.items_unavailable_reason).toContain('暫時無法取得');
    expect(result.payload.provenance.source).toBe('self-produced');
    expect(result.payload.put_schedule).toHaveLength(2);
  });

  it('賣回價空值 → put_price 為 null（不是 0）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, [cbRow({ BondCode: '11011', PutOptionPrice: '' })]);
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const result = await buildCbPayload();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.put_schedule).toHaveLength(1);
    expect(result.payload.put_schedule[0].put_price).toBeNull();
  });

  it('ISSBD5 失敗 → ok:false（不以空集合冒充成功）', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, {});
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads, 500);

    const result = await buildCbPayload();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('cb_upstream_error');
    expect(result.message).toContain('ISSBD5');
  });

  it('ISSBD5 回非陣列 → ok:false', async () => {
    const payloads = new Map<string, unknown>();
    payloads.set(ISSUANCE_URL, { foo: 'bar' });
    payloads.set(CB_DAILY_LIST_URL, makeCbDailyListPayload());
    mockFetch(payloads);

    const result = await buildCbPayload();
    expect(result.ok).toBe(false);
  });

  it('日期正規化：8 碼西元 / 7 碼民國 / 空值', () => {
    expect(normalizeDate('20260928')).toBe('2026-09-28');
    expect(normalizeDate('1150924')).toBe('2026-09-24');
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate(undefined)).toBe('');
    expect(normalizeDate('115/09/24')).toBe('115/09/24');
  });
});

describe('cbPremium — KV 信封（scan:cb）', () => {
  function samplePayload(): CbResponse {
    return {
      available: true,
      date: '2026-09-28',
      data_scope: '盤後',
      next_update: '下一交易日盤後',
      items: [],
      put_schedule: [],
      calendar: [],
      note: '',
      items_unavailable_reason: '',
      provenance: { source: 'self-produced', upstream: 'tpex' },
      fetchedAt: '2026-09-29T05:00:00.000Z',
    };
  }

  it('buildCbKvValue → parseCbKvValue 往返一致（含 computedAt）', () => {
    const payload = samplePayload();
    const raw = buildCbKvValue(payload, '2026-09-29T13:45:00.000Z');
    const parsed = parseCbKvValue(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.computedAt).toBe('2026-09-29T13:45:00.000Z');
    expect(parsed?.payload.date).toBe('2026-09-28');
    expect(parsed?.payload.items).toEqual([]);
  });

  it('裸 CbResponse（無信封）也讀得動，computedAt 退回 fetchedAt', () => {
    const payload = samplePayload();
    const parsed = parseCbKvValue(JSON.stringify(payload));

    expect(parsed).not.toBeNull();
    expect(parsed?.computedAt).toBe('2026-09-29T05:00:00.000Z');
    expect(parsed?.payload.date).toBe('2026-09-28');
  });

  it('值損壞（非 JSON / 非物件 / 缺 items）→ null，不拋例外', () => {
    expect(parseCbKvValue('not-json')).toBeNull();
    expect(parseCbKvValue('')).toBeNull();
    expect(parseCbKvValue('[]')).toBeNull();
    expect(parseCbKvValue('null')).toBeNull();
    expect(parseCbKvValue('"hello"')).toBeNull();
    expect(parseCbKvValue(JSON.stringify({ computedAt: 'x', payload: { foo: 1 } }))).toBeNull();
    expect(parseCbKvValue(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('cbPremium — 尚無預算結果的誠實回應', () => {
  it('available:false + 說明「預算」，且文案不含「載入中」', () => {
    const body = buildNotReadyPayload();

    expect(body.available).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.put_schedule).toEqual([]);
    expect(body.calendar).toEqual([]);
    expect(body.items_unavailable_reason).toContain('預算');
    expect(body.items_unavailable_reason).not.toContain('載入中');
    expect(body.provenance.source).toBe('self-produced');
  });
});
