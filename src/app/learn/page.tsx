/**
 * 教學專欄索引頁 /learn（Server Component）
 * ----------------------------------------------------------------------------
 * 只把「輕量清單」（每篇 slug / kind / title / category / categoryKey / readMinutes）
 * 傳給 client 子元件 LearnIndex 處理搜尋與分類互動；3.8 MiB 的 learn-articles.json
 * 僅在本 Server Component 被載入，不會進入瀏覽器 bundle。
 *
 * 支援 /learn?c=<categoryKey> 直接指定初始分類（文章頁的分類膠囊會連到這裡）。
 */

import type { Metadata } from 'next';
import LearnIndex from './LearnIndex';
import { getLearnIndexItems } from '@/lib/learnArticles';

export const metadata: Metadata = {
  title: '研究文章｜股市大佬 TradeBoss',
  description: '台股教學專欄：從市場、籌碼到分點，每天收盤後更新的研究長文。',
};

interface LearnIndexPageProps {
  searchParams: Promise<{ c?: string | string[] }>;
}

export default async function LearnIndexPage({ searchParams }: LearnIndexPageProps) {
  const params = await searchParams;
  const raw = params?.c;
  const initialCategory = Array.isArray(raw) ? raw[0] : raw;
  const items = getLearnIndexItems();

  return <LearnIndex items={items} initialCategory={initialCategory} />;
}
