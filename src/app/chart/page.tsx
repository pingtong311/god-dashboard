'use client';

/**
 * K 線圖頁（/chart）
 *
 * 這是 CandlestickChart / KLinePanel 的「出口」：把已經寫好、但先前沒有任何頁面
 * 引用的圖表元件接上，讓使用者真的看得到。
 *
 * - 以 useSearchParams() 讀取 ?ticker=，因此 /diary 的個股可以直接帶參數跳過來。
 * - 無參數時預設 2330，頁面一打開就有圖，不會是空白。
 * - onClose 不是 no-op：這是獨立頁而非覆蓋層，關閉＝清空選取回到輸入狀態，
 *   但搜尋框永遠保留，頁面不會變成空白。
 * - useSearchParams() 需以 <Suspense> 包住，否則靜態預渲染會報錯（Next.js App Router）。
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { CandlestickChart, Search } from 'lucide-react';
import KLinePanel from '@/components/KLinePanel';
import styles from './chart.module.css';

/** 無 ?ticker= 時的預設代號。 */
const DEFAULT_TICKER = '2330';

function ChartContent() {
  const searchParams = useSearchParams();
  const paramTicker = (searchParams.get('ticker') ?? '').trim().toUpperCase();

  const [input, setInput] = useState(paramTicker || DEFAULT_TICKER);
  const [selected, setSelected] = useState(paramTicker || DEFAULT_TICKER);

  // ?ticker= 變動時（例如從 /diary 點進來）同步輸入框與選取。
  useEffect(() => {
    const t = paramTicker || DEFAULT_TICKER;
    setInput(t);
    setSelected(t);
  }, [paramTicker]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const t = input.trim().toUpperCase();
      if (t) setSelected(t);
    },
    [input]
  );

  // 獨立頁的「關閉」＝清空選取、回到輸入狀態（搜尋框保留，頁面不會空白）。
  const handleClose = useCallback(() => {
    setSelected('');
  }, []);

  return (
    <div className={styles.chartRoot}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}><CandlestickChart size={18} /></span>
            <div>
              <strong>K 線圖</strong>
              <span>K-LINE CHART</span>
            </div>
          </div>

          <form className={styles.search} onSubmit={handleSubmit}>
            <Search size={16} />
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
        </header>

        <div className={styles.content}>
          {selected ? (
            <KLinePanel ticker={selected} onClose={handleClose} market="TW" />
          ) : (
            <div className={styles.placeholder}>
              <CandlestickChart size={30} />
              <p>請輸入股票代號後按「查詢」以顯示 K 線圖</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.chartRoot}>
          <div className={styles.loading}>載入中…</div>
        </div>
      }
    >
      <ChartContent />
    </Suspense>
  );
}
