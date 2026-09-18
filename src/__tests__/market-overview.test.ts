/**
 * 看盤日記 — 大盤總覽解析單元測試
 *
 * fixture 皆取自 2026-09-16 TWSE rwd MI_INDEX / T86 的真實回應列（由 team-lead 實打驗證）。
 */

import {
  extractBreadth,
  extractIndex,
  extractInstitutionalBuy,
  extractSectorFocus,
  extractTopGainers,
  extractTurnover,
  loadMarketOverview,
  MarketOverviewError,
  parseCountWithLimit,
  parseMarketOverview,
  parseRocDate,
  parseTwseNumber,
  parseTwseSign,
  resolveLatestTradingDate,
} from '@/lib/marketOverview';

/** tables[8] 的 16 欄位（每日收盤行情）。 */
const CLOSE_FIELDS = [
  '證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額',
  '開盤價', '最高價', '最低價', '收盤價', '漲跌(+/-)', '漲跌價差',
  '最後揭示買價', '最後揭示買量', '最後揭示賣價', '最後揭示賣量', '本益比',
];

/** 組出 tables[8] 的一列（補齊 16 欄）。 */
function closeRow(symbol: string, name: string, close: string, signHtml: string, diff: string): string[] {
  const row = new Array(16).fill('');
  row[0] = symbol;
  row[1] = name;
  row[8] = close;
  row[9] = signHtml;
  row[10] = diff;
  return row;
}

/** T86 欄位（index 18 = 三大法人買賣超股數）。 */
const T86_FIELDS = [
  '證券代號', '證券名稱',
  '外陸資買進股數(不含外資自營商)', '外陸資賣出股數(不含外資自營商)', '外陸資買賣超股數(不含外資自營商)',
  '外資自營商買進股數', '外資自營商賣出股數', '外資自營商買賣超股數',
  '投信買進股數', '投信賣出股數', '投信買賣超股數',
  '自營商買賣超股數', '自營商買進股數(自行買賣)', '自營商賣出股數(自行買賣)', '自營商買賣超股數(自行買賣)',
  '自營商買進股數(避險)', '自營商賣出股數(避險)', '自營商買賣超股數(避險)',
  '三大法人買賣超股數',
];

/** 組出 T86 的一列。 */
function t86Row(symbol: string, name: string, netShares: string): string[] {
  const row = new Array(T86_FIELDS.length).fill('0');
  row[0] = symbol;
  row[1] = name;
  row[18] = netShares;
  return row;
}

/** 真實形狀的 tables（每張為 { title, fields, data }）。 */
const TABLES = [
  {
    title: '115年09月16日 價格指數(臺灣證券交易所)',
    fields: ['指數', '收盤指數', '漲跌(+/-)', '漲跌點數', '漲跌百分比(%)', '特殊處理註記'],
    data: [
      ['發行量加權股價指數', '45,848.90', "<p style ='color:red'>+</p>", '337.41', '0.74', ''],
      ['未含金融指數', '13,000.00', "<p style ='color:green'>-</p>", '20.00', '-0.15', ''],
    ],
  },
  { title: '價格指數(跨市場)', fields: [], data: [] },
  {
    title: '價格指數(臺灣指數公司)',
    fields: ['指數', '收盤指數', '漲跌(+/-)', '漲跌點數', '漲跌百分比(%)', '特殊處理註記'],
    data: [['金融類日報酬反向一倍指數', '1,897.45', "<p style ='color:green'>-</p>", '27.55', '-1.43', '']],
  },
  { title: '報酬指數(臺灣證券交易所)', fields: [], data: [] },
  { title: '報酬指數(跨市場)', fields: [], data: [] },
  { title: '報酬指數(臺灣指數公司)', fields: [], data: [] },
  {
    title: '115年09月16日 大盤統計資訊',
    fields: ['成交統計', '成交金額(元)', '成交股數(股)', '成交筆數'],
    data: [
      ['1.一般股票', '620,167,469,587', '3,428,760,801', '2,635,660'],
      ['4.ETF', '49,808,425,018', '2,109,963,641', '662,258'],
      ['6.合計', '999,999,999,999', '9,999,999,999', '9,999,999'],
    ],
  },
  {
    title: '漲跌證券數合計',
    fields: ['類型', '整體市場', '股票'],
    data: [
      ['上漲(漲停)', '7,321(98)', '733(24)'],
      ['下跌(跌停)', '4,558(75)', '213(0)'],
      ['持平', '1,157', '120'],
      ['未成交', '17,769', '8'],
    ],
  },
  {
    title: '115年09月16日 每日收盤行情(全部)',
    fields: CLOSE_FIELDS,
    data: [
      // 00400A 為主動式 ETF，必須被排除
      closeRow('00400A', '主動國泰動能高息', '14.52', '<p style= color:red>+</p>', '0.10'),
      // 4 碼普通股，用來驗證 prevClose / changePercent 計算
      closeRow('1234', '測試電子', '14.52', "<p style='color:red'>+</p>", '0.10'),
      closeRow('2330', '台積電', '1,000.00', "<p style='color:red'>+</p>", '10.00'),
    ],
  },
  { title: null, fields: null, data: [] },
];

/**
 * tables[0]（價格指數）專用 fixture，用來驗證產業焦點解析。
 * 涵蓋：新制細類、舊制 5 檔總類股（須排除）、無「類指數」後綴的一般指數（須排除）。
 */
const SECTOR_TABLES = [
  {
    title: '115年09月16日 價格指數(臺灣證券交易所)',
    fields: ['指數', '收盤指數', '漲跌(+/-)', '漲跌點數', '漲跌百分比(%)', '特殊處理註記'],
    data: [
      ['發行量加權股價指數', '45,848.90', "<p style ='color:red'>+</p>", '337.41', '0.74', ''],
      // 新制細類指數（應保留並去掉後綴）
      ['半導體類指數', '1,000.00', "<p style ='color:red'>+</p>", '20.00', '2.50', ''],
      ['電腦及週邊設備類指數', '500.00', "<p style ='color:green'>-</p>", '5.00', '-0.99', ''],
      ['航運類指數', '300.00', "<p style ='color:red'>+</p>", '6.00', '2.04', ''],
      // 舊制 5 檔總類股（應全部排除）
      ['水泥窯製類指數', '150.00', "<p style ='color:red'>+</p>", '1.00', '0.67', ''],
      ['塑膠化工類指數', '160.00', "<p style ='color:red'>+</p>", '1.00', '0.63', ''],
      ['機電類指數', '170.00', "<p style ='color:red'>+</p>", '1.00', '0.59', ''],
      ['化學生技醫療類指數', '180.00', "<p style ='color:red'>+</p>", '1.00', '0.56', ''],
      ['電子工業類指數', '190.00', "<p style ='color:red'>+</p>", '1.00', '0.53', ''],
      // 無「類指數」後綴（應排除）
      ['未含金融指數', '13,000.00', "<p style ='color:green'>-</p>", '20.00', '-0.15', ''],
    ],
  },
];

describe('parseTwseSign', () => {
  it('有引號的紅色 HTML 視為上漲', () => {
    expect(parseTwseSign("<p style ='color:red'>+</p>")).toBe(1);
  });

  it('有引號的綠色 HTML 視為下跌', () => {
    expect(parseTwseSign("<p style ='color:green'>-</p>")).toBe(-1);
  });

  it('無引號的紅色 HTML（tables[8] 格式）也視為上漲', () => {
    expect(parseTwseSign('<p style= color:red>+</p>')).toBe(1);
  });

  it('純符號字串以字元判斷方向', () => {
    expect(parseTwseSign('+')).toBe(1);
    expect(parseTwseSign('-')).toBe(-1);
    expect(parseTwseSign('')).toBe(0);
  });
});

describe('parseCountWithLimit', () => {
  it('含括號時拆出 count 與 limit', () => {
    expect(parseCountWithLimit('733(24)')).toEqual({ count: 733, limit: 24 });
  });

  it('無括號時 limit 為 0', () => {
    expect(parseCountWithLimit('1,157')).toEqual({ count: 1157, limit: 0 });
  });

  it('處理未成交列', () => {
    expect(parseCountWithLimit('17,769')).toEqual({ count: 17769, limit: 0 });
  });
});

describe('parseTwseNumber', () => {
  it('去除千分位逗號', () => {
    expect(parseTwseNumber('45,848.90')).toBeCloseTo(45848.9, 6);
  });

  it('非數字回 NaN', () => {
    expect(Number.isNaN(parseTwseNumber('-'))).toBe(true);
    expect(Number.isNaN(parseTwseNumber(''))).toBe(true);
  });
});

describe('parseRocDate', () => {
  it('民國日期轉西元', () => {
    expect(parseRocDate('1150916')).toBe('2026-09-16');
  });

  it('長度不足回 null', () => {
    expect(parseRocDate('115091')).toBeNull();
  });
});

describe('extractIndex', () => {
  it('取加權指數收盤、方向與漲跌點數', () => {
    const quote = extractIndex(TABLES);
    expect(quote.symbol).toBe('tse_t00.tw');
    expect(quote.price).toBeCloseTo(45848.9, 4);
    expect(quote.change).toBeCloseTo(337.41, 4);
    expect(quote.changePercent).toBeCloseTo(0.74, 4);
    expect(quote.source).toBe('twse-mi-index-close');
  });
});

describe('extractSectorFocus', () => {
  it('只取「類指數」列並去掉後綴（一般指數如「未含金融指數」不納入）', () => {
    const sectors = extractSectorFocus(SECTOR_TABLES);
    expect(sectors.map((item) => item.name)).toEqual(['半導體', '航運', '電腦及週邊設備']);
    expect(sectors.some((item) => item.name.includes('指數'))).toBe(false);
  });

  it('排除舊制 5 檔總類股（水泥窯製／塑膠化工／機電／化學生技醫療／電子工業）', () => {
    const sectors = extractSectorFocus(SECTOR_TABLES);
    const names = sectors.map((item) => item.name);
    expect(names).not.toContain('水泥窯製');
    expect(names).not.toContain('塑膠化工');
    expect(names).not.toContain('機電');
    expect(names).not.toContain('化學生技醫療');
    expect(names).not.toContain('電子工業');
    expect(sectors).toHaveLength(3);
  });

  it('漲跌點數乘上符號（綠字轉負），漲跌百分比直接取用（已帶正負、不再乘符號）', () => {
    const sectors = extractSectorFocus(SECTOR_TABLES);
    const semi = sectors.find((item) => item.name === '半導體');
    const pc = sectors.find((item) => item.name === '電腦及週邊設備');
    // 半導體：紅字 +20.00 點、+2.50%
    expect(semi?.change).toBeCloseTo(20, 6);
    expect(semi?.changePercent).toBeCloseTo(2.5, 6);
    // 電腦及週邊設備：綠字 -5.00 點、-0.99%
    expect(pc?.change).toBeCloseTo(-5, 6);
    expect(pc?.changePercent).toBeCloseTo(-0.99, 6);
  });

  it('依漲跌百分比由大到小排序', () => {
    const sectors = extractSectorFocus(SECTOR_TABLES);
    for (let index = 1; index < sectors.length; index += 1) {
      expect(sectors[index - 1].changePercent).toBeGreaterThanOrEqual(sectors[index].changePercent);
    }
  });

  it('limit 參數生效（預設 5）', () => {
    expect(extractSectorFocus(SECTOR_TABLES)).toHaveLength(3);
    expect(extractSectorFocus(SECTOR_TABLES, 2).map((item) => item.name)).toEqual(['半導體', '航運']);
  });
});

describe('extractBreadth', () => {
  it('取「股票」欄而非「整體市場」欄', () => {
    const breadth = extractBreadth(TABLES);
    expect(breadth.up).toBe(733);
    expect(breadth.down).toBe(213);
    expect(breadth.flat).toBe(120);
    expect(breadth.noTrade).toBe(8);
    expect(breadth.upLimit).toBe(24);
    expect(breadth.downLimit).toBe(0);
  });

  it('upRatio = up / (up + down + flat)', () => {
    const breadth = extractBreadth(TABLES);
    expect(breadth.upRatio).toBeCloseTo(733 / 1066, 4);
    expect(breadth.upRatio).toBeCloseTo(0.688, 3);
  });
});

describe('extractTurnover', () => {
  it('累加編號列且跳過「合計」', () => {
    const turnover = extractTurnover(TABLES);
    expect(turnover.categories).toHaveLength(2);
    expect(turnover.categories.map((item) => item.label)).toEqual(['1.一般股票', '4.ETF']);
    expect(turnover.total).toBe(620_167_469_587 + 49_808_425_018);
  });
});

describe('extractTopGainers', () => {
  it('排除 00400A（非 4 碼普通股）', () => {
    const movers = extractTopGainers(TABLES);
    expect(movers.some((item) => item.symbol === '00400A')).toBe(false);
    expect(movers.map((item) => item.symbol)).not.toContain('00400A');
  });

  it('prevClose 與 changePercent 計算正確（14.52 / +0.10）', () => {
    const movers = extractTopGainers(TABLES);
    const target = movers.find((item) => item.symbol === '1234');
    expect(target).toBeDefined();
    expect(target?.change).toBeCloseTo(0.1, 6);
    expect((target?.price ?? 0) - (target?.change ?? 0)).toBeCloseTo(14.42, 6);
    expect(target?.changePercent).toBeCloseTo(0.693, 2);
  });

  it('依漲幅由大到小排序', () => {
    const movers = extractTopGainers(TABLES);
    for (let index = 1; index < movers.length; index += 1) {
      expect(movers[index - 1].changePercent).toBeGreaterThanOrEqual(movers[index].changePercent);
    }
  });
});

describe('extractInstitutionalBuy', () => {
  it('換算為張並 trim 名稱', () => {
    const t86 = {
      stat: 'OK',
      fields: T86_FIELDS,
      data: [
        t86Row('2409', '友達            ', '56,611,082'),
        t86Row('2330', '台積電', '12,345,678'),
      ],
    };
    const result = extractInstitutionalBuy(t86);
    expect(result[0].symbol).toBe('2409');
    expect(result[0].name).toBe('友達');
    expect(result[0].netLots).toBe(56611);
    expect(result[1].netLots).toBe(12346);
  });

  it('排除非 4 碼標的', () => {
    const t86 = {
      stat: 'OK',
      fields: T86_FIELDS,
      data: [t86Row('00400A', '主動國泰動能高息', '9,999,999')],
    };
    expect(extractInstitutionalBuy(t86)).toHaveLength(0);
  });
});

describe('parseMarketOverview', () => {
  it('組出總覽時帶上 sectorFocus（產業焦點已接上真資料）', () => {
    const overview = parseMarketOverview(
      { tables: SECTOR_TABLES },
      { stat: 'OK', fields: T86_FIELDS, data: [t86Row('2330', '台積電', '12,345,678')] },
      '20260916',
    );
    expect(overview.date).toBe('2026-09-16');
    expect(Array.isArray(overview.sectorFocus)).toBe(true);
    expect(overview.sectorFocus[0]?.name).toBe('半導體');
  });
});

describe('fetch 預設參數缺陷迴歸（模擬無全域 fetch 的執行環境）', () => {
  // jsdom 環境沒有把 fetch 掛成裸全域；這裡明確刪除並於事後還原，
  // 以穩定重現「沒有可用 fetch」情境，且不讓測試真的打 TWSE 網路。
  const savedFetch = globalThis.fetch;

  beforeEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = savedFetch;
  });

  it('resolveLatestTradingDate() 未傳 fetchImpl 時丟出 MarketOverviewError，且不是 ReferenceError', async () => {
    let caught: Error | null = null;
    try {
      await resolveLatestTradingDate();
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeInstanceOf(MarketOverviewError);
    expect(caught?.name).not.toBe('ReferenceError');
  });

  it('loadMarketOverview(date) 未傳 fetchImpl 時丟出 MarketOverviewError，且不是 ReferenceError', async () => {
    let caught: Error | null = null;
    try {
      await loadMarketOverview('20260914');
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeInstanceOf(MarketOverviewError);
    expect(caught?.name).not.toBe('ReferenceError');
  });

  it('無 fetch 時的錯誤訊息必須包含「fetch」以便診斷', async () => {
    await expect(resolveLatestTradingDate()).rejects.toThrow(/fetch/);
  });
});

// ── resolveLatestTradingDate 資料新鮮度（openapi 落後時必須追上今天）──────

/** 以台北時區取得今天（'YYYYMMDD'），與 lib 內的 taipeiTodayYmd 同義。 */
function taipeiToday(): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return formatted.replace(/-/g, '');
}

/** 'YYYYMMDD' 位移 deltaDays 天。 */
function shiftDay(ymd: string, deltaDays: number): string {
  const dt = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** 'YYYYMMDD' → 民國 7 碼（openapi 的「日期」欄格式，例如 20260917 → 1150917）。 */
function toRoc(ymd: string): string {
  return `${String(Number(ymd.slice(0, 4)) - 1911).padStart(3, '0')}${ymd.slice(4)}`;
}

/**
 * 依 URL 內容回應的 fetch mock：分辨 openapi 與各日期的 rwd MI_INDEX，
 * 因此「今天」是動態的也不會失敗（不寫死日期字串）。
 */
function makeFetchMock(opts: {
  openapi?: { ok: boolean; rows?: Array<Record<string, string>> } | 'throw';
  rwdOkDates?: string[];
}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes('openapi.twse.com.tw')) {
      if (opts.openapi === 'throw') throw new Error('openapi unavailable');
      if (!opts.openapi || !opts.openapi.ok) return { ok: false, json: async () => null } as unknown as Response;
      const rows = opts.openapi.rows ?? [];
      return { ok: true, json: async () => rows } as unknown as Response;
    }
    if (url.includes('/rwd/zh/afterTrading/MI_INDEX')) {
      const date = url.match(/date=(\d{8})/)?.[1] ?? '';
      const isTrading = (opts.rwdOkDates ?? []).includes(date);
      return {
        ok: true,
        json: async () => ({ stat: isTrading ? 'OK' : '很抱歉，沒有符合條件的資料！' }),
      } as unknown as Response;
    }
    throw new Error(`unexpected url: ${url}`);
  };
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

describe('resolveLatestTradingDate 資料新鮮度', () => {
  it('openapi 已是今天 → 回傳今天，且完全不去打 rwd（快路徑）', async () => {
    const today = taipeiToday();
    const { fetchImpl, calls } = makeFetchMock({ openapi: { ok: true, rows: [{ 日期: toRoc(today) }] } });
    await expect(resolveLatestTradingDate(fetchImpl)).resolves.toBe(today);
    expect(calls.some((url) => url.includes('/rwd/zh/afterTrading/MI_INDEX'))).toBe(false);
  });

  it('openapi 落後、但今天 rwd 已 stat=OK → 回傳今天（本次修復核心斷言）', async () => {
    const today = taipeiToday();
    const yesterday = shiftDay(today, -1);
    const { fetchImpl, calls } = makeFetchMock({
      openapi: { ok: true, rows: [{ 日期: toRoc(yesterday) }] },
      rwdOkDates: [today],
    });
    await expect(resolveLatestTradingDate(fetchImpl)).resolves.toBe(today);
    // 必須真的探測過「今天」的 rwd
    expect(calls.some((url) => url.includes(`date=${today}`))).toBe(true);
  });

  it('openapi 落後、今天 rwd 非 OK（週末／假日／未發布）→ 回傳 openapi 日期', async () => {
    const today = taipeiToday();
    const yesterday = shiftDay(today, -1);
    const { fetchImpl } = makeFetchMock({
      openapi: { ok: true, rows: [{ 日期: toRoc(yesterday) }] },
      rwdOkDates: [],
    });
    await expect(resolveLatestTradingDate(fetchImpl)).resolves.toBe(yesterday);
  });

  it('openapi 拋錯 → 逐日回推仍可找到最近交易日', async () => {
    const today = taipeiToday();
    const twoDaysAgo = shiftDay(today, -2);
    const { fetchImpl, calls } = makeFetchMock({ openapi: 'throw', rwdOkDates: [twoDaysAgo] });
    await expect(resolveLatestTradingDate(fetchImpl)).resolves.toBe(twoDaysAgo);
    // 應依序探測 今天、今天-1、今天-2
    expect(calls.some((url) => url.includes(`date=${today}`))).toBe(true);
    expect(calls.some((url) => url.includes(`date=${shiftDay(today, -1)}`))).toBe(true);
    expect(calls.some((url) => url.includes(`date=${twoDaysAgo}`))).toBe(true);
  });

  it('openapi 回非 200 → 逐日回推仍可找到最近交易日', async () => {
    const today = taipeiToday();
    const threeDaysAgo = shiftDay(today, -3);
    const { fetchImpl } = makeFetchMock({ openapi: { ok: false }, rwdOkDates: [threeDaysAgo] });
    await expect(resolveLatestTradingDate(fetchImpl)).resolves.toBe(threeDaysAgo);
  });
});
