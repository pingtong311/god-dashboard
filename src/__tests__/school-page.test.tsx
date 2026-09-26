/** @jest-environment jsdom */

/**
 * /school 台股學堂 — 頁面渲染與互動測試
 * ----------------------------------------------------------------------------
 * 對照博主原始 HTML（IOS_design/extracted/site/school.html）驗證：
 *   1. 62 篇文章全數渲染（<details> 數量）
 *   2. 7 個分類標題 + 各分類篇數 badge
 *   3. 搜尋「券資比」命中對應文章（含只出現在 blocks[].text 的「融資與融券」）
 *   4. chip 篩選後只剩該分類文章
 *   5. CTA 文字保留 JSON 原文、href 已轉為峰子路由（resolveLegacyHref）
 *   6. label 為空的 block 不產生空 <b>；warn 區塊不含 <b>
 *
 * 註：本專案的 `@testing-library/dom` 是壞掉的 symlink（`@testing-library/react`
 * 因此沒有任何 export），故不使用 testing-library；改以
 *   - `react-dom/server` 的 renderToStaticMarkup 做結構快照驗證
 *   - `react-dom/client` 的 createRoot + `react` 的 act 做真實 DOM 互動驗證
 *   - 直接呼叫頁面匯出的純函式驗證搜尋／篩選語意
 * next/link 需要 router context，測試以純 <a> 替代（href 不變）。
 */

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import SchoolPage, {
  articleMatchesQuery,
  buildChips,
  selectVisibleCategories,
  type SchoolArticle,
  type SchoolData,
} from '@/app/school/page';
import rawData from '@/data/school-articles.json';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}));

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = rawData as unknown as SchoolData;
const allArticles: SchoolArticle[] = data.categories.flatMap((c) => c.articles);

/* -------------------------------------------------------------------------- */
/* 工具                                                                       */
/* -------------------------------------------------------------------------- */

/** SSR 靜態渲染 → 可查詢的 DOM 容器（不執行 effect）。 */
function staticDom(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<SchoolPage />);
  return host;
}

/** 找出「文字符合 regex 且無更深層子節點也符合」的最內層元素。 */
function deepestByText(root: ParentNode, re: RegExp): Element | null {
  const matches = Array.from(root.querySelectorAll('*')).filter((el) =>
    re.test((el.textContent ?? '').trim()),
  );
  return (
    matches.find(
      (el) => !Array.from(el.children).some((child) => re.test((child.textContent ?? '').trim())),
    ) ?? null
  );
}

/** 真實 DOM 掛載（可互動）。 */
let liveContainer: HTMLDivElement;
let liveRoot: Root;

function mount(): HTMLElement {
  liveContainer = document.createElement('div');
  document.body.appendChild(liveContainer);
  act(() => {
    liveRoot = createRoot(liveContainer);
    liveRoot.render(<SchoolPage />);
  });
  return liveContainer;
}

function unmount(): void {
  act(() => {
    liveRoot.unmount();
  });
  liveContainer.remove();
}

/** 模擬在受控 <input> 輸入（繞過 React value tracker）。 */
function typeSearch(value: string): void {
  const input = liveContainer.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('no input value setter');
  setter.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 依文字找出按鈕並點擊。 */
function clickButton(match: (text: string) => boolean): HTMLButtonElement {
  const btn = Array.from(liveContainer.querySelectorAll('button')).find((b) =>
    match(b.textContent ?? ''),
  );
  if (!btn) throw new Error('button not found');
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return btn;
}

const detailCount = (root: ParentNode): number => root.querySelectorAll('details').length;

/* -------------------------------------------------------------------------- */
/* 1. 結構（SSR）                                                             */
/* -------------------------------------------------------------------------- */

describe('/school 台股學堂 — 結構（SSR 渲染）', () => {
  it('渲染 62 篇文章（<details> 數量），資料亦為 62', () => {
    const dom = staticDom();
    expect(detailCount(dom)).toBe(62);
    expect(allArticles.length).toBe(62);
    expect(data.total).toBe(62);
  });

  it('每個分類一個 <section>，共 7 個，id 與資料一致', () => {
    const dom = staticDom();
    expect(dom.querySelectorAll('section[id]').length).toBe(7);
    for (const c of data.categories) {
      expect(dom.querySelector(`section#${c.id}`)).not.toBeNull();
    }
  });

  it('7 個分類標題（emoji + 名稱）與各分類篇數 badge 皆正確', () => {
    const dom = staticDom();
    const h2Texts = Array.from(dom.querySelectorAll('h2')).map((h) => h.textContent ?? '');
    expect(h2Texts.length).toBe(7);
    for (const c of data.categories) {
      expect(h2Texts.some((t) => t.includes(c.emoji) && t.includes(c.name))).toBe(true);
      const section = dom.querySelector(`section#${c.id}`) as HTMLElement;
      expect(section.textContent).toContain(`${c.articles.length} 篇`);
    }
  });

  it('「全部」chip 數字為 62；分類 chip 數字與資料相符', () => {
    const chips = buildChips(data);
    expect(chips[0].text).toBe('全部 62');
    for (const c of data.categories) {
      expect(chips.some((chip) => chip.text === `${c.emoji} ${c.name} ${c.articles.length}`)).toBe(
        true,
      );
    }
  });

  it('渲染頁首引導卡（標題 + 4 步）與搜尋框 placeholder', () => {
    const dom = staticDom();
    expect(dom.textContent).toContain('🧭 第一次來？照這個順序看');
    expect(dom.querySelector('input')?.getAttribute('placeholder')).toBe(data.placeholder);
    expect(dom.querySelectorAll('ol li').length).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 搜尋（純函式 + 真實 DOM）                                               */
/* -------------------------------------------------------------------------- */

describe('/school 台股學堂 — 搜尋', () => {
  it('articleMatchesQuery 比對 title / subtitle / blocks[].text', () => {
    const margin = allArticles.find((a) => a.id === 'margin') as SchoolArticle;
    const daytrade = allArticles.find((a) => a.id === 'what-daytrade') as SchoolArticle;
    // 「券資比」只在 margin 的內文 blocks 出現，不在其 title/subtitle
    expect(`${margin.title}${margin.subtitle}`).not.toContain('券資比');
    expect(articleMatchesQuery(margin, '券資比')).toBe(true);
    expect(articleMatchesQuery(daytrade, '券資比')).toBe(false);
    // 空查詢＝全部通過
    expect(articleMatchesQuery(daytrade, '')).toBe(true);
  });

  it('selectVisibleCategories：搜「券資比」命中 short-ratio 與 margin，隱藏無關文章', () => {
    const visible = selectVisibleCategories(data, '券資比', 'all');
    const ids = visible.flatMap((c) => c.articles.map((a) => a.id));
    expect(ids).toContain('short-ratio'); // 標題命中
    expect(ids).toContain('margin'); // 內文命中
    expect(ids).not.toContain('what-daytrade');
    expect(ids.length).toBeLessThan(62);
    // 沒有命中文章的分類被剔除
    for (const c of visible) expect(c.articles.length).toBeGreaterThan(0);
  });

  it('真實 DOM：在搜尋框輸入「券資比」後，DOM 只剩命中的文章', () => {
    mount();
    try {
      expect(detailCount(liveContainer)).toBe(62);
      typeSearch('券資比');
      expect(liveContainer.querySelector('details#short-ratio')).not.toBeNull();
      expect(liveContainer.querySelector('details#margin')).not.toBeNull();
      expect(liveContainer.querySelector('details#what-daytrade')).toBeNull();
      expect(detailCount(liveContainer)).toBeGreaterThan(0);
      expect(detailCount(liveContainer)).toBeLessThan(62);
    } finally {
      unmount();
    }
  });

  it('真實 DOM：無結果時顯示空狀態', () => {
    mount();
    try {
      typeSearch('zzz不存在的名詞zzz');
      expect(detailCount(liveContainer)).toBe(0);
      expect(liveContainer.querySelector('[role="status"]')).not.toBeNull();
      expect(liveContainer.textContent).toContain('找不到');
    } finally {
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 分類 chip 篩選（純函式 + 真實 DOM）                                     */
/* -------------------------------------------------------------------------- */

describe('/school 台股學堂 — 分類 chip 篩選', () => {
  it('selectVisibleCategories：選 tools 只剩該分類 10 篇', () => {
    const visible = selectVisibleCategories(data, '', 'tools');
    expect(visible.length).toBe(1);
    expect(visible[0].id).toBe('tools');
    expect(visible[0].articles.length).toBe(10);
  });

  it('真實 DOM：點「研究工具」後只剩該分類 10 篇與 1 個 section', () => {
    mount();
    try {
      clickButton((t) => t.includes('研究工具'));
      expect(detailCount(liveContainer)).toBe(10);
      expect(liveContainer.querySelectorAll('section[id]').length).toBe(1);
      expect(liveContainer.querySelector('section#tools')).not.toBeNull();
      expect(liveContainer.querySelector('section#start')).toBeNull();
    } finally {
      unmount();
    }
  });

  it('真實 DOM：搜尋與 chip 篩選可疊加（籌碼面內搜尋券資比）', () => {
    mount();
    try {
      clickButton((t) => t.includes('籌碼面'));
      typeSearch('券資比');
      expect(liveContainer.querySelector('details#short-ratio')).not.toBeNull();
      expect(liveContainer.querySelector('details#what-daytrade')).toBeNull();
      // 只會是籌碼面分類
      expect(liveContainer.querySelectorAll('section[id]').length).toBe(1);
      expect(liveContainer.querySelector('section#chips')).not.toBeNull();
    } finally {
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. CTA（SSR）                                                              */
/* -------------------------------------------------------------------------- */

describe('/school 台股學堂 — CTA', () => {
  const ctaOf = (dom: HTMLElement, id: string): HTMLAnchorElement =>
    dom.querySelector(`details#${id} a`) as HTMLAnchorElement;

  it('CTA 文字保留 JSON 原文，href 已轉為峰子路由', () => {
    const dom = staticDom();

    // /today/ 為實站權威路徑（identity），文字不變
    const today = ctaOf(dom, 'what-daytrade');
    expect(today.textContent).toBe('前往 今日戰情 →');
    expect(today.getAttribute('href')).toBe('/today');

    // /learn/xxx/ → /learn/xxx（前綴精確對應）
    const learn = ctaOf(dom, 'orderbook-tab');
    expect(learn.textContent).toBe('前往 盤口三層讀法（圖文） →');
    expect(learn.getAttribute('href')).toBe('/learn/how-to-use-stock-orderbook');

    // /stock/?id=2330 → /s/2330（帶 query 的個股頁）
    const stock = ctaOf(dom, 'intraday-k');
    expect(stock.textContent).toBe('前往 個股盯盤 →');
    expect(stock.getAttribute('href')).toBe('/s/2330');
  });

  it('58 篇有 CTA、4 篇無；全頁 CTA 連結數 = 58', () => {
    const dom = staticDom();
    expect(allArticles.filter((a) => a.cta).length).toBe(58);
    const ctaLinks = Array.from(dom.querySelectorAll('details a')).filter((a) =>
      /前往 /.test(a.textContent ?? ''),
    );
    expect(ctaLinks.length).toBe(58);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. 內文區塊（SSR）                                                         */
/* -------------------------------------------------------------------------- */

describe('/school 台股學堂 — 內文區塊', () => {
  it('label 為空的 block 不產生空 <b>（所有 <b> 皆有非空文字）', () => {
    const dom = staticDom();
    const bolds = Array.from(dom.querySelectorAll('b'));
    expect(bolds.length).toBeGreaterThan(0);
    for (const b of bolds) {
      expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('<b> 數量 = 有 label 的區塊數（187）+ 62 篇標題 = 249', () => {
    const dom = staticDom();
    const labeled = allArticles
      .flatMap((a) => a.blocks)
      .filter((b) => b.label && b.label.trim().length > 0).length;
    expect(labeled).toBe(187);
    expect(dom.querySelectorAll('b').length).toBe(labeled + 62);
  });

  it('warn 區塊（⚠ 開頭）內不含 <b>', () => {
    const dom = staticDom();
    const warnEl = deepestByText(dom, /^⚠\s*短線交易頻繁/);
    expect(warnEl).not.toBeNull();
    expect(warnEl?.querySelector('b')).toBeNull();
  });

  it('有內文圖示的文章（23 篇）渲染出 SVG，其餘不渲染', () => {
    const dom = staticDom();
    const withFigure = Array.from(dom.querySelectorAll('details')).filter((d) =>
      d.querySelector('svg'),
    );
    expect(withFigure.length).toBe(23);
    expect(dom.querySelector('details#w-bottom svg')).not.toBeNull();
    expect(dom.querySelector('details#what-daytrade svg')).toBeNull();
  });
});
