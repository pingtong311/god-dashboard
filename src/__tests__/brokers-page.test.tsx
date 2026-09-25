/** @jest-environment jsdom */

/**
 * /brokers 分點名冊 對齊實站 captured/login-capture/html/brokers.html 的測試。
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/brokers.html 的 <main id="main-content">
 * （與同目錄 tab-brokers.html 內容完全相同）。
 *
 * 覆蓋：
 *   1. h1「分點名冊」與關鍵文案逐字對齊 capture（含全形括號、頓號後半形空格）。
 *   2. 次導覽組合與 capture 一致：有「市場分類」（當前頁＝籌碼），
 *      無「相關功能切換」。
 *   3. 地區分點查詢表單入口（button aria-expanded="false"）與說明文案對齊。
 *   4. 「第一次用這頁？點開 30 秒說明」4 則 Q&A 的 dt 順序對齊。
 *   5. 如實呈現 capture 載入骨架（3 條 animate-pulse），不造假資料、無表格。
 *   6. 「資料日期與口徑」5 條文案對齊。
 */

import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import BrokersPage from '@/app/brokers/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) =>
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

describe('/brokers 分點名冊', () => {
  it('h1 與 hero 說明文案逐字對齊 capture（含頓號後半形空格）', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    expect(c.querySelector('h1')?.textContent).toBe('分點名冊');
    // 「符合率、 隔日」之間含一個半形空格（capture 逐字）
    expect(c.textContent).toContain(
      '近 90 日活躍分點的買賣超樣本、次日反向賣超符合率、 隔日收漲歷史樣本符合率與平均單筆張數。不推論分點身分或下一步行為。',
    );
  });

  it('次導覽組合對齊 capture：有市場分類（當前頁＝籌碼），無相關功能切換', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    expect(c.querySelector('nav[aria-label="市場分類"]')).not.toBeNull();
    expect(c.querySelector('nav[aria-label="相關功能切換"]')).toBeNull();
    const active = c.querySelector('nav[aria-label="市場分類"] a[aria-current="page"]');
    expect(active?.textContent).toBe('籌碼');
    expect(active?.getAttribute('href')).toBe('/brokers/');
  });

  it('地區分點查詢表單入口與說明文案對齊 capture', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    const button = c.querySelector('button[aria-expanded="false"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('地區分點查詢（官方登記地址） ＋');
    expect(c.textContent).toContain(
      '以名稱、代號或縣市查分公司登記地址；不是客戶所在地、主力身分或地緣關係判定。',
    );
  });

  it('「第一次用這頁？點開 30 秒說明」4 則 Q&A 標題順序對齊 capture', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    const summary = c.querySelector('details > summary');
    expect(summary?.textContent).toContain('第一次用這頁？點開 30 秒說明');
    const terms = Array.from(c.querySelectorAll('dl dt')).map((el) => el.textContent);
    expect(terms).toEqual(['這是什麼', '誰會需要', '怎麼看', '什麼時候別用它']);
    expect(c.textContent).toContain('樣本少於 20 次的卡片參考價值低');
  });

  it('如實呈現 capture 載入骨架（正在整理分點名冊，3 條 animate-pulse），不造假資料', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    const panel = c.querySelector('.data-panel.hud-panel.glass');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('正在整理分點名冊');
    expect(panel?.textContent).toContain(
      '主力名冊正在整理或暫時無法更新，請稍後再試；其他功能可正常使用。這頁會自己更新，不用重新整理。',
    );
    // 骨架屏：3 條 animate-pulse（capture 的 grid 為 aria-hidden）
    const grid = panel?.querySelector('[aria-hidden="true"]');
    expect(grid?.querySelectorAll('.animate-pulse').length).toBe(3);
    // 沒有造假的分點表格或清單
    expect(c.querySelector('table')).toBeNull();
    expect(c.querySelectorAll('ul li').length).toBe(0);
  });

  it('資料日期與口徑 5 條文案對齊 capture', () => {
    const c = renderAt(<BrokersPage />, '/brokers/');
    const caveat = Array.from(c.querySelectorAll('details')).find((d) =>
      d.textContent?.includes('資料日期與口徑'),
    );
    expect(caveat).not.toBeNull();
    expect(caveat?.querySelectorAll('p').length).toBe(5);
    expect(caveat?.textContent).toContain(
      '來源：本站行情管線（盤中）、交易所公開資料（盤後統計）',
    );
    expect(caveat?.textContent).toContain('分點為盤後結算。點進明細只看已公布買賣超。');
    expect(caveat?.textContent).toContain('以上是已發生的公開統計，不是進出建議。');
  });

  it('metadata title 對齊實站頁名', async () => {
    const mod = await import('@/app/brokers/page');
    expect(mod.metadata.title).toBe('分點名冊 | 股市大佬 TradeBoss');
  });
});
