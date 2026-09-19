/**
 * 靜態單頁資料層（guide / manual / about / pricing / methodology / legal / login / app）
 * ----------------------------------------------------------------------------
 * 資料來源：src/data/static-pages.json（由博主原始 HTML 抽取，共 8 頁）。
 * 本檔提供：
 *   1. 靜態頁的 TypeScript 型別（對應抽取出的 block 結構）。
 *   2. getStaticPage(slug) — 依 slug 取得單頁資料。
 *   3. resolveStaticHref(href) — CTA / link 的 href 轉換（站內走 legacyRoutes）。
 *   4. buildAnchorMap(page) — 把 sectionNav 的 #anchor 對應到章節（見檔內說明）。
 *
 * 注意（內容 vs 版面）：
 *   - 「內容」以 static-pages.json 為唯一權威（不自行改寫文案）。
 *   - 「版面」以博主原始 HTML 為唯一權威（見元件 StaticPage.tsx 的註解）。
 */

import { isInternalHref, resolveLegacyHref } from '@/lib/legacyRoutes';
import rawData from '@/data/static-pages.json';

/** 段落角色：對應博主三種字級（eyebrow / title / body）。 */
export type InlineRole = 'eyebrow' | 'title' | 'body';

/** hero / 卡片上的 CTA 按鈕。 */
export interface StaticCta {
  href: string;
  label: string;
  /** 博主 hero 按鈕樣式：primary（實心金）｜secondary（描邊）。 */
  variant?: string;
}

/** 膠囊導覽項目（subNav / sectionNav 共用）。 */
export interface StaticNavItem {
  href: string;
  label: string;
  /** true = 目前所在頁（博主以 aria-current="page" 標記）。 */
  active?: boolean;
}

/** 卡片 / 文章區塊（card 用玻璃面板、article 用 surface/70 面板）。 */
export interface PanelBlock {
  type: 'card' | 'article';
  eyebrow?: string;
  title?: string;
  body?: string;
  cta?: StaticCta | null;
  items?: string[];
}

/** 段落區塊。 */
export interface ParagraphBlock {
  type: 'p';
  role: InlineRole;
  text: string;
}

/** 清單區塊；ordered=true 時 items 內含前綴編號（如 "1準備…"）。 */
export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

/** 連結卡區塊。 */
export interface LinkBlock {
  type: 'link';
  href: string;
  label: string;
  desc?: string;
}

/** 章節內小標。 */
export interface Heading3Block {
  type: 'h3';
  text: string;
}

/** 可折疊區塊（原生 <details>，無需 client JS）。 */
export interface DetailsBlock {
  type: 'details';
  summary: string;
  blocks: StaticBlock[];
}

/** 全部 block 型別的聯集。 */
export type StaticBlock =
  | PanelBlock
  | ParagraphBlock
  | ListBlock
  | LinkBlock
  | Heading3Block
  | DetailsBlock;

/** 一個章節（heading 可能為空字串 → 不渲染章節標題列）。 */
export interface StaticSection {
  heading: string;
  blocks: StaticBlock[];
}

/** 一個靜態頁的完整資料。 */
export interface StaticPageData {
  slug: string;
  path: string;
  eyebrow: string;
  title: string;
  lead: string;
  heroCtas: StaticCta[];
  sectionNav: StaticNavItem[];
  subNav: StaticNavItem[];
  sections: StaticSection[];
}

/** 8 個靜態頁的 slug（供路由與測試共用）。 */
export const STATIC_PAGE_SLUGS = [
  'guide',
  'manual',
  'about',
  'pricing',
  'methodology',
  'legal',
  'login',
  'app',
] as const;

export type StaticPageSlug = (typeof STATIC_PAGE_SLUGS)[number];

/**
 * 將 JSON 轉為強型別。JSON 為靜態且已知，故以 `as unknown as` 收斂，
 * 避免 TS 對 JSON 推導出的字面量型別（例如 cta 為 null 的變體）產生雜訊。
 */
const PAGES: StaticPageData[] = (rawData as unknown as { pages: StaticPageData[] }).pages;

/** 取得全部靜態頁（依 JSON 順序）。 */
export function listStaticPages(): StaticPageData[] {
  return PAGES;
}

/**
 * 依 slug 取得單頁資料。
 *
 * @throws 若 slug 不存在（資料為靜態，屬程式錯誤）。
 */
export function getStaticPage(slug: StaticPageSlug): StaticPageData {
  const page = PAGES.find((p) => p.slug === slug);
  if (!page) {
    throw new Error(`找不到靜態頁資料：${slug}`);
  }
  return page;
}

/** 是否為外部連結（http/https/mailto/tel 或 protocol-relative）。 */
export function isExternalHref(href: string): boolean {
  return (
    /^https?:\/\//i.test(href) ||
    href.startsWith('//') ||
    /^mailto:/i.test(href) ||
    /^tel:/i.test(href)
  );
}

/**
 * 轉換 CTA / link 的 href。
 *
 * 規則：
 *   - 頁內錨點（`#…`）與外部連結（http/https/mailto/tel/`//`）→ 原樣保留，
 *     **不可**經過 legacyRoutes（會誤轉為 fallback `/diary`）。
 *   - 其餘站內路徑 → 交給 legacyRoutes.resolveLegacyHref（顯示文字一律不動）。
 */
export function resolveStaticHref(href: string): string {
  if (!isInternalHref(href)) {
    return href;
  }
  return resolveLegacyHref(href);
}

/** 去雜訊後的字串比對用（去掉開頭編號、空白與標點）。 */
function normalizeLabel(text: string): string {
  return text.replace(/^[\s\d０-９.、:：]+/, '').trim();
}

/**
 * 建立「章節索引 → section 位置」的對應。
 *
 * 為什麼不能只用順序：sectionNav 的順序**不一定**等於 sections 的順序。
 * 例：legal 的 sections[0] 是沒有標題的「四大保證卡」區（heading=""），
 * 而 sectionNav[0] 的 #who 其實指向 sections[1]「我們是誰」。
 * 因此改為「標籤比對」優先：
 *   1. 正規化後 label === heading（精確命中；manual 的 "01註冊…" 會正規化成 "註冊…"）。
 *   2. 找不到精確命中時，退回「順序對應」（即任務書假設的第 N 個 section）。
 * 命中過的 section 不重複指派；對不到的 anchor 只會沒有目標，不影響渲染。
 *
 * @returns 與 sections 等長的字串陣列，元素為 anchor（不含 `#`）或 undefined。
 */
export function buildAnchorMap(page: StaticPageData): Array<string | undefined> {
  const result: Array<string | undefined> = page.sections.map(() => undefined);
  const used = new Set<number>();

  page.sectionNav.forEach((nav, navIndex) => {
    if (!nav.href.startsWith('#')) {
      return;
    }
    const anchor = nav.href.slice(1);
    const label = normalizeLabel(nav.label);

    // 1) 精確命中
    let index = page.sections.findIndex(
      (section, i) => !used.has(i) && normalizeLabel(section.heading) === label,
    );

    // 2) 順序退回（任務書假設：sectionNav[i] → sections[i]）
    if (index < 0 && navIndex < page.sections.length && !used.has(navIndex)) {
      index = navIndex;
    }

    if (index >= 0) {
      used.add(index);
      result[index] = anchor;
    }
  });

  return result;
}
