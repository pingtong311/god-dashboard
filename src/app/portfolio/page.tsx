import type { Metadata } from 'next';
import MineSubNav from '../alerts/MineSubNav';

/**
 * /portfolio/「我的持股帳本」。
 *
 * 逐字照抄 captured/login-capture/html/portfolio.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 此頁為**空狀態**：會員尚未記入任何交易流水（淨資產、現金、損益皆 0，
 * 持股／流水／現金流／本地事件全為「目前沒有資料」）。實站未設定時即如此，
 * 不捏造任何假交易或假損益。除權息「未來 30 日」一欄照抄實站訊息：
 * 「既有行事曆目前未回傳相符事件」。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '我的持股帳本：自己記下買賣紀錄，算出手上還有什麼、賺賠多少。資料只有你自己看得到。',
};

/** Phosphor Database（30px）——空狀態圖示，d 值逐字取自 portfolio.html。 */
const DATABASE_PATH =
  'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z';

/** 帳本頂部摘要五格（全部 0，未記入任何流水）。 */
const SUMMARY_CELLS: readonly { dt: string; dd: string; note?: string }[] = [
  { dt: '持股市值（目前）', dd: '0' },
  { dt: '帳本現金（目前）', dd: '0' },
  { dt: '未實現損益（目前）', dd: '0', note: '依目前可取得行情估算' },
  { dt: '已實現損益（累計）', dd: '0', note: '賣出損益加股利再扣費用' },
  { dt: '今日損益估算', dd: '0', note: '除權息日以參考價校正' },
];

/** 現金流六格（全部 0）。 */
const FLOW_CELLS: readonly { dt: string; dd: string; tone?: 'up' | 'down' }[] = [
  { dt: '期初現金', dd: '0' },
  { dt: '目前現金', dd: '0' },
  { dt: '累計流入', dd: '0', tone: 'up' },
  { dt: '累計流出', dd: '0', tone: 'down' },
  { dt: '現金淨變動', dd: '0' },
  { dt: '融資負債淨變動', dd: '0' },
];

/** 類型拆分五格（全部 0）。 */
const BREAKDOWN_ROWS: readonly string[] = ['買入', '賣出', '股利', '費用', '現金調整'];

/** 顶部條列按鈕（實站為錨點切換，本頁照抄其靜態狀態）。 */
const PORTFOLIO_TABS: readonly string[] = [
  '總覽',
  '交易流水',
  '目前持股',
  '現金流與配置',
  '事件日曆',
  '期初值',
];

/** 重複出現的空狀態圖（K 線圖表的空狀態）。 */
function EmptyData({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
      <div className="max-w-md">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" viewBox="0 0 256 256" className="mx-auto text-muted" aria-hidden="true">
          <path d={DATABASE_PATH} opacity="0.2" />
          <path d={DATABASE_PATH} />
        </svg>
        <p className="mt-3 font-black text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>
      </div>
    </div>
  );
}

/** 區塊標題（實站固定結構：section-mark + h2）。 */
function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{title}</h2>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <>
      <MineSubNav active="持股" />
      <div className="page-enter">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">我的持股帳本</h1>
        <p className="mt-1 max-w-[65ch] text-[13.5px] leading-relaxed text-muted">自己記下買賣紀錄，算出手上還有什麼、賺賠多少。資料只有你自己看得到。</p>
        <div className="mt-3 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <p className="text-[13.5px] font-black text-accent">這頁要不要用？</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <b className="text-ink">如果你還沒開始記帳，這頁可以先跳過。</b>它不會自動連你的券商，需要你自己把買賣一筆一筆輸進來， 換回來的是「這幾個月我到底賺還是賠」這個答案。 想先看盤的話，去「今天 → 今日戰情」或「股票 → 個股盯盤」比較實用。</p>
        </div>
        <div className="mt-4" />
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先填目前手上有什麼（期初值），之後每次買賣、領股利、付手續費就記一筆。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">系統按日期把每一筆重播一次，賣出用加權平均成本算，所以順序不會亂。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這是你自己的紀錄，不是券商對帳單，也不會給任何買賣建議。</dd>
            </div>
          </dl>
        </details>
        <nav className="sticky top-16 z-20 -mx-4 mt-4 border-y border-line bg-bg/95 px-4 py-2 backdrop-blur">
          <div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PORTFOLIO_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-bold text-muted transition active:scale-95 hover:border-accent hover:text-accent"
              >
                {tab}
              </button>
            ))}
            <span className="w-4 shrink-0" aria-hidden="true" />
          </div>
        </nav>
        <section id="portfolio-summary" className="scroll-mt-28 pt-4">
          <div className="data-panel hud-panel glass rounded-2xl   overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
              <div className="bg-accent-soft p-5 md:p-6">
                <p className="text-sm font-bold text-accent">淨資產</p>
                <p className="num mt-2 text-3xl font-black tracking-tight text-ink md:text-4xl">0</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">現金加持股市值，再扣除融資負債。</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-5 p-5 sm:grid-cols-3 md:p-6">
                {SUMMARY_CELLS.map((cell) => (
                  <div key={cell.dt} className="min-w-0 border-l border-line pl-3">
                    <dt className="text-[12px] font-bold text-muted">{cell.dt}</dt>
                    <dd className="num mt-1 text-lg font-black md:text-xl text-ink">{cell.dd}</dd>
                    {cell.note ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{cell.note}</p>
                    ) : null}
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">資料日：尚未有資料<span className="mx-2 text-line">|</span>口徑：只有帳本成本，還沒有今天的市場價格<span className="mx-2 text-line">|</span>下次更新：下一個交易日 09:00 開盤後才會有新價格</p>
          <p className="mt-1 text-[12px] text-muted">本頁只重播使用者自己的既往交易。既有持股紀錄視為期初值，流水依日期與流水編號重算；不公開績效，也不提供投資建議。</p>
        </section>
        <SectionHead id="portfolio-ledger" title="交易流水" />
        <div className="data-panel hud-panel glass rounded-2xl p-5  ">
          <form>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">流水類型<select className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent">
                <option value="buy">買入</option>
                <option value="sell">賣出</option>
                <option value="dividend">股利</option>
                <option value="fee">費用</option>
                <option value="cash_adjustment">現金調整</option>
              </select>
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">事件日期<input max="2026-09-24" required className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" type="date" defaultValue="2026-09-24" />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">股票代號<input placeholder="例如 2330" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">張數<input inputMode="decimal" placeholder="例如 5（1 張＝1,000 股）" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">成交價格<input inputMode="decimal" placeholder="例如 580" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">融資負債變動<input inputMode="decimal" placeholder="新增填正數" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted sm:col-span-2">備註（選填）<input placeholder="例如券商對帳單項目" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12.5px] leading-relaxed text-muted">增加張數（回補空單或新增多頭），重新計算加權平均成本。 買賣現金流由張數×1,000×成交價計算。</p>
              <button type="submit" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  shrink-0">新增流水</button>
            </div>
          </form>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">資料日：尚未有資料<span className="mx-2 text-line">|</span>口徑：使用者交易流水全部累計<span className="mx-2 text-line">|</span>下次更新：新增、刪除流水或調整期初值後立即重算</p>
        <div className="mt-4">
          <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
            <div className="max-w-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" viewBox="0 0 256 256" className="mx-auto text-muted" aria-hidden="true">
                <path d={DATABASE_PATH} opacity="0.2" />
                <path d={DATABASE_PATH} />
              </svg>
              <p className="mt-3 font-black text-ink">記錄持股，對照日報</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">記錄持股，對照日報。沒串券商前不當戰績。</p>
              <div className="mt-4">
                <a href="#add" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-black text-bg">新增流水</a>
              </div>
            </div>
          </div>
        </div>
        <SectionHead id="portfolio-holdings" title="目前持股" />
        <EmptyData title="目前沒有資料" hint="目前沒有持股或空單。若已全數平倉，歷史流水與已實現損益仍會保留。" />
        <SectionHead id="portfolio-flow" title="現金流與配置變化" />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-5">
              {FLOW_CELLS.map((cell) => (
                <div key={cell.dt} className="min-w-0 border-l border-line pl-3">
                  <dt className="text-[12px] font-bold text-muted">{cell.dt}</dt>
                  <dd
                    className={`num mt-1 text-lg font-black md:text-xl ${
                      cell.tone === 'up'
                        ? 'text-up'
                        : cell.tone === 'down'
                          ? 'text-down'
                          : 'text-ink'
                    }`}
                  >
                    {cell.dd}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm font-black">類型拆分</p>
              <dl className="mt-2 grid gap-2 text-[12.5px]">
                {BREAKDOWN_ROWS.map((row) => (
                  <div key={row} className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{row}</dt>
                    <dd className="num font-bold text-ink">0</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl   min-w-0 overflow-hidden p-0">
            <div className="border-b border-line px-4 py-3">
              <p className="font-black">近 12 個月現金流</p>
              <p className="mt-0.5 text-[12px] text-muted">流入與流出只計已登錄流水。</p>
            </div>
            <div className="p-5">
              <EmptyData title="目前沒有資料" hint="尚無流水可彙整。" />
            </div>
          </div>
        </div>
        <div className="data-panel hud-panel glass rounded-2xl   mt-4 min-w-0 overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <p className="font-black">配置變化</p>
            <p className="mt-0.5 text-[12px] text-muted">按加權平均成本與帳本現金計算，不含市價波動</p>
          </div>
          <div className="p-5">
            <EmptyData title="目前沒有資料" hint="尚無配置變化。" />
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">資料日：尚未有資料<span className="mx-2 text-line">|</span>口徑：使用者交易流水全部累計<span className="mx-2 text-line">|</span>下次更新：新增、刪除流水或調整期初值後立即重算</p>
        <SectionHead id="portfolio-calendar" title="持股事件日曆" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black">近期除權息</p>
                <p className="mt-1 text-[12px] text-muted">只保留目前持股或流水曾出現的代號。</p>
              </div>
              <span className="shrink-0 rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent">未來 30 日</span>
            </div>
            <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-[12.5px] leading-relaxed text-muted">既有行事曆目前未回傳相符事件。回傳上限為 150 檔，空白不代表保證沒有，仍應核對公司公告。</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">資料日：2026-09-24<span className="mx-2 text-line">|</span>口徑：未來 30 日除權息行事曆<span className="mx-2 text-line">|</span>下次更新：除權息行事曆約每小時更新</p>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <p className="font-black">最近本地事件</p>
            <p className="mt-1 text-[12px] text-muted">來源為使用者自行輸入的交易流水。</p>
            <div className="mt-4">
              <EmptyData title="目前沒有資料" hint="尚無本地交易事件。" />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">資料日：尚未有資料<span className="mx-2 text-line">|</span>口徑：使用者自行輸入的既往交易事件<span className="mx-2 text-line">|</span>下次更新：新增或刪除交易流水後立即重算</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12px] leading-relaxed text-muted">
          <p className="font-bold text-ink">目前資料缺口</p>
          <p className="mt-1">尚未整合股東會、法說會與財報公告</p>
          <p className="mt-1">除權息資料源暫缺時會明確標示，不以空白推定沒有事件</p>
        </div>
        <SectionHead id="portfolio-opening" title="期初值與相容設定" />
        <details className="rounded-2xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-4 font-black">展開期初值設定</summary>
          <div className="border-t border-line p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1.5 text-[12.5px] font-bold text-muted">期初現金<input inputMode="decimal" placeholder="例如 500000" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" defaultValue="0" />
              </label>
              <button type="button" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  shrink-0">儲存期初現金</button>
            </div>
            <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">股票代號<input placeholder="例如 2330" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">期初張數<input inputMode="decimal" placeholder="多頭正數；空單填負數，例如 -5" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">期初平均成本<input inputMode="decimal" placeholder="例如 580" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-bold text-muted">期初融資負債<input inputMode="decimal" placeholder="沒有則填 0" className="num min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 font-bold text-ink outline-none transition focus:border-accent" value="" readOnly />
              </label>
              <button type="submit" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  self-end">儲存期初持股</button>
            </form>
          </div>
        </details>
      </div>
    </>
  );
}
