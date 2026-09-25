/**
 * /fade 隔日沖分點股 — 複刻「股市大佬 TradeBoss」實站 captured/login-capture/html/fade.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + hero-hud
 * + 兩層 details + 資料日 + 載入骨架）。
 *
 * 資料策略（誠實骨架，不造假）：
 *   實站 capture 本頁停在「正在比對隔日沖大戶名單…」的載入態；榜單依賴盤後分點
 *   買賣超（付費資料，channel route hasChannelData 恆為 false），故 SSR 如實呈現
 *   capture 的 role="status" 骨架屏，不填假資料。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureSubNav from '@/components/FeatureSubNav';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '隔日沖分點股 | 股市大佬 TradeBoss',
  description:
    '整理當日籌碼較集中，且分點買超後次日出現反向賣超的歷史樣本；歷史樣本整理，非買賣建議。',
};

export default function FadePage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <p className="text-sm font-medium text-accent">2026-09-24 盤後掃描</p>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">隔日沖分點股</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">整理當日籌碼較集中，且分點買超後次日出現反向賣超的歷史樣本。</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">這頁在觀察<b className="text-ink">主力買超後隔天是否倒貨</b>。 想找當沖名單看 <Link href="/picks/" className="text-accent underline-offset-4 hover:underline">量價觀察</Link>； 想抱幾天到幾週看 <Link href="/swing/" className="text-accent underline-offset-4 hover:underline">波段條件</Link>。</p>
        </section>
        <details className="group mt-3">
          <summary className="cursor-pointer text-[12px] leading-relaxed text-muted/75">歷史樣本整理，非買賣建議 <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">本頁只整理已發生的量價、籌碼與歷史樣本，不代表未來。 請自行核對資料日、樣本數、流動性與風險界線，並自行承擔決策結果。</p>
        </details>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">統計分點淨買超後，次一交易日淨賣超超過前日淨買量一半的歷史樣本。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">比較歷史樣本符合率、樣本數、集中度與成交量。樣本太少或流動性不足時，統計可信度會降低。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">點入個股盯盤，可核對該日分點買賣超與日 K；請自行判斷資料是否適合研究。</dd>
            </div>
          </dl>
        </details>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">選股基準日（分點結算） <b className="text-ink">2026-09-24</b>
          <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold bg-line/40 text-muted">盤後</span>
          <span className="ml-2">下次更新 平日約 21:30 盤後 ETL</span>
        </p>
        <div className="grid gap-3" role="status" aria-live="polite">
          <span className="sr-only">正在比對隔日沖大戶名單…</span>
          <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-24">
          </div>
          <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-16">
          </div>
          <div aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-16">
          </div>
          <p className="text-center text-sm text-muted">正在比對隔日沖大戶名單…</p>
        </div>
      </div>
    </>
  );
}
