/**
 * /fade 隔日沖分點股 — 複刻「股市大佬 TradeBoss」實站 captured/login-capture/html/fade.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + hero-hud
 * + 兩層 details + 資料區）。
 *
 * 資料策略（誠實，不造假）：
 *   本頁榜單（「隔日沖大戶名單」）的成員 100% 由「券商分點買超」決定；分點逐筆／
 *   日匯總為付費資料（見 src/app/api/skynet/channel/route.ts：hasChannelData 恆為
 *   false），本站沒有此資料源，因此**無法產出**這份名單。
 *   故資料區改以「本站無法提供此資料」的**靜態說明**呈現（明確說明原因）：
 *   - 不再使用 role="status" + animate-pulse 的「載入中」骨架——那會讓「永久無法取得」
 *     的狀態看起來像「正在載入」，是本專案已犯過的錯。
 *   - 不再顯示寫死的「選股基準日 2026-09-24」等具體資料日——既然沒有資料，就不該有資料日。
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
          {/* hero 眉標原為逐字「2026-09-24 盤後掃描」；因本站無資料，移除寫死的具體資料日，只留「盤後掃描」。 */}
          <p className="text-sm font-medium text-accent">盤後掃描</p>
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
        <section className="data-panel hud-panel glass rounded-2xl p-5 mt-4">
          <p className="text-[14.5px] font-bold text-ink">本站無法提供此資料</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            本頁的「隔日沖大戶名單」需要<b className="text-ink">券商分點逐筆／日匯總</b>資料，而分點逐筆為付費來源（本專案 channel route 的 <code>hasChannelData</code> 恆為 false），本站沒有此資料源，因此<b className="text-ink">無法產出</b>這份名單，也不以 0 或空清單佯裝。
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            這頁原本要呈現的是：統計分點淨買超後，次一交易日淨賣超超過前日淨買量一半的歷史樣本；並比較歷史樣本符合率、樣本數、集中度與成交量。結構／比例參考（可自行設提醒）只描述已發生的相對幅度，不是買賣建議。
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            想認識分點的公開統計，可看 <Link href="/brokers/" className="text-accent underline-offset-4 hover:underline">分點名冊</Link>；想找當沖／隔日沖的量價名單看 <Link href="/picks/" className="text-accent underline-offset-4 hover:underline">量價觀察</Link>。
          </p>
        </section>
      </div>
    </>
  );
}
