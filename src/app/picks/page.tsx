/**
 * /picks 量價觀察 — 複刻「股市大佬 TradeBoss」實站 captured/login-capture/html/picks.html 的版面，
 * 資料層改接 GOD 辦公室的 sector-sniper（產業龍頭／弱勢同業對比 + BlackScore 狙擊評分）。
 * ----------------------------------------------------------------------------
 * 版面維持實站 <main id="main-content"> 的視覺骨架（MarketCatNav + FeatureSubNav
 * + hero-hud + 兩層 details + 雙切換按鈕 + 說明面板），但榜單資料由 GOD 辦公室產出，
 * 經 GET /api/skynet/god/sector-sniper 讀取，由 <PicksGodPanel> 誠實呈現。
 *
 * 資料策略（誠實，不造假）：
 *   sector-sniper 的 provenance.internal_status 可能為 "DATA_INVALID"（資料不完整），
 *   PicksGodPanel 會顯眼標示；ready:false 時顯示「GOD 辦公室資料尚未產出」，絕不填假數據。
 *
 * 本頁為 Server Component；動態資料由 client 元件 <PicksGodPanel> 在瀏覽器 fetch。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';
import PicksGodPanel from '@/components/PicksGodPanel';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '量價觀察 | 股市大佬 TradeBoss',
  description:
    '依 GOD 辦公室 sector-sniper 產出：各產業相對強的龍頭與相對弱的同業對比，以及 BlackScore 狙擊評分。歷史樣本整理，非買賣建議。',
};

export default function PicksPage() {
  return (
    <>
      <MarketCatNav />
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-6 py-6">
          <p className="text-sm font-medium text-accent">GOD 辦公室 sector-sniper · 收盤後產出</p>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">量價觀察</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">找各產業中相對強的「龍頭」與相對弱的「同業」，並以 BlackScore 評估其狙擊價值；資料由 GOD 辦公室於交易日收盤後產出，現價以收盤價呈現。</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">這頁偏<b className="text-ink">產業輪動／隔日沖</b>視角。 想抱幾天到幾週看 <Link href="/swing/" className="text-accent underline-offset-4 hover:underline">波段條件</Link>； 想觀察主力買超後隔天是否倒貨看 <Link href="/fade/" className="text-accent underline-offset-4 hover:underline">隔日沖分點股</Link>。</p>
        </section>
        <details className="group mt-3">
          <summary className="cursor-pointer text-[12px] leading-relaxed text-muted/75">歷史樣本整理，非買賣建議 <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">本頁只整理 GOD 辦公室已產出的產業對比與評分，不代表未來。 請自行核對資料日、樣本數、流動性與風險界線，並自行承擔決策結果。</p>
        </details>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-xl py-2.5 text-[13.5px] font-black transition bg-accent text-bg">產業龍頭／弱勢同業</button>
          <button className="flex-1 rounded-xl py-2.5 text-[13.5px] font-black transition bg-surface-2 text-muted">BlackScore 評分</button>
        </div>
        <div className="mt-4">
          <div className="data-panel hud-panel glass rounded-2xl p-5  mb-3">
            <p className="text-[14px] font-bold leading-relaxed text-ink">這張榜在找「同一個產業裡，誰相對強、誰相對弱」。</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">領漲的龍頭搭配疲弱的同業，比較像有資金在產業內部輪動，而不是整個產業齊漲齊跌。 兩個條件都成立才會上榜。<b className="text-ink">上榜不等於會漲</b>，它只是「值得再看一眼」的清單，最後仍要回到分點、法人與日 K 驗證。</p>
          </div>
          <details className="mb-3 rounded-2xl border border-line/80 bg-surface/70 p-4">
            <summary className="cursor-pointer text-[13.5px] font-black text-accent">這張榜怎麼讀？（第一次用先看）</summary>
            <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
              <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
                <span>這頁怎麼看？（點開，30 秒讀完）</span>
                <span className="text-muted transition group-open:rotate-180">▾</span>
              </summary>
              <dl className="mt-3 grid gap-2">
                <div>
                  <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">GOD 辦公室按產業比對「龍頭」與「弱勢同業」，並給出一張 BlackScore 狙擊評分，標註已具備與尚缺的評分成分。</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看產業龍頭與弱勢同業的漲跌幅、成交量與成交金額，再點進個股核對分點、法人與日 K；不要只看單一排行。</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">把它當研究起點：排行只描述已發生的產業輪動，不代表下一個交易日方向。若 BlackScore 標示「DATA_INVALID」，代表該批資料不完整，僅供參考。</dd>
                </div>
              </dl>
            </details>
          </details>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">資料由 GOD 辦公室於<b className="text-ink">交易日收盤後</b>產出，經峰子 App 讀取呈現；評分完整度依 GOD 辦公室當日資料而定。</p>
          {/* 動態資料：GOD 辦公室 sector-sniper（誠實呈現，含 DATA_INVALID 標示） */}
          <PicksGodPanel />
        </div>
      </div>
    </>
  );
}
