/** @jest-environment jsdom */

/**
 * 未登入態外殼（guest shell）測試
 * ----------------------------------------------------------------------------
 * 覆蓋 <ComplianceBar/> <SiteFooter/> <MobileTaskbar/> 三個新外殼元件，
 * 以及 <AppTabBar/> 與底部列的互斥（回歸）。
 *
 * 說明：本專案的 `@testing-library/dom` 為損壞的 symlink（缺 dom-accessibility-api，
 * 連帶使 `@testing-library/react` 無任何 export），故沿用 repo 既有做法：
 *   - `react-dom/client` 的 createRoot + `react` 的 act 掛載真實 DOM（含 effect）
 *   - `next/link` 以純 <a> 取代（href 不變）
 *   - `next/navigation` 的 usePathname 以可控 mock 取代
 * 元件以 mountedPath（useState('') + useEffect）判定「已選取」，
 * 故必須真正掛載、跑完 effect 後再查詢。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import ComplianceBar from '@/components/ComplianceBar';
import SiteFooter from '@/components/SiteFooter';
import MobileTaskbar from '@/components/MobileTaskbar';
import AppTabBar from '@/components/AppTabBar';

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

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* -------------------------------------------------------------------------- */
/* 工具                                                                       */
/* -------------------------------------------------------------------------- */

/** 在指定 pathname 掛載元件（跑完 effect）→ 回傳可查詢的容器與 root。 */
function renderAt(pathname: string, ui: ReactElement): { container: HTMLDivElement; root: Root } {
  mockUsePathname.mockReturnValue(pathname);
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  return { container, root };
}

/** 卸載並移除容器。 */
function cleanup(container: HTMLDivElement, root: Root): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/** 底部列的五個連結。 */
function taskbarLinks(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="手機導覽（未登入）"] a'),
  );
}

/* -------------------------------------------------------------------------- */
/* 1. MobileTaskbar — 結構                                                    */
/* -------------------------------------------------------------------------- */

describe('MobileTaskbar — 結構', () => {
  it('渲染 5 個連結，nav 具 aria-label，標籤與 href 逐字正確', () => {
    const { container, root } = renderAt('/', <MobileTaskbar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.getAttribute('aria-label')).toBe('手機導覽（未登入）');

      const links = taskbarLinks(container);
      expect(links).toHaveLength(5);
      expect(links.map((a) => a.textContent)).toEqual(['首頁', '文章', '學堂', '導覽', '登入']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/',
        '/learn',
        '/school',
        '/guide',
        '/login',
      ]);
    } finally {
      cleanup(container, root);
    }
  });

  it('每個項目皆含圓形圖示膠囊（<svg>）與文字標籤', () => {
    const { container, root } = renderAt('/', <MobileTaskbar />);
    try {
      const links = taskbarLinks(container);
      for (const a of links) {
        expect(a.querySelector('svg')).not.toBeNull();
        expect(a.querySelectorAll('span')).toHaveLength(2);
      }
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. MobileTaskbar — 已選取態                                                */
/* -------------------------------------------------------------------------- */

describe('MobileTaskbar — 已選取態', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['/', '首頁'],
    ['/learn', '文章'],
    ['/school', '學堂'],
    ['/guide', '導覽'],
    ['/login', '登入'],
  ];

  it.each(cases)('pathname %s → 恰好一個 aria-current=page，且為「%s」', (path, label) => {
    const { container, root } = renderAt(path, <MobileTaskbar />);
    try {
      const active = taskbarLinks(container).filter(
        (a) => a.getAttribute('aria-current') === 'page',
      );
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toBe(label);
    } finally {
      cleanup(container, root);
    }
  });

  it('已選取項目的圖示膠囊帶 taskbar-active-pill；未選取者不帶（全頁僅 1 個）', () => {
    const { container, root } = renderAt('/school', <MobileTaskbar />);
    try {
      const links = taskbarLinks(container);
      const activeLink = links.find((a) => a.getAttribute('aria-current') === 'page');
      expect(activeLink?.textContent).toBe('學堂');

      const pillSpans = container.querySelectorAll('span.taskbar-active-pill');
      expect(pillSpans).toHaveLength(1);
      expect(activeLink?.querySelector('span')?.className).toContain('taskbar-active-pill');

      // 其餘四個膠囊為未選取樣式
      const inactivePills = Array.from(links)
        .filter((a) => a.getAttribute('aria-current') !== 'page')
        .map((a) => a.querySelector('span')?.className ?? '');
      expect(inactivePills).toHaveLength(4);
      for (const cls of inactivePills) {
        expect(cls).not.toContain('taskbar-active-pill');
        expect(cls).toContain('text-current');
      }
    } finally {
      cleanup(container, root);
    }
  });

  it('已選取態圖示尺寸 21、未選取態 22（逐字照抄博主）', () => {
    const { container, root } = renderAt('/login', <MobileTaskbar />);
    try {
      const active = container.querySelector('a[aria-current="page"] svg');
      expect(active?.getAttribute('width')).toBe('21');
      expect(active?.getAttribute('height')).toBe('21');
      const inactive = taskbarLinks(container).find(
        (a) => a.getAttribute('aria-current') !== 'page',
      );
      expect(inactive?.querySelector('svg')?.getAttribute('width')).toBe('22');
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. MobileTaskbar — 非 guest 不渲染                                         */
/* -------------------------------------------------------------------------- */

describe('MobileTaskbar — 非 guest 路由不渲染', () => {
  it.each(['/learn/some-slug', '/s/2330', '/privacy', '/terms', '/diary'])(
    '%s → 不渲染任何 <nav>',
    (path) => {
      const { container, root } = renderAt(path, <MobileTaskbar />);
      try {
        expect(container.querySelector('nav')).toBeNull();
        expect(container.childNodes).toHaveLength(0);
      } finally {
        cleanup(container, root);
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* 4. ComplianceBar                                                           */
/* -------------------------------------------------------------------------- */

describe('ComplianceBar — 法遵條', () => {
  it('含主旨文字與兩個響應式 tagline（sm 以上 / sm 以下各一）', () => {
    const { container, root } = renderAt('/', <ComplianceBar />);
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('非證券投資顧問事業');
      expect(text).toContain('｜公開資料研究與教學，不提供個股分析意見或推介');
      expect(text).toContain('｜公開資料研究與教學');
      // 兩個 tagline 分屬 hidden sm:inline / sm:hidden
      expect(container.querySelector('.hidden.sm\\:inline')).not.toBeNull();
      expect(container.querySelector('.sm\\:hidden')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('法遵 → /legal/、隱私 → /privacy（皆為站內 <a>，無 target=_blank）', () => {
    const { container, root } = renderAt('/', <ComplianceBar />);
    try {
      const links = Array.from(container.querySelectorAll('a'));
      expect(links.map((a) => a.textContent)).toEqual(['法遵', '隱私']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/legal/', '/privacy']);
      expect(links.some((a) => a.getAttribute('target') === '_blank')).toBe(false);
      // 兩個連結之間為一個前後各一空格的「·」
      expect(container.textContent).toContain('法遵 · 隱私');
    } finally {
      cleanup(container, root);
    }
  });

  it('非 guest 路由（/s/2330）不渲染', () => {
    const { container, root } = renderAt('/s/2330', <ComplianceBar />);
    try {
      expect(container.childNodes).toHaveLength(0);
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. SiteFooter                                                              */
/* -------------------------------------------------------------------------- */

describe('SiteFooter — 免責與法遵聲明', () => {
  it('含標題與法遵固定句（原文照登）', () => {
    const { container, root } = renderAt('/', <SiteFooter />);
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('免責與法遵聲明');
      expect(text).toContain('本平台提供台股公開籌碼資料之統計、教學與研究工具');
      expect(text).toContain('不構成任何投資建議、招攬、買賣要約或獲利保證');
      expect(text).toContain('股市大佬 TradeBoss · © 2026 資料研究工具｜非投資建議');
    } finally {
      cleanup(container, root);
    }
  });

  it('六個法遵連結標籤與 href 逐字正確（順序照抄博主）', () => {
    const { container, root } = renderAt('/', <SiteFooter />);
    try {
      const links = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="公司資訊與法遵"] a'),
      );
      expect(links.map((a) => a.textContent)).toEqual([
        '關於本站',
        '新手導覽',
        '隱私權政策',
        '服務條款',
        '法遵說明',
        '使用回饋／刪帳',
      ]);
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/about/',
        '/guide/',
        '/privacy',
        '/terms',
        '/legal/',
        '/member/?tab=feedback',
      ]);
      // 隱私 / 服務條款已改為站內路由，不再另開視窗
      expect(links.some((a) => a.getAttribute('target') === '_blank')).toBe(false);
    } finally {
      cleanup(container, root);
    }
  });

  it('非 guest 路由（/s/2330）不渲染', () => {
    const { container, root } = renderAt('/s/2330', <SiteFooter />);
    try {
      expect(container.childNodes).toHaveLength(0);
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 6. 外殼互斥（回歸）                                                        */
/* -------------------------------------------------------------------------- */

describe('外殼互斥（回歸）', () => {
  it('AppTabBar 在 /school 不渲染（不得與未登入態底部列重疊）', () => {
    const { container, root } = renderAt('/school', <AppTabBar />);
    try {
      expect(container.querySelector('nav')).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('AppTabBar 在 /diary 仍渲染（App 外殼不受影響）', () => {
    const { container, root } = renderAt('/diary', <AppTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.getAttribute('aria-label')).toBe('底部功能列');
    } finally {
      cleanup(container, root);
    }
  });
});
