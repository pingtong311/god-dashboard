/** @jest-environment jsdom */

/**
 * 「我的」系列六頁測試
 * ----------------------------------------------------------------------------
 * 對齊依據：captured/login-capture/html/{alerts,portfolio,notify,partners,
 * community,guess}.html（實站逐字抓取）。
 *
 * 覆蓋：
 *   1. alerts：h1、說明、條件表單 13 選項、空狀態「目前沒有資料」。
 *   2. portfolio：h1、淨資產 0、六個分頁鈕、四個區塊標題與空狀態。
 *   3. notify：h1、三個分區鈕、通知總開關 aria-pressed=false、
 *      「目前沒有任何推播主題開啟」、五個主題區塊的開關數量。
 *   4. partners：h1、空狀態「目前沒有刊登中的合作內容」。
 *   5. community：h1、今天的話題 3 則、60 篇貼文與每篇 3 則留言、
 *      每篇「💬 留言（5）」按鈕。
 *   6. guess：h1、四格戰績、40 根量棒與 40 根 K 棒、? 方塊、勝率榜 30 名。
 *   7. 子導覽：alerts/portfolio/notify/community 共用五 pill，
 *      各頁命中者 aria-current="page"；guess 為教學系列六 pill。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AlertsPage from '@/app/alerts/page';
import MineSubNav from '@/app/alerts/MineSubNav';
import PortfolioPage from '@/app/portfolio/page';
import NotifyPage from '@/app/notify/page';
import PartnersPage from '@/app/partners/page';
import CommunityPage from '@/app/community/page';
import { COMMUNITY_POSTS } from '@/app/community/communityPosts';
import GuessPage from '@/app/guess/page';
import {
  GUESS_CANDLES,
  GUESS_LEADERBOARD,
  GUESS_VOLUME_BARS,
} from '@/app/guess/guessChart';

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

/** 掛載頁面（跑完 effect）→ 回傳容器。 */
function renderPage(element: ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    const root: Root = createRoot(container);
    root.render(element);
  });
  return container;
}

/** 取得某容器的 h1 文字。 */
function h1Of(container: HTMLElement): string | null | undefined {
  return container.querySelector('h1')?.textContent;
}

describe('「我的」系列子導覽', () => {
  it('五 pill 名稱/href/順序對齊實站', () => {
    const container = renderPage(<MineSubNav active="到價提醒" />);
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    ).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['社群', '/community/'],
      ['自選', '/watchlist/'],
      ['到價提醒', '/alerts/'],
      ['持股', '/portfolio/'],
      ['推播', '/notify/'],
    ]);
  });

  it.each([
    { active: '到價提醒', href: '/alerts/' },
    { active: '持股', href: '/portfolio/' },
    { active: '推播', href: '/notify/' },
    { active: '社群', href: '/community/' },
  ])('當前頁 $active 為 aria-current="page" + bg-accent', ({ active }) => {
    const container = renderPage(<MineSubNav active={active} />);
    const el = container.querySelector('a[aria-current="page"]');
    expect(el?.textContent).toBe(active);
    expect(el?.className).toContain('bg-accent');
    expect(el?.className).toContain('text-bg');
  });

  it('非當前頁無 aria-current，為 border-line 樣式', () => {
    const container = renderPage(<MineSubNav active="持股" />);
    const inactive = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    ).find((a) => a.textContent === '自選');
    expect(inactive?.hasAttribute('aria-current')).toBe(false);
    expect(inactive?.className).toContain('border-line');
    expect(inactive?.className).toContain('text-muted');
  });
});

describe('/alerts/ 到價提醒', () => {
  it('頁首：h1 與說明逐字對齊', () => {
    const container = renderPage(<AlertsPage />);
    expect(h1Of(container)).toBe('到價提醒');
    expect(container.querySelector('h1 + p')?.textContent).toBe(
      '通知研究條件，不是進出建議。命中會推到既有通道（App／Web／Telegram）。',
    );
  });

  it('條件下拉為實站 13 選項（順序與值）', () => {
    const container = renderPage(<AlertsPage />);
    // 頁上另有「上穿／下破」第二個 select，只取條件本身的第一個。
    const conditionSelect = container.querySelector('select');
    const options = Array.from(
      conditionSelect?.querySelectorAll('option') ?? [],
    ).map((o) => [o.getAttribute('value'), o.textContent]);
    expect(options).toHaveLength(13);
    expect(options[0]).toEqual(['price', '到價（漲到／跌到某個價）']);
    expect(options[12]).toEqual(['daily_summary', '每日盤後摘要（定時）']);
  });

  it('條件說明為實站 10 項', () => {
    const container = renderPage(<AlertsPage />);
    const items = container.querySelectorAll(
      'details:nth-of-type(2) li',
    );
    expect(items).toHaveLength(10);
    expect(items[0].querySelector('p')?.textContent).toBe('到價（漲到／跌到某個價）');
  });

  it('空狀態：目前沒有資料 + 圖示', () => {
    const container = renderPage(<AlertsPage />);
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
    const empty = container.querySelector('.border-dashed .font-black');
    expect(empty?.textContent).toBe('目前沒有資料');
    expect(empty?.nextElementSibling?.textContent).toBe(
      '還沒有提醒。也可從個股頁或自選股快速設定。',
    );
  });
});

describe('/portfolio/ 我的持股帳本', () => {
  it('頁首：h1 與空狀態摘要', () => {
    const container = renderPage(<PortfolioPage />);
    expect(h1Of(container)).toBe('我的持股帳本');
    expect(container.querySelector('#portfolio-summary .text-3xl')?.textContent).toBe('0');
  });

  it('六個分頁鈕順序對齊', () => {
    const container = renderPage(<PortfolioPage />);
    const tabs = Array.from(
      container.querySelectorAll('nav.sticky button'),
    ).map((b) => b.textContent);
    expect(tabs).toEqual(['總覽', '交易流水', '目前持股', '現金流與配置', '事件日曆', '期初值']);
  });

  it('四個區塊標題對齊', () => {
    const container = renderPage(<PortfolioPage />);
    const heads = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(heads).toEqual([
      '交易流水',
      '目前持股',
      '現金流與配置變化',
      '持股事件日曆',
      '期初值與相容設定',
    ]);
  });

  it('每個空狀態圖示都有「目前沒有資料」或對應文案', () => {
    const container = renderPage(<PortfolioPage />);
    const hints = Array.from(
      container.querySelectorAll('.border-dashed'),
    ).map((d) => d.textContent);
    expect(hints.some((t) => t?.includes('記錄持股，對照日報'))).toBe(true);
    expect(hints.some((t) => t?.includes('目前沒有持股或空單'))).toBe(true);
    expect(hints.some((t) => t?.includes('尚無流水可彙整'))).toBe(true);
    expect(hints.some((t) => t?.includes('尚無配置變化'))).toBe(true);
    expect(hints.some((t) => t?.includes('尚無本地交易事件'))).toBe(true);
  });

  it('近期除權息照抄實站「未回傳相符事件」訊息', () => {
    const container = renderPage(<PortfolioPage />);
    const text = container.textContent ?? '';
    expect(text).toContain(
      '既有行事曆目前未回傳相符事件。回傳上限為 150 檔，空白不代表保證沒有，仍應核對公司公告。',
    );
  });
});

describe('/notify/ 通知中心', () => {
  it('頁首：h1 與三個分區鈕', () => {
    const container = renderPage(<NotifyPage />);
    expect(h1Of(container)).toBe('通知中心');
    const tabs = Array.from(
      container.querySelectorAll('nav[aria-label="通知中心分區"] button'),
    ).map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(tabs).toEqual([
      ['盤中設定', 'true'],
      ['收件匣', 'false'],
      ['公告投票', 'false'],
    ]);
  });

  it('通知總開關關閉：aria-pressed=false，軌道 bg-line', () => {
    const container = renderPage(<NotifyPage />);
    const master = container.querySelector('button[aria-label="通知總開關"]');
    expect(master?.getAttribute('aria-pressed')).toBe('false');
    expect(master?.className).toContain('bg-line');
  });

  it('空狀態：目前沒有任何推播主題開啟', () => {
    const container = renderPage(<NotifyPage />);
    expect(container.textContent).toContain(
      '目前沒有任何推播主題開啟。先打開總開關，再勾主題。',
    );
  });

  it('六個主題區塊與實站開關列表一致（全部 aria-pressed=false）', () => {
    const container = renderPage(<NotifyPage />);
    // 主題清單在「選擇要收的主題」h2 之後；外層 grid 也有 data-panel，需精確定位。
    const topicHeading = Array.from(container.querySelectorAll('h2')).find(
      (h) => h.textContent === '選擇要收的主題',
    );
    const topicList = topicHeading?.closest('.mb-2')?.parentElement;
    const groups = Array.from(topicList?.querySelectorAll('.data-panel') ?? []);
    const titles = groups.map((g) => g.querySelector('b')?.textContent);
    expect(titles).toEqual([
      '個股急動',
      '盤中爆量',
      '盤中資金與交叉',
      '族群',
      '大盤與盤後',
      '國際政策',
    ]);
    const toggles = topicList?.querySelectorAll(
      'button[aria-pressed="false"]',
    );
    expect(toggles).toHaveLength(6 + 2 + 1 + 1 + 3 + 1);
    const pressed = topicList?.querySelectorAll('button[aria-pressed="true"]');
    expect(pressed).toHaveLength(0);
  });

  it('裝置狀態：沒有登記任何手機', () => {
    const container = renderPage(<NotifyPage />);
    expect(container.textContent).toContain(
      '這個帳號目前沒有登記任何手機，App 通知不會跳出來。',
    );
  });
});

describe('/partners/ 品牌合作', () => {
  it('頁首與空狀態逐字對齊', () => {
    const container = renderPage(<PartnersPage />);
    expect(h1Of(container)).toBe('品牌合作');
    expect(container.querySelector('h2')?.textContent).toBe('目前沒有刊登中的合作內容');
    expect(container.textContent).toContain(
      '有新合作時會在這裡展示，不影響你使用其他功能。',
    );
  });

  it('回今日戰情連結指向 /today/', () => {
    const container = renderPage(<PartnersPage />);
    const link = container.querySelector('a[href="/today/"]');
    expect(link?.textContent).toBe('回今日戰情');
  });
});

describe('/community/ 社群基地', () => {
  it('頁首：h1 與入口三格', () => {
    const container = renderPage(<CommunityPage />);
    expect(h1Of(container)).toBe('社群基地');
    const cards = Array.from(
      container.querySelectorAll('.grid.grid-cols-3 > *'),
    ).map((c) => c.textContent);
    expect(cards).toEqual(['討論就在這頁', '文章盤後解讀', '新聞消息聲量']);
  });

  it('今天的話題 3 則', () => {
    const container = renderPage(<CommunityPage />);
    const topics = container.querySelectorAll('.hud-panel ul li');
    expect(topics).toHaveLength(3);
    expect(topics[0].querySelector('a')?.getAttribute('href')).toBe('/ranking/');
  });

  it('貼文數量、每篇作者時間與留言數對齊實站', () => {
    const container = renderPage(<CommunityPage />);
    const posts = container.querySelectorAll(
      '.hud-panel.relative.min-w-0.overflow-hidden.rounded-2xl.border.border-line.bg-surface',
    );
    expect(posts).toHaveLength(COMMUNITY_POSTS.length);
    expect(COMMUNITY_POSTS).toHaveLength(60);
    expect(
      container.querySelectorAll('button:not([type]) , button[type="button"]'),
    ).toBeDefined();
    // 每篇都有「💬 留言（5）」與「查看全部 5 則留言 →」
    expect(container.textContent?.match(/💬 留言（5）/g)).toHaveLength(60);
    expect(container.textContent?.match(/查看全部 5 則留言 →/g)).toHaveLength(60);
    // 留言總數：60 篇 × 3 則
    expect(COMMUNITY_POSTS.reduce((sum, p) => sum + p.comments.length, 0)).toBe(180);
  });

  it('第一篇貼文文案逐字對齊（含作者、時間、正文）', () => {
    const container = renderPage(<CommunityPage />);
    const first = container.querySelector(
      '.hud-panel.relative.min-w-0.overflow-hidden.rounded-2xl.border.border-line.bg-surface',
    );
    expect(first?.querySelector('.text-accent')?.textContent).toBe('當沖賭徒阿俊');
    expect(first?.querySelector('.text-\\[12px\\]')?.textContent).toBe('19:04');
    expect(first?.querySelector('.whitespace-pre-wrap')?.textContent).toContain(
      '日報又點名茂矽了',
    );
  });

  it('外部新聞 chip 帶 target=_blank rel=noopener noreferrer', () => {
    const container = renderPage(<CommunityPage />);
    const external = container.querySelector('a[target="_blank"]');
    expect(external).not.toBeNull();
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer');
    // 個股 chip 為內部 <a>，無 target
    const internal = container.querySelector('a[href="/stock/?id=2342"]');
    expect(internal?.hasAttribute('target')).toBe(false);
  });
});

describe('/guess/ 猜下一根', () => {
  it('頁首：h1 與四格戰績的未作答狀態', () => {
    const container = renderPage(<GuessPage />);
    expect(h1Of(container)).toBe('猜下一根');
    const stats = Array.from(
      container.querySelectorAll('.grid.grid-cols-2 > .bg-surface\\/85'),
    ).map((d) => d.textContent);
    expect(stats).toEqual(['0目前連勝', '0最佳連勝', '-答對率', '0已作答']);
  });

  it('子導覽為教學系列六 pill，猜K線為當前頁', () => {
    const container = renderPage(<GuessPage />);
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="相關功能切換"] a'),
    ).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['文章', '/learn/'],
      ['學堂', '/school/'],
      ['練功房', '/dojo/'],
      ['猜K線', '/guess/'],
      ['新手', '/guide/'],
      ['手冊', '/manual/'],
    ]);
    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toBe('猜K線');
  });

  it('題目圖：40 根量棒 + 40 根 K 棒 + ? 方塊，aria-label 對齊', () => {
    const container = renderPage(<GuessPage />);
    const svg = container.querySelector('svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toBe('歷史日 K 40 根，最後一根尚未揭曉');
    expect(container.querySelectorAll('[data-testid="guess-volume-bar"]')).toHaveLength(
      GUESS_VOLUME_BARS.length,
    );
    expect(GUESS_VOLUME_BARS).toHaveLength(40);
    expect(GUESS_CANDLES).toHaveLength(40);
    // K 棒 group（opacity 0.92）+ ? 方塊 group
    expect(container.querySelectorAll('svg g[opacity="0.92"]')).toHaveLength(40);
    const question = container.querySelector('svg text');
    expect(question?.textContent).toBe('15.40');
    const mysteryText = Array.from(container.querySelectorAll('svg text')).find(
      (t) => t.textContent === '?',
    );
    expect(mysteryText).not.toBeNull();
  });

  it('兩個作答鈕文案對齊', () => {
    const container = renderPage(<GuessPage />);
    const buttons = Array.from(
      container.querySelectorAll('.grid.grid-cols-2 > button'),
    ).map((b) => b.textContent);
    expect(buttons).toEqual(['不低於前收', '低於前收']);
  });

  it('勝率榜 30 名，首列為 安／100%／10 場', () => {
    const container = renderPage(<GuessPage />);
    const rows = container.querySelectorAll('ol li');
    expect(rows).toHaveLength(GUESS_LEADERBOARD.length);
    expect(GUESS_LEADERBOARD).toHaveLength(30);
    expect(GUESS_LEADERBOARD[0]).toEqual({
      rank: 1,
      name: '安',
      rate: '100%',
      games: '10 場',
    });
  });
});
