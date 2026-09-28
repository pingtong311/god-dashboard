'use client';

/**
 * K 線型態掃描 — 資料區（用戶端互動）
 * ----------------------------------------------------------------------------
 * 版面逐字對齊實站 patterns.html：7 個型態頁籤 + 選取型態說明面板 + 符合清單。
 * 資料改抓自家 API（GET /api/skynet/pattern-screen，來源為本站自算全市場日 K 幾何）。
 *
 * 誠實原則：
 *   - 資料未累積足夠（KV 尚無日 K）→ 顯示「日 K 資料累積中（目前 N 天）」，
 *     絕不以寫死數字假裝掃過。
 *   - 透明性：另以 details 揭露「我們的分類口徑」（觀察窗、容差、門檻）。
 *   - 紅漲綠跌：change_pct ≥ 0 → text-up（紅）；< 0 → text-down（綠）。
 */

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { PATTERN_ORDER, type PatternId } from '@/lib/patternScan';
import SourceBadge from '@/components/SourceBadge';
import type { Provenance } from '@/lib/provenance';
import type { PatternScreenResponse } from '@/app/api/skynet/pattern-screen/route';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: PatternScreenResponse }
  | { status: 'error' };

/** 漲跌幅字串：≥0 加正號（對齊實站 `+0%` / `-1%` 的呈現）。 */
function formatChange(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** 漲跌色類別（紅漲綠跌）。 */
function changeClass(pct: number): string {
  return pct >= 0 ? 'text-up' : 'text-down';
}

/** 成交量（張）千分位。 */
function formatLots(lots: number): string {
  return lots.toLocaleString('en-US');
}

/** 載入骨架（role=status + pulse）。 */
function ScanSkeleton(): ReactElement {
  return (
    <div role="status" aria-live="polite" className="mt-4">
      <span className="sr-only">正在掃描全市場日 K 型態…</span>
      <div aria-hidden="true" className="grid gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-xl border border-line/70 bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

/** 口徑說明區塊（透明性：讓使用者看到我們的幾何規則與門檻）。 */
function CriteriaDetails({
  criteria,
  gaps,
  windowDays,
  scannedStocks,
}: {
  criteria?: Record<string, number>;
  gaps?: string[];
  windowDays?: number;
  scannedStocks?: number;
}): ReactElement {
  return (
    <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
      <summary className="flex cursor-pointer items-center justify-between text-[13px] font-black text-accent">
        <span>我們的分類口徑（點開看幾何規則與門檻）</span>
        <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 text-[12.5px] leading-relaxed text-muted">
        <p>
          本站不用實站數字，而是以證交所／櫃買中心公開日 K <b className="text-ink">自算</b>幾何條件分類；
          僅陳述「已發生的型態」，不推論方向。
          {typeof scannedStocks === 'number' ? ` 本輪掃描 ${scannedStocks} 檔` : ''}
          {typeof windowDays === 'number' ? `，觀察窗 ${windowDays} 個交易日。` : '。'}
        </p>
        {criteria ? (
          <dl className="mt-2 grid gap-1.5">
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">最少日 K</dt>
              <dd>{criteria.minBars} 根（不足則不判定）</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">轉折點</dt>
              <dd>左右各 {criteria.pivotLookback} 根的區域極值</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">雙重底/頂</dt>
              <dd>
                兩腳（兩頂）相近容差 {criteria.doubleTolerancePct}%、中間反彈（回落）≥ {criteria.doubleMidMinBouncePct}%
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">頭肩</dt>
              <dd>
                兩肩相近容差 {criteria.shoulderTolerancePct}%、頭部突出 ≥ {criteria.headMinDepthPct}%
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">破底翻/假突破</dt>
              <dd>
                觀察窗 {criteria.trapLookbackBars} 根、破線幅度 ≥ {criteria.trapBreakMinPct}%、收回距今 ≤ {criteria.trapRecoverMaxAgeBars} 根
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">收斂三角</dt>
              <dd>後段區間 ≤ 前段區間 × {criteria.triangleMaxRangeRatio}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-black text-ink">時效</dt>
              <dd>型態最後轉折點距今 ≤ {criteria.recentPatternMaxAgeBars} 根</dd>
            </div>
          </dl>
        ) : null}
        {gaps && gaps.length > 0 ? (
          <div className="mt-3 border-t border-line/60 pt-2">
            <p className="font-black text-ink">已知缺口</p>
            <ul className="mt-1 list-disc pl-5">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * 口徑揭露（必要項）：標明來源為「本站自產」，並白話說明本頁清單與參考站的差異。
 *
 * 依業主要求，這裡**只**陳述三件事，且不得宣稱「我們比較準」：
 *   1. 本頁清單是本站自算，與參考站必然不同（我們不抄參考站數字）。
 *   2. 參考站的篩選規則無法反推（其 API 對程式化請求回 403），我們不做無根據的模仿。
 *   3. 本站口徑參數（k=3、容差 2.5%、時間窗 15 根）與實測召回 31/38（81.6%）。
 */
function CalibrationDisclosure({ provenance }: { provenance: Provenance }): ReactElement {
  return (
    <div className="mt-4">
      <SourceBadge provenance={provenance} />
      <details className="group mt-2 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13px] font-black text-accent">
          <span>本頁清單與參考站的差異（點開看）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
          <li>
            本頁清單是<b className="text-ink">本站自算</b>的結果，與任何參考站的清單
            <b className="text-ink">必然不同</b>——我們不抄參考站的數字。
          </li>
          <li>
            參考站的篩選規則<b className="text-ink">無法反推</b>（其 API 對程式化請求回 403），
            我們不做無根據的模仿。
          </li>
          <li>
            本站口徑：轉折點左右各 3 根（k=3）、兩腳容差 2.5%、型態時間窗 15 根；實測對參考站
            樣本的召回為 <b className="text-ink">31/38（81.6%）</b>。
          </li>
          <li>
            「召回 81.6%」只代表我們找得到參考站 81.6% 的樣本；
            <b className="text-ink">不代表我們多出來的檔數是對的，也不代表我們比較準</b>。
          </li>
        </ul>
      </details>
    </div>
  );
}

export default function PatternsClient(): ReactElement {
  const [active, setActive] = useState<PatternId>('w_bottom');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/pattern-screen', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: PatternScreenResponse) => {
        if (cancelled) return;
        if (json && json.ok === true) setState({ status: 'ready', data: json });
        else setState({ status: 'error' });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <ScanSkeleton />;

  if (state.status === 'error') {
    return (
      <p
        role="status"
        className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted"
      >
        K 線型態掃描<b className="text-ink">暫時無法取得</b>
        （本站上游資料管線無回應），稍後重試；不先放推測數字。
      </p>
    );
  }

  const data = state.data;

  // 資料尚未累積足夠 → 誠實狀態（不回空 patterns 假裝掃過）。
  if (!data.ready || !data.patterns) {
    return (
      <div className="mt-4">
        <p
          role="status"
          className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted"
        >
          <b className="text-ink">日 K 資料累積中</b>
          （目前 {data.availableDays ?? 0} 天，至少需 {data.minDaysRequired ?? 40} 天）。
          全市場日 K 尚在回填，待累積足夠即會自動開始辨識型態。
        </p>
        <CalibrationDisclosure
          provenance={{ source: 'self-produced', upstream: data.provenance?.upstream ?? '' }}
        />
        <CriteriaDetails criteria={data.criteria} gaps={data.gaps} />
      </div>
    );
  }

  const tabs = PATTERN_ORDER.map((id) => ({ id, ...data.patterns![id] }));
  const current = data.patterns[active];

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        資料日：<b className="text-ink">{data.data_date ?? '—'}</b>｜{data.data_scope ?? '盤後日 K'}
        <span className="ml-2">下次更新 {data.next_update ?? '—'}</span>
      </p>
      <CalibrationDisclosure
        provenance={{ source: 'self-produced', upstream: data.provenance?.upstream ?? '' }}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            aria-pressed={tab.id === active}
            className={
              tab.id === active
                ? 'min-h-11 rounded-xl border-2 px-3.5 text-[13.5px] font-bold transition active:scale-95 border-accent bg-accent text-bg'
                : 'min-h-11 rounded-xl border-2 px-3.5 text-[13.5px] font-bold transition active:scale-95 border-line bg-surface text-muted'
            }
          >
            {tab.meta.name}（{tab.count}）
          </button>
        ))}
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 border-l-accent">
        <div className="flex items-center gap-2">
          <p className="text-lg font-black">{current.meta.name}</p>
          <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-sm font-bold text-accent">
            {current.meta.structure}
          </span>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{current.meta.desc}</p>
      </div>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              符合的股票（{current.count}）
            </h2>
          </div>
        </div>
      </div>
      {current.items.length === 0 ? (
        <p
          role="status"
          className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted"
        >
          此型態在目前觀察窗內無符合個股。
        </p>
      ) : (
        <div className="data-panel hud-panel glass rounded-2xl   p-0">
          <div className="hidden grid-cols-[1fr_auto_auto] gap-2 border-b border-line/60 px-4 py-2.5 text-sm font-bold text-muted sm:grid">
            <span>股票</span>
            <span className="text-right">成交量</span>
            <span className="text-right">資料日收盤</span>
          </div>
          <div data-stock-result-scope="true">
            <ul>
              {current.items.map((row) => (
                <li
                  key={row.stock_id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line/60 px-4 py-3 last:border-0 sm:grid sm:grid-cols-[1fr_auto_auto]"
                >
                  <div className="min-w-0 basis-full sm:basis-auto">
                    <Link
                      href={`/signal/?id=${row.stock_id}`}
                      className="block font-bold text-accent underline-offset-4 hover:underline sm:truncate"
                    >
                      {row.stock_id} {row.stock_name}
                    </Link>
                    <span className="text-xs text-muted">
                      {row.industry ? row.industry : null}
                      {row.low_liquidity ? <span className="ml-1 text-amber-300">⚠量小</span> : null}
                    </span>
                  </div>
                  <span className="num text-right text-sm">
                    <span className="text-[11px] text-muted sm:hidden">量 </span>
                    <span className="font-bold sm:block">{formatLots(row.volume_lots)}</span>
                    <span className="text-xs text-muted"> 張</span>
                  </span>
                  <span className="num ml-auto text-right sm:ml-0">
                    <span className="font-bold sm:block">{row.close}</span>
                    <span
                      className={`ml-1 text-xs font-black sm:ml-0 ${changeClass(row.change_pct)}`}
                    >
                      {formatChange(row.change_pct)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <CriteriaDetails
        criteria={data.criteria}
        gaps={data.gaps}
        windowDays={data.windowDays}
        scannedStocks={data.scannedStocks}
      />
    </div>
  );
}
