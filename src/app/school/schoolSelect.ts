/**
 * 台股學堂 — 共用型別與純函式（搜尋／篩選／chip）
 * ----------------------------------------------------------------------------
 * 這些符號需被頁面與單元測試同時引用，但 Next 15 的路由型別檢查要求 page.tsx
 * 只能匯出路由級導出（default / metadata / generateStaticParams / …），
 * 故抽到本檔（非路由檔，不在此限制內）。
 *
 * 型別欄位對照 src/data/school-articles.json。
 */

/** 內文區塊：kind='def'（名詞說明）或 'warn'（琥珀色提醒）。 */
export interface SchoolBlock {
  /** 'def' | 'warn'。 */
  kind: string;
  /** 說明標籤（如「是什麼：」）；空字串 = 無標籤（不產生空 <b>）。 */
  label: string;
  /** 內文；warn 區塊已含「⚠」前綴。 */
  text: string;
}

/** 文章底部 CTA（58 篇有；其餘為 null）。 */
export interface SchoolCta {
  /** 博主路由（需經 resolveLegacyHref 轉換）。 */
  href: string;
  /** 顯示文字（一律保留原文）。 */
  label: string;
}

/** 單篇名詞文章。 */
export interface SchoolArticle {
  id: string;
  title: string;
  subtitle: string;
  blocks: SchoolBlock[];
  cta: SchoolCta | null;
}

/** 分類（7 個）。 */
export interface SchoolCategory {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  articles: SchoolArticle[];
}

/** 整頁資料。 */
export interface SchoolData {
  pageTitle: string;
  placeholder: string;
  intro: { title: string; desc: string; steps: string[] };
  total: number;
  categories: SchoolCategory[];
}

/** chip 項目。 */
export interface SchoolChip {
  id: string;
  text: string;
}

/** 「全部」chip 的識別碼。 */
export const ALL_ID = 'all';

/**
 * 判斷文章是否符合搜尋字串。
 * 比對範圍：title、subtitle、以及所有 blocks[].text（讓「券資比」「頭肩底」
 * 「集中度」等出現在內文的名詞都搜得到）。大小寫不敏感。
 *
 * @param article 文章
 * @param query 已 trim / toLowerCase 的查詢字串；空字串代表不篩選
 */
export function articleMatchesQuery(article: SchoolArticle, query: string): boolean {
  if (!query) return true;
  const haystack = [article.title, article.subtitle, ...article.blocks.map((b) => b.text)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * 依「搜尋字串 + 選取分類」計算要顯示的分類與文章（兩者可疊加）。
 * 沒有命中文章的分類會被剔除（搜尋時不顯示空的分類）。
 *
 * @param source 全頁資料
 * @param query 使用者輸入（未正規化）
 * @param selectedId 選取的分類 id；ALL_ID 代表全部
 */
export function selectVisibleCategories(
  source: SchoolData,
  query: string,
  selectedId: string,
): SchoolCategory[] {
  const q = query.trim().toLowerCase();
  return source.categories
    .filter((c) => selectedId === ALL_ID || c.id === selectedId)
    .map((c) => ({ ...c, articles: c.articles.filter((a) => articleMatchesQuery(a, q)) }))
    .filter((c) => c.articles.length > 0);
}

/** 建立 chip 清單：全部 + 7 分類，數字皆動態計算。 */
export function buildChips(source: SchoolData): SchoolChip[] {
  const total = source.categories.reduce((sum, c) => sum + c.articles.length, 0);
  return [
    { id: ALL_ID, text: `全部 ${total}` },
    ...source.categories.map((c) => ({ id: c.id, text: `${c.emoji} ${c.name} ${c.articles.length}` })),
  ];
}
