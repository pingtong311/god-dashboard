/** @jest-environment jsdom */

/**
 * 外殼元件測試（底部列 / 法遵條 / 頁尾）
 * ----------------------------------------------------------------------------
 * 覆蓋 <BottomTabBar/>（guest + member 兩態）、<ComplianceBar/>、<SiteFooter/>。
 *
 * 說明：本專案的 `@testing-library/dom` 為損壞的 symlink（缺 dom-accessibility-api，
 * 連帶使 `@testing-library/react` 無任何 export），故沿用 repo 既有做法：
 *   - `react-dom/client` 的 createRoot + `react` 的 act 掛載真實 DOM（含 effect）
 *   - `next/link` 以純 <a> 取代（href 不變）
 *   - `next/navigation` 的 usePathname 以可控 mock 取代
 * 元件以 mountedPath（useState('') + useEffect）判定「已選取」，
 * 登入狀態以 localStorage 的 `warroom_token` 判定（同樣於 effect 內讀取），
 * 故必須真正掛載、跑完 effect 後再查詢。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import ComplianceBar from '@/components/ComplianceBar';
import SiteFooter from '@/components/SiteFooter';
import BottomTabBar from '@/components/BottomTabBar';
import { LOGIN_TOKEN_KEY } from '@/lib/authState';

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

/** 每個測試前清空登入憑證，避免跨測試殘留。 */
beforeEach(() => {
  window.localStorage.removeItem(LOGIN_TOKEN_KEY);
});

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

/** 底部列的所有連結。 */
function tabbarLinks(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('nav.mobile-taskbar a'));
}

/* -------------------------------------------------------------------------- */
/* 1. BottomTabBar — 訪客態（guest）                                          */
/* -------------------------------------------------------------------------- */

describe('BottomTabBar — 訪客態', () => {
  it('未登入時 nav 的 aria-label 為「手機導覽（未登入）」，5 個 href/label 逐字正確', () => {
    const { container, root } = renderAt('/', <BottomTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.getAttribute('aria-label')).toBe('手機導覽（未登入）');

      const links = tabbarLinks(container);
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

  it('nav 的 class 逐字等於實站原文', () => {
    const { container, root } = renderAt('/', <BottomTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav?.getAttribute('class')).toBe(
        'mobile-taskbar fixed inset-x-0 bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden',
      );
    } finally {
      cleanup(container, root);
    }
  });

  it('訪客態 <a> class 不含 px-0.5（與會員態的關鍵差異之一）', () => {
    const { container, root } = renderAt('/', <BottomTabBar />);
    try {
      for (const a of tabbarLinks(container)) {
        const cls = a.getAttribute('class') ?? '';
        expect(cls).toContain(
          'flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-black transition active:scale-95',
        );
        expect(cls).not.toContain('px-0.5');
      }
    } finally {
      cleanup(container, root);
    }
  });

  it('訪客態 label 為單純 <span>首頁</span>（無 truncate 內層）', () => {
    const { container, root } = renderAt('/', <BottomTabBar />);
    try {
      const first = tabbarLinks(container)[0];
      const labelSpan = first.querySelectorAll('span')[1];
      expect(labelSpan.textContent).toBe('首頁');
      expect(labelSpan.querySelector('span')).toBeNull();
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. BottomTabBar — 會員態（member）                                         */
/* -------------------------------------------------------------------------- */

describe('BottomTabBar — 會員態', () => {
  it('登入後路由 /today 用會員態：aria-label 與 5 個 href/label 逐字正確', () => {
    const { container, root } = renderAt('/today', <BottomTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe('手機主要導覽');

      const links = tabbarLinks(container);
      expect(links).toHaveLength(5);
      expect(links.map((a) => a.textContent)).toEqual(['戰情', '市場', '個股', '籌碼', '我的']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/today',
        '/market',
        '/stock',
        '/brokers',
        '/member',
      ]);
    } finally {
      cleanup(container, root);
    }
  });

  it('已登入（warroom_token 存在）時，即使位於 guest 路由也改用會員態', () => {
    window.localStorage.setItem(LOGIN_TOKEN_KEY, 'test-token');
    const { container, root } = renderAt('/', <BottomTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe('手機主要導覽');
      expect(tabbarLinks(container).map((a) => a.textContent)).toEqual([
        '戰情',
        '市場',
        '個股',
        '籌碼',
        '我的',
      ]);
    } finally {
      cleanup(container, root);
    }
  });

  it('會員態 <a> class 含 px-0.5，且 nav class 與訪客態相同', () => {
    const { container, root } = renderAt('/today', <BottomTabBar />);
    try {
      const nav = container.querySelector('nav');
      expect(nav?.getAttribute('class')).toBe(
        'mobile-taskbar fixed inset-x-0 bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden',
      );
      for (const a of tabbarLinks(container)) {
        expect(a.getAttribute('class')).toContain(
          'flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-black transition active:scale-95',
        );
      }
    } finally {
      cleanup(container, root);
    }
  });

  it('會員態 label 多包一層 flex/truncate（逐字照抄實站）', () => {
    const { container, root } = renderAt('/today', <BottomTabBar />);
    try {
      const first = tabbarLinks(container)[0];
      const wrapper = first.querySelector('span.flex.max-w-full.items-center.justify-center.gap-0\\.5');
      expect(wrapper).not.toBeNull();
      const inner = wrapper?.querySelector('span.truncate');
      expect(inner?.textContent).toBe('戰情');
    } finally {
      cleanup(container, root);
    }
  });

  it('個股 /stock 帶 aria-haspopup="dialog" 與 aria-expanded="false"（其餘項不帶）', () => {
    const { container, root } = renderAt('/stock', <BottomTabBar />);
    try {
      const links = tabbarLinks(container);
      const stock = links.find((a) => a.getAttribute('href') === '/stock');
      expect(stock?.getAttribute('aria-haspopup')).toBe('dialog');
      expect(stock?.getAttribute('aria-expanded')).toBe('false');

      const others = links.filter((a) => a.getAttribute('href') !== '/stock');
      for (const a of others) {
        expect(a.getAttribute('aria-haspopup')).toBeNull();
        expect(a.getAttribute('aria-expanded')).toBeNull();
      }
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. BottomTabBar — 已選取態                                                 */
/* -------------------------------------------------------------------------- */

describe('BottomTabBar — 已選取態', () => {
  const guestCases: ReadonlyArray<readonly [string, string]> = [
    ['/', '首頁'],
    ['/learn', '文章'],
    ['/school', '學堂'],
    ['/guide', '導覽'],
    ['/login', '登入'],
  ];

  it.each(guestCases)('訪客態 pathname %s → 恰好一個 aria-current=page（%s）', (path, label) => {
    const { container, root } = renderAt(path, <BottomTabBar />);
    try {
      const active = tabbarLinks(container).filter(
        (a) => a.getAttribute('aria-current') === 'page',
      );
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toBe(label);
    } finally {
      cleanup(container, root);
    }
  });

  const memberCases: ReadonlyArray<readonly [string, string]> = [
    ['/today', '戰情'],
    ['/market', '市場'],
    ['/stock', '個股'],
    ['/brokers', '籌碼'],
    ['/member', '我的'],
  ];

  it.each(memberCases)('會員態 pathname %s → 恰好一個 aria-current=page（%s）', (path, label) => {
    const { container, root } = renderAt(path, <BottomTabBar />);
    try {
      const active = tabbarLinks(container).filter(
        (a) => a.getAttribute('aria-current') === 'page',
      );
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toBe(label);
    } finally {
      cleanup(container, root);
    }
  });

  it('已選取項目的圖示膠囊帶 taskbar-active-pill；未選取者不帶（全頁僅 1 個）', () => {
    const { container, root } = renderAt('/school', <BottomTabBar />);
    try {
      const links = tabbarLinks(container);
      const activeLink = links.find((a) => a.getAttribute('aria-current') === 'page');
      expect(activeLink?.textContent).toBe('學堂');

      const pillSpans = container.querySelectorAll('span.taskbar-active-pill');
      expect(pillSpans).toHaveLength(1);
      expect(activeLink?.querySelector('span')?.className).toContain('taskbar-active-pill');

      const inactivePills = links
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

  it('已選取態圖示尺寸 21、未選取態 22（逐字照抄實站）', () => {
    const { container, root } = renderAt('/login', <BottomTabBar />);
    try {
      const active = container.querySelector('a[aria-current="page"] svg');
      expect(active?.getAttribute('width')).toBe('21');
      expect(active?.getAttribute('height')).toBe('21');
      const inactive = tabbarLinks(container).find(
        (a) => a.getAttribute('aria-current') !== 'page',
      );
      expect(inactive?.querySelector('svg')?.getAttribute('width')).toBe('22');
    } finally {
      cleanup(container, root);
    }
  });

  it('會員態已選取圖示尺寸亦為 21（/stock）', () => {
    const { container, root } = renderAt('/stock', <BottomTabBar />);
    try {
      const active = container.querySelector('a[aria-current="page"] svg');
      expect(active?.getAttribute('width')).toBe('21');
      const inactive = tabbarLinks(container).find(
        (a) => a.getAttribute('aria-current') !== 'page',
      );
      expect(inactive?.querySelector('svg')?.getAttribute('width')).toBe('22');
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. BottomTabBar — 無外殼路由不渲染                                         */
/* -------------------------------------------------------------------------- */

describe('BottomTabBar — 無外殼路由不渲染', () => {
  it.each(['/learn/some-slug', '/s/2330', '/privacy', '/terms'])(
    '%s → 不渲染任何 <nav>',
    (path) => {
      const { container, root } = renderAt(path, <BottomTabBar />);
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
/* 5. ComplianceBar — 法遵條                                                  */
/* -------------------------------------------------------------------------- */

describe('ComplianceBar — 法遵條', () => {
  it('含主旨文字與兩個響應式 tagline（sm 以上 / sm 以下各一）', () => {
    const { container, root } = renderAt('/', <ComplianceBar />);
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('非證券投資顧問事業');
      expect(text).toContain('｜公開資料研究與教學，不提供個股分析意見或推介');
      expect(text).toContain('｜公開資料研究與教學');
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
      expect(container.textContent).toContain('法遵 · 隱私');
    } finally {
      cleanup(container, root);
    }
  });

  it('★ 登入後路由（/today）同樣渲染（實測登入後頁面仍有法遵條）', () => {
    const { container, root } = renderAt('/today', <ComplianceBar />);
    try {
      expect(container.querySelector('.compliance-bar')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('無外殼路由（/s/2330）不渲染', () => {
    const { container, root } = renderAt('/s/2330', <ComplianceBar />);
    try {
      expect(container.childNodes).toHaveLength(0);
    } finally {
      cleanup(container, root);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 6. SiteFooter                                                              */
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
      expect(links.some((a) => a.getAttribute('target') === '_blank')).toBe(false);
    } finally {
      cleanup(container, root);
    }
  });

  it('★ 登入後路由（/today）同樣渲染 site-footer（實測登入後頁面仍有頁尾）', () => {
    const { container, root } = renderAt('/today', <SiteFooter />);
    try {
      expect(container.querySelector('footer.site-footer')).not.toBeNull();
    } finally {
      cleanup(container, root);
    }
  });

  it('無外殼路由（/s/2330）不渲染', () => {
    const { container, root } = renderAt('/s/2330', <SiteFooter />);
    try {
      expect(container.childNodes).toHaveLength(0);
    } finally {
      cleanup(container, root);
    }
  });
});
