'use client';

/**
 * 可轉債 — 兩張主表（用戶端資料載入）
 * ----------------------------------------------------------------------------
 * 資料來源：GET /api/skynet/cb（櫃買中心 OpenAPI /bond_ISSBD5_data）。
 *
 * 誠實分工（見 route.ts 調查註解）：
 *   1) 轉換溢價率排序（低→高）：需 CB 盤後成交價才能算溢價率，TPEX/TWSE 免費 OpenAPI
 *      皆無此欄位 → items 恆為空陣列 → 誠實呈現載入骨架 +「資料尚未入庫」，
 *      並說明原因，絕不用 0 或假數字湊出排序。
 *   2) 賣回權時程：上游直接有 PutOptionDate / PutOptionPrice → 以真實資料呈現。
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CbResponse, CbPutScheduleRow } from '@/app/api/skynet/cb/route';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: CbResponse }
  | { status: 'error' };

/** 溢價率表格骨架（無資料源，誠實呈現）。 */
function PremiumSkeleton({ reason }: { reason?: string }): ReactElement {
  return (
    <div className="px-4 py-4" role="status" aria-live="polite">
      <span className="sr-only">正在整理可轉債轉換溢價率排序…</span>
      <div aria-hidden="true" className="grid gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface" />
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        可轉債盤後行情與轉換價值<b className="text-ink">資料尚未入庫</b>
        ；{reason ?? '本站目前無 CB 盤後成交價資料源，待入庫後以此排序即時呈現，不預先寫死截圖數字。'}
      </p>
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
          <PremiumSkeleton reason={reason} />
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
