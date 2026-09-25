'use client';

/** 「回到上一頁」按鈕（逐字對齊 margin-maint.html 的 className）；無歷史時退到首頁。 */

import { useRouter } from 'next/navigation';

export default function BackButton(): React.ReactElement {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="回到上一頁"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push('/');
        }
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line/80 bg-surface-2/70 px-3 text-[12.5px] font-bold text-muted transition hover:border-accent hover:text-accent active:scale-[0.97] "
    >
      <span aria-hidden="true" className="text-[14px] leading-none">
        ←
      </span>
      上一頁
    </button>
  );
}
