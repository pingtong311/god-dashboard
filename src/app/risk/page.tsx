/**
 * /risk 注意與處置
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/risk.html 的 <main> 內容。
 * 含「市場分類」（MarketCatNav）與「相關功能切換」（FeatureSubNav）次導覽。
 *
 * 資料誠實原則：處置中／處置候選／融券回補期間／暫停先賣後買／當日沖銷成交量值
 * 依交易所盤後公告更新，本站無對應資料源，故以 `role="status"` 載入骨架誠實呈現，
 * 絕不寫死 capture 截圖裡的名單。「注意股」與「暫停交易」沿用實站空狀態文案。
 */

import type { Metadata } from 'next';
import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';
import DataCaveatDetails from '@/components/DataCaveatDetails';
import './page.css';

export const metadata: Metadata = {
  title: '注意與處置｜股市大佬 TradeBoss',
  description: '交易所公開的處置中、即將分盤與相關制度名單。',
};

/** 空狀態（逐字照抄 risk.html：Phosphor Database 圖示 + 標題 + 說明）。 */
function EmptyState({ title, desc }: { title: string; desc: string }): React.ReactElement {
  return (
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
        <p className="mt-3 font-black text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{desc}</p>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{children}</h2>
        </div>
      </div>
    </div>
  );
}

/** 誠實載入骨架（role=status + sr-only 提示 + pulse 卡片）。 */
function SkeletonGrid({
  label,
  cards,
  twoCol,
}: {
  label: string;
  cards: number;
  twoCol?: boolean;
}): React.ReactElement {
  return (
    <div
      className={twoCol ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3'}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">正在整理{label}…</span>
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="data-panel hud-panel glass rounded-2xl p-5  animate-pulse"
        >
          <div className="h-5 w-32 rounded-lg bg-surface-2" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-14 rounded-xl bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 text-[12.5px] leading-relaxed text-muted md:col-span-2">
        {label}<b className="text-ink">資料尚未入庫</b>
        ；處置與暫停名單依交易所盤後公告更新，本站待入庫後即時呈現，不預先寫死截圖數字。
      </p>
    </div>
  );
}

export default function RiskPage(): React.ReactElement {
  return (
    <>
      <MarketCatNav />
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">注意與處置</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            交易所公開的處置中、即將分盤與相關制度名單。
          </p>
        </section>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                三類公開制度資料：處置中、處置候選與融券回補期間。處置措施可能改變撮合頻率、當沖資格與流動性，實際措施以交易所公告為準。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                先核對公告期間、處置原因與交易限制；候選名單只是依公開條件整理，不代表一定會被處置。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                要查即將恢復普通交易的日期，請到「事件雷達」頁的「處置解禁」區。
              </dd>
            </div>
          </dl>
        </details>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          資料日 <b className="text-ink">尚未入庫</b>
        </p>
        <SectionHeading>注意</SectionHeading>
        <div className="data-panel hud-panel glass rounded-2xl p-5  ">
          <p className="text-[13.5px] leading-relaxed text-ink">
            注意股名單本站暫不列示，請以交易所最新公告為準。
          </p>
          <p className="mt-2 text-[12.5px] text-muted">
            下方提供處置預警／即將分盤與處置中名單，資料日待入庫後顯示。
          </p>
        </div>
        <SectionHeading>處置預警／即將</SectionHeading>
        <EmptyState title="目前沒有資料" desc="此資料日沒有即將分盤列。" />
        <SectionHeading>處置中</SectionHeading>
        <SkeletonGrid label="處置中名單" cards={6} twoCol />
        <SectionHeading>處置候選</SectionHeading>
        <SkeletonGrid label="處置候選名單" cards={6} twoCol />
        <SectionHeading>融券回補期間</SectionHeading>
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="p-4" role="status" aria-live="polite">
            <span className="sr-only">正在整理融券回補期間名單…</span>
            <div aria-hidden="true" className="grid gap-2 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface"
                />
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              融券回補期間名單<b className="text-ink">資料尚未入庫</b>；依交易所盤後公告更新。
            </p>
          </div>
        </div>
        <SectionHeading>暫停先賣後買</SectionHeading>
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="p-4" role="status" aria-live="polite">
            <span className="sr-only">正在整理暫停先賣後買名單…</span>
            <div aria-hidden="true" className="grid gap-2 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface"
                />
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              暫停先賣後買名單<b className="text-ink">資料尚未入庫</b>；依交易所盤後公告更新。
            </p>
          </div>
        </div>
        <SectionHeading>暫停交易</SectionHeading>
        <EmptyState title="目前沒有資料" desc="資料日沒有暫停交易列。" />
        <SectionHeading>當日沖銷成交量值</SectionHeading>
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="p-4" role="status" aria-live="polite">
            <span className="sr-only">正在整理當日沖銷成交量值…</span>
            <div aria-hidden="true" className="grid gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse h-9 rounded-lg border border-line/70 bg-surface"
                />
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              當日沖銷成交量值<b className="text-ink">資料尚未入庫</b>；為盤後公開統計，待入庫後即時呈現。
            </p>
          </div>
        </div>
        <DataCaveatDetails>
          <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
          <p>時點：盤中為即時快照、法人／分點／資券為盤後</p>
          <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
          <p>處置與暫停名單依交易所盤後公告更新。</p>
          <p>以上是已發生的公開統計，不是進出建議。</p>
        </DataCaveatDetails>
      </div>
    </>
  );
}
