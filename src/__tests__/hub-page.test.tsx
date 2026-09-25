/** @jest-environment jsdom */

/**
 * /hub/「全部工具」頁測試
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/hub.html（實站 /hub/ 逐字抓取）。
 *
 * 覆蓋：
 *   1. 頁首：h1「全部工具」+ 說明段（含 <b> 與全形逗號後的空白）。
 *   2. 我的捷徑空狀態：「我的捷徑（0/8）」+「還沒有捷徑。長按下面任何一張卡片就能加入。」
 *   3. 6 個分組標題（今天/股票/選股/我的/教學/更多）與 44 張卡的
 *      標題、副標、href 順序全數對齊實站（資料來源 src/lib/hubTools.ts）。
 *   4. 每張卡的結構：<a draggable=false> 帶 min-h-[5.4rem]、右上星星鈕
 *      aria-label="加入捷徑"、aria-pressed=false。
 *   5. 互動：點星星加入捷徑 → aria-pressed=true、計數變（1/8）、
 *      localStorage 寫入；再點一次移除。
 *   6. 捷徑上限 8：加入第 9 筆時只保留前 8 筆。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HubTools from '@/app/hub/HubTools';
import {
  HUB_SECTIONS,
  HUB_SHORTCUT_LIMIT,
  HUB_TOOLS,
} from '@/lib/hubTools';

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

/** 掛載 HubTools（跑完 effect）→ 回傳容器與 root。 */
function renderHub(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<HubTools />);
  });
  return { container, root };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('/hub/ 全部工具頁', () => {
  it('頁首：h1「全部工具」與說明段逐字對齊（含全形逗號後空白）', () => {
    const { container } = renderHub();
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('全部工具');

    const p = h1?.nextElementSibling as HTMLParagraphElement | null;
    expect(p?.className).toContain('text-[13px]');
    // 實站原文：<b>長按卡片（或按星星）加入捷徑</b>， 右上抽屜隨時叫得出來。
    expect(p?.textContent).toBe(
      '一頁看完全站功能。長按卡片（或按星星）加入捷徑， 右上抽屜隨時叫得出來。',
    );
    expect(p?.querySelector('b')?.className).toBe('text-ink');
  });

  it('我的捷徑空狀態：「我的捷徑（0/8）」與提示文案', () => {
    const { container } = renderHub();
    const section = container.querySelector('section');
    expect(section?.querySelector('p')?.textContent).toBe(`我的捷徑（0/${HUB_SHORTCUT_LIMIT}）`);
    const hint = section?.querySelectorAll('p')[1];
    expect(hint?.textContent).toBe('還沒有捷徑。長按下面任何一張卡片就能加入。');
  });

  it('6 個分組標題順序為 今天/股票/選股/我的/教學/更多', () => {
    const { container } = renderHub();
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(HUB_SECTIONS.map((s) => s.heading));
    expect(headings).toEqual(['今天', '股票', '選股', '我的', '教學', '更多']);
  });

  it('44 張工具卡的標題/副標/href/順序全數對齊實站', () => {
    const { container } = renderHub();
    const cards = Array.from(container.querySelectorAll('a[href]')).filter((a) =>
      a.className.includes('min-h-[5.4rem]'),
    );
    expect(cards).toHaveLength(HUB_TOOLS.length);
    expect(HUB_TOOLS.length).toBe(44);

    HUB_TOOLS.forEach((tool, i) => {
      const a = cards[i] as HTMLAnchorElement;
      expect(a.getAttribute('href')).toBe(tool.href);
      expect(a.getAttribute('draggable')).toBe('false');
      const spans = a.querySelectorAll('span');
      expect(spans[0]?.textContent).toBe(tool.title);
      expect(spans[1]?.textContent).toBe(tool.desc);
    });
  });

  it('每張卡帶 aria-label="加入捷徑" 的星星鈕，初始 aria-pressed=false', () => {
    const { container } = renderHub();
    const buttons = Array.from(
      container.querySelectorAll('button[aria-label="加入捷徑"]'),
    );
    expect(buttons).toHaveLength(HUB_TOOLS.length);
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      // 星星圖示 d 值為實站 Phosphor Star
      const path = btn.querySelector('path');
      expect(path?.getAttribute('d')).toMatch(/^M243,96a20\.33/);
    });
  });

  it('點星星加入捷徑：aria-pressed=true、計數 1/8、寫入 localStorage', () => {
    const { container } = renderHub();
    const first = container.querySelector('button[aria-label="加入捷徑"]') as HTMLButtonElement;

    act(() => {
      first.click();
    });

    expect(first.getAttribute('aria-pressed')).toBe('true');
    const section = container.querySelector('section');
    expect(section?.querySelector('p')?.textContent).toBe(`我的捷徑（1/${HUB_SHORTCUT_LIMIT}）`);

    const stored = JSON.parse(window.localStorage.getItem('bs-hub-shortcuts') ?? '[]');
    expect(stored).toEqual(['/today/']);
  });

  it('再點同一張卡移除捷徑，回到 0/8', () => {
    const { container } = renderHub();
    const first = container.querySelector('button[aria-label="加入捷徑"]') as HTMLButtonElement;
    act(() => {
      first.click();
    });
    act(() => {
      first.click();
    });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    const section = container.querySelector('section');
    expect(section?.querySelector('p')?.textContent).toBe(`我的捷徑（0/${HUB_SHORTCUT_LIMIT}）`);
    expect(window.localStorage.getItem('bs-hub-shortcuts')).toBe('[]');
  });

  it('捷徑上限 8：第 9 筆不會加入', () => {
    const { container, root } = renderHub();
    const buttons = Array.from(
      container.querySelectorAll('button[aria-label="加入捷徑"]'),
    ) as HTMLButtonElement[];
    for (let i = 0; i < HUB_SHORTCUT_LIMIT + 1; i += 1) {
      act(() => {
        buttons[i].click();
      });
    }
    const section = container.querySelector('section');
    expect(section?.querySelector('p')?.textContent).toBe(`我的捷徑（${HUB_SHORTCUT_LIMIT}/${HUB_SHORTCUT_LIMIT}）`);
    const stored = JSON.parse(window.localStorage.getItem('bs-hub-shortcuts') ?? '[]');
    expect(stored).toHaveLength(HUB_SHORTCUT_LIMIT);
    expect(stored).toEqual(HUB_TOOLS.slice(0, HUB_SHORTCUT_LIMIT).map((t) => t.href));

    act(() => {
      root.unmount();
    });
  });

  it('已儲存的捷徑在 mount 後還原（chip 呈現且星星為 pressed）', () => {
    window.localStorage.setItem('bs-hub-shortcuts', JSON.stringify(['/radar/', '/member/']));
    const { container } = renderHub();

    const section = container.querySelector('section');
    expect(section?.querySelector('p')?.textContent).toBe(`我的捷徑（2/${HUB_SHORTCUT_LIMIT}）`);
    // chip 內含連往已存捷徑的連結
    const chipLinks = Array.from(section?.querySelectorAll('a[href]') ?? []);
    expect(chipLinks.map((a) => a.getAttribute('href'))).toEqual(['/radar/', '/member/']);

    // 對應卡片的星星鈕為 pressed
    const cards = Array.from(container.querySelectorAll('a[href]')).filter((a) =>
      a.className.includes('min-h-[5.4rem]'),
    );
    const radarIdx = HUB_TOOLS.findIndex((t) => t.href === '/radar/');
    const radarBtn = cards[radarIdx]?.parentElement?.querySelector('button');
    expect(radarBtn?.getAttribute('aria-pressed')).toBe('true');
  });
});
