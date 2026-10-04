'use client';

/**
 * /swing 波段條件 — 客戶端互動部分
 * ----------------------------------------------------------------------------
 * 16 個頁籤改為真實資料：清單與計數皆來自 GET /api/skynet/swing-hub
 * （本站自產，非代理實站）。切換頁籤顯示該條件的 items。
 *
 * 誠實原則：
 *   - 計數以真實命中數為準（不再寫死）。
 *   - 某 tab 若資料源不可用，顯示該 tab 的 unavailable_reason，不塞假資料。
 *   - 大戶頁籤的「週增減／連續週數」因歷史週檔尚未累積 → 顯示「累積中」。
 *   - 紅漲綠跌（台股慣例）：正為紅（text-up）、負為綠（text-down）。
 */

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { SwingItem } from '@/lib/swingConditions';

/** 單一頁籤（對齊 /api/skynet/swing-hub 回應）。 */
export type SwingTab = {
  id: string;
  title: string;
  desc: string;
  items: SwingItem[];
  unavailable_reason?: string;
  note?: string;
};

/** 端點回應（對齊實站 schema）。 */
export type SwingHubResponse = {
  ok: boolean;
  /** 離線預算就緒與否：false 表示「尚未預算」（永久狀態，不可顯示成載入中）。 */
  ready?: boolean;
  /** 尚未預算時的誠實說明。 */
  message?: string;
  data_date: string;
  data_scope: string;
  next_update: string;
  week: string;
  weeksAccumulated: number;
  tabs: SwingTab[];
  note: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: SwingHubResponse }
  | { status: 'notReady'; message: string }
  | { status: 'error' };

/** 數值格式化：無值顯示破折號（誠實留白）。 */
function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

/** 帶正負號的百分比。 */
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/** 紅漲綠跌：正值 → text-up（紅）、負值 → text-down（綠）、其餘中性。 */
function toneClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '';
  return v > 0 ? 'text-up' : 'text-down';
}

/**
 * 卡片右上角主數值。
 * - whale 頁籤：`4週 {delta_4w}%`（**含 `4週 ` 前綴**；delta_4w 缺席顯示「累積中」），
 *   tone 依 delta_4w 正負。
 * - 其餘頁籤：`change_pct`（foreign/trust/both/reclaim/break20…）或 `ret20`（rs/sector）。
 * 對齊實站：只有 whale item 有 `delta_4w`，也只有 whale 頁籤帶 `4週` 前綴。
 */
function headline(tabId: string, item: SwingItem): { text: string; tone: string } {
  if (tabId === 'whale_in' || tabId === 'whale_out') {
    const v = item.delta_4w;
    if (v === null || v === undefined || !Number.isFinite(v)) return { text: '4週 累積中', tone: '' };
    return { text: `4週 ${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, tone: toneClass(v) };
  }
  if (item.change_pct !== undefined) return { text: fmtPct(item.change_pct), tone: toneClass(item.change_pct) };
  if (item.ret20 !== undefined) return { text: fmtPct(item.ret20, 1), tone: toneClass(item.ret20) };
  return { text: '', tone: '' };
}

/** 依 tone 決定卡片左邊框色（紅漲綠跌）；無 tone 時用中性 border-l-line。 */
function borderClassFor(tone: string): string {
  if (tone === 'text-up') return 'border-l-up';
  if (tone === 'text-down') return 'border-l-down';
  return 'border-l-line';
}

/** 單一統計磚。 */
type Tile = { label: string; value: string; tone?: string };

/** 依 tab id 與 item 欄位產生統計磚（最多 3 個）。 */
function metricTiles(tabId: string, item: SwingItem): Tile[] {
  switch (tabId) {
    case 'whale_in':
    case 'whale_out':
      return [
        { label: '大戶持股', value: `${fmt(item.big_pct)}%` },
        {
          label: '本週增減',
          value: item.delta_1w === null || item.delta_1w === undefined ? '累積中' : fmtPct(item.delta_1w),
          tone: toneClass(item.delta_1w),
        },
        {
          label: '連續週數',
          value: item.up_weeks === null || item.up_weeks === undefined ? '累積中' : `${item.up_weeks} 週`,
        },
      ];
    case 'ma60':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '月線', value: fmt(item.ma20) },
        { label: '季線', value: fmt(item.ma60) },
      ];
    case 'pullback':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '月線', value: fmt(item.ma20) },
        { label: '漲跌幅', value: fmtPct(item.change_pct), tone: toneClass(item.change_pct) },
      ];
    case 'foreign':
    case 'trust':
    case 'both':
    case 'reclaim':
    case 'badnews':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '漲跌幅', value: fmtPct(item.change_pct), tone: toneClass(item.change_pct) },
        ...(item.ma20 !== undefined ? [{ label: '月線', value: fmt(item.ma20) }] : []),
      ].slice(0, 3);
    case 'break20':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '量比', value: fmt(item.vol_ratio) },
        { label: '漲跌幅', value: fmtPct(item.change_pct), tone: toneClass(item.change_pct) },
      ];
    case 'rs':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '20 日報酬', value: fmtPct(item.ret20, 1), tone: toneClass(item.ret20) },
      ];
    case 'sector':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '20 日報酬', value: fmtPct(item.ret20, 1), tone: toneClass(item.ret20) },
        { label: '族群', value: item.industry ?? '—' },
      ];
    case 'margin':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '融資增減', value: `${item.margin_delta_lots ?? 0} 張`, tone: toneClass(item.margin_delta_lots) },
        { label: '20 日報酬', value: fmtPct(item.ret20, 1), tone: toneClass(item.ret20) },
      ];
    case 'revenue':
      return [{ label: '營收', value: item.hint ?? '—' }];
    case 'fill':
      return [
        { label: '收盤', value: fmt(item.close) },
        { label: '參考價回升', value: item.hint ?? '—' },
      ];
    case 'smart':
      return [
        { label: '區間幅度', value: fmtPct(item.range_pct, 1) },
        { label: '量比', value: fmt(item.vol_ratio) },
        { label: '融資增減', value: `${item.margin_delta_lots ?? 0} 張`, tone: toneClass(item.margin_delta_lots) },
      ];
    default:
      return [{ label: '收盤', value: fmt(item.close) }];
  }
}

/** 載入骨架（role=status + pulse）。 */
function CardsSkeleton(): ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="status" aria-live="polite">
      <span className="sr-only">正在載入波段條件清單…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="animate-pulse rounded-2xl border border-line/70 bg-surface h-28" />
      ))}
    </div>
  );
}

export default function SwingClient(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [activeId, setActiveId] = useState<string>('whale_in');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/swing-hub')
      .then((res) => res.json())
      .then((json: SwingHubResponse) => {
        if (cancelled) return;
        // 尚未預算（本站採每日盤後離線預算）→ 誠實顯示原因，**不可**顯示成載入中。
        if (json && json.ok === true && json.ready === false) {
          setState({
            status: 'notReady',
            message: json.message ?? '本站採每日盤後離線預算，目前尚無預算結果。',
          });
        } else if (json && json.ok === true && Array.isArray(json.tabs)) {
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

  const tabs: SwingTab[] = state.status === 'ready' ? state.data.tabs : [];
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;

  const weekText = state.status === 'ready' ? state.data.week || '—' : '—';
  const priceText = state.status === 'ready' ? state.data.data_date || '—' : '—';

  return (
    <div className="page-enter">
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">集保資料週期：{weekText}</p>
        <p className="text-sm text-muted">價格資料日：{priceText}｜盤後歷史條件</p>
        <div className="flex gap-1.5 rounded-xl bg-surface-2 p-1">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-bold bg-accent text-white">
            單一維度
          </button>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-bold text-muted">
            🔗 交集篩選
          </button>
        </div>
      </div>

      {state.status === 'error' ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          波段條件清單暫時無法取得（資料管線無回應），稍後重試；不先放推測數字。
        </p>
      ) : state.status === 'notReady' ? (
        // 尚未預算：明確說是「離線預算尚無結果」，不給載入骨架（那是永久狀態，不是等待）。
        <p
          role="status"
          className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted"
        >
          {state.message}
        </p>
      ) : state.status === 'loading' ? (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} aria-hidden="true" className="h-9 w-28 shrink-0 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
          <div className="mb-3 mt-9">
            <h2 className="text-lg font-bold tracking-tight md:text-xl">載入中…</h2>
          </div>
          <CardsSkeleton />
        </>
      ) : (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => {
              const isActive = active !== null && tab.id === active.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveId(tab.id)}
                  className={
                    isActive
                      ? 'shrink-0 rounded-xl px-3 py-2 text-sm font-bold bg-accent text-white'
                      : 'shrink-0 rounded-xl px-3 py-2 text-sm font-bold bg-surface-2 text-muted hover:text-ink'
                  }
                >
                  {tab.title}
                  <span className="ml-1 opacity-80">({tab.items.length})</span>
                </button>
              );
            })}
          </div>

          {active && (
            <>
              <div className="mb-3 mt-9 scroll-mt-28">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="section-mark" />
                    <h2 className="text-lg font-bold tracking-tight md:text-xl">{active.title}</h2>
                  </div>
                </div>
              </div>

              {active.items.length === 0 ? (
                <p className="rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
                  {active.unavailable_reason ?? '目前沒有符合此條件的個股；或資料尚在累積中。'}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {active.items.map((item) => {
                    const head = headline(active.id, item);
                    return (
                    <div
                      key={item.stock_id}
                      className={`data-panel hud-panel glass rounded-2xl p-5  border-l-2 ${borderClassFor(head.tone)}`}
                    >
                      <Link href={`/stock/?id=${item.stock_id}`} className="block">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-lg font-black text-accent">{item.label}</p>
                          <span className={`num font-black ${head.tone}`}>{head.text}</span>
                        </div>
                        {item.industry && <div className="mt-1 text-xs text-muted">{item.industry}</div>}
                        {item.hint && <div className="mt-1 text-[12px] leading-relaxed text-muted">{item.hint}</div>}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                          {metricTiles(active.id, item).map((tile) => (
                            <div key={tile.label} className="rounded-xl bg-surface-2 px-2 py-2">
                              <div className="text-[11px] text-muted">{tile.label}</div>
                              <div className={`num font-black ${tile.tone ?? ''}`}>{tile.value}</div>
                            </div>
                          ))}
                        </div>
                      </Link>
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
