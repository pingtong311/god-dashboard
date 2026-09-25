/** @jest-environment jsdom */

/**
 * 會員態桌面下拉選單測試（Navigation.tsx 的 6 組下拉）
 * ----------------------------------------------------------------------------
 * 覆蓋：
 *   1. 登入態渲染 6 個下拉鈕（今天 / 股票 / 選股 / 我的 / 教學 / 更多）。
 *   2. 點「今天」開啟面板：9 個 menuitem、副標、第一個標題與路由正確。
 *   3. 點「更多」面板只有 1 項。
 *   4. Escape 關閉面板，焦點回到下拉鈕。
 *   5. 再點一次按鈕關閉（開合切換），背景遮罩隨之出現／消失。
 *   6. 面板開啟時按鈕的 aria-expanded / aria-controls 正確。
 *
 * 註：本專案 `@testing-library/dom` 是壞掉的 symlink，故沿用
 * learn-pages.test.tsx 的模式：createRoot + act 做真實 DOM 互動。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Navigation, { MEMBER_MENUS } from '@/components/Navigation';

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
  usePathname: () => '/app/',
  useRouter: () => ({ back: () => {} }),
}));

jest.mock('@/lib/authState', () => ({
  LOGIN_TOKEN_KEY: 'warroom_token',
  readIsLoggedIn: () => true,
  useIsLoggedIn: () => true,
}));

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* -------------------------------------------------------------------------- */
/* 工具                                                                       */
/* -------------------------------------------------------------------------- */

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<Navigation />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

/** 依按鈕文字找下拉鈕。 */
function findBtn(label: string): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!btn) throw new Error(`找不到下拉鈕：${label}`);
  return btn;
}

/** 目前開啟的下拉面板（無則 null）。 */
function openPanel(): HTMLElement | null {
  return host.querySelector('[role="menu"]');
}

/** 在面板上觸發鍵盤事件。 */
function panelKeyDown(panel: HTMLElement, key: string) {
  act(() => {
    panel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/* -------------------------------------------------------------------------- */
/* 測試                                                                       */
/* -------------------------------------------------------------------------- */

test('登入態渲染 6 個下拉鈕', () => {
  for (const menu of MEMBER_MENUS) {
    expect(findBtn(menu.label)).toBeTruthy();
  }
});

test('MEMBER_MENUS 各組項目數與規格一致', () => {
  expect(MEMBER_MENUS.map((m) => m.items.length)).toEqual([9, 6, 13, 9, 7, 1]);
});

test('點「今天」開啟面板：9 個 menuitem、副標與第一項正確', () => {
  const btn = findBtn('今天');
  expect(btn.getAttribute('aria-expanded')).toBe('false');

  act(() => {
    btn.click();
  });

  const panel = openPanel();
  expect(panel).not.toBeNull();
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  expect(btn.getAttribute('aria-controls')).toBe('member-menu-0');
  expect(panel?.id).toBe('member-menu-0');

  const items = panel!.querySelectorAll('a[role="menuitem"]');
  expect(items.length).toBe(9);
  expect((items[0] as HTMLAnchorElement).textContent).toContain('今日戰情');
  expect((items[0] as HTMLAnchorElement).href).toContain('/warroom/');
  expect((panel!.textContent ?? '')).toContain('今天盤怎麼走、日報、大環境');
});

test('點「更多」面板只有 1 項（法遵與風險）', () => {
  const btn = findBtn('更多');
  act(() => {
    btn.click();
  });
  const panel = openPanel();
  const items = panel!.querySelectorAll('a[role="menuitem"]');
  expect(items.length).toBe(1);
  expect((items[0] as HTMLAnchorElement).textContent).toContain('法遵與風險');
});

test('Escape 關閉面板且焦點回到下拉鈕', () => {
  const btn = findBtn('股票');
  act(() => {
    btn.click();
  });
  expect(openPanel()).not.toBeNull();

  panelKeyDown(openPanel()!, 'Escape');
  expect(openPanel()).toBeNull();
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(btn);
});

test('再點一次按鈕關閉面板；開啟時有背景遮罩', () => {
  const btn = findBtn('教學');
  act(() => {
    btn.click();
  });
  expect(openPanel()).not.toBeNull();
  // 背景遮罩存在（點擊可關閉）。
  const backdrop = host.querySelector('[aria-hidden="true"]');
  expect(backdrop).not.toBeNull();

  act(() => {
    btn.click();
  });
  expect(openPanel()).toBeNull();
});

test('面板內的項目可透過方向鍵移動焦點', () => {
  const btn = findBtn('選股');
  act(() => {
    btn.click();
  });
  const panel = openPanel()!;
  const links = panel.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]');
  expect(links.length).toBe(13);

  // 先聚焦第一項，再按 ArrowDown 到第二項。
  act(() => {
    links[0].focus();
  });
  panelKeyDown(panel, 'ArrowDown');
  expect(document.activeElement).toBe(links[1]);

  panelKeyDown(panel, 'End');
  expect(document.activeElement).toBe(links[12]);
});

test('href="#" 的佔位項點擊時不導航', () => {
  const btn = findBtn('今天');
  act(() => {
    btn.click();
  });
  const panel = openPanel()!;
  const placeholder = Array.from(
    panel.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'),
  ).find((a) => a.getAttribute('href') === '#');
  expect(placeholder).toBeTruthy();

  const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    placeholder!.dispatchEvent(clickEvent);
  });
  // React 在 root 監聽器呼叫 preventDefault，事件冒泡完後即可檢查。
  expect(clickEvent.defaultPrevented).toBe(true);
});
