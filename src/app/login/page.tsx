import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

/**
 * /login —— 博主此頁的表單是「客戶端渲染」，SSR 只吐出 logo 與標題。
 * static-pages.json 的 login 頁 sections 為空陣列，故這裡只渲染 hero 區
 * （logo + h1 + 金色副標）。**刻意不自行發明登入表單**，以免與博主實際畫面不符。
 */
const page = getStaticPage('login');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function LoginPage() {
  return <StaticPage page={page} />;
}
