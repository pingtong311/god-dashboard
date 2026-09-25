/**
 * DataCaveatDetails ——「資料日期與口徑」<details>（SPEC 會員四頁 §0-3）。
 *
 * 四頁外殼一致、內文各異，故內文以 children 傳入：
 *
 *   <details class="mt-6 rounded-2xl border border-line/70 bg-surface px-4 py-3">
 *     <summary class="cursor-pointer text-[12.5px] font-black text-muted">
 *       資料日期與口徑
 *     </summary>
 *     <div class="mt-2 space-y-1 text-[12px] leading-relaxed text-muted">
 *       <p>…每頁不同的 4~5 條…</p>
 *     </div>
 *   </details>
 */
import type { ReactNode } from 'react';

export default function DataCaveatDetails({ children }: { children: ReactNode }) {
  return (
    <details className="mt-6 rounded-2xl border border-line/70 bg-surface px-4 py-3">
      <summary className="cursor-pointer text-[12.5px] font-black text-muted">
        資料日期與口徑
      </summary>
      <div className="mt-2 space-y-1 text-[12px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}
