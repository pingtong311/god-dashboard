/**
 * 今日一句 + 指數與家數 —— today.html 兩段相鄰區塊，逐字複刻。
 * ----------------------------------------------------------------------------
 * 今日一句：
 *   <div class="data-panel hud-panel glass rounded-2xl p-5  ">
 *     <p class="text-[13.5px] font-black text-ink">今日一句</p>
 *     <span class="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] ...">2026-09-24 · 盤後</span>
 *     <p class="mt-2 text-[14px] font-bold leading-relaxed text-ink">
 *       2026-09-24 上漲 917 家、下跌 1,090 家，上漲佔有漲跌家數的 46%，
 *       成交 0.94 兆。以上是已發生的家數與金額，不是方向研判。</p>
 *
 * 指數與家數：4 格卡（加權指數／台指期近月／上漲/下跌／成交金額）+ 漲跌家數長條。
 *
 * 資料（真實來源，與 /market 同慣例，前端 fetch 自家 API）：
 *   - 加權指數、漲跌家數、成交金額、資料日：
 *       GET /api/skynet/market-overview（TWSE MI_INDEX）→ data.indexClose /
 *       data.breadth / data.turnover.total / data.date
 *   - 台指期近月：GET /api/skynet/futures（TAIFEX OpenAPI EOD）
 *       → data.lastPrice / data.changePercent
 *
 * 無對接來源：加權指數「近 10 日」迷你圖（recharts 110×24）需指數日線序列
 *   （/api/skynet/kline 為個股 K 線且需 Fugle Key），保留外殼與「近 10 日」標籤，
 *   圖面以 animate-pulse 骨架 + role="status" 呈現，不嵌入快照路徑冒充走勢。
 *
 * Client component：需要瀏覽器 fetch + useEffect。
 */
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import ArrowRightLink from '@/components/ArrowRightLink';
import {
  formatFuturesPrice,
  formatIndexPrice,
  formatSignedPercent,
  formatTrillions,
  priceTone,
} from './today-data';

/** 本區塊所需的市場總覽切片。 */
export type TodayMarketBriefData = {
  date: string;
  index: { price: number; changePercent: number } | null;
  futures: { lastPrice: number; changePercent: number | null } | null;
  breadth: { up: number; down: number; upRatio: number };
  turnover: { total: number };
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: TodayMarketBriefData | null };

/** 近 10 日迷你圖骨架（無資料來源，誠實呈現）。 */
function MiniChartSkeleton(): ReactElement {
  return (
    <div className="mt-1.5">
      <div
        className="relative overflow-hidden rounded bg-surface-2"
        style={{ width: '110px', height: '24px' }}
        role="status"
        aria-label="加權指數近 10 日資料尚未入庫"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-t from-transparent to-surface-2"
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-muted">
          資料尚未入庫
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted">近 10 日</p>
    </div>
  );
}

/** 今日一句（由漲跌家數、佔比與成交金額組出，規則照 capture 文案）。 */
function OneLineSummary({ data }: { data: TodayMarketBriefData }): ReactElement {
  const { up, down } = data.breadth;
  const upPercent = Math.round(data.breadth.upRatio * 100);

  return (
    <div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] font-black text-ink">今日一句</p>
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
            {data.date} · 盤後
          </span>
        </div>
        <p className="mt-2 text-[14px] font-bold leading-relaxed text-ink">
          {data.date} 上漲 {up.toLocaleString('zh-Hant')} 家、下跌{' '}
          {down.toLocaleString('zh-Hant')} 家，上漲佔有漲跌家數的 {upPercent}%，成交{' '}
          {formatTrillions(data.turnover.total)}。以上是已發生的家數與金額，不是方向研判。
        </p>
      </div>
    </div>
  );
}

/** 指數與家數 4 格卡 + 漲跌家數長條。 */
function IndexBreadthSection({ data }: { data: TodayMarketBriefData }): ReactElement {
  const { up, down } = data.breadth;
  const indexOk = data.index !== null && data.index.price > 0;
  const futuresOk = data.futures !== null && data.futures.lastPrice > 0;
  const upWidth = up + down > 0 ? (up / (up + down)) * 100 : 0;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-black text-ink">指數與家數</h2>
        <ArrowRightLink href="/market/">市場</ArrowRightLink>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-[12px] font-bold text-muted">加權指數</p>
          <p
            className={`num mt-1 text-[19px] font-black leading-tight ${priceTone(
              indexOk ? data.index!.changePercent : null,
            )}`}
          >
            {indexOk ? formatIndexPrice(data.index!.price) : '--'}{'  '}
            {formatSignedPercent(indexOk ? data.index!.changePercent : null)}
          </p>
          <MiniChartSkeleton />
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-[12px] font-bold text-muted">台指期近月</p>
          <p
            className={`num mt-1 text-[19px] font-black leading-tight ${priceTone(
              futuresOk ? data.futures!.changePercent : null,
            )}`}
          >
            {futuresOk ? formatFuturesPrice(data.futures!.lastPrice) : '--'}{'  '}
            {formatSignedPercent(futuresOk ? data.futures!.changePercent : null)}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-[12px] font-bold text-muted">上漲 / 下跌</p>
          <p className="num mt-1 text-[19px] font-black leading-tight text-ink">
            {up.toLocaleString('zh-Hant')} / {down.toLocaleString('zh-Hant')}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-[12px] font-bold text-muted">成交金額</p>
          <p className="num mt-1 text-[19px] font-black leading-tight text-ink">
            {formatTrillions(data.turnover.total)}
          </p>
        </div>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
        aria-label={`上漲 ${up} 家、下跌 ${down} 家`}
      >
        <i
          className="block h-full rounded-l-full bg-up"
          style={{ width: `${upWidth.toFixed(4)}%` }}
        />
        <i className="block h-full flex-1 rounded-r-full bg-down" />
      </div>
    </section>
  );
}

/** 同步呈現元件（測試直接用）；資料 null 時顯示上游失敗的誠實說明。 */
export function TodayMarketBriefView({ data }: { data: TodayMarketBriefData | null }): ReactElement {
  if (data === null) {
    return (
      <>
        <div>
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <p className="text-[13.5px] font-black text-ink">今日一句</p>
            <p className="mt-2 text-[14px] font-bold leading-relaxed text-muted">
              市場概況暫時無法取得（上游行情管線無回應），稍後重試；不先放推測數字。
            </p>
          </div>
        </div>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-black text-ink">指數與家數</h2>
            <ArrowRightLink href="/market/">市場</ArrowRightLink>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-line bg-surface px-3 py-3"
              >
                <div className="h-3.5 w-16 animate-pulse rounded bg-surface-2" />
                <div className="num mt-1 h-6 w-24 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <OneLineSummary data={data} />
      <IndexBreadthSection data={data} />
    </>
  );
}

export default function TodayMarketBrief(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/skynet/market-overview', { cache: 'no-store' }).then((res) => res.json()),
      fetch('/api/skynet/futures', { cache: 'no-store' }).then((res) => res.json()),
    ]).then(([overviewResult, futuresResult]) => {
      if (cancelled) return;

      const overview =
        overviewResult.status === 'fulfilled' && overviewResult.value?.ok === true
          ? overviewResult.value.data
          : null;
      const futures =
        futuresResult.status === 'fulfilled' &&
        futuresResult.value?.ok === true &&
        futuresResult.value.data
          ? {
              lastPrice: Number(futuresResult.value.data.lastPrice) || 0,
              changePercent:
                futuresResult.value.data.changePercent === null ||
                futuresResult.value.data.changePercent === undefined
                  ? null
                  : Number(futuresResult.value.data.changePercent),
            }
          : null;

      if (overview === null) {
        setState({ status: 'ready', data: null });
        return;
      }
      setState({
        status: 'ready',
        data: {
          date: String(overview.date ?? ''),
          index: overview.indexClose ?? null,
          futures,
          breadth: overview.breadth ?? { up: 0, down: 0, upRatio: 0 },
          turnover: overview.turnover ?? { total: 0 },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <>
        <div
          className="data-panel hud-panel glass rounded-2xl p-5  "
          role="status"
          aria-label="今日一句資料載入中"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          <div className="mt-3 h-5 w-full animate-pulse rounded bg-surface-2" />
        </div>
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="status"
          aria-label="指數與家數資料載入中"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="rounded-2xl border border-line bg-surface px-3 py-3"
            >
              <div className="h-3.5 w-16 animate-pulse rounded bg-surface-2" />
              <div className="num mt-1 h-6 w-24 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </section>
      </>
    );
  }

  return <TodayMarketBriefView data={state.data} />;
}
