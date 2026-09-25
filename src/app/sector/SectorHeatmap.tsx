/**
 * /sector/ 族群熱圖（today 群組）—— 客戶端元件。
 *
 * 逐字複刻 captured/login-capture/html/sector.html 的 <main> 結構與文案：
 *   - 「相關功能切換」pill 導覽（TodayGroupNav）
 *   - hero-hud 標題面板（含產業地圖／處置股名單連結）
 *   - 「第一次用這頁？」<details> 四問答
 *   - 「今天最強／最弱族群」摘要面板（由資料計算，不寫死）
 *   - sticky「族群分頁」三段切換（族群熱圖／龍頭比較／成交熱度）
 *   - 「族群強弱排行」卡片格（可點展開成分股，龍頭連到個股頁）
 *
 * 資料：/api/skynet/treemap（TWSE MI_INDEX 每日收盤行情代理）。
 * ⚠ 與實站差異（誠實化）：實站卡片第三行是「法人 +N 張」，本 API 只提供成交量，
 *   故如實改標為「成交 N 張」；龍頭為 API 依市值代理排序的首檔，非法人買超龍頭。
 *   龍頭比較／成交熱度尚無資料來源，以 role="status" 載入骨架如實呈現。
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TodayGroupNav from '@/components/TodayGroupNav';
import '../live/today-group.css';

/** /api/skynet/treemap 回傳的成分股。 */
type TreemapItem = {
  symbol: string;
  name: string;
  changePercent: number;
  volume: number;
};

/** /api/skynet/treemap 回傳的族群聚合。 */
type TreemapSector = {
  sector: string;
  totalVolume: number;
  count: number;
  items: TreemapItem[];
  changePercent: number;
};

type TreemapResponse =
  | { ok: true; date: string; sectors: TreemapSector[] }
  | { ok: false; error: string };

/** 族群分頁。 */
type SectorTab = 'heatmap' | 'leaders' | 'volume';

/** 列表狀態。 */
type ListState =
  | { kind: 'loading' }
  | { kind: 'ok'; date: string; sectors: TreemapSector[] }
  | { kind: 'error' };

/** 漲跌幅加號格式化（+2.25% / -0.5%）。 */
function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value.toFixed(2))}%`;
}

/** 'YYYYMMDD' → 'YYYY-MM-DD'。 */
function ymdToIso(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 族群卡片底色（對齊實站分檔：bg-up/50 → bg-up/25 → bg-surface-2 → bg-down/25）。 */
function sectorTone(changePercent: number): string {
  if (changePercent >= 1) return 'bg-up/50 text-white';
  if (changePercent > 0) return 'bg-up/25';
  if (changePercent > -0.25) return 'bg-surface-2';
  return 'bg-down/25';
}

/** 載入骨架卡（對齊實站「載入中」語彙）。 */
function SkeletonCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="hud-panel animate-pulse rounded-2xl border border-line p-3.5"
    >
      <div className="h-4 w-2/3 rounded bg-line/60" />
      <div className="mt-3 h-7 w-1/3 rounded bg-line/50" />
      <div className="mt-2 h-3.5 w-1/2 rounded bg-line/40" />
      <p className="mt-3 text-xs leading-relaxed text-muted">正在整理…</p>
    </div>
  );
}

export default function SectorHeatmap() {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [tab, setTab] = useState<SectorTab>('heatmap');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/skynet/treemap?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const json = (await res.json()) as { ok?: boolean; date?: string; sectors?: TreemapSector[] };
      if (!json || !json.ok || !Array.isArray(json.sectors)) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ok', date: json.date ?? '', sectors: json.sectors });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 依平均漲跌幅由大到小排序（實站「族群強弱排行」順序）。 */
  const ranked = useMemo(() => {
    if (state.kind !== 'ok') return [];
    return [...state.sectors].sort((a, b) => b.changePercent - a.changePercent);
  }, [state]);

  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  const toggleSector = (sector: string) => {
    setExpanded((prev) => ({ ...prev, [sector]: !prev[sector] }));
  };

  return (
    <>
      <TodayGroupNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">族群熱圖</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">今天錢往哪個產業跑。熱圖看強弱、比較看龍頭、產業鏈看資金流向； 一次只開一個分頁，不用滑到底。也可從
            <a href="/industry/" className="mx-1 font-black text-accent underline underline-offset-2">產業地圖</a>
            點進細分題材後，再連回這裡對照官方分類。下單前也可先掃
            <a href="/risk/" className="mx-1 font-black text-accent underline underline-offset-2">處置股名單</a>
            。
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            盤後｜資料時間 {state.kind === 'ok' && state.date ? ymdToIso(state.date) : '整理中'}
          </p>
        </section>

        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
            <span>第一次用這頁？點開 30 秒說明</span>
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">把全市場股票依產業分組，算出每個族群今天的平均漲跌、法人買賣超、還有誰在領漲，回答「今天是哪一類股在動」。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想知道「今天資金往哪跑、我手上的股票是強勢還是弱勢族群」的人。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看熱圖最紅的族群（資金焦點在哪），再切「龍頭比較」看誰跑最前面；點族群可展開成分股，點龍頭進個股盯盤。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">族群強弱只是研究背景，不是買賣訊號。強勢族群裡也有落後股、弱勢族群裡也有逆勢股，最後還是要看個股。</dd>
            </div>
          </dl>
        </details>

        <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4">
          {state.kind === 'ok' && strongest && weakest ? (
            <p className="text-[13.5px] leading-relaxed">
              今天最強族群是{' '}
              <b className="text-up">{strongest.sector}</b>
              （平均 {formatPercent(strongest.changePercent)}%
              {strongest.items[0] ? `，龍頭 ${strongest.items[0].symbol} ${strongest.items[0].name}` : ''}）； 最弱是{' '}
              <b className="text-down">{weakest.sector}</b>
              （平均 {formatPercent(weakest.changePercent)}%）。
            </p>
          ) : (
            <p role="status" className="animate-pulse text-[13.5px] leading-relaxed text-muted">
              正在整理今天最強與最弱族群…
            </p>
          )}
        </div>

        <nav aria-label="族群分頁" className="sticky top-[3.9rem] z-20 -mx-4 mt-5 border-y border-line/70 bg-bg/90 px-4 py-1.5 backdrop-blur md:mx-0 md:rounded-2xl md:border">
          <div className="flex gap-1 overflow-x-auto">
            <button
              type="button"
              aria-current={tab === 'heatmap' ? 'page' : undefined}
              onClick={() => setTab('heatmap')}
              className="min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 bg-accent-soft text-accent"
            >
              族群熱圖
            </button>
            <button
              type="button"
              aria-current={tab === 'leaders' ? 'page' : undefined}
              onClick={() => setTab('leaders')}
              className="min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 text-muted hover:bg-surface-2"
            >
              龍頭比較
            </button>
            <button
              type="button"
              aria-current={tab === 'volume' ? 'page' : undefined}
              onClick={() => setTab('volume')}
              className="min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 text-muted hover:bg-surface-2"
            >
              成交熱度
            </button>
          </div>
        </nav>

        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">
                {tab === 'heatmap' ? '族群強弱排行' : tab === 'leaders' ? '龍頭比較' : '成交熱度'}
              </h2>
            </div>
          </div>
        </div>

        {tab === 'heatmap' ? (
          state.kind === 'error' ? (
            <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
              族群資料暫時讀不到（TWSE 公開來源不可用）。
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 block min-h-10 rounded-xl border border-line px-4 text-[12.5px] font-bold text-accent transition hover:border-accent"
              >
                重試
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {state.kind === 'ok'
                ? ranked.map((sector) => {
                    const isOpen = Boolean(expanded[sector.sector]);
                    const upCount = sector.items.filter((item) => item.changePercent > 0).length;
                    const upRatio = sector.count > 0 ? Math.round((upCount / sector.count) * 100) : 0;
                    const leader = sector.items[0];
                    return (
                      <div key={sector.sector} className="flex flex-col gap-0">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => toggleSector(sector.sector)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleSector(sector.sector);
                            }
                          }}
                          className={`hud-panel cursor-pointer rounded-2xl border border-line p-3.5 text-left transition ${sectorTone(sector.changePercent)}`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-black">{sector.sector}</span>
                            <span className="num text-lg font-black">{formatPercent(sector.changePercent)}</span>
                          </div>
                          <div className="mt-1 text-xs opacity-90">
                            {sector.count} 檔｜上漲 {upRatio}%
                            <span className="ml-2 opacity-80">{isOpen ? '收合清單 ▲' : '展開清單 ▼'}</span>
                          </div>
                          <div className="num mt-1 text-xs opacity-90">成交 {sector.totalVolume.toLocaleString('zh-Hant')} 張</div>
                          {leader ? (
                            <a
                              href={`/stock/?id=${encodeURIComponent(leader.symbol)}`}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1.5 block truncate text-xs font-bold underline-offset-2 hover:underline"
                            >
                              龍頭 {leader.symbol} {leader.name}（{formatPercent(leader.changePercent)}）
                            </a>
                          ) : null}
                        </div>
                        {isOpen ? (
                          <ul className="mt-1 space-y-1 rounded-2xl border border-line/70 bg-surface/80 p-3 text-[12.5px]">
                            {sector.items.map((item) => (
                              <li key={item.symbol} className="flex items-center justify-between gap-2">
                                <a
                                  href={`/stock/?id=${encodeURIComponent(item.symbol)}`}
                                  className="truncate font-bold text-ink hover:text-accent"
                                >
                                  {item.symbol} {item.name}
                                </a>
                                <span className={`num shrink-0 ${item.changePercent > 0 ? 'text-up' : item.changePercent < 0 ? 'text-down' : 'text-muted'}`}>
                                  {formatPercent(item.changePercent)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })
                : Array.from({ length: 9 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-[12.5px] leading-relaxed text-muted">
                {tab === 'leaders'
                  ? '龍頭比較的資料來源尚未接入，正在整理；可先在「族群熱圖」點展開任一族群看成分股。'
                  : '成交熱度的資料來源尚未接入，正在整理；族群卡片已標示成交張數合計。'}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
