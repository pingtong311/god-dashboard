/** @jest-environment jsdom */

/**
 * /today 今日戰情頁 —— 忠實度與誠實標示測試。
 * ----------------------------------------------------------------------------
 * - className／文案／aria 屬性逐字對齊 today.html（捕自 captured/login-capture）
 * - 區塊標題順序、次導覽有無（today.html 的 <main> 內無市場分類／相關功能切換）
 * - 有真實來源的區塊（今日一句／指數與家數／法人買超 Top3）以 mock fetch 驅動
 * - 無對接來源的區塊（近 10 日圖、處置名單）驗證骨架 + role="status" +
 *   「資料尚未入庫／尚未入庫」，並斷言不含 capture 截圖裡的造假名單與數字
 *
 * 註：本專案未掛 @testing-library/jest-dom，故一律用原生 matcher
 *   （toBeTruthy / toContain / getAttribute），與 market-page.test.tsx 慣例一致。
 */

import { render, screen, waitFor } from '@testing-library/react';
import TodayPage from '@/app/today/page';
import RiskBrief from '@/app/today/RiskBrief';
import TodayDataBadge, { TodayDataBadgeView } from '@/app/today/TodayDataBadge';
import TodayMarketBrief, {
  TodayMarketBriefView,
  type TodayMarketBriefData,
} from '@/app/today/TodayMarketBrief';
import InstitutionalTop3, {
  InstitutionalTop3View,
  computeInstitutionalData,
  type InstitutionalData,
} from '@/app/today/InstitutionalTop3';

/**
 * async server component 在 jsdom 無法直接 render，整支 stub；
 * client 子元件只 stub default（頁首組裝測試用），具名匯出（View／純函式）
 * 透過 requireActual 保留，行為測試直接 require 真實 default 元件。
 */
jest.mock('@/components/IndexMarquee', () => ({
  __esModule: true,
  default: () => <nav aria-label="指數行情" data-testid="index-marquee" />,
}));
jest.mock('@/components/FuturesOptionsPanel', () => ({
  __esModule: true,
  default: () => <section aria-label="大盤期權" data-testid="futures-options" />,
}));
jest.mock('@/app/today/TodayCaveat', () => ({
  __esModule: true,
  default: () => (
    <details data-testid="today-caveat">
      <summary>資料日期與口徑</summary>
    </details>
  ),
}));
jest.mock('@/app/today/TodayDataBadge', () => {
  const actual = jest.requireActual('@/app/today/TodayDataBadge');
  return {
    ...actual,
    __esModule: true,
    default: () => <span data-testid="today-data-badge" />,
  };
});
jest.mock('@/app/today/TodayMarketBrief', () => {
  const actual = jest.requireActual('@/app/today/TodayMarketBrief');
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="today-market-brief" />,
  };
});
jest.mock('@/app/today/InstitutionalTop3', () => {
  const actual = jest.requireActual('@/app/today/InstitutionalTop3');
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="institutional-top3" />,
  };
});

/** 真實 default 元件（行為測試用；client component，需 mock fetch）。 */
const RealTodayDataBadge = jest.requireActual('@/app/today/TodayDataBadge').default;
const RealTodayMarketBrief = jest.requireActual('@/app/today/TodayMarketBrief').default;
const RealInstitutionalTop3 = jest.requireActual('@/app/today/InstitutionalTop3').default;

/** jsdom 無全域 Response，以最小 mock 物件取代（market-page.test.tsx 同慣例）。 */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

const OVERVIEW_BODY = {
  ok: true,
  data: {
    date: '2026-09-24',
    indexClose: {
      symbol: 'tse_t00.tw',
      name: '加權指數',
      price: 48024.6,
      change: -131.5,
      changePercent: -0.27,
      source: 'twse-mi-index-close',
    },
    breadth: {
      up: 917,
      down: 1090,
      flat: 0,
      noTrade: 0,
      upLimit: 0,
      downLimit: 0,
      upRatio: 917 / 2007,
    },
    turnover: { total: 940000000000, categories: [] },
    topGainers: [],
    institutionalBuy: [],
    sectorFocus: [],
  },
};

const FUTURES_BODY = {
  ok: true,
  data: {
    name: '台股期近月',
    lastPrice: 48123,
    change: -212,
    changePercent: -0.44,
    sourceLabel: '收盤 09/24',
    source: 'taifex-openapi-close',
    date: '2026-09-24',
    contract: '2026-10',
  },
};

const T86_BODY = {
  tradeDate: '2026-09-24',
  items: [
    { symbol: '6182', name: '合晶', foreignNet: 12000, trustNet: 5000, dealerNet: 3586, totalNet: 20586 },
    { symbol: '1303', name: '南亞', foreignNet: 9000, trustNet: 4000, dealerNet: 1240, totalNet: 14240 },
    { symbol: '8150', name: '南茂', foreignNet: 8000, trustNet: 3000, dealerNet: 2885, totalNet: 13885 },
    { symbol: '2330', name: '台積電', foreignNet: -5000, trustNet: -2000, dealerNet: -1000, totalNet: -8000 },
    { symbol: '2454', name: '聯發科', foreignNet: 0, trustNet: 0, dealerNet: 0, totalNet: 0 },
  ],
  fetchedAt: '2026-09-24T13:00:00.000Z',
};

/** capture 逐字圖示（Phosphor，取自 today.html）。 */
const ICON_WARNING =
  'M240.26,186.1,152.81,34.23h0a28.74,28.74,0,0,0-49.62,0L15.74,186.1a27.45,27.45,0,0,0,0,27.71A28.31,28.31,0,0,0,40.55,228h174.9a28.31,28.31,0,0,0,24.79-14.19A27.45,27.45,0,0,0,240.26,186.1Zm-20.8,15.7a4.46,4.46,0,0,1-4,2.2H40.55a4.46,4.46,0,0,1-4-2.2,3.56,3.56,0,0,1,0-3.73L124,46.2a4.77,4.77,0,0,1,8,0l87.44,151.87A3.56,3.56,0,0,1,219.46,201.8ZM116,136V104a12,12,0,0,1,24,0v32a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,176Z';
const ICON_SEARCH =
  'M232.49,215.51,185,168a92.12,92.12,0,1,0-17,17l47.53,47.54a12,12,0,0,0,17-17ZM44,112a68,68,0,1,1,68,68A68.07,68.07,0,0,1,44,112Z';

const BRIEF_DATA: TodayMarketBriefData = {
  date: '2026-09-24',
  index: { price: 48024.6, changePercent: -0.27 },
  futures: { lastPrice: 48123, changePercent: -0.44 },
  breadth: { up: 917, down: 1090, upRatio: 917 / 2007 },
  turnover: { total: 940000000000 },
};

const INSTITUTIONAL_DATA: InstitutionalData = {
  date: '2026-09-24',
  foreignNet: -398907,
  trustNet: -3490,
  dealerNet: 6083,
  top: [
    { symbol: '6182', name: '合晶', netLots: 20586 },
    { symbol: '1303', name: '南亞', netLots: 14240 },
    { symbol: '8150', name: '南茂', netLots: 13885 },
  ],
};

// ── 頁首、工具列與區塊順序 ─────────────────────────────────────────────

describe('頁首與常用工具（逐字）', () => {
  it('h1「今日市場」與副標、調整首頁按鈕', () => {
    render(<TodayPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('今日市場');
    expect(screen.getByText('先看市場概況，再查你關心的股票。')).toBeTruthy();
    const button = screen.getByRole('button', { name: '調整首頁' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.className).toBe(
      'min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm font-bold text-muted hover:bg-surface-2',
    );
  });

  it('常用工具四格連結與圖示（href／文案／path 逐字）', () => {
    render(<TodayPage />);
    const nav = document.querySelector('nav[aria-label="常用工具"]');
    expect(nav?.className).toBe('mb-4 min-w-0');
    const links = Array.from(nav?.querySelectorAll('a') ?? []).map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
    }));
    expect(links).toEqual([
      { href: '/stock/', text: '查個股' },
      { href: '/reports/', text: '看日報' },
      { href: '/watchlist/', text: '自選股' },
      { href: '/dojo/', text: '練功房' },
      { href: '/hub/', text: '全部工具' },
    ]);
    expect(nav?.querySelector('a[href="/stock/"] path')?.getAttribute('d')).toBe(ICON_SEARCH);
  });

  it('區塊順序：頁首 → 跑馬燈 → 常用工具 → 今日一句 → 指數與家數 → 大盤期權 → 注意與處置 → 法人買超 Top3 → 三小卡 → 口徑', () => {
    const { container } = render(<TodayPage />);
    const marks = Array.from(container.querySelectorAll('h1, h2, nav, [data-testid]')).map(
      (el) => {
        const testid = el.getAttribute('data-testid');
        if (testid) return testid;
        if (el.tagName === 'NAV') return el.getAttribute('aria-label') ?? 'nav';
        return el.textContent?.trim() ?? '';
      },
    );
    const sequence = [
      '今日市場',
      'index-marquee',
      '常用工具',
      'today-market-brief',
      'futures-options',
      '注意與處置',
      'institutional-top3',
      '日報',
      '自選',
      '盤感',
      'today-caveat',
    ];
    const seen: string[] = [];
    for (const mark of marks) {
      const expected = sequence[seen.length];
      if (expected !== undefined && mark === expected) seen.push(mark);
    }
    expect(seen).toEqual(sequence);
  });

  it('不含任何次導覽（today.html 的 <main> 內無市場分類／相關功能切換／今天群組）', () => {
    render(<TodayPage />);
    expect(document.querySelector('nav[aria-label="市場分類"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="相關功能切換"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="今天"]')).toBeNull();
    // 只有指數行情（stub）與常用工具兩個 nav
    expect(document.querySelectorAll('nav')).toHaveLength(2);
  });
});

describe('日報／自選／盤感三小卡（文案與連結逐字）', () => {
  it('文案、連結與搜尋股票按鈕', () => {
    render(<TodayPage />);
    expect(screen.getByText('盤後一篇整理公開數字。約 22:01 後可讀。')).toBeTruthy();
    expect(screen.getByText('加第一檔。盤中看分點，收盤看集中度。')).toBeTruthy();
    expect(screen.getByText('匿名歷史 K 棒練習，不涉及個股買賣。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '打開' }).getAttribute('href')).toBe('/reports/');
    expect(screen.getByRole('link', { name: '名單' }).getAttribute('href')).toBe('/watchlist/');
    expect(screen.getByRole('link', { name: '去練習' }).getAttribute('href')).toBe('/guess/');
    const button = screen.getByRole('button', { name: '搜尋股票' });
    expect(button.className).toBe(
      'mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-3 text-[12.5px] font-black text-bg',
    );
  });

  it('頁尾文案與市場連結', () => {
    render(<TodayPage />);
    const footer = screen.getByText(/新聞與社群不放第一屏/);
    expect(footer.className).toBe('mt-6 text-[12.5px] leading-relaxed text-muted');
    const marketLink = screen.getByRole('link', { name: '市場' });
    expect(marketLink.getAttribute('href')).toBe('/market/');
    expect(marketLink.className).toBe('mx-1 font-bold text-accent');
  });
});

// ── 注意與處置（無資料源：誠實骨架） ───────────────────────────────────

describe('注意與處置', () => {
  it('標題列圖示與監理中心連結逐字', () => {
    render(<RiskBrief />);
    const heading = screen.getByRole('heading', { level: 2, name: /注意與處置/ });
    expect(heading.className).toBe('flex items-center gap-1.5 text-[14px] font-black text-ink');
    expect(heading.querySelector('path')?.getAttribute('d')).toBe(ICON_WARNING);
    expect(screen.getByRole('link', { name: /監理中心/ }).getAttribute('href')).toBe('/risk/');
  });

  it('無資料源：骨架 + role=status + 尚未入庫，不寫死截圖名單', () => {
    render(<RiskBrief />);
    const panel = document.querySelector('[role="status"]');
    expect(panel).not.toBeNull();
    expect(screen.getByText('尚未入庫')).toBeTruthy();
    expect(screen.getByText(/不預先寫死截圖數字/)).toBeTruthy();
    // 絕不渲染 capture 截圖裡的處置名單與數字
    expect(screen.queryByText(/台灣精材|巨有科技|金居/)).toBeNull();
    expect(screen.queryByText(/處置中 18 檔/)).toBeNull();
  });
});

// ── 今日一句 + 指數與家數（真資料：market-overview + futures） ─────────

describe('今日一句 + 指數與家數', () => {
  it('載入中呈現骨架（role=status），不預放數字', () => {
    // fetch 永不 resolve →維持 loading 狀態
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<RealTodayMarketBrief />);
    expect(screen.getByLabelText('今日一句資料載入中')).toBeTruthy();
    expect(screen.getByLabelText('指數與家數資料載入中')).toBeTruthy();
    expect(screen.queryByText(/上漲 \d+ 家/)).toBeNull();
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('今日一句由資料組出（文案規則逐字）', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      jsonResponse(url.includes('/futures') ? FUTURES_BODY : OVERVIEW_BODY),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RealTodayMarketBrief />);
    const sentence = await screen.findByText(/上漲 917 家/);
    expect(sentence.textContent).toBe(
      '2026-09-24 上漲 917 家、下跌 1,090 家，上漲佔有漲跌家數的 46%，成交 0.94 兆。以上是已發生的家數與金額，不是方向研判。',
    );
    expect(sentence.className).toBe('mt-2 text-[14px] font-bold leading-relaxed text-ink');
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('指數與家數四卡：紅漲綠跌 class、市場連結', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      jsonResponse(url.includes('/futures') ? FUTURES_BODY : OVERVIEW_BODY),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RealTodayMarketBrief />);
    await screen.findByText('917 / 1,090');

    const cards = Array.from(document.querySelectorAll('.grid.grid-cols-2 > div'));
    const values = cards.map((card) => card.querySelector('.num')?.textContent?.replace(/\s+/g, ' ').trim());
    // 加權（綠跌）／台指期（綠跌）／上漲下跌／成交金額
    expect(values[0]).toBe('48,024.6 -0.27%');
    expect(values[1]).toBe('48,123 -0.44%');
    expect(values[2]).toBe('917 / 1,090');
    expect(values[3]).toBe('0.94 兆');
    expect(cards[0]?.querySelector('.num')?.className).toContain('text-down');
    expect(cards[1]?.querySelector('.num')?.className).toContain('text-down');
    expect(cards[2]?.querySelector('.num')?.className).toContain('text-ink');
    expect(screen.getByRole('link', { name: /市場/ }).getAttribute('href')).toBe('/market/');
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('上漲家數長條 aria-label 不帶千分位（capture 逐字）', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(OVERVIEW_BODY));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<TodayMarketBriefView data={BRIEF_DATA} />);
    const bar = document.querySelector('[aria-label^="上漲 "]');
    expect(bar?.getAttribute('aria-label')).toBe('上漲 917 家、下跌 1090 家');
    expect(bar?.querySelector('i')?.getAttribute('style')).toBe('width: 45.6901%;');
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('近 10 日迷你圖無資料源：骨架 + 資料尚未入庫', () => {
    render(<TodayMarketBriefView data={BRIEF_DATA} />);
    const chart = document.querySelector('[aria-label="加權指數近 10 日資料尚未入庫"]');
    expect(chart).not.toBeNull();
    expect(chart?.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.getByText('近 10 日')).toBeTruthy();
  });

  it('上游失敗時誠實標示，不放推測數字', () => {
    render(<TodayMarketBriefView data={null} />);
    expect(screen.getByText(/上游行情管線無回應/)).toBeTruthy();
    expect(screen.getByText('指數與家數')).toBeTruthy();
  });
});

// ── 法人買超 Top3（真資料：t86） ───────────────────────────────────────

describe('法人買超 Top3', () => {
  it('computeInstitutionalData：加總三大法人、取買超前 3（只取正數）', () => {
    const data = computeInstitutionalData('2026-09-24', T86_BODY.items);
    expect(data.foreignNet).toBe(24000);
    expect(data.trustNet).toBe(10000);
    expect(data.dealerNet).toBe(6711);
    expect(data.top).toEqual([
      { symbol: '6182', name: '合晶', netLots: 20586 },
      { symbol: '1303', name: '南亞', netLots: 14240 },
      { symbol: '8150', name: '南茂', netLots: 13885 },
    ]);
  });

  it('載入中呈現骨架（role=status + sr-only）', () => {
    // fetch 永不 resolve →維持 loading 狀態
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<RealInstitutionalTop3 />);
    expect(screen.getByText('正在整理法人買超 Top3…')).toBeTruthy();
    expect(screen.getByLabelText('法人買超資料載入中')).toBeTruthy();
    expect(screen.queryByText(/法人約 21:00 入庫/)).toBeNull();
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('三大法人量條與 Top3 名單（紅漲綠跌、badge 逐字）', () => {
    render(<InstitutionalTop3View data={INSTITUTIONAL_DATA} />);
    expect(screen.getByText('2026-09-24 · 法人約 21:00 入庫')).toBeTruthy();
    expect(screen.getByRole('link', { name: /法人榜/ }).getAttribute('href')).toBe(
      '/ranking/?board=foreign_buy',
    );

    // 外資賣超（綠）／自營商買超（紅）
    const foreign = screen.getByText('-398,907 張');
    expect(foreign.className).toContain('text-down');
    const dealer = screen.getByText('+6,083 張');
    expect(dealer.className).toContain('text-up');
    const trust = screen.getByText('-3,490 張');
    expect(trust.className).toContain('text-down');

    // 名單連結與張數（capture 逐字：正數不帶 '+')
    const topLink = screen.getByRole('link', { name: /合晶/ });
    expect(topLink.getAttribute('href')).toBe('/stock/?id=6182');
    expect(screen.getByText('20,586 張').className).toContain('text-up');
    expect(screen.getByText('6182').textContent).toBe('6182');
  });

  it('上游失敗時標尚未入庫，不寫死截圖名單', () => {
    render(<InstitutionalTop3View data={null} />);
    expect(screen.getByText('尚未入庫')).toBeTruthy();
    expect(screen.getByText(/上游 T86 無回應/)).toBeTruthy();
    expect(screen.queryByText(/合晶|南亞|南茂/)).toBeNull();
  });

  it('由 /api/skynet/t86 載入並算出', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(T86_BODY));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RealInstitutionalTop3 />);
    await screen.findByText('2026-09-24 · 法人約 21:00 入庫');
    expect(fetchMock).toHaveBeenCalledWith('/api/skynet/t86');
    expect(screen.getByText('20,586 張')).toBeTruthy();
    delete (globalThis as Record<string, unknown>).fetch;
  });
});

// ── 頁首資料日膠囊 ─────────────────────────────────────────────────────

describe('頁首資料日膠囊', () => {
  it('逐字呈現資料日與下次更新文案', () => {
    render(<TodayDataBadgeView date="2026-09-24" />);
    const pill = document.querySelector('span.inline-flex.flex-wrap');
    expect(pill?.className).toBe(
      'inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-line/80 bg-surface-2/75 px-2.5 py-1 text-[12px] font-bold text-muted',
    );
    expect(pill?.textContent).toBe('盤後資料日 2026-09-24下次更新 下一交易日約 21:30');
  });

  it('無資料時誠實標示尚未取得', () => {
    render(<TodayDataBadgeView date={null} />);
    expect(document.querySelector('span.inline-flex.flex-wrap')?.textContent).toContain(
      '資料日 尚未取得',
    );
  });

  it('載入中呈現骨架，mount 後帶入真實日期', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(OVERVIEW_BODY));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RealTodayDataBadge />);
    expect(screen.getByText('資料日載入中…')).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('span.inline-flex.flex-wrap')?.textContent).toContain(
        '資料日 2026-09-24',
      );
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skynet/market-overview', { cache: 'no-store' });
    delete (globalThis as Record<string, unknown>).fetch;
  });
});
