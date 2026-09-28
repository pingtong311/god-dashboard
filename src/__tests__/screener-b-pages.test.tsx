/** @jest-environment jsdom */

/**
 * 「股市大佬 TradeBoss」screener-b 八頁對齊實站 captured/login-capture/html/<name>.html 的測試。
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/{signal-2330,valuation-2330,margin-maint,
 * leverage,risk,etf-active,cb,ranking}.html 的 <main id="main-content">。
 *
 * 覆蓋：
 *   1. 每頁 h1 標題、metadata title 逐字對齊 capture。
 *   2. 有資料源的頁（/signal）才 client fetch；其餘無資料源的頁與區塊一律
 *      `role="status"` 載入骨架 + 「資料尚未入庫」，不造假資料。
 *   3. /etf-active、/ranking 的市場分類次導覽當前頁（ETF／排行）。
 *   4. /ranking 台灣燈火圖：輪廓 path 畫對、無任何光點（無分點資料），
 *      12 個戰情榜 id 與注意股空狀態文案。
 *   5. /valuation 五欄輸入即時運算（參考價＝EPS×本益）。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import SignalPage from '@/app/signal/page';
import ValuationPage from '@/app/valuation/page';
import EtfActivePage from '@/app/etf-active/page';
import MarginMaintPage from '@/app/margin-maint/page';
import CbPage from '@/app/cb/page';
import LeveragePage from '@/app/leverage/page';
import RiskPage from '@/app/risk/page';
import RankingPage from '@/app/ranking/page';

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
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams('id=2330')),
}));

// /signal 的 client fetch 在測試環境攔下，避免打到 API（頁面本身有錯誤處理）。
const fetchMock = jest.fn().mockResolvedValue({
  ok: false,
  status: 503,
  json: async () => ({ error: 'api_key_not_configured' }),
});
(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

const mockUsePathname = usePathname as unknown as jest.Mock;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderAt(element: ReactElement, pathname: string): HTMLDivElement {
  mockUsePathname.mockReturnValue(pathname);
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
}

describe('screener-b 八頁', () => {
  describe('/signal 技術分析', () => {
    it('h1 與 metadata 對齊 capture；個股維度預設 2330', async () => {
      const c = renderAt(<SignalPage />, '/signal/');
      // 等 useEffect 的 client fetch 收斂（mock 一律回 503，頁面走錯誤分支）
      await act(async () => {});
      expect(c.querySelector('h1')?.textContent).toBe('技術分析');
      const mod = await import('@/app/signal/page');
      expect(mod.metadata.title).toBe('技術分析｜股市大佬 TradeBoss');
      // 查詢表單預設值 2330
      const input = c.querySelector('input[value="2330"]');
      expect(input).not.toBeNull();
    });

    it('自選股掃描與日 K 以誠實骨架呈現，不造假資料', async () => {
      const c = renderAt(<SignalPage />, '/signal/');
      await act(async () => {});
      const status = c.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(c.textContent).toContain('正在整理');
      // 查詢按鈕會把 ?id= 帶到路由，不直接寫死結果
      expect(c.querySelector('a[href*="/stock/"]')).not.toBeNull();
      // 沒有造假的指標數字表格
      expect(c.querySelector('table')).toBeNull();
    });
  });

  describe('/valuation 估值河流', () => {
    it('h1 與五欄輸入對齊 capture', async () => {
      const c = renderAt(<ValuationPage />, '/valuation/');
      expect(c.querySelector('h1')?.textContent).toBe('估值河流');
      const labels = Array.from(c.querySelectorAll('input')).map((i) => i.getAttribute('aria-label'));
      expect(labels).toEqual(['預估 EPS（元）', '低本益', '中本益', '高本益', '現價（可空）']);
      const mod = await import('@/app/valuation/page');
      expect(mod.metadata.title).toBe('估值河流｜股市大佬 TradeBoss');
    });

    it('預設值即時算出研究用區間 240/320/440，不造假', () => {
      const c = renderAt(<ValuationPage />, '/valuation/');
      const bands = Array.from(c.querySelectorAll('.text-xl.font-black')).map((el) => el.textContent);
      expect(bands).toEqual(['240', '320', '440']);
    });
  });

  describe('/etf-active 主動式ETF', () => {
    it('市場分類當前頁是 ETF；h1 與 metadata 對齊 capture', async () => {
      const c = renderAt(<EtfActivePage />, '/etf-active/');
      const active = c.querySelector('nav[aria-label="市場分類"] a[aria-current="page"]');
      expect(active?.textContent).toBe('ETF');
      expect(c.querySelector('h1')?.textContent).toBe('主動式ETF');
      const mod = await import('@/app/etf-active/page');
      expect(mod.metadata.title).toBe('主動式ETF｜股市大佬 TradeBoss');
    });

    it('清單改抓真實 API（不再寫死 40 檔）；上游失敗時誠實呈現', async () => {
      const c = renderAt(<EtfActivePage />, '/etf-active/');
      // 全域 fetch mock 一律回 503 → 走錯誤分支
      await act(async () => {});
      // 誠實訊息，不造假清單
      expect(c.textContent).toContain('暫時無法取得');
      // 不再寫死 40 檔
      expect(c.textContent).not.toContain('ETF 40 檔');
      expect(c.querySelectorAll('button[aria-expanded]')).toHaveLength(0);
    });

    it('展開任一檔呈現誠實骨架，不造假持股數字', async () => {
      // 先讓清單載入成功（改寫 fetch mock 回真實形狀）
      const okFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          date: '2026-09-24',
          data_scope: '盤後',
          next_update: '下一交易日 23:08',
          note: '',
          items: [
            { etf_id: '00400A', name: '主動國泰動能高息', closing_price: 15.66, monthly_avg_price: 15.05, holdings: [], changes: [] },
          ],
        }),
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = okFetch as unknown as typeof fetch;
      try {
        const c = renderAt(<EtfActivePage />, '/etf-active/');
        await act(async () => {});
        const btn = c.querySelector('button[aria-expanded]') as HTMLButtonElement;
        expect(btn).not.toBeNull();
        act(() => {
          btn.click();
        });
        const panel = c.querySelector('[role="status"]');
        expect(panel).not.toBeNull();
        expect(c.textContent).toContain('資料尚未入庫');
      } finally {
        (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
      }
    });
  });

  describe('/margin-maint 融資維持率', () => {
    it('h1 為 page-heading 樣式；統計與名單為誠實骨架', async () => {
      const c = renderAt(<MarginMaintPage />, '/margin-maint/');
      expect(c.querySelector('h1')?.textContent).toBe('融資維持率');
      expect(c.querySelector('header.page-heading')).not.toBeNull();
      const statuses = c.querySelectorAll('[role="status"]');
      expect(statuses.length).toBeGreaterThan(0);
      expect(c.textContent).toContain('正在整理全市場平均維持率');
      expect(c.textContent).toContain('資料尚未入庫');
      // 沒有寫死 capture 截圖的數字
      expect(c.textContent).not.toContain('193.88');
      const mod = await import('@/app/margin-maint/page');
      expect(mod.metadata.title).toBe('融資維持率｜股市大佬 TradeBoss');
    });
  });

  describe('/cb 可轉債', () => {
    it('h1 與三個外部官方連結對齊 capture', async () => {
      const c = renderAt(<CbPage />, '/cb/');
      expect(c.querySelector('h1')?.textContent).toBe('可轉債');
      const externals = Array.from(c.querySelectorAll('a[target="_blank"]')).map((a) =>
        a.getAttribute('href'),
      );
      expect(externals).toContain('https://www.twse.com.tw/zh/announcement/auction.html');
      expect(externals).toContain('https://www.tpex.org.tw/zh-tw/bond/info/market/ebts-cb/trade.html');
      expect(externals).toContain('https://mops.twse.com.tw/');
      const mod = await import('@/app/cb/page');
      expect(mod.metadata.title).toBe('可轉債｜股市大佬 TradeBoss');
    });

    it('行情與時程為誠實骨架，不造假', () => {
      const c = renderAt(<CbPage />, '/cb/');
      expect(c.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
      expect(c.textContent).toContain('資料尚未入庫');
    });
  });

  describe('/leverage 資券借券', () => {
    it('h1 與五個分類 pill 對齊 capture', async () => {
      const c = renderAt(<LeveragePage />, '/leverage/');
      expect(c.querySelector('h1')?.textContent).toBe('資券借券');
      const pills = Array.from(c.querySelectorAll('nav button')).map((b) => b.textContent);
      expect(pills).toEqual(['借券餘額', '八大行庫', '大漲券增', '下跌資增', '券資比偏高']);
      const mod = await import('@/app/leverage/page');
      expect(mod.metadata.title).toBe('資券借券｜股市大佬 TradeBoss');
    });

    it('四個區塊皆為誠實骨架，不造假個股數字', () => {
      const c = renderAt(<LeveragePage />, '/leverage/');
      expect(c.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
      expect(c.textContent).toContain('資料尚未入庫');
    });
  });

  describe('/risk 注意與處置', () => {
    it('h1、次導覽與注意股空狀態文案對齊 capture', async () => {
      const c = renderAt(<RiskPage />, '/risk/');
      expect(c.querySelector('h1')?.textContent).toBe('注意與處置');
      expect(c.querySelector('nav[aria-label="市場分類"]')).not.toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).not.toBeNull();
      expect(c.textContent).toContain('注意股名單本站暫不列示，請以交易所最新公告為準。');
      const mod = await import('@/app/risk/page');
      expect(mod.metadata.title).toBe('注意與處置｜股市大佬 TradeBoss');
    });
  });

  describe('/ranking 分點排行', () => {
    it('市場分類當前頁是排行；h1 與副標文案對齊 capture', async () => {
      const c = renderAt(<RankingPage />, '/ranking/');
      const active = c.querySelector('nav[aria-label="市場分類"] a[aria-current="page"]');
      expect(active?.textContent).toBe('排行');
      expect(c.querySelector('h1')?.textContent).toBe('分點排行');
      expect(c.textContent).toContain('的淨買賣超。點一列看它這段期間買賣了哪些股票。');
      const mod = await import('@/app/ranking/page');
      expect(mod.metadata.title).toBe('分點排行｜股市大佬 TradeBoss');
    });

    it('買超/賣超 tab 與燈火圖切換可切換 aria-pressed', () => {
      const c = renderAt(<RankingPage />, '/ranking/');
      const toggleBtns = Array.from(c.querySelectorAll('.twmap__toggle-btn'));
      expect(toggleBtns.map((b) => b.textContent)).toEqual(['買超', '賣超']);
      expect(toggleBtns[0].getAttribute('aria-pressed')).toBe('true');
      expect(toggleBtns[1].getAttribute('aria-pressed')).toBe('false');
      act(() => {
        (toggleBtns[1] as HTMLButtonElement).click();
      });
      expect(c.querySelectorAll('.twmap__toggle-btn')[0].getAttribute('aria-pressed')).toBe('false');
      expect(c.querySelectorAll('.twmap__toggle-btn')[1].getAttribute('aria-pressed')).toBe('true');
    });

    it('台灣燈火圖輪廓畫對、無光點；分點列表誠實骨架', () => {
      const c = renderAt(<RankingPage />, '/ranking/');
      const svg = c.querySelector('.twmap__svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 725 1000');
      // 輪廓四層 path（haze/coast/land/border）
      expect(svg?.querySelectorAll('path').length).toBe(4);
      // 無分點資料 → 不畫任何光點
      expect(svg?.querySelectorAll('.twmap__spark, .twmap__core').length).toBe(0);
      expect(c.querySelector('.twmap__pending')).not.toBeNull();
      // 列表骨架
      const status = c.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(c.textContent).toContain('正在整理分點買超排行');
      expect(c.textContent).toContain('資料尚未入庫');
      // 不寫死 capture 截圖裡的分點名次與張數
      expect(c.textContent).not.toContain('10,555 張');
      expect(c.textContent).not.toContain('約 384.3 億');
    });

    it('12 個戰情榜 id 與注意股空狀態文案對齊 capture', () => {
      const c = renderAt(<RankingPage />, '/ranking/');
      const boardIds = Array.from(c.querySelectorAll('[id^="board-"]')).map((el) => el.id);
      expect(boardIds).toEqual([
        'board-change_up',
        'board-change_down',
        'board-turnover',
        'board-daytrade',
        'board-foreign_buy',
        'board-foreign_sell',
        'board-trust_buy',
        'board-broker_conc',
        'board-margin_increase',
        'board-disposition',
        'board-attention',
        'board-shareholding_week',
      ]);
      expect(c.textContent).toContain('注意股名單本站暫不列示，請以交易所最新公告為準。');
      // 看完整連結對齊 capture（處置榜連到 /risk/）
      expect(c.querySelector('a[href="/ranking/?board=change_up"]')).not.toBeNull();
      expect(c.querySelector('a[href="/risk/"]')).not.toBeNull();
    });

    it('資料日期與口徑 5 條逐字對齊 capture', () => {
      const c = renderAt(<RankingPage />, '/ranking/');
      const summary = Array.from(c.querySelectorAll('summary')).find(
        (s) => s.textContent === '資料日期與口徑',
      );
      expect(summary).not.toBeUndefined();
      expect(c.textContent).toContain('戰情榜為盤後排序位置；分點約 21:00 入庫。注意股以交易所為準。');
    });
  });
});
