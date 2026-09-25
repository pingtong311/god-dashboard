'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
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
 * 實站**只有一套**底部列 DOM 結構，登入前後僅 4 處不同：
 *   1. nav 的 `aria-label`：`手機導覽（未登入）` ↔ `手機主要導覽`；
 *   2. 五個 `<a>` 的 href 與 label；
 *   3. 會員態的 `<a>` 多一個 `px-0.5`（訪客態沒有）；
 *   4. 會員態的 label 多包一層：
 *        `<span class="flex max-w-full items-center justify-center gap-0.5"><span class="truncate">戰情</span></span>`
 *      訪客態則是單純 `<span>首頁</span>`。
 *
 * 其餘完全相同，包含：
 *   - nav 的固定 class（逐字照抄實站原文，勿改）；
 *   - 選中態以 `aria-current="page"` 標記；
 *   - 圖示膠囊未選取 `h-7 w-10 text-current`、已選取
 *     `taskbar-active-pill h-10 w-10 -translate-y-1 bg-accent text-bg`；
 *   - 圖示尺寸：未選取 22、已選取 21。
 *
 * 圖示來源：
 *   - 訪客態 5 項沿用 `./icons/phosphor` 的 regular + fill 雙字重
 *     （實站訪客列確實是 regular→fill 切換，已逐頁比對 11 個外殼頁確認）。
 *   - 會員態 5 項為 Phosphor 的**單一字重**圖示（每個只有一個 path，沒有 fill 變體），
 *     故直接內嵌實站原始 SVG path（見下方 MEMBER_*_PATH 常數），不依賴 phosphor.tsx。
 *
 * Hydration 安全：沿用專案既有寫法 —— 以 `useState('')` 起始，於 `useEffect`
 * 內才 `setMountedPath`；登入狀態亦同（`useIsLoggedIn` 初始 false，mount 後才讀）。
 * 不在 render 期間以 `usePathname()` / `localStorage` 直接決定結果。
 *
 * 顯示時機：guest 與 app 皆顯示（由 `shouldShowBottomTabBar` 單一來源判定）；
 * 'none' 路由（/learn/<slug>、/s/<ticker>、/privacy、/terms）回傳 null。
 */

/** 底部列單一項目定義。 */
type BottomTabItem = {
  /** 目的路徑（未帶結尾斜線，對應峰子路由；判定時亦以此正規化比對）。 */
  readonly href: string;
  /** 顯示文字。 */
  readonly label: string;
  /** 未選取（inactive）圖示：以邊長回傳一個 <svg>。 */
  readonly icon: (size: number) => ReactElement;
  /** 已選取（active）圖示：以邊長回傳一個 <svg>。 */
  readonly iconActive: (size: number) => ReactElement;
  /** 額外的 aria 屬性（僅會員態的 /stock 需要，逐字照抄實站）。 */
  readonly ariaHasPopup?: 'dialog';
};

/* ── 會員態 5 個圖示的真實 SVG path（逐字照抄實站，viewBox="0 0 256 256"）─── */

/** /today 戰情（Phosphor House）。 */
const MEMBER_TODAY_PATH =
  'M222.14,105.85l-80-80a20,20,0,0,0-28.28,0l-80,80A19.86,19.86,0,0,0,28,120v96a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V164h24v52a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V120A19.86,19.86,0,0,0,222.14,105.85ZM204,204H164V152a12,12,0,0,0-12-12H104a12,12,0,0,0-12,12v52H52V121.65l76-76,76,76Z';

/** /market 市場（Phosphor ChartLineUp）。 */
const MEMBER_MARKET_PATH =
  'M236,208a12,12,0,0,1-12,12H32a12,12,0,0,1-12-12V48a12,12,0,0,1,24,0v85.55L88.1,95a12,12,0,0,1,15.1-.57l56.22,42.16L216.1,87A12,12,0,1,1,231.9,105l-64,56a12,12,0,0,1-15.1.57L96.58,119.44,44,165.45V196H224A12,12,0,0,1,236,208Z';

/** /stock 個股（Phosphor ChartLine）。 */
const MEMBER_STOCK_PATH =
  'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-8,96H188.64L159,188a8,8,0,0,1-6.95,4h-.46a8,8,0,0,1-6.89-4.84L103,89.92,79,132a8,8,0,0,1-7,4H48a8,8,0,0,1,0-16H67.36L97.05,68a8,8,0,0,1,14.3.82L153,166.08l24-42.05a8,8,0,0,1,6.95-4h24a8,8,0,0,1,0,16Z';

/** /brokers 籌碼（Phosphor Stack）。 */
const MEMBER_BROKERS_PATH =
  'M234.36,170A12,12,0,0,1,230,186.37l-96,56a12,12,0,0,1-12.1,0l-96-56a12,12,0,0,1,12.09-20.74l90,52.48L218,165.63A12,12,0,0,1,234.36,170ZM218,117.63,128,170.11,38.05,117.63A12,12,0,0,0,26,138.37l96,56a12,12,0,0,0,12.1,0l96-56A12,12,0,0,0,218,117.63ZM20,80a12,12,0,0,1,6-10.37l96-56a12.06,12.06,0,0,1,12.1,0l96,56a12,12,0,0,1,0,20.74l-96,56a12,12,0,0,1-12.1,0l-96-56A12,12,0,0,1,20,80Zm35.82,0L128,122.11,200.18,80,128,37.89Z';

/** /member 我的（Phosphor User）。 */
const MEMBER_MEMBER_PATH =
  'M234.38,210a123.36,123.36,0,0,0-60.78-53.23,76,76,0,1,0-91.2,0A123.36,123.36,0,0,0,21.62,210a12,12,0,1,0,20.77,12c18.12-31.32,50.12-50,85.61-50s67.49,18.69,85.61,50a12,12,0,0,0,20.77-12ZM76,96a52,52,0,1,1,52,52A52.06,52.06,0,0,1,76,96Z';

/**
 * 內部小工具：以單一 path 輸出標準 Phosphor SVG 外框。
 * （會員態圖示沒有 fill 變體，故只有一個 path。）
 */
function TabIcon({ d, size = 22 }: { d: string; size?: number }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** 訪客態（未登入）5 項：首頁 /、文章 /learn、學堂 /school、導覽 /guide、登入 /login。 */
const GUEST_ITEMS: readonly BottomTabItem[] = [
  {
    href: '/',
    label: '首頁',
    icon: (size) => <PhosphorHouse size={size} />,
    iconActive: (size) => <PhosphorHouseFill size={size} />,
  },
  {
    href: '/learn',
    label: '文章',
    icon: (size) => <PhosphorArticle size={size} />,
    iconActive: (size) => <PhosphorArticleFill size={size} />,
  },
  {
    href: '/school',
    label: '學堂',
    icon: (size) => <PhosphorGraduationCap size={size} />,
    iconActive: (size) => <PhosphorGraduationCapFill size={size} />,
  },
  {
    href: '/guide',
    label: '導覽',
    icon: (size) => <PhosphorBookOpen size={size} />,
    iconActive: (size) => <PhosphorBookOpenFill size={size} />,
  },
  {
    href: '/login',
    label: '登入',
    icon: (size) => <PhosphorSignIn size={size} />,
    iconActive: (size) => <PhosphorSignInFill size={size} />,
  },
];

/** 會員態（登入後）5 項：戰情 /today、市場 /market、個股 /stock、籌碼 /brokers、我的 /member。 */
const MEMBER_ITEMS: readonly BottomTabItem[] = [
  {
    href: '/today',
    label: '戰情',
    icon: (size) => <TabIcon d={MEMBER_TODAY_PATH} size={size} />,
    iconActive: (size) => <TabIcon d={MEMBER_TODAY_PATH} size={size} />,
  },
  {
    href: '/market',
    label: '市場',
    icon: (size) => <TabIcon d={MEMBER_MARKET_PATH} size={size} />,
    iconActive: (size) => <TabIcon d={MEMBER_MARKET_PATH} size={size} />,
  },
  {
    href: '/stock',
    label: '個股',
    icon: (size) => <TabIcon d={MEMBER_STOCK_PATH} size={size} />,
    iconActive: (size) => <TabIcon d={MEMBER_STOCK_PATH} size={size} />,
    // 實站登入版此項帶 aria-haspopup="dialog" aria-expanded="false"（點它開個股選擇對話框）。
    ariaHasPopup: 'dialog',
  },
  {
    href: '/brokers',
    label: '籌碼',
    icon: (size) => <TabIcon d={MEMBER_BROKERS_PATH} size={size} />,
    iconActive: (size) => <TabIcon d={MEMBER_BROKERS_PATH} size={size} />,
  },
  {
    href: '/member',
    label: '我的',
    icon: (size) => <TabIcon d={MEMBER_MEMBER_PATH} size={size} />,
    iconActive: (size) => <TabIcon d={MEMBER_MEMBER_PATH} size={size} />,
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

  // Hydration 安全：不在 render 期間直接依 usePathname() 決定「當前項」，
  // 改以 useState('') 起始、於 useEffect 內才同步。
  const [mountedPath, setMountedPath] = useState('');
  const isLoggedIn = useIsLoggedIn();

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  // guest 與 app 皆顯示底部列；只有 'none'（SEO / 靜態頁）回傳 null。
  if (!shouldShowBottomTabBar(pathname)) {
    return null;
  }

  const variant: TabbarVariant = resolveTabbarVariant(isLoggedIn, pathname);
  const isMember = variant === 'member';
  const items = isMember ? MEMBER_ITEMS : GUEST_ITEMS;
  const linkBaseClass = isMember ? MEMBER_LINK_CLASS : GUEST_LINK_CLASS;

  // 已選取判定：mountedPath 為空字串代表尚未 mount（首屏），此時不標記任何項目，
  // 避免 SSR 首屏誤亮首頁。mount 後以「去除結尾斜線後精確比對」判定。
  const current = normalizePath(mountedPath);

  return (
    <nav
      aria-label={isMember ? '手機主要導覽' : '手機導覽（未登入）'}
      className={NAV_CLASS}
    >
      {items.map((item) => {
        const isActive = mountedPath !== '' && current === normalizePath(item.href);
        const hasPopup = item.ariaHasPopup !== undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            aria-haspopup={item.ariaHasPopup}
            aria-expanded={hasPopup ? false : undefined}
            className={`${linkBaseClass} ${isActive ? 'text-accent' : 'text-muted'}`}
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
