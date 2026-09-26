/**
 * 注意與處置（今日戰情摘要版）—— today.html 逐字複刻外殼，名單誠實骨架。
 * ----------------------------------------------------------------------------
 * 實站面板含「處置中 18 檔」與 3 筆處置名單（分盤撮合＋日期區間）。
 * 處置名單依交易所盤後公告更新，本站無對應資料源（與 /risk、/ranking 同策略），
 * 故標題列與「監理中心」連結照抄，面板內容以 role="status" 骨架呈現，
 * 絕不寫死 capture 截圖裡的名單與數字。
 */
import type { ReactElement } from 'react';
import ArrowRightLink from '@/components/ArrowRightLink';
import { ICON_WARNING } from './today-data';

export default function RiskBrief(): ReactElement {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[14px] font-black text-ink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="currentColor"
            viewBox="0 0 256 256"
            aria-hidden="true"
          >
            <path d={ICON_WARNING} />
          </svg>
          注意與處置
        </h2>
        <ArrowRightLink href="/risk/">監理中心</ArrowRightLink>
      </div>
      <div
        className="data-panel hud-panel glass rounded-2xl p-5  "
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">正在整理處置名單…</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
            尚未入庫
          </span>
        </div>
        <div className="mt-2 h-5 w-28 animate-pulse rounded bg-surface-2" aria-hidden="true" />
        <ul className="mt-2 space-y-1" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-5 animate-pulse rounded bg-surface-2" />
          ))}
        </ul>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          處置名單依交易所盤後公告更新，本站<b className="text-ink">資料尚未入庫</b>
          ；待入庫後即時呈現，不預先寫死截圖數字。完整名單與制度說明見監理中心。
        </p>
      </div>
    </section>
  );
}
