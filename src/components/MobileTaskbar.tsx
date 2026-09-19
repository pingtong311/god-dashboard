'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { shouldShowMobileTaskbar } from '@/lib/shellRoutes';
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
  type PhosphorIconProps,
} from './icons/phosphor';

/**
 * MobileTaskbar — 未登入態底部導覽列（複刻「股市大佬」`mobile-taskbar`）。
 *
 * 逐字照抄博主 11 個外殼頁 <body> 末端、site-footer 之後的固定底欄：
 *   <nav aria-label="手機導覽（未登入）" class="mobile-taskbar fixed inset-x-0
 *        bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))]
 *        grid-cols-5 border-t border-line bg-surface/96
 *        pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"> …5 links… </nav>
 *
 * 五個項目（左→右，順序與 href 皆照抄）：首頁 /、文章 /learn、學堂 /school、
 * 導覽 /guide、登入 /login。每個項目為一 <a>，內含一個圓形圖示膠囊 <span>
 * 與文字標籤 <span>。
 *
 * 已選取態（博主以 `aria-current="page"` 標記）與未選取態的差異，逐項照抄：
 *   1. <a> 加 aria-current="page"；
 *   2. <a> 的 `text-muted` 換成 `text-accent`；
 *   3. 圖示膠囊 <span> 的 `h-7 w-10 text-current` 換成
 *      `taskbar-active-pill h-10 w-10 -translate-y-1 bg-accent text-bg`；
 *   4. 圖示由 regular 換成 fill 字重，且尺寸由 22 改為 21。
 *   （見 icons/phosphor.tsx 對兩種字重的說明。）
 *
 * Hydration 安全：沿用 Navigation.tsx / AppTabBar.tsx 既有寫法 ——
 * 以 useState('') 起始，於 useEffect 內才 setMountedPath；不在 render 期間
 * 直接以 usePathname() 決定「當前項」，避免 SSR/CSR 首屏不一致。
 *
 * 顯示時機：未登入態（guest）。非 guest 路由（/learn/<slug>、/s/<ticker>、
 * /privacy、/terms 及 App 主分頁）回傳 null，交由對應外殼元件接手。
 */

/** 底部列單一項目定義。 */
type TaskbarItem = {
  /** 目的路徑（未帶結尾斜線，對應峰子路由；判定時亦以此正規化比對）。 */
  readonly href: string;
  /** 顯示文字。 */
  readonly label: string;
  /** 未選取（regular）圖示。 */
  readonly Icon: (props: PhosphorIconProps) => React.ReactElement;
  /** 已選取（fill）圖示。 */
  readonly IconActive: (props: PhosphorIconProps) => React.ReactElement;
};

/** 左→右：首頁、文章、學堂、導覽、登入。 */
const TASKBAR_ITEMS: readonly TaskbarItem[] = [
  { href: '/', label: '首頁', Icon: PhosphorHouse, IconActive: PhosphorHouseFill },
  { href: '/learn', label: '文章', Icon: PhosphorArticle, IconActive: PhosphorArticleFill },
  { href: '/school', label: '學堂', Icon: PhosphorGraduationCap, IconActive: PhosphorGraduationCapFill },
  { href: '/guide', label: '導覽', Icon: PhosphorBookOpen, IconActive: PhosphorBookOpenFill },
  { href: '/login', label: '登入', Icon: PhosphorSignIn, IconActive: PhosphorSignInFill },
];

/** 去掉結尾斜線（根路徑 `/` 保持不變），讓 `/learn/` 與 `/learn` 視為同一條。 */
function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

export default function MobileTaskbar() {
  const pathname = usePathname();

  // Hydration 安全：不在 render 期間直接依 usePathname() 決定「當前項」，
  // 改以 useState('') 起始、於 useEffect 內才同步。
  const [mountedPath, setMountedPath] = useState('');

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  // 與 Navigation.tsx / ComplianceBar 相同的顯示判斷（以 usePathname() 為準）。
  if (!shouldShowMobileTaskbar(pathname)) {
    return null;
  }

  // 已選取判定：mountedPath 為空字串代表尚未 mount（首屏），此時不標記任何項目，
  // 避免 SSR 首屏誤亮首頁。mount 後以「去除結尾斜線後精確比對」判定。
  // （底部列只在 guest 路由渲染，且各項目路徑互不為前綴，故精確比對即足夠。）
  const current = normalizePath(mountedPath);

  return (
    <nav
      aria-label="手機導覽（未登入）"
      className="mobile-taskbar fixed inset-x-0 bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {TASKBAR_ITEMS.map((item) => {
        const isActive = mountedPath !== '' && current === normalizePath(item.href);
        const Icon = isActive ? item.IconActive : item.Icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-black transition active:scale-95 ${
              isActive ? 'text-accent' : 'text-muted'
            }`}
          >
            <span
              className={`grid place-items-center rounded-full transition-all duration-200 ${
                isActive
                  ? 'taskbar-active-pill h-10 w-10 -translate-y-1 bg-accent text-bg'
                  : 'h-7 w-10 text-current'
              }`}
            >
              <Icon size={isActive ? 21 : 22} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
