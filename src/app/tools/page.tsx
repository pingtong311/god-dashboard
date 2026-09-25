/**
 * /tools 自訂條件選股 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/tools.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + 標題
 * + 說明 details + 技術面／籌碼面條件面板 + 掃描控制列）。
 *
 * 資料策略：capture 本頁為條件勾選器的初始狀態（尚未掃描，無結果清單）；
 * 條件按鈕的 title（門檻白話說明）逐字取自 capture。掃描結果需分點／法人
 * 盤後資料，capture 未提供結果，故不虛構結果清單。
 *
 * 為 Server Component：表單控制項如實呈現 capture 的初始值，不需要 client state。
 */
import type { Metadata } from 'next';
import FeatureSubNav from '@/components/FeatureSubNav';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '自訂條件選股 | 股市大佬 TradeBoss',
  description:
    '把技術面與籌碼面勾選後做交集（或聯集），可存成自己的條件組。命中只代表當日條件成立，不是明日會漲。',
};

/** 技術面條件（label 與 title 門檻說明逐字取自 capture）。 */
const TECH_CONDITIONS: readonly { label: string; title: string }[] = [
  { label: '收盤高於前 20 日最高價且量增', title: '資料日收盤高於前 20 日最高價，且成交量為 20 日均量 1.5 倍以上。' },
  { label: '收盤／5 日／20 日均線排列', title: '資料日收盤 > MA5 > MA20。' },
  { label: '單日漲幅與量比條件', title: '資料日漲幅逾 3.5%、量比達 2 倍且收盤高於開盤。' },
  { label: '收盤由 MA20 下方轉為上方', title: '前一資料日收盤不高於 MA20，本資料日收盤高於 MA20。' },
  { label: '單日漲幅與成交額門檻', title: '資料日漲幅 ≥ 5% 且成交金額 ≥ 3 億元。' },
  { label: '向上跳空未回補', title: '開盤高於參考價 1.5% 以上，且當日最低仍高於參考價。' },
  { label: '向下跳空未回補', title: '開盤低於參考價 1.5% 以上，且當日最高仍低於參考價。' },
  { label: '布林通道上軌', title: '資料日收盤觸及或高於 20 日均線＋2 倍標準差；只描述目前區間位置。' },
  { label: '布林通道中軌附近', title: '資料日收盤位於 20 日均線上下 1% 內。' },
  { label: '布林通道下軌', title: '資料日收盤觸及或低於 20 日均線－2 倍標準差；只描述目前區間位置。' },
];

/** 籌碼面條件（label 與 title 門檻說明逐字取自 capture）。 */
const CHIP_CONDITIONS: readonly { label: string; title: string }[] = [
  { label: '外資連買 3 日', title: '外資連續 3 個交易日買超。' },
  { label: '投信連買 3 日', title: '投信連續 3 個交易日買超。' },
  { label: '外資與投信當日同買超', title: '資料日外資與投信買賣超皆為正值。' },
  { label: '前 15 分點淨買占比', title: '前 15 分點淨買占成交量 ≥ 15%，且收盤高於開盤。' },
  { label: '融資大增', title: '融資餘額較前一資料日增加 ≥ 3%。' },
  { label: '融資大減', title: '融資餘額較前一資料日減少 ≥ 3%。' },
  { label: '融券大增', title: '融券餘額較前一資料日增加 ≥ 5%。' },
];

export default function ToolsPage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">自訂條件選股</h1>
        <p className="mt-1 text-[13.5px] text-muted">把技術面與籌碼面勾選後做交集（或聯集），可存成自己的條件組。</p>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">對齊對手「條件掃描器」的交集思維：例如「站回月線 ∩ 外資連買」。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">勾條件 → 掃描。登入後可存名稱，之後一鍵套用。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">命中只代表當日條件成立，不是明日會漲。</dd>
            </div>
          </dl>
        </details>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <p className="mb-2 font-black">技術面</p>
            <div className="flex flex-wrap gap-2">
              {TECH_CONDITIONS.map((cond) => (
                <button
                  key={cond.label}
                  type="button"
                  title={cond.title}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-bold bg-surface-2 text-muted"
                >
                  {cond.label}
                </button>
              ))}
            </div>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <p className="mb-2 font-black">籌碼面</p>
            <div className="flex flex-wrap gap-2">
              {CHIP_CONDITIONS.map((cond) => (
                <button
                  key={cond.label}
                  type="button"
                  title={cond.title}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-bold bg-surface-2 text-muted"
                >
                  {cond.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold">
            <option value="and">交集 AND（兩邊都要）</option>
            <option value="or">聯集 OR（一邊即可）</option>
          </select>
          <button type="button" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  ">掃描 （2026-09-24）</button>
          <input placeholder="條件名稱" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" defaultValue="" />
          <button type="button" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 border-2 border-line bg-surface text-muted hover:border-accent hover:text-accent  ">存條件</button>
        </div>
      </div>
    </>
  );
}
