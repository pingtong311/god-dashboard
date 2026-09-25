/**
 * FeatureSubNav ——「相關功能切換」pill 子導覽（選股六功能）。
 *
 * 來源：實站 `/picks/`、`/fade/`、`/swing/`、`/risk/` 等 `<main>` 的
 *   <nav aria-label="相關功能切換" class="scrollbar-none -mx-1 mb-1 …">
 * （captured/login-capture/html/*.html，逐字照抄 class 與屬性）。
 *
 * 六個 pill：量價 / 隔日沖 / 型態 / 波段 / 處置 / 自訂條件
 * （對應 /picks/ /fade/ /patterns/ /swing/ /risk/ /tools/）。
 *
 * 當前頁判定：usePathname()；命中者 aria-current="page" 且樣式為
 * `bg-accent text-bg`，其餘為 `border border-line bg-surface text-muted hover:text-ink`。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 六個功能 pill（順序、名稱、路徑照抄實站）。 */
const PILLS: readonly { label: string; href: string }[] = [
  { label: '量價', href: '/picks/' },
  { label: '隔日沖', href: '/fade/' },
  { label: '型態', href: '/patterns/' },
  { label: '波段', href: '/swing/' },
  { label: '處置', href: '/risk/' },
  { label: '自訂條件', href: '/tools/' },
];

export default function FeatureSubNav() {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    <nav
      aria-label="相關功能切換"
      className="scrollbar-none -mx-1 mb-1 w-full min-w-0 max-w-full"
    >
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto py-1 pl-1 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PILLS.map((pill) => {
          const active = normalized === pill.href.replace(/\/+$/, '');
          return (
            <Link
              key={pill.href}
              href={pill.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap min-h-11 rounded-full px-3.5 py-1.5 text-[12.5px] font-black transition active:scale-95 ${
                active
                  ? 'bg-accent text-bg'
                  : 'border border-line bg-surface text-muted hover:text-ink'
              }`}
            >
              {pill.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
