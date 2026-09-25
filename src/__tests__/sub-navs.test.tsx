/** @jest-environment jsdom */

/**
 * MarketCatNav / FeatureSubNav 兩個共用次導覽測試
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/picks.html（與 fade/swing/risk 等）。
 *
 * 覆蓋：
 *   1. 市場分類 6 tab：總覽/ETF/排行/籌碼/選股/風險，href 與順序正確。
 *   2. 相關功能切換 6 pill：量價/隔日沖/型態/波段/處置/自訂條件。
 *   3. 當前頁 tab 有 aria-current="page"、底線/底色樣式與實站一致。
 *   4. 非當前頁無 aria-current，樣式為未選取態。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';

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

const CAT_LINKS: readonly [string, string][] = [
  ['總覽', '/market/'],
  ['ETF', '/etf-active/'],
  ['排行', '/ranking/'],
  ['籌碼', '/brokers/'],
  ['選股', '/picks/'],
  ['風險', '/risk/'],
];

const PILL_LINKS: readonly [string, string][] = [
  ['量價', '/picks/'],
  ['隔日沖', '/fade/'],
  ['型態', '/patterns/'],
  ['波段', '/swing/'],
  ['處置', '/risk/'],
  ['自訂條件', '/tools/'],
];

describe('共用次導覽', () => {
  it('市場分類：6 tab 的名稱/href/順序對齊實站', () => {
    const container = renderAt(<MarketCatNav />, '/picks/');
    const nav = container.querySelector('nav[aria-label="市場分類"]');
    expect(nav).not.toBeNull();
    const links = Array.from(nav!.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual(CAT_LINKS);
  });

  it('市場分類：當前頁為 aria-current="page" + text-accent + 底線 bg-accent', () => {
    const container = renderAt(<MarketCatNav />, '/picks/');
    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toBe('選股');
    expect(active?.className).toContain('text-accent');
    expect(active?.querySelector('span')?.className).toContain('bg-accent');
  });

  it('市場分類：非當前頁無 aria-current，底線 bg-transparent', () => {
    const container = renderAt(<MarketCatNav />, '/picks/');
    const inactive = Array.from(
      container.querySelectorAll('nav[aria-label="市場分類"] a'),
    ).find((a) => a.textContent === '總覽');
    expect(inactive?.hasAttribute('aria-current')).toBe(false);
    expect(inactive?.className).toContain('text-muted');
    expect(inactive?.className).toContain('hover:text-ink');
    expect(inactive?.querySelector('span')?.className).toContain('bg-transparent');
  });

  it('市場分類：帶尾斜線與不帶尾斜線視為同一頁', () => {
    const container = renderAt(<MarketCatNav />, '/risk');
    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toBe('風險');
  });

  it('相關功能切換：6 pill 的名稱/href/順序對齊實站', () => {
    const container = renderAt(<FeatureSubNav />, '/fade/');
    const nav = container.querySelector('nav[aria-label="相關功能切換"]');
    expect(nav).not.toBeNull();
    const links = Array.from(nav!.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual(PILL_LINKS);
  });

  it('相關功能切換：當前頁為 bg-accent text-bg，其餘為未選取樣式', () => {
    const container = renderAt(<FeatureSubNav />, '/fade/');
    const pills = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    );
    const active = pills.find((a) => a.textContent === '隔日沖');
    expect(active?.hasAttribute('aria-current')).toBe(true);
    expect(active?.className).toContain('bg-accent');
    expect(active?.className).toContain('text-bg');

    const inactive = pills.find((a) => a.textContent === '量價');
    expect(inactive?.hasAttribute('aria-current')).toBe(false);
    expect(inactive?.className).toContain('border-line');
    expect(inactive?.className).toContain('text-muted');
  });
});
