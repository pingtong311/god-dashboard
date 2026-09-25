'use client';

/**
 * 技術分析 — 客戶端互動部分（個股維度，?id= 預設 2330）
 * ----------------------------------------------------------------------------
 * 逐字對齊 signal-2330.html 結構：自選股掃描（無資料源→誠實骨架）、查詢表單、
 * 預估量工具列、日 K 圖表（即時 client fetch /api/skynet/kline）、白話版、
 * 趨勢結論（EMA/RSI/量比/位階/支撐壓力/POC/斐波那契）、白話解讀。
 * 指標按鈕（均線／布林／MACD／RSI）可開關；數字全部由真實日 K 計算，不造假。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { analyze, fmtNum, fmtPct, type Candle, type SignalResult } from './signalEngine';

interface KlineResponse {
  candles?: Candle[];
  error?: string;
}

interface QuoteResponse {
  name?: string;
  error?: string;
}

/** 圖表指標開關（預設對齊實站：均線＋MACD 開、布林／RSI／CDP 關）。 */
type IndicatorKey = 'ma' | 'boll' | 'macd' | 'rsi';
/** CDP 為獨立開關（不屬於主指標鍵集），按鈕清單與狀態共用此聯集。 */
type ToggleKey = IndicatorKey | 'cdp';

const INDICATOR_BUTTONS: readonly { key: ToggleKey; label: string }[] = [
  { key: 'ma', label: '均線' },
  { key: 'boll', label: '布林' },
  { key: 'macd', label: 'MACD' },
  { key: 'rsi', label: 'RSI' },
  { key: 'cdp', label: 'CDP' },
] as const;

/** 日 K 圖表（SVG 640x288，價格區＋量條＋MACD/RSI 副圖）。 */
function KlineChart({
  ticker,
  name,
  candles,
  result,
  indicators,
  heightClass,
}: {
  ticker: string;
  name: string;
  candles: readonly Candle[];
  result: SignalResult;
  indicators: Record<IndicatorKey | 'cdp', boolean>;
  heightClass: string;
}) {
  const W = 640;
  const H = 288;
  const padL = 48;
  const padR = 8;
  const priceTop = 12;
  const priceBottom = 200;
  const volBase = 258;
  const volTop = 228;
  const subTop = 222;
  const subBottom = 282;

  const n = candles.length;
  const plotW = W - padL - padR;
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const candleW = Math.max(2, Math.min(6, step * 0.7));

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const padP = (maxP - minP) * 0.06 || 1;
  const yMax = maxP + padP;
  const yMin = minP - padP;

  const yPrice = (p: number): number =>
    priceBottom - ((p - yMin) / (yMax - yMin)) * (priceBottom - priceTop);
  const xAt = (i: number): number => padL + (n > 1 ? i * step : plotW / 2);

  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const volH = (v: number): number => (v / maxVol) * (volBase - volTop);

  // 副圖（MACD／RSI）各自 scale
  const macdVals = [...result.macd.dif, ...result.macd.dea];
  const subMax = Math.max(...macdVals, 1);
  const subMin = Math.min(...macdVals, -1);
  const subRange = subMax - subMin || 1;
  const ySub = (v: number): number =>
    subBottom - ((v - subMin) / subRange) * (subBottom - subTop);
  const yRsi = (v: number): number =>
    subBottom - (v / 100) * (subBottom - subTop);

  const line = (series: readonly (number | null)[]): string =>
    series
      .map((v, i) =>
        v === null ? null : `${xAt(i).toFixed(2)},${yPrice(v).toFixed(2)}`,
      )
      .filter((p): p is string => p !== null)
      .join(' ');

  const gridLines = [priceTop, (priceTop + priceBottom) / 2, priceBottom];
  const gridPrices = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full select-none [touch-action:pan-x_pan-y] ${heightClass}`}
      role="img"
      aria-label={`${ticker} ${name} 近 ${n} 日日K`}
      style={{ minWidth: '280px' }}
    >
      {gridLines.map((y, i) => (
        <g key={y}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y}
            y2={y}
            stroke="rgba(148,163,184,0.15)"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 6}
            y={y + 4}
            textAnchor="end"
            fill="#94a3b8"
            fontSize="11"
          >
            {Math.round(gridPrices[i])}
          </text>
        </g>
      ))}

      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? '#4ade80' : '#f87171';
        const bodyTop = yPrice(Math.max(c.open, c.close));
        const bodyBottom = yPrice(Math.min(c.open, c.close));
        return (
          <g key={c.date} opacity={1}>
            <line
              x1={xAt(i)}
              x2={xAt(i)}
              y1={yPrice(c.high)}
              y2={yPrice(c.low)}
              stroke={color}
              strokeWidth={1.25}
            />
            <rect
              x={xAt(i) - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={Math.max(bodyBottom - bodyTop, 1)}
              fill={color}
              rx={0.5}
            />
          </g>
        );
      })}

      {/* 成交量（半透明量條） */}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        return (
          <rect
            key={`v-${c.date}`}
            x={xAt(i) - candleW / 2}
            y={volBase - volH(c.volume)}
            width={candleW}
            height={Math.max(volH(c.volume), 1)}
            fill={up ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)'}
          />
        );
      })}

      {/* 均線 */}
      {indicators.ma && (
        <>
          <polyline
            fill="none"
            stroke="#fbbf24"
            strokeWidth={1.1}
            points={line(result.ma5Series)}
          />
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.1}
            points={line(result.ma20Series)}
          />
          <polyline
            fill="none"
            stroke="#c084fc"
            strokeWidth={1.1}
            points={line(result.ma60Series)}
          />
        </>
      )}

      {/* 布林通道 */}
      {indicators.boll && (
        <>
          <polyline
            fill="none"
            stroke="rgba(148,163,184,0.6)"
            strokeWidth={1}
            points={line(result.boll.upper)}
          />
          <polyline
            fill="none"
            stroke="rgba(148,163,184,0.6)"
            strokeWidth={1}
            points={line(result.boll.lower)}
          />
        </>
      )}

      {/* 副圖：MACD */}
      {indicators.macd && result.macd.dif.length > 1 && (
        <g>
          {result.macd.hist.map((h, i) => (
            <rect
              key={`h-${i}`}
              x={padL + i * (plotW / Math.max(result.macd.hist.length - 1, 1)) - 1.5}
              y={ySub(Math.max(h, 0))}
              width={3}
              height={Math.max(Math.abs(ySub(h) - ySub(0)), 1)}
              fill={h >= 0 ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'}
            />
          ))}
          <polyline
            fill="none"
            stroke="#f472b6"
            strokeWidth={1.1}
            points={result.macd.dif
              .map((v, i) => `${padL + i * (plotW / Math.max(result.macd.dif.length - 1, 1))},${ySub(v)}`)
              .join(' ')}
          />
          <polyline
            fill="none"
            stroke="#a78bfa"
            strokeWidth={1.1}
            points={result.macd.dea
              .map((v, i) => `${padL + i * (plotW / Math.max(result.macd.dea.length - 1, 1))},${ySub(v)}`)
              .join(' ')}
          />
        </g>
      )}

      {/* 副圖：RSI */}
      {indicators.rsi && (
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.1}
          points={result.rsiSeries
            .map((v, i) => (v === null ? null : `${xAt(i)},${yRsi(v)}`))
            .filter((p): p is string => p !== null)
            .join(' ')}
        />
      )}

      <text x={padL} y={subTop + 14} fill="#94a3b8" fontSize="10">
        {indicators.macd ? 'MACD' : indicators.rsi ? 'RSI' : '量'}
      </text>
    </svg>
  );
}

export default function SignalClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticker = searchParams.get('id') || '2330';

  const [query, setQuery] = useState(ticker);
  const [candles, setCandles] = useState<readonly Candle[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<Record<IndicatorKey | 'cdp', boolean>>({
    ma: true,
    boll: false,
    macd: true,
    rsi: false,
    cdp: false,
  });
  const [chartLarge, setChartLarge] = useState(false);

  useEffect(() => {
    setQuery(ticker);
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCandles([]);
    setName('');

    const from = new Date();
    from.setDate(from.getDate() - 360);
    const fromIso = from.toISOString().slice(0, 10);

    Promise.all([
      fetch(`/api/skynet/kline?ticker=${encodeURIComponent(ticker)}&type=daily&from=${fromIso}`),
      fetch(`/api/skynet/kline?ticker=${encodeURIComponent(ticker)}&type=quote`),
    ])
      .then(async ([kRes, qRes]) => {
        const kJson = (await kRes.json()) as KlineResponse;
        const qJson = (await qRes.json()) as QuoteResponse;
        if (cancelled) return;
        if (qJson.name) setName(qJson.name);
        if (!Array.isArray(kJson.candles) || kJson.candles.length === 0) {
          setError(kJson.error ?? 'no_data');
          setCandles([]);
          return;
        }
        // 只取最近 120 根，避免圖表過密
        setCandles(kJson.candles.slice(-120));
      })
      .catch(() => {
        if (!cancelled) setError('fetch_failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const result: SignalResult | null = useMemo(
    () => (candles.length > 0 ? analyze(candles) : null),
    [candles],
  );

  const onSubmitQuery = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      router.push(`/signal/?id=${encodeURIComponent(trimmed)}`);
    },
    [query, router],
  );

  const heading = `${ticker}${name ? ` ${name}` : ''}`;
  const upColor = (result?.changePercent ?? 0) >= 0 ? 'text-up' : 'text-down';

  return (
    <div className="page-enter">
      <section className="px-1 py-2">
        <h1 className="text-2xl font-black md:text-3xl">技術分析</h1>
      </section>
      <details className="my-2 rounded-xl border border-line bg-surface px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">
          比較我的自選股（選看）
        </summary>
        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">自選股技術掃描</h2>
            </div>
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-black text-muted">排序</span>
            {['貼近支撐', '貼近壓力', '量能異常', '最熱／最冷'].map((label, i) => (
              <button
                key={label}
                type="button"
                title={
                  [
                    '離最近轉折低點最近的排前面',
                    '離最近轉折高點最近的排前面',
                    '今日量相對近 5 日均量倍數最高',
                    'RSI 由高到低',
                  ][i]
                }
                className={
                  i === 0
                    ? 'min-h-9 rounded-full px-3 text-[12px] font-black transition bg-accent text-bg'
                    : 'min-h-9 rounded-full px-3 text-[12px] font-black transition border border-line bg-surface text-muted hover:border-accent'
                }
              >
                {label}
              </button>
            ))}
            <span className="num ml-auto text-[11.5px] text-muted">資料日 尚未入庫</span>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl   mt-2 overflow-x-auto p-0">
            <div className="p-4" role="status" aria-live="polite">
              <span className="sr-only">正在整理自選股技術掃描…</span>
              <div aria-hidden="true" className="grid gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-10 rounded-lg border border-line/70 bg-surface"
                  />
                ))}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                自選股技術掃描<b className="text-ink">資料尚未入庫</b>；登入後可比對自選股的結構狀態、收盤、距支撐／壓力、量比與人氣。
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            距支撐／壓力＝現價與最近轉折點的距離，2% 以內標紅（快碰到了）。
            量比 1.5 倍以上標紅＝今天量明顯放大。
            同一份日線收盤口徑；距支撐／壓力是與最近轉折點的距離。這是已發生的結構位置，不是進出訊號。點股票代號會進個股頁的技術分頁，看那一檔的完整結構（斐波、隔日統計、融資試算）。
          </p>
        </div>
      </details>
      <form className="relative mt-4 flex gap-2" onSubmit={onSubmitQuery}>
        <input
          placeholder="代號或中文名稱，例 2330 或 台積電"
          className="min-h-12 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="股票代號或名稱"
        />
        <button
          type="submit"
          className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  shrink-0 px-6"
        >
          查詢
        </button>
      </form>
      <section
        data-stock-browse-global="true"
        aria-label="看股工具"
        className="stock-browse-toolbar sticky z-20 mb-3 rounded-xl border border-line bg-surface p-2 shadow-sm sm:p-3"
      >
        <div className="min-w-0 text-sm" data-volume-stock={ticker}>
          <p className="font-bold tabular-nums">
            {ticker} 預估今日總成交量：
            <span className="text-muted">盤中預估量本站未接入</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            預估量僅在盤中依成交速度試算；盤後請以實量為準。
          </p>
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer py-1">預估量怎麼看？</summary>
            <p className="max-w-prose py-2 leading-6">
              意思是「照目前成交速度，今天整天可能成交幾張」，不是已成交量。例如10:00已成交1,000張，時間比例試算為4,500張。計算為累計張數 × 270 ÷ 已交易分鐘；前10分鐘、資料超過90秒及非盤中不估算。此版本未校正早尾盤量分布，可能高估或低估；它是量能參考，不是獨立買賣訊號，也不能代替實量3,000張門檻。
            </p>
          </details>
        </div>
      </section>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">{heading}</h2>
          </div>
        </div>
      </div>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.share) {
              navigator.share({ title: `${heading} 技術分析`, url: window.location.href }).catch(() => {});
            } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(window.location.href).catch(() => {});
            }
          }}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/45 bg-accent/10 px-3 text-[12.5px] font-black text-accent transition active:scale-[0.97]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            fill="currentColor"
            viewBox="0 0 256 256"
            aria-hidden="true"
          >
            <path d="M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z" />
          </svg>
          分享
        </button>
      </div>

      {/* 圖表面板 */}
      <div className="data-panel hud-panel glass rounded-2xl p-5  mb-3">
        <div className="min-h-[14rem]">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-black">
              {heading} 近 {candles.length || '—'} 日日K
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {INDICATOR_BUTTONS.map((btn) => {
                const isOn = indicators[btn.key];
                return (
                  <button
                    key={btn.key}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() =>
                      setIndicators((prev) => ({ ...prev, [btn.key]: !prev[btn.key] }))
                    }
                    className={
                      isOn
                        ? 'rounded-lg px-2 py-1 text-[12px] font-bold bg-accent/20 text-accent'
                        : 'rounded-lg px-2 py-1 text-[12px] font-bold bg-surface-2 text-muted'
                    }
                  >
                    {btn.label}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={chartLarge}
                onClick={() => setChartLarge(false)}
                className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-bold text-muted disabled:opacity-40"
              >
                縮小
              </button>
              <button
                type="button"
                onClick={() => setChartLarge(true)}
                className="min-h-11 rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-bold text-muted disabled:opacity-40"
              >
                放大
              </button>
              <button
                type="button"
                onClick={() => {
                  const svg = document.querySelector('svg[role="img"]');
                  svg?.requestFullscreen?.().catch(() => {});
                }}
                className="min-h-11 rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-bold text-accent"
              >
                全螢幕
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-2" role="status" aria-live="polite">
              <span className="sr-only">正在整理 {heading} 的日 K 資料…</span>
              <div
                aria-hidden="true"
                className={`animate-pulse rounded-lg border border-line/70 bg-surface ${
                  chartLarge ? 'h-[28rem]' : 'h-72 md:h-80'
                }`}
              />
            </div>
          ) : error !== null || !result ? (
            <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
              <div className="max-w-md">
                <p className="mt-3 font-black text-ink">目前沒有資料</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  {ticker} 的日 K 資料暫時抓不到（行情資料源未設定或逾時）。可稍後再試，或改查其他代號。
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="num mb-1 flex flex-wrap gap-x-2 gap-y-0.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] leading-relaxed">
                <b className="text-accent">{result.last?.date ?? '—'}</b>
                <span>開 {fmtNum(result.last?.open ?? null)}</span>
                <span>高 {fmtNum(result.last?.high ?? null)}</span>
                <span>低 {fmtNum(result.last?.low ?? null)}</span>
                <span className={`font-black ${upColor}`}>
                  收 {fmtNum(result.close)}
                </span>
                {indicators.ma && (
                  <>
                    <span style={{ color: 'rgb(251, 191, 36)' }}>MA5 {fmtNum(result.ma5, '—')}</span>
                    <span style={{ color: 'rgb(56, 189, 248)' }}>
                      MA20 {fmtNum(result.ma20, '—')}
                    </span>
                    <span style={{ color: 'rgb(192, 132, 252)' }}>
                      MA60 {fmtNum(result.ma60, '—')}
                    </span>
                  </>
                )}
                <span className="text-muted">量 {Number(result.last?.volume ?? 0).toLocaleString('zh-Hant')} 張</span>
              </div>
              <div className="w-full overflow-x-auto">
                <KlineChart
                  ticker={ticker}
                  name={name}
                  candles={candles}
                  result={result}
                  indicators={indicators}
                  heightClass={chartLarge ? 'h-[28rem]' : 'h-72 md:h-80'}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                <span style={{ color: 'rgb(251, 191, 36)' }}>■</span> MA5　
                <span style={{ color: 'rgb(56, 189, 248)' }}>■</span> MA20　
                <span style={{ color: 'rgb(192, 132, 252)' }}>■</span> MA60　
                <span style={{ color: 'rgb(244, 114, 182)' }}>■</span> DIF　
                <span style={{ color: 'rgb(167, 139, 250)' }}>■</span> DEA
              </p>
            </>
          )}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          圖上可以自己開關均線、MACD、RSI。下面那些數字就是從這張圖算出來的。
        </p>
      </div>

      {/* 白話版 */}
      {result && (
        <div className="data-panel hud-panel glass rounded-2xl p-5  mb-3">
          <p className="text-[14px] font-black text-ink">
            白話版：資料日的歷史結構是「{result.trend ?? '—'}」
          </p>
          <ul className="mt-2 grid gap-2">
            <li className="text-[13.5px] leading-relaxed text-muted">
              · 收盤 {fmtNum(result.close)} 在 20 日均線 {fmtNum(result.ema20)}{' '}
              {(result.close ?? 0) >= (result.ema20 ?? 0) ? '上面' : '下面'}。20
              日均線是近期價格的平均，不是投資人的實際持股成本。收盤高於這條平均線，只描述資料日的位置。
            </li>
            <li className="text-[13.5px] leading-relaxed text-muted">
              · RSI {fmtNum(result.rsi14)}
              ，落在{(result.rsi14 ?? 50) >= 70 ? '偏強' : (result.rsi14 ?? 50) <= 30 ? '偏弱' : '中間'}的位置。RSI
              是把「最近漲的力氣和跌的力氣」換算成 0 到 100 的數字：70
              以上代表最近漲得又快又急，30 以下代表跌得又快又急。
            </li>
            <li className="text-[13.5px] leading-relaxed text-muted">
              · 20 日位階 {fmtPct(result.level20)}：把最近 20
              天的最低點當 0%、最高點當 100%，現在的收盤在{' '}
              {Math.round(result.level20 ?? 0)}% 的高度。位於這段歷史區間中間，不推估之後方向。
            </li>
            <li className="text-[13.5px] leading-relaxed text-muted">
              · 量比 {fmtNum(result.volumeRatio)} 倍，也就是這天的成交量是最近平均的{' '}
              {fmtNum(result.volumeRatio)} 倍。成交量小於基準量，不據此判斷參與者的意圖。
            </li>
            <li className="text-[13.5px] leading-relaxed text-muted">
              · 圖上標的支撐 {fmtNum(result.support)} 與壓力 {fmtNum(result.resistance)}
              ，是依歷史高低點計算的結構位置，不等於成交密集帶。僅供核對歷史位置，不代表價格到此就會停止或反轉。
            </li>
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            以上全部在描述「已經發生的狀態」。技術指標說明的是現在的位置與力氣，
            不能推論接下來會漲還是會跌，也不是買賣建議。
          </p>
        </div>
      )}

      {/* 趨勢結論 */}
      {result && (
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="flex items-center gap-3 rounded-t-2xl px-5 py-4 bg-amber-400/10">
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-black/70 px-2.5 py-1.5">
              <span className="h-4 w-4 rounded-full bg-red-500 text-red-500 opacity-15" />
              <span className="h-4 w-4 rounded-full bg-amber-400 text-amber-400 glow-dot" />
              <span className="h-4 w-4 rounded-full bg-emerald-500 text-emerald-500 opacity-15" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-black text-amber-300">{result.trend ?? '—'}</p>
              <p className="text-[12.5px] leading-snug text-muted">
                以下描述資料日已發生的日 K 結構，不推估下一次走勢。
              </p>
            </div>
            <span className="ml-auto shrink-0 text-right">
              <span className="num block text-lg font-black">{fmtNum(result.close)}</span>
              <span className={`num text-sm font-bold ${upColor}`}>
                {result.changePercent === null
                  ? '—'
                  : `${result.changePercent >= 0 ? '+' : ''}${fmtPct(result.changePercent)}`}
              </span>
            </span>
          </div>
          <div className="px-5 py-2">
            {(
              [
                ['市場情緒', ''],
                ['EMA20', fmtNum(result.ema20)],
                ['EMA100', fmtNum(result.ema100)],
                ['RSI（14日）', fmtNum(result.rsi14)],
                ['量比熱度', result.volumeRatio === null ? '—' : `${fmtNum(result.volumeRatio)} 倍`],
                ['20日位階', fmtPct(result.level20)],
                ['EMA20 乖離', fmtPct(result.deviation20)],
                ['最近支撐位（日K結構）', fmtNum(result.support)],
                ['最近壓力位（日K結構）', fmtNum(result.resistance)],
                ['最大量成本區（POC）', fmtNum(result.poc)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="border-b border-line/60 py-2.5 last:border-0">
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <span className="shrink-0 text-[13.5px] text-muted">{label}</span>
                  <span
                    className={`num text-right text-[13.5px] font-bold ${
                      label === '最近支撐位（日K結構）'
                        ? 'text-cyan-400'
                        : label === '最近壓力位（日K結構）'
                          ? 'text-orange-400'
                          : ''
                    }`}
                  >
                    {value}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5">
            <p className="mb-2 text-sm font-bold text-muted">回檔常見接手區（斐波那契回撤）</p>
            <p className="mb-2 text-[12px] leading-relaxed text-muted">
              從近段高點往下量的比例尺。拉回到這些價位，歷史上常有人接手；不是進出場指令。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['38.2', '50', '61.8'] as const).map((k) => (
                <div key={k} className="rounded-xl bg-surface-2 px-2 py-2.5 text-center">
                  <div className="text-xs text-muted">{k}%</div>
                  <div className="num text-base font-black">
                    {fmtNum(result.fib[k] ?? null)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">白話解讀</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <ul className="grid gap-2.5">
          <li className="flex gap-2.5 text-[13.5px] leading-relaxed">
            <span className="mt-0.5 shrink-0 text-accent">▍</span>
            請連同資料日、計算期間與樣本數閱讀；歷史條件比例不是未來漲跌機率。
          </li>
        </ul>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        以提供的紅綠燈 v2 原檔為比對依據，目前為部分研究移植；尚未通過 TradingView
        逐棒一致性驗證，不等於原版警示或實盤績效。內容為歷史統計與技術狀態描述，不構成投資建議。
      </p>
      <p className="mt-3 text-[12.5px] text-muted">
        <Link href={`/stock/?id=${encodeURIComponent(ticker)}`} className="font-bold text-accent">
          前往 {ticker} 個股研究頁 →
        </Link>
      </p>
    </div>
  );
}
