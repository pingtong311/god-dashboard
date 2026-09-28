/**
 * /patterns K 線型態掃描 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/patterns.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 的靜態說明（FeatureSubNav + hero-hud
 * （含「資料日：…｜盤後日 K」列）+ 說明 details + 頁尾口徑註記）；「資料」部分由
 * <PatternsDataProvider> 集中抓一次自家 API（GET /api/skynet/pattern-screen，本站
 * 自算全市場日 K 幾何），頁首資料日列（PatternsDataDate）與資料區（PatternsClient）
 * 共用同一份狀態。
 *
 * 資料策略（P0-1）：
 *   實站上游已封鎖（以程式打 blackstockai.com/api/pattern-screen 回 HTTP 403），
 *   故不再寫死 capture 快照的 38 檔 W 底清單（w-bottom-rows.ts 已刪除），改以
 *   證交所／櫃買中心公開日 K 自算 7 種型態；KV 尚無日 K 時誠實顯示「資料累積中」。
 *
 * 為 Server Component：靜態文案保持 SSR；互動與資料在用戶端元件。
 */
import type { Metadata } from 'next';
import FeatureSubNav from '@/components/FeatureSubNav';
import PatternsClient from './PatternsClient';
import PatternsDataProvider from './PatternsDataContext';
import PatternsDataDate from './PatternsDataDate';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: 'K 線型態掃描 | 股市大佬 TradeBoss',
  description:
    '電腦幫你從全市場找出正在形成經典 K 線型態的股票：W底、頭肩底、破底翻、M頭、頭肩頂、假突破與收斂三角。依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。',
};

export default function PatternsPage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <PatternsDataProvider>
          <section className="hero-hud px-5 py-6">
            <h1 className="text-2xl font-black md:text-3xl">K 線型態掃描</h1>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">電腦幫你從全市場找出正在形成經典 K 線型態的股票：<b className="text-ink">W底、頭肩底、破底翻、M頭、頭肩頂、假突破</b>與<b className="text-ink">收斂三角</b>。只做已發生K 線型態掃描， 不提供方向或平台計算價位。</p>
            <PatternsDataDate />
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
          <PatternsClient />
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。</p>
        </PatternsDataProvider>
      </div>
    </>
  );
}
