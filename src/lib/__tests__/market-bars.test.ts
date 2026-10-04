import {
  MAX_INGEST_DAYS,
  MAX_INGEST_TRADING_DAYS,
  MARKET_BARS_KV_PREFIX,
  buildStoredDay,
  buildTradingDayWindow,
  compactBars,
  countTradingDays,
  eachDateInRange,
  expandBars,
  fetchTpexDay,
  fetchTwseDay,
  formatTpexDate,
  formatTwseDate,
  formatYmd,
  isTradingDay,
  listStoredDates,
  loadDay,
  loadRange,
  marketBarKey,
  normalizeTpexRows,
  normalizeTwseRows,
  parseNumber,
  parseTpexDate,
  parseTwseRocDate,
  parseYmdToDate,
  sharesToLots,
  storeDay,
  type Bar,
  type SkynetKvWithList,
  type StoredMarketDay,
} from '../marketBars';

// ---------------------------------------------------------------------------
// 測試替身
// ---------------------------------------------------------------------------

/** 以 Map 實作的假 KV（支援 get / put / list），供 KV 存取邏輯的端到端測試。 */
function makeKv(): SkynetKvWithList {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
    list: async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? '';
      const keys = [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

/** 以 UTC 午夜建立日期（避免時區漂移）。 */
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// ---------------------------------------------------------------------------
// 日期格式與解析
// ---------------------------------------------------------------------------

describe('marketBars 日期格式', () => {
  test('formatTwseDate → YYYYMMDD', () => {
    expect(formatTwseDate(d(2026, 9, 24))).toBe('20260924');
    expect(formatTwseDate(d(2026, 1, 5))).toBe('20260105');
  });

  test('formatTpexDate → YYYY/MM/DD（帶斜線，與 TWSE 不同）', () => {
    expect(formatTpexDate(d(2026, 9, 24))).toBe('2026/09/24');
    expect(formatTpexDate(d(2026, 1, 5))).toBe('2026/01/05');
  });

  test('formatYmd → YYYY-MM-DD', () => {
    expect(formatYmd(d(2026, 9, 24))).toBe('2026-09-24');
  });

  test('parseYmdToDate 支援 YYYYMMDD 與 YYYY-MM-DD', () => {
    expect(parseYmdToDate('20260924')?.getTime()).toBe(d(2026, 9, 24).getTime());
    expect(parseYmdToDate('2026-09-24')?.getTime()).toBe(d(2026, 9, 24).getTime());
    expect(parseYmdToDate('bad')).toBeNull();
    expect(parseYmdToDate('')).toBeNull();
  });

  test('parseTwseRocDate 支援民國年中文與西元 8 碼', () => {
    expect(parseTwseRocDate('115年09月24日 每日收盤行情(全部)')).toBe('2026-09-24');
    expect(parseTwseRocDate('20260924')).toBe('2026-09-24');
    expect(parseTwseRocDate('garbage')).toBeNull();
  });

  test('parseTpexDate 支援西元 8 碼與民國年斜線格式', () => {
    expect(parseTpexDate('20260924')).toBe('2026-09-24');
    expect(parseTpexDate('115/09/24')).toBe('2026-09-24');
    expect(parseTpexDate('nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 交易日判斷
// ---------------------------------------------------------------------------

describe('marketBars 交易日', () => {
  test('週六／週日非交易日', () => {
    expect(isTradingDay(d(2026, 9, 26))).toBe(false); // 週六
    expect(isTradingDay(d(2026, 9, 27))).toBe(false); // 週日
  });

  test('平日且非休市日為交易日', () => {
    expect(isTradingDay(d(2026, 9, 24))).toBe(true); // 週四
  });

  test('休市日（中秋）非交易日', () => {
    expect(isTradingDay(d(2026, 9, 25))).toBe(false);
  });

  // ⚠ 2026-10-04 新增：教師節（2026-09-28，週一）自 2025 年起恢復為國定假日，
  //    TWSE MI_INDEX 對該日實測回「沒有符合條件的資料」→ 已補進休市表。
  test('休市日（教師節）非交易日', () => {
    expect(isTradingDay(d(2026, 9, 28))).toBe(false);
  });

  test('buildTradingDayWindow 只取交易日並升冪', () => {
    // 由 2026-09-24（週四）往前取 3 個交易日：09-24、09-23、09-22
    const win = buildTradingDayWindow(d(2026, 9, 24), 3);
    expect(win).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
  });

  test('buildTradingDayWindow 遇到週末會自動跳過', () => {
    // 由 2026-09-21（週一）往前取 3 個交易日：09-21、09-18（跳過 09-19/09-20 週末）
    const win = buildTradingDayWindow(d(2026, 9, 21), 3);
    expect(win).toEqual(['2026-09-17', '2026-09-18', '2026-09-21']);
  });

  test('buildTradingDayWindow 遇到休市日也會跳過', () => {
    // 由 2026-09-30（週三）往前取 3 個交易日：
    //   09-30 ✓、09-29 ✓、09-28（教師節休市）✗、09-27/09-26 週末 ✗、09-25（中秋休市）✗、09-24 ✓
    const win = buildTradingDayWindow(d(2026, 9, 30), 3);
    expect(win).toEqual(['2026-09-24', '2026-09-29', '2026-09-30']);
  });

  test('eachDateInRange 產生含頭尾的日曆區間', () => {
    expect(eachDateInRange('20260924', '20260928')).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ]);
    expect(eachDateInRange('20260928', '20260924')).toEqual([]);
  });

  test('countTradingDays 只數交易日', () => {
    // 09-24(四,交易) 09-25(中秋,休) 09-26(六) 09-27(日) 09-28(一,**教師節休市**) → 1
    // ⚠ 2026-10-04 修正：09-28 原本被誤列為交易日（休市表漏列），
    //    TWSE MI_INDEX 實測該日無資料 → 已補進休市表，故此處期望值由 2 改為 1。
    expect(countTradingDays(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 數值工具
// ---------------------------------------------------------------------------

describe('marketBars 數值工具', () => {
  test('parseNumber 去千分位並濾除無效值', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('15.55')).toBe(15.55);
    expect(parseNumber('--')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('X')).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  test('sharesToLots 股 → 張（四捨五入）', () => {
    expect(sharesToLots(8_290_000)).toBe(8290);
    expect(sharesToLots(1_234)).toBe(1);
    expect(sharesToLots(0)).toBe(0);
    expect(sharesToLots(Number.NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

describe('marketBars 正規化', () => {
  test('normalizeTwseRows 取正確欄位並濾除無成交列', () => {
    const rows = [
      ['00400A', '主動國泰動能高息', '22,871,974', '5,535', '356,726,371', '15.55', '15.66', '15.47', '15.66', '<p>+</p>', '0.09'],
      ['00625K', '富邦上証+R', '0', '0', '0', '--', '--', '--', '--', '<p> </p>', '0.00'], // 無成交 → 濾除
      ['2330', '台積電', '30,000,000', '50,000', '1,000,000,000', '1000', '1010', '990', '1005', '<p>+</p>', '5'],
    ];
    const bars = normalizeTwseRows(rows);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ code: '00400A', open: 15.55, high: 15.66, low: 15.47, close: 15.66, volumeLots: 22872 });
    expect(bars[1]).toEqual({ code: '2330', open: 1000, high: 1010, low: 990, close: 1005, volumeLots: 30000 });
  });

  test('normalizeTpexRows 處理「收盤在開盤之前」的欄位順序', () => {
    const rows = [
      ['00411A', '主動統一前沿科技', '10.47', '-0.03', '10.45', '10.50', '10.44', '8,290,000', '86,808,380', '995'],
    ];
    const bars = normalizeTpexRows(rows);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({ code: '00411A', open: 10.45, high: 10.5, low: 10.44, close: 10.47, volumeLots: 8290 });
  });

  test('正規化對非陣列輸入回空陣列（防禦上游格式變動）', () => {
    expect(normalizeTwseRows(null)).toEqual([]);
    expect(normalizeTwseRows('nope')).toEqual([]);
    expect(normalizeTpexRows(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 壓縮 / 展開
// ---------------------------------------------------------------------------

describe('marketBars 壓縮與展開', () => {
  const bars: Bar[] = [
    { code: '2330', open: 1000, high: 1010, low: 990, close: 1005, volumeLots: 30000 },
    { code: '2317', open: 200, high: 205, low: 198, close: 203, volumeLots: 12000 },
  ];

  test('compactBars 轉為陣列並省去 key 名', () => {
    expect(compactBars(bars)).toEqual([
      ['2330', 1000, 1010, 990, 1005, 30000],
      ['2317', 200, 205, 198, 203, 12000],
    ]);
  });

  test('expandBars 為 compactBars 的反函式', () => {
    expect(expandBars(compactBars(bars))).toEqual(bars);
  });

  test('expandBars 略過畸形列', () => {
    expect(expandBars([['2330', 1, 2, 3] as unknown as [string, number, number, number, number, number]])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KV 存取（以假 KV 做端到端）
// ---------------------------------------------------------------------------

describe('marketBars KV 存取', () => {
  const payload: StoredMarketDay = buildStoredDay(
    '2026-09-24',
    [{ code: '2330', open: 1000, high: 1010, low: 990, close: 1005, volumeLots: 30000 }],
    [{ code: '00411A', open: 10.45, high: 10.5, low: 10.44, close: 10.47, volumeLots: 8290 }],
    { twse: 35605, tpex: 1015 },
  );

  test('marketBarKey 使用 mkt:bars: 前綴', () => {
    expect(marketBarKey('2026-09-24')).toBe('mkt:bars:2026-09-24');
    expect(MARKET_BARS_KV_PREFIX).toBe('mkt:bars:');
  });

  test('storeDay → loadDay 往返一致', async () => {
    const kv = makeKv();
    await storeDay(kv, '2026-09-24', payload);
    const loaded = await loadDay(kv, '2026-09-24');
    expect(loaded).toEqual(payload);
    expect(loaded?.counts).toEqual({ twse: 1, tpex: 1 });
  });

  test('loadDay 對不存在的日期回 null', async () => {
    const kv = makeKv();
    expect(await loadDay(kv, '2026-09-25')).toBeNull();
  });

  test('loadRange 誠實回報缺失日期', async () => {
    const kv = makeKv();
    await storeDay(kv, '2026-09-24', payload);
    const { days, missing } = await loadRange(kv, ['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(days.map((x) => x.date)).toEqual(['2026-09-24']);
    expect(missing).toEqual(['2026-09-23', '2026-09-25']);
  });

  test('listStoredDates 列出已累積日期（升冪）', async () => {
    const kv = makeKv();
    await storeDay(kv, '2026-09-24', payload);
    await storeDay(kv, '2026-09-23', payload);
    expect(await listStoredDates(kv)).toEqual(['2026-09-23', '2026-09-24']);
  });

  test('listStoredDates 對不支援 list 的 KV 回 null', async () => {
    const kv = makeKv();
    delete (kv as { list?: unknown }).list;
    expect(await listStoredDates(kv)).toBeNull();
  });

  test('buildStoredDay 帶上統一 provenance', () => {
    expect(payload.provenance.source).toBe('self-produced');
    expect(payload.provenance.upstream).toContain('twse.com.tw');
    expect(payload.rawCounts).toEqual({ twse: 35605, tpex: 1015 });
  });

  test('常數符合規格', () => {
    expect(MAX_INGEST_DAYS).toBe(40);
    expect(MAX_INGEST_TRADING_DAYS).toBeLessThanOrEqual(16);
    expect(MAX_INGEST_TRADING_DAYS * 3).toBeLessThanOrEqual(50); // subrequest 預算
  });
});

// ---------------------------------------------------------------------------
// 上游抓取（以 mock fetch 驗證形狀判斷）
// ---------------------------------------------------------------------------

describe('marketBars 上游抓取', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  test('fetchTwseDay 解析 MI_INDEX 的「每日收盤行情」表', async () => {
    const body = {
      stat: 'OK',
      date: '20260924',
      tables: [
        { title: '115年09月24日 價格指數(臺灣證券交易所)', fields: [], data: [['x']] },
        {
          title: '115年09月24日 每日收盤行情(全部)',
          fields: ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
          data: [
            ['00400A', '主動國泰動能高息', '22,871,974', '5,535', '356,726,371', '15.55', '15.66', '15.47', '15.66', '<p>+</p>', '0.09'],
            ['00625K', '富邦上証+R', '0', '0', '0', '--', '--', '--', '--', '<p> </p>', '0.00'],
          ],
        },
      ],
    };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

    const res = await fetchTwseDay(d(2026, 9, 24));
    expect(res).not.toBeNull();
    expect(res?.tradeDate).toBe('2026-09-24');
    expect(res?.bars).toHaveLength(1); // 無成交列被濾除
    expect(res?.rawCount).toBe(2);
    expect(res?.upstream).toContain('MI_INDEX');
  });

  test('fetchTwseDay 對非交易日（stat 非 OK）回 null', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ stat: '很抱歉，沒有符合條件的資料!', type: ['ALL'] }),
    })) as unknown as typeof fetch;

    expect(await fetchTwseDay(d(2026, 9, 26))).toBeNull();
  });

  test('fetchTpexDay 解析 otc 表並使用斜線日期', async () => {
    const body = {
      stat: 'ok',
      date: '20260924',
      tables: [
        {
          title: '上櫃股票每日收盤行情(不含定價)',
          fields: ['代號', '名稱', '收盤 ', '漲跌', '開盤 ', '最高 ', '最低', '成交股數'],
          data: [['00411A', '主動統一前沿科技', '10.47', '-0.03', '10.45', '10.50', '10.44', '8,290,000', '86,808,380', '995']],
        },
      ],
    };
    const spy = jest.fn(async () => ({ ok: true, json: async () => body }));
    global.fetch = spy as unknown as typeof fetch;

    const res = await fetchTpexDay(d(2026, 9, 24));
    expect(res?.tradeDate).toBe('2026-09-24');
    expect(res?.bars).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('date=2026/09/24'),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  test('fetchTpexDay 對空表（非交易日）回 null', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ stat: 'ok', date: '20260926', tables: [{ title: '上櫃股票每日收盤行情(不含定價)', data: [] }] }),
    })) as unknown as typeof fetch;

    expect(await fetchTpexDay(d(2026, 9, 26))).toBeNull();
  });

  test('上游非 2xx 時回 null', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchTwseDay(d(2026, 9, 24))).toBeNull();
    expect(await fetchTpexDay(d(2026, 9, 24))).toBeNull();
  });

  test('上游拋錯（網路失敗）時回 null', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await fetchTwseDay(d(2026, 9, 24))).toBeNull();
    expect(await fetchTpexDay(d(2026, 9, 24))).toBeNull();
  });
});
