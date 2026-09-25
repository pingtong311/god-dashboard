/**
 * /block-trades 鉅額交易 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/block-trades.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero-hud + 說明 details
 * + 「資料日 24 檔」金額排序清單）。
 *
 * 資料策略：capture 本頁為資料日（2026-09-24）盤後公開的鉅額交易統計，
 * 逐字取自 capture，為歷史快照，非即時成交紀錄。
 * 注意：capture 本頁沒有「市場分類」與「相關功能切換」次導覽，故不加。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { BLOCK_TRADE_ROWS } from './block-trade-rows';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '鉅額交易 | 股市大佬 TradeBoss',
  description:
    '有人一次買賣很大一筆，數量大到不能丟進一般盤面，就會用「鉅額交易」這個管道成交。這裡列出當天發生的紀錄。',
};

export default function BlockTradesPage() {
  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">鉅額交易</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">有人一次買賣很大一筆，數量大到不能丟進一般盤面， 就會用「鉅額交易」這個管道成交。這裡列出當天發生的紀錄。</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">資料日 <b className="text-ink">2026-09-24</b>
          <span className="ml-2">下次更新 下一交易日 23:08</span>
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
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">一般人買股票是丟到市場上跟大家撮合。但如果一次要買賣幾萬張，直接丟進去會把價格打歪，所以交易所另外開了一個管道，讓雙方談好價格後整筆成交，這就是鉅額交易（也叫大宗交易）。當天成交的紀錄盤後會公開，這一頁就是把它們依金額排出來。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想知道「有沒有大戶在私下換手」的人。例如公司大股東轉讓持股、法人之間互相調節部位、私募基金進出，常常會走這個管道。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">看金額最大的幾筆。金額越大代表換手的規模越大。點進個股頁可以對照當天的分點買賣和量價，看這筆大單成交前後，市場上有沒有跟著動。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">鉅額交易只告訴你「有一大筆股票換人拿了」，不會告訴你為什麼換、也不代表股價接下來會漲或跌。買方可能是看好，也可能只是接手別人要出的貨。如果你是短線當沖，這個資料對你幫助不大，看量價和分點會更直接。</dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark">
            </span>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">資料日 {BLOCK_TRADE_ROWS.length} 檔</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <ul>
          {BLOCK_TRADE_ROWS.map((row) => (
            <li key={row.code} className="border-b border-line/60 last:border-0">
              <Link
                href={`/stock/?id=${row.code}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span>
                  <span className="font-black text-accent">{row.code} {row.name}</span>
                  <span className="ml-2 text-xs text-muted">{row.trades}</span>
                </span>
                <span className="num font-black">{row.amount}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
