/**
 * M1 頁首 hero（大盤與國際）—— SPEC 會員四頁 §M1，逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * 「分享」按鈕互動：優先 Web Share API，無法分享時複製當前網址到剪貼簿；
 * 使用者取消或複製失敗時靜默處理（快照未觸發，推測即此行為）。
 *
 * Client component：按鈕需瀏覽器 API（navigator.share／clipboard）。
 */
'use client';

import type { MouseEvent, ReactElement } from 'react';

/** Phosphor ShareNetwork（regular，15px）—— 專案 phosphor.tsx 無此圖示，頁內 inline。 */
const SHARE_NETWORK_PATH =
  'M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z';

async function handleShare(): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  const url = window.location.href;
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: '大盤與國際', url });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    // 使用者取消分享，或剪貼簿被阻擋：不拋錯、不變動 UI。
  }
}

export default function MarketHero(): ReactElement {
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    void handleShare();
  };

  return (
    <section className="hero-hud flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
      <h1 className="text-xl font-bold md:text-[22px]">大盤與國際</h1>
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <span className="glow-dot h-2 w-2 rounded-full bg-muted text-muted" />
        收盤最後快照
      </span>
      <span className="ml-auto">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/45 bg-accent/10 px-3 text-[12.5px] font-black text-accent transition active:scale-[0.97]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            fill="currentColor"
            viewBox="0 0 256 256"
            aria-hidden="true"
          >
            <path d={SHARE_NETWORK_PATH} />
          </svg>
          分享
        </button>
      </span>
    </section>
  );
}
