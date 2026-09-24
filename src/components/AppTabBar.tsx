'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { shouldShowAppTabBar } from '@/lib/shellRoutes';
import { X } from 'lucide-react';
import {
  PhosphorNotebook,
  PhosphorNotebookFill,
  PhosphorRadar,
  PhosphorRadarFill,
  PhosphorCrosshair,
  PhosphorCrosshairFill,
  PhosphorChart,
  PhosphorChartFill,
  PhosphorChat,
  PhosphorChatFill,
  PhosphorGamepad,
  PhosphorStar,
  PhosphorPie,
  PhosphorMore,
  PhosphorMoreFill,
  type PhosphorIconProps,
} from './icons/phosphor';
import styles from './AppTabBar.module.css';

/**
 * AppTabBar — 底部固定功能列（複刻「股市大佬」App 底部導覽）。
 *
 * 顯示時機：/diary、/review、/chart、/ai、/radar、/sim、/watchlist、/chips/* 這些頁面
 * 都沒有頂部導覽（Navigation.tsx 對它們回傳 null），因此統一由底部列接手，
 * 讓使用者能在各主要功能之間自由跳轉。其餘頁面回傳 null，避免與既有頂部導覽重複。
 *
 * 版面：5 個主要分頁 + 1 個「更多」抽屜。
 * 主要分頁收錄使用頻率最高的五個入口；「更多」抽屜收錄 P1 功能頁
 * （模擬練習 / 我的關注 / 籌碼研究）與首頁，避免底部列塞入 9 個圖示而難以點擊。
 *
 * Hydration 安全：當前分頁沿用 Navigation.tsx 既有寫法 —— 以 useState('') 起始，
 * 於 useEffect 內才 setPathname；不在 render 期間直接用 usePathname() 計算 active，
 * 以免 server / client 首屏不一致而產生 hydration 警告。
 */

/** 底部列主要分頁鍵值。 */
type TabKey = '/diary' | '/radar' | '/review' | '/chart' | '/ai';

/** 單一分頁定義。icon 型別：Phosphor 圖示元件（regular + fill 兩套）。 */
type TabItem = {
  key: TabKey;
  label: string;
  icon: (props: PhosphorIconProps) => React.ReactElement;
  iconActive: (props: PhosphorIconProps) => React.ReactElement;
};

/** 左→右：看盤日記、資金雷達、戰情室、圖表、AI 問答。 */
const TABS: TabItem[] = [
  { key: '/diary', label: '看盤日記', icon: PhosphorNotebook, iconActive: PhosphorNotebookFill },
  { key: '/radar', label: '資金雷達', icon: PhosphorRadar, iconActive: PhosphorRadarFill },
  { key: '/review', label: '戰情室', icon: PhosphorCrosshair, iconActive: PhosphorCrosshairFill },
  { key: '/chart', label: '圖表', icon: PhosphorChart, iconActive: PhosphorChartFill },
  { key: '/ai', label: 'AI 問答', icon: PhosphorChat, iconActive: PhosphorChatFill },
];

/** 「更多」抽屜中的次要入口。 */
type MoreItem = {
  href: string;
  label: string;
  hint: string;
  icon: (props: PhosphorIconProps) => React.ReactElement;
};

const MORE_ITEMS: MoreItem[] = [
  { href: '/sim', label: '模擬練習', hint: '虛擬資金 1,000,000 練手感', icon: PhosphorGamepad },
  { href: '/watchlist', label: '我的關注', hint: '自選股分群與漲跌提醒', icon: PhosphorStar },
  { href: '/chips/2330', label: '籌碼研究', hint: '分點明細、集保級距、法人歷史', icon: PhosphorPie },
  { href: '/', label: '首頁', hint: '今日精華與產業地圖', icon: PhosphorChart },
];

/** 需要底部列的頁面（App 主分頁）一律交由 @/lib/shellRoutes 的
 *  shouldShowAppTabBar() 判定（單一來源；/chips/2330 這類動態子路徑亦涵蓋）。 */

export default function AppTabBar() {
  const pathname = usePathname();
  const [mountedPath, setMountedPath] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  // 換頁時自動收起「更多」抽屜，避免抽屜殘留在新頁面上。
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // 與 Navigation.tsx 互補 —— App 主分頁由底部列接手導覽。
  if (!shouldShowAppTabBar(pathname)) return null;

  /** 「更多」抽屜中是否有項目符合當前路徑（用於高亮「更多」按鈕）。 */
  const moreActive = MORE_ITEMS.some((item) => item.href === mountedPath);

  return (
    <>
      {moreOpen && (
        <div
          className={styles.moreBackdrop}
          role="presentation"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div className={styles.moreSheet} role="menu" aria-label="更多功能">
          <div className={styles.moreSheetHead}>
            <strong>更多功能</strong>
            <button
              type="button"
              className={styles.moreClose}
              onClick={() => setMoreOpen(false)}
              aria-label="關閉"
            >
              <X size={16} />
            </button>
          </div>
          <ul className={styles.moreList}>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.moreLink} ${mountedPath === item.href ? styles.moreLinkActive : ''}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className={styles.moreLinkText}>
                      <strong>{item.label}</strong>
                      <em>{item.hint}</em>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <nav className={styles.tabBar} aria-label="底部功能列">
        {TABS.map((tab) => {
          const isActive = mountedPath === tab.key;
          const Icon = isActive ? tab.iconActive : tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.key}
              className={`${styles.tabItem} ${isActive ? styles.active : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={isActive ? 21 : 22} aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={`${styles.tabItem} ${moreActive || moreOpen ? styles.active : ''}`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-label="更多功能"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          {moreActive || moreOpen ? (
            <PhosphorMoreFill size={21} aria-hidden="true" />
          ) : (
            <PhosphorMore size={22} aria-hidden="true" />
          )}
          <span>更多</span>
        </button>
      </nav>
    </>
  );
}
