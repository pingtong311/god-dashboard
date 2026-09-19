/**
 * 教學專欄（/learn）資料存取層
 * ----------------------------------------------------------------------------
 * ⚠️ 本檔匯入 3.8 MiB 的 learn-articles.json。**只能被 Server Component 匯入**；
 *    任何 'use client' 元件若匯入本檔，整份 JSON 會被打包進瀏覽器 bundle。
 *    需要型別或純函式（resolveLearnHref / getLearnGroups）時，請改匯入 src/lib/learn.ts。
 *
 * 資料來源：src/data/learn-articles.json（416 篇 /learn/ 文章，2026-09-19 抽取）。
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import type { LearnArticle, LearnData, LearnIndexItem } from '@/lib/learn';

// 以 require 載入 3.8 MiB 的 JSON：若用 `import ... from '*.json'`，tsc 會把整份檔案
// 納入程式並推斷型別，導致記憶體耗盡（實測 tsc 被 SIGKILL）。require 讓 tsc 只看到
// `any`，不解析 JSON；webpack（Next 打包）與 jest 仍能正常解析 JSON 與 '@/' 別名。
const DATA = require('@/data/learn-articles.json') as LearnData;

const BY_SLUG = new Map<string, LearnArticle>(DATA.articles.map((a) => [a.slug, a]));

/** 完整資料（含 total / fetchedAt / articles）。 */
export function getLearnData(): LearnData {
  return DATA;
}

/** 文章總數。 */
export function getLearnTotal(): number {
  return DATA.articles.length;
}

/** 資料抽取日（'YYYY-MM-DD'）。 */
export function getLearnFetchedAt(): string {
  return DATA.fetchedAt;
}

/** 全部 slug（供 generateStaticParams 使用）。 */
export function getAllLearnSlugs(): string[] {
  return DATA.articles.map((a) => a.slug);
}

/** 依 slug 取單篇文章（找不到回 undefined）。 */
export function getLearnArticle(slug: string): LearnArticle | undefined {
  return BY_SLUG.get(slug);
}

/** 轉成索引頁用的輕量項目（不含 intro / sections）。 */
export function toLearnIndexItem(article: LearnArticle): LearnIndexItem {
  return {
    slug: article.slug,
    kind: article.kind,
    title: article.title,
    category: article.category,
    categoryKey: article.categoryKey,
    readMinutes: article.readMinutes,
  };
}

/** 索引頁用的輕量清單（416 筆）。 */
export function getLearnIndexItems(): LearnIndexItem[] {
  return DATA.articles.map(toLearnIndexItem);
}
