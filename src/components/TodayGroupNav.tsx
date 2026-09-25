/**
 * TodayGroupNav ——「今天」群組的「相關功能切換」pill 次導覽。
 *
 * 來源：實站 `/live/`、`/reports/`、`/sector/` 等 `<main>` 開頭的
 *   <nav aria-label="相關功能切換" class="scrollbar-none -mx-1 mb-1 …">
 * （captured/login-capture/html/{live,reports,sector}.html，逐字照抄 class 與屬性）。
 *
 * 六個 pill：今日 / 盤中 / 日報 / 族群 / 事件 / 大盤
 * （對應 /today/ /live/ /reports/ /sector/ /radar/ /market/）。
 *
 * 與 FeatureSubNav（選股六功能）同模式：usePathname() 判定當前頁，
 * 命中者 aria-current="page" 且樣式為 `bg-accent text-bg`，
 * 其餘為 `border border-line bg-surface text-muted hover:text-ink`。
 * 結尾一律保留實站的 `<span class="w-4 shrink-0" aria-hidden="true" />` 留白。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 六個 pill（順序、名稱、路徑照抄實站）。 */
const PILLS: readonly { label: string; href: string }[] = [
  { label: '今日', href: '/today/' },
  { label: '盤中', href: '/live/' },
  { label: '日報', href: '/reports/' },
  { label: '族群', href: '/sector/' },
  { label: '事件', href: '/radar/' },
  { label: '大盤', href: '/market/' },
];

export default function TodayGroupNav() {
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
        <span className="w-4 shrink-0" aria-hidden="true" />
      </div>
    </nav>
  );
}
