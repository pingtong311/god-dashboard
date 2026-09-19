'use client';

/**
 * 教學專欄索引（/learn）— 互動層
 * ----------------------------------------------------------------------------
 * 由 Server Component（page.tsx）傳入**輕量清單**（每篇僅 slug / kind / title /
 * category / categoryKey / readMinutes），因此本 client 元件不會載入 3.8 MiB 的
 * learn-articles.json（型別與分組函式來自 JSON-free 的 src/lib/learn.ts）。
 *
 * 互動：
 *   - 搜尋（標題 / slug / 分類）。
 *   - 分類篩選：全部 + 11 個主題分類 + 「盤後解讀」（kind: recap 自成一群）。
 *   - 未篩選時分組呈現：盤後解讀在最前，其後依主題分類。
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  countLearnItems,
  filterLearnGroups,
  getLearnGroups,
  LEARN_ALL_KEY,
  RECAP_KEY,
  type LearnIndexItem,
} from '@/lib/learn';
import styles from './learn.module.css';

const ALL_KEY = LEARN_ALL_KEY;

export default function LearnIndex({
  items,
  initialCategory = ALL_KEY,
}: {
  items: LearnIndexItem[];
  initialCategory?: string;
}) {
  const groups = useMemo(() => getLearnGroups(items), [items]);
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');

  const visibleGroups = useMemo(
    () => filterLearnGroups(groups, active, query),
    [groups, active, query]
  );

  const shownCount = countLearnItems(visibleGroups);
  const trimmedQuery = query.trim();

  const chips = [
    { key: ALL_KEY, label: '全部', count: items.length },
    ...groups.map((group) => ({ key: group.key, label: group.label, count: group.items.length })),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>研究文章</h1>
        <p className={styles.desc}>
          從市場、籌碼到分點，每天收盤後更新的研究長文。共 {items.length} 篇。
        </p>

        <input
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋文章標題或關鍵字…"
          aria-label="搜尋文章"
        />
      </header>

      <div className={styles.filters} role="tablist" aria-label="文章分類">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={active === chip.key}
            className={`${styles.chip} ${active === chip.key ? styles.chipActive : ''}`}
            onClick={() => setActive(chip.key)}
          >
            {chip.label}
            <span className={styles.chipCount}>{chip.count}</span>
          </button>
        ))}
      </div>

      {trimmedQuery ? (
        <p className={styles.resultLine} data-testid="learn-result-count">
          搜尋「{trimmedQuery}」找到 {shownCount} 篇
        </p>
      ) : null}

      {shownCount === 0 ? (
        <p className={styles.empty}>沒有符合的文章，換個關鍵字試試。</p>
      ) : null}

      {visibleGroups.map((group) => (
        <section key={group.key} className={styles.group} aria-label={group.label}>
          <h2 className={styles.groupTitle}>
            {group.label}
            {group.key === RECAP_KEY ? <span className={styles.groupTag}>每日回顧</span> : null}
            <span className={styles.count}>{group.items.length} 篇</span>
          </h2>
          <ul className={styles.grid}>
            {group.items.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/learn/${item.slug}`}
                  className={styles.card}
                  data-testid="learn-card"
                >
                  <span className={styles.cardTop}>
                    <span className={styles.badge}>{item.category}</span>
                    {item.readMinutes !== null ? (
                      <span className={styles.read}>閱讀約 {item.readMinutes} 分鐘</span>
                    ) : null}
                  </span>
                  <span className={styles.cardTitle}>{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
