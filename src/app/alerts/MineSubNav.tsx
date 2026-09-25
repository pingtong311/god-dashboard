/**
 * MineSubNav ——「我的」系列頁的「相關功能切換」pill 子導覽。
 *
 * 來源：實站 `/alerts/`、`/portfolio/`、`/notify/`、`/community/` 的 `<main>` 開頭
 *   <nav aria-label="相關功能切換" class="scrollbar-none -mx-1 mb-1 …">
 * （captured/login-capture/html/alerts.html 等，逐字照抄 class 與屬性）
 *
 * 五個 pill：社群 / 自選 / 到價提醒 / 持股 / 推播
 * （對應 /community/ /watchlist/ /alerts/ /portfolio/ /notify/）。
 *
 * 當前頁由各頁以 `active` prop 傳入（伺服器元件，免 usePathname，
 * 無 hydration 顧慮）；命中者 aria-current="page" 且樣式為
 * `bg-accent text-bg`，其餘為 `border border-line bg-surface text-muted hover:text-ink`。
 */
import Link from 'next/link';

/** 五個功能 pill（順序、名稱、路徑照抄實站）。 */
const PILLS: readonly { label: string; href: string }[] = [
  { label: '社群', href: '/community/' },
  { label: '自選', href: '/watchlist/' },
  { label: '到價提醒', href: '/alerts/' },
  { label: '持股', href: '/portfolio/' },
  { label: '推播', href: '/notify/' },
];

export default function MineSubNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="相關功能切換"
      className="scrollbar-none -mx-1 mb-1 w-full min-w-0 max-w-full"
    >
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto py-1 pl-1 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PILLS.map((pill) => {
          const isActive = pill.label === active;
          return (
            <Link
              key={pill.href}
              href={pill.href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap min-h-11 rounded-full px-3.5 py-1.5 text-[12.5px] font-black transition active:scale-95 ${
                isActive
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
