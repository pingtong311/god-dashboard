/**
 * /picks 量價觀察 — 複刻「股市大佬 TradeBoss」實站 captured/login-capture/html/picks.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（MarketCatNav + FeatureSubNav
 * + hero-hud + 兩層 details + 雙切換按鈕 + 說明面板 + 載入骨架）。
 *
 * 資料策略（誠實骨架，不造假）：
 *   實站 capture 本頁停在「正在整理盤後量價與籌碼…」的載入態；本頁榜單的資料來源
 *   是「盤後分點籌碼」，而分點逐筆／日匯總為付費資料（見
 *   src/app/api/skynet/channel/route.ts：hasChannelData 恆為 false）。
 *   故 SSR 如實呈現 capture 的 role="status" 骨架屏，不填假資料。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '量價觀察 | 股市大佬 TradeBoss',
  description:
    '盤後成交量、分點淨買集中度、量比與流動性排序的量價觀察榜；歷史樣本整理，非買賣建議。',
};

export default function PicksPage() {
  return (
    <>
      <MarketCatNav />
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-6 py-6">
          <p className="text-sm font-medium text-accent">排行依 2026-09-24 盤後籌碼 · 現價盤中即時</p>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">量價觀察</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">排序用盤後成交量、分點淨買集中度、量比與流動性（分點籌碼本來就是盤後才有）； 每一列的現價則是盤中即時、會另標時間。</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">這頁偏<b className="text-ink">當沖／隔日沖</b>（今天買、當天或隔天賣）。 想抱幾天到幾週看 <Link href="/swing/" className="text-accent underline-offset-4 hover:underline">波段條件</Link>； 想觀察主力買超後隔天是否倒貨看 <Link href="/fade/" className="text-accent underline-offset-4 hover:underline">隔日沖分點股</Link>。</p>
        </section>
        <details className="group mt-3">
          <summary className="cursor-pointer text-[12px] leading-relaxed text-muted/75">歷史樣本整理，非買賣建議 <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">本頁只整理已發生的量價、籌碼與歷史樣本，不代表未來。 請自行核對資料日、樣本數、流動性與風險界線，並自行承擔決策結果。</p>
        </details>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-xl py-2.5 text-[13.5px] font-black transition bg-accent text-bg">盤後籌碼排行</button>
          <button className="flex-1 rounded-xl py-2.5 text-[13.5px] font-black transition bg-surface-2 text-muted">誰在領漲</button>
        </div>
        <div className="mt-4">
          <div className="data-panel hud-panel glass rounded-2xl p-5  mb-3">
            <p className="text-[14px] font-bold leading-relaxed text-ink">這張榜在找「昨天收盤時，量突然變大而且買盤集中在少數幾家券商」的股票。</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">量變大代表有人開始注意它；買盤集中代表買的人不多但買得兇， 比較像有特定資金在收貨，而不是散戶各買一點。 兩個條件都成立才會上榜。<b className="text-ink">上榜不等於會漲</b>，它只是「值得再看一眼」的清單。</p>
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
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">盤後篩出籌碼集中、成交活躍且量能放大的股票，並列出資料日與流動性。</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看集中度、量比與成交量，再點進個股盯盤核對分點、法人與日 K；不要只看單一排行。</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">把它當研究起點：排行只描述已發生的量價籌碼，不代表下一個交易日方向。</dd>
                </div>
              </dl>
            </details>
          </details>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">選股基準日（分點／日線結算） <b className="text-ink">2026-09-24</b>
            <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold bg-line/40 text-muted">盤後</span>
            <span className="ml-2">下次更新 平日約 21:30 盤後 ETL；完整日報約 22:01</span>
          </p>
          <div className="grid gap-3" role="status" aria-live="polite">
            <span className="sr-only">正在整理盤後量價與籌碼…</span>
            <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-24">
            </div>
            <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-16">
            </div>
            <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-16">
            </div>
            <p className="text-center text-sm text-muted">正在整理盤後量價與籌碼…</p>
          </div>
        </div>
      </div>
    </>
  );
}
