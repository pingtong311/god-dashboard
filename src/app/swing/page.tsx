/**
 * /swing 波段條件 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/swing.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + hero-hud
 * + 說明 details + 資料週期列 + 維度切換 + 16 個條件頁籤 + 大戶持股卡片 40 張
 * + 口徑註記）。
 *
 * 資料策略：capture 本頁為「大戶持股比例增加」頁籤的掃描結果（40 檔卡片），
 * 逐字取自 capture（集保資料週期 2026-09-18、價格資料日 2026-09-24），
 * 為歷史快照，非即時篩選。其餘 15 個條件頁籤在 capture 中只留下計數，
 * 故如實呈現計數，不虛構清單內容。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureSubNav from '@/components/FeatureSubNav';
import { BIG_HOLDER_CARDS } from './big-holder-cards';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '波段條件 | 股市大佬 TradeBoss',
  description:
    '把集保持股級距、均線排列、法人買賣超、營收與區間報酬拆成可核對的歷史條件。不提供未來方向、機率或平台產生價位。',
};

/** 16 個條件頁籤（名稱與計數逐字取自 capture；「大戶持股比例增加」為選取態）。 */
const CONDITION_TABS: readonly { label: string; count: number; active: boolean }[] = [
  { label: '大戶持股比例增加', count: 40, active: true },
  { label: '大戶持股比例減少', count: 40, active: false },
  { label: '收盤／月線／季線排列', count: 20, active: false },
  { label: '距月線正負 2%', count: 20, active: false },
  { label: '外資連買', count: 20, active: false },
  { label: '投信連買', count: 20, active: false },
  { label: '雙法人同買', count: 20, active: false },
  { label: '收盤由月線下方轉為上方', count: 9, active: false },
  { label: '20 日新高且量增', count: 20, active: false },
  { label: '20 日區間報酬排序', count: 20, active: false },
  { label: '族群 20 日報酬排序', count: 20, active: false },
  { label: '融資餘額下降', count: 0, active: false },
  { label: '月營收增減條件', count: 20, active: false },
  { label: '除權息填息', count: 20, active: false },
  { label: '負面敘事與當日跌幅', count: 5, active: false },
  { label: '融資／大戶／量價交集', count: 1, active: false },
];

export default function SwingPage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">波段條件</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">把集保持股級距、均線排列、法人買賣超、營收與區間報酬拆成可核對的歷史條件。 不提供未來方向、機率或平台產生價位。</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">這頁偏<b className="text-ink">波段</b>（抱幾天到幾週）。 想當沖看 <Link href="/picks/" className="text-accent underline-offset-4 hover:underline">量價觀察</Link>； 想觀察隔日沖出貨看 <Link href="/fade/" className="text-accent underline-offset-4 hover:underline">隔日沖分點股</Link>。</p>
        </section>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
            <span>第一次用這頁？點開 30 秒說明</span>
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">每個頁籤是一組「講清楚門檻」的選股條件（例如站上季線、帶量突破…），列出目前符合的股票，給你做波段功課的名單。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">不想每天盯盤、想找「抱幾天到幾週」波段機會的人。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">切換上面的頁籤看不同條件；點任一張卡片到個股頁，核對資料日期與原始數字再決定。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這是「符合歷史條件」的清單，不是保證會漲。同時符合多個條件也只是資料交集，別當成訊號無腦買。</dd>
            </div>
          </dl>
        </details>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">集保資料週期：2026-09-18</p>
          <p className="text-sm text-muted">價格資料日：2026-09-24｜盤後歷史條件</p>
          <div className="flex gap-1.5 rounded-xl bg-surface-2 p-1">
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-bold bg-accent text-white">單一維度</button>
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-bold text-muted">🔗 交集篩選</button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {CONDITION_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={
                tab.active
                  ? 'shrink-0 rounded-xl px-3 py-2 text-sm font-bold bg-accent text-white'
                  : 'shrink-0 rounded-xl px-3 py-2 text-sm font-bold bg-surface-2 text-muted hover:text-ink'
              }
            >
              {tab.label}
              <span className="ml-1 opacity-80">({tab.count})</span>
            </button>
          ))}
        </div>
        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark">
              </span>
              <h2 className="text-lg font-bold tracking-tight md:text-xl">大戶持股比例增加</h2>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {BIG_HOLDER_CARDS.map((card) => (
            <div
              key={card.code}
              className={`data-panel hud-panel glass rounded-2xl p-5  border-l-2 ${card.weekReturnClass === 'text-up' ? 'border-l-up' : 'border-l-down'}`}
            >
              <Link href={`/stock/?id=${card.code}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-black text-accent">{card.code} {card.name}</p>
                  <span className={`num font-black ${card.weekReturnClass}`}>{card.weekReturn}</span>
                </div>
                <div className="mt-1 text-xs text-muted">{card.industry}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-xl bg-surface-2 px-2 py-2">
                    <div className="text-[11px] text-muted">大戶持股</div>
                    <div className="num font-black">{card.holder}</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 px-2 py-2">
                    <div className="text-[11px] text-muted">本週增減</div>
                    <div className={`num font-black ${card.weekChangeClass}`}>{card.weekChange}</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 px-2 py-2">
                    <div className="text-[11px] text-muted">連續週數</div>
                    <div className="num font-black">{card.streak}</div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。</p>
      </div>
    </>
  );
}
