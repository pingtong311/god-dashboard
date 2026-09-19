'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Navigation.module.css';

/**
 * Navigation — 頂部導覽列（複刻「股市大佬」官網 site-header）。
 *
 * 版面、色票、按鈕、文案皆逐項照抄博主 header：
 *   /Users/sheng-feng/Antigravity-Rule/IOS_design/extracted/site/guide.html
 *   （about / home / login / school 等頁的 header 同構）
 * 導覽四項固定為：文章 /learn/、學堂 /school/、關於 /about/、登入 /login/。
 *
 * 注意：App 底部功能列 <AppTabBar /> 已由 layout.tsx 全域渲染，本元件不重複渲染。
 */

/**
 * 不顯示頂部導覽的路徑前綴。
 *
 * 這 5 條是 App 的「主分頁」（看盤日記 / 資金雷達 / 戰情室 / 圖表 / AI 問答），
 * 已由 <AppTabBar /> 底部功能列接手導覽，且屬於 App 主體；
 * 依博主設計，App 主體不應再出現網站 header，故對其（含子路徑）回傳 null。
 */
const APP_TAB_PREFIXES = ['/diary', '/radar', '/review', '/chart', '/ai'] as const;

/** 博主桌面導覽四項（順序、名稱、路徑皆照抄，不含自行新增項目）。 */
type NavItem = { readonly name: string; readonly path: string };

const NAV_ITEMS: readonly NavItem[] = [
  { name: '文章', path: '/learn/' },
  { name: '學堂', path: '/school/' },
  { name: '關於', path: '/about/' },
  { name: '登入', path: '/login/' },
];

/**
 * 主題偏好儲存鍵 —— 沿用博主官網實際使用的鍵名。
 * （見各頁 <head> 內嵌腳本：`localStorage.getItem('obsidian-theme')`，值為 'light' | 'dark'）
 *
 * 全站主題系統由 theme-engineer-2-2 統籌；本元件只負責 header 右上那顆切換鈕，
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
  // （與 AppTabBar.tsx 同模式：pathname 用於顯示/隱藏判斷，mountedPath 用於當前項。）
  const [mountedPath, setMountedPath] = useState('');

  // 目前主題；首屏固定 'dark'（= <html data-theme="dark"> 的預設值），
  // mount 後才讀取實際值，避免 hydration 不一致。
  const [theme, setTheme] = useState<Theme>('dark');

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

  // App 主分頁（含子路徑）由底部功能列接手，回傳 null 不顯示網站 header。
  const isAppTab = APP_TAB_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isAppTab) {
    return null;
  }

  const isLight = theme === 'light';

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* 返回上一頁（手機／平板顯示，lg 以上隱藏） */}
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

        {/* 桌面導覽（md 以上顯示；手機由 AppTabBar 底部列負責） */}
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
          <button
            type="button"
            className={styles.themeBtn}
            aria-pressed={isLight}
            title="切換到淺色（較亮、較清楚）"
            onClick={toggleTheme}
          >
            <span aria-hidden="true" className={styles.themeGlyph}>
              ☀
            </span>
            <span className={styles.srOnly}>切換淺色</span>
          </button>
          <Link href="/login/" className={styles.loginMobile}>
            登入
          </Link>
        </div>
      </div>
    </header>
  );
}
