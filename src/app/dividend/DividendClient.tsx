'use client';

/**
 * /dividend 除權息行事曆 — 客戶端資料區（自產真實資料）
 * ============================================================================
 * 版面逐字照抄實站 captured/login-capture/html/dividend.html 的
 * <main id="main-content">：hero-hud ＋ 30 秒說明 details
 * ＋「即將除權息（30 天內）」表格 ＋ 頁尾口徑註記。
 * **版面文字為逐字複刻，不更動**；只有「資料」改接本站自產的
 * /api/skynet/dividend-calendar（上游：證交所 TWT48U + STOCK_DAY_AVG_ALL）。
 *
 * 為什麼是 Client Component：沿用本專案「Server 頁面 + Client 資料區」慣例
 * （見 /cb、/etf-active），載入中顯示誠實骨架、失敗顯示誠實錯誤。
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DividendData, DividendItem } from './dividend-data';

/** 資料載入狀態。 */
type LoadStatus = 'loading' | 'ok' | 'error';

/** 殖利率達此門檻（%）標紅（text-up，紅漲綠跌慣例）。 */
const HIGH_YIELD_THRESHOLD = 5;

/** 數字顯示：去除浮點尾差，最多 2 位小數（例：0.5 →「0.5」、5 →「5」）。 */
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 殖利率文字（null →「—」，不填 0）。 */
function formatYield(pct: number | null): string {
  return pct === null ? '—' : `${pct}%`;
}

export default function DividendClient(): React.ReactElement {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<DividendData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/skynet/dividend-calendar', { cache: 'no-store' });
        if (!res.ok) throw new Error(`bad status ${res.status}`);
        const json = (await res.json()) as DividendData;
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

  const items: DividendItem[] = status === 'ok' && data ? data.items : [];

  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">除權息行事曆</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          未來 30 天要「發股利」的股票都在這，附現金殖利率。 存股族排除息、參與填息行情的必備工具。
        </p>
      </section>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
          <span>這頁怎麼看？（點開，30 秒讀完）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              除息＝公司發現金股利、除權＝發股票股利。除完當天股價會扣掉股利（叫『蒸發』），之後漲回原價叫『填息』、漲不回叫『貼息』。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              看『幾天後除息』安排參與時機；『現金殖利率』＝股息 ÷ 股價，越高領越多，但要配合公司體質判斷會不會填息。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              想賺填息行情：挑殖利率合理、基本面穩、歷史填息率高的；純領息長抱：挑高殖利率龍頭。點代號看個股主力與籌碼。
            </dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark"></span>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">即將除權息（30 天內）</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="table-scroll overflow-x-auto">
          <div className="sticky top-0 z-20 grid grid-cols-[auto_1fr_auto_auto] gap-2 rounded-t-2xl border-b border-line/60 bg-surface px-4 py-2.5 text-sm font-bold text-muted backdrop-blur">
            <span>除息日</span>
            <span>股票</span>
            <span className="text-right">現金股利</span>
            <span className="text-right">殖利率</span>
          </div>
          {status === 'loading' && (
            <div className="px-4 py-4" role="status" aria-live="polite">
              <span className="sr-only">正在整理除權息行事曆…</span>
              <div aria-hidden="true" className="grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface"
                  />
                ))}
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="px-4 py-4" role="status" aria-live="polite">
              <p className="text-[12.5px] leading-relaxed text-muted">
                除權息行事曆<b className="text-ink">暫時無法取得</b>
                ；證交所上游可能忙碌或尚未公布，請稍後再試。本站不顯示未經確認的數字。
              </p>
            </div>
          )}
          {status === 'ok' && items.length === 0 && (
            <div className="px-4 py-4" role="status" aria-live="polite">
              <p className="text-[12.5px] leading-relaxed text-muted">
                未來 30 天<b className="text-ink">目前沒有已排定的除權息行程</b>。
              </p>
            </div>
          )}
          {status === 'ok' && items.length > 0 && (
            <ul>
              {items.map((row) => (
                <li
                  key={`${row.stock_id}-${row.ex_date}`}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-b border-line/60 px-4 py-3 last:border-0"
                >
                  <span className="num text-center">
                    <span className="block text-sm font-black">{row.ex_date.slice(5)}</span>
                    <span className="text-xs text-muted">{row.days_left} 天</span>
                  </span>
                  <Link href={`/stock/?id=${row.stock_id}`} className="min-w-0 truncate">
                    <span className="block truncate font-bold text-accent">{row.label}</span>
                    {row.stock_dividend > 0 ? (
                      <span className="text-xs text-muted">
                        含配股 {formatNumber(row.stock_dividend)} 元
                      </span>
                    ) : null}
                  </Link>
                  <span className="num text-right font-bold">{formatNumber(row.cash_dividend)}</span>
                  <span
                    className={`num text-right font-black ${
                      row.cash_yield_pct !== null && row.cash_yield_pct >= HIGH_YIELD_THRESHOLD
                        ? 'text-up'
                        : ''
                    }`}
                  >
                    {formatYield(row.cash_yield_pct)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        除息＝發現金、除權＝發股票，除完當天股價會扣掉股利（蒸發）；之後漲回原價叫「填息」，填不回叫「貼息」。殖利率高不代表會填息，要看公司體質。客觀資料、非投資建議。
      </p>
    </div>
  );
}
