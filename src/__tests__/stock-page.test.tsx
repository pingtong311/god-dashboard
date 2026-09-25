/**
 * /stock 頁面渲染與忠實度測試
 * - 以 mock fetch 驅動聚合資料，驗證總覽頁關鍵文案（對照 text/tab-stock.txt）
 * - 驗證 10 個子分頁切換狀態（aria-current="location"）
 * - 驗證未入庫欄位誠實標示、無假資料
 *
 * 註：本專案未掛 @testing-library/jest-dom，故一律用原生 matcher（toBeTruthy /
 * toContain / getAttribute），與 legal-pages.test.tsx 慣例一致。
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import StockPage from '@/app/stock/page';
import { buildStockResearchData, type DailyCandle, type RawStockInputs } from '@/lib/stockResearch';

// jsdom 未實作 scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: jest.fn() }),
  useSearchParams: () => new URLSearchParams('id=2330'),
}));

/** 產生 60 根日 K（每 6 根一浪、淨 +6；高點與低點同步墊高），供技術／風險／情境推導。 */
function makeDailyCandles(count = 60): DailyCandle[] {
  const out: DailyCandle[] = [];
  let price = 2380;
  for (let i = 0; i < count; i += 1) {
    price += i % 6 < 3 ? 4 : -2;
    out.push({
      date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price - 4,
      high: price + 10,
      low: price - 12,
      close: price,
      volume: 9000 + i * 100,
    });
  }
  return out;
}

const RAW: RawStockInputs = {
  quote: {
    price: 2475,
    changePct: -1,
    open: 2480,
    high: 2490,
    low: 2470,
    prevClose: 2500,
    volumeLots: 12989,
    tradeDate: '2026-09-24',
    asOf: '13:30',
    name: '台積電',
  },
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
  fundamental: {
    peRatio: 28.69,
    pbRatio: 9.98,
    dividendYield: 0.89,
    monthlyRevenue: 514805000000,
    monthlyRevenueYoY: 10.1,
    asOfDate: '2026-08',
  },
  dailyCandles: makeDailyCandles(),
};

const DATA = buildStockResearchData('2330', RAW, new Date('2026-09-24T06:00:00Z'));

/** jsdom 無全域 Response，故以最小 mock 物件取代。 */
function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  pushMock.mockClear();
  global.fetch = jest.fn(() =>
    Promise.resolve(mockJsonResponse({ ok: true, data: DATA, fetchedAt: '2026-09-24T05:30:00.000Z' }))
  ) as unknown as typeof fetch;
});

async function renderPage() {
  const view = render(<StockPage />);
  // 等資料載入（「目前研究」是資料載入後才出現的節點）
  await screen.findByText('目前研究');
  return view;
}

describe('/stock?id=2330 頁面', () => {
  it('渲染標題與查詢框', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: /個股研究/ })).toBeTruthy();
    expect(screen.getByText('輸入代號或名稱（例如 2330、台積電）')).toBeTruthy();
    expect(screen.getByPlaceholderText('2330 或 台積電')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查詢' })).toBeTruthy();
  });

  it('忠實度：總覽頁關鍵文案皆存在（對照 tab-stock.txt）', async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? '';
    const keys = [
      '最近查詢',
      '清除',
      '目前研究',
      '找相似條件',
      '追分點',
      '自選',
      '設提醒',
      '加入持股',
      '分享',
      '目前資料摘要 · 歷史資料',
      '預估量怎麼看？',
      '2330 我該怎麼看？',
      '先選你的持有時間。同一檔股票，抱幾天和當天沖掉，要看的東西完全不同。',
      '我做波段：只看日 K、籌碼連續性與過夜風險',
      '我做當沖：只看盤中價量與短線風險',
      '研究熱度',
      '查看評分依據',
      '📍 產業定位',
      '研究摘要',
      '證據檢查清單',
      '個股新聞',
      '資料日期與口徑',
      '資料未入庫',
    ];
    for (const k of keys) {
      expect(text).toContain(k);
    }
  });

  it('忠實度：9 個子分頁標籤齊全且總覽為預設選中（實站無「價量」分頁）', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股研究區塊' });
    const labels = ['總覽', '盤口', '風險', '走勢', '技術', '籌碼', '分點', '基本面', '情境'];
    for (const l of labels) {
      expect(within(nav).getByText(l)).toBeTruthy();
    }
    // 子分頁恰為 9 個（不含事實卡「價量」）
    expect(within(nav).getAllByRole('button')).toHaveLength(9);
    expect(within(nav).queryByText('價量')).toBeNull();
    expect(within(nav).getByText('總覽').closest('button')?.getAttribute('aria-current')).toBe('location');
    expect(within(nav).getByText('盤口').closest('button')?.getAttribute('aria-current')).toBeNull();
  });

  it('忠實度：8 張事實卡標籤齊全且有真實值', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股事實導航' });
    const text = nav.textContent ?? '';
    for (const l of ['價量', '三大法人', '分點', '大戶級距', '當沖', '融資券', '籌碼體檢', '監理']) {
      expect(text).toContain(l);
    }
    expect(text).toContain('外資 -4,668 張');
    expect(text).toContain('融資 3.0 萬 張');
    expect(text).toContain('2,475（-1%）');
  });

  it('子分頁切換：點「籌碼」→ aria-current 轉移且內容更新', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股研究區塊' });
    fireEvent.click(within(nav).getByText('籌碼'));
    await waitFor(() => {
      expect(within(nav).getByText('籌碼').closest('button')?.getAttribute('aria-current')).toBe('location');
    });
    expect(within(nav).getByText('總覽').closest('button')?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('三大法人（最新交易日）')).toBeTruthy();
    expect(screen.getByText('融資融券（最新交易日）')).toBeTruthy();
  });

  it('點事實卡「分點」→ 切到分點分頁（未入庫）', async () => {
    await renderPage();
    const factNav = screen.getByRole('navigation', { name: '個股事實導航' });
    fireEvent.click(within(factNav).getByText('分點'));
    await waitFor(() => {
      expect(screen.getByText('逐股券商分點買賣超為付費資料源，本站未接。')).toBeTruthy();
    });
  });

  it('點事實卡「價量」→ 切到「盤口」分頁（事實卡≠子分頁）', async () => {
    await renderPage();
    const factNav = screen.getByRole('navigation', { name: '個股事實導航' });
    fireEvent.click(within(factNav).getByText('價量'));
    const tabNav = screen.getByRole('navigation', { name: '個股研究區塊' });
    await waitFor(() => {
      expect(within(tabNav).getByText('盤口').closest('button')?.getAttribute('aria-current')).toBe('location');
    });
    expect(screen.getByText('五檔委買賣未入庫')).toBeTruthy();
  });

  it('誠實原則：無公開來源的欄位標示未入庫', async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('研究熱度為博主自建評分，本站尚無對應公開來源 · 盤後 2026-09-24');
    expect(text).toContain('個股新聞未入庫');
    expect(text).toContain('產業定位未入庫');
    expect(text).toContain('分點買賣超資料未入庫');
  });

  it('API 失敗時顯示錯誤提示', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(mockJsonResponse({ ok: false, reason: 'stock_research_unavailable' }))
    ) as unknown as typeof fetch;
    render(<StockPage />);
    expect(await screen.findByText('個股研究資料暫時無法取得，請稍後重試。')).toBeTruthy();
  });

  it('P1 風險分頁：風險體檢 5 格 + 處置制度歷史（不再只有 NotIndexed）', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股研究區塊' });
    fireEvent.click(within(nav).getByText('風險'));
    await waitFor(() => {
      expect(screen.getByText('風險體檢')).toBeTruthy();
    });
    for (const k of ['波動風險（日晃幅）', '流動性（日成交量）', '融資壓力', '大戶動向（週）', '支撐距離']) {
      expect(screen.getByText(k)).toBeTruthy();
    }
    // 大戶動向（週）本站無來源 → 誠實標示未入庫
    expect(screen.getByText('處置制度歷史資料')).toBeTruthy();
    expect(screen.getByText('近 20 日平均量')).toBeTruthy();
  });

  it('P1 技術分頁：技術分析解讀 + 均線水位 + 未入庫欄位（不再只有 NotIndexed）', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股研究區塊' });
    fireEvent.click(within(nav).getByText('技術'));
    await waitFor(() => {
      expect(screen.getByText('技術分析解讀')).toBeTruthy();
    });
    expect(screen.getByText('價格行為結構')).toBeTruthy();
    expect(screen.getByText('均線水位')).toBeTruthy();
    expect(screen.getByText('20 日（近月）')).toBeTruthy();
    // 博主自建模型欄位 → 誠實標示未入庫
    expect(screen.getByText('結構線')).toBeTruthy();
    expect(screen.getByText('趨勢明確度')).toBeTruthy();
  });

  it('P1 情境分頁：持有情境與風險 6 格 + 條列 + AI 按鈕（不再只有 NotIndexed）', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: '個股研究區塊' });
    fireEvent.click(within(nav).getByText('情境'));
    await waitFor(() => {
      expect(screen.getByText('持有情境與風險')).toBeTruthy();
    });
    expect(screen.getByText('外資')).toBeTruthy();
    expect(screen.getAllByText('連賣 2 日').length).toBeGreaterThan(0);
    expect(screen.getByText('近日低點')).toBeTruthy();
    expect(screen.getByText('用 AI 白話解讀（扣 1 次）')).toBeTruthy();
    expect(screen.getByText('同族群')).toBeTruthy();
  });
});
