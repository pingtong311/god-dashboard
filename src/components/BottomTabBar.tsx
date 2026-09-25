'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  resolveTabbarVariant,
  shouldShowBottomTabBar,
  type TabbarVariant,
} from '@/lib/shellRoutes';
import { useIsLoggedIn } from '@/lib/authState';
import {
  PhosphorArticle,
  PhosphorArticleFill,
  PhosphorBookOpen,
  PhosphorBookOpenFill,
  PhosphorGraduationCap,
  PhosphorGraduationCapFill,
  PhosphorHouse,
  PhosphorHouseFill,
  PhosphorSignIn,
  PhosphorSignInFill,
} from './icons/phosphor';

/**
 * BottomTabBar — 底部固定導覽列（複刻「股市大佬」`mobile-taskbar`）。
 *
 * 實站**只有一套**底部列 DOM 結構，登入前後差別：
 *   1. nav 的 `aria-label`：`手機導覽（未登入）` ↔ `手機主要導覽`；
 *   2. 五個 `<a>` 的 href（實站**皆帶結尾斜線**）與 label；
 *   3. 會員態的 `<a>` 多一個 `px-0.5`（訪客態沒有）；
 *   4. 會員態的 label 多包一層
 *        `<span class="flex max-w-full items-center justify-center gap-0.5"><span class="truncate">戰情</span>…</span>`
 *      且**選中項**在 truncate span 之後多一個 caret 小箭頭（訪客態完全沒有）。
 *
 * 其餘完全相同，包含：
 *   - nav 的固定 class（逐字照抄實站原文，勿改）；
 *   - 選中態以 `aria-current="page"` 標記；
 *   - **會員態**選中項另帶 `aria-haspopup="dialog"` + `aria-expanded="false"`（訪客態沒有）；
 *   - 圖示膠囊未選取 `h-7 w-10 text-current`、已選取
 *     `taskbar-active-pill h-10 w-10 -translate-y-1 bg-accent text-bg`；
 *   - 圖示尺寸：未選取 22、已選取 21。
 *
 * 圖示來源（全部逐字對齊 `src/__tests__/fixtures/tabbar-icons.json`，勿憑記憶改寫）：
 *   - 訪客態 5 項沿用 `./icons/phosphor` 的 regular + fill 雙字重。
 *   - 會員態 5 項**同樣是 regular + fill 雙字重**（選中時換 fill 路徑）；
 *     其中「籌碼」的 fill 版本是 **3 條 `<path>`**，故以字串陣列承載。
 *
 * 屬性順序：實站為 `aria-current` → `aria-haspopup` → `aria-expanded` → `class` → `href`，
 * 故 JSX 把 `href` 放在**最後**一個 prop，讓 outerHTML 能逐字 diff。
 *
 * Active 判定在 render 期直接做（不延後）：
 *   `usePathname()` 在 SSR 時就有值，故 `aria-current`/`aria-haspopup`/
 *   `aria-expanded`/`text-accent` 會在 SSR 就渲染，屬性順序直接反映到 DOM，
 *   不再靠 useEffect 事後以 setAttribute 補上（那會把屬性追加到最尾端）。
 *   訪客態的 active 因此在 SSR 就正確（實站 home.html 選中「首頁」就有
 *   `aria-current="page"`）。會員態因 `useIsLoggedIn()` 是 client-only
 *   （SSR 時恆為 false），仍待 mount 後才切換——這是登入態的根本限制，
 *   實站 curl 無 JS 時也全是訪客態底部列，行為一致。
 *
 * Hydration 安全：`usePathname()` 於 SSR/首屏即為目前路徑，render 期判定
 * 不會造成首屏誤亮；登入狀態以 `useIsLoggedIn` 判定（初始 false，mount 後才讀）。
 *
 * 顯示時機：guest 與 app 皆顯示（由 `shouldShowBottomTabBar` 單一來源判定）；
 * 'none' 路由（/learn/<slug>、/s/<ticker>、/privacy、/terms）回傳 null。
 */

/** 底部列單一項目定義。 */
type BottomTabItem = {
  /** 目的路徑（帶結尾斜線，逐字對齊實站；判定時會正規化去斜線比對）。 */
  readonly href: string;
  /** 顯示文字。 */
  readonly label: string;
  /** 未選取（inactive）圖示：以邊長回傳一個 <svg>。 */
  readonly icon: (size: number) => ReactElement;
  /** 已選取（active）圖示：以邊長回傳一個 <svg>。 */
  readonly iconActive: (size: number) => ReactElement;
};

/* ── 會員態 5 個圖示的真實 SVG path（逐字照抄 fixtures/tabbar-icons.json）───── */

/** /today/ 戰情 — House（inactive outline / active fill）。 */
const MEMBER_TODAY_INACTIVE =
  'M222.14,105.85l-80-80a20,20,0,0,0-28.28,0l-80,80A19.86,19.86,0,0,0,28,120v96a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V164h24v52a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V120A19.86,19.86,0,0,0,222.14,105.85ZM204,204H164V152a12,12,0,0,0-12-12H104a12,12,0,0,0-12,12v52H52V121.65l76-76,76,76Z';
const MEMBER_TODAY_ACTIVE =
  'M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z';

/** /market/ 市場 — ChartLineUp（inactive outline / active fill）。 */
const MEMBER_MARKET_INACTIVE =
  'M236,208a12,12,0,0,1-12,12H32a12,12,0,0,1-12-12V48a12,12,0,0,1,24,0v85.55L88.1,95a12,12,0,0,1,15.1-.57l56.22,42.16L216.1,87A12,12,0,1,1,231.9,105l-64,56a12,12,0,0,1-15.1.57L96.58,119.44,44,165.45V196H224A12,12,0,0,1,236,208Z';
const MEMBER_MARKET_ACTIVE =
  'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM200,176a8,8,0,0,1,0,16H56a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v62.92l34.88-29.07a8,8,0,0,1,9.56-.51l43,28.69,43.41-36.18a8,8,0,0,1,10.24,12.3l-48,40a8,8,0,0,1-9.56.51l-43-28.69L64,155.75V176Z';

/** /stock/ 個股 — TrendUp（inactive outline / active fill）。 */
const MEMBER_STOCK_INACTIVE =
  'M244,128a12,12,0,0,1-12,12H207.42l-36.69,73.37A12,12,0,0,1,160,220h-.6a12,12,0,0,1-10.61-7.72L95,71.15,66.92,133A12,12,0,0,1,56,140H24a12,12,0,0,1,0-24H48.27L85.08,35a12,12,0,0,1,22.13.7l54.28,142.46,27.78-55.56A12,12,0,0,1,200,116h32A12,12,0,0,1,244,128Z';
const MEMBER_STOCK_ACTIVE =
  'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-8,96H188.64L159,188a8,8,0,0,1-6.95,4h-.46a8,8,0,0,1-6.89-4.84L103,89.92,79,132a8,8,0,0,1-7,4H48a8,8,0,0,1,0-16H67.36L97.05,68a8,8,0,0,1,14.3.82L153,166.08l24-42.05a8,8,0,0,1,6.95-4h24a8,8,0,0,1,0,16Z';

/** /brokers/ 籌碼 — Stack（inactive outline 單 path / active fill **3 paths**）。 */
const MEMBER_BROKERS_INACTIVE =
  'M234.36,170A12,12,0,0,1,230,186.37l-96,56a12,12,0,0,1-12.1,0l-96-56a12,12,0,0,1,12.09-20.74l90,52.48L218,165.63A12,12,0,0,1,234.36,170ZM218,117.63,128,170.11,38.05,117.63A12,12,0,0,0,26,138.37l96,56a12,12,0,0,0,12.1,0l96-56A12,12,0,0,0,218,117.63ZM20,80a12,12,0,0,1,6-10.37l96-56a12.06,12.06,0,0,1,12.1,0l96,56a12,12,0,0,1,0,20.74l-96,56a12,12,0,0,1-12.1,0l-96-56A12,12,0,0,1,20,80Zm35.82,0L128,122.11,200.18,80,128,37.89Z';
const MEMBER_BROKERS_ACTIVE: readonly string[] = [
  'M220,169.09l-92,53.65L36,169.09A8,8,0,0,0,28,182.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,169.09Z',
  'M220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09Z',
  'M28,86.91l96,56a8,8,0,0,0,8.06,0l96-56a8,8,0,0,0,0-13.82l-96-56a8,8,0,0,0-8.06,0l-96,56a8,8,0,0,0,0,13.82Z',
];

/** /member/ 我的 — User（inactive outline / active fill）。 */
const MEMBER_MEMBER_INACTIVE =
  'M234.38,210a123.36,123.36,0,0,0-60.78-53.23,76,76,0,1,0-91.2,0A123.36,123.36,0,0,0,21.62,210a12,12,0,1,0,20.77,12c18.12-31.32,50.12-50,85.61-50s67.49,18.69,85.61,50a12,12,0,0,0,20.77-12ZM76,96a52,52,0,1,1,52,52A52.06,52.06,0,0,1,76,96Z';
const MEMBER_MEMBER_ACTIVE =
  'M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z';

/** 選中項 label 內的 caret 小箭頭（Phosphor CaretDown，10px）。 */
const CARET_PATH =
  'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z';

/** caret svg 的 class（逐字照抄實站，**尾端有一個空格**，勿讓 lint trim 掉）。 */
const CARET_CLASS = 'shrink-0 transition-transform ';

/**
 * 內部小工具：以一至多條 path 輸出標準 Phosphor SVG 外框。
 * ⚠ 主圖示 `<svg>` **沒有** `aria-hidden`（逐字對齊實站）。
 */
function TabIcon({ paths, size = 22 }: { paths: readonly string[]; size?: number }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 256 256"
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

/** 選中項 label 內的 caret（**有** aria-hidden，與主圖示相反）。 */
function CaretIcon(): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
      className={CARET_CLASS}
    >
      <path d={CARET_PATH} />
    </svg>
  );
}

/** 訪客態（未登入）5 項：首頁 /、文章 /learn/、學堂 /school/、導覽 /guide/、登入 /login/。 */
const GUEST_ITEMS: readonly BottomTabItem[] = [
  {
    href: '/',
    label: '首頁',
    icon: (size) => <PhosphorHouse size={size} />,
    iconActive: (size) => <PhosphorHouseFill size={size} />,
  },
  {
    href: '/learn/',
    label: '文章',
    icon: (size) => <PhosphorArticle size={size} />,
    iconActive: (size) => <PhosphorArticleFill size={size} />,
  },
  {
    href: '/school/',
    label: '學堂',
    icon: (size) => <PhosphorGraduationCap size={size} />,
    iconActive: (size) => <PhosphorGraduationCapFill size={size} />,
  },
  {
    href: '/guide/',
    label: '導覽',
    icon: (size) => <PhosphorBookOpen size={size} />,
    iconActive: (size) => <PhosphorBookOpenFill size={size} />,
  },
  {
    href: '/login/',
    label: '登入',
    icon: (size) => <PhosphorSignIn size={size} />,
    iconActive: (size) => <PhosphorSignInFill size={size} />,
  },
];

/** 會員態（登入後）5 項：戰情 /today/、市場 /market/、個股 /stock/、籌碼 /brokers/、我的 /member/。 */
const MEMBER_ITEMS: readonly BottomTabItem[] = [
  {
    href: '/today/',
    label: '戰情',
    icon: (size) => <TabIcon paths={[MEMBER_TODAY_INACTIVE]} size={size} />,
    iconActive: (size) => <TabIcon paths={[MEMBER_TODAY_ACTIVE]} size={size} />,
  },
  {
    href: '/market/',
    label: '市場',
    icon: (size) => <TabIcon paths={[MEMBER_MARKET_INACTIVE]} size={size} />,
    iconActive: (size) => <TabIcon paths={[MEMBER_MARKET_ACTIVE]} size={size} />,
  },
  {
    href: '/stock/',
    label: '個股',
    icon: (size) => <TabIcon paths={[MEMBER_STOCK_INACTIVE]} size={size} />,
    iconActive: (size) => <TabIcon paths={[MEMBER_STOCK_ACTIVE]} size={size} />,
  },
  {
    href: '/brokers/',
    label: '籌碼',
    icon: (size) => <TabIcon paths={[MEMBER_BROKERS_INACTIVE]} size={size} />,
    iconActive: (size) => <TabIcon paths={MEMBER_BROKERS_ACTIVE} size={size} />,
  },
  {
    href: '/member/',
    label: '我的',
    icon: (size) => <TabIcon paths={[MEMBER_MEMBER_INACTIVE]} size={size} />,
    iconActive: (size) => <TabIcon paths={[MEMBER_MEMBER_ACTIVE]} size={size} />,
  },
];

/** 兩態共用的 nav class（逐字照抄實站原文，勿改）。 */
const NAV_CLASS =
  'mobile-taskbar fixed inset-x-0 bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden';

/** 訪客態 <a> class 前綴（無 px-0.5）。 */
const GUEST_LINK_CLASS =
  'flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-black transition active:scale-95';

/** 會員態 <a> class 前綴（多一個 px-0.5，逐字照抄實站）。 */
const MEMBER_LINK_CLASS =
  'flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-black transition active:scale-95';

/** 圖示膠囊 class（兩態共用；已選取／未選取再各自串接）。 */
const PILL_CLASS = 'grid place-items-center rounded-full transition-all duration-200';

/** 去掉結尾斜線（根路徑 `/` 保持不變），讓 `/learn/` 與 `/learn` 視為同一條。 */
function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const isLoggedIn = useIsLoggedIn();

  // guest 與 app 皆顯示底部列；只有 'none'（SEO / 靜態頁）回傳 null。
  if (!shouldShowBottomTabBar(pathname)) {
    return null;
  }

  const variant: TabbarVariant = resolveTabbarVariant(isLoggedIn, pathname);
  const isMember = variant === 'member';
  const items = isMember ? MEMBER_ITEMS : GUEST_ITEMS;
  const linkBaseClass = isMember ? MEMBER_LINK_CLASS : GUEST_LINK_CLASS;

  // Active 判定在 render 期直接計算：usePathname() 於 SSR 就有值。
  // 去除結尾斜線後精確比對（/learn/ 與 /learn 視為同一條）。
  const current = normalizePath(pathname);

  return (
    <nav
      aria-label={isMember ? '手機主要導覽' : '手機導覽（未登入）'}
      className={NAV_CLASS}
    >
      {items.map((item) => {
        const isActive = current === normalizePath(item.href);
        return (
          <Link
            key={item.href}
            // 屬性順序對齊實站：aria-current → aria-haspopup → aria-expanded → class → href。
            aria-current={isActive ? 'page' : undefined}
            aria-haspopup={isActive && isMember ? 'dialog' : undefined}
            aria-expanded={isActive && isMember ? false : undefined}
            className={`${linkBaseClass} ${isActive ? 'text-accent' : 'text-muted'}`}
            href={item.href}
          >
            <span
              className={`${PILL_CLASS} ${
                isActive
                  ? 'taskbar-active-pill h-10 w-10 -translate-y-1 bg-accent text-bg'
                  : 'h-7 w-10 text-current'
              }`}
            >
              {isActive ? item.iconActive(21) : item.icon(22)}
            </span>
            {isMember ? (
              <span className="flex max-w-full items-center justify-center gap-0.5">
                <span className="truncate">{item.label}</span>
                {isActive && <CaretIcon />}
              </span>
            ) : (
              <span>{item.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
