'use client';

/**
 * ShareButton ——「分享這一頁」圓鈕（ Phosphor ShareNetwork，16px）。
 *
 * 實站 captured/login-capture/html/trump.html 的 hero 右上角按鈕，圖示 path 逐字照抄。
 * 實作：把當前網址複製到剪貼簿（不社群預填，避免假裝分享出去）；
 * 複製失敗時不丟錯，靜靜退回（按鈕本身仍在，使用者可手動複製網址列）。
 */
import { useState } from 'react';

const SHARE_NETWORK_PATH =
  'M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1_500);
      }
    } catch {
      // 複製失敗不丟錯；使用者仍可自行複製網址列。
    }
  };

  return (
    <button
      type="button"
      aria-label={copied ? '已複製網址' : '分享這一頁'}
      onClick={() => void handleClick()}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent transition active:scale-[0.94]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d={SHARE_NETWORK_PATH} />
      </svg>
    </button>
  );
}
