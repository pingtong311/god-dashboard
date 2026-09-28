/**
 * SourceBadge —— 資料來源標記徽章（跨頁共用，不可關閉）
 * ============================================================================
 * 業主核心要求：「能自己產生的就用自己產生，不能產生的才用實站數據，而且必須讓
 * 使用者一眼看出資料從哪來。」
 *
 * 用法：每個資料面板底部（或資料區塊上方）**強制渲染**，依 Provenance.source
 * 顯示對應文案。**不可關閉、不可省略**——只要該面板有資料，就必須標明來源。
 *
 * 四種來源的文案（繁體中文、讓一般使用者看懂）：
 *   self-produced    → 「資料來源：本站自產（<可讀上游名稱>）」
 *   site-mirror      → 「資料來源：實站快照（基準日 <snapshot_date>，非即時[；<note>]）」
 *   site-unreliable  → 「本站不提供此欄位：<omitted_reason>」
 *   absent           → 「資料未入庫」
 *
 * 為 Server Component（無 client state），可直接在 Server / Client 頁面使用。
 * 樣式沿用本專案既有慣例（Tailwind class + aria 屬性）。
 */

import type { ReactNode } from 'react';
import type { Provenance } from '@/lib/provenance';
import { readableUpstreamName } from '@/lib/provenance';

type SourceBadgeProps = {
  /** 來源追蹤物件。 */
  provenance: Provenance;
  /** 額外補充說明（附加在標準文案後；site-mirror 會接在括號內）。 */
  note?: string;
  /** 額外 class（用於外距等版面微調）。 */
  className?: string;
};

/** 徽章外框樣式（沿用本專案 border-line / bg-surface-2 / text-muted 慣例）。 */
const BASE_CLASS =
  'flex items-start gap-2 rounded-xl border border-line/70 bg-surface-2 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted';

/** 依 source 決定左側圖示（純裝飾，aria-hidden）。 */
const ICON: Record<Provenance['source'], string> = {
  'self-produced': '◆',
  'site-mirror': '◷',
  'site-unreliable': '⛔',
  absent: '∅',
};

export default function SourceBadge({ provenance, note, className }: SourceBadgeProps) {
  const { source, upstream, snapshot_date, omitted_reason } = provenance;

  let body: ReactNode;
  switch (source) {
    case 'self-produced':
      body = (
        <>
          資料來源：<b className="text-ink">本站自產</b>
          （{readableUpstreamName(upstream)}）
        </>
      );
      break;
    case 'site-mirror':
      body = (
        <>
          資料來源：<b className="text-ink">實站快照</b>（基準日{' '}
          <b className="text-ink">{snapshot_date ?? '—'}</b>，
          <b className="text-ink">非即時</b>
          {note ? `；${note}` : ''}）
        </>
      );
      break;
    case 'site-unreliable':
      body = (
        <>
          <b className="text-ink">本站不提供此欄位</b>
          {omitted_reason ? `：${omitted_reason}` : ''}
        </>
      );
      break;
    case 'absent':
      body = (
        <>
          <b className="text-ink">資料未入庫</b>
          {note ? `（${note}）` : ''}
        </>
      );
      break;
  }

  return (
    <p role="note" data-source={source} className={`${BASE_CLASS}${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true" className="mt-[1px] shrink-0 text-[11px]">
        {ICON[source]}
      </span>
      <span className="min-w-0">{body}</span>
    </p>
  );
}
