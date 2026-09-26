/**
 * 法人買超 Top3 —— today.html 逐字複刻。
 * ----------------------------------------------------------------------------
 *   <section>
 *     <div class="mb-2 flex items-center justify-between gap-2">
 *       <h2 class="flex items-center gap-1.5 text-[14px] font-black text-ink">
 *         <ChartLineUp 18px/>法人買超 Top3
 *       </h2>
 *       <a href="/ranking/?board=foreign_buy" class="...text-accent">法人榜<ArrowRight/></a>
 *     </div>
 *     <div class="data-panel hud-panel glass rounded-2xl   p-0">
 *       <div class="flex flex-wrap items-center gap-2 px-4 pt-3">
 *         <span class="...">2026-09-24 · 法人約 21:00 入庫</span>
 *       </div>
 *       <div class="grid gap-1.5 px-4 pt-3"> 外資／投信／自營商 三條量條 </div>
 *       <ol class="p-2"> Top3 個股（頭像＋名稱＋代號＋迷你圖＋淨買超張數） </ol>
 *     </div>
 *   </section>
 *
 * 資料（真實來源）：GET /api/skynet/t86（省略 tickers → 回傳全市場 T86
 *   三大法人買賣超，單位已換算為張），前端加總外資／投信／自營商淨額，
 *   並依三大法人合計買超張數取前 3。日期取回應的 tradeDate。
 *
 * 無對接來源：每檔個股的 54×24 迷你走勢圖（recharts）需個股日線序列，
 *   以 animate-pulse 骨架 + role="status" 呈現，不嵌入快照路徑冒充走勢。
 *   頭像底色由股票代號 hash 決定（裝飾用，aria-hidden；見 today-data.ts）。
 *
 * Client component：需要瀏覽器 fetch + useEffect。
 */
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import ArrowRightLink from '@/components/ArrowRightLink';
import { ICON_CHART_UP, avatarGradient, formatSignedLots } from './today-data';

/** 法人買超 Top3 所需資料（張）。 */
export type InstitutionalData = {
  date: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  top: ReadonlyArray<{ symbol: string; name: string; netLots: number }>;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: InstitutionalData | null };

type T86Item = {
  symbol: string;
  name: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
};

/** 三大法人列定義（capture 順序：外資→投信→自營商）。 */
const FIRM_ROWS: ReadonlyArray<{ label: string; key: 'foreignNet' | 'trustNet' | 'dealerNet' }> = [
  { label: '外資', key: 'foreignNet' },
  { label: '投信', key: 'trustNet' },
  { label: '自營商', key: 'dealerNet' },
];

/** 由全市場 T86 算出三大法人淨額與買超 Top3（純函式，測試直接用）。 */
export function computeInstitutionalData(
  tradeDate: string,
  items: ReadonlyArray<T86Item>,
): InstitutionalData {
  let foreignNet = 0;
  let trustNet = 0;
  let dealerNet = 0;

  for (const item of items) {
    foreignNet += item.foreignNet;
    trustNet += item.trustNet;
    dealerNet += item.dealerNet;
  }

  const top = [...items]
    .filter((item) => item.totalNet > 0)
    .sort((a, b) => b.totalNet - a.totalNet)
    .slice(0, 3)
    .map((item) => ({
      symbol: item.symbol,
      name: item.name,
      netLots: item.totalNet,
    }));

  return { date: tradeDate, foreignNet, trustNet, dealerNet, top };
}

/** 個股迷你走勢圖骨架（54×24，無資料來源，誠實呈現）。 */
function StockSparkSkeleton(): ReactElement {
  return (
    <div
      className="relative overflow-hidden rounded bg-surface-2"
      style={{ width: '54px', height: '24px' }}
      role="status"
      aria-label="個股近月走勢資料尚未入庫"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-gradient-to-t from-transparent to-surface-2"
      />
    </div>
  );
}

/** 同步呈現元件（測試直接用）；data=null 時顯示上游失敗的誠實說明。 */
export function InstitutionalTop3View({ data }: { data: InstitutionalData | null }): ReactElement {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[14px] font-black text-ink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="currentColor"
            viewBox="0 0 256 256"
            aria-hidden="true"
          >
            <path d={ICON_CHART_UP} />
          </svg>
          法人買超 Top3
        </h2>
        <ArrowRightLink href="/ranking/?board=foreign_buy">法人榜</ArrowRightLink>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
            {data === null ? '尚未入庫' : `${data.date} · 法人約 21:00 入庫`}
          </span>
        </div>

        {data === null ? (
          <div className="px-4 pb-4 pt-3" role="status" aria-live="polite">
            <span className="sr-only">法人買超資料載入失敗…</span>
            <p className="text-[12.5px] leading-relaxed text-muted">
              法人買超暫時無法取得（上游 T86 無回應），稍後重試；不先放推測數字。
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5 px-4 pt-3">
              {FIRM_ROWS.map((row) => {
                const net = data[row.key];
                const maxAbs = Math.max(
                  Math.abs(data.foreignNet),
                  Math.abs(data.trustNet),
                  Math.abs(data.dealerNet),
                  1,
                );
                // 長條寬度＝相對最大絕對值，最低 3%（避免短到看不見）
                const width = Math.max(3, (Math.abs(net) / maxAbs) * 100);
                return (
                  <div key={row.key} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[12px] font-bold text-muted">
                      {row.label}
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded bg-surface-2">
                      <i
                        className={`absolute inset-y-0 left-0 rounded ${
                          net >= 0 ? 'bg-up/75' : 'bg-down/75'
                        }`}
                        style={{ width: `${Math.round(width * 10) / 10}%` }}
                      />
                    </span>
                    <span
                      className={`num w-24 shrink-0 text-right text-[12px] font-black ${
                        net >= 0 ? 'text-up' : 'text-down'
                      }`}
                    >
                      {formatSignedLots(net)}
                    </span>
                  </div>
                );
              })}
            </div>
            <ol className="p-2">
              {data.top.map((stock, index) => (
                <li key={stock.symbol}>
                  <Link
                    href={`/stock/?id=${stock.symbol}`}
                    className="grid min-h-[3.4rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-surface-2"
                  >
                    <span className="relative">
                      <span
                        aria-hidden="true"
                        className="grid shrink-0 select-none place-items-center rounded-full border border-white/10 font-black text-white/92"
                        style={{
                          width: '34px',
                          height: '34px',
                          fontSize: '15px',
                          background: avatarGradient(stock.symbol),
                        }}
                      >
                        {stock.name.charAt(0)}
                      </span>
                      <span className="num absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9.5px] font-black text-bg">
                        {index + 1}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-black text-ink">
                        {stock.name}
                      </span>
                      <span className="num block text-[12px] font-bold text-muted">
                        {stock.symbol}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StockSparkSkeleton />
                      <span
                        className={`num max-w-[32vw] truncate sm:max-w-none text-[12.5px] font-black ${
                          stock.netLots >= 0 ? 'text-up' : 'text-down'
                        }`}
                      >
                        {stock.netLots.toLocaleString('zh-Hant')} 張
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

export default function InstitutionalTop3(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/t86', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (!body || Array.isArray(body.items) !== true) {
          setState({ status: 'ready', data: null });
          return;
        }
        const items = body.items as T86Item[];
        setState({
          status: 'ready',
          data: computeInstitutionalData(String(body.tradeDate ?? ''), items),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'ready', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <section
        className="data-panel hud-panel glass rounded-2xl   p-0"
        role="status"
        aria-label="法人買超資料載入中"
      >
        <span className="sr-only">正在整理法人買超 Top3…</span>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" aria-hidden="true" />
        </div>
        <div className="grid gap-1.5 px-4 pt-3" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-2 w-full animate-pulse rounded bg-surface-2" />
          ))}
        </div>
        <ol className="p-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li
              key={index}
              className="grid min-h-[3.4rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2.5 py-2"
            >
              <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
              <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-5 w-16 animate-pulse rounded bg-surface-2" />
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return <InstitutionalTop3View data={state.data} />;
}
