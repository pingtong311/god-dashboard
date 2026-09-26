/**
 * TodayDataBadge —— 頁首狀態膠囊（today.html <header> 內逐字）。
 * ----------------------------------------------------------------------------
 *   <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5
 *        rounded-lg border border-line/80 bg-surface-2/75 px-2.5 py-1
 *        text-[12px] font-bold text-muted">
 *     <span class="text-ink">盤後</span>
 *     <span>資料日 2026-09-24</span>
 *     <span>下次更新 下一交易日約 21:30</span>
 *   </span>
 *
 * 資料：資料日取 GET /api/skynet/market-overview 的 data.date（最新交易日）；
 * 「盤後」與「下次更新 下一交易日約 21:30」為靜態文案。上游失敗時誠實標示
 * 「尚未取得」，不放推測日期。
 *
 * Client component：需要瀏覽器 fetch；SSR 首屏呈現骨架，mount 後才抓資料
 * （與 @/app/market/MarketBreadthCards 同模式）。
 */
'use client';

import { useEffect, useState, type ReactElement } from 'react';

type LoadState = { status: 'loading' } | { status: 'ready'; date: string | null };

/** 同步呈現元件（測試直接用）。 */
export function TodayDataBadgeView({ date }: { date: string | null }): ReactElement {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-line/80 bg-surface-2/75 px-2.5 py-1 text-[12px] font-bold text-muted">
      <span className="text-ink">盤後</span>
      <span>資料日 {date ?? '尚未取得'}</span>
      <span>下次更新 下一交易日約 21:30</span>
    </span>
  );
}

export default function TodayDataBadge(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/market-overview', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          date: body?.ok === true && typeof body.data?.date === 'string' ? body.data.date : null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'ready', date: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <span
        className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-line/80 bg-surface-2/75 px-2.5 py-1 text-[12px] font-bold text-muted"
        role="status"
      >
        <span className="sr-only">資料日載入中…</span>
        <span className="text-ink">盤後</span>
        <span aria-hidden="true" className="h-3.5 w-20 animate-pulse rounded bg-surface-2" />
        <span>下次更新 下一交易日約 21:30</span>
      </span>
    );
  }

  return <TodayDataBadgeView date={state.date} />;
}
