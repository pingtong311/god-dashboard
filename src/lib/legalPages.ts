/**
 * 法遵靜態頁資料層（/privacy 隱私權政策、/terms 服務條款）
 * ----------------------------------------------------------------------------
 * 資料來源：src/data/legal-pages.json（由博主原始 HTML 抽取：
 *   extracted/site/privacy.html、extracted/site/terms.html）。
 *
 * 本檔提供：
 *   1. 兩頁的 TypeScript 型別（對應抽取出的 block / inline run 結構）。
 *   2. getLegalPage(slug) / listLegalPages()。
 *   3. resolveLegalHref(href) — 把博主 href 轉為峰子路由。
 *   4. buildLegalMetadata(page) — 路由檔用的 <title>（與博主 <title> 逐字相同）。
 *
 * ── 內容 vs 版面（與 staticPages.ts 同一個分工原則）──
 *   - 「內容」以 legal-pages.json 為唯一權威（不自行改寫文案）。
 *   - 「版面」以博主原始 HTML 的 inline <style> 為唯一權威
 *     （見元件 LegalPage.tsx 與 LegalPage.module.css 的註解）。
 *
 * ── inline run 的型別 ──
 * 博主的段落／清單項含有 <strong> 與 <a>，為避免壓平成純字串而丟失標記，
 * 抽取時改存 run 陣列；渲染端逐 run 輸出對應標籤。
 *
 * ── 為何 /privacy 與 /terms 沒有導覽外殼 ──
 * 博主這兩頁是獨立靜態 .html（site-header=0、mobile-taskbar=0），
 * 峰子由 src/lib/shellRoutes.ts 的 NO_SHELL_EXACT 判定為 ShellKind='none'，
 * 因此 <Navigation /> / <SiteFooter /> / <MobileTaskbar /> 都會回傳 null。
 * 本檔不參與該判定（勿在此重複維護前綴）。
 */

import type { Metadata } from 'next';
import rawData from '@/data/legal-pages.json';

/** inline run 型別：純文字 / 粗體 / 斜體 / 連結。 */
export type LegalRunType = 'text' | 'strong' | 'em' | 'a';

/** 一個 inline run。`href` 僅在 t === 'a' 時存在。 */
export interface LegalRun {
  t: LegalRunType;
  v: string;
  href?: string;
}

/** 標題 / 段落 / 引言區塊（text 為 runs 串接後的純文字）。 */
export interface LegalTextBlock {
  type: 'h2' | 'h3' | 'p' | 'blockquote';
  text: string;
  runs: LegalRun[];
}

/** 清單項目（有序／無序共用）。 */
export interface LegalListItem {
  text: string;
  runs: LegalRun[];
}

/** 清單區塊。 */
export interface LegalListBlock {
  type: 'ul' | 'ol';
  items: LegalListItem[];
}

/** 分隔線區塊。 */
export interface LegalHrBlock {
  type: 'hr';
}

/** 全部 block 型別的聯集。 */
export type LegalBlock = LegalTextBlock | LegalListBlock | LegalHrBlock;

/** 頁首的結構化中繼資料（生效日期 / 最後更新）。 */
export interface LegalMetaItem {
  label: string;
  value: string;
  text: string;
  runs: LegalRun[];
}

/** 跨頁連結導覽項目（href 為博主原文，渲染時經 resolveLegalHref 轉換）。 */
export interface LegalNavItem {
  href: string;
  label: string;
}

/** 一個法遵頁的完整資料。 */
export interface LegalPageData {
  slug: string;
  /** 峰子路由（/privacy、/terms）。 */
  path: string;
  /** 博主原始路徑（/privacy.html、/terms.html），供溯源。 */
  sourcePath: string;
  /** <h1> 原文。 */
  title: string;
  /** 博主 <title> 原文（峰子 page title 逐字沿用）。 */
  docTitle: string;
  nav: LegalNavItem[];
  meta: LegalMetaItem[];
  blocks: LegalBlock[];
}

/** 兩個法遵頁的 slug（供路由與測試共用）。 */
export const LEGAL_PAGE_SLUGS = ['privacy', 'terms'] as const;

export type LegalPageSlug = (typeof LEGAL_PAGE_SLUGS)[number];

/**
 * 將 JSON 轉為強型別。JSON 為靜態且已知，故以 `as unknown as` 收斂，
 * 避免 TS 對 JSON 推導出的字面量型別產生雜訊。
 */
const PAGES: LegalPageData[] = (rawData as unknown as { pages: LegalPageData[] }).pages;

/** 取得全部法遵頁（依 JSON 順序：privacy、terms）。 */
export function listLegalPages(): LegalPageData[] {
  return PAGES;
}

/**
 * 依 slug 取得單頁資料。
 *
 * @throws 若 slug 不存在（資料為靜態，屬程式錯誤）。
 */
export function getLegalPage(slug: LegalPageSlug): LegalPageData {
  const page = PAGES.find((p) => p.slug === slug);
  if (!page) {
    throw new Error(`找不到法遵頁資料：${slug}`);
  }
  return page;
}

/**
 * 博主 href → 峰子路由 的對照表。
 *
 * 原則：**只有 URL 換成峰子的**，顯示文字一律不動（內容逐字複刻）。
 *   /privacy.html                          → /privacy
 *   /terms.html                            → /terms
 *   https://blackstockai.com/privacy.html  → /privacy
 *   https://blackstockai.com/terms.html    → /terms
 * 其餘（`/`、`/legal/`、`mailto:`、外部網站）原樣保留。
 *
 * 註：terms 內文「請詳閱我們的隱私權政策」的連結在博主站指向
 *     https://blackstockai.com/privacy.html；依「只有 URL 是我們的」原則
 *     轉為峰子的 /privacy，顯示文字「隱私權政策」不變。
 */
const LEGAL_HREF_MAP: Readonly<Record<string, string>> = {
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
  'https://blackstockai.com/privacy.html': '/privacy',
  'https://blackstockai.com/terms.html': '/terms',
  'https://blackstockai.com/privacy': '/privacy',
  'https://blackstockai.com/terms': '/terms',
};

/** 轉換博主 href 為峰子路由（查無對照則原樣保留）。 */
export function resolveLegalHref(href: string): string {
  return LEGAL_HREF_MAP[href] ?? href;
}

/** 是否為站內路徑（`/…`，但排除 `//host` 這種 protocol-relative）。 */
export function isInternalLegalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/** 供路由檔產生 metadata（title 逐字沿用博主 <title>）。 */
export function buildLegalMetadata(page: LegalPageData): Metadata {
  return {
    title: page.docTitle,
    // 博主原始 HTML：<meta name="robots" content="index,follow">
    robots: { index: true, follow: true },
  };
}
