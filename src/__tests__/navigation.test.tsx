/** @jest-environment jsdom */

/**
 * Navigation（頂部 site-header）測試
 * ----------------------------------------------------------------------------
 * 覆蓋：
 *   1. 顯示時機：guest 與 app（登入後）皆渲染；只有 'none' 路由不渲染（沿用 shellRoutes 判定）。
 *   2. ★ 回歸：「返回上一頁」按鈕不得出現在首頁 `/`。
 *      博主實測（extracted/site/，grep `返回上一頁`）：
 *        home.html = 0，其餘 10 個外殼頁 = 1。
 *      首頁沒有上一頁可回，博主刻意不顯示；峰子原本無條件渲染，已修。
 *   3. 返回鍵的 SVG path 逐字等於博主（Phosphor ArrowLeft，256 viewBox）。
 *   4. 品牌區塊、桌面導覽四項、主題切換鈕仍在。
 *
 * 說明：本專案既有做法為以 `react-dom/client` 的 createRoot + `react` 的 act
 * 掛載真實 DOM（見 guest-shell.test.tsx），此處沿用；`next/link` 以純 <a> 取代
 * （href 不變），`next/navigation` 的 usePathname 以可控 mock 取代。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import Navigation from '@/components/Navigation';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) =>
    (require('react') as typeof import('react')).createElement(
      'a',
      { href: typeof href === 'string' ? href : String(href), ...rest },
      children,
    ),
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: jest.fn(),
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const mockUsePathname = usePathname as unknown as jest.Mock;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 博主 about.html 內「返回上一頁」的原始 path（Phosphor ArrowLeft）。 */
const BLOGGER_BACK_PATH =
  'M228,128a12,12,0,0,1-12,12H69l51.52,51.51a12,12,0,0,1-17,17l-72-72a12,12,0,0,1,0-17l72-72a12,12,0,0,1,17,17L69,116H216A12,12,0,0,1,228,128Z';

/** 在指定 pathname 掛載 Navigation（跑完 effect）→ 回傳容器與 root。 */
function renderAt(pathname: string): { container: HTMLDivElement; root: Root } {
  mockUsePathname.mockReturnValue(pathname);
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<Navigation /> as ReactElement);
  });
  return { container, root };
}

function cleanup(container: HTMLDivElement, root: Root): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/** 取得「返回上一頁」按鈕（無則 null）。 */
function backButton(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[aria-label="返回上一頁"]');
}

/* -------------------------------------------------------------------------- */

describe('Navigation — 顯示時機（guest 與 app 皆顯示）', () => {
  const guestPaths = ['/', '/learn', '/school', '/guide', '/manual', '/about', '/pricing'];

  it.each(guestPaths)('%s → 渲染 header（guest）', (pathname) => {
    const { container, root } = renderAt(pathname);
    try {
      expect(container.querySelector('header')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  // ★ 本次修正：登入後的頁面（'app'）**同樣有** site-header，不再是「無外殼」。
  const appPaths = ['/today', '/market', '/stock', '/brokers', '/member', '/diary', '/radar'];

  it.each(appPaths)('%s → 渲染 header（登入後頁面仍有 site-header）', (pathname) => {
    const { container, root } = renderAt(pathname);
    try {
      expect(container.querySelector('header')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  const noHeaderPaths = ['/learn/some-slug', '/s/2330', '/privacy', '/terms'];

  it.each(noHeaderPaths)('%s → 完全不渲染（無外殼）', (pathname) => {
    const { container, root } = renderAt(pathname);
    try {
      expect(container.querySelector('header')).toBeNull();
      expect(container.innerHTML).toBe('');
    } finally {
      cleanup(container, root);
    }
  });
});

describe('Navigation — 返回上一頁（★ 首頁不得出現）', () => {
  it('★ 首頁 `/` 不顯示返回鍵（博主 home.html 實測 0 個）', () => {
    const { container, root } = renderAt('/');
    try {
      expect(container.querySelector('header')).not.toBeNull();
      expect(backButton(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('★ 首頁帶結尾斜線 `/`（多個斜線）同樣不顯示', () => {
    const { container, root } = renderAt('///');
    try {
      // normalizePath 後仍為 '/'（去斜線後為空字串，回退成 '/'）
      expect(backButton(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  const nonHomeGuest = ['/learn', '/school', '/guide', '/manual', '/about', '/pricing', '/methodology', '/legal', '/app', '/login'];

  it.each(nonHomeGuest)('%s → 顯示返回鍵（博主該頁實測 1 個）', (pathname) => {
    const { container, root } = renderAt(pathname);
    try {
      expect(backButton(container)).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('返回鍵的 SVG path 逐字等於博主原始 path', () => {
    const { container, root } = renderAt('/school');
    try {
      const btn = backButton(container);
      expect(btn).not.toBeNull();
      const path = btn?.querySelector('path');
      expect(path?.getAttribute('d')).toBe(BLOGGER_BACK_PATH);
    } finally {
      cleanup(container, root);
    }
  });

  it('返回鍵的 svg 為 Phosphor 規格（256 viewBox / fill=currentColor / 22px）', () => {
    const { container, root } = renderAt('/school');
    try {
      const svg = backButton(container)?.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 256 256');
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      expect(svg?.getAttribute('width')).toBe('22');
      expect(svg?.getAttribute('height')).toBe('22');
    } finally {
      cleanup(container, root);
    }
  });
});

describe('Navigation — header 內容', () => {
  it('品牌連結指向 `/`，aria-label 為「回股市大佬首頁」', () => {
    const { container, root } = renderAt('/school');
    try {
      const brand = container.querySelector('a[aria-label="回股市大佬首頁"]');
      expect(brand).not.toBeNull();
      expect(brand?.getAttribute('href')).toBe('/');
    } finally {
      cleanup(container, root);
    }
  });

  it('桌面導覽四項：文章 / 學堂 / 關於 / 登入', () => {
    const { container, root } = renderAt('/school');
    try {
      const labels = Array.from(container.querySelectorAll('nav a')).map((a) =>
        (a.textContent ?? '').trim(),
      );
      expect(labels).toEqual(['文章', '學堂', '關於', '登入']);
    } finally {
      cleanup(container, root);
    }
  });

  it('主題切換鈕存在', () => {
    const { container, root } = renderAt('/school');
    try {
      const buttons = Array.from(container.querySelectorAll('button'));
      const hasThemeToggle = buttons.some((b) => {
        const label = `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`;
        return label.includes('切換') || label.includes('淺色') || label.includes('深色');
      });
      expect(hasThemeToggle).toBe(true);
    } finally {
      cleanup(container, root);
    }
  });
});
