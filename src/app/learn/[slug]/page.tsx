/**
 * 教學專欄文章頁 /learn/[slug]（Server Component）
 * ----------------------------------------------------------------------------
 * - generateStaticParams() 預先產生全部 416 條路徑（SSG）。
 * - dynamicParams = false：只允許這 416 個 slug；其餘一律 404，避免執行期
 *   以未快取的 slug 查 3.8 MiB JSON。新增文章需重新建置（本專案為靜態複刻，
 *   資料檔本身也是建置期快照，故可接受）。
 * - 內容在 server 端渲染（LearnArticle 為同步、無 'use client'），
 *   3.8 MiB JSON 不會被打包進瀏覽器。
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LearnArticle from '@/components/LearnArticle';
import { getAllLearnSlugs, getLearnArticle } from '@/lib/learnArticles';

/** 只允許 generateStaticParams 產生的路徑（未知 slug → 404）。 */
export const dynamicParams = false;

/** 預先產生全部文章路徑。 */
export function generateStaticParams(): Array<{ slug: string }> {
  return getAllLearnSlugs().map((slug) => ({ slug }));
}

interface LearnArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LearnArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getLearnArticle(slug);
  if (!article) {
    return { title: '研究文章｜股市大佬 TradeBoss' };
  }
  return {
    title: `${article.title}｜股市大佬 TradeBoss`,
    description: article.intro.slice(0, 140),
  };
}

export default async function LearnArticlePage({ params }: LearnArticlePageProps) {
  const { slug } = await params;
  const article = getLearnArticle(slug);
  if (!article) {
    notFound();
  }
  return <LearnArticle article={article} />;
}
