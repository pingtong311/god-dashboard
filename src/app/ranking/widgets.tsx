/**
 * 分點排行頁的兩個互動小元件（client island）。
 * ----------------------------------------------------------------------------
 * - ShareButton：分享這一頁（navigator.share，退回 clipboard；與 /signal 同模式）。
 * - TermTip：術語底線小問號。實站的氣泡由 JS 注入、不在靜態截圖內，本站補上
 *   一段簡短說明（點 aria-expanded 切換），文案為本站自行撰寫的「解釋」而非資料。
 */

'use client';

import { useState } from 'react';

/** 分享按鈕（圖示 path 逐字照抄 ranking.html 的 Phosphor Share）。 */
export function ShareButton(): React.ReactElement {
  return (
    <button
      type="button"
      aria-label="分享這一頁"
      onClick={() => {
        if (typeof navigator === 'undefined') return;
        if (navigator.share) {
          navigator
            .share({ title: '分點排行｜股市大佬 TradeBoss', url: window.location.href })
            .catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(window.location.href).catch(() => {});
        }
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent transition active:scale-[0.94]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        viewBox="0 0 256 256"
        aria-hidden="true"
      >
        <path d="M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z" />
      </svg>
    </button>
  );
}

/**
 * 術語氣泡。外層 span.relative inline-block + button.term-tip + span.term-mark
 * 逐字照抄 ranking.html；展開的氣泡為本站補充。
 */
export function TermTip({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="term-tip"
      >
        {term}
        <span aria-hidden="true" className="term-mark">
          ?
        </span>
      </button>
      {open ? (
        <span role="note" className="term-tip__pop">
          {children}
        </span>
      ) : null}
    </span>
  );
}
