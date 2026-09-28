'use client';

/**
 * /block-trades 鉅額交易 — 客戶端資料區（自產真實資料）
 * ============================================================================
 * 版面逐字照抄實站 captured/login-capture/html/block-trades.html 的
 * <main id="main-content">：hero-hud（標題＋說明＋資料日）＋ 30 秒說明 details
 * ＋「資料日 N 檔」金額排序清單。**版面文字為逐字複刻，不更動**；只有「資料」
 * 改接本站自產的 /api/skynet/block-trades。
 *
 * 為什麼是 Client Component：本專案既有「Server 頁面 + Client 資料區」慣例
 * （見 /cb、/etf-active），資料由 API route 取得，載入中顯示誠實骨架、失敗
 * 顯示誠實錯誤，絕不寫死或造假數字。
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BlockTradeData } from './block-trades-data';

/** 資料載入狀態。 */
type LoadStatus = 'loading' | 'ok' | 'error';

export default function BlockTradesClient(): React.ReactElement {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<BlockTradeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/skynet/block-trades', { cache: 'no-store' });
        if (!res.ok) throw new Error(`bad status ${res.status}`);
        const json = (await res.json()) as BlockTradeData;
        if (cancelled) return;
        if (!json?.available || !Array.isArray(json.items)) throw new Error('unavailable');
        setData(json);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = status === 'ok' && data ? data.items : [];

  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">鉅額交易</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          有人一次買賣很大一筆，數量大到不能丟進一般盤面， 就會用「鉅額交易」這個管道成交。這裡列出當天發生的紀錄。
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          資料日 <b className="text-ink">{status === 'ok' && data ? data.date : '—'}</b>
          <span className="ml-2">
            下次更新 {status === 'ok' && data ? data.next_update : '下一交易日 23:08'}
          </span>
        </p>
      </section>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
          <span>第一次用這頁？點開 30 秒說明</span>
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              一般人買股票是丟到市場上跟大家撮合。但如果一次要買賣幾萬張，直接丟進去會把價格打歪，所以交易所另外開了一個管道，讓雙方談好價格後整筆成交，這就是鉅額交易（也叫大宗交易）。當天成交的紀錄盤後會公開，這一頁就是把它們依金額排出來。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              想知道「有沒有大戶在私下換手」的人。例如公司大股東轉讓持股、法人之間互相調節部位、私募基金進出，常常會走這個管道。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              看金額最大的幾筆。金額越大代表換手的規模越大。點進個股頁可以對照當天的分點買賣和量價，看這筆大單成交前後，市場上有沒有跟著動。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              鉅額交易只告訴你「有一大筆股票換人拿了」，不會告訴你為什麼換、也不代表股價接下來會漲或跌。買方可能是看好，也可能只是接手別人要出的貨。如果你是短線當沖，這個資料對你幫助不大，看量價和分點會更直接。
            </dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark"></span>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              資料日 {status === 'ok' ? `${items.length} 檔` : '— 檔'}
            </h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        {status === 'loading' && (
          <div className="p-4" role="status" aria-live="polite">
            <span className="sr-only">正在整理鉅額交易資料…</span>
            <div aria-hidden="true" className="grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface"
                />
              ))}
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="p-4" role="status" aria-live="polite">
            <p className="text-[12.5px] leading-relaxed text-muted">
              鉅額交易資料<b className="text-ink">暫時無法取得</b>
              ；證交所上游可能忙碌或尚未公布，請稍後再試。本站不顯示未經確認的數字。
            </p>
          </div>
        )}
        {status === 'ok' && items.length === 0 && (
          <div className="p-4" role="status" aria-live="polite">
            <p className="text-[12.5px] leading-relaxed text-muted">
              最近交易日<b className="text-ink">尚無鉅額交易紀錄</b>。
            </p>
          </div>
        )}
        {status === 'ok' && items.length > 0 && (
          <ul>
            {items.map((row) => (
              <li key={row.stock_id} className="border-b border-line/60 last:border-0">
                <Link
                  href={`/stock/?id=${row.stock_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span>
                    <span className="font-black text-accent">{row.label}</span>
                    <span className="ml-2 text-xs text-muted">{row.n} 筆</span>
                  </span>
                  <span className="num font-black">{row.money_yi.toFixed(2)} 億</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
