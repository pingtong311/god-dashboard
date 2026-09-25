'use client';

/**
 * 個股研究頁 /stock?id=2330
 * ----------------------------------------------------------------------------
 * 複刻「股市大佬 TradeBoss」App 的個股研究頁（業主指定截圖標的）。
 *
 * 版面逐字對照 captured/login-capture/html/tab-stock.html 的 <main>：
 *   1. 標題 + 查詢框 + 最近查詢
 *   2. 看股工具（預估量）
 *   3. 目前研究卡 + 動作列 + 狀態列 + 資料摘要 + 資料口徑
 *   4. 「我該怎麼看？」持有時間 playbook
 *   5. 9 個子分頁（<button> 切換，非路由）
 *   6. 8 張事實卡（個股事實導航）
 *   7. 研究熱度 / 產業定位 / 戰情榜名次 / 分點量價條件 / 研究摘要 / 個股新聞
 *   8. 資料日期與口徑
 *
 * 資料：走 /api/skynet/stock-research（BFF 聚合既有 route）。
 * 誠實原則：上游取不到的欄位顯示「資料未入庫」，**不放假資料、不用 Math.random()**。
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import './stock.css';
import {
  buildFactCards,
  buildResearchSummary,
  formatFixed,
  formatInt,
  formatSigned,
  formatSignedPct,
  toneOf,
  type RiskCard,
  type RiskTone,
  type StockResearchData,
} from '@/lib/stockResearch';

// ── 分頁定義 ────────────────────────────────────────────

type TabKey =
  | 'overview'
  | 'quote'
  | 'risk'
  | 'trend'
  | 'tech'
  | 'chips'
  | 'broker'
  | 'fundamental'
  | 'scenario';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '總覽' },
  { key: 'quote', label: '盤口' },
  { key: 'risk', label: '風險' },
  { key: 'trend', label: '走勢' },
  { key: 'tech', label: '技術' },
  { key: 'chips', label: '籌碼' },
  { key: 'broker', label: '分點' },
  { key: 'fundamental', label: '基本面' },
  { key: 'scenario', label: '情境' },
];

/** 事實卡 key → 對應分頁（點一格切到對應分頁）。 */
const FACT_TO_TAB: Record<string, TabKey> = {
  price: 'quote',
  institutional: 'chips',
  broker: 'broker',
  holder: 'chips',
  daytrade: 'quote',
  margin: 'chips',
  chipHealth: 'chips',
  regulatory: 'risk',
};

/** 代號 → 穩定的頭像色（依字元碼決定，非隨機）。 */
const AVATAR_GRADIENTS: readonly string[] = [
  'linear-gradient(135deg, rgb(65, 120, 54), rgb(40, 80, 33))',
  'linear-gradient(135deg, rgb(58, 96, 156), rgb(30, 52, 92))',
  'linear-gradient(135deg, rgb(150, 96, 40), rgb(96, 58, 20))',
  'linear-gradient(135deg, rgb(120, 60, 140), rgb(70, 32, 88))',
  'linear-gradient(135deg, rgb(160, 70, 70), rgb(96, 34, 34))',
];
function avatarGradient(ticker: string): string {
  let sum = 0;
  for (let i = 0; i < ticker.length; i += 1) sum += ticker.charCodeAt(i);
  return AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length];
}

// ── 小元件 ──────────────────────────────────────────────

/** 未入庫佔位（誠實標示）。 */
function NotIndexed({ label = '資料未入庫' }: { label?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/40 px-4 py-6 text-center">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-[12px] text-muted/80">
        本站尚無此資料源的公開授權來源，不顯示推測數字。
      </p>
    </div>
  );
}

/** 章節標題列（section-mark + 標題）。 */
function SectionHead({ title }: { title: string }) {
  return (
    <div className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{title}</h2>
        </div>
      </div>
    </div>
  );
}

// ── 主元件 ──────────────────────────────────────────────

function StockPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = searchParams.get('id') ?? '';
  const id = rawId.trim().toUpperCase();

  const [data, setData] = useState<StockResearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');
  const [query, setQuery] = useState(id);

  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const scrollTargetRef = useRef<HTMLDivElement | null>(null);

  // 載入資料
  useEffect(() => {
    if (!id) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(`/api/skynet/stock-research?ticker=${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.ok === true && body.data) {
          setData(body.data as StockResearchData);
        } else {
          setData(null);
          setError(body?.reason === 'invalid_ticker' ? '股票代號格式不正確' : '個股研究資料暫時無法取得，請稍後重試。');
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError('個股研究資料暫時無法取得，請稍後重試。');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 查詢框同步為「代號 名稱」
  useEffect(() => {
    setQuery(data?.name ? `${id} ${data.name}` : id);
  }, [id, data?.name]);

  const factCards = useMemo(() => (data ? buildFactCards(data) : []), [data]);
  const summary = useMemo(() => (data ? buildResearchSummary(data) : []), [data]);

  const submitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next = query.trim().split(/\s+/)[0] ?? '';
      if (!next) return;
      router.push(`/stock?id=${encodeURIComponent(next)}`);
    },
    [query, router]
  );

  const selectTab = useCallback((key: TabKey) => {
    setTab(key);
    const el = tabRefs.current[key];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  const openFactTab = useCallback(
    (factKey: string) => {
      const target = FACT_TO_TAB[factKey] ?? 'overview';
      selectTab(target);
      const el = scrollTargetRef.current;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [selectTab]
  );

  // ── 無代號：提示輸入 ──────────────────────────────────
  if (!id) {
    return (
      <main className="stock-main mx-auto w-full max-w-[1360px] px-4 pt-5 outline-none md:px-6 lg:pt-7">
        <div className="page-enter">
          <h1 className="text-lg font-bold text-muted md:text-xl">
            個股研究
            <span className="ml-2 text-[12.5px] font-medium">輸入代號或名稱（例如 2330、台積電）</span>
          </h1>
          <SearchForm query={query} setQuery={setQuery} onSubmit={submitSearch} />
          <div className="mt-6">
            <NotIndexed label="請輸入股票代號開始研究" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="stock-main mx-auto w-full max-w-[1360px] px-4 pt-5 outline-none md:px-6 lg:pt-7">
      <div className="page-enter">
        <h1 className="text-lg font-bold text-muted md:text-xl">
          個股研究
          <span className="ml-2 text-[12.5px] font-medium">輸入代號或名稱（例如 2330、台積電）</span>
        </h1>

        <SearchForm query={query} setQuery={setQuery} onSubmit={submitSearch} />

        {/* 最近查詢 */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold text-muted">最近查詢</span>
            <button
              type="button"
              className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              清除
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="group inline-flex items-center overflow-hidden rounded-full border border-line bg-surface">
              <button
                type="button"
                className="num py-1.5 pl-3 pr-2 text-sm font-bold text-ink hover:text-accent"
              >
                {id}
                {data?.name ? <span className="ml-1 font-medium text-muted">{data.name}</span> : null}
              </button>
              <button
                type="button"
                title="複製代號"
                className="border-l border-line px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-accent"
              >
                複製
              </button>
            </span>
          </div>
        </div>

        {loading ? <LoadingBlock /> : null}
        {error ? (
          <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            {error}
          </div>
        ) : null}

        {data ? (
          <StockBody
            data={data}
            tab={tab}
            factCards={factCards}
            summary={summary}
            tabRefs={tabRefs}
            scrollTargetRef={scrollTargetRef}
            onSelectTab={selectTab}
            onOpenFactTab={openFactTab}
          />
        ) : null}
      </div>
    </main>
  );
}

// ── 查詢表單 ────────────────────────────────────────────

function SearchForm({
  query,
  setQuery,
  onSubmit,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form className="relative mt-4 flex gap-2" onSubmit={onSubmit}>
      <input
        placeholder="2330 或 台積電"
        className="min-h-12 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        type="submit"
        className="mi-glare relative inline-flex min-h-12 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-6 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105"
      >
        查詢
      </button>
    </form>
  );
}

// ── 載入骨架 ────────────────────────────────────────────

function LoadingBlock() {
  return (
    <div className="mt-3 space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}

// ── 頁面主體 ────────────────────────────────────────────

function StockBody({
  data,
  tab,
  factCards,
  summary,
  tabRefs,
  scrollTargetRef,
  onSelectTab,
  onOpenFactTab,
}: {
  data: StockResearchData;
  tab: TabKey;
  factCards: ReturnType<typeof buildFactCards>;
  summary: ReturnType<typeof buildResearchSummary>;
  tabRefs: React.MutableRefObject<Partial<Record<TabKey, HTMLButtonElement | null>>>;
  scrollTargetRef: React.MutableRefObject<HTMLDivElement | null>;
  onSelectTab: (k: TabKey) => void;
  onOpenFactTab: (k: string) => void;
}) {
  const q = data.quote;
  const tone = toneOf(q?.changePct);
  const toneClass = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink';

  const statusText =
    data.projected.status === 'open' ? '盤中' : data.projected.status === 'closed' ? '已收盤' : '—';

  const projectedLine =
    data.projected.estimatedLots !== null
      ? `${data.ticker} 預估今日總成交量：約 ${formatInt(data.projected.estimatedLots)} 張`
      : `${data.ticker} 預估今日總成交量：${statusText}${data.projected.actualLots !== null ? `，實量 ${formatInt(data.projected.actualLots)} 張` : ''}`;

  return (
    <>
      {/* ── 看股工具（預估量） ─────────────────────────── */}
      <section
        data-stock-browse-global="true"
        aria-label="看股工具"
        className="stock-browse-toolbar sticky z-20 mb-3 rounded-xl border border-line bg-surface p-2 shadow-sm sm:p-3"
      >
        <div className="min-w-0 text-sm" data-volume-stock={data.ticker}>
          <p className="font-bold tabular-nums">{projectedLine}</p>
          <p className="mt-1 text-xs text-muted">
            {data.projected.actualLots !== null ? `最後收到實量 ${formatInt(data.projected.actualLots)} 張` : '暫無即時量'}
            {q?.tradeDate ? ` · ${q.tradeDate.replace(/-/g, '/')}` : ''}
            {q?.asOf ? ` ${q.asOf}:00` : ''}
          </p>
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer py-1">預估量怎麼看？</summary>
            <p className="max-w-prose py-2 leading-6">
              意思是「照目前成交速度，今天整天可能成交幾張」，不是已成交量。計算為累計張數 × 270 ÷
              已交易分鐘；前 10 分鐘及非盤中不估算。此版本未校正早尾盤量分布，可能高估或低估；
              它是量能參考，不是獨立買賣訊號，也不能代替實量 3,000 張門檻。
            </p>
          </details>
        </div>
      </section>

      {/* ── 目前研究卡 ─────────────────────────────────── */}
      <div className="data-panel hud-panel glass rounded-2xl mt-3 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid shrink-0 select-none place-items-center rounded-full border border-white/10 font-black text-white/90"
              style={{ width: 40, height: 40, fontSize: 18, background: avatarGradient(data.ticker) }}
            >
              {(data.name ?? data.ticker).slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.12em] text-muted">目前研究</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="num text-lg font-black text-ink">{data.ticker}</span>
                {data.industry ? (
                  <Link
                    href="/sector/"
                    className="rounded-md bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-accent touch-manipulation"
                    title="到族群熱圖看同類股"
                  >
                    {data.industry}
                  </Link>
                ) : (
                  <span
                    className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted"
                    title="本站尚無產業分類公開來源"
                  >
                    產業未入庫
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className={`num text-[30px] font-black leading-none tracking-tight ${toneClass}`}>
              {q?.price !== null && q?.price !== undefined ? formatInt(q.price) : '--'}
            </p>
            <p className={`num mt-1 text-[12.5px] font-black ${toneClass}`}>
              {q?.changePct !== null && q?.changePct !== undefined
                ? `${formatFixed(q.changePct, 0)}%`
                : '--'}
              {q?.asOf ? `　${q.asOf}` : ''}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            <Link
              href={`/research/?view=tools&sid=${data.ticker}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-ink transition hover:border-accent hover:text-accent active:scale-[0.97]"
            >
              找相似條件
            </Link>
            <Link
              href={`/backtest/?id=${data.ticker}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-ink transition hover:border-accent hover:text-accent active:scale-[0.97]"
            >
              追分點
            </Link>
            <button
              type="button"
              title="加入自選股"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-bold text-muted transition hover:text-ink touch-manipulation"
            >
              <span className="mi mi-pop inline-block">☆</span>
              <span>自選</span>
            </button>
            <button
              type="button"
              aria-expanded="false"
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-ink transition hover:border-accent hover:text-accent active:scale-[0.97]"
            >
              設提醒
            </button>
            <Link
              href={`/portfolio/?sid=${data.ticker}#add`}
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-ink transition hover:border-accent hover:text-accent active:scale-[0.97]"
            >
              加入持股
            </Link>
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/45 bg-accent/10 px-3 text-[12.5px] font-black text-accent transition active:scale-[0.97]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                <path d="M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z" />
              </svg>
              分享
            </button>
          </div>
        </div>
      </div>

      {/* 狀態列 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-muted">
        <span className="glow-dot h-2 w-2 shrink-0 rounded-full bg-muted text-muted" />
        <span className="font-bold">{statusText}</span>
        {data.projected.actualLots !== null ? (
          <span className="num">量 {formatInt(data.projected.actualLots)} 張</span>
        ) : null}
        {q?.asOf ? <span className="num ml-auto text-[11px] text-muted/80">更新 {q.asOf}</span> : null}
      </div>

      {/* 資料摘要 */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <p className="text-[11px] font-black tracking-[0.14em] text-muted">目前資料摘要 · 歷史資料</p>
        {summary.find((s) => s.label === '分點條件')?.available ? (
          <p className="mt-2 text-[14px] font-black leading-relaxed text-ink">
            {summary.find((s) => s.label === '分點條件')?.text}
          </p>
        ) : (
          <p className="mt-2 text-[14px] font-black leading-relaxed text-muted">
            分點買賣超資料未入庫
          </p>
        )}
        <p className="mt-3 text-[12.5px] text-muted">
          目前沒有額外風險標籤；仍要核對流動性、除權息與資料是否齊。
        </p>
        <details className="mt-3 rounded-xl border border-line/70 bg-surface-2/60 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-bold text-muted">
            {data.dataDate ? `盤後 ${data.dataDate} · 資料口徑` : '盤後 · 資料口徑'}
          </summary>
          <dl className="mt-2 grid gap-1 text-[12px] leading-relaxed">
            <div>
              <dt className="inline font-bold text-ink">依據：</dt>
              <dd className="inline text-muted">日 K、法人進出、融資券、估值、月營收、集保級距</dd>
            </div>
            <div>
              <dt className="inline font-bold text-ink">更新：</dt>
              <dd className="inline text-muted">盤後約下一交易日 21:30</dd>
            </div>
            <div>
              <dt className="inline font-bold text-ink">失效：</dt>
              <dd className="inline text-muted">資料日不是最新交易日、除權息未還原、或風險標籤已變更</dd>
            </div>
          </dl>
        </details>
      </div>

      {/* Playbook */}
      <section id="stock-playbook" className="scroll-mt-36 mt-4">
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-3.5 md:p-4">
          <h2 className="text-lg font-black">{data.ticker} 我該怎麼看？</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            先選你的持有時間。同一檔股票，抱幾天和當天沖掉，要看的東西完全不同。
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-expanded="false"
              className="min-h-12 rounded-xl border-2 border-line bg-surface px-3 py-2.5 text-left text-[12.5px] font-black text-ink transition hover:border-accent/50"
            >
              我做波段：只看日 K、籌碼連續性與過夜風險
            </button>
            <button
              type="button"
              aria-expanded="false"
              className="min-h-12 rounded-xl border-2 border-line bg-surface px-3 py-2.5 text-left text-[12.5px] font-black text-ink transition hover:border-accent/50"
            >
              我做當沖：只看盤中價量與短線風險
            </button>
          </div>
        </div>
      </section>

      {/* 9 個子分頁 */}
      <div id="stock-panel-start" />
      <nav
        aria-label="個股研究區塊"
        className="sticky top-[var(--stock-header-height)] z-20 -mx-4 mt-4 border-b border-line bg-bg/95 px-2 backdrop-blur-xl"
      >
        <div className="tab-track flex min-w-0 max-w-full flex-nowrap items-end gap-0.5 overflow-x-auto pr-4">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                aria-current={active ? 'location' : undefined}
                onClick={() => onSelectTab(t.key)}
                className={`relative min-h-11 shrink-0 whitespace-nowrap px-3 pb-2.5 pt-2.5 text-sm font-bold transition duration-200 active:scale-95 ${
                  active ? 'text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2.5 bottom-0 h-[2px] rounded-full transition ${
                    active ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>
      </nav>

      {/* 8 張事實卡 */}
      <nav aria-label="個股事實導航" className="mt-3">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {factCards.map((card, idx) => (
            <button
              key={card.key}
              type="button"
              onClick={() => onOpenFactTab(card.key)}
              className={`group flex min-h-[4.6rem] flex-col rounded-2xl border border-line bg-surface px-3 py-2 text-left transition hover:border-accent/50 active:scale-[0.98] ${
                idx === 0 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <span className="flex items-center justify-between gap-1 text-[11px] font-black tracking-wide text-muted">
                <span className="flex min-w-0 items-center gap-1">
                  {card.label}
                  {card.badge ? (
                    <span
                      className={`inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-black leading-none ${
                        card.badgeTone === 'up'
                          ? 'text-up'
                          : card.badgeTone === 'down'
                            ? 'text-down'
                            : 'text-ink'
                      }`}
                    >
                      {card.badge}
                    </span>
                  ) : null}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true" className="shrink-0 opacity-60 transition group-hover:translate-x-0.5">
                  <path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z" />
                </svg>
              </span>
              <span
                className={`num mt-1 truncate text-[13px] font-black leading-tight ${
                  card.valueTone === 'up'
                    ? 'text-up'
                    : card.valueTone === 'down'
                      ? 'text-down'
                      : 'text-ink'
                } ${card.available ? '' : 'text-muted'}`}
              >
                {card.value ?? '資料未入庫'}
              </span>
              <span className="mt-0.5 truncate text-[11px] font-bold text-muted">{card.sub ?? ''}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          每格都是已發生的公開數字（{data.dataDate ? `資料日 ${data.dataDate}` : '資料日未入庫'}
          ），點一格切到對應分頁；不是評分，也不是買賣建議。
        </p>
      </nav>

      {/* 分頁內容 */}
      <div ref={scrollTargetRef} className="scroll-mt-32" />
      <TabPanel tab={tab} data={data} summary={summary} />
    </>
  );
}

// ── 分頁內容 ────────────────────────────────────────────

function TabPanel({
  tab,
  data,
  summary,
}: {
  tab: TabKey;
  data: StockResearchData;
  summary: ReturnType<typeof buildResearchSummary>;
}) {
  if (tab === 'overview') return <OverviewTab data={data} summary={summary} />;

  if (tab === 'quote') {
    const q = data.quote;
    return (
      <section className="mt-3" aria-label="盤口">
        <SectionHead title="盤口" />
        <div className="data-panel hud-panel glass rounded-2xl p-4">
          {q ? (
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <Metric label="開盤" value={q.open !== null ? formatInt(q.open) : '--'} />
              <Metric label="最高" value={q.high !== null ? formatInt(q.high) : '--'} />
              <Metric label="最低" value={q.low !== null ? formatInt(q.low) : '--'} />
              <Metric label="昨收" value={q.prevClose !== null ? formatInt(q.prevClose) : '--'} />
              <Metric label="現價" value={q.price !== null ? formatInt(q.price) : '--'} />
              <Metric label="漲跌" value={q.changePct !== null ? `${formatFixed(q.changePct, 0)}%` : '--'} />
              <Metric label="成交量" value={q.volumeLots !== null ? `${formatInt(q.volumeLots)} 張` : '--'} />
              <Metric label="更新" value={q.asOf ?? '--'} />
            </dl>
          ) : (
            <NotIndexed label="即時報價未入庫" />
          )}
        </div>
        <div className="mt-3">
          <NotIndexed label="五檔委買賣未入庫" />
        </div>
      </section>
    );
  }

  if (tab === 'chips') {
    return (
      <section className="mt-3" aria-label="籌碼">
        <SectionHead title="籌碼" />
        <div className="data-panel hud-panel glass rounded-2xl p-4">
          <h3 className="text-[13px] font-black text-muted">三大法人（最新交易日）</h3>
          {data.institutional.date ? (
            <dl className="mt-2 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <Metric label="外資" value={`${formatSigned(data.institutional.foreignNet)} 張`} tone={toneOf(data.institutional.foreignNet)} />
              <Metric label="投信" value={`${formatSigned(data.institutional.trustNet)} 張`} tone={toneOf(data.institutional.trustNet)} />
              <Metric label="自營商" value={`${formatSigned(data.institutional.dealerNet)} 張`} tone={toneOf(data.institutional.dealerNet)} />
              <Metric label="合計" value={`${formatSigned(data.institutional.totalNet)} 張`} tone={toneOf(data.institutional.totalNet)} />
            </dl>
          ) : (
            <div className="mt-2">
              <NotIndexed label="三大法人未入庫" />
            </div>
          )}
        </div>
        <div className="mt-3 data-panel hud-panel glass rounded-2xl p-4">
          <h3 className="text-[13px] font-black text-muted">融資融券（最新交易日）</h3>
          {data.margin.date ? (
            <dl className="mt-2 grid grid-cols-2 gap-3 text-[13px]">
              <Metric label="融資餘額" value={`${formatInt(data.margin.marginLots)} 張`} />
              <Metric label="融券餘額" value={`${formatInt(data.margin.shortLots)} 張`} />
            </dl>
          ) : (
            <div className="mt-2">
              <NotIndexed label="融資融券未入庫" />
            </div>
          )}
        </div>
        <div className="mt-3 data-panel hud-panel glass rounded-2xl p-4">
          <h3 className="text-[13px] font-black text-muted">集保大戶級距</h3>
          {data.holders.bigPct !== null ? (
            <dl className="mt-2 grid grid-cols-2 gap-3 text-[13px]">
              <Metric label="1000 張以上佔比" value={`${formatFixed(data.holders.bigPct, 2)}%`} />
              <Metric
                label="集中度"
                value={data.holders.concentration !== null ? `${(data.holders.concentration * 100).toFixed(2)}%` : '--'}
              />
            </dl>
          ) : (
            <div className="mt-2">
              <NotIndexed label="集保級距未入庫" />
            </div>
          )}
        </div>
      </section>
    );
  }

  if (tab === 'fundamental') {
    return (
      <section className="mt-3" aria-label="基本面">
        <SectionHead title="基本面" />
        <div className="data-panel hud-panel glass rounded-2xl p-4">
          {data.valuation.per !== null || data.valuation.pbr !== null ? (
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <Metric label="本益比" value={formatFixed(data.valuation.per)} />
              <Metric label="淨值比" value={formatFixed(data.valuation.pbr)} />
              <Metric label="殖利率" value={`${formatFixed(data.valuation.yieldPct)}%`} />
              <Metric label="資料日" value={data.valuation.date ?? '--'} />
            </dl>
          ) : (
            <NotIndexed label="估值資料未入庫" />
          )}
          <div className="mt-4 border-t border-line/60 pt-3">
            <h3 className="text-[13px] font-black text-muted">月營收</h3>
            {data.revenue.revenueYi !== null ? (
              <p className="mt-1.5 text-[13.5px] font-bold text-ink">
                約 {formatFixed(data.revenue.revenueYi)} 億
                {data.revenue.yoyPct !== null ? `（年增 ${formatSignedPct(data.revenue.yoyPct, 1)}）` : ''}
                {data.revenue.asOfDate ? <span className="ml-2 text-[12px] text-muted">（{data.revenue.asOfDate}）</span> : null}
              </p>
            ) : (
              <div className="mt-1.5">
                <NotIndexed label="月營收未入庫" />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (tab === 'trend') {
    return (
      <section className="mt-3" aria-label="走勢">
        <SectionHead title="走勢" />
        <div className="data-panel hud-panel glass rounded-2xl p-4">
          {data.cum6dPct !== null ? (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Metric label="近 6 日累計" value={formatSignedPct(data.cum6dPct)} tone={toneOf(data.cum6dPct)} />
              <Metric label="樣本交易日" value={`${data.cum6dSamples} 日`} />
            </dl>
          ) : (
            <NotIndexed label="日 K 走勢未入庫" />
          )}
          <p className="mt-3 text-[11.5px] leading-snug text-muted">
            完整 K 線圖請至 <Link href={`/chart?ticker=${data.ticker}`} className="text-accent underline-offset-4 hover:underline">K 線圖檢視</Link>。
          </p>
        </div>
      </section>
    );
  }

  if (tab === 'risk') return <RiskTab data={data} />;
  if (tab === 'tech') return <TechTab data={data} />;
  if (tab === 'scenario') return <ScenarioTab data={data} />;

  // 分點：逐股券商分點買賣超為付費資料源，本站未接（誠實標示）
  return (
    <section className="mt-3" aria-label="分點">
      <SectionHead title="分點" />
      <NotIndexed label="資料未入庫" />
      <p className="mt-2 text-[12px] text-muted">逐股券商分點買賣超為付費資料源，本站未接。</p>
    </section>
  );
}

/** 風險色調 → Tailwind 類別（綠＝相對安全、金＝普通、紅＝要留意）。 */
function riskToneClass(tone: RiskTone): string {
  if (tone === 'safe') return 'text-down';
  if (tone === 'warn') return 'text-up';
  return 'text-accent';
}

/** 風險體檢單格。 */
function RiskCardView({ card }: { card: RiskCard }) {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-3.5">
      <p className="text-[12px] font-black text-muted">{card.title}</p>
      {card.available ? (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            {card.grade ? (
              <span className={`text-[15px] font-black ${riskToneClass(card.tone)}`}>{card.grade}</span>
            ) : null}
            {card.value ? (
              <span className={`num text-[15px] font-black ${riskToneClass(card.tone)}`}>{card.value}</span>
            ) : null}
          </div>
          {card.desc ? <p className="mt-1 text-[12px] leading-snug text-muted">{card.desc}</p> : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-[15px] font-black text-muted">資料未入庫</p>
          {card.desc ? <p className="mt-1 text-[12px] leading-snug text-muted">{card.desc}</p> : null}
        </>
      )}
    </div>
  );
}

/** 風險分頁（風險體檢 5 格 + 處置制度歷史資料）。 */
function RiskTab({ data }: { data: StockResearchData }) {
  const panel = data.risk;
  return (
    <section className="mt-3" aria-label="風險">
      <SectionHead title="風險體檢" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {panel.cards.map((card) => (
          <RiskCardView key={card.key} card={card} />
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">{panel.note}</p>

      {panel.history ? (
        <details className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3" open>
          <summary className="cursor-pointer text-[13px] font-black text-ink">處置制度歷史資料</summary>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            <Metric label="資料日" value={data.dataDate ?? '--'} />
            <Metric label="資料日收盤" value={panel.history.close ?? '--'} />
            <Metric
              label="近 6 日累積漲跌"
              value={panel.history.cum6d ?? '--'}
              tone={toneOf(data.cum6dPct)}
            />
            <Metric
              label="資料日成交量"
              value={panel.history.volume ? `${panel.history.volume} 張` : '--'}
            />
            <Metric
              label="近 20 日平均量"
              value={panel.history.avg20Volume ? `${panel.history.avg20Volume} 張` : '--'}
            />
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            資料日期與口徑：日 K（Fugle / Yahoo）、法人進出、融資券。級距沒入庫就留空。
          </p>
        </details>
      ) : null}
    </section>
  );
}

/** 技術分頁（技術分析解讀）。 */
function TechTab({ data }: { data: StockResearchData }) {
  const t = data.technical;
  if (!t.available) {
    return (
      <section className="mt-3" aria-label="技術">
        <SectionHead title="技術分析解讀" />
        <NotIndexed label="日 K 未入庫，無法計算技術指標" />
      </section>
    );
  }
  return (
    <section className="mt-3" aria-label="技術">
      <SectionHead title="技術分析解讀" />

      {/* 結論 */}
      <div className="data-panel hud-panel glass rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[15px] font-black ${riskToneClass(t.conclusionTone)}`}>{t.conclusion}</span>
          {t.dataDate ? <span className="text-[12px] text-muted">資料日 {t.dataDate}</span> : null}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t.intro}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t.atmosphere}</p>
      </div>

      {/* 價格行為結構 */}
      {t.structure ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[12px] font-black text-muted">價格行為結構</p>
          <p className="mt-1 text-[15px] font-black text-ink">{t.structure.title}</p>
          <p className="mt-1 text-[12px] text-muted">{t.structure.desc}</p>
        </div>
      ) : null}

      {/* 支撐與壓力 */}
      {t.support || t.resistance ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[12px] font-black text-muted">支撐與壓力</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {t.support ? (
              <div className="rounded-xl border border-line/70 bg-surface-2/50 px-3 py-2">
                <p className="text-[12px] text-muted">支撐（近期低點一帶）</p>
                <p className="num mt-0.5 text-[15px] font-black text-ink">{t.support.price}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  區間 {t.support.zone}・{t.support.tests}
                </p>
              </div>
            ) : null}
            {t.resistance ? (
              <div className="rounded-xl border border-line/70 bg-surface-2/50 px-3 py-2">
                <p className="text-[12px] text-muted">壓力（近期高點一帶）</p>
                <p className="num mt-0.5 text-[15px] font-black text-ink">{t.resistance.price}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  區間 {t.resistance.zone}・{t.resistance.tests}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            被測試次數越多、又都守住的區域，市場越把它當一回事；支撐壓力是「一帶」不是一個點。
          </p>
        </div>
      ) : null}

      {/* 最多人成交的價 */}
      {t.poc ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[12px] font-black text-muted">最多人成交的價</p>
          <p className="num mt-1 text-[15px] font-black text-ink">{t.poc}</p>
          <p className="mt-1 text-[12px] text-muted">這附近籌碼最厚，常有人守</p>
        </div>
      ) : null}

      {/* 回檔常見接手區（斐波那契） */}
      {t.fib.length > 0 ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[12px] font-black text-muted">回檔常見接手區</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {t.fib.map((f) => (
              <div key={f.level}>
                <dt className="text-[11px] font-bold text-muted">{f.level}</dt>
                <dd className="num mt-0.5 font-black text-ink">{f.price}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {/* 均線水位 */}
      <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
        <p className="text-[12px] font-black text-muted">均線水位</p>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {t.ma.map((row) => (
            <div key={row.period}>
              <dt className="text-[11px] font-bold text-muted">{row.label}</dt>
              <dd className="num mt-0.5 font-black text-ink">{row.value ?? '--'}</dd>
              <dd className="mt-0.5 text-[11px] text-muted">{row.note}</dd>
            </div>
          ))}
        </dl>
        {t.priceVsMa20 ? (
          <p className="mt-3 text-[12.5px] text-ink">
            比近月均線：<b className="text-accent">{t.priceVsMa20.label}</b>　{t.priceVsMa20.delta}
            <span className="ml-2 text-[11.5px] text-muted">{t.priceVsMa20.note}</span>
          </p>
        ) : null}
        {t.rangePos20 ? (
          <p className="mt-1 text-[12.5px] text-ink">
            近 20 日位置：<b className="text-accent">{t.rangePos20.label}</b>　{t.rangePos20.pct}
            <span className="ml-2 text-[11.5px] text-muted">{t.rangePos20.note}</span>
          </p>
        ) : null}
      </div>

      {/* 人氣、量能與通道 */}
      <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
        <p className="text-[12px] font-black text-muted">人氣、量能與通道</p>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {t.rsi ? <Metric label={`人氣（${t.rsi.label}）`} value={t.rsi.value} /> : null}
          {t.volumeRatio ? (
            <Metric label={`成交量（${t.volumeRatio.label}）`} value={t.volumeRatio.value} />
          ) : null}
          {t.dayRange ? (
            <Metric label="一天大概會晃" value={`${t.dayRange.pct}｜${t.dayRange.amount}`} />
          ) : null}
          {t.volPriceSync ? (
            <Metric label="量有沒有跟上價" value={t.volPriceSync.label} />
          ) : null}
          {t.boll ? <Metric label="通道上緣" value={t.boll.upper} /> : null}
          {t.boll ? <Metric label="通道中軸" value={t.boll.middle} /> : null}
          {t.boll ? <Metric label="通道下緣" value={t.boll.lower} /> : null}
          {t.kd ? <Metric label="短線溫度" value={t.kd.value} /> : null}
          {t.macd ? <Metric label="動能" value={t.macd.value} /> : null}
        </dl>
        {t.macd ? <p className="mt-2 text-[11.5px] text-muted">{t.macd.note}</p> : null}
      </div>

      {/* 融資維持率試算 */}
      {t.marginMaintenance ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[12px] font-black text-muted">融資維持率試算</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="若用收盤當成本" value={t.marginMaintenance.cost} />
            <Metric label="追繳距離" value={`−${t.marginMaintenance.dropPct}%`} />
          </div>
          <p className="mt-2 text-[12px] text-muted">{t.marginMaintenance.note}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            這是用資料日收盤當買進成本、單一部位的試算。實際維持率是整戶合併，還有利息與各券商規定，請以券商帳戶為準。
          </p>
        </div>
      ) : null}

      {/* 未入庫欄位（誠實標示） */}
      {t.notIndexed.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-3">
          <p className="text-[12px] font-bold text-muted">
            以下欄位本站尚無公開來源，誠實標示未入庫：
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {t.notIndexed.map((n) => (
              <li
                key={n}
                className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** 情境分頁（持有情境與風險）。 */
function ScenarioTab({ data }: { data: StockResearchData }) {
  const s = data.scenario;
  return (
    <section className="mt-3" aria-label="情境">
      <SectionHead title="持有情境與風險" />

      {/* 6 格 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {s.cards.map((card) => (
          <div key={card.key} className="data-panel hud-panel glass rounded-2xl p-3.5">
            <p className="text-[11px] font-black text-muted">{card.label}</p>
            {card.available ? (
              <>
                <p className="mt-1 text-[14px] font-black text-ink">{card.value}</p>
                {card.sub ? (
                  <p className="num mt-0.5 text-[12px] font-bold text-muted">{card.sub}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-[13px] font-black text-muted">資料未入庫</p>
            )}
          </div>
        ))}
      </div>

      {/* 條列說明 */}
      <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
        <ul className="grid gap-1.5 text-[13px] leading-relaxed">
          {s.bullets.map((b, i) => (
            <li key={`${b.text}-${i}`} className={b.available ? 'text-ink' : 'text-muted'}>
              {b.text}
            </li>
          ))}
        </ul>
      </div>

      {/* 同族群個股 */}
      {s.sectorPeers ? (
        <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
          <p className="text-[13px] font-black text-ink">
            同族群「{s.sectorPeers.name}」{s.sectorPeers.count} 檔
          </p>
          <ul className="mt-2 grid gap-1">
            {s.sectorPeers.peers.map((p) => (
              <li key={p.symbol} className="flex items-center justify-between text-[12.5px]">
                <span className="font-bold text-ink">
                  {p.symbol} {p.name}
                </span>
                <span className="num flex items-center gap-2">
                  <span className="font-bold text-ink">{p.price.toFixed(2)}</span>
                  <span className={p.changePct > 0 ? 'font-black text-up' : p.changePct < 0 ? 'font-black text-down' : 'font-black text-muted'}>
                    {p.changePct > 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* AI 白話解讀 */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent/45 bg-accent/10 px-4 text-[13px] font-black text-accent transition active:scale-[0.97]"
        >
          {s.ai.label}
        </button>
        <span className="text-[12px] text-muted">{s.ai.quotaNote}</span>
      </div>

      {/* 依據／期間／樣本 */}
      <details className="mt-3 rounded-2xl border border-line/70 bg-surface px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-black text-muted">
          依據／期間／樣本（點開）
        </summary>
        <dl className="mt-2 grid gap-1 text-[12px] leading-relaxed">
          <div>
            <dt className="inline font-black text-ink">依據：</dt>
            <dd className="inline text-muted">日 K、法人進出、融資券、集保級距</dd>
          </div>
          <div>
            <dt className="inline font-black text-ink">期間：</dt>
            <dd className="inline text-muted">資料日 {s.dataDate ?? '未入庫'}</dd>
          </div>
          <div>
            <dt className="inline font-black text-ink">樣本：</dt>
            <dd className="inline text-muted">依本頁已載入欄位；缺欄位時對應列標示未入庫</dd>
          </div>
        </dl>
      </details>

      {s.dataDate ? <p className="mt-3 text-[12px] text-muted">資料日 {s.dataDate}</p> : null}
    </section>
  );
}

/** 單一數據格。 */
function Metric({ label, value, tone = 'flat' }: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }) {
  const toneClass = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink';
  return (
    <div>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd className={`num mt-0.5 font-black ${toneClass}`}>{value}</dd>
    </div>
  );
}

// ── 總覽分頁 ────────────────────────────────────────────

function OverviewTab({
  data,
  summary,
}: {
  data: StockResearchData;
  summary: ReturnType<typeof buildResearchSummary>;
}) {
  return (
    <>
      {/* 研究熱度（本站無公開評分來源 → 未入庫） */}
      <div className="mt-3">
        <div className="data-panel hud-panel glass rounded-2xl border-l-2 border-l-accent p-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0 text-center">
              <div className="num text-4xl font-black leading-none text-muted">--</div>
              <div className="mt-1 text-[10.5px] font-bold text-muted">/100</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-black text-ink">研究熱度</p>
                <span className="inline-block rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-black leading-none text-muted">
                  資料未入庫
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">
                研究熱度為博主自建評分，本站尚無對應公開來源 · 盤後{data.dataDate ? ` ${data.dataDate}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-black text-muted transition hover:border-accent hover:text-accent"
          >
            查看評分依據
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
              <path d="M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 產業定位（本站無產業分類來源 → 未入庫） */}
      <div className="mt-3">
        <section id="industry" className="scroll-mt-20">
          <h2 className="stock-section-title">📍 產業定位</h2>
          <div className="rounded-xl border border-line bg-surface p-6">
            <NotIndexed label="產業定位未入庫" />
            <div className="mt-4 rounded-lg border border-line/50 bg-surface/50 px-3 py-2">
              <p className="text-xs text-muted">💡 點擊產業可看成分股熱力圖，並連動族群熱圖官方分類</p>
            </div>
          </div>
        </section>
      </div>

      {/* 戰情榜名次 */}
      <section className="mt-3 overflow-x-clip" aria-label="戰情榜名次">
        <div className="flex flex-wrap gap-2">
          {data.turnover.amountYi !== null ? (
            <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-[12px] font-black text-ink">
              成交額今日{data.turnover.rank !== null ? `第 ${data.turnover.rank}　` : ' '}
              {formatFixed(data.turnover.amountYi, 1)} 億
            </span>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-full border border-dashed border-line bg-surface px-3 text-[12px] font-black text-muted">
              成交額排行未入庫
            </span>
          )}
        </div>
      </section>

      {/* 分點量價條件（未入庫） */}
      <div className="data-panel hud-panel glass rounded-2xl mt-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-muted">分點量價條件</span>
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-black text-muted">資料未入庫</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          依資料日分點買賣超做數值分類，可到分點排行核對；分類不推論交易人意圖或後續方向。
        </p>
        <p className="mt-2 text-[12px] text-muted">
          看不懂「集中度、當沖比、分點」？
          <Link href="/school/#concentration" className="text-accent underline-offset-4 hover:underline">
            查名詞小學堂
          </Link>
        </p>
      </div>

      {/* 研究摘要 */}
      <SectionHead title="研究摘要" />
      <div className="data-panel hud-panel glass rounded-2xl p-5">
        <ul className="grid gap-2 text-[13.5px] leading-relaxed">
          {summary.map((line) => (
            <li key={line.label}>
              <b className="text-accent">{line.label}：</b>
              <span className={line.available ? 'text-ink' : 'text-muted'}>{line.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl bg-surface-2 px-3 py-3">
          <p className="text-sm font-black">證據檢查清單</p>
          <ul className="mt-2 grid gap-1.5 text-[12.5px]">
            <Evidence ok text="資料日期／籌碼統計日" />
            <Evidence ok text="籌碼來源（法人／分點／主力型態）" />
            <Evidence text="有作廢條件／情境分岔" />
            <Evidence ok text="近期新聞" />
            <Evidence ok text="處置／注意股狀態" />
          </ul>
        </div>
        <details className="mt-2.5 rounded-xl border border-line bg-surface-2/80 text-[11.5px] leading-relaxed md:mt-3 md:text-[12px]">
          <summary className="cursor-pointer select-none px-3 py-2 font-black text-muted">依據／期間／樣本（點開）</summary>
          <dl className="grid gap-1 border-t border-line px-3 py-2.5">
            <div>
              <dt className="inline font-black text-ink">依據：</dt>
              <dd className="inline text-muted">法人進出、融資券、集保級距、估值、月營收、日 K</dd>
            </div>
            <div>
              <dt className="inline font-black text-ink">期間：</dt>
              <dd className="inline text-muted">資料日 {data.dataDate ?? '未入庫'}</dd>
            </div>
            <div>
              <dt className="inline font-black text-ink">樣本：</dt>
              <dd className="inline text-muted">依本頁已載入欄位；缺欄位時對應列標示未入庫</dd>
            </div>
            <div>
              <dt className="inline font-black text-ink">更新：</dt>
              <dd className="inline text-muted">{data.dataDate ?? '未入庫'}</dd>
            </div>
            <div>
              <dt className="inline font-black text-ink">失效：</dt>
              <dd className="inline text-muted">資料日過期、法人與日線日期不一致、或把摘要當成買賣指令</dd>
            </div>
          </dl>
        </details>
      </div>

      {/* 個股新聞（本站無新聞來源 → 未入庫） */}
      <SectionHead title="個股新聞" />
      <div className="data-panel hud-panel glass rounded-2xl p-4">
        <NotIndexed label="個股新聞未入庫" />
      </div>

      {/* 資料日期與口徑 */}
      <details className="mt-6 rounded-2xl border border-line/70 bg-surface px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-black text-muted">資料日期與口徑</summary>
        <div className="mt-2 space-y-1 text-[12px] leading-relaxed text-muted">
          {data.sources.map((s) => (
            <p key={s}>來源：{s}</p>
          ))}
          <p>時點：盤中為即時快照、法人／資券／集保為盤後　資料日 {data.dataDate ?? '未入庫'}</p>
          <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
          <p>報價為盤中快照；法人／資券／集保為盤後。級距沒入庫就留空。</p>
          <p>以上是已發生的公開統計，不是進出建議。</p>
        </div>
      </details>
    </>
  );
}

/** 證據檢查清單項目。 */
function Evidence({ ok = false, text }: { ok?: boolean; text: string }) {
  return (
    <li className="flex gap-2">
      <span className={ok ? 'font-bold text-up' : 'text-muted'} aria-hidden="true">
        {ok ? '✓' : '○'}
      </span>
      <span className={ok ? '' : 'text-muted'}>{text}</span>
    </li>
  );
}

// ── 對外頁面（useSearchParams 需 Suspense） ─────────────

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockPageInner />
    </Suspense>
  );
}
