/**
 * MarketCatNav ——「市場分類」次導覽（6 頁橫向 tab）。
 *
 * 來源：實站 `/picks/`、`/risk/` 等 `<main>` 開頭的
 *   <nav aria-label="市場分類" class="silk-row silk-row-fade -mx-4 mb-2 …">
 * （captured/login-capture/html/picks.html 等，逐字照抄 class 與屬性）。
 *
 * 出現頁：/market/（總覽）、/etf-active/（ETF）、/ranking/（排行）、
 *         /brokers/（籌碼）、/picks/（選股）、/risk/（風險）。
 * 不出現在 fade / swing / dividend / leverage 等子頁——依各頁 capture 為準。
 *
 * 當前頁判定：usePathname()（與 BottomTabBar 同模式，render 期即有值），
 * 命中者加 aria-current="page"、文字 text-accent、底線 span 改 bg-accent。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 六個分類 tab（順序、名稱、路徑照抄實站）。 */
const CATS: readonly { label: string; href: string }[] = [
  { label: '總覽', href: '/market/' },
  { label: 'ETF', href: '/etf-active/' },
  { label: '排行', href: '/ranking/' },
  { label: '籌碼', href: '/brokers/' },
  { label: '選股', href: '/picks/' },
  { label: '風險', href: '/risk/' },
];

export default function MarketCatNav() {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    <nav
      aria-label="市場分類"
      className="silk-row silk-row-fade -mx-4 mb-2 min-w-0 px-4 lg:mx-0 lg:px-0"
    >
      <div className="flex flex-nowrap items-end gap-0.5 pr-4">
        {CATS.map((cat) => {
          const active = normalized === cat.href.replace(/\/+$/, '');
          return (
            <Link
              key={cat.href}
              href={cat.href}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex shrink-0 items-center whitespace-nowrap px-3.5 pb-2.5 pt-1.5 text-[12.5px] font-black transition active:scale-95 ${
                active ? 'text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {cat.label}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2.5 bottom-0 h-[2px] rounded-full ${
                  active ? 'bg-accent' : 'bg-transparent'
                }`}
              />
            </Link>
          );
        })}
        <span className="w-4 shrink-0" aria-hidden="true" />
      </div>
    </nav>
  );
}
