/**
 * /dividend 除權息行事曆 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/dividend.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero-hud + 說明 details
 * + 「即將除權息（30 天內）」表格 22 列 + 口徑註記）。
 *
 * 資料策略：capture 本頁為已排程的除權息行程（22 檔），逐字取自 capture
 * （資料基準日 2026-09-24），為歷史快照，非即時行程。
 * 注意：capture 本頁沒有「市場分類」與「相關功能切換」次導覽，故不加。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { DIVIDEND_ROWS } from './dividend-rows';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '除權息行事曆 | 股市大佬 TradeBoss',
  description:
    '未來 30 天要「發股利」的股票都在這，附現金殖利率。存股族排除息、參與填息行情的必備工具。客觀資料、非投資建議。',
};

export default function DividendPage() {
  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">除權息行事曆</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">未來 30 天要「發股利」的股票都在這，附現金殖利率。 存股族排除息、參與填息行情的必備工具。</p>
      </section>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
          <span>這頁怎麼看？（點開，30 秒讀完）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">除息＝公司發現金股利、除權＝發股票股利。除完當天股價會扣掉股利（叫『蒸發』），之後漲回原價叫『填息』、漲不回叫『貼息』。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">看『幾天後除息』安排參與時機；『現金殖利率』＝股息 ÷ 股價，越高領越多，但要配合公司體質判斷會不會填息。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想賺填息行情：挑殖利率合理、基本面穩、歷史填息率高的；純領息長抱：挑高殖利率龍頭。點代號看個股主力與籌碼。</dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark">
            </span>
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
          <ul>
            {DIVIDEND_ROWS.map((row) => (
              <li
                key={`${row.code}-${row.date}`}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-b border-line/60 px-4 py-3 last:border-0"
              >
                <span className="num text-center">
                  <span className="block text-sm font-black">{row.date}</span>
                  <span className="text-xs text-muted">{row.days}</span>
                </span>
                <Link href={`/stock/?id=${row.code}`} className="min-w-0 truncate">
                  <span className="block truncate font-bold text-accent">{row.code} {row.name}</span>
                  {row.note ? <span className="text-xs text-muted">{row.note}</span> : null}
                </Link>
                <span className="num text-right font-bold">{row.cash}</span>
                <span className={`num text-right font-black ${row.yieldClass}`}>{row.yield}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">除息＝發現金、除權＝發股票，除完當天股價會扣掉股利（蒸發）；之後漲回原價叫「填息」，填不回叫「貼息」。殖利率高不代表會填息，要看公司體質。客觀資料、非投資建議。</p>
    </div>
  );
}
