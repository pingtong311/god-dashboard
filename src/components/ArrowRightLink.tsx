/**
 * ArrowRightLink —— 區塊標題列的「前往」連結（SPEC 會員四頁 §0-4）。
 *
 * 實站 today.html 等頁的區塊標題右側「市場」「法人」等連結：
 *   <a href="…" class="inline-flex items-center gap-1 text-[12.5px] font-black text-accent">
 *     市場 <svg …width="14" height="14"…>ArrowRight</svg>
 *   </a>
 *
 * 圖示＝Phosphor ArrowRight（regular，14px），d 值逐字取自實站。
 */
import type { ReactNode } from 'react';
import Link from 'next/link';

const ARROW_RIGHT_PATH =
  'M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z';

/** 前往連結：文字保留實站原文，href 由各頁傳入。 */
export default function ArrowRightLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12.5px] font-black text-accent"
    >
      {children}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        fill="currentColor"
        viewBox="0 0 256 256"
        aria-hidden="true"
      >
        <path d={ARROW_RIGHT_PATH} />
      </svg>
    </Link>
  );
}
