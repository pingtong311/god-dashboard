'use client';

/**
 * 資券借券 — sticky 分類 pill 導覽（用戶端互動）
 * ----------------------------------------------------------------------------
 * 逐字對齊 leverage.html 的 <nav> 與 pill 按鈕 className；點擊平滑捲動到對應 section。
 */

import { useState } from 'react';

const PILLS: readonly { label: string; target: string }[] = [
  { label: '借券餘額', target: 'sbl' },
  { label: '八大行庫', target: 'national' },
  { label: '大漲券增', target: 'squeeze' },
  { label: '下跌資增', target: 'dip' },
  { label: '券資比偏高', target: 'crowded' },
];

export default function LeverageNav(): React.ReactElement {
  const [active, setActive] = useState<string>('sbl');

  return (
    <nav className="sticky top-16 z-20 -mx-4 mt-4 border-y border-line bg-bg/95 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PILLS.map((pill) => {
          const isActive = active === pill.target;
          return (
            <button
              key={pill.target}
              type="button"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                setActive(pill.target);
                document
                  .getElementById(pill.target)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={
                isActive
                  ? 'shrink-0 whitespace-nowrap rounded-full border border-accent bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-bg transition active:scale-95'
                  : 'shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-bold text-muted transition active:scale-95 hover:border-accent hover:text-accent'
              }
            >
              {pill.label}
            </button>
          );
        })}
        <span className="w-4 shrink-0" aria-hidden="true" />
      </div>
    </nav>
  );
}
