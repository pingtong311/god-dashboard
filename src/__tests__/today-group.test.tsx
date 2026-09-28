/** @jest-environment jsdom */

/**
 * 「今天」群組 5 頁測試（/live/ /reports/ /sector/ /trump/ /futures-opt/）
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/{live,reports,sector,trump,futures-opt}.html。
 *
 * 覆蓋：
 *   1. TodayGroupNav 六 pill（今日/盤中/日報/族群/事件/大盤）順序、href、aria-current。
 *   2. /live/：盤中模式與工作區工具切換；代號查詢打 /api/skynet/twse 後如實顯示現價，
 *      查無代號與上游錯誤走誠實空狀態（不造假數字）。
 *   3. /reports/：標題與四象限文案；日報列表打 /api/skynet/daily-reports；
 *      無資料時誠實呈現空狀態。
 *   4. /sector/：族群強弱排行依漲跌幅排序、最強最弱摘要由資料計算、
 *      卡片底色分檔、可展開成分股、龍頭連到個股頁；上游失敗可重試。
 *   5. /trump/：英雄區與章節文案；無資料來源區以 role="status" 骨架呈現。
 *   6. /futures-opt/：資料日取自最新交易日；四個資料區皆為骨架，不造假數字。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import TodayGroupNav from '@/components/TodayGroupNav';
import LiveWorkspace from '@/app/live/LiveWorkspace';
import ReportsList from '@/app/reports/ReportsList';
import SectorHeatmap from '@/app/sector/SectorHeatmap';
import ShareButton from '@/app/trump/ShareButton';
import TrumpPage from '@/app/trump/page';
import FuturesOptPage from '@/app/futures-opt/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory 需同步 require
    (require('react') as typeof import('react')).createElement(
      'a',
      { href: typeof href === 'string' ? href : String(href), ...rest },
      children,
    ),
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: jest.fn(),
}));

jest.mock('@/lib/marketOverview', () => ({
  ...jest.requireActual('@/lib/marketOverview'),
  resolveLatestTradingDate: jest.fn(),
}));

const mockUsePathname = usePathname as unknown as jest.Mock;
const mockResolveLatestTradingDate = jest.requireMock('@/lib/marketOverview')
  .resolveLatestTradingDate as jest.Mock;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 已掛的 root，afterEach 統一 unmount（清掉 auto-refresh 計時器等副作用）。 */
const roots: Root[] = [];

function renderAt(element: ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(element);
  });
  return container;
}

/** 同步 render 後再 flush 多次 microtask，讓 useEffect 觸發的 fetch 結算。 */
async function renderAtAsync(element: ReactElement): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(element);
  });
  for (let tick = 0; tick < 10; tick += 1) {
    // eslint-disable-next-line no-await-in-loop -- 逐 tick 讓 fetch promise 鏈推進
    await act(async () => {
      await Promise.resolve();
    });
  }
  return container;
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount();
    });
  }
  roots.length = 0;
});

/** 掛一個全域 fetch mock（比對 URL 子字串後回放預設回應）。 */
function mockFetch(routes: Array<[string, { body: unknown; status?: number }]>): jest.Mock {
  const fn = jest.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url);
    for (const [needle, { body, status }] of routes) {
      if (url.includes(needle)) {
        return {
          ok: (status ?? 200) < 400,
          status: status ?? 200,
          json: async () => body,
        } as unknown as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('TodayGroupNav（相關功能切換）', () => {
  const PILLS: readonly [string, string][] = [
    ['今日', '/today/'],
    ['盤中', '/live/'],
    ['日報', '/reports/'],
    ['族群', '/sector/'],
    ['事件', '/radar/'],
    ['大盤', '/market/'],
  ];

  it('6 pill 的名稱/href/順序對齊實站', () => {
    mockUsePathname.mockReturnValue('/live/');
    const container = renderAt(<TodayGroupNav />);
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    ).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual(PILLS);
  });

  it('結尾保留實站的 w-4 留白 span', () => {
    mockUsePathname.mockReturnValue('/live/');
    const container = renderAt(<TodayGroupNav />);
    const last = container.querySelector('nav[aria-label="相關功能切換"] > div > span:last-child');
    expect(last?.getAttribute('aria-hidden')).toBe('true');
    expect(last?.className).toContain('w-4');
  });

  it.each([
    ['/live/', '盤中'],
    ['/reports/', '日報'],
    ['/sector/', '族群'],
  ])('當前頁 %s 為 aria-current="page" + bg-accent text-bg', (pathname, label) => {
    mockUsePathname.mockReturnValue(pathname);
    const container = renderAt(<TodayGroupNav />);
    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toBe(label);
    expect(active?.className).toContain('bg-accent');
    expect(active?.className).toContain('text-bg');
  });

  it('非當前頁無 aria-current，樣式為未選取態', () => {
    mockUsePathname.mockReturnValue('/live/');
    const container = renderAt(<TodayGroupNav />);
    const inactive = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    ).find((a) => a.textContent === '日報');
    expect(inactive?.hasAttribute('aria-current')).toBe(false);
    expect(inactive?.className).toContain('border-line');
    expect(inactive?.className).toContain('text-muted');
  });
});

describe('/live/ 盤中戰情', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/live/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('標題、操作說明與非盤中提示文案對齊實站', () => {
    const container = renderAt(<LiveWorkspace />);
    expect(container.querySelector('h1')?.textContent).toBe('盤中工作區');
    expect(container.textContent).toContain('第一次用？30 秒看懂操作');
    expect(container.textContent).toContain('非盤中時段｜保留最後資料供查看');
    expect(container.querySelector('input[aria-label="工作區股票代號"]')).not.toBeNull();
  });

  it('盤中模式切換：全市場戰情按下後 aria-pressed 反轉', () => {
    const container = renderAt(<LiveWorkspace />);
    const buttons = Array.from(
      container.querySelectorAll('nav[aria-label="盤中模式"] button'),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('h1')?.textContent).toBe('全市場戰情');
    expect(container.textContent).toContain('大盤');
  });

  it('工作區工具切換：逐筆成交按下後呈現誠實載入骨架', () => {
    const container = renderAt(<LiveWorkspace />);
    const buttons = Array.from(
      container.querySelectorAll('nav[aria-label="工作區工具"] button'),
    );
    expect(buttons.map((b) => b.textContent)).toEqual(['盤口／五檔', '逐筆成交', '通知設定']);
    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    const status = Array.from(container.querySelectorAll('[role="status"]')).find((s) =>
      s.textContent?.includes('正在整理'),
    );
    expect(status).toBeDefined();
    expect(container.textContent).toContain('逐筆成交資料目前無對接來源');
  });

  it('查詢 2330 打 /api/skynet/twse，顯示真實現價與漲跌（紅漲）', async () => {
    const fetchMock = mockFetch([
      [
        '/api/skynet/twse',
        {
          body: {
            items: [
              {
                symbol: '2330',
                name: '台積電',
                price: 2460,
                change: 35,
                changePercent: 1.44,
                open: 2430,
                high: 2465,
                low: 2425,
                prevClose: 2425,
                volume: 40893,
                timestamp: '13:29:00',
                tradeDate: '2026-09-24',
                source: 'twse-mis-live',
              },
            ],
            fetchedAt: '2026-09-24T05:29:00.000Z',
          },
        },
      ],
    ]);
    const container = await renderAtAsync(<LiveWorkspace />);

    const input = container.querySelector('input[aria-label="工作區股票代號"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '2330');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/skynet/twse'),
      expect.anything(),
    );

    expect(container.textContent).toContain('台積電');
    expect(container.textContent).toContain('2,460');
    expect(container.textContent).toContain('+1.44%');
    const upNode = Array.from(container.querySelectorAll('span.num')).find((s) =>
      s.textContent?.includes('2,460'),
    );
    expect(upNode?.className).toContain('text-up');
  });

  it('查無代號時誠實呈現空狀態，不造數字', async () => {
    mockFetch([['/api/skynet/twse', { body: { items: [] } }]]);
    const container = await renderAtAsync(<LiveWorkspace />);
    const input = container.querySelector('input[aria-label="工作區股票代號"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '9999');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('查不到這個代號的公開報價');
  });
});

describe('/reports/ 台股日報', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/reports/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('標題、四象限說明與「前往盤中工作區」連結對齊實站', () => {
    const container = renderAt(<ReportsList />);
    expect(container.querySelector('h1')?.textContent).toBe('台股日報');
    expect(container.textContent).toContain('不是明天的漲跌預測');
    // TodayGroupNav 也有 /live/ 連結，取頁內那個（導覽 pill 只是「盤中」）
    const link = Array.from(container.querySelectorAll('a[href="/live/"]')).find(
      (a) => (a.textContent ?? '').includes('盤中看資料'),
    );
    expect(link?.textContent).toContain('盤中看資料？前往盤中工作區');
  });

  it('載入中先呈現骨架（role="status" + 正在整理…）', () => {
    // fetch 永不定案 → 維持 loading，骨架穩定可斷言
    globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const container = renderAt(<ReportsList />);
    const skeletons = container.querySelectorAll('[role="status"]');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(container.textContent).toContain('正在整理…');
  });

  it('日報資料筆數如實呈現：最新一篇＋較早的日報（N 篇）', async () => {
    mockFetch([
      [
        '/api/skynet/daily-reports',
        {
          body: {
            reports: [
              {
                date: '2026-09-24',
                time: '23:08',
                name: '台股日報',
                channel: 'WEB',
                summary: '四象限摘要',
                message: '量價整理：成交值放大。',
              },
              {
                date: '2026-09-23',
                time: '23:10',
                name: '台股日報',
                channel: 'WEB',
                summary: '',
                message: '昨日整理。',
              },
            ],
          },
        },
      ],
    ]);
    const container = await renderAtAsync(<ReportsList />);
    expect(container.textContent).toContain('最新一篇');
    expect(container.textContent).toContain('較早的日報（1 篇）');
    // 來源頻道如實標出，不造瀏覽／留言數
    expect(container.textContent).toContain('來源 WEB');
    expect(container.textContent).not.toContain('次瀏覽');
  });

  it('沒有日報時誠實呈現空狀態', async () => {
    mockFetch([['/api/skynet/daily-reports', { body: { reports: [] } }]]);
    const container = await renderAtAsync(<ReportsList />);
    expect(container.textContent).toContain('目前沒有可顯示的日報');
  });

  it('上游不可用時誠實呈現錯誤訊息', async () => {
    mockFetch([['/api/skynet/daily-reports', { body: { error: 'sheet_fetch_failed' }, status: 502 }]]);
    const container = await renderAtAsync(<ReportsList />);
    expect(container.textContent).toContain('日報資料暫時讀不到');
  });
});

describe('/sector/ 族群熱圖', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/sector/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const TREEMAP = {
    ok: true,
    date: '20260924',
    sectors: [
      {
        sector: '最強族群',
        totalVolume: 1217,
        count: 5,
        changePercent: 2.25,
        items: [
          { symbol: '1809', name: '中釉', changePercent: 9.94, volume: 600 },
          { symbol: '0002', name: '乙', changePercent: -1, volume: 200 },
        ],
      },
      {
        sector: '居中族群',
        totalVolume: 300,
        count: 3,
        changePercent: 0.5,
        items: [{ symbol: '0003', name: '丙', changePercent: 0.5, volume: 300 }],
      },
      {
        sector: '最弱族群',
        totalVolume: 314,
        count: 4,
        changePercent: -1.3,
        items: [{ symbol: '0004', name: '丁', changePercent: -0.75, volume: 314 }],
      },
    ],
  };

  it('標題與「第一次用這頁？」四問答對齊實站', () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = renderAt(<SectorHeatmap />);
    expect(container.querySelector('h1')?.textContent).toBe('族群熱圖');
    expect(container.textContent).toContain('第一次用這頁？點開 30 秒說明');
    expect(container.textContent).toContain('什麼時候別用它');
    expect(container.textContent).toContain('盤後｜資料時間 整理中');
  });

  it('排行依平均漲跌幅由大到小，摘要由資料計算最強／最弱', async () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    const cards = Array.from(container.querySelectorAll('[role="button"]'));
    expect(cards.map((c) => c.querySelector('.font-black')?.textContent)).toEqual([
      '最強族群',
      '居中族群',
      '最弱族群',
    ]);
    expect(container.textContent).toContain('今天最強族群是');
    expect(container.textContent).toContain('最強族群');
    expect(container.textContent).toContain('龍頭 1809 中釉');
    expect(container.textContent).toContain('最弱族群');
    expect(container.textContent).toContain('盤後｜資料時間 2026-09-24');
  });

  it('卡片底色分檔：>=1 為 bg-up/50 text-white，<0.25 為 bg-down/25', async () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    const cards = Array.from(container.querySelectorAll('[role="button"]'));
    expect(cards[0]?.className).toContain('bg-up/50');
    expect(cards[0]?.className).toContain('text-white');
    expect(cards[1]?.className).toContain('bg-up/25');
    expect(cards[2]?.className).toContain('bg-down/25');
  });

  it('成交量如實標示（實站法人欄位無來源，改標成交張數）', async () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    expect(container.textContent).toContain('成交 1,217 張');
    expect(container.textContent).not.toContain('法人 +');
  });

  it('點族群展開成分股，龍頭連到個股頁', async () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    const firstCard = container.querySelector('[role="button"]') as HTMLElement;
    expect(firstCard.textContent).toContain('展開清單 ▼');
    await act(async () => {
      firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(firstCard.textContent).toContain('收合清單 ▲');
    const leader = container.querySelector('a[href="/stock/?id=1809"]');
    expect(leader?.textContent).toContain('龍頭 1809 中釉');
  });

  it('上游失敗時可重試，不造假資料', async () => {
    mockFetch([['/api/skynet/treemap', { body: { error: 'upstream_error' }, status: 502 }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    expect(container.textContent).toContain('族群資料暫時讀不到');
    const retry = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('重試'),
    );
    expect(retry).toBeDefined();
    // 第二次回 200 仍維持同一路徑
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('今天最強族群是');
  });

  it('龍頭比較／成交熱度無資料來源，呈現載入骨架', async () => {
    mockFetch([['/api/skynet/treemap', { body: TREEMAP }]]);
    const container = await renderAtAsync(<SectorHeatmap />);
    const tabs = Array.from(
      container.querySelectorAll('nav[aria-label="族群分頁"] button'),
    );
    await act(async () => {
      tabs[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('h2')?.textContent).toBe('龍頭比較');
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('龍頭比較的資料來源尚未接入');
  });
});

describe('/trump/ 美國政策題材', () => {
  it('英雄區文案與四個章節對齊實站（此頁無 pill 導覽）', () => {
    const container = renderAt(<TrumpPage />);
    expect(container.querySelector('nav[aria-label="相關功能切換"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('美國政策題材');
    expect(container.textContent).toContain('美國原文 · 政策風向研究');
    expect(container.textContent).toContain('為什麼要盯這個人？');
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(['美國原文報導', '政策主題聲量', '台媒轉述（輔助）']);
  });

  it('無資料來源區以 role="status" 骨架呈現，不造假標題或分數', () => {
    const container = renderAt(<TrumpPage />);
    const statuses = container.querySelectorAll('[role="status"]');
    expect(statuses.length).toBeGreaterThan(0);
    expect(container.textContent).toContain('正在整理…');
    expect(container.textContent).toContain('不提供標題正負面情緒分類');
    expect(container.textContent).not.toContain('正負面敘事接近');
  });

  it('頁尾免責文案對齊實站', () => {
    const container = renderAt(<TrumpPage />);
    expect(container.textContent).toContain('以美國原文報導為主的政策敘事整理，不代表股價方向');
  });

  it('分享鈕 aria-label 與圖示 path 逐字對齊', () => {
    const container = renderAt(<ShareButton />);
    const button = container.querySelector('button[aria-label="分享這一頁"]');
    expect(button).not.toBeNull();
    const path = button?.querySelector('path');
    expect(path?.getAttribute('d')).toContain('M176,156a43.78');
  });
});

describe('/futures-opt/ 期選盤後', () => {
  it('資料日取自最新交易日（20260924 → 2026-09-24）', async () => {
    mockResolveLatestTradingDate.mockResolvedValue('20260924');
    const element = await FuturesOptPage();
    const container = renderAt(element as ReactElement);
    expect(container.querySelector('h1')?.textContent).toBe('期選盤後');
    expect(container.textContent).toContain('資料日 2026-09-24');
    expect(container.textContent).toContain('下次更新 下一交易日 23:08');
  });

  it('取不到交易日時標示整理中，不回填假日期', async () => {
    mockResolveLatestTradingDate.mockResolvedValue(null);
    const element = await FuturesOptPage();
    const container = renderAt(element as ReactElement);
    expect(container.textContent).toContain('資料日 整理中');
  });

  it('四個資料區皆為骨架，不造 VIX 或法人數字', async () => {
    mockResolveLatestTradingDate.mockResolvedValue('20260924');
    const element = await FuturesOptPage();
    const container = renderAt(element as ReactElement);
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(['夜盤法人（期貨）', '夜盤法人（選擇權）', '選擇權大額未平倉']);
    expect(container.textContent).toContain('臺指 VIX');
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('VIX 資料來源（TAIFEX 期選盤後）尚未接入');
    expect(container.textContent).not.toContain('21.81');
    expect(container.textContent).not.toContain('淨 -11,768');
  });
});
