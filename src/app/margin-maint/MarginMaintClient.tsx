'use client';

/**
 * /margin-maint 融資維持率 —— 真實資料（Client Component）
 * ----------------------------------------------------------------------------
 * 向本站代理 `GET /api/skynet/margin-maint` 取真實資料。
 *
 * 資料策略（誠實）：
 *   - 「全市場平均維持率」＝本站自算（見 API 的中文註解公式），真實顯示。
 *   - 「已低於 130% 的檔數」與「維持率最低的股票」＝個股維持率交易所未公開可算欄位，
 *     故誠實留空，不以 0 代替。
 *   - 上游失敗 → 誠實錯誤狀態。
 *
 * 版面文字（怎麼看、怎麼用、口徑說明）為逐字複刻 margin-maint.html，未更動。
 */

import { useEffect, useState, type ReactElement } from 'react';
import BackButton from './BackButton';

interface MarginMaintData {
  available: boolean;
  date: string;
  data_scope: string;
  next_update: string;
  note: string;
  market_maintenance: number | null;
  tight_threshold: number;
  items: unknown[];
  items_available: boolean;
  items_note: string;
  price_date: string;
  method: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MarginMaintData };

export default function MarginMaintClient(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/margin-maint', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad status'))))
      .then((body) => {
        if (cancelled) return;
        if (body?.ok === true) {
          setState({ status: 'ready', data: body as MarginMaintData });
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

  const data = state.status === 'ready' ? state.data : null;
  const market = data?.market_maintenance ?? null;
  const hasMarket = typeof market === 'number' && Number.isFinite(market);

  return (
    <div className="page-enter">
      <header className="page-heading rounded-[1.4rem] border border-line/80 bg-surface/72 px-5 py-5 md:px-7 md:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <BackButton />
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                資料日 <b className="text-ink">{data?.date || '尚未入庫'}</b>
                <span className="ml-2">
                  下次更新 {data?.next_update ?? '下一交易日 23:08'}
                </span>
              </p>
            </div>
            <h1 className="display text-[28px] font-black leading-tight text-ink md:text-[36px]">
              融資維持率
            </h1>
            <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
              看「借錢買股票的人被逼到什麼程度」。這是盤後公開數字，不是斷頭預測。
            </p>
          </div>
        </div>
      </header>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4">
        <p className="text-[14px] font-black text-ink">先看懂這個數字在講什麼</p>
        <div className="mt-2 grid gap-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            有些人買股票是<b className="text-ink">向券商借錢買</b>的，這叫融資。 借錢就要押擔保品，擔保品就是買進來的那些股票。
          </p>
          <p>
            <b className="text-ink">維持率＝擔保品現在的市值 ÷ 借的錢</b>，用百分比表示。 股價跌，擔保品變便宜，維持率就跟著下降。
          </p>
          <p>
            台股的規定是：維持率低於 <b className="text-ink">130%</b> 時， 券商會通知補錢（叫追繳）；不補就可能被強制賣掉（就是常聽到的
            <b className="text-ink">斷頭</b>）。
          </p>
          <p>
            所以這一頁在回答一件事：<b className="text-ink">現在有哪些股票，借錢買的人已經被壓到很緊了。</b>
          </p>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-3">
        <p className="text-[14px] font-black text-ink">這個資料常見的兩種用法</p>
        <div className="mt-2 grid gap-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            <b className="text-ink">一、當風險警示。</b>維持率很低的股票，如果再跌，可能出現被迫賣出的賣壓， 短時間內跌得比想像中快。手上有這些股票的人會想先知道。
          </p>
          <p>
            <b className="text-ink">二、當「賣壓出完了沒」的觀察點。</b>被強制賣出的量是「不得不賣」，賣完之後那一批賣壓就消失了。 有些人會統計這種情況結束後的表現，來判斷恐慌是不是過去了。
          </p>
          <p className="rounded-xl bg-surface-2/60 p-3">
            要講清楚：這一頁只提供已經公布的數字。維持率低不代表明天一定會被斷頭， 也不代表跌完就會反彈——很多低維持率的股票會繼續跌。 本站不會告訴你要不要買或賣，那必須是你自己的判斷。
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="data-panel hud-panel glass rounded-2xl p-5  ">
          <p className="text-sm text-muted">全市場平均維持率</p>
          {state.status === 'loading' ? (
            <div className="mt-2" role="status" aria-live="polite">
              <span className="sr-only">正在整理全市場平均維持率…</span>
              <div
                aria-hidden="true"
                className="animate-pulse num mt-1 h-9 w-28 rounded-lg border border-line/70 bg-surface"
              />
            </div>
          ) : hasMarket ? (
            <p className="num mt-1 text-3xl font-black text-ink">
              {(market as number).toFixed(2)}
              <span className="ml-0.5 text-base font-bold text-muted">%</span>
            </p>
          ) : (
            <p className="num mt-1 text-3xl font-black text-muted">—</p>
          )}
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {state.status === 'error'
              ? '暫時無法取得（交易所上游無回應），本站不放推測數字。'
              : '整個市場借錢買股的人平均被壓到什麼程度。這個數字往下掉， 代表市場整體的融資壓力在增加。'}
          </p>
        </div>
        <div className="data-panel hud-panel glass rounded-2xl p-5  ">
          <p className="text-sm text-muted">已低於 130% 的檔數</p>
          <div className="mt-2">
            <p className="num mt-1 text-3xl font-black text-muted">—</p>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            交易所未公開個股融資維持率（僅公開融資餘額），本站無法誠實計算檔數，故不列示。
          </p>
        </div>
      </div>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              維持率最低的股票（由低到高）
            </h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="p-4" role="status" aria-live="polite">
          {state.status === 'loading' && (
            <>
              <span className="sr-only">正在整理盤後融資維持率名單…</span>
              <div aria-hidden="true" className="grid gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface"
                  />
                ))}
              </div>
            </>
          )}
          <p className="text-[12.5px] leading-relaxed text-muted">
            盤後融資維持率名單<b className="text-ink">資料尚未入庫</b>
            ；交易所公開的融資融券餘額明細未包含個股維持率，本站暫無來源可誠實呈現這份名單。
          </p>
        </div>
      </div>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
          <span>這頁怎麼看？（點開，30 秒讀完）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              維持率是融資擔保品市值相對融資餘額的比率，由交易所與券商公開揭露。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              先看上面兩個總覽數字，再看名單。想深入就點代號進個股頁，對照量能與籌碼。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              這是盤後客觀資料表，不含進出場點位，也不預測會不會被追繳。
            </dd>
          </div>
        </dl>
      </details>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        盤後融資維持率，低到高排列。不是斷頭預測。
      </p>
      {hasMarket && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          大盤維持率為本站依交易所公開資料自算：
          <b className="text-ink">Σ(個股融資餘額張×1000×收盤價) ÷ 市場融資金額(仟元)×1000 × 100%</b>
          （資料日 {data?.date}
          {data?.price_date ? `、收盤價日 ${data.price_date}` : ''}）。
        </p>
      )}
    </div>
  );
}
