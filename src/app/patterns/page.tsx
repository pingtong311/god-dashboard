/**
 * /patterns K 線型態掃描 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/patterns.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + hero-hud
 * + 說明 details + 7 個型態頁籤 + W底說明面板 + 符合清單 38 列 + 口徑註記）。
 *
 * 資料策略：capture 本頁為「已掃描完」狀態，列出 W底（雙重底）38 檔符合清單；
 * 清單逐字取自 capture（資料日 2026-09-24 盤後日 K），為歷史快照，非即時掃描。
 * 其餘 6 個型態頁籤在 capture 中只留下計數（3/3/10/11/14/17），未列出清單，
 * 故如實呈現計數，不虛構清單內容。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureSubNav from '@/components/FeatureSubNav';
import { W_BOTTOM_ROWS } from './w-bottom-rows';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: 'K 線型態掃描 | 股市大佬 TradeBoss',
  description:
    '電腦幫你從全市場找出正在形成經典 K 線型態的股票：W底、頭肩底、破底翻、M頭、頭肩頂、假突破與收斂三角。依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
};

/** 7 個型態頁籤（名稱與計數逐字取自 capture；W底為 capture 中的選取態）。 */
const PATTERN_TABS: readonly { label: string; count: number; active: boolean }[] = [
  { label: 'W底（雙重底）', count: 38, active: true },
  { label: '頭肩底', count: 3, active: false },
  { label: '破底翻（空頭陷阱）', count: 3, active: false },
  { label: 'M頭（雙重頂）', count: 10, active: false },
  { label: '頭肩頂', count: 11, active: false },
  { label: '假突破（多頭陷阱）', count: 14, active: false },
  { label: '收斂三角', count: 17, active: false },
];

export default function PatternsPage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">K 線型態掃描</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">電腦幫你從全市場找出正在形成經典 K 線型態的股票：<b className="text-ink">W底、頭肩底、破底翻、M頭、頭肩頂、假突破</b>與<b className="text-ink">收斂三角</b>。只做已發生K 線型態掃描， 不提供方向或平台計算價位。</p>
          <p className="mt-2 text-sm text-muted">資料日：2026-09-24｜盤後日 K</p>
        </section>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">把線圖老手用肉眼找的『型態』自動化：雙重底、頭肩、假突破、收斂三角，全市場一次掃出來，不用自己一張張翻線圖。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">點上方型態頁籤切換，查看已發生的型態與白話說明；再到『技術分析』核對客觀技術指標，或到『個股盯盤』看歷史籌碼。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">型態只代表歷史幾何條件命中；請核對資料日、成交量與樣本，不把分類外推成未來方向。</dd>
            </div>
          </dl>
        </details>
        <div className="mt-4 flex flex-wrap gap-2">
          {PATTERN_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={
                tab.active
                  ? 'min-h-11 rounded-xl border-2 px-3.5 text-[13.5px] font-bold transition active:scale-95 border-accent bg-accent text-bg'
                  : 'min-h-11 rounded-xl border-2 px-3.5 text-[13.5px] font-bold transition active:scale-95 border-line bg-surface text-muted'
              }
            >
              {tab.label}（{tab.count}）
            </button>
          ))}
        </div>
        <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 border-l-accent">
          <div className="flex items-center gap-2">
            <p className="text-lg font-black">W底（雙重底）</p>
            <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-sm font-bold text-accent">底部幾何</span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">兩個相近低點與中間高點形成的歷史日 K 幾何分類。</p>
        </div>
        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark">
              </span>
              <h2 className="text-lg font-bold tracking-tight md:text-xl">符合的股票（{W_BOTTOM_ROWS.length}）</h2>
            </div>
          </div>
        </div>
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="hidden grid-cols-[1fr_auto_auto] gap-2 border-b border-line/60 px-4 py-2.5 text-sm font-bold text-muted sm:grid">
            <span>股票</span>
            <span className="text-right">成交量</span>
            <span className="text-right">資料日收盤</span>
          </div>
          <div data-stock-result-scope="true">
            <ul>
              {W_BOTTOM_ROWS.map((row) => (
                <li
                  key={row.code}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line/60 px-4 py-3 last:border-0 sm:grid sm:grid-cols-[1fr_auto_auto]"
                >
                  <div className="min-w-0 basis-full sm:basis-auto">
                    <Link
                      href={`/signal/?id=${row.code}`}
                      className="block font-bold text-accent underline-offset-4 hover:underline sm:truncate"
                    >{row.code} {row.name}</Link>
                    <span className="text-xs text-muted">
                      {row.industry}
                      {row.thinVolume ? <span className="ml-1 text-amber-300">⚠量小</span> : null}
                    </span>
                  </div>
                  <span className="num text-right text-sm">
                    <span className="text-[11px] text-muted sm:hidden">量 </span>
                    <span className="font-bold sm:block">{row.volume}</span>
                    <span className="text-xs text-muted"> 張</span>
                  </span>
                  <span className="num ml-auto text-right sm:ml-0">
                    <span className="font-bold sm:block">{row.close}</span>
                    <span className={`ml-1 text-xs font-black sm:ml-0 ${row.changeClass}`}>{row.change}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。</p>
      </div>
    </>
  );
}
