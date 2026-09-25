'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { shouldShowSiteFooter } from '@/lib/shellRoutes';

/**
 * SiteFooter — 頁尾免責與法遵聲明（複刻「股市大佬」未登入態外殼）。
 *
 * ⚠ 這是「法遵固定文字」：逐字照抄博主，不得改寫、翻譯、縮短或「潤飾」。
 *    來源：extracted/site/home.html（11 個外殼頁同構）
 *
 *   <footer class="site-footer mx-auto mt-14 w-full max-w-[1360px] px-4 md:px-6">
 *     <div class="data-panel rounded-2xl border border-line/80 bg-surface/70 p-4
 *                 text-sm leading-relaxed text-muted">
 *       <p class="mb-1.5 font-bold text-ink">免責與法遵聲明</p>
 *       <p>…<span class="font-bold text-ink">不構成任何投資建議…</span>…</p>
 *       <nav aria-label="公司資訊與法遵" class="flex flex-wrap justify-center
 *            gap-x-3 gap-y-2 text-[12.5px] font-bold mt-3"> …6 links… </nav>
 *     </div>
 *     <p class="mt-3 pb-2 text-center text-sm font-bold tracking-wide text-muted">
 *       股市大佬 TradeBoss · © 2026 資料研究工具｜非投資建議</p>
 *   </footer>
 *
 * 與博主的差異（僅 URL 為我們自己的）：
 *   - 隱私權政策 → 博主 `/privacy.html`（另開視窗）；本站內容在 `/privacy`，
 *     改指 `/privacy` 並移除 `target="_blank"`。
 *   - 服務條款 → 同上，改指 `/terms`。
 *   - 使用回饋／刪帳 → 博主 `/member/?tab=feedback`；峰子尚無此路由，
 *     依指示「保留原 href、不自行發明路由」，故以純 <a> 呈現。
 *   - 版權列：博主 HTML 為 `© <!-- -->2026<!-- -->`（React SSR 註解切分），
 *     於此輸出純文字 `© 2026`。
 *   - 全形字元 `／`（U+FF0F，使用回饋／刪帳）與 `｜`（U+FF5C，版權列）原樣保留。
 *
 * 顯示時機：guest 與 app（登入後）**皆有** site-footer —— 實測登入後頁面
 * （/today/ /market/ …）同樣渲染本頁尾。由 shellRoutes 單一來源判定，
 * 'none' 路由（/learn/<slug>、/s/<ticker>、/privacy、/terms）回傳 null。
 */
export default function SiteFooter() {
  const pathname = usePathname();

  if (!shouldShowSiteFooter(pathname)) {
    return null;
  }

  /** 頁尾六個法遵連結共用樣式（逐字照抄博主）。 */
  const linkClass =
    'min-h-11 inline-flex items-center text-accent underline-offset-2 hover:underline';

  return (
    <footer className="site-footer mx-auto mt-14 w-full max-w-[1360px] px-4 md:px-6">
      <div className="data-panel rounded-2xl border border-line/80 bg-surface/70 p-4 text-sm leading-relaxed text-muted">
        <p className="mb-1.5 font-bold text-ink">免責與法遵聲明</p>
        <p>本平台提供台股公開籌碼資料之統計、教學與研究工具，所有數字均為歷史資料整理，<span className="font-bold text-ink">不構成任何投資建議、招攬、買賣要約或獲利保證</span>。平台不代客操作、不提供個股買賣訊號、不保證準確性。 投資有風險，交易前請自行評估、獨立判斷並自負盈虧。 本站不會私訊要驗證碼或叫你匯款。</p>
        <nav
          aria-label="公司資訊與法遵"
          className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[12.5px] font-bold mt-3"
        >
          <Link className={linkClass} href="/about/">
            關於本站
          </Link>
          <Link className={linkClass} href="/guide/">
            新手導覽
          </Link>
          <Link href="/privacy" className={linkClass}>
            隱私權政策
          </Link>
          <Link href="/terms" className={linkClass}>
            服務條款
          </Link>
          <Link className={linkClass} href="/legal/">
            法遵說明
          </Link>
          <a className={linkClass} href="/member/?tab=feedback">
            使用回饋／刪帳
          </a>
        </nav>
      </div>
      <p className="mt-3 pb-2 text-center text-sm font-bold tracking-wide text-muted">
        股市大佬 TradeBoss · © 2026 資料研究工具｜非投資建議
      </p>
    </footer>
  );
}
