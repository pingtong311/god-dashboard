/** @jest-environment jsdom */

/**
 * 「選股」與「股票」群組 9 頁對齊實站 captured/login-capture/html/<name>.html 的測試。
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/{picks,fade,patterns,swing,tools,
 * dividend,block-trades,research,backtest}.html 的 <main id="main-content">。
 *
 * 覆蓋：
 *   1. 每頁 h1 標題、資料日與關鍵文案逐字對齊 capture。
 *   2. 次導覽組合與 capture 一致（picks 有市場分類＋相關功能切換；
 *      fade/patterns/swing/tools 只有相關功能切換；
 *      dividend/block-trades/research/backtest 兩者皆無）。
 *   3. picks/fade 如實呈現 capture 的載入骨架（role="status"），不造假資料。
 *   4. patterns（38 列）、swing（40 卡）、dividend（22 列）、
 *      block-trades（24 列）、backtest（29 筆）的歷史快照數量、首末列內容、
 *      連結 href 與紅漲綠跌色類別。
 *   5. tools/research 表單控制項初始值與 4 張研究視角卡連結。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import PicksPage from '@/app/picks/page';
import FadePage from '@/app/fade/page';
import PatternsPage from '@/app/patterns/page';
import SwingPage from '@/app/swing/page';
import ToolsPage from '@/app/tools/page';
import DividendPage from '@/app/dividend/page';
import BlockTradesPage from '@/app/block-trades/page';
import ResearchPage from '@/app/research/page';
import BacktestPage from '@/app/backtest/page';

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

/**
 * 非同步渲染：等 Client 元件 useEffect 內的 fetch 完成後再回傳容器。
 * 用於 /dividend、/block-trades 等「Server 頁面 + Client 資料區」頁面。
 */
async function renderAtAsync(element: ReactElement, pathname: string): Promise<HTMLDivElement> {
  mockUsePathname.mockReturnValue(pathname);
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(element);
  });
  return container;
}

/** 取得容器內所有符合 selector 的文字內容（trim 後）。 */
function texts(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).map((el) =>
    el.textContent?.trim() ?? '',
  );
}

describe('選股股票群組 9 頁', () => {
  describe('/picks 量價觀察', () => {
    it('h1、資料日與次導覽組合對齊 capture（市場分類＋相關功能切換）', () => {
      const c = renderAt(<PicksPage />, '/picks/');
      expect(c.querySelector('h1')?.textContent).toBe('量價觀察');
      expect(c.textContent).toContain('排行依 2026-09-24 盤後籌碼');
      expect(c.querySelector('nav[aria-label="市場分類"]')).not.toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).not.toBeNull();
      // 相關功能切換的當前頁是「量價」
      const active = c.querySelector('nav[aria-label="相關功能切換"] a[aria-current="page"]');
      expect(active?.textContent).toBe('量價');
    });

    it('雙切換按鈕文案對齊 capture', () => {
      const c = renderAt(<PicksPage />, '/picks/');
      const buttons = texts(c, 'button');
      expect(buttons).toContain('盤後籌碼排行');
      expect(buttons).toContain('誰在領漲');
    });

    it('如實呈現 capture 載入骨架（role="status"，不造假資料）', () => {
      const c = renderAt(<PicksPage />, '/picks/');
      const status = c.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status?.textContent).toContain('正在整理盤後量價與籌碼…');
      // 骨架屏：3 個 animate-pulse 區塊
      expect(status?.querySelectorAll('.animate-pulse').length).toBe(3);
      // 沒有造假的榜單表格
      expect(c.querySelector('table')).toBeNull();
      expect(c.querySelectorAll('[data-stock-result-scope] li').length).toBe(0);
    });

    it('metadata title 對齊實站頁名', async () => {
      const mod = await import('@/app/picks/page');
      expect(mod.metadata.title).toBe('量價觀察 | 股市大佬 TradeBoss');
    });
  });

  describe('/fade 隔日沖分點股', () => {
    it('h1、資料日對齊 capture，無市場分類次導覽', () => {
      const c = renderAt(<FadePage />, '/fade/');
      expect(c.querySelector('h1')?.textContent).toBe('隔日沖分點股');
      expect(c.textContent).toContain('2026-09-24 盤後掃描');
      expect(c.querySelector('nav[aria-label="市場分類"]')).toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).not.toBeNull();
      const active = c.querySelector('nav[aria-label="相關功能切換"] a[aria-current="page"]');
      expect(active?.textContent).toBe('隔日沖');
    });

    it('如實呈現 capture 載入骨架（role="status"）', () => {
      const c = renderAt(<FadePage />, '/fade/');
      const status = c.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status?.textContent).toContain('正在比對隔日沖大戶名單…');
      expect(status?.querySelectorAll('.animate-pulse').length).toBe(3);
      expect(c.querySelector('table')).toBeNull();
    });
  });

  describe('/patterns K 線型態掃描', () => {
    it('h1、資料日與 7 個型態頁籤計數對齊 capture', () => {
      const c = renderAt(<PatternsPage />, '/patterns/');
      expect(c.querySelector('h1')?.textContent).toBe('K 線型態掃描');
      expect(c.textContent).toContain('資料日：2026-09-24');
      const tabs = texts(c, 'button[type="button"]');
      expect(tabs).toEqual([
        'W底（雙重底）（38）',
        '頭肩底（3）',
        '破底翻（空頭陷阱）（3）',
        'M頭（雙重頂）（10）',
        '頭肩頂（11）',
        '假突破（多頭陷阱）（14）',
        '收斂三角（17）',
      ]);
    });

    it('W底為選取態（bg-accent），其餘為未選取態', () => {
      const c = renderAt(<PatternsPage />, '/patterns/');
      const tabs = Array.from(c.querySelectorAll('button[type="button"]'));
      expect(tabs[0].className).toContain('bg-accent');
      expect(tabs[1].className).toContain('bg-surface');
    });

    it('符合清單 38 列，首列 6116 彩晶、末列 6491 晶碩，連結 /signal/?id=', () => {
      const c = renderAt(<PatternsPage />, '/patterns/');
      const rows = c.querySelectorAll('[data-stock-result-scope] li');
      expect(rows.length).toBe(38);
      const firstLink = rows[0].querySelector('a');
      expect(firstLink?.getAttribute('href')).toBe('/signal/?id=6116');
      expect(firstLink?.textContent).toBe('6116 彩晶');
      const lastLink = rows[37].querySelector('a');
      expect(lastLink?.getAttribute('href')).toBe('/signal/?id=6491');
      expect(lastLink?.textContent).toBe('6491 晶碩');
    });

    it('量小標記與紅漲綠跌色類別對齊 capture', () => {
      const c = renderAt(<PatternsPage />, '/patterns/');
      expect(c.textContent).toContain('⚠量小');
      const changes = c.querySelectorAll(
        '[data-stock-result-scope] li span.text-up, [data-stock-result-scope] li span.text-down',
      );
      expect(changes.length).toBe(38);
      // 首列 -0.67% 為綠跌
      const first = c.querySelector('[data-stock-result-scope] li');
      expect(first?.querySelector('.text-down')).not.toBeNull();
      expect(first?.textContent).toContain('-0.67%');
    });

    it('頁尾口徑註記對齊 capture', () => {
      const c = renderAt(<PatternsPage />, '/patterns/');
      expect(c.textContent).toContain(
        '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
      );
    });
  });

  describe('/swing 波段條件', () => {
    it('h1、資料週期與 16 個條件頁籤對齊 capture', () => {
      const c = renderAt(<SwingPage />, '/swing/');
      expect(c.querySelector('h1')?.textContent).toBe('波段條件');
      expect(c.textContent).toContain('集保資料週期：2026-09-18');
      expect(c.textContent).toContain('價格資料日：2026-09-24');
      // 單一維度／交集篩選 2 顆 + 16 個條件頁籤
      const tabLabels = texts(c, 'button[type="button"]');
      expect(tabLabels.length).toBe(18);
      expect(tabLabels).toContain('單一維度');
      expect(tabLabels).toContain('🔗 交集篩選');
      const holderTab = tabLabels.find((t) => t.startsWith('大戶持股比例增加'));
      expect(holderTab).toBe('大戶持股比例增加(40)');
    });

    it('大戶持股卡片 40 張，首卡 2520 冠德連結 /stock/?id=2520', () => {
      const c = renderAt(<SwingPage />, '/swing/');
      const cards = c.querySelectorAll('.grid.gap-3 > div');
      expect(cards.length).toBe(40);
      const firstLink = cards[0].querySelector('a');
      expect(firstLink?.getAttribute('href')).toBe('/stock/?id=2520');
      expect(firstLink?.textContent).toContain('2520 冠德');
      expect(firstLink?.textContent).toContain('12 週');
    });

    it('卡片左邊框依 4 週報酬紅漲綠跌（text-up → border-l-up）', () => {
      const c = renderAt(<SwingPage />, '/swing/');
      const cards = c.querySelectorAll('.grid.gap-3 > div');
      expect(cards[0].className).toContain('border-l-up');
      expect(cards[0].textContent).toContain('4週 +1.09%');
    });

    it('頁尾口徑註記對齊 capture', () => {
      const c = renderAt(<SwingPage />, '/swing/');
      expect(c.textContent).toContain(
        '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
      );
    });
  });

  describe('/tools 自訂條件選股', () => {
    it('h1 與技術面 10＋籌碼面 7 條件按鈕對齊 capture', () => {
      const c = renderAt(<ToolsPage />, '/tools/');
      expect(c.querySelector('h1')?.textContent).toBe('自訂條件選股');
      const buttons = Array.from(c.querySelectorAll('button[title]'));
      expect(buttons.length).toBe(17);
      expect(texts(c, 'button[title]')).toContain('收盤高於前 20 日最高價且量增');
      expect(texts(c, 'button[title]')).toContain('外資連買 3 日');
      // title 門檻說明逐字對齊
      expect(buttons[0].getAttribute('title')).toBe(
        '資料日收盤高於前 20 日最高價，且成交量為 20 日均量 1.5 倍以上。',
      );
    });

    it('掃描控制列：交集/聯集下拉、掃描按鈕資料日、條件名稱輸入與存條件', () => {
      const c = renderAt(<ToolsPage />, '/tools/');
      const select = c.querySelector('select');
      expect(select).not.toBeNull();
      expect(texts(c, 'option')).toEqual([
        '交集 AND（兩邊都要）',
        '聯集 OR（一邊即可）',
      ]);
      const buttons = texts(c, 'button[type="button"]');
      expect(buttons).toContain('掃描 （2026-09-24）');
      expect(buttons).toContain('存條件');
      const input = c.querySelector('input[placeholder="條件名稱"]');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).defaultValue).toBe('');
    });

    it('掃描按鈕 className 含實站掠光類別 mi-glare 與結尾雙空格', () => {
      const c = renderAt(<ToolsPage />, '/tools/');
      const scan = Array.from(c.querySelectorAll('button')).find((b) =>
        b.textContent?.startsWith('掃描'),
      );
      expect(scan?.className).toContain('mi-glare');
      expect(scan?.className.endsWith(' ')).toBe(true);
    });
  });

  describe('/dividend 除權息行事曆', () => {
    const ORIG_FETCH = globalThis.fetch;
    beforeEach(() => {
      // jsdom 環境沒有 Response 建構子，改用最小可用的替身物件。
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          items: [
            { stock_id: '1235', label: '1235 興泰', industry: '食品工業', ex_date: '2026-09-24', days_left: 0, cash_dividend: 0.5, stock_dividend: 0.5, close: 35.5, cash_yield_pct: 1.41 },
            { stock_id: '9927', label: '9927 泰銘', industry: '其他', ex_date: '2026-10-01', days_left: 7, cash_dividend: 5, stock_dividend: 0, close: 70.2, cash_yield_pct: 7.12 },
            { stock_id: '6834', label: '6834 天二科技', industry: '電子零組件業', ex_date: '2026-10-02', days_left: 8, cash_dividend: 0, stock_dividend: 0, close: null, cash_yield_pct: null },
          ],
          note: '除息＝發現金、除權＝發股票…非投資建議。',
        }),
      })) as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = ORIG_FETCH;
    });

    it('h1 與「即將除權息（30 天內）」標題對齊 capture，無次導覽', async () => {
      const c = await renderAtAsync(<DividendPage />, '/dividend/');
      expect(c.querySelector('h1')?.textContent).toBe('除權息行事曆');
      expect(c.querySelector('h2')?.textContent).toBe('即將除權息（30 天內）');
      expect(c.querySelector('nav[aria-label="市場分類"]')).toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).toBeNull();
    });

    it('顯示自產真實除息列，首列 1235 興泰含配股註記，連結個股頁', async () => {
      const c = await renderAtAsync(<DividendPage />, '/dividend/');
      const rows = c.querySelectorAll('.table-scroll li');
      expect(rows.length).toBe(3);
      const first = rows[0];
      expect(first.textContent).toContain('09-24');
      expect(first.querySelector('a')?.getAttribute('href')).toBe('/stock/?id=1235');
      expect(first.textContent).toContain('含配股 0.5 元');
    });

    it('高殖利率標記 text-up（9927 泰銘 7.12%）', async () => {
      const c = await renderAtAsync(<DividendPage />, '/dividend/');
      const rows = Array.from(c.querySelectorAll('.table-scroll li'));
      const row = rows.find((r) => r.textContent?.includes('9927'));
      expect(row?.textContent).toContain('7.12%');
      expect(row?.querySelector('.text-up')).not.toBeNull();
    });

    it('缺收盤價的列殖利率顯示「—」，不填 0', async () => {
      const c = await renderAtAsync(<DividendPage />, '/dividend/');
      const rows = Array.from(c.querySelectorAll('.table-scroll li'));
      const row = rows.find((r) => r.textContent?.includes('6834'));
      expect(row?.textContent).toContain('—');
    });
  });

  describe('/block-trades 鉅額交易', () => {
    const ORIG_FETCH = globalThis.fetch;
    beforeEach(() => {
      // jsdom 環境沒有 Response 建構子，改用最小可用的替身物件。
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          date: '2026-09-24',
          data_scope: '盤後',
          next_update: '下一交易日 23:08',
          note: '盤後鉅額成交金額加總，不是進出場。',
          items: [
            { stock_id: '6669', label: '6669 緯穎', n: 1, money_yi: 15.19 },
            { stock_id: '1402', label: '1402 遠東新', n: 1, money_yi: 0.18 },
          ],
          gaps: [],
        }),
      })) as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = ORIG_FETCH;
    });

    it('h1、資料日與更新時間對齊 capture，無次導覽', async () => {
      const c = await renderAtAsync(<BlockTradesPage />, '/block-trades/');
      expect(c.querySelector('h1')?.textContent).toBe('鉅額交易');
      expect(c.textContent).toContain('資料日');
      expect(c.textContent).toContain('下次更新 下一交易日 23:08');
      expect(c.querySelector('nav[aria-label="市場分類"]')).toBeNull();
    });

    it('顯示自產真實清單（金額由大到小），連結個股頁', async () => {
      const c = await renderAtAsync(<BlockTradesPage />, '/block-trades/');
      const rows = c.querySelectorAll('.data-panel ul > li');
      expect(rows.length).toBe(2);
      expect(c.querySelector('h2')?.textContent).toBe('資料日 2 檔');
      const first = rows[0].querySelector('a');
      expect(first?.getAttribute('href')).toBe('/stock/?id=6669');
      expect(first?.textContent).toContain('6669 緯穎');
      expect(first?.textContent).toContain('15.19 億');
      const last = rows[1].querySelector('a');
      expect(last?.textContent).toContain('1402 遠東新');
      expect(last?.textContent).toContain('0.18 億');
    });

    it('載入中顯示誠實骨架（role="status"），不造假數字', () => {
      // fetch 永不 resolve，藉此捕捉載入中狀態。
      globalThis.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
      const container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        createRoot(container).render(<BlockTradesPage />);
      });
      const status = container.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status?.textContent).toContain('正在整理鉅額交易資料…');
      expect(container.querySelectorAll('.data-panel ul > li').length).toBe(0);
    });
  });

  describe('/research 研究中心', () => {
    it('h1 與研究脈絡初始狀態對齊 capture，無次導覽', () => {
      const c = renderAt(<ResearchPage />, '/research/');
      expect(c.querySelector('h1')?.textContent).toBe('研究中心');
      expect(c.textContent).toContain('目前研究脈絡');
      expect(c.textContent).toContain('尚未指定代號');
      expect(c.querySelector('nav[aria-label="市場分類"]')).toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).toBeNull();
    });

    it('4 張研究視角卡標題與連結對齊 capture，第 1 張為選取態', () => {
      const c = renderAt(<ResearchPage />, '/research/');
      const articles = c.querySelectorAll('article');
      expect(articles.length).toBe(4);
      expect(articles[0].querySelector('h3')?.textContent).toBe('條件掃描');
      expect(articles[1].querySelector('h3')?.textContent).toBe('歷史籌碼條件');
      expect(articles[2].querySelector('h3')?.textContent).toBe('策略條件庫');
      expect(articles[3].querySelector('h3')?.textContent).toBe('多股比較');
      const hrefs = Array.from(c.querySelectorAll('article a')).map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).toEqual(['/tools/', '/screener/', '/strategy/', '/compare/']);
      expect(articles[0].className).toContain('border-accent');
      expect(articles[0].textContent).toContain('目前選取');
    });

    it('最近研究為空狀態，不虛構紀錄', () => {
      const c = renderAt(<ResearchPage />, '/research/');
      expect(c.textContent).toContain('還沒有研究紀錄');
      expect(c.textContent).toContain('尚未建立跨裝置工作區');
    });
  });

  describe('/backtest 分點驗證', () => {
    it('h1 與回測表單初始值對齊 capture（2330、自動判斷、主導分點）', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      expect(c.querySelector('h1')?.textContent).toBe('分點驗證');
      const input = c.querySelector('form input') as HTMLInputElement;
      expect(input.defaultValue).toBe('2330');
      expect(input.getAttribute('inputmode')).toBe('numeric');
      const dirButtons = texts(c, 'form + div button');
      expect(dirButtons).toEqual(['自動判斷', '只測放空', '只測做多']);
    });

    it('分點下拉 13 個選項，預設為「主導分點（淨買最大）」', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      const select = c.querySelector('select') as HTMLSelectElement;
      expect(select.options[0].selected).toBe(true);
      const options = texts(c, 'option');
      expect(options.length).toBe(13);
      expect(options[0]).toBe('主導分點（淨買最大）');
      expect(options[1]).toContain('元大');
      expect(options[1]).toContain('86,009 張');
    });

    it('規則面板與 4 張統計卡對齊 capture（45% 綠跌、+0.14%／+2.28% 紅漲、29 筆）', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      expect(c.textContent).toContain('2330 台積電｜主力：元大');
      expect(c.textContent).toContain('跟主力做多（follow）');
      const stats = c.querySelectorAll('.data-stat');
      expect(stats.length).toBe(4);
      expect(stats[0].textContent).toContain('45%');
      expect(stats[0].querySelector('.text-down')).not.toBeNull();
      expect(stats[1].textContent).toContain('+0.14%');
      expect(stats[1].querySelector('.text-up')).not.toBeNull();
      expect(stats[2].textContent).toContain('+2.28%');
      expect(stats[3].textContent).toContain('29');
    });

    it('摘要面板最好/最差一筆對齊 capture', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      expect(c.textContent).toContain('+6.44%');
      expect(c.textContent).toContain('2026-07-28');
      expect(c.textContent).toContain('-7.16%');
      expect(c.textContent).toContain('2026-06-23');
    });

    it('交易明細 29 筆，首筆進場日對齊 capture', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      const rows = c.querySelectorAll('.table-scroll li');
      expect(rows.length).toBe(29);
      expect(rows[0].textContent).toContain('09-08');
    });

    it('頁尾口徑註記對齊 capture', () => {
      const c = renderAt(<BacktestPage />, '/backtest/');
      expect(c.textContent).toContain('已扣手續費 1 折');
      expect(c.textContent).toContain('非投資建議');
    });
  });
});
