'use client';

/**
 * 盤勢觀測台（/skynet/day-trading-sim）
 *
 * 本頁原為「當沖模擬先行版監控台」，內含英文佔位字串（"Waiting for chart data integration..."）
 * 與兩筆捏造的訊號（2330 熔斷、2603 Buy Signal），且配色與「股市大佬」語彙不符。
 *
 * 現已清除所有捏造資料，改為真實內容：
 * - K 線圖：接上真正的 KLinePanel（真資料，走 /api/skynet/kline）。
 * - 類股強弱：改打 /api/skynet/market-overview 取 sectorFocus（真資料）。
 * 取不到資料時顯示空狀態，絕不留假資料。
 *
 * 註：目前沒有任何頁面連結指向本頁（刻意維持）。
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Layers, Search, TrendingUp } from 'lucide-react';
import KLinePanel from '@/components/KLinePanel';
import type { MarketOverview } from '@/types/market';
import styles from './day-trading-sim.module.css';

/** 預設股票代號。 */
const DEFAULT_TICKER = '2330';

/** 台股慣例：紅漲綠跌（深底可讀版）。 */
function toneClass(value: number): string {
  if (value > 0) return styles.up;
  if (value < 0) return styles.down;
  return styles.flat;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  return Number.isFinite(value) && value > 0
    ? value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';
}

export default function MarketWatchPage() {
  const [input, setInput] = useState(DEFAULT_TICKER);
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/skynet/market-overview', { cache: 'no-store' });
        const body = (await res.json()) as { ok?: boolean; data?: MarketOverview };
        if (active && res.ok && body?.ok && body.data) setOverview(body.data);
      } catch {
        // 取不到就維持空狀態，不留任何假資料。
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const t = input.trim().toUpperCase();
      if (t) setTicker(t);
    },
    [input]
  );

  // 關閉＝清空選取回到輸入狀態（搜尋框保留，頁面不會空白）。
  const handleClose = useCallback(() => {
    setTicker('');
  }, []);

  const sectors = overview?.sectorFocus ?? [];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1>SkyNet 盤勢觀測台</h1>
        <p>K 線圖與類股指數強弱一覽</p>
      </header>

      <main className={styles.grid}>
        <section className={styles.chartSection}>
          <div className={styles.sectionHead}>
            <h2><TrendingUp size={16} />K 線圖</h2>
            <form className={styles.search} onSubmit={handleSubmit}>
              <Search size={15} />
              <input
                className={styles.searchInput}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="輸入股票代號（例如 2330）"
                aria-label="股票代號"
                autoComplete="off"
              />
              <button className={styles.searchButton} type="submit">查詢</button>
            </form>
          </div>

          {ticker ? (
            <KLinePanel ticker={ticker} onClose={handleClose} market="TW" />
          ) : (
            <div className={styles.placeholder}>
              <span>請輸入股票代號後按「查詢」以顯示 K 線圖</span>
            </div>
          )}
        </section>

        <section className={styles.sectorSection}>
          <div className={styles.sectionHead}>
            <h2><Layers size={16} />類股強弱</h2>
            <em>{sectors.length ? `漲幅前 ${sectors.length}` : '類股指數'}</em>
          </div>

          {sectors.length ? (
            <ul className={styles.sectorList}>
              {sectors.map((sector) => (
                <li key={sector.name}>
                  <span className={styles.sectorName}>{sector.name}</span>
                  <span className={styles.sectorRight}>
                    <b className={toneClass(sector.changePercent)}>{formatPercent(sector.changePercent)}</b>
                    <i>{formatPrice(sector.index)}</i>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <span>{loading ? '讀取中…' : '暫無類股資料'}</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
