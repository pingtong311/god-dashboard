'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isMemberShell, shouldShowHeader } from '@/lib/shellRoutes';
import { HUB_SECTIONS } from '@/lib/hubTools';
import { useIsLoggedIn } from '@/lib/authState';
import styles from './Navigation.module.css';

/**
 * Navigation — 頂部導覽列（複刻「股市大佬」官網 site-header）。
 *
 * 實站只有「一套」header 外框，登入前後差別**只在內容**：
 *
 *   外框（兩態共用，逐字照抄實站）：
 *     <header class="site-header sticky top-0 z-40 border-b border-[var(--header-line)]
 *                    bg-[var(--header-bg)] backdrop-blur-xl">
 *       <div class="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-1
 *                   px-3 py-2 sm:gap-2 sm:px-4 lg:gap-3 lg:px-6">
 *
 *   A. 訪客態（未登入）—— 桌面導覽 4 連結：文章 / 學堂 / 關於 / 登入；
 *      右側為「主題切換鈕 + 手機登入鈕」。
 *      來源：extracted/site/home.html（11 個外殼頁同構）。
 *
 *   B. 會員態（登入後）—— 桌面導覽 6 個下拉鈕：今天 / 股票 / 選股 / 我的 / 教學 / 更多；
 *      右側為「全站搜尋鈕 + 推播設定鈴鐺 + 功能抽屜漢堡」。
 *      來源：captured/login-capture/shell/08-header-logged-in-stock.html。
 *
 * ⚠ 本步驟**只照抄按鈕本身、圖示、aria 屬性**；下拉選單的展開內容、
 *   搜尋面板、功能抽屜的實際互動屬後續頁面複刻範圍，暫不實作。
 * ⚠ 會員態的「當前分頁高亮」（實站 /stock 頁把「股票」鈕標為 bg-accent-soft text-accent）
 *   需知道各選單的內容對應，暫不推測；目前 6 鈕皆為未選取樣式，待選單內容複刻後補上。
 *
 * 顯示時機：guest 與 app 皆顯示（由 shellRoutes 的 shouldShowHeader 單一來源判定）。
 * 內容採用訪客態或會員態，則由 isMemberShell（登入狀態 + 登入後路由回退）決定，
 * 與底部列 <BottomTabBar /> 共用同一判定，確保兩者永遠一致。
 *
 * 注意：底部固定列 <BottomTabBar /> 已由 layout.tsx 全域渲染，本元件不重複渲染。
 */

// 是否顯示網站 header 一律交由 @/lib/shellRoutes 的 shouldShowHeader() 判定
// （單一來源；三種外殼 family 的完整說明見該檔開頭註解）。

/** 博主訪客態桌面導覽四項（順序、名稱、路徑皆照抄，不含自行新增項目）。 */
type NavItem = { readonly name: string; readonly path: string };

const NAV_ITEMS: readonly NavItem[] = [
  { name: '文章', path: '/learn/' },
  { name: '學堂', path: '/school/' },
  { name: '關於', path: '/about/' },
  { name: '登入', path: '/login/' },
];

/** 會員態下拉選單單一項目（標題＋白話說明＋路徑）。 */
type MemberMenuItem = {
  readonly title: string;
  readonly desc: string;
  /** 站內路由（含尾斜線），全部指向實站權威路徑（見 src/lib/hubTools.ts）。 */
  readonly href: string;
};

/** 會員態下拉選單定義（標籤、副標、欄數、對齊、項目）。 */
type MemberMenu = {
  readonly label: string;
  readonly subtitle: string;
  /** 項目格線欄數（「更多」為 1 欄窄面板）。 */
  readonly columns: 1 | 2 | 3;
  /** 面板水平對齊（靠右的選單用 right 避免溢出視口）。 */
  readonly align: 'left' | 'right';
  readonly items: readonly MemberMenuItem[];
};

/** 六個分組的外觀後設資料（下拉副標、欄數、對齊）；標籤與項目內容由 HUB_SECTIONS 派生。 */
const MENU_META: Record<
  string,
  { readonly subtitle: string; readonly columns: 1 | 2 | 3; readonly align: 'left' | 'right' }
> = {
  今天: { subtitle: '今天盤怎麼走、日報、大環境', columns: 2, align: 'left' },
  股票: { subtitle: '查一檔：K線、籌碼、大單、技術結構', columns: 2, align: 'left' },
  選股: { subtitle: '用條件找股票：量價、型態、籌碼、估值', columns: 3, align: 'left' },
  我的: { subtitle: '自選、持股、提醒、社群、帳號', columns: 2, align: 'left' },
  教學: { subtitle: '練功房、學堂、文章、問 AI', columns: 2, align: 'left' },
  更多: { subtitle: '法遵與條款', columns: 1, align: 'right' },
};

/**
 * 「全部工具」入口：hub 清單本身沒有這張卡，但實站的「我的」下拉在
 * 「大佬席位」之後放了一個通往 /hub/ 全部工具頁的項目，故在此補上。
 */
const HUB_LINK: MemberMenuItem = {
  title: '全部工具',
  desc: '所有功能一頁看，長按加入捷徑',
  href: '/hub/',
};

/**
 * 會員態桌面導覽六組下拉選單（順序左→右：今天/股票/選股/我的/教學/更多）。
 *
 * 項目內容**完全由 src/lib/hubTools.ts 的 HUB_SECTIONS 派生**——即實站
 * `/hub/`「全部工具」頁的 44 張工具卡（標題、白話副標、href、順序、分組），
 * 確保頂部下拉選單與「全部工具」頁永遠一致、不漂移。
 * 「我的」分組依實站慣例在「大佬席位」後插入「全部工具」。
 */
const MEMBER_MENUS: readonly MemberMenu[] = HUB_SECTIONS.map((section) => {
  const meta = MENU_META[section.heading];
  const items: readonly MemberMenuItem[] =
    section.heading === '我的'
      ? section.tools.flatMap((tool) => (tool.title === '大佬席位' ? [tool, HUB_LINK] : [tool]))
      : section.tools;
  return { label: section.heading, ...meta, items };
});

/** hover 進出下拉選單的防抖延遲（毫秒），避免游標掠過時閃爍。 */
const DROPDOWN_HOVER_DELAY_MS = 130;

/** 下拉選單內容資料在測試中也需要，故 export。 */
export { MEMBER_MENUS };

/** 下拉鈕共用 class（未選取；實站以 bg-accent-soft text-accent 表示選取）。 */
const MEMBER_NAV_BTN_CLASS =
  'flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-black transition xl:px-3 text-ink hover:bg-surface-2';

/** 右側圖示鈕共用 class（鈴鐺 / 漢堡）。 */
const MEMBER_ICON_BTN_CLASS =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-ink';

/** 下拉鈕內的 caret-down（Phosphor CaretDown，13px）。 */
function CaretDownGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="shrink-0 transition-transform "
      aria-hidden="true"
    >
      <path d="M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z" />
    </svg>
  );
}

/** 搜尋圖示（Phosphor MagnifyingGlass，19px）。 */
function SearchGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="19"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="shrink-0 text-accent"
      aria-hidden="true"
    >
      <path d="M232.49,215.51,185,168a92.12,92.12,0,1,0-17,17l47.53,47.54a12,12,0,0,0,17-17ZM44,112a68,68,0,1,1,68,68A68.07,68.07,0,0,1,44,112Z" />
    </svg>
  );
}

/** 鈴鐺圖示（Phosphor Bell，21px）。 */
function BellGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="21"
      height="21"
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d="M225.29,165.93C216.61,151,212,129.57,212,104a84,84,0,0,0-168,0c0,25.58-4.59,47-13.27,61.93A20.08,20.08,0,0,0,30.66,186,19.77,19.77,0,0,0,48,196H208a19.77,19.77,0,0,0,17.31-10A20.08,20.08,0,0,0,225.29,165.93ZM54.66,172C63.51,154,68,131.14,68,104a60,60,0,0,1,120,0c0,27.13,4.48,50,13.33,68ZM172,224a12,12,0,0,1-12,12H96a12,12,0,0,1,0-24h64A12,12,0,0,1,172,224Z" />
    </svg>
  );
}

/** 漢堡圖示（Phosphor List，21px）。 */
function MenuGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="21"
      height="21"
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d="M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128ZM40,76H216a12,12,0,0,0,0-24H40a12,12,0,0,0,0,24ZM216,180H40a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Z" />
    </svg>
  );
}

/**
 * 主題偏好儲存鍵 —— 沿用博主官網實際使用的鍵名。
 * （見各頁 <head> 內嵌腳本：`localStorage.getItem('obsidian-theme')`，值為 'light' | 'dark'）
 *
 * 全站主題系統由 theme-engineer-2-2 統籌；本元件只負責訪客態 header 右上那顆切換鈕，
 * 寫入「同一個鍵」與 <html data-theme>／color-scheme，確保兩邊狀態一致。
 */
const THEME_STORAGE_KEY = 'obsidian-theme';

/** 主題型別（對應 <html data-theme="dark|light">）。 */
type Theme = 'dark' | 'light';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  // Hydration 安全：不在 render 期間直接依 usePathname() 決定「當前項」，
  // 改以 useState('') 起始、於 useEffect 內才同步，避免 SSR/CSR 首屏不一致。
  // （與 BottomTabBar.tsx 同模式：pathname 用於顯示/隱藏判斷，mountedPath 用於當前項。）
  const [mountedPath, setMountedPath] = useState('');

  // 目前主題；首屏固定 'light'（= <html data-theme="light"> 的預設值，對齊實站），
  // mount 後才讀取實際值，避免 hydration 不一致。
  const [theme, setTheme] = useState<Theme>('light');

  // 登入狀態（client-only，初始 false，mount 後才讀 localStorage）→ 決定 header 內容。
  const isLoggedIn = useIsLoggedIn();

  // ── 會員態下拉選單狀態（僅 client 互動後改變，初始固定關閉 → hydration 安全）──
  /** 目前開啟的下拉選單索引；無開啟為 null。 */
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  /** hover 防抖計時器（進出互相清除）。 */
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 六個下拉鈕的 DOM ref（Escape 關閉時把焦點還給按鈕用）。 */
  const menuBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  /** 游標進入按鈕／面板：取消待關閉計時，（短暫延遲後）開啟。 */
  const handleMenuEnter = useCallback((index: number) => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setOpenMenu(index);
      hoverTimerRef.current = null;
    }, DROPDOWN_HOVER_DELAY_MS);
  }, []);

  /** 游標離開按鈕／面板：延遲關閉，其間重新進入即取消。 */
  const handleMenuLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setOpenMenu(null);
      hoverTimerRef.current = null;
    }, DROPDOWN_HOVER_DELAY_MS);
  }, []);

  /** 關閉目前下拉選單；`focusBtn` 為真時把焦點還給該下拉鈕（Escape 用）。 */
  const closeMenu = useCallback((focusBtn?: number) => {
    setOpenMenu(null);
    if (typeof focusBtn === 'number') menuBtnRefs.current[focusBtn]?.focus();
  }, []);

  /** 面板內鍵盤導航：Escape 關閉；↓/↑ 在項目間移動；Home/End 跳首尾。 */
  const handlePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(index);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const links = Array.from(
        event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'),
      );
      if (links.length === 0) return;
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      let next = current;
      if (event.key === 'ArrowDown') next = current + 1 >= links.length ? 0 : current + 1;
      else if (event.key === 'ArrowUp') next = current - 1 < 0 ? links.length - 1 : current - 1;
      else if (event.key === 'Home') next = 0;
      else next = links.length - 1;
      links[next].focus();
    },
    [closeMenu],
  );

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  /** 切換明暗主題：同步 <html data-theme> / color-scheme 與 localStorage。 */
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.style.colorScheme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* localStorage 不可用（如隱私模式）時忽略寫入，仍套用本次切換 */
      }
      return next;
    });
  }, []);

  // guest 與 app 皆顯示網站 header；只有 'none'（SEO / 靜態頁）回傳 null。
  if (!shouldShowHeader(pathname)) {
    return null;
  }

  const isLight = theme === 'light';
  const isMember = isMemberShell(isLoggedIn, pathname);

  /**
   * 是否顯示「返回上一頁」。
   *
   * 博主實測（`extracted/site/`，grep `返回上一頁`）：
   *   首頁 home.html = 0，其餘 10 個外殼頁 = 1；登入後 header 亦同。
   *   → 首頁沒有上一頁可回，故不顯示；這是博主刻意的，不是漏寫。
   * 故僅在非首頁的頁面渲染。（比對前先去結尾斜線，`/` 保持原樣。）
   */
  const strippedPath = pathname.replace(/\/+$/, '');
  const normalizedPath = strippedPath === '' ? '/' : strippedPath;
  const showBack = normalizedPath !== '/';

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* 返回上一頁（手機／平板顯示，lg 以上隱藏；首頁不顯示） */}
        {showBack && (
          <button
            type="button"
            className={styles.backBtn}
            aria-label="返回上一頁"
            onClick={() => router.back()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              fill="currentColor"
              viewBox="0 0 256 256"
              aria-hidden="true"
            >
              <path d="M228,128a12,12,0,0,1-12,12H69l51.52,51.51a12,12,0,0,1-17,17l-72-72a12,12,0,0,1,0-17l72-72a12,12,0,0,1,17,17L69,116H216A12,12,0,0,1,228,128Z" />
            </svg>
          </button>
        )}

        {/* 品牌：Logo + 股市大佬 / TRADEBOSS */}
        <Link href="/" className={styles.brand} aria-label="回股市大佬首頁">
          <img
            src="/brand/tradeboss-logo.png"
            alt="股市大佬 TradeBoss"
            className={styles.logoImg}
          />
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>
              股市<span className={styles.brandAccent}>大佬</span>
            </span>
            <span className={styles.brandSub}>TRADEBOSS</span>
          </span>
        </Link>

        {isMember ? (
          <>
            {/* 會員態桌面導覽（lg 以上顯示）：6 個下拉鈕＋下拉面板 */}
            <nav className="ml-1 hidden min-w-0 items-center gap-0.5 lg:flex">
              {MEMBER_MENUS.map((menu, index) => {
                const isOpen = openMenu === index;
                return (
                  <div
                    key={menu.label}
                    className="relative"
                    onMouseEnter={() => handleMenuEnter(index)}
                    onMouseLeave={handleMenuLeave}
                  >
                    <button
                      ref={(el) => {
                        menuBtnRefs.current[index] = el;
                      }}
                      type="button"
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      aria-controls={`member-menu-${index}`}
                      className={MEMBER_NAV_BTN_CLASS}
                      onClick={() => (isOpen ? closeMenu() : setOpenMenu(index))}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          setOpenMenu(index);
                        }
                      }}
                    >
                      {menu.label}
                      <CaretDownGlyph />
                    </button>
                    {isOpen && (
                      <div
                        id={`member-menu-${index}`}
                        role="menu"
                        aria-label={menu.label}
                        className={`${styles.dropdownPanel} ${
                          menu.align === 'right' ? styles.dropdownPanelRight : ''
                        }`}
                        onKeyDown={(event) => handlePanelKeyDown(event, index)}
                      >
                        <p className={styles.dropdownSubtitle}>{menu.subtitle}</p>
                        <div
                          className={`${styles.dropdownGrid} ${
                            menu.columns === 3
                              ? styles.dropdownCols3
                              : menu.columns === 2
                                ? styles.dropdownCols2
                                : styles.dropdownCols1
                          }`}
                        >
                          {menu.items.map((item) => (
                            <Link
                              key={item.title}
                              href={item.href}
                              role="menuitem"
                              className={styles.dropdownItem}
                              onClick={(event) => {
                                if (item.href === '#') event.preventDefault();
                                closeMenu();
                              }}
                            >
                              <span className={styles.dropdownItemTitle}>{item.title}</span>
                              <span className={styles.dropdownItemDesc}>{item.desc}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            {/* 任一下拉開啟時的轻微變暗背景（點擊關閉） */}
            {openMenu !== null && (
              <div
                className={styles.dropdownBackdrop}
                aria-hidden="true"
                onClick={() => closeMenu()}
              />
            )}

            {/* 右側：全站搜尋 + 推播設定 + 功能抽屜 */}
            <div className="ml-auto flex min-w-0 items-center gap-1 pr-0.5 lg:gap-1.5 lg:pr-0">
              <button
                type="button"
                title="全站搜尋"
                aria-label="搜尋股票或功能，快捷鍵 Command K"
                className="group flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line/80 bg-surface-2/75 text-[12.5px] font-bold text-ink transition hover:border-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:w-auto lg:px-3 xl:w-56"
              >
                <SearchGlyph />
                <span className="hidden min-w-0 flex-1 truncate lg:block">搜尋股票或功能</span>
                <kbd className="hidden shrink-0 rounded-md border border-line bg-bg/70 px-1.5 py-0.5 font-sans text-[11px] font-bold text-muted xl:inline">
                  ⌘ K
                </kbd>
              </button>
              <Link href="/notify/" aria-label="推播設定" className={MEMBER_ICON_BTN_CLASS}>
                <BellGlyph />
              </Link>
              <button
                type="button"
                aria-label="開啟功能抽屜"
                aria-expanded="false"
                className={`${MEMBER_ICON_BTN_CLASS} active:scale-95`}
              >
                <MenuGlyph />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 訪客態桌面導覽（md 以上顯示；手機由 BottomTabBar 底部列負責） */}
            <nav className={styles.nav}>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={styles.navLink}
                  aria-current={mountedPath === item.path ? 'page' : undefined}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* 右側：主題切換 + 手機「登入」 */}
            <div className={styles.actions}>
              {/*
                主題切換鈕 —— 語意是「顯示你要切換過去的目標」，不是顯示當前狀態：
                  當前 light → aria-pressed=true  / title「切換到深色（戰情室）」/ 圖示 ☾ / sr-only「切換深色」
                  當前 dark  → aria-pressed=false / title「切換到淺色（較亮、較清楚）」/ 圖示 ☀ / sr-only「切換淺色」
                （實站即時抓取 pricing/ 兩種主題各一次確認；站方預設由 dark 改 light 後，
                 此鈕預設外觀也隨之改變 —— 這是與 2026-09-17 快照的差異來源。）
              */}
              <button
                type="button"
                className={styles.themeBtn}
                aria-pressed={isLight}
                title={isLight ? '切換到深色（戰情室）' : '切換到淺色（較亮、較清楚）'}
                onClick={toggleTheme}
              >
                <span aria-hidden="true" className={styles.themeGlyph}>
                  {isLight ? '☾' : '☀'}
                </span>
                <span className={styles.srOnly}>{isLight ? '切換深色' : '切換淺色'}</span>
              </button>
              <Link href="/login/" className={styles.loginMobile}>
                登入
              </Link>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
