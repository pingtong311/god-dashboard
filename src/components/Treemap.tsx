'use client';

/**
 * 族群熱圖 —— 方塊圖
 * 複刻大佬首頁「族群熱圖」：上市/上櫃/ETF 分群、面積∝市值、色∝漲跌幅
 * 資料來源：/api/skynet/treemap
 */

import { useEffect, useState, useMemo } from 'react';
import { TreemapSector, TreemapStock, TreemapData } from '@/types/market';
import styles from './Treemap.module.css';

interface TreemapProps {
  initialData?: TreemapData | null;
}

const MARKET_LABELS = ['上市', '上櫃', 'ETF', '其他'] as const;
const MARKET_COLORS: Record<string, string> = {
  上市: 'var(--accent)',
  上櫃: 'var(--violet)',
  ETF: 'var(--signal)',
  其他: 'var(--muted)',
};

export default function Treemap({ initialData }: TreemapProps) {
  const [data, setData] = useState<TreemapData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [activeMarket, setActiveMarket] = useState<'全部' | '上市' | '上櫃' | 'ETF' | '其他'>('全部');

  useEffect(() => {
    if (initialData) return;

    let cancelled = false;
    async function fetchTreemap() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/skynet/treemap', { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok || !body?.ok || !body.sectors) {
          throw new Error(body?.message || 'treemap data unavailable');
        }
        if (!cancelled) {
          setData({
            sectors: body.sectors,
            marketGroups: body.marketGroups,
            totalStocks: body.totalStocks,
            date: body.date,
          });
        }
      } catch (err) {
        if (!cancelled) setError('族群熱圖資料載入失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTreemap();
    return () => { cancelled = true; };
  }, [initialData]);

  // 依選擇的市場過濾 sectors
  const filteredSectors = useMemo(() => {
    if (!data) return [];
    if (activeMarket === '全部') return data.sectors;
    return data.marketGroups[activeMarket as keyof typeof data.marketGroups] ?? [];
  }, [data, activeMarket]);

  // 計算總市值（用於面積比例）
  const totalMarketCap = useMemo(() =>
    filteredSectors.reduce((sum, s) => sum + s.totalMarketCap, 0),
  [filteredSectors]);

  if (loading) {
    return (
      <div className={styles.skeleton} aria-busy="true" aria-label="載入族群熱圖中">
        <div className={styles.skeletonTabs}>
          <div className={styles.skeletonTab} /><div className={styles.skeletonTab} />
          <div className={styles.skeletonTab} /><div className={styles.skeletonTab} />
        </div>
        <div className={styles.skeletonGrid} />
      </div>
    );
  }

  if (error || !filteredSectors.length) {
    return (
      <div className={styles.empty} role="alert">
        <span className={styles.emptyIcon} aria-hidden="true">🌡️</span>
        <p className={styles.emptyText}>{error || '暫無族群熱圖資料'}</p>
        <button className={styles.retryBtn} onClick={() => window.location.reload()}>
          重試
        </button>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="treemap-title">
      <header className={styles.header}>
        <h2 id="treemap-title" className={styles.title}>
          <span className={styles.titleIcon} aria-hidden="true">🌡️</span>
          族群熱圖
        </h2>
        <div className={styles.meta}>
          <span className={styles.date}>資料日 {data?.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') ?? '--'}</span>
          <span className={styles.count}>{data?.totalStocks ?? 0} 檔個股</span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="市場別篩選">
        {['全部', ...MARKET_LABELS].map((label) => (
          <button
            key={label}
            role="tab"
            aria-selected={activeMarket === label}
            aria-controls={`panel-${label}`}
            id={`tab-${label}`}
            className={`${styles.tab} ${activeMarket === label ? styles.active : ''}`}
            onClick={() => setActiveMarket(label as typeof activeMarket)}
          >
            {label}
            {label !== '全部' && data?.marketGroups[label as keyof typeof data.marketGroups]?.length !== undefined && (
              <span className={styles.tabCount}>
                {data.marketGroups[label as keyof typeof data.marketGroups].length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: 'var(--up)' }} />
          <span>漲</span>
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: 'var(--down)' }} />
          <span>跌</span>
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: 'var(--muted)' }} />
          <span>平</span>
        </span>
        <span className={styles.legendNote}>面積 ∝ 市值估算 | 色深 ∝ 漲跌幅</span>
      </div>

      <div
        className={styles.grid}
        role="tree"
        aria-label={`${activeMarket} 族群熱圖`}
        style={{
          '--total-cap': totalMarketCap,
        } as React.CSSProperties}
      >
        {filteredSectors.map((sector) => {
          const areaPercent = totalMarketCap > 0
            ? Math.max((sector.totalMarketCap / totalMarketCap) * 100, 0.5)
            : 0;
          const intensity = Math.min(Math.abs(sector.changePercent) / 5, 1); // 5% 為滿強度
          const isUp = sector.changePercent >= 0;

          return (
            <article
              key={sector.sector}
              className={`${styles.cell} ${isUp ? styles.up : styles.down}`}
              role="treeitem"
              aria-label={`${sector.sector}，${sector.count} 檔，漲跌 ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%`}
              style={{
                '--area': `${areaPercent}%`,
                '--intensity': intensity,
                '--up-color': 'var(--up)',
                '--down-color': 'var(--down)',
              } as React.CSSProperties}
            >
              <div className={styles.cellInner}>
                <div className={styles.sectorName}>{sector.sector}</div>
                <div className={styles.sectorStats}>
                  <span className={styles.count}>{sector.count} 檔</span>
                  <span className={`${styles.change} ${isUp ? styles.up : styles.down}`}>
                    {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className={styles.topStocks}>
                  {sector.items.slice(0, 3).map((stock) => (
                    <span
                      key={stock.symbol}
                      className={`${styles.stockTag} ${stock.changePercent >= 0 ? styles.up : styles.down}`}
                    >
                      {stock.symbol}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}