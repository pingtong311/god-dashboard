/**
 * M4 大盤分頁 sticky nav —— SPEC 會員四頁 §M4，逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * 4 個 button（非連結）：台灣市場（active：bg-accent-soft text-accent + aria-current）；
 * 籌碼燈號／國際連動／其他（text-muted hover:bg-surface-2）。
 *
 * ⚠ 實站快照只展開了「台灣市場」內容（M5–M13）；其餘三個分頁在
 *   states/tab-market/01|02|03-*.txt 只有純文字、無 HTML。本元件對未展開的分頁
 *   誠實標示「內容尚未入庫」，不虛構版面。
 *
 * Client component：分頁切換需 useState；「台灣市場」內容由 server component
 * 組好後以 children 傳入（M5–M13 全在 server side render）。
 */
'use client';

import { useState, type ReactElement } from 'react';
import type { ReactNode } from 'react';

const TABS = [
  { id: 'tw', label: '台灣市場' },
  { id: 'chips', label: '籌碼燈號' },
  { id: 'intl', label: '國際連動' },
  { id: 'other', label: '其他' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function NotInStockPanel({ label }: { label: string }): ReactElement {
  return (
    <div className="data-panel hud-panel glass mt-4 rounded-2xl p-5  ">
      <p className="text-sm font-bold text-muted">內容尚未入庫</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        「{label}」分頁的版面尚未展開（實站快照只捕捉到「台灣市場」分頁）。整理完再上，不先放猜測內容。
      </p>
    </div>
  );
}

export default function MarketTabs({ children }: { children: ReactNode }): ReactElement {
  const [active, setActive] = useState<TabId>('tw');

  return (
    <>
      <nav
        aria-label="大盤分頁"
        className="sticky top-[3.9rem] z-20 -mx-4 mt-5 border-y border-line/70 bg-bg/90 px-4 py-1.5 backdrop-blur md:mx-0 md:rounded-2xl md:border"
      >
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const activeTab = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={activeTab ? 'page' : undefined}
                onClick={() => setActive(tab.id)}
                className={`min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 ${
                  activeTab ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
      {active === 'tw' ? (
        children
      ) : (
        <NotInStockPanel label={TABS.find((tab) => tab.id === active)?.label ?? ''} />
      )}
    </>
  );
}
