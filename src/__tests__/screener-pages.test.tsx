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
 *   3. picks 如實呈現 capture 的載入骨架（role="status"），不造假資料；
 *      fade 因無分點資料源，改以「本站無法提供此資料」誠實說明（無載入骨架、無具體資料日）。
 *   4. patterns / swing 改為 mock fetch 自家 API（GET /api/skynet/pattern-screen、
 *      /api/skynet/swing-hub），斷言渲染邏輯（頁籤、計數、清單、紅漲綠跌色）與
 *      「資料未就緒／fetch 失敗」的誠實狀態，不再鎖死舊快照數字。
 *   5. dividend（22 列）、block-trades（24 列）、backtest（29 筆）的歷史快照數量、
 *      首末列內容、連結 href 與紅漲綠跌色類別。
 *   6. tools/research 表單控制項初始值與 4 張研究視角卡連結。
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
    it('h1 對齊 capture、不顯示具體資料日、無市場分類次導覽', () => {
      const c = renderAt(<FadePage />, '/fade/');
      expect(c.querySelector('h1')?.textContent).toBe('隔日沖分點股');
      // 本站無分點資料源，不應顯示任何具體資料日（如 2026-09-24）。
      expect(c.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(c.querySelector('nav[aria-label="市場分類"]')).toBeNull();
      expect(c.querySelector('nav[aria-label="相關功能切換"]')).not.toBeNull();
      const active = c.querySelector('nav[aria-label="相關功能切換"] a[aria-current="page"]');
      expect(active?.textContent).toBe('隔日沖');
    });

    it('誠實說明「無法提供」（無載入骨架、無具體資料日、不造假）', () => {
      const c = renderAt(<FadePage />, '/fade/');
      // 永久無法取得的狀態不可長得像「載入中」：不應有 role="status"／animate-pulse 骨架。
      expect(c.querySelector('[role="status"]')).toBeNull();
      expect(c.querySelectorAll('.animate-pulse').length).toBe(0);
      // 明確說明「無法提供」與原因。
      expect(c.textContent).toContain('本站無法提供此資料');
      expect(c.textContent).toContain('分點');
      expect(c.querySelector('table')).toBeNull();
    });
  });

  describe('/patterns K 線型態掃描', () => {
    const ORIG_FETCH = globalThis.fetch;

    /** 對齊 PatternItem schema 的清單列（只帶渲染需要的欄位）。 */
    const patItem = (
      stock_id: string,
      stock_name: string,
      close: number,
      change_pct: number,
      low_liquidity: boolean,
    ): Record<string, unknown> => ({
      stock_id,
      stock_name,
      label: `${stock_id} ${stock_name}`,
      close,
      change_pct,
      volume_lots: low_liquidity ? 80 : 2500,
      turnover_yi: 1.2,
      low_liquidity,
      price_unit: 'TWD',
      price_scope: 'eod_close',
      price_as_of: '2026-10-01',
      price_status: 'ok',
      change_scope: 'eod',
      change_as_of: '2026-10-01',
      change_status: 'ok',
      volume_unit: 'lots',
      volume_scope: 'eod',
      volume_as_of: '2026-10-01',
      volume_status: 'ok',
      identity_status: 'ok',
    });

    /**
     * 小樣本 ready fixture：7 個型態皆需存在（Client 以 PATTERN_ORDER 逐項取用），
     * 每型態僅 0-2 檔，避免鎖死舊快照的 38 筆。
     */
    const READY: Record<string, unknown> = {
      ok: true,
      ready: true,
      data_date: '2026-10-01',
      data_scope: '盤後日 K',
      next_update: '下一交易日盤後',
      scope: 'historical_geometry',
      note: '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
      criteria: {
        minBars: 40,
        pivotLookback: 5,
        doubleTolerancePct: 3,
        doubleMidMinBouncePct: 4,
        doubleRecoverMinPct: 2,
        doubleNeckProximity: 2,
        shoulderTolerancePct: 4,
        headMinDepthPct: 5,
        trapLookbackBars: 20,
        trapBreakMinPct: 1,
        trapRecoverMaxAgeBars: 5,
        trapSignificantLookbackBars: 60,
        triangleMaxRangeRatio: 0.7,
        recentPatternMaxAgeBars: 10,
        lowLiquidityLotsThreshold: 500,
      },
      availableDays: 60,
      windowDays: 60,
      scannedStocks: 5,
      missing: [],
      gaps: [],
      patterns: {
        w_bottom: {
          meta: {
            name: 'W底（雙重底）',
            desc: '兩個相近低點與中間高點形成的歷史日 K 幾何分類。',
            structure: '底部幾何',
          },
          count: 2,
          items: [patItem('6116', '彩晶', 12.3, -0.67, false), patItem('6491', '晶碩', 300.5, 1.25, true)],
        },
        inv_hs: {
          meta: {
            name: '頭肩底',
            desc: '左肩、較低中點與右肩形成的歷史日 K 幾何分類。',
            structure: '底部幾何',
          },
          count: 1,
          items: [patItem('2330', '台積電', 600, 0.85, false)],
        },
        bottom_trap: {
          meta: {
            name: '破底翻（空頭陷阱）',
            desc: '價格曾低於前低，之後於同一觀察窗收回的歷史狀態。',
            structure: '跌破收回',
          },
          count: 0,
          items: [],
        },
        m_top: {
          meta: {
            name: 'M頭（雙重頂）',
            desc: '兩個相近高點與中間低點形成的歷史日 K 幾何分類。',
            structure: '頂部幾何',
          },
          count: 1,
          items: [patItem('2603', '長榮', 210, -1.1, false)],
        },
        hs_top: {
          meta: {
            name: '頭肩頂',
            desc: '左肩、較高中點與右肩形成的歷史日 K 幾何分類。',
            structure: '頂部幾何',
          },
          count: 0,
          items: [],
        },
        false_break: {
          meta: {
            name: '假突破（多頭陷阱）',
            desc: '價格曾高於前高，之後於同一觀察窗收回的歷史狀態。',
            structure: '突破收回',
          },
          count: 0,
          items: [],
        },
        triangle: {
          meta: {
            name: '收斂三角',
            desc: '後段區間收斂於前段區間的歷史日 K 幾何分類。',
            structure: '區間收斂',
          },
          count: 1,
          items: [patItem('2454', '聯發科', 880, 0.3, false)],
        },
      },
    };

    /** 未就緒（日 K 累積不足）的誠實回應。 */
    const NOT_READY: Record<string, unknown> = {
      ok: true,
      ready: false,
      availableDays: 12,
      minDaysRequired: 40,
      reason: 'insufficient_data',
      message: '日 K 資料累積中，尚無法辨識型態（目前 12 天，至少需 40 天）。',
      criteria: { minBars: 40 },
      gaps: [],
    };

    beforeEach(() => {
      // jsdom 環境沒有全域 fetch；以最小可用替身回傳 ready fixture。
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => READY,
      })) as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = ORIG_FETCH;
    });

    it('h1、資料日與 7 個型態頁籤（計數由 API 決定）對齊 capture', async () => {
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      expect(c.querySelector('h1')?.textContent).toBe('K 線型態掃描');
      expect(c.textContent).toContain(`資料日：${READY.data_date}`);
      const tabs = texts(c, 'button[type="button"]');
      // 標籤文字逐字對齊 capture；括號內計數來自 API（不寫死舊快照 38/3/3/10/11/14/17）。
      expect(tabs).toEqual([
        'W底（雙重底）（2）',
        '頭肩底（1）',
        '破底翻（空頭陷阱）（0）',
        'M頭（雙重頂）（1）',
        '頭肩頂（0）',
        '假突破（多頭陷阱）（0）',
        '收斂三角（1）',
      ]);
    });

    it('W底為選取態（bg-accent），其餘為未選取態', async () => {
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      const tabs = Array.from(c.querySelectorAll('button[type="button"]'));
      expect(tabs[0].className).toContain('bg-accent');
      expect(tabs[1].className).toContain('bg-surface');
    });

    it('符合清單依選取型態渲染（首列 6116、末列 6491），連結 /signal/?id=', async () => {
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      const rows = c.querySelectorAll('[data-stock-result-scope] li');
      expect(rows.length).toBe(2);
      const firstLink = rows[0].querySelector('a');
      expect(firstLink?.getAttribute('href')).toBe('/signal/?id=6116');
      expect(firstLink?.textContent).toBe('6116 彩晶');
      const lastLink = rows[1].querySelector('a');
      expect(lastLink?.getAttribute('href')).toBe('/signal/?id=6491');
      expect(lastLink?.textContent).toBe('6491 晶碩');
    });

    it('量小標記只出現在 low_liquidity 的列，且漲跌色類別為紅漲綠跌', async () => {
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      const rows = Array.from(c.querySelectorAll('[data-stock-result-scope] li'));
      // ⚠量小 由 fixture 的 low_liquidity 驅動：只有 6491（true）帶標記。
      const lowLi = rows.filter((r) => r.textContent?.includes('⚠量小'));
      expect(lowLi.length).toBe(1);
      expect(lowLi[0].textContent).toContain('6491');
      // 每列各有一個漲跌色 span（紅漲綠跌）。
      const changes = c.querySelectorAll(
        '[data-stock-result-scope] li span.text-up, [data-stock-result-scope] li span.text-down',
      );
      expect(changes.length).toBe(2);
      // 首列 -0.67% 為綠跌。
      expect(rows[0].querySelector('.text-down')).not.toBeNull();
      expect(rows[0].textContent).toContain('-0.67%');
    });

    it('頁尾口徑註記對齊 capture', async () => {
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      expect(c.textContent).toContain(
        '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
      );
    });

    it('日 K 累積不足時顯示誠實「累積中」提示，不造假型態清單', async () => {
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => NOT_READY,
      })) as unknown as typeof fetch;
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      expect(c.textContent).toContain('日 K 資料累積中');
      expect(c.textContent).toContain('12');
      expect(c.textContent).toContain('40');
      // 未就緒時不得出現任何型態頁籤或假造清單。
      expect(texts(c, 'button[type="button"]').length).toBe(0);
      expect(c.querySelectorAll('[data-stock-result-scope] li').length).toBe(0);
      expect(c.textContent).not.toContain('符合的股票');
    });

    it('fetch 失敗時顯示錯誤態，不崩潰、不顯示假資料', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new Error('network');
      }) as unknown as typeof fetch;
      const c = await renderAtAsync(<PatternsPage />, '/patterns/');
      expect(c.querySelector('h1')?.textContent).toBe('K 線型態掃描');
      expect(c.textContent).toContain('暫時無法取得');
      expect(c.querySelectorAll('[data-stock-result-scope] li').length).toBe(0);
      expect(texts(c, 'button[type="button"]').length).toBe(0);
    });
  });

  describe('/swing 波段條件', () => {
    const ORIG_FETCH = globalThis.fetch;

    /** 對齊 SwingItem schema 的卡片。 */
    const swingCard = (
      stock_id: string,
      label: string,
      extra: Record<string, unknown> = {},
    ): Record<string, unknown> => ({ stock_id, label, ...extra });

    /** 16 個條件頁籤（標題逐字對齊實站；計數由 items 決定）。 */
    const TABS: Record<string, unknown>[] = [
      {
        id: 'whale_in',
        title: '大戶持股比例增加',
        desc: '400 張以上持股級距的四週比例增加。',
        items: [
          swingCard('2520', '2520 冠德', { change_pct: 1.09, big_pct: 45.2, k_pct: 30.1 }),
          swingCard('2603', '2603 長榮', { change_pct: -0.5, big_pct: 40.0, k_pct: 20.0 }),
        ],
        note: '集保 1-5 目前僅提供當週資料，歷史週檔尚未累積，delta 與連續週數顯示「累積中」。',
      },
      { id: 'whale_out', title: '大戶持股比例減少', desc: '400 張以上持股級距的四週比例減少。', items: [] },
      {
        id: 'ma60',
        title: '收盤／月線／季線排列',
        desc: '資料日收盤 > MA20 > MA60，且 MA20 較前值增加。',
        items: [swingCard('2330', '2330 台積電', { close: 600, ma20: 590, ma60: 580 })],
      },
      { id: 'pullback', title: '距月線正負 2%', desc: '資料日收盤高於 MA60，且距 MA20 在正負 2% 內。', items: [] },
      { id: 'foreign', title: '外資連買', desc: '外資連續 3 個資料日買超。', items: [] },
      { id: 'trust', title: '投信連買', desc: '投信連續 3 個資料日買超。', items: [] },
      { id: 'both', title: '雙法人同買', desc: '當日外資＋投信同時買超。', items: [] },
      { id: 'reclaim', title: '收盤由月線下方轉為上方', desc: '前一資料日收盤低於 MA20，本資料日收盤高於 MA20。', items: [] },
      { id: 'break20', title: '20 日新高且量增', desc: '資料日收盤為近 20 日新高，且成交量符合量增條件。', items: [] },
      { id: 'rs', title: '20 日區間報酬排序', desc: '近 20 日區間報酬與成交金額皆符合門檻。', items: [] },
      { id: 'sector', title: '族群 20 日報酬排序', desc: '族群 20 日平均報酬及個股區間報酬符合門檻。', items: [] },
      { id: 'margin', title: '融資餘額下降', desc: '融資餘額較約 20 日前下降，並列同期區間報酬。', items: [] },
      { id: 'revenue', title: '月營收增減條件', desc: '最近月營收 MoM 與 YoY 符合頁面所列門檻。', items: [] },
      { id: 'fill', title: '除權息填息', desc: '近期除權息個股相對參考價回升進度——填息／貼息觀察。', items: [] },
      { id: 'badnews', title: '負面敘事與當日跌幅', desc: '新聞標題規則分類為負面，並列資料日實際漲跌幅。', items: [] },
      { id: 'smart', title: '融資／大戶／量價交集', desc: '同時符合融資餘額、400 張以上持股級距與量價門檻。', items: [] },
    ];

    /** ready fixture（小樣本：僅 whale_in 2 張、ma60 1 張）。 */
    const READY: Record<string, unknown> = {
      ok: true,
      data_date: '2026-10-01',
      data_scope: '盤後歷史條件',
      next_update: '下一交易日盤後',
      week: '2026-09-25',
      weeksAccumulated: 1,
      tabs: TABS,
      note: '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
    };

    /** 未就緒（資料源無回應）的誠實回應：tabs 存在但 items 為空並帶原因。 */
    const NOT_READY: Record<string, unknown> = {
      ok: true,
      data_date: '2026-10-01',
      data_scope: '盤後歷史條件',
      next_update: '下一交易日盤後',
      week: '',
      weeksAccumulated: 0,
      tabs: [
        {
          id: 'whale_in',
          title: '大戶持股比例增加',
          desc: '400 張以上持股級距的四週比例增加。',
          items: [],
          unavailable_reason: 'TDCC 集保戶股權分散表上游無回應。',
        },
        {
          id: 'ma60',
          title: '收盤／月線／季線排列',
          desc: '資料日收盤 > MA20 > MA60。',
          items: [],
          unavailable_reason: '全市場日 K 目前僅累積 5 個交易日，尚未達本條件所需的 61 日；資料累積中。',
        },
      ],
      note: '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
    };

    beforeEach(() => {
      // jsdom 環境沒有全域 fetch；以最小可用替身回傳 ready fixture。
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => READY,
      })) as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = ORIG_FETCH;
    });

    it('h1、資料週期與條件頁籤（計數由 API 決定）對齊 capture', async () => {
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      expect(c.querySelector('h1')?.textContent).toBe('波段條件');
      expect(c.textContent).toContain(`集保資料週期：${READY.week}`);
      expect(c.textContent).toContain(`價格資料日：${READY.data_date}`);
      // 單一維度／交集篩選 2 顆 + 條件頁籤（數量由 fixture 決定，不寫死 18）。
      const tabLabels = texts(c, 'button[type="button"]');
      expect(tabLabels.length).toBe(TABS.length + 2);
      expect(tabLabels).toContain('單一維度');
      expect(tabLabels).toContain('🔗 交集篩選');
      const holderTab = tabLabels.find((t) => t.startsWith('大戶持股比例增加'));
      expect(holderTab).toBe('大戶持股比例增加(2)');
    });

    it('預設頁籤卡片依 API 渲染（首卡 2520 冠德），連結 /stock/?id=', async () => {
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      const cards = c.querySelectorAll('.grid.gap-3 > div');
      expect(cards.length).toBe(2);
      const firstLink = cards[0].querySelector('a');
      expect(firstLink?.getAttribute('href')).toBe('/stock/?id=2520');
      expect(firstLink?.textContent).toContain('2520 冠德');
    });

    it('卡片漲跌數值依紅漲綠跌上色（text-up／text-down）', async () => {
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      const cards = c.querySelectorAll('.grid.gap-3 > div');
      // 正報酬 → 紅漲。
      expect(cards[0].querySelector('.text-up')).not.toBeNull();
      expect(cards[0].textContent).toContain('+1.09%');
      // 負報酬 → 綠跌。
      expect(cards[1].querySelector('.text-down')).not.toBeNull();
      expect(cards[1].textContent).toContain('-0.50%');
    });

    it('頁尾口徑註記對齊 capture', async () => {
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      expect(c.textContent).toContain(
        '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
      );
    });

    it('資料源未就緒時顯示該條件的誠實說明，不造假卡片', async () => {
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => NOT_READY,
      })) as unknown as typeof fetch;
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      expect(c.textContent).toContain('TDCC 集保戶股權分散表上游無回應');
      // 未就緒時不得渲染任何假造卡片。
      expect(c.querySelectorAll('.grid.gap-3 > div').length).toBe(0);
    });

    it('fetch 失敗時顯示錯誤態，不崩潰、不顯示假資料', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new Error('network');
      }) as unknown as typeof fetch;
      const c = await renderAtAsync(<SwingPage />, '/swing/');
      expect(c.querySelector('h1')?.textContent).toBe('波段條件');
      expect(c.textContent).toContain('暫時無法取得');
      expect(c.querySelectorAll('.grid.gap-3 > div').length).toBe(0);
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
