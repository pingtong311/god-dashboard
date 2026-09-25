'use client';

/**
 * 主動式ETF — 客戶端互動部分
 * ----------------------------------------------------------------------------
 * 40 檔掛牌清單按鈕（逐字對齊 etf-active.html）；點擊展開。
 * 展開內容（成分股與當日買／賣股數）本站無資料源 → 誠實載入骨架 +
 * 「資料尚未入庫」說明，絕不造假數字。
 */

import { useState } from 'react';
import { ACTIVE_ETFS } from './etfList';

export default function EtfActiveClient(): React.ReactElement {
  const [openCode, setOpenCode] = useState<string | null>(null);

  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">主動式ETF</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          盤後持股明細與異動張數。只陳述已公布的持有與買賣股數，不推論下一步。
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          資料日 <b className="text-ink">2026-09-24</b>
          <span className="ml-2">下次更新 下一交易日 23:08</span>
        </p>
      </section>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
          <span>第一次用這頁？點開 30 秒說明</span>
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              主動式 ETF 不是跟著指數被動抱一籃股票，經理人會自己決定要買哪些、賣哪些。官方每天公布持股與異動，這一頁只把已公開的張數攤開來看。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              想對照「基金今天加減了哪些股票」的人。適合拿來跟自己的自選股或日報標的交叉看，不是拿來跟單。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              點一檔 ETF 展開成分與當日買／賣股數。先看權重最大的幾檔，再看異動張數特別大的。數字是已公布的持有與買賣股數，不是盤中即時。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              異動不是進出場建議。基金加減碼可能只是再平衡或應付贖回，不代表經理人看多看空。實際成交還要看流動性與折溢價。
            </dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              ETF {ACTIVE_ETFS.length} 檔
            </h2>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {ACTIVE_ETFS.map((etf) => {
          const isOpen = openCode === etf.code;
          return (
            <div key={etf.code} className="data-panel hud-panel glass rounded-2xl   p-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenCode(isOpen ? null : etf.code)}
                className="flex w-full min-h-14 items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-black text-accent">
                    {etf.code}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">{etf.name}</span>
                </span>
                <span className="shrink-0 text-[12px] font-bold text-muted">
                  {etf.holdings !== null && `${etf.holdings} 檔持股`}
                  <span className="ml-2">{isOpen ? '收起' : '展開'}</span>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-line/70 px-4 py-4">
                  <div className="grid gap-3" role="status" aria-live="polite">
                    <span className="sr-only">
                      正在整理 {etf.code} {etf.name} 的盤後持股明細…
                    </span>
                    <div
                      aria-hidden="true"
                      className="animate-pulse rounded-xl border border-line/70 bg-surface h-12"
                    />
                    <div
                      aria-hidden="true"
                      className="animate-pulse rounded-xl border border-line/70 bg-surface h-12"
                    />
                    <div
                      aria-hidden="true"
                      className="animate-pulse rounded-xl border border-line/70 bg-surface h-12"
                    />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">
                    這檔 ETF 的盤後持股明細與當日買／賣股數<b className="text-ink">資料尚未入庫</b>
                    ；本站目前只整理了掛牌清單。可至投信官方網站或公開資訊觀測站查詢最新持股。
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
