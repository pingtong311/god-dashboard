'use client';

/**
 * /trump/ 美國政策題材 — 客戶端資料區塊
 * ----------------------------------------------------------------------------
 * 打自家 API（GET /api/skynet/trump-radar）取得**自產**資料（Google News RSS
 * 英文＋白宮官方＋Google News RSS 繁中），把 6 個原本的載入骨架換成真實資料。
 *
 * 兩項誠實降級（業主明示，非缺陷）：
 *   1. 不翻譯：直接顯示英文原文標題，UI 明確標示「英文原文，未經翻譯」。
 *   2. 不提供情緒分類：實站標題情緒標記內部矛盾，本站留白（見 SENTIMENT_DISCLOSURE）。
 *
 * 載入中維持 role="status" 骨架；上游失敗誠實顯示，不造假數字。
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  METHOD_TEXT,
  NOTE_TEXT,
  SENTIMENT_DISCLOSURE,
  type TrumpRadarResponse,
} from '@/lib/trumpRadar';

/** 觀察窗天數（對齊實站 ?days=45）。 */
const DAYS = 45;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: TrumpRadarResponse }
  | { status: 'error' };

/** 載入骨架（對齊實站「載入中」語彙：role="status" + animate-pulse + 正在整理…）。 */
function LoadingBlock({ rows = 3 }: { rows?: number }): ReactElement {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border border-line bg-surface p-3">
          <div className="h-3.5 w-3/4 rounded bg-line/60" />
          <div className="mt-2 h-3 w-1/2 rounded bg-line/40" />
        </div>
      ))}
      <p className="text-[12.5px] leading-relaxed text-muted">正在整理…</p>
    </div>
  );
}

/** 上游失敗的誠實提示（不造假數字）。 */
function ErrorNote({ children }: { children: string }): ReactElement {
  return (
    <p className="rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

/** 摘要儀表 → 主題聲量摘要（因情緒留白，改以主題聲量與日期範圍呈現）。 */
function SummaryBody({ data }: { data: TrumpRadarResponse }): ReactElement {
  const top = data.themes[0];
  const dates = data.trend.map((t) => t.date);
  const rangeText =
    dates.length > 0 ? `${dates[0]} ～ ${dates[dates.length - 1]}` : '—';
  return (
    <div className="grid gap-2">
      <p className="text-[13.5px] leading-relaxed text-ink">
        近期待觀察區間內，共 <strong className="text-accent">{data.total}</strong> 則美國原文報導
        {top ? (
          <>
            ；聲量最高主題為 <strong className="text-accent">{top.theme}</strong>（{top.count} 則）
          </>
        ) : null}
        。
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted">
        資料日期範圍：{rangeText}
        {data.trend.length > 1 ? `（共 ${data.trend.length} 天）` : ''}。
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted">
        {SENTIMENT_DISCLOSURE}
      </p>
    </div>
  );
}

/** 相關報導熱度：依日期列出則數（真實 trend）。 */
function TrendBody({ data }: { data: TrumpRadarResponse }): ReactElement {
  if (data.trend.length === 0) {
    return <p className="text-[12.5px] leading-relaxed text-muted">目前區間內沒有抓到的報導。</p>;
  }
  return (
    <div className="space-y-1.5">
      {data.trend
        .slice()
        .reverse()
        .slice(0, 10)
        .map((point) => (
          <div key={point.date} className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted">{point.date}</span>
            <span className="text-[12.5px] font-bold text-accent">{point.n} 則</span>
          </div>
        ))}
      <p className="pt-1 text-[12px] leading-relaxed text-muted">
        合計 {data.total} 則（資料日期 {data.trend[0].date} ～ {data.trend[data.trend.length - 1].date}）。
      </p>
    </div>
  );
}

export default function TrumpData(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/skynet/trump-radar?days=${DAYS}`, { cache: 'no-store' });
        const json = (await res.json()) as TrumpRadarResponse | { ok: false };
        if (cancelled) return;
        const candidate = json as TrumpRadarResponse;
        if (candidate && candidate.ok === true && Array.isArray(candidate.items)) {
          setState({ status: 'ready', data: candidate });
        } else {
          setState({ status: 'error' });
        }
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    };
    // 延到 microtask 再啟動：避免在同步 render 階段（例如測試環境無全域 fetch）同步拋錯、
    // 同步 setState，讓首屏穩定維持載入骨架（role="status" + 正在整理…）。
    void Promise.resolve().then(run);
    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const loading = state.status === 'loading';
  const error = state.status === 'error';

  return (
    <>
      {/* 摘要儀表 → 主題聲量摘要（情緒留白） */}
      <div className="mt-4 rounded-2xl border p-5 border-line bg-surface">
        <div className="text-[12.5px] font-bold text-muted">近期待觀察 · 美國政策標題敘事摘要</div>
        <div className="mt-4">
          {loading ? <LoadingBlock rows={2} /> : null}
          {error ? (
            <ErrorNote>美國政策 RSS 原文暫時無法取得（上游無回應），稍後重試；不先放推測數字。</ErrorNote>
          ) : null}
          {data ? <SummaryBody data={data} /> : null}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">{SENTIMENT_DISCLOSURE}</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="data-panel hud-panel glass rounded-2xl p-5">
          <div className="text-[12.5px] text-muted">相關報導熱度</div>
          <div className="mt-2">
            {loading ? <LoadingBlock rows={1} /> : null}
            {error ? <ErrorNote>報導熱度暫時無法取得。</ErrorNote> : null}
            {data ? <TrendBody data={data} /> : null}
          </div>
        </div>
        <div className="data-panel hud-panel glass rounded-2xl p-5">
          <div className="text-[12.5px] text-muted">資料怎麼來？</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{METHOD_TEXT}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            標題為<b className="text-ink">英文原文，未經翻譯</b>（本站無翻譯資源，不假裝有）；點「讀美國原文」可見完整報導。
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{SENTIMENT_DISCLOSURE}</p>
        </div>
      </div>

      {/* 美國原文報導 */}
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">美國原文報導</h2>
          </div>
          {data ? (
            <span className="shrink-0 text-[12px] text-muted">共 {data.total} 則 · 英文原文</span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        {loading ? <LoadingBlock rows={5} /> : null}
        {error ? <ErrorNote>美國原文報導暫時無法取得（上游無回應），稍後重試。</ErrorNote> : null}
        {data && data.items.length === 0 ? (
          <ErrorNote>目前區間內沒有抓到的美國原文報導。</ErrorNote>
        ) : null}
        {data
          ? data.items.map((item) => (
              <article key={item.link} className="data-panel hud-panel glass rounded-2xl p-4">
                <p className="text-[14px] font-bold leading-relaxed text-ink">{item.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span className="rounded-full border border-accent/40 px-2 py-0.5 font-bold text-accent">
                    {item.theme}
                  </span>
                  <span>{item.source}</span>
                  <span>{item.date || '—'}</span>
                </div>
                <a
                  className="mt-1 inline-flex min-h-11 items-center text-[13px] font-bold text-accent"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  讀美國原文 ↗
                </a>
              </article>
            ))
          : null}
      </div>

      {/* 政策主題聲量 */}
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">政策主題聲量</h2>
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {loading ? <LoadingBlock rows={2} /> : null}
        {error ? <ErrorNote>政策主題聲量暫時無法取得。</ErrorNote> : null}
        {data
          ? data.themes.map((theme) => (
              <div key={theme.theme} className="data-panel hud-panel glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-black text-ink">{theme.theme}</span>
                  <span className="text-[13px] font-bold text-accent">{theme.count} 則</span>
                </div>
                {theme.sectors.length > 0 ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    台股族群：{theme.sectors.join(' / ')}
                  </p>
                ) : null}
              </div>
            ))
          : null}
      </div>

      {/* 台媒轉述（輔助） */}
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">台媒轉述（輔助）</h2>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {loading ? <LoadingBlock rows={3} /> : null}
        {error ? <ErrorNote>台媒轉述暫時無法取得（上游無回應）。</ErrorNote> : null}
        {data && data.tw_items.length === 0 ? (
          <ErrorNote>目前區間內沒有抓到的台媒轉述。</ErrorNote>
        ) : null}
        {data
          ? data.tw_items.map((item) => (
              <article key={item.link} className="data-panel hud-panel glass rounded-2xl p-4">
                <p className="text-[13.5px] font-bold leading-relaxed text-ink">{item.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span className="rounded-full border border-line/70 px-2 py-0.5 font-bold text-muted">
                    {item.theme}
                  </span>
                  <span>{item.source}</span>
                  <span>{item.date || '—'}</span>
                </div>
                <a
                  className="mt-1 inline-flex min-h-11 items-center text-[13px] font-bold text-accent"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  讀台媒原文 ↗
                </a>
              </article>
            ))
          : null}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-muted">{NOTE_TEXT}</p>
    </>
  );
}
