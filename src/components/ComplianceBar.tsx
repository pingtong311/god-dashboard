'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { shouldShowHeader } from '@/lib/shellRoutes';

/**
 * ComplianceBar — 頂部法遵條（複刻「股市大佬」未登入態外殼）。
 *
 * 逐字照抄博主每個外殼頁 <body> 內、skip-link 之後的元素：
 *   <div class="compliance-bar border-b border-line/40 bg-bg/60 px-4 py-1
 *        text-center text-[10.5px] leading-tight text-muted/70">
 *     非證券投資顧問事業
 *     <span class="hidden sm:inline">｜公開資料研究與教學，不提供個股分析意見或推介</span>
 *     <span class="sm:hidden">｜公開資料研究與教學</span>
 *     <a href="/legal/" class="underline underline-offset-2">法遵</a>
 *     ·
 *     <a href="/privacy.html" target="_blank" rel="noreferrer" …>隱私</a>
 *   </div>
 *
 * 顯示時機：與 site-header 同進退（實測登入後的頁面同樣有此法遵條）——
 * 由 shellRoutes 單一來源判定；'none' 路由（/learn/<slug>、/s/<ticker>、
 * /privacy、/terms）回傳 null。
 *
 * 與博主的唯一差異（URL 是我們自己的）：
 *   - 法遵 → Next.js <Link> 指向本站 `/legal/`（博主同為 /legal/）。
 *   - 隱私 → 博主為 `/privacy.html`；本站內容落在 `/privacy`，故改指 `/privacy`，
 *     且因屬站內路由，移除 `target="_blank"` / `rel="noreferrer"`。
 * 其餘文字、兩個響應式 tagline、中間的 `·`（前後各一空格）皆逐字保留。
 */
export default function ComplianceBar() {
  const pathname = usePathname();

  // 與 Navigation.tsx 相同的顯示判斷：直接以 usePathname() 決定是否渲染
  // （SSR 與 CSR 的 pathname 一致，故不會有 hydration 落差）。
  if (!shouldShowHeader(pathname)) {
    return null;
  }

  return (
    <div className="compliance-bar border-b border-line/40 bg-bg/60 px-4 py-1 text-center text-[10.5px] leading-tight text-muted/70">
      非證券投資顧問事業
      <span className="hidden sm:inline">｜公開資料研究與教學，不提供個股分析意見或推介</span>
      <span className="sm:hidden">｜公開資料研究與教學</span>{' '}
      <Link href="/legal/" className="underline underline-offset-2">
        法遵
      </Link>
      {' · '}
      <Link href="/privacy" className="underline underline-offset-2">
        隱私
      </Link>
    </div>
  );
}
