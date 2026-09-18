'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, MessageCircle, NotebookPen, Radar } from 'lucide-react';
import styles from './AppTabBar.module.css';

/**
 * AppTabBar — 底部固定功能列（複刻「股市大佬」App 底部導覽）。
 *
 * 在 /diary、/review、/chart、/ai 四頁顯示：這四頁都沒有頂部導覽（Navigation.tsx 對它們
 * 回傳 null），因此統一由底部列接手，讓使用者能在「看盤日記 / 戰情室 / 圖表 / AI 問答」
 * 之間自由跳轉。其餘頁面回傳 null，避免與既有頂部導覽重複。
 *
 * Hydration 安全：當前分頁沿用 Navigation.tsx 既有寫法 —— 以 useState('') 起始，
 * 於 useEffect 內才 setPathname；不在 render 期間直接用 usePathname() 計算 active，
 * 以免 server / client 首屏不一致而產生 hydration 警告。
 */

/** 底部列分頁鍵值（僅允許這四個路徑）。 */
type TabKey = '/diary' | '/review' | '/chart' | '/ai';

/** 單一分頁定義。icon 型別沿用 review/page.tsx 的 `typeof <icon>` 慣例。 */
type TabItem = {
  key: TabKey;
  label: string;
  icon: typeof NotebookPen;
};

/** 左→右：看盤日記、戰情室、圖表、AI 問答。 */
const TABS: TabItem[] = [
  { key: '/diary', label: '看盤日記', icon: NotebookPen },
  { key: '/review', label: '戰情室', icon: Radar },
  { key: '/chart', label: '圖表', icon: CandlestickChart },
  { key: '/ai', label: 'AI 問答', icon: MessageCircle },
];

export default function AppTabBar() {
  const pathname = usePathname();
  const [mountedPath, setMountedPath] = useState('');

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  // 與 Navigation.tsx 互補 —— /diary、/review、/chart、/ai 四頁皆由底部列接手導覽。
  if (
    pathname !== '/diary' &&
    pathname !== '/review' &&
    pathname !== '/chart' &&
    pathname !== '/ai'
  ) {
    return null;
  }

  return (
    <nav className={styles.tabBar} aria-label="底部功能列">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = mountedPath === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.key}
            className={`${styles.tabItem} ${isActive ? styles.active : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
