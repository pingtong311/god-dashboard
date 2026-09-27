import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';
import LoginForm from './LoginForm';

/**
 * /login —— 博主此頁的表單是「客戶端渲染」，SSR 只吐出 logo 與標題。
 * static-pages.json 的 login 頁 sections 為空陣列，故 StaticPage 只渲染 hero 區
 * （logo + h1 + 金色副標），維持對博主的版面忠實度。
 *
 * 在其下追加「可用測試登入」表單（LoginForm，client component）：
 *   - 帳號 admin / 密碼 1234 → 寫入 localStorage 的 warroom_token → 導向 /today/。
 *   - 表單樣式沿用本頁語彙（深藍 + 古銅金），hero 完全不動。
 * 表單本身不讀 localStorage，SSR 首屏與 CSR 首屏一致（hydration 安全）。
 */
const page = getStaticPage('login');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function LoginPage() {
  return (
    <>
      <StaticPage page={page} />
      <LoginForm />
    </>
  );
}
