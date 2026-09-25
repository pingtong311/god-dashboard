/**
 * /research 研究中心 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/research.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero header + 研究脈絡表單
 * + 4 張研究視角卡 + 最近研究空狀態）。
 *
 * 資料策略：capture 本頁為「尚未指定代號」的初始狀態；4 張工具卡與
 * 「最近研究」空狀態逐字取自 capture，不虛構歷史紀錄。
 * 注意：capture 本頁沒有「市場分類」與「相關功能切換」次導覽，故不加。
 *
 * 為 Server Component：表單控制項如實呈現 capture 的初始值，不需要 client state。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '研究中心 | 股市大佬 TradeBoss',
  description:
    '把代號填一次，就能帶著同一批股票在不同工具之間切換，不用每個頁面重打代號。研究中心只整理入口與脈絡，非投資建議。',
};

/** 4 張研究視角卡（編號／標籤／標題／說明／結語／連結逐字取自 capture）。 */
const RESEARCH_TOOLS: readonly {
  no: string;
  tag: string;
  title: string;
  desc: string;
  fit: string;
  href: string;
  cta: string;
  selected: boolean;
}[] = [
  {
    no: '01',
    tag: '技術 × 籌碼交集',
    title: '條件掃描',
    desc: '自由勾選日 K 與公開籌碼條件，交集、聯集都可，登入後能保存條件組。',
    fit: '適合從一個想法縮小全市場清單',
    href: '/tools/',
    cta: '開啟條件掃描 →',
    selected: true,
  },
  {
    no: '02',
    tag: '集中度 × 量比',
    title: '歷史籌碼條件',
    desc: '依指定資料日調整集中度、成交量比與股價區間，再回個股核對原始分點。',
    fit: '適合驗證盤後籌碼條件',
    href: '/screener/',
    cta: '開啟歷史籌碼條件 →',
    selected: false,
  },
  {
    no: '03',
    tag: '客觀條件目錄',
    title: '策略條件庫',
    desc: '瀏覽技術、籌碼、價值與大戶變化等既有條件，查看當日符合資料列。',
    fit: '適合還沒有明確條件時開始探索',
    href: '/strategy/',
    cta: '開啟策略條件庫 →',
    selected: false,
  },
  {
    no: '04',
    tag: '2～5 檔相對走勢',
    title: '多股比較',
    desc: '把多檔區間走勢正規化後疊圖，並排核對成交與法人摘要。',
    fit: '適合比較同族群或相似條件標的',
    href: '/compare/',
    cta: '開啟多股比較 →',
    selected: false,
  },
];

export default function ResearchPage() {
  return (
    <div className="page-enter">
      <div>
        <header className="relative overflow-hidden rounded-2xl border border-line bg-surface px-5 pb-6 pt-5 md:px-7 md:pb-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl">
          </div>
          <p className="relative text-[11px] font-black tracking-[0.18em] text-accent">進階：一次查同一批股票</p>
          <div className="relative mt-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">研究中心</h1>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">這頁是給「已經有幾檔想深入研究」的人用的。 把代號填一次，就能帶著同一批股票在不同工具之間切換， 不用每個頁面重打代號。</p>
              <p className="mt-2 max-w-2xl rounded-xl bg-surface-2/60 p-3 text-[12.5px] leading-relaxed text-muted">
                <b className="text-ink">第一次來的話，這頁可以先跳過。</b>想找股票就去「量價觀察」，想看單一檔就去「個股盯盤」， 想看盤勢就去「今日戰情」。等你開始固定追蹤幾檔、 需要反覆比對的時候再回來，這頁才會省時間。</p>
            </div>
            <div className="rounded-xl border border-line bg-bg/60 px-4 py-3">
              <p className="text-xs font-bold text-muted">目前研究脈絡</p>
              <p className="num mt-1 truncate text-lg font-black text-ink">尚未指定代號</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">可只逛工具，也可從個股頁帶條件進來。</p>
            </div>
          </div>
        </header>
        <section aria-labelledby="research-context-title" className="mt-4">
          <form className="grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[1fr_1.2fr_auto] md:items-end">
            <label className="grid gap-1.5">
              <span id="research-context-title" className="text-xs font-black text-muted">研究代號（最多 5 檔）</span>
              <input placeholder="例：2330, 2317" autoComplete="off" className="num min-h-12 rounded-xl border-2 border-line bg-bg px-3.5 text-base font-bold outline-none transition focus:border-accent" defaultValue="" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black text-muted">條件／研究備註</span>
              <input placeholder="例：半導體、月營收連續成長、集中度" className="min-h-12 rounded-xl border-2 border-line bg-bg px-3.5 text-base font-bold outline-none transition focus:border-accent" defaultValue="" />
            </label>
            <button type="submit" className="min-h-12 rounded-xl bg-accent px-5 text-base font-black text-bg transition hover:-translate-y-0.5 active:translate-y-0">套用脈絡</button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="min-h-10 rounded-xl border border-accent/45 bg-accent-soft px-3.5 text-[12.5px] font-black text-accent transition active:scale-[0.98] disabled:opacity-50">儲存跨裝置工作區</button>
            <p className="text-[12px] leading-relaxed text-muted" role="status">尚未建立跨裝置工作區</p>
          </div>
        </section>
        <section aria-labelledby="research-tools-title" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">研究路徑</p>
              <h2 id="research-tools-title" className="mt-1 text-2xl font-black tracking-tight">選一個研究視角</h2>
            </div>
            <p className="max-w-md text-right text-xs leading-relaxed text-muted">URL 可帶 <span className="num">sid／ids／condition／view</span>， 分享或從個股頁返回時會保留脈絡。</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {RESEARCH_TOOLS.map((tool) => (
              <article
                key={tool.no}
                className={
                  tool.selected
                    ? 'group relative overflow-hidden rounded-2xl border p-5 transition duration-200 border-accent bg-accent-soft shadow-[0_16px_40px_rgba(3,20,35,0.18)]'
                    : 'group relative overflow-hidden rounded-2xl border p-5 transition duration-200 border-line bg-surface hover:-translate-y-0.5 hover:border-accent/50'
                }
              >
                <button type="button" className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <div className="flex items-start gap-4">
                    <span
                      className={
                        tool.selected
                          ? 'num grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-sm font-black border-accent bg-accent text-bg'
                          : 'num grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-sm font-black border-line bg-bg text-muted'
                      }
                    >{tool.no}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-black tracking-[0.1em] text-muted">{tool.tag}</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight">{tool.title}</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-[13.5px] leading-relaxed text-muted">{tool.desc}</p>
                  <p className="mt-3 border-t border-line/70 pt-3 text-xs font-bold text-ink">{tool.fit}</p>
                </button>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-muted">{tool.selected ? '目前選取' : '切換研究視角'}</span>
                  <Link
                    href={tool.href}
                    className="rounded-lg bg-ink px-3.5 py-2 text-sm font-black text-bg transition group-hover:bg-accent active:scale-[0.97]"
                  >{tool.cta}</Link>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-line bg-surface-2/70 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            <b className="text-ink">目前選取：條件掃描。</b> 研究中心只整理入口與脈絡；各工具仍使用原本 API、資料日與會員權限，不在前端重算方向或精確點位。</div>
        </section>
        <section aria-labelledby="recent-research-title" className="mt-9">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">跨裝置＋本機紀錄</p>
              <h2 id="recent-research-title" className="mt-1 text-2xl font-black tracking-tight">最近研究</h2>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface px-5 py-8 text-center">
            <p className="font-black">還沒有研究紀錄</p>
            <p className="mt-1 text-sm text-muted">套用脈絡或開啟工具後，最近使用會留在這台裝置。</p>
          </div>
        </section>
      </div>
    </div>
  );
}
