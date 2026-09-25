/** @jest-environment jsdom */

/**
 * /member/「大佬席位」頁測試
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/member.html（實站 /member/ 逐字抓取）。
 *
 * 覆蓋：
 *   1. 頁首：h1「大佬席位」+ 右上「設定」連結（aria-label、href=/settings/）。
 *   2. 社群聊天 banner：文案逐字（含全形逗號後的空白）與 href=/community/。
 *   3. 頁籤按鈕順序：我的檔案 → 通知設定 → 使用回饋 → 對帳單。
 *   4. 區塊標題順序：快捷功能 → 提醒管理 → 學習與社群。
 *   5. 三個導覽列表的列順序、標題、副標、href 全數對齊實站。
 *   6. 永遠渲染的靜態 panel：安裝股市大佬 App、研究條件通知、加到手機主畫面。
 *   7. 「資料日期與口徑」<details> 的 5 條文案。
 *   8. 未登入空狀態：「還沒登入」+ 說明文案 + /login/ 連結；且不渲染任何帳號資料 panel
 *      （我的推薦碼／帳號／綁定／Passkey／刪除帳號／記住偏好）。
 *   9. 已登入：帳號資料區呈現 role="status" 載入骨架與「正在整理你的會員資料…」，
 *      不造假資料；帳號 panel 出現、未登入空狀態消失。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MemberPage from '@/app/member/MemberPage';
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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 掛載 MemberPage（跑完 effect）→ 回傳容器。isLogged=false。 */
function renderGuest(): HTMLElement {
  return render(false);
}

/** 掛載 MemberPage；isLoggedIn 由 localStorage(warroom_token) 決定（mount 後才讀）。
 *  登入態必須在掛載「之前」就寫入 localStorage——useIsLoggedIn 的 effect 只在
 *  mount 時讀一次，掛載後再設不會觸發切換。 */
function render(loggedIn: boolean): HTMLElement {
  if (loggedIn) {
    window.localStorage.setItem(LOGIN_TOKEN_KEY, 'test-token');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<MemberPage />);
  });
  return container;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('/member/ 大佬席位頁', () => {
  it('頁首：h1「大佬席位」與「設定」連結（aria-label 與 href）', () => {
    const container = renderGuest();
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('大佬席位');
    expect(h1?.className).toBe('break-words text-2xl font-black md:text-3xl');

    const settings = container.querySelector('a[aria-label="設定"]');
    expect(settings?.getAttribute('href')).toBe('/settings/');
  });

  it('未登入：副標為登入引導文案（不生造「歡迎回來，某某」）', () => {
    const container = renderGuest();
    const sub = container.querySelector('h1 + p');
    expect(sub?.textContent).toBe('登入後查看你的帳戶、回饋與邀請碼。');
  });

  it('社群聊天 banner：文案逐字對齊（含全形逗號後的半形空白）與 href', () => {
    const container = renderGuest();
    const banner = container.querySelector('a[href="/community/"]');
    expect(banner).not.toBeNull();
    // 標題／副標為相鄰 block <span>，DOM textContent 不含間隔空白——與實站一致。
    const spans = Array.from(banner!.querySelectorAll('span')).map((s) => s.textContent);
    expect(spans).toContain('社群聊天');
    expect(spans).toContain('跟其他會員討論、看戰績榜。功能在這裡比較好找。');
    expect(banner!.textContent).toContain('進去 →');
  });

  it('頁籤按鈕順序：我的檔案 → 通知設定 → 使用回饋 → 對帳單', () => {
    const container = renderGuest();
    const chips = Array.from(container.querySelectorAll('button[type="button"]'))
      .filter((b) => b.closest('[data-member-profile]') === null)
      .map((b) => b.textContent);
    // 頁面上另有其他按鈕；頁籤是頁首那 4 個連續 button。
    const chipTexts = ['我的檔案', '通知設定', '使用回饋', '對帳單'];
    const joined = chips.join('|');
    expect(joined).toContain(chipTexts.join('|'));
  });

  it('區塊標題順序：快捷功能 → 提醒管理 → 學習與社群', () => {
    const container = renderGuest();
    const titles = Array.from(
      container.querySelectorAll('[data-member-profile] p[class*="tracking-wide"]'),
    ).map((p) => p.textContent);
    expect(titles).toEqual(['快捷功能', '提醒管理', '學習與社群']);
  });

  it('快捷功能四列：標題、副標、href 順序全數對齊實站', () => {
    const container = renderGuest();
    const section = Array.from(container.querySelectorAll('section')).find((s) =>
      s.textContent?.includes('快捷功能'),
    );
    expect(section).not.toBeNull();
    // 「自訂入口」連結到 /hub/
    expect(section!.querySelector('a[href="/hub/"]')?.textContent).toBe('自訂入口');
    const card = section!.querySelector('.overflow-hidden.rounded-2xl');
    expect(card).not.toBeNull();
    const rows = Array.from(card!.querySelectorAll('a')).map((a) => ({
      href: a.getAttribute('href'),
      title: a.querySelector('.font-black.text-ink')?.textContent,
      subtitle: a.querySelector('.break-words.text-muted')?.textContent,
    }));
    expect(rows).toEqual([
      { href: '/ask/', title: 'AI 對話', subtitle: '用講話查籌碼與大盤數字' },
      { href: '/notify/?inbox=1', title: '通知中心', subtitle: '推播全文與系統消息' },
      { href: '/watchlist/', title: '自選股', subtitle: '追蹤股票清單' },
      { href: '/portfolio/', title: '我的持股', subtitle: '成本、配置與大致損益' },
    ]);
  });

  it('提醒管理二列：標題、副標、href 對齊實站', () => {
    const container = renderGuest();
    const card = Array.from(container.querySelectorAll('p'))
      .find((p) => p.textContent === '提醒管理')
      ?.nextElementSibling;
    expect(card).not.toBeNull();
    const rows = Array.from(card!.querySelectorAll('a')).map((a) => ({
      href: a.getAttribute('href'),
      title: a.querySelector('.font-black.text-ink')?.textContent,
      subtitle: a.querySelector('.break-words.text-muted')?.textContent,
    }));
    expect(rows).toEqual([
      { href: '/alerts/', title: '我的警報', subtitle: '到價、量比與法人條件提醒' },
      { href: '/notify/', title: '推播主題與暫停提醒', subtitle: '要收什麼、安靜多久' },
    ]);
  });

  it('學習與社群二列：標題、副標、href 對齊實站', () => {
    const container = renderGuest();
    const card = Array.from(container.querySelectorAll('p'))
      .find((p) => p.textContent === '學習與社群')
      ?.nextElementSibling;
    expect(card).not.toBeNull();
    const rows = Array.from(card!.querySelectorAll('a')).map((a) => ({
      href: a.getAttribute('href'),
      title: a.querySelector('.font-black.text-ink')?.textContent,
      subtitle: a.querySelector('.break-words.text-muted')?.textContent,
    }));
    expect(rows).toEqual([
      { href: '/school/', title: '台股學堂', subtitle: '名詞白話與功能圖解' },
      { href: '/community/', title: '社群基地', subtitle: '討論、聊天與戰績榜' },
    ]);
  });

  it('靜態 panel：安裝股市大佬 App / 研究條件通知 / 加到手機主畫面 文案逐字對齊', () => {
    const container = renderGuest();
    const text = container.textContent ?? '';

    expect(text).toContain('安裝股市大佬 App');
    expect(text).toContain(
      'iPhone 用公開 TestFlight，不需要邀請碼。Android 是直裝測試檔， 下載不了就用「加入主畫面」，資料一模一樣。',
    );
    expect(container.querySelector('a[href="/app/"]')?.textContent).toBe('查看安裝方式');

    expect(text).toContain('研究條件通知');
    expect(text).toContain('尚未設定。通知研究條件，不是進出建議。');
    const researchPanel = Array.from(container.querySelectorAll('div')).find((d) => {
      const p = d.querySelector('p.font-black');
      return p?.textContent === '研究條件通知';
    });
    expect(researchPanel?.querySelector('a')?.getAttribute('href')).toBe('/alerts/');
    expect(researchPanel?.querySelector('a')?.textContent).toBe('打開');

    expect(text).toContain('加到手機主畫面');
    expect(text).toContain(
      '加完後可從桌面快速開站，但這仍是網站捷徑，不等同 App。 通知請使用股市大佬 App，並到「通知中心」選擇主題、允許手機通知。 iPhone 請用 Safari。',
    );
  });

  it('「資料日期與口徑」<details>：標題與 5 條文案逐字對齊', () => {
    const container = renderGuest();
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')?.textContent).toBe('資料日期與口徑');
    const lines = Array.from(details!.querySelectorAll('p')).map((p) => p.textContent);
    expect(lines).toEqual([
      '來源：本站行情管線（盤中）、交易所公開資料（盤後統計）',
      '時點：盤中為即時快照、法人／分點／資券為盤後',
      '標「估」的欄位是由已公布數字推算，不是交易所原欄。',
      '通知設定只存在會員帳號。',
      '以上是已發生的公開統計，不是進出建議。',
    ]);
  });

  it('未登入空狀態：「還沒登入」+ 引導文案 + /login/ 連結', () => {
    const container = renderGuest();
    const text = container.textContent ?? '';
    expect(text).toContain('還沒登入');
    expect(text).toContain('登入後查看你的帳戶、回饋、邀請碼與專屬設定。');
    const login = container.querySelector('a[href="/login/"]');
    expect(login).not.toBeNull();
    expect(login?.textContent).toBe('登入');
  });

  it('未登入：不渲染任何帳號資料 panel（不造假資料）', () => {
    const container = renderGuest();
    const text = container.textContent ?? '';
    expect(text).not.toContain('我的推薦碼');
    expect(text).not.toContain('刪除帳號');
    expect(text).not.toContain('記住偏好');
    expect(text).not.toContain('綁定 Apple／Google 登入');
    expect(text).not.toContain('Passkey 快速登入');
    expect(text).not.toContain('加入時間');
    expect(text).not.toContain('最後登入');
    // capture 的真實帳號資料一個都不能出現
    expect(text).not.toContain('lovepp222@gmail.com');
    expect(text).not.toContain('BS8LQ6QW');
  });

  it('已登入：帳號資料區呈現 role="status" 骨架與「正在整理…」，不造假資料', () => {
    const container = render(true);
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.querySelector('.animate-pulse')).not.toBeNull();
    expect(status?.textContent).toContain('正在整理你的會員資料…');

    const text = container.textContent ?? '';
    expect(text).not.toContain('還沒登入');
    // 帳號專屬 panel 出現
    expect(text).toContain('記住偏好（會排首頁格子）');
    expect(text).toContain('我的推薦碼');
    expect(text).toContain('綁定 Apple／Google 登入');
    expect(text).toContain('Passkey 快速登入（選用）');
    expect(text).toContain('刪除帳號');
    // 但仍不得出 capture 的真實帳號資料
    expect(text).not.toContain('lovepp222@gmail.com');
    expect(text).not.toContain('BS8LQ6QW');
    expect(text).not.toContain('新手任務 2 / 5');
  });

  it('已登入：「記住偏好」標籤全部為未選擇態（偏好存在會員帳號，無 API 來源）', () => {
    const container = render(true);
    const panel = Array.from(container.querySelectorAll('p'))
      .find((p) => p.textContent === '記住偏好（會排首頁格子）')
      ?.closest('.data-panel');
    expect(panel).not.toBeNull();
    const tags = Array.from(panel!.querySelectorAll('button')).map((b) => b.textContent);
    expect(tags).toEqual(['當沖', '隔日沖', '波段', '存股/長線', '都看', '還在摸索', 'AI 資料設定', '登出']);
    // 未選擇態統一為 border-line / text-muted（不含 accent）
    for (const b of Array.from(panel!.querySelectorAll('button'))) {
      expect(b.className).toContain('border-line');
      expect(b.className).not.toContain('bg-accent-soft');
    }
  });
});
