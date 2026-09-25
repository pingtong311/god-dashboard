/**
 * M6 台指期 × 加權指數 4 格 data-stat —— SPEC 會員四頁 §M6。
 * ----------------------------------------------------------------------------
 * 資料（真實來源，與 /diary 同慣例，前端 fetch 自家 API）：
 *   - 台指期近月／漲跌／合約月：GET /api/skynet/futures（TAIFEX OpenAPI EOD）
 *     → { ok, data: { lastPrice, changePercent, contract, … } }，
 *       ok:false 或 lastPrice<=0 時顯示 '--'（不偽裝 0，與 route 哨兵值策略一致）
 *   - 加權指數：GET /api/skynet/market-overview（TWSE）→ data.indexClose
 *   - 期現價差＝期近月收盤－加權收盤（四捨五入到整數）；
 *     正數＝正價差（text-up）、負數＝逆價差（text-down）
 *
 * 載入態：4 格維持 capture 外殼，值以 animate-pulse 骨架 + role="status" 呈現
 * （SPEC §M6 標籤與顏色皆由資料驅動，本元件照此規則算）。
 *
 * Client component：需要瀏覽器 fetch + useEffect。
 */
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  formatFuturesPrice,
  formatIndexPrice,
  formatSignedPercent,
  priceTone,
} from './market-data';

type FuturesQuote = {
  lastPrice: number;
  changePercent: number | null;
  contract: string;
};

type OverviewIndex = {
  price: number;
  changePercent: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; futures: FuturesQuote | null; index: OverviewIndex | null };

type StatCard = {
  label: string;
  value: string;
  tone: string;
};

/** 4 格內容全由資料算出（label 含合約月；期現價差正負決定正／逆價差文案）。 */
function buildCards(futures: FuturesQuote | null, index: OverviewIndex | null): StatCard[] {
  const futuresOk = futures !== null && futures.lastPrice > 0;
  const contractCompact = futures?.contract.replace('-', '') ?? '';

  const basis =
    futuresOk && index !== null && index.price > 0
      ? Math.round(futures!.lastPrice - index.price)
      : null;

  return [
    {
      label: futuresOk ? `台指期近月 ${contractCompact}` : '台指期近月',
      value: futuresOk ? formatFuturesPrice(futures!.lastPrice) : '--',
      tone: futuresOk ? 'text-ink' : 'text-muted',
    },
    {
      label: '台指期漲跌',
      value: formatSignedPercent(futuresOk ? futures!.changePercent : null),
      tone: priceTone(futuresOk ? futures!.changePercent : null),
    },
    {
      label: '加權指數',
      value: index !== null && index.price > 0 ? formatIndexPrice(index.price) : '--',
      tone: index !== null && index.price > 0 ? 'text-ink' : 'text-muted',
    },
    {
      label:
        basis === null
          ? '期現價差'
          : basis >= 0
            ? '期現價差 正價差'
            : '期現價差 逆價差',
      value: basis === null ? '--' : String(basis),
      tone:
        basis === null
          ? 'text-muted'
          : basis > 0
            ? 'text-up'
            : basis < 0
              ? 'text-down'
              : 'text-ink',
    },
  ];
}

export default function FuturesIndexStats(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/skynet/futures', { cache: 'no-store' }).then((res) => res.json()),
      fetch('/api/skynet/market-overview', { cache: 'no-store' }).then((res) => res.json()),
    ]).then(([futuresResult, overviewResult]) => {
      if (cancelled) return;
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
              contract: String(futuresResult.value.data.contract ?? ''),
            }
          : null;
      const overview =
        overviewResult.status === 'fulfilled' && overviewResult.value?.ok === true
          ? overviewResult.value.data
          : null;
      const index = overview?.indexClose ?? null;
      setState({ status: 'ready', futures, index });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        role="status"
        aria-label="台指期與加權指數資料載入中"
      >
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 "
          >
            <div className="h-3.5 w-20 animate-pulse rounded bg-surface-2" />
            <div className="num mt-1.5 h-7 w-24 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  const cards = buildCards(state.futures, state.index);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 "
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12.5px] font-bold leading-snug text-muted">{card.label}</div>
          </div>
          <div className={`num mt-1.5 text-2xl font-black leading-none md:text-3xl ${card.tone}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
