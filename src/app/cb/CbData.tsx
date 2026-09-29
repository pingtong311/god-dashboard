'use client';

/**
 * 可轉債 — 兩張主表（用戶端資料載入）
 * ----------------------------------------------------------------------------
 * 資料來源：GET /api/skynet/cb（櫃買中心 /bond_ISSBD5_data + CB 日行情檔 cbdrs001）。
 *
 * 誠實分工（見 route.ts 資料源註解）：
 *   1) 轉換溢價率排序（低→高）：由 TPEX「轉換公司債資訊看板」日行情檔自產
 *      （轉換價值＝標的股價×100÷轉換價；折價率＝CB 收市價÷轉換價值−1），
 *      升冪取前 30，與實站 30/30 吻合。
 *   2) 賣回權時程：上游 ISSBD5 直接有 PutOptionDate / PutOptionPrice → 真實資料。
 *   上游暫時失敗時一律誠實顯示「暫時無法取得」，絕不用 0 或假數字湊排序。
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CbResponse, CbPutScheduleRow, CbItem } from '@/app/api/skynet/cb/route';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: CbResponse }
  | { status: 'error' };

/** 溢價率表格載入骨架（僅資料載入中顯示）。 */
function PremiumSkeleton(): ReactElement {
  return (
    <div className="px-4 py-4" role="status" aria-live="polite">
      <span className="sr-only">正在整理可轉債轉換溢價率排序…</span>
      <div aria-hidden="true" className="grid gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface" />
        ))}
      </div>
    </div>
  );
}

/** 賣回權時程骨架。 */
function PutSkeleton(): ReactElement {
  return (
    <div className="p-4" role="status" aria-live="polite">
      <span className="sr-only">正在整理可轉債賣回權時程…</span>
      <div aria-hidden="true" className="grid gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface" />
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        賣回權時程<b className="text-ink">資料尚未入庫</b>；可至公開資訊觀測站或櫃買中心查詢各 CB 公開發行／賣回公告。
      </p>
    </div>
  );
}

/** 價格格式：有值顯示原樣（去尾零），無值顯示「—」。 */
function formatNum(v: number | null): string {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function CbData(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/cb', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: CbResponse) => {
        if (cancelled) return;
        if (json && json.available === true) {
          setState({ status: 'ready', data: json });
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

  const putSchedule: CbPutScheduleRow[] = state.status === 'ready' ? state.data.put_schedule : [];
  const items: CbItem[] = state.status === 'ready' ? state.data.items : [];
  const reason = state.status === 'ready' ? state.data.items_unavailable_reason : undefined;

  return (
    <>
      {/* 轉換溢價率排序（低→高） */}
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              轉換溢價率排序（低→高）
            </h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="table-scroll overflow-x-auto">
          <div className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_88px_88px_72px] gap-2 rounded-t-2xl border-b border-line/60 bg-surface px-4 py-2.5 text-sm font-bold text-muted backdrop-blur">
            <span>可轉債</span>
            <span className="text-right">CB市價</span>
            <span className="text-right">轉換價值</span>
            <span className="text-right">溢價率</span>
          </div>
          {state.status === 'loading' ? (
            <PremiumSkeleton />
          ) : items.length === 0 ? (
            <div className="px-4 py-4" role="status" aria-live="polite">
              <p className="text-[12.5px] leading-relaxed text-muted">
                轉換溢價率排序<b className="text-ink">暫時無法取得</b>；
                {reason ?? '上游櫃買中心管線無回應或無資料，稍後重試，不先放推測數字。'}
              </p>
            </div>
          ) : (
            <ul>
              {items.map((row) => (
                <li
                  key={row.cb_id}
                  className="grid grid-cols-[minmax(0,1fr)_88px_88px_72px] items-center gap-2 border-b border-line/60 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="block truncate font-bold">
                      <span className="num">{row.cb_id}</span> {row.cb_name}
                    </span>
                    <span className="text-xs text-muted">
                      轉換價 {formatNum(row.conversion_price)}｜票息 {formatNum(row.coupon_rate)}%｜到期{' '}
                      {row.due_date || '—'}
                    </span>
                  </div>
                  <span className="num text-right">{formatNum(row.cb_price)}</span>
                  <span className="num text-right">{formatNum(row.conversion_value)}</span>
                  <span
                    className={`num text-right font-black ${
                      (row.premium_pct ?? 0) < 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {formatNum(row.premium_pct)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        轉換溢價率＝可轉債市價相對轉換價值的差異。負值只表示公式差異，尚未計入流動性、借券、閉鎖期、稅費與成交限制，不代表存在可執行交易。賣回時程為公開時程表。
      </p>

      {/* 賣回權時程 */}
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">賣回權時程</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        {state.status === 'loading' ? (
          <PutSkeleton />
        ) : state.status === 'error' || putSchedule.length === 0 ? (
          <div className="p-4" role="status" aria-live="polite">
            <p className="text-[12.5px] leading-relaxed text-muted">
              賣回權時程<b className="text-ink">暫時無法取得</b>
              （上游櫃買中心管線無回應或無資料）；稍後重試，不先放推測數字。
            </p>
          </div>
        ) : (
          <div className="table-scroll overflow-x-auto">
            <div className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_88px_120px] gap-2 rounded-t-2xl border-b border-line/60 bg-surface px-4 py-2.5 text-sm font-bold text-muted backdrop-blur">
              <span>可轉債</span>
              <span className="text-right">賣回價</span>
              <span className="text-right">賣回日</span>
            </div>
            <div className="grid">
              {putSchedule.map((row) => (
                <div
                  key={`${row.cb_id}-${row.put_date}`}
                  className="grid grid-cols-[minmax(0,1fr)_88px_120px] items-center gap-2 border-b border-line/40 px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-bold text-accent">{row.cb_id}</span>{' '}
                    <span className="text-ink">{row.name}</span>
                  </span>
                  <span className="num text-right text-[13px] text-ink">
                    {formatNum(row.put_price)}
                  </span>
                  <span className="num text-right text-[13px] text-muted">{row.put_date || '—'}</span>
                </div>
              ))}
            </div>
            <p className="px-4 py-3 text-[12px] leading-relaxed text-muted">
              以上為櫃買中心公開之 CB 賣回權時程（{putSchedule.length} 檔）；賣回價為公開時程表記載值，實際行使條件以發行辦法與公告為準。
            </p>
          </div>
        )}
      </div>
    </>
  );
}
