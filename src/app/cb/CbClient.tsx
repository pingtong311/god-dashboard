'use client';

/**
 * 可轉債 — 「發行／掛牌行事曆」摺疊區塊（用戶端互動）
 * ----------------------------------------------------------------------------
 * 逐字對齊 cb.html 的 section 與按鈕 className。展開內容（官方發行、掛牌及到期
 * 日期）本站無資料源 → 誠實載入骨架 + 「資料尚未入庫」，不造假。
 */

import { useState } from 'react';

export default function CbClient(): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <section className="my-4 min-w-0 rounded-2xl border border-line bg-surface p-4">
      <button
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 text-left text-base font-bold text-accent"
      >
        可轉債發行／掛牌行事曆 {open ? '－' : '＋'}
      </button>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        官方發行、掛牌及到期日期；發行時轉換價不是現行轉換價、競拍得標價或股票目標價。未含尚未發行的董事會計畫與異常議價偵測。
      </p>
      {open && (
        <div className="mt-3" role="status" aria-live="polite">
          <span className="sr-only">正在整理可轉債發行／掛牌行事曆…</span>
          <div aria-hidden="true" className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface-2"
              />
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            行事曆<b className="text-ink">資料尚未入庫</b>；可至公開資訊觀測站或櫃買中心查詢官方公告。
          </p>
        </div>
      )}
    </section>
  );
}
