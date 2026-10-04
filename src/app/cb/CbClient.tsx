'use client';

/**
 * 可轉債 — 「發行／掛牌行事曆」摺疊區塊（用戶端互動）
 * ----------------------------------------------------------------------------
 * 逐字對齊 cb.html 的 section 與按鈕 className。
 * 展開內容改抓自家 API（GET /api/skynet/cb 的 calendar 欄位，來源為櫃買中心
 * 公開 OpenAPI /bond_ISSBD5_data 的 IssueDate / ListingDate / MaturityDate）。
 * 若上游無回應 → 誠實呈現載入骨架 +「暫時無法取得」，不造假。
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CbResponse, CbCalendarRow } from '@/app/api/skynet/cb/route';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; rows: CbCalendarRow[] }
  | { status: 'error' };

export default function CbClient(): ReactElement {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/cb')
      .then((res) => res.json())
      .then((json: CbResponse) => {
        if (cancelled) return;
        if (json && json.available === true && Array.isArray(json.calendar)) {
          setState({ status: 'ready', rows: json.calendar });
        } else {
          setState({ status: 'error' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = state.status === 'ready' ? state.rows : [];

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
        <div className="mt-3">
          {state.status === 'loading' ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">正在整理可轉債發行／掛牌行事曆…</span>
              <div aria-hidden="true" className="grid gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface-2"
                  />
                ))}
              </div>
            </div>
          ) : state.status === 'error' || rows.length === 0 ? (
            <p role="status" className="text-[12px] leading-relaxed text-muted">
              行事曆<b className="text-ink">暫時無法取得</b>
              （上游櫃買中心管線無回應或無資料）；可至公開資訊觀測站或櫃買中心查詢官方公告。
            </p>
          ) : (
            <div className="table-scroll overflow-x-auto" role="status" aria-live="polite">
              <div className="grid min-w-[420px] grid-cols-[minmax(0,1fr)_96px_96px_96px] gap-2 border-b border-line/60 px-1 py-2 text-[12px] font-bold text-muted">
                <span>可轉債</span>
                <span className="text-right">發行日</span>
                <span className="text-right">掛牌日</span>
                <span className="text-right">到期日</span>
              </div>
              <div className="grid">
                {rows.map((row) => (
                  <div
                    key={`${row.cb_id}-${row.issue_date}`}
                    className="grid min-w-[420px] grid-cols-[minmax(0,1fr)_96px_96px_96px] items-center gap-2 border-b border-line/40 px-1 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[12.5px]">
                      <span className="font-bold text-accent">{row.cb_id}</span>{' '}
                      <span className="text-ink">{row.name}</span>
                    </span>
                    <span className="num text-right text-[12.5px] text-muted">
                      {row.issue_date || '—'}
                    </span>
                    <span className="num text-right text-[12.5px] text-muted">
                      {row.listing_date || '—'}
                    </span>
                    <span className="num text-right text-[12.5px] text-muted">
                      {row.maturity_date || '—'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="px-1 py-2 text-[11px] leading-relaxed text-muted">
                以上為櫃買中心公開之 CB 發行資料（{rows.length} 檔）；發行時轉換價非現行轉換價。
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
