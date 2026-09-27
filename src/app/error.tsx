'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * 全站錯誤邊界（App Router 段層級，掛在 `src/app/error.tsx`）。
 *
 * 為什麼需要它 —— 本次「瀏覽器上一頁／下一頁崩潰」的結構性根因：
 *   Next.js App Router 的「瀏覽器上一頁／下一頁」與 next/link 皆走**客戶端路由**，
 *   會就地重新 render 目的路由的元件樹（不整頁重載）。任一元件於 render 期拋錯時，
 *   若該子樹沒有 error boundary，錯誤會一路上拋到 Next.js 內建的預設邊界，整個 UI
 *   被替換成「Application error: a client-side exception has occurred」——也就是
 *   BOSS 看到的「崩潰／錯誤頁」。本檔在根 layout 之下建立 boundary，讓錯誤被就地
 *   接住、顯示可復原的畫面（重試 / 回首頁），而非整頁白屏。
 *
 * 注意：本檔渲染於根 layout 之內，globals.css 與 Tailwind 皆已載入，可直接使用
 *       Tailwind class。（真正替換根 layout 的是 global-error.tsx，那支才需自帶樣式。）
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 保留錯誤於 console，方便在瀏覽器上一頁崩潰時以 DevTools 追查。
    console.error('[app/error.tsx]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[640px] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="text-5xl" aria-hidden="true">
        ⚠️
      </span>
      <h1 className="text-xl font-black text-ink">系統暫時無法顯示此頁</h1>
      <p className="text-sm leading-relaxed text-muted">
        頁面載入時發生未預期的錯誤，可能是資料暫時無法取得。你可以重試，或回到首頁。
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-black text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          重試
        </button>
        <Link
          href="/"
          className="rounded-xl border border-line px-5 py-2.5 text-sm font-black text-ink transition hover:bg-surface-2"
        >
          回首頁
        </Link>
      </div>
    </div>
  );
}
