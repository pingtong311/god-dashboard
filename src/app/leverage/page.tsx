/**
 * /leverage 資券借券
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/leverage.html 的 <main> 內容。
 *
 * 資料誠實原則：借券賣出餘額、大漲券增、下跌資增、券資比偏高等分類需要全市場
 * 盤後資券明細（TWSE 融資融券餘額＋借券賣出餘額），本站無對應資料源，故各分類
 * 以 `role="status"` 載入骨架誠實呈現，絕不寫死 capture 截圖裡的個股數字。
 * 「八大行庫當日買賣超」沿用實站空狀態文案（如實標示抓不到）。
 */

import type { Metadata } from 'next';
import LeverageNav from './LeverageNav';
import './page.css';

export const metadata: Metadata = {
  title: '資券借券｜股市大佬 TradeBoss',
  description:
    '整理融資、融券、借券餘額與公股行庫買賣超，顯示價格變動同時發生的籌碼現象。',
};

/** 誠實載入骨架：一整排卡片形狀的 pulse 區塊（role=status + sr-only 提示）。 */
function SkeletonCards({ label, count }: { label: string; count: number }): React.ReactElement {
  return (
    <div className="grid gap-3" role="status" aria-live="polite">
      <span className="sr-only">正在整理{label}…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="data-panel hud-panel glass rounded-2xl p-5  animate-pulse"
        >
          <div className="h-5 w-40 rounded-lg bg-surface-2" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-14 rounded-xl bg-surface-2" />
            ))}
          </div>
          <div className="mt-3 h-4 w-3/4 rounded-lg bg-surface-2" />
        </div>
      ))}
      <p className="px-1 text-[12.5px] leading-relaxed text-muted">
        {label}<b className="text-ink">資料尚未入庫</b>
        ；本站目前無全市場盤後資券／借券明細資料源，待入庫後即時呈現，不預先寫死截圖數字。
      </p>
    </div>
  );
}

export default function LeveragePage(): React.ReactElement {
  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <p className="text-sm font-medium text-accent">盤後資券統計</p>
        <h1 className="mt-1 text-2xl font-black md:text-3xl">資券借券</h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
          整理融資、融券、借券餘額與公股行庫買賣超， 顯示價格變動同時發生的籌碼現象。
        </p>
      </section>
      <LeverageNav />
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
          <span>這頁怎麼看？（點開，30 秒讀完）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              融資是借款買股，融券與借券是借股賣出，公股行庫則呈現八大官股銀行買賣超。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              依序比較借券變化、公股行庫、大漲券增、下跌資增與券資比偏高等客觀分類。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              各分類描述當日價格與籌碼同時發生的現象，適合作為研究觀察。
            </dd>
          </div>
        </dl>
      </details>
      <details className="group mt-3">
        <summary className="cursor-pointer text-[12px] leading-relaxed text-muted/75">
          歷史樣本整理，非買賣建議 <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          本頁只整理已發生的量價、籌碼與歷史樣本，不代表未來。
          請自行核對資料日、樣本數、流動性與風險界線，並自行承擔決策結果。做空另有軋空、無法回補等額外風險，新手請先用模擬單練習。
        </p>
      </details>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        資料日 <b className="text-ink">尚未入庫</b>
      </p>
      <div id="sbl" className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">借券賣出餘額增加</h2>
          </div>
        </div>
      </div>
      <SkeletonCards label="借券賣出餘額增加名單" count={4} />
      <div id="national" className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">八大行庫當日買賣超</h2>
          </div>
        </div>
      </div>
      <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
        <div className="max-w-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="30"
            height="30"
            fill="currentColor"
            viewBox="0 0 256 256"
            className="mx-auto text-muted"
            aria-hidden="true"
          >
            <path
              d="M216,80c0,26.51-39.4,48-88,48S40,106.51,40,80s39.4-48,88-48S216,53.49,216,80Z"
              opacity="0.2"
            />
            <path d="M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z" />
          </svg>
          <p className="mt-3 font-black text-ink">目前沒有資料</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            八大行庫資料暫時抓不到（約每日 23:30 更新）。
          </p>
        </div>
      </div>
      <div id="squeeze" className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">大漲且融券增加</h2>
          </div>
        </div>
      </div>
      <SkeletonCards label="大漲且融券增加名單" count={4} />
      <div id="dip" className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">下跌且融資增加</h2>
          </div>
        </div>
      </div>
      <SkeletonCards label="下跌且融資增加名單" count={3} />
      <div id="crowded" className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">券資比偏高</h2>
          </div>
        </div>
      </div>
      <SkeletonCards label="券資比偏高名單" count={4} />
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        資券為 T 日盤後資料；分類只描述資料日漲跌與餘額變化，不代表持有人身分、後續方向或操作建議。
      </p>
    </div>
  );
}
