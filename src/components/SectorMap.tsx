'use client';

/**
 * 產業地圖 —— 32 類股色塊網格
 * 複刻大佬首頁「產業地圖」：漸層色塊、點擊跳轉、漲跌色標示
 * 資料來源：/api/skynet/market-overview?sectorLimit=32
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectorFocus } from '@/types/market';
import styles from './SectorMap.module.css';

interface SectorMapProps {
  /** 預設資料（SSR 傳入），避免首屏閃爍 */
  initialData?: SectorFocus[];
}

export default function SectorMap({ initialData }: SectorMapProps) {
  const [sectors, setSectors] = useState<SectorFocus[]>(initialData ?? []);
  const [loading, setLoading] = useState(!initialData?.length);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData?.length) return; // 已有 SSR 資料

    let cancelled = false;
    async function fetchSectors() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/skynet/market-overview?sectorLimit=32', { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok || !body?.ok || !body.data?.sectorFocus) {
          throw new Error(body?.message || 'sector data unavailable');
        }
        if (!cancelled) setSectors(body.data.sectorFocus);
      } catch (err) {
        if (!cancelled) setError('產業資料載入失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSectors();
    return () => { cancelled = true; };
  }, [initialData]);

  if (loading) {
    return (
      <div className={styles.skeletonGrid} aria-busy="true" aria-label="載入產業地圖中">
        {[...Array(32)].map((_, i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
    );
  }

  if (error || !sectors.length) {
    return (
      <div className={styles.empty} role="alert">
        <span className={styles.emptyIcon} aria-hidden="true">📊</span>
        <p className={styles.emptyText}>{error || '暫無產業資料'}</p>
        <button
          className={styles.retryBtn}
          onClick={() => window.location.reload()}
        >
          重試
        </button>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="sector-map-title">
      <header className={styles.header}>
        <h2 id="sector-map-title" className={styles.title}>
          <span className={styles.titleIcon} aria-hidden="true">🗺️</span>
          產業地圖
        </h2>
        <span className={styles.count}>{sectors.length} 大類股</span>
      </header>

      <div className={styles.grid} role="list" aria-label="32 大類股漲跌表現">
        {sectors.map((sector) => (
          <article
            key={sector.name}
            className={`${styles.card} ${sector.changePercent >= 0 ? styles.up : styles.down}`}
            role="listitem"
          >
            <Link
              href={`/sector/${encodeURIComponent(sector.name)}`}
              className={styles.link}
              aria-label={`${sector.name}，漲跌 ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%`}
            >
              <div className={styles.cardInner}>
                <div className={styles.name}>{sector.name}</div>
                <div className={styles.metrics}>
                  <span className={styles.index}>
                    指數：<span className={styles.indexValue}>{sector.index.toFixed(2)}</span>
                  </span>
                  <span className={`${styles.change} ${sector.changePercent >= 0 ? styles.up : styles.down}`}>
                    {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)} 點
                    ({sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%)
                  </span>
                </div>
                <div className={styles.barWrapper}>
                  <div
                    className={styles.bar}
                    style={{
                      width: `${Math.min(Math.abs(sector.changePercent) * 2, 100)}%`,
                      background: sector.changePercent >= 0
                        ? 'linear-gradient(90deg, var(--up), var(--accent))'
                        : 'linear-gradient(90deg, var(--down), #2fd39a80)',
                    }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}