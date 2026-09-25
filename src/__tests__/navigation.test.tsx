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
import { LOGIN_TOKEN_KEY } from '@/lib/authState';

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
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const mockUsePathname = usePathname as unknown as jest.Mock;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 每個測試前清空登入憑證，避免跨測試殘留（guest 測試需確定未登入）。 */
beforeEach(() => {
  window.localStorage.removeItem(LOGIN_TOKEN_KEY);
  // 主題切換鈕依 <html data-theme> 決定外觀；測試前還原為實站預設 light。
  document.documentElement.setAttribute('data-theme', 'light');
});

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

/* -------------------------------------------------------------------------- */
/* 會員態 header（登入後）                                                     */
/* -------------------------------------------------------------------------- */

describe('Navigation — 會員態 header（登入後）', () => {
  /** 桌面導覽 6 個下拉鈕的文字（去空白）。 */
  function memberNavLabels(container: HTMLElement): string[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('nav[class*="lg:flex"] button[aria-haspopup="menu"]'),
    ).map((b) => (b.textContent ?? '').trim());
  }

  it('登入後路由 /today 用會員態：桌面導覽 6 個下拉鈕（今天/股票/選股/我的/教學/更多）', () => {
    const { container, root } = renderAt('/today');
    try {
      expect(container.querySelector('header')).not.toBeNull();
      const labels = memberNavLabels(container);
      expect(labels).toEqual(['今天', '股票', '選股', '我的', '教學', '更多']);
      // 每個下拉鈕皆為 <button aria-expanded="false" aria-haspopup="menu"> 且含 caret SVG。
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'),
      );
      expect(buttons).toHaveLength(6);
      for (const b of buttons) {
        expect(b.getAttribute('aria-expanded')).toBe('false');
        expect(b.querySelector('svg path')).not.toBeNull();
      }
    } finally {
      cleanup(container, root);
    }
  });

  it('已登入（warroom_token）時，即使位於 guest 路由也改用會員態 header', () => {
    window.localStorage.setItem(LOGIN_TOKEN_KEY, 'test-token');
    const { container, root } = renderAt('/school');
    try {
      expect(memberNavLabels(container)).toEqual(['今天', '股票', '選股', '我的', '教學', '更多']);
    } finally {
      cleanup(container, root);
    }
  });

  it('右側含全站搜尋鈕、推播設定鈴鐺（/notify/）、功能抽屜漢堡', () => {
    const { container, root } = renderAt('/today');
    try {
      const search = container.querySelector('button[aria-label="搜尋股票或功能，快捷鍵 Command K"]');
      expect(search).not.toBeNull();
      expect(search?.getAttribute('title')).toBe('全站搜尋');

      const notify = container.querySelector('a[aria-label="推播設定"]');
      expect(notify).not.toBeNull();
      expect(notify?.getAttribute('href')).toBe('/notify/');

      const drawer = container.querySelector('button[aria-label="開啟功能抽屜"]');
      expect(drawer).not.toBeNull();
      expect(drawer?.getAttribute('aria-expanded')).toBe('false');
    } finally {
      cleanup(container, root);
    }
  });

  it('會員態 header 不出現訪客導覽（文章/學堂/關於/登入）與主題切換鈕', () => {
    const { container, root } = renderAt('/today');
    try {
      const navText = Array.from(container.querySelectorAll('nav a')).map((a) =>
        (a.textContent ?? '').trim(),
      );
      expect(navText).toEqual([]);
      expect(container.textContent).not.toContain('文章');
      expect(container.querySelector('[aria-label="返回上一頁"]')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 主題切換鈕（依當前主題顯示「切換目標」）                                    */
/* -------------------------------------------------------------------------- */

describe('Navigation — 主題切換鈕', () => {
  /** 主題切換鈕（guest header 唯一帶 aria-pressed 的按鈕）。 */
  function themeBtn(container: HTMLElement): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>('button[aria-pressed]');
  }

  it('當前 light → aria-pressed=true、title「切換到深色（戰情室）」、圖示 ☾、sr-only「切換深色」', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { container, root } = renderAt('/school');
    try {
      const btn = themeBtn(container);
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-pressed')).toBe('true');
      expect(btn?.getAttribute('title')).toBe('切換到深色（戰情室）');
      expect(btn?.textContent).toContain('☾');
      expect(btn?.textContent).toContain('切換深色');
    } finally {
      cleanup(container, root);
    }
  });

  it('當前 dark → aria-pressed=false、title「切換到淺色（較亮、較清楚）」、圖示 ☀、sr-only「切換淺色」', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { container, root } = renderAt('/school');
    try {
      const btn = themeBtn(container);
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-pressed')).toBe('false');
      expect(btn?.getAttribute('title')).toBe('切換到淺色（較亮、較清楚）');
      expect(btn?.textContent).toContain('☀');
      expect(btn?.textContent).toContain('切換淺色');
    } finally {
      cleanup(container, root);
    }
  });

  it('會員態 header 不渲染主題切換鈕（實站登入後為 搜尋／鈴鐺／漢堡）', () => {
    const { container, root } = renderAt('/today');
    try {
      expect(themeBtn(container)).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });
});
