/**
 * 教學專欄（/learn）共用型別與純函式
 * ----------------------------------------------------------------------------
 * 本檔**不載入** learn-articles.json（3.8 MiB），因此可安全地被 client component 匯入。
 * 需要文章資料本身時，請改匯入 src/lib/learnArticles.ts（僅限 server component）。
 *
 * 內容權威：src/data/learn-articles.json（由博主 /learn/<slug>/ 原始 HTML 抽取）。
 * 版面權威：博主原始 HTML（見 extracted/site/learn/<slug>.html）。
 */

import { isInternalHref, resolveLegacyHref } from '@/lib/legacyRoutes';

// ── 型別 ──────────────────────────────────────────────────────────────────

/** 行內片段：純文字 `{ t }`，或連結 `{ t, href }`（補充欄位，僅含連結時出現）。 */
export interface InlineSegment {
  t: string;
  href?: string;
}

/** 段落區塊。 */
export interface LearnParagraphBlock {
  type: 'p';
  text: string;
  segments?: InlineSegment[];
}

/** 清單區塊；variant 對應博主 class（num / check），沒有則 null。 */
export interface LearnListBlock {
  type: 'list';
  ordered: boolean;
  variant: string | null;
  items: string[];
  /** 與 items 同長、逐項對應（僅含連結的區塊才會出現）。 */
  itemSegments?: InlineSegment[][];
}

/** 表格區塊。 */
export interface LearnTableBlock {
  type: 'table';
  head: string[];
  rows: string[][];
}

/** 圖卡區塊：frame 為圖內文字（示意圖），caption 為圖說。 */
export interface LearnFigureBlock {
  type: 'figure';
  frame: string;
  caption: string;
}

/** FAQ 問答項目。 */
export interface LearnFaqItem {
  q: string;
  a: string;
  aSegments?: InlineSegment[];
}

/** FAQ 區塊。 */
export interface LearnFaqBlock {
  type: 'faq';
  items: LearnFaqItem[];
}

export type LearnBlock =
  | LearnParagraphBlock
  | LearnListBlock
  | LearnTableBlock
  | LearnFigureBlock
  | LearnFaqBlock;

/** 章節。 */
export interface LearnSection {
  id: string;
  heading: string;
  blocks: LearnBlock[];
}

/** 延伸閱讀連結。 */
export interface LearnRelated {
  slug: string;
  title: string;
}

/** 一篇文章。 */
export interface LearnArticle {
  slug: string;
  kind: LearnKind;
  title: string;
  category: string;
  categoryKey: string;
  readMinutes: number | null;
  intro: string;
  introSegments?: InlineSegment[];
  figures: Array<{ frame: string; caption: string }>;
  highlights: string[];
  highlightSegments?: InlineSegment[][];
  sections: LearnSection[];
  related: LearnRelated[];
  sourceUrl: string;
}

export type LearnKind = 'topic' | 'recap';

/** 完整資料檔。 */
export interface LearnData {
  total: number;
  fetchedAt: string;
  articles: LearnArticle[];
}

/** 索引頁用的輕量清單項目（不含 intro / sections）。 */
export interface LearnIndexItem {
  slug: string;
  kind: LearnKind;
  title: string;
  category: string;
  categoryKey: string;
  readMinutes: number | null;
}

/** 索引頁分組（主題分類，或每日回顧自成一群）。 */
export interface LearnGroup {
  key: string;
  label: string;
  kind: LearnKind;
  items: LearnIndexItem[];
}

// ── 連結轉換 ──────────────────────────────────────────────────────────────

/** 外部連結（http / mailto / tel / protocol-relative）。 */
export function isExternalHref(href: string): boolean {
  return (
    /^https?:\/\//i.test(href) ||
    href.startsWith('//') ||
    /^mailto:/i.test(href) ||
    /^tel:/i.test(href)
  );
}

/**
 * 將博主 href 轉為峰子 href。
 *
 * 規則：
 *   - 以 `#` 開頭 → 頁內錨點，原樣保留（不可轉換）。
 *   - 外部連結 → 原樣保留。
 *   - `/learn/` 索引、`/learn/<slug>/`、`/learn/?c=` → 對應峰子 /learn 路由。
 *   - 其餘站內路由 → 交給 legacyRoutes 的 resolveLegacyHref()。
 *
 * @example resolveLearnHref('/learn/w-bottom/')      // '/learn/w-bottom'
 * @example resolveLearnHref('/learn/')              // '/learn'
 * @example resolveLearnHref('/learn/?c=platform')   // '/learn?c=platform'
 * @example resolveLearnHref('#sec-1')               // '#sec-1'
 * @example resolveLearnHref('/school/')             // '/school'
 * @example resolveLearnHref('/today/')              // '/today'
 */
export function resolveLearnHref(href: string): string {
  if (!href) return href;
  if (href.startsWith('#')) return href; // 頁內錨點
  if (isExternalHref(href)) return href;
  if (href === '/learn' || href === '/learn/') return '/learn';

  const cat = /^\/learn\/?\?c=([^&#]+)/.exec(href);
  if (cat) return `/learn?c=${cat[1]}`;

  const slug = /^\/learn\/([^/?#]+)\/?(#.*)?$/.exec(href);
  if (slug) return `/learn/${slug[1]}${slug[2] ?? ''}`;

  if (!isInternalHref(href)) return href;
  return resolveLegacyHref(href);
}

// ── 索引頁分組 ────────────────────────────────────────────────────────────

/** 每日回顧（kind: recap）自成一組，key 固定為 'recap'。 */
export const RECAP_KEY = 'recap';

/** 每日回顧群組標題（博主分類名為「盤後解讀」）。 */
export const RECAP_LABEL = '盤後解讀';

/** 主題分類顯示順序（與資料無關的固定順序）。 */
export const LEARN_TOPIC_ORDER: string[] = [
  'platform',
  'orderbook',
  'chips',
  'tech',
  'strategy',
  'mindset',
  'rules',
  'themes',
  'trends',
  'events',
  'stories',
];

/** 每日回顧：依 slug（含 YYYY-MM-DD）由新到舊。 */
function sortRecapDesc(items: LearnIndexItem[]): LearnIndexItem[] {
  return [...items].sort((a, b) => b.slug.localeCompare(a.slug));
}

/**
 * 把輕量清單分成索引頁要顯示的群組：
 *   1. 先放「每日回顧」群（kind: recap），由新到舊。
 *   2. 再依 LEARN_TOPIC_ORDER 放主題分類（只放有文章的）。
 *   3. 若出現未列在順序表的分類，附加於最後（避免遺漏）。
 */
export function getLearnGroups(items: LearnIndexItem[]): LearnGroup[] {
  const groups: LearnGroup[] = [];

  const recap = items.filter((item) => item.kind === 'recap');
  if (recap.length > 0) {
    groups.push({
      key: RECAP_KEY,
      label: recap[0]?.category || RECAP_LABEL,
      kind: 'recap',
      items: sortRecapDesc(recap),
    });
  }

  const labelByKey = new Map<string, string>();
  for (const item of items) {
    if (item.kind === 'topic' && !labelByKey.has(item.categoryKey)) {
      labelByKey.set(item.categoryKey, item.category);
    }
  }

  const orderedKeys = [
    ...LEARN_TOPIC_ORDER.filter((key) => labelByKey.has(key)),
    ...[...labelByKey.keys()].filter((key) => !LEARN_TOPIC_ORDER.includes(key)),
  ];

  for (const key of orderedKeys) {
    const list = items.filter((item) => item.kind === 'topic' && item.categoryKey === key);
    if (list.length > 0) {
      groups.push({ key, label: labelByKey.get(key) ?? key, kind: 'topic', items: list });
    }
  }

  return groups;
}

/** 顯示用閱讀時間字串；null 時回傳空字串（呼叫端據此決定不顯示）。 */
export function formatReadMinutes(readMinutes: number | null): string {
  return readMinutes === null ? '' : `閱讀約 ${readMinutes} 分鐘`;
}

/** 索引頁「全部」篩選鍵。 */
export const LEARN_ALL_KEY = 'all';

/** 單一項目是否符合搜尋字串（比對標題 / slug / 分類）。 */
export function matchesLearnQuery(item: LearnIndexItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.slug.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  );
}

/**
 * 依分類鍵與搜尋字串過濾分組。
 * categoryKey 為 LEARN_ALL_KEY（或空字串）時不過濾分類。
 */
export function filterLearnGroups(
  groups: LearnGroup[],
  categoryKey: string = LEARN_ALL_KEY,
  query = ''
): LearnGroup[] {
  let scoped = groups;
  if (categoryKey && categoryKey !== LEARN_ALL_KEY) {
    scoped = scoped.filter((group) => group.key === categoryKey);
  }
  if (query.trim()) {
    scoped = scoped
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesLearnQuery(item, query)),
      }))
      .filter((group) => group.items.length > 0);
  }
  return scoped;
}

/** 過濾後的文章總數。 */
export function countLearnItems(groups: LearnGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}
