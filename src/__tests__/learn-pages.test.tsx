/** @jest-environment jsdom */

/**
 * 教學專欄頁面測試（/learn 索引 + /learn/[slug] 文章）
 * ----------------------------------------------------------------------------
 * 覆蓋：
 *   1. resolveLearnHref：/learn 站內路由轉換、#anchor 不轉換、其餘走 legacyRoutes。
 *   2. 索引頁資料層：列出全部 416 篇、分類計數正確、recap 自成一群。
 *   3. 索引頁 SSR：渲染 416 張卡片、連結為 /learn/<slug>（無尾斜線）。
 *   4. 搜尋命中數與資料一致（純函式 + 真實 DOM）。
 *   5. 分類篩選只留該分類（純函式 + 真實 DOM）。
 *   6. /learn/[slug] 對 3 篇不同 category 的文章渲染出正確 h1 與章節數。
 *   7. faq / table / figure 三種 block 都有正確輸出。
 *   8. 目錄 #anchor 未被轉換；內文站內連結已轉換。
 *   9. generateStaticParams 產生 416 條路徑。
 *
 * 註：本專案的 `@testing-library/dom` 是壞掉的 symlink（`@testing-library/react`
 * 因此沒有任何 export），故不使用 testing-library；改以
 *   - `react-dom/server` 的 renderToStaticMarkup 做結構驗證
 *   - `react-dom/client` 的 createRoot + `react` 的 act 做真實 DOM 互動驗證
 *   - 直接呼叫純函式（resolveLearnHref / getLearnGroups / filterLearnGroups）驗證語意
 * next/link 需要 router context，測試以純 <a> 替代（href 不變）。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import LearnIndex from '@/app/learn/LearnIndex';
import LearnArticle from '@/components/LearnArticle';
import {
  getAllLearnSlugs,
  getLearnArticle,
  getLearnIndexItems,
  getLearnTotal,
} from '@/lib/learnArticles';
import {
  countLearnItems,
  filterLearnGroups,
  getLearnGroups,
  LEARN_ALL_KEY,
  matchesLearnQuery,
  RECAP_KEY,
  resolveLearnHref,
} from '@/lib/learn';
import { generateStaticParams } from '@/app/learn/[slug]/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) =>
    (require('react') as typeof import('react')).createElement(
      'a',
      { href: typeof href === 'string' ? href : String(href), ...rest },
      children,
    ),
}));

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = getLearnIndexItems();
const groups = getLearnGroups(items);

/* -------------------------------------------------------------------------- */
/* 工具                                                                       */
/* -------------------------------------------------------------------------- */

/** SSR 靜態渲染一篇 /learn/[slug] 文章 → 可查詢的 DOM 容器（不執行 effect）。 */
function staticArticle(slug: string): {
  dom: HTMLElement;
  article: NonNullable<ReturnType<typeof getLearnArticle>>;
} {
  const article = getLearnArticle(slug);
  if (!article) throw new Error(`missing article: ${slug}`);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<LearnArticle article={article} />);
  return { dom: host, article };
}

/** SSR 靜態渲染索引頁 → 可查詢的 DOM 容器。 */
function staticIndex(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<LearnIndex items={items} />);
  return host;
}

/** 真實 DOM 掛載索引頁（可互動）。 */
let liveContainer: HTMLDivElement;
let liveRoot: Root;

function mountIndex(): HTMLElement {
  liveContainer = document.createElement('div');
  document.body.appendChild(liveContainer);
  act(() => {
    liveRoot = createRoot(liveContainer);
    liveRoot.render(<LearnIndex items={items} />);
  });
  return liveContainer;
}

function unmount(): void {
  act(() => {
    liveRoot.unmount();
  });
  liveContainer.remove();
}

/** 索引頁卡片（`data-testid="learn-card"`）。 */
const cards = (root: ParentNode): Element[] =>
  Array.from(root.querySelectorAll('[data-testid="learn-card"]'));

/** 模擬在受控搜尋框輸入（繞過 React value tracker）。 */
function typeSearch(value: string): void {
  const input = liveContainer.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('no input value setter');
  setter.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 依文字找出分類 tab 並點擊。 */
function clickTab(match: (text: string) => boolean): HTMLButtonElement {
  const btn = Array.from(liveContainer.querySelectorAll('[role="tab"]')).find((b) =>
    match(b.textContent ?? '')
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error('tab not found');
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return btn;
}

/* -------------------------------------------------------------------------- */
/* 1. resolveLearnHref                                                        */
/* -------------------------------------------------------------------------- */

describe('resolveLearnHref：站內轉換 / #anchor / 外部連結', () => {
  it('/learn 路由轉為峰子路由（去尾斜線）', () => {
    expect(resolveLearnHref('/learn/how-to-use-stock-orderbook/')).toBe(
      '/learn/how-to-use-stock-orderbook'
    );
    expect(resolveLearnHref('/learn/')).toBe('/learn');
    expect(resolveLearnHref('/learn')).toBe('/learn');
    expect(resolveLearnHref('/learn/?c=platform')).toBe('/learn?c=platform');
  });

  it('頁內錨點（#）一律不轉換', () => {
    expect(resolveLearnHref('#sec-1')).toBe('#sec-1');
    expect(resolveLearnHref('#toc')).toBe('#toc');
  });

  it('其餘博主路由走 resolveLegacyHref', () => {
    expect(resolveLearnHref('/school/')).toBe('/school');
    expect(resolveLearnHref('/today/')).toBe('/today');
    expect(resolveLearnHref('/stock/?id=2330')).toBe('/s/2330');
  });

  it('外部連結原樣保留', () => {
    const external = ['https://apps.apple.com/tw/app/id1', 'mailto:a@b.com', '//cdn.x/y.png'];
    external.forEach((href) => expect(resolveLearnHref(href)).toBe(href));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 索引頁資料層                                                            */
/* -------------------------------------------------------------------------- */

describe('索引頁資料層：416 篇、分類計數正確、recap 自成一群', () => {
  it('416 篇、11 個主題分類 + 1 個 recap 群，總和為 416', () => {
    expect(getLearnTotal()).toBe(416);
    expect(items).toHaveLength(416);
    expect(groups.filter((g) => g.kind === 'recap')).toHaveLength(1);
    expect(groups.filter((g) => g.kind === 'topic')).toHaveLength(11);
    expect(countLearnItems(groups)).toBe(416);
    // recap 群置於最前
    expect(groups[0].key).toBe(RECAP_KEY);
  });

  it('recap 群 24 篇、platform 32 篇、tech 44 篇（與資料一致）', () => {
    expect(groups.find((g) => g.key === RECAP_KEY)?.items).toHaveLength(24);
    expect(groups.find((g) => g.key === 'platform')?.items).toHaveLength(32);
    expect(groups.find((g) => g.key === 'tech')?.items).toHaveLength(44);
  });

  it('recap 不混進任何主題分類', () => {
    const topicGroups = groups.filter((g) => g.kind === 'topic');
    expect(topicGroups.some((g) => g.items.some((i) => i.kind === 'recap'))).toBe(false);
  });

  it('getLearnIndexItems 只帶輕量欄位（無 intro / sections / figures）', () => {
    const first = items[0] as unknown as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(
      ['category', 'categoryKey', 'kind', 'readMinutes', 'slug', 'title'].sort()
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 索引頁 SSR 結構                                                         */
/* -------------------------------------------------------------------------- */

describe('索引頁（SSR）：列出 416 篇、卡片連結正確', () => {
  it('渲染 416 張卡片、12 個分類群（1 recap + 11 主題）', () => {
    const dom = staticIndex();
    expect(cards(dom)).toHaveLength(416);
    expect(dom.querySelectorAll('section')).toHaveLength(12);
  });

  it('卡片連結為 /learn/<slug>（無尾斜線）', () => {
    const dom = staticIndex();
    const hrefs = cards(dom).map((c) => c.getAttribute('href') ?? '');
    expect(hrefs).toHaveLength(416);
    expect(hrefs.every((h) => /^\/learn\/[^/]+$/.test(h))).toBe(true);
    expect(hrefs).toContain('/learn/how-to-use-stock-orderbook');
  });

  it('每張卡片都顯示分類名稱，且有閱讀時間者顯示「閱讀約 N 分鐘」', () => {
    const dom = staticIndex();
    const withRead = items.filter((i) => i.readMinutes !== null).length;
    expect(withRead).toBeGreaterThan(0);
    // 卡片總數 = 416，閱讀時間出現次數 = 有值篇數
    const readLabels = cards(dom).filter((c) => /閱讀約 \d+ 分鐘/.test(c.textContent ?? ''));
    expect(readLabels).toHaveLength(withRead);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. 搜尋                                                                    */
/* -------------------------------------------------------------------------- */

describe('索引頁：搜尋', () => {
  it('matchesLearnQuery 比對 title / slug / category', () => {
    const item = items.find((i) => i.slug === 'how-to-use-stock-orderbook');
    expect(item).toBeDefined();
    expect(matchesLearnQuery(item!, '')).toBe(true);
    expect(matchesLearnQuery(item!, 'orderbook')).toBe(true); // slug 命中
    expect(matchesLearnQuery(item!, '平台')).toBe(true); // 分類命中
    expect(matchesLearnQuery(item!, 'zzz不存在zzz')).toBe(false);
  });

  it('filterLearnGroups：搜尋 "ETF" 命中 6 篇，與資料一致', () => {
    const expected = items.filter((i) => matchesLearnQuery(i, 'etf')).length;
    expect(expected).toBe(6);
    const visible = filterLearnGroups(groups, LEARN_ALL_KEY, 'ETF');
    expect(countLearnItems(visible)).toBe(6);
    // 每個留下的分組都非空
    for (const g of visible) expect(g.items.length).toBeGreaterThan(0);
  });

  it('真實 DOM：輸入 "ETF" 後結果行與卡片數正確', () => {
    mountIndex();
    try {
      expect(cards(liveContainer)).toHaveLength(416);
      typeSearch('ETF');
      const line = liveContainer.querySelector('[data-testid="learn-result-count"]');
      expect(line?.textContent).toContain('找到 6 篇');
      expect(cards(liveContainer)).toHaveLength(6);
    } finally {
      unmount();
    }
  });

  it('真實 DOM：無結果時顯示空狀態、卡片為 0', () => {
    mountIndex();
    try {
      typeSearch('zzz不存在的名詞zzz');
      expect(cards(liveContainer)).toHaveLength(0);
      expect(liveContainer.textContent).toContain('沒有符合的文章');
    } finally {
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. 分類篩選                                                                */
/* -------------------------------------------------------------------------- */

describe('索引頁：分類篩選', () => {
  it('filterLearnGroups：platform 只剩該分類 32 篇', () => {
    const visible = filterLearnGroups(groups, 'platform', '');
    expect(visible).toHaveLength(1);
    expect(visible[0].key).toBe('platform');
    expect(countLearnItems(visible)).toBe(32);
  });

  it('真實 DOM：點「平台教學」只剩 32 篇與 1 個 section', () => {
    mountIndex();
    try {
      clickTab((t) => t.includes('平台教學'));
      expect(cards(liveContainer)).toHaveLength(32);
      expect(liveContainer.querySelectorAll('section')).toHaveLength(1);
    } finally {
      unmount();
    }
  });

  it('真實 DOM：點「盤後解讀」（recap）只剩 24 篇', () => {
    mountIndex();
    try {
      clickTab((t) => t.includes('盤後解讀'));
      expect(cards(liveContainer)).toHaveLength(24);
      expect(liveContainer.querySelectorAll('section')).toHaveLength(1);
    } finally {
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 6. /learn/[slug] 文章頁                                                    */
/* -------------------------------------------------------------------------- */

describe('/learn/[slug]：不同 category 的文章渲染正確', () => {
  const cases = [
    { slug: 'how-to-use-stock-orderbook', categoryKey: 'platform', sections: 11 },
    { slug: 'taiwan-stock-market-recap-2026-09-17', categoryKey: 'recap', sections: 8 },
    { slug: 'what-is-roe-return-on-equity-tw-stock', categoryKey: 'rules', sections: 8 },
  ];

  it.each(cases)(
    '$slug（$categoryKey）：h1 與章節數正確（$sections 節）',
    ({ slug, categoryKey, sections }) => {
      const { dom, article } = staticArticle(slug);
      expect(article.categoryKey).toBe(categoryKey);
      expect(dom.querySelectorAll('h1')).toHaveLength(1);
      expect(dom.querySelector('h1')?.textContent).toBe(article.title);
      expect(dom.querySelectorAll('section[id]')).toHaveLength(article.sections.length);
      expect(article.sections.length).toBe(sections);
    }
  );

  it('h2 數量 = 章節數；目錄連結數 = 章節數', () => {
    const { dom, article } = staticArticle('how-to-use-stock-orderbook');
    expect(dom.querySelectorAll('h2')).toHaveLength(article.sections.length);
    const tocLinks = Array.from(dom.querySelectorAll('a[href^="#"]'));
    expect(tocLinks).toHaveLength(article.sections.length);
  });

  it('faq / table / figure 三種 block 都有正確輸出', () => {
    const { dom, article } = staticArticle('how-to-use-stock-orderbook');
    const blocks = article.sections.flatMap((s) => s.blocks);
    const tableBlocks = blocks.filter((b) => b.type === 'table');
    const figureBlocks = blocks.filter((b) => b.type === 'figure');
    const faqItems = blocks
      .filter((b) => b.type === 'faq')
      .flatMap((b) => (b.type === 'faq' ? b.items : []));

    expect(tableBlocks.length).toBe(2);
    expect(figureBlocks.length).toBe(1);
    expect(faqItems.length).toBe(5);

    // table：內文 <table> 數 = table block 數
    expect(dom.querySelectorAll('table')).toHaveLength(2);
    // figure：內文 hd-fig 圖卡 + 文章頂部 hd-viz 圖卡
    expect(dom.querySelectorAll('figure')).toHaveLength(1 + article.figures.length);
    // details：1 個目錄 + FAQ 各題
    expect(dom.querySelectorAll('details')).toHaveLength(1 + 5);
    expect(dom.textContent).toContain('本文重點');
  });

  it('目錄 #anchor 未被轉換（仍為 #sec-N，而非 fallback /）', () => {
    const { dom, article } = staticArticle('how-to-use-stock-orderbook');
    const anchors = Array.from(dom.querySelectorAll('a[href^="#"]'));
    expect(anchors).toHaveLength(article.sections.length);
    anchors.forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      expect(href.startsWith('#')).toBe(true);
      expect(href).not.toBe('/');
    });
    expect(dom.querySelector('a[href="#sec-1"]')).not.toBeNull();
    // 章節 id 與目錄錨點一致
    for (const section of article.sections) {
      expect(dom.querySelector(`section#${section.id}`)).not.toBeNull();
      expect(dom.querySelector(`a[href="#${section.id}"]`)).not.toBeNull();
    }
  });

  it('內文站內連結已轉換（/live/ → /live identity；/learn/…/ → 去尾斜線）', () => {
    const { dom } = staticArticle('how-to-read-order-book-five-levels');
    // 不應殘留博主原始尾斜線路由
    expect(dom.querySelector('a[href="/live/"]')).toBeNull();
    expect(dom.querySelector('a[href="/learn/how-to-enable-notify/"]')).toBeNull();
    // 已轉為站內權威路徑（/live/ 為實站權威路由，identity）
    expect(dom.querySelector('a[href="/live"]')).not.toBeNull();
    expect(dom.querySelector('a[href="/learn/how-to-enable-notify"]')).not.toBeNull();
  });

  it('legacy 扁平頁（無 <article>）仍渲染 h1 與章節', () => {
    const { dom, article } = staticArticle('how-to-enable-notify');
    expect(article.intro.length).toBeGreaterThan(0);
    expect(dom.querySelector('h1')?.textContent).toBe(article.title);
    expect(dom.querySelectorAll('section[id]')).toHaveLength(article.sections.length);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. generateStaticParams                                                    */
/* -------------------------------------------------------------------------- */

describe('generateStaticParams', () => {
  it('產生 416 條路徑，與 slug 清單一致', () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(416);
    expect(params.map((p) => p.slug).sort()).toEqual([...getAllLearnSlugs()].sort());
  });
});
