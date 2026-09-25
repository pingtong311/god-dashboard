/**
 * M12 上市／上櫃兩張廣度卡 —— SPEC 會員四頁 §M12，逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * 資料策略：
 *   - 上市（加權）：真實資料，前端 fetch GET /api/skynet/market-overview
 *     （TWSE MI_INDEX）→ indexClose / breadth / turnover.total。上游失敗時
 *     顯示 '--' 並誠實標示，不偽造數字。
 *   - 上櫃（櫃買）：無對接來源（TPEx 行情管線未入庫），用實站快照常數
 *     （與 IndexMarquee 的櫃買快照同策略，見 market-data.ts 註解）。
 *   - 「平均漲跌」本站行情管線未提供（無全市場個股漲跌均值的原欄），照實顯示 '--'。
 *
 * badge「廣度接近」出現兩次（title tooltip + 純文字，推測 hover 與手機常駐），
 * 由 breadthLabel() 規則輸出；只有規則命中時才渲染兩個 span（capture 兩卡皆命中）。
 *
 * Client component：需要瀏覽器 fetch + useEffect。
 */
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  OTC_BREADTH_SNAPSHOT,
  breadthLabel,
  formatIndexPrice,
  formatSignedPercent,
  priceTone,
} from './market-data';

type OverviewData = {
  date: string;
  indexClose: { price: number; changePercent: number };
  breadth: { up: number; down: number };
  turnover: { total: number };
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: OverviewData | null };

export default function MarketBreadthCards(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/market-overview', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          data: body?.ok === true ? (body.data as OverviewData) : null,
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
      <div
        className="grid gap-3 md:grid-cols-2"
        role="status"
        aria-label="上市上櫃市場廣度資料載入中"
      >
        {[0, 1].map((index) => (
          <div key={index} className="data-panel hud-panel glass rounded-2xl p-5  ">
            <div className="h-5 w-28 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((cell) => (
                <div key={cell} className="rounded-xl bg-bg px-2 py-2">
                  <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
                  <div className="mx-auto mt-1 h-5 w-10 animate-pulse rounded bg-surface-2" />
                </div>
              ))}
            </div>
            <div className="mt-2 h-2 animate-pulse rounded-full bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ListedBreadthCard data={state.data} />
      <OtcBreadthCard />
    </div>
  );
}

function ListedBreadthCard({ data }: { data: OverviewData | null }): ReactElement {
  if (data === null) {
    return (
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <div className="flex items-center justify-between">
          <p className="text-lg font-black">上市（加權）</p>
          <span className="num text-right">
            <b>--</b>
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          加權指數與漲跌家數暫時無法取得（上游行情管線無回應），稍後重試；不先放推測數字。
        </p>
      </div>
    );
  }

  const { indexClose, breadth, turnover, date } = data;
  const up = breadth.up;
  const down = breadth.down;
  const badge = breadthLabel(up, down);
  const upWidth = up + down > 0 ? (up / (up + down)) * 100 : 0;
  const billions = Math.round(turnover.total / 1e8);

  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5  ">
      <div className="flex items-center justify-between">
        <p className="text-lg font-black">上市（加權）</p>
        <span className="num text-right">
          <b>{formatIndexPrice(indexClose.price)}</b>
          <span className={`ml-2 text-sm font-black ${priceTone(indexClose.changePercent)}`}>
            {formatSignedPercent(indexClose.changePercent)}
          </span>
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        市場廣度
        {badge !== null && (
          <>
            <span
              title="漲跌家數差不多，市場廣度偏中性。只描述已發生的相對幅度，不是買賣建議。"
              className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none text-ink bg-surface-2 "
            >
              {badge}
            </span>
            <span>{badge}</span>
          </>
        )}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <button type="button" className="rounded-xl px-2 py-2 transition bg-bg active:scale-[0.98]">
          <div className="text-xs text-muted">上漲家數 ▾</div>
          <div className="num text-lg font-black text-up">{up}</div>
        </button>
        <button type="button" className="rounded-xl px-2 py-2 transition bg-bg active:scale-[0.98]">
          <div className="text-xs text-muted">下跌家數 ▾</div>
          <div className="num text-lg font-black text-down">{down}</div>
        </button>
        <div className="rounded-xl bg-bg px-2 py-2">
          <div className="text-xs text-muted">平均漲跌</div>
          <div className="num text-lg font-black text-muted">--</div>
        </div>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
        aria-label={`上漲 ${up} 家、下跌 ${down} 家`}
      >
        <i className="block h-full rounded-l-full bg-up" style={{ width: `${upWidth.toFixed(4)}%` }} />
        <i className="block h-full flex-1 rounded-r-full bg-down" />
      </div>
      <p className="mt-2 text-sm text-muted">
        成交金額約 <b className="num">{billions.toLocaleString('zh-Hant')}</b> 億（{date} 盤後）
      </p>
    </div>
  );
}

function OtcBreadthCard(): ReactElement {
  const { price, changePercent, up, down, averageChange, turnoverInBillions } = OTC_BREADTH_SNAPSHOT;
  const badge = breadthLabel(up, down);
  const upWidth = up + down > 0 ? (up / (up + down)) * 100 : 0;

  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5  ">
      <div className="flex items-center justify-between">
        <p className="text-lg font-black">上櫃（櫃買）</p>
        <span className="num text-right">
          <b>{price}</b>
          <span className={`ml-2 text-sm font-black ${priceTone(changePercent)}`}>
            {formatSignedPercent(changePercent)}
          </span>
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        市場廣度
        {badge !== null && (
          <>
            <span
              title="漲跌家數差不多，市場廣度偏中性。只描述已發生的相對幅度，不是買賣建議。"
              className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none text-ink bg-surface-2 "
            >
              {badge}
            </span>
            <span>{badge}</span>
          </>
        )}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <button type="button" className="rounded-xl px-2 py-2 transition bg-bg active:scale-[0.98]">
          <div className="text-xs text-muted">上漲家數 ▾</div>
          <div className="num text-lg font-black text-up">{up}</div>
        </button>
        <button type="button" className="rounded-xl px-2 py-2 transition bg-bg active:scale-[0.98]">
          <div className="text-xs text-muted">下跌家數 ▾</div>
          <div className="num text-lg font-black text-down">{down}</div>
        </button>
        <div className="rounded-xl bg-bg px-2 py-2">
          <div className="text-xs text-muted">平均漲跌</div>
          <div className="num text-lg font-black text-up">{averageChange}</div>
        </div>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
        aria-label={`上漲 ${up} 家、下跌 ${down} 家`}
      >
        <i className="block h-full rounded-l-full bg-up" style={{ width: `${upWidth.toFixed(4)}%` }} />
        <i className="block h-full flex-1 rounded-r-full bg-down" />
      </div>
      <p className="mt-2 text-sm text-muted">
        成交金額約 <b className="num">{turnoverInBillions}</b> 億（實站快照）
      </p>
    </div>
  );
}
