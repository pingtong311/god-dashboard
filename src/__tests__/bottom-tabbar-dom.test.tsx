/** @jest-environment jsdom */

/**
 * BottomTabBar — DOM 逐字對齊實站測試
 * ----------------------------------------------------------------------------
 * 以 `src/__tests__/fixtures/tabbar-icons.json`（實站 51 頁 HTML 交叉驗證的原文）
 * 為唯一依據，逐項斷言渲染結果：href、圖示寬度、`<path>` d 序列（含籌碼的 3 條）、
 * 選中項 caret、aria-haspopup/aria-expanded 掛載規則、主圖示 vs caret 的 aria-hidden。
 *
 * mock 方式沿用專案既有做法（見 navigation.test.tsx）：`next/link` 以純 <a> 取代、
 * `next/navigation` 的 usePathname 以可控 mock 取代；登入狀態由 localStorage
 * 的 `warroom_token` 決定（`useIsLoggedIn` 於 effect 內讀取），故需真正掛載跑完 effect。
 */

import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import BottomTabBar from '@/components/BottomTabBar';
import { LOGIN_TOKEN_KEY } from '@/lib/authState';
import fixture from './fixtures/tabbar-icons.json';

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

/* -------------------------------------------------------------------------- */
/* Fixture 型別（JSON 為結構推導，故以寬鬆型別包裝後存取）                      */
/* -------------------------------------------------------------------------- */

type StateSpec = { href: string; iconWidth: number; paths: string[] };
type ItemSpec = { active?: StateSpec; inactive?: StateSpec };

const TABBAR = fixture as unknown as {
  member: Record<string, ItemSpec>;
  guest: Record<string, ItemSpec>;
  caret: { path: string; width: number; height: number; className: string };
};

type Variant = 'guest' | 'member';
type TabState = 'active' | 'inactive';

/** 左→右順序（對齊實站）。 */
const GUEST_ORDER = ['首頁', '文章', '學堂', '導覽', '登入'] as const;
const MEMBER_ORDER = ['戰情', '市場', '個股', '籌碼', '我的'] as const;

/** 每個測試前清空登入憑證。 */
beforeEach(() => {
  window.localStorage.removeItem(LOGIN_TOKEN_KEY);
});

/** 在指定 pathname 掛載元件（跑完 effect）。 */
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

function cleanup(container: HTMLDivElement, root: Root): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function tabbarLinks(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('nav.mobile-taskbar a'));
}

/** 取得指定 variant + label 的預期規格。 */
function spec(variant: Variant, label: string, state: TabState): StateSpec {
  const item = TABBAR[variant][label][state];
  if (!item) {
    throw new Error(`fixture 缺少 ${variant}.${label}.${state}`);
  }
  return item;
}

/* -------------------------------------------------------------------------- */
/* 情境定義：guest/member × active/inactive                                    */
/* -------------------------------------------------------------------------- */

type Scenario = {
  name: string;
  pathname: string;
  variant: Variant;
  /** 選中項的 label；null 代表全部未選中。 */
  activeLabel: string | null;
  order: readonly string[];
};

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'guest × inactive（/about：非底部列項）',
    pathname: '/about',
    variant: 'guest',
    activeLabel: null,
    order: GUEST_ORDER,
  },
  {
    name: 'guest × active（/learn：文章選中）',
    pathname: '/learn',
    variant: 'guest',
    activeLabel: '文章',
    order: GUEST_ORDER,
  },
  {
    name: 'member × inactive（/settings：非底部列項）',
    pathname: '/settings',
    variant: 'member',
    activeLabel: null,
    order: MEMBER_ORDER,
  },
  {
    name: 'member × active（/today：戰情選中）',
    pathname: '/today',
    variant: 'member',
    activeLabel: '戰情',
    order: MEMBER_ORDER,
  },
];

describe('BottomTabBar — DOM 逐字對齊實站（fixture 驅動）', () => {
  describe.each(SCENARIOS)('$name', ({ pathname, variant, activeLabel, order }) => {
    const stateOf = (label: string): TabState =>
      label === activeLabel ? 'active' : 'inactive';

    it('(1) nav.mobile-taskbar 內恰好 5 個 <a>', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        expect(tabbarLinks(container)).toHaveLength(5);
      } finally {
        cleanup(container, root);
      }
    });

    it('(2) 每個 <a> 的 href 逐字等於 fixture（含結尾斜線）', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        expect(links.map((a) => a.getAttribute('href'))).toEqual(
          order.map((label) => spec(variant, label, stateOf(label)).href),
        );
      } finally {
        cleanup(container, root);
      }
    });

    it('(3) 每個 pill <svg> 的 width/height 等於 fixture 的 iconWidth', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        links.forEach((a, i) => {
          const label = order[i];
          const expected = spec(variant, label, stateOf(label)).iconWidth;
          const svg = a.querySelector('svg');
          expect(svg?.getAttribute('width')).toBe(String(expected));
          expect(svg?.getAttribute('height')).toBe(String(expected));
        });
      } finally {
        cleanup(container, root);
      }
    });

    it('(4) pill 內 <path> 的 d 序列逐條等於 fixture（涵蓋籌碼的 3 條）', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        links.forEach((a, i) => {
          const label = order[i];
          const expected = spec(variant, label, stateOf(label)).paths;
          const svg = a.querySelector('svg');
          const ds = Array.from(svg?.querySelectorAll('path') ?? []).map((p) => p.getAttribute('d'));
          expect(ds).toEqual(expected);
        });
      } finally {
        cleanup(container, root);
      }
    });

    it('(5) caret 只出現在「會員態且選中」項，路徑等於 fixture.caret.path', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        links.forEach((a, i) => {
          const label = order[i];
          const shouldHaveCaret = variant === 'member' && label === activeLabel;
          const svgs = a.querySelectorAll('svg');
          if (shouldHaveCaret) {
            expect(svgs).toHaveLength(2);
            const caret = svgs[1];
            expect(caret.getAttribute('width')).toBe(String(TABBAR.caret.width));
            expect(caret.getAttribute('height')).toBe(String(TABBAR.caret.height));
            expect(caret.getAttribute('class')).toBe(TABBAR.caret.className);
            expect(caret.querySelector('path')?.getAttribute('d')).toBe(TABBAR.caret.path);
          } else {
            expect(svgs).toHaveLength(1);
          }
        });
      } finally {
        cleanup(container, root);
      }
    });

    it('(6) aria-haspopup 只在「會員態且選中」項存在；訪客態全部不存在', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        links.forEach((a, i) => {
          const label = order[i];
          const isActive = label === activeLabel;
          // aria-current 只掛在選中項（不分態）。
          if (isActive) {
            expect(a.getAttribute('aria-current')).toBe('page');
          } else {
            expect(a.getAttribute('aria-current')).toBeNull();
          }
          // aria-haspopup / aria-expanded 只在「會員態且選中」項。
          if (variant === 'member' && isActive) {
            expect(a.getAttribute('aria-haspopup')).toBe('dialog');
            expect(a.getAttribute('aria-expanded')).toBe('false');
          } else {
            expect(a.getAttribute('aria-haspopup')).toBeNull();
            expect(a.getAttribute('aria-expanded')).toBeNull();
          }
        });
      } finally {
        cleanup(container, root);
      }
    });

    it('(7) 主圖示 <svg> 沒有 aria-hidden；caret <svg> 有 aria-hidden', () => {
      const { container, root } = renderAt(pathname, <BottomTabBar />);
      try {
        const links = tabbarLinks(container);
        links.forEach((a, i) => {
          const label = order[i];
          const pillSvg = a.querySelector('svg');
          expect(pillSvg?.hasAttribute('aria-hidden')).toBe(false);
          const svgs = a.querySelectorAll('svg');
          if (variant === 'member' && label === activeLabel) {
            expect(svgs[1].getAttribute('aria-hidden')).toBe('true');
          }
        });
      } finally {
        cleanup(container, root);
      }
    });
  });
});
