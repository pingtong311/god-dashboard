/** @jest-environment jsdom */

/**
 * /login 測試登入流程（admin / 1234）
 * ----------------------------------------------------------------------------
 * 覆蓋：
 *   (a) 正確帳密 → 寫入 localStorage 的 warroom_token（固定測試 token）並導向 /today/
 *   (b) 錯誤帳密 → 顯示錯誤訊息、不寫入 token、不導向（且不洩漏正確帳密）
 *   (c) SSR 首屏不含已登入內容（不讀 localStorage，登入態與否輸出相同）
 *
 * 註：本專案的 `@testing-library/dom` 是壞掉的 symlink（`@testing-library/react`
 * 因此沒有任何 export），故不使用 testing-library；改採 repo 既有做法（見
 * school-page.test.tsx / bottom-tabbar-dom.test.tsx）：
 *   - `react-dom/server` 的 renderToStaticMarkup 做 SSR 快照驗證
 *   - `react-dom/client` 的 createRoot + `react` 的 act 做真實 DOM 互動驗證
 *   - `next/navigation` 的 useRouter 以可控 mock 取代，藉此捕捉 push 呼叫
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useRouter } from 'next/navigation';
import LoginPage from '@/app/login/page';
import { LOGIN_TOKEN_KEY } from '@/lib/authState';
import {
  LOGIN_REDIRECT_PATH,
  TEST_LOGIN_TOKEN,
  TEST_PASSWORD,
  TEST_USERNAME,
  verifyCredentials,
} from '@/app/login/loginFlow';

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as unknown as jest.Mock;

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let push: jest.Mock;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.removeItem(LOGIN_TOKEN_KEY);
  push = jest.fn();
  mockUseRouter.mockReturnValue({
    push,
    back: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  });
});

/** 真實 DOM 掛載整個 /login 頁面（含 StaticPage hero + LoginForm）。 */
function mount(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<LoginPage />);
  });
}

/** 卸載並移除容器。 */
function unmount(): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/** 模擬在受控 <input> 輸入（繞過 React value tracker）。 */
function typeInto(name: string, value: string): void {
  const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`找不到 input[name="${name}"]`);
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) {
    throw new Error('no input value setter');
  }
  setter.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 觸發表單送出。 */
function submitForm(): void {
  const form = container.querySelector('form') as HTMLFormElement | null;
  if (!form) {
    throw new Error('找不到 <form>');
  }
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

/* -------------------------------------------------------------------------- */
/* 0. 純邏輯                                                                  */
/* -------------------------------------------------------------------------- */

describe('/login — verifyCredentials（純函式）', () => {
  it('admin / 1234 通過；其他組合一律不通過', () => {
    expect(verifyCredentials('admin', '1234')).toBe(true);
    expect(verifyCredentials('admin', '0000')).toBe(false);
    expect(verifyCredentials('user', '1234')).toBe(false);
    expect(verifyCredentials('', '')).toBe(false);
    // 帳號去頭尾空白後仍可通過
    expect(verifyCredentials('  admin  ', '1234')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 1. 表單互動（真實 DOM）                                                     */
/* -------------------------------------------------------------------------- */

describe('/login — 表單互動', () => {
  it('(a) 正確帳密 → 寫入 warroom_token 並導向 /today/', () => {
    mount();
    try {
      typeInto('username', TEST_USERNAME);
      typeInto('password', TEST_PASSWORD);
      submitForm();

      expect(window.localStorage.getItem(LOGIN_TOKEN_KEY)).toBe(TEST_LOGIN_TOKEN);
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith(LOGIN_REDIRECT_PATH);
    } finally {
      unmount();
    }
  });

  it('(b) 錯誤帳密 → 顯示錯誤、不寫入 token、不導向', () => {
    mount();
    try {
      typeInto('username', 'admin');
      typeInto('password', 'wrong-password');
      submitForm();

      expect(window.localStorage.getItem(LOGIN_TOKEN_KEY)).toBeNull();
      expect(push).not.toHaveBeenCalled();

      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('帳號或密碼');
      // 不洩漏正確帳密
      expect(alert?.textContent).not.toContain(TEST_PASSWORD);
    } finally {
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. SSR 首屏（hydration 安全）                                              */
/* -------------------------------------------------------------------------- */

describe('/login — SSR 首屏', () => {
  it('(c) 是否已登入輸出相同，且不含任何已登入內容（SSR 不讀 localStorage）', () => {
    window.localStorage.setItem(LOGIN_TOKEN_KEY, 'some-existing-token');
    const withToken = renderToStaticMarkup(<LoginPage />);
    window.localStorage.removeItem(LOGIN_TOKEN_KEY);
    const withoutToken = renderToStaticMarkup(<LoginPage />);

    // SSR 完全不看 localStorage → 兩種狀態輸出逐字相同。
    expect(withToken).toBe(withoutToken);

    // 保留博主 hero（logo + h1 + 金色副標）。
    expect(withToken).toContain('股市大佬');
    expect(withToken).toContain('TRADEBOSS');

    // 表單隨 SSR 一併輸出（不依賴 effect）。
    expect(withToken).toContain('帳號');
    expect(withToken).toContain('密碼');
    expect(withToken).toContain('登入');

    // 不含任何會員態外殼標記。
    expect(withToken).not.toContain('手機主要導覽');
    expect(withToken).not.toContain('手機導覽（未登入）');
  });
});
