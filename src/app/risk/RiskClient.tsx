'use client';

/**
 * /risk 注意與處置 —— 真實資料區塊（Client Component）
 * ----------------------------------------------------------------------------
 * 向本站代理 `GET /api/skynet/risk` 取真實資料（TWSE punish + TPEx disposal 自產）。
 * 上游失敗 → 誠實錯誤狀態（不顯示假資料）。
 *
 * 卡片結構逐字對齊 risk.html（勿任意更動 className）：
 *   - 處置中／即將：`rounded-2xl p-5  border-l-2 border-l-up` ＋ `<a href="/stock/?id=…">`
 *     ＋ `grid grid-cols-2 sm:grid-cols-3` 三格（處置原因／目前分盤／處置期間）。
 *   - 處置候選：`border-l-2 border-l-amber-400` ＋ 右上 `num font-black text-up` 六日漲幅。
 *   - 融券回補期間／暫停先賣後買：`<ul class="grid md:grid-cols-2">` 的 `<li>` 列。
 *   - 當日沖銷成交量值：`<ul>` 的 `flex justify-between … last:border-0` 列。
 *   - 標題列帶檔數 `（n）`（實站連 0 也顯示）。
 *
 * 文案保真（重要，勿混淆兩種語意）：
 *   - 「注意股」＝**本站刻意不列示**（實站 attention_available:false，永久狀態）。
 *     一律顯示實站原文 `attention_note`，**不是**「資料尚未入庫」。
 *   - 「處置預警／處置中／處置候選」＝**真的會載入資料**，載入中顯示「資料尚未入庫」骨架正確。
 */

import { useEffect, useState, type ReactElement } from 'react';
import DataCaveatDetails from '@/components/DataCaveatDetails';

/** 實站注意股永久性文案（來源：capture body.attention_note，逐字）。 */
const ATTENTION_NOTE = '注意股名單本站暫不列示，請以交易所最新公告為準。';

interface DispositionItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
  interval: string;
  end_date: string;
}

interface CandidateItem {
  stock_id: string;
  stock_name: string;
  label: string;
  ret_6d_pct: number;
  close: number;
}

interface SuspensionItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
}

interface DayTradingItem {
  stock_id: string;
  stock_name: string;
  label: string;
  volume: number;
  buy_after_sale_blocked: boolean;
}

interface RiskData {
  date: string;
  data_scope: string;
  next_update: string;
  disposition: DispositionItem[];
  disposition_upcoming: DispositionItem[];
  disposition_candidates: CandidateItem[];
  margin_suspension: SuspensionItem[];
  daytrade_suspension: SuspensionItem[];
  suspended: SuspensionItem[];
  day_trading: DayTradingItem[];
  attention: unknown[];
  attention_available: boolean;
  attention_note: string;
  gaps: string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: RiskData };

function SectionHeading({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{children}</h2>
        </div>
      </div>
    </div>
  );
}

/** 空狀態（逐字照抄 risk.html：Phosphor Database 圖示 + 標題 + 說明）。 */
function EmptyState({ title, desc }: { title: string; desc: string }): ReactElement {
  return (
    <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
      <div className="max-w-md">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          fill="currentColor"
          viewBox="0 0 256 256"
          className="mx-auto text-muted"
          aria-hidden="true"
        >
          <path
            d="M216,80c0,26.51-39.4,48-88,48S40,106.51,40,80s39.4-48,88-48S216,53.49,216,80Z"
            opacity="0.2"
          />
          <path d="M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z" />
        </svg>
        <p className="mt-3 font-black text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{desc}</p>
      </div>
    </div>
  );
}

/** 誠實載入骨架（role=status + sr-only 提示 + pulse 卡片）。 */
function SkeletonGrid({ label, cards }: { label: string; cards: number }): ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="status" aria-live="polite">
      <span className="sr-only">正在整理{label}…</span>
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="data-panel hud-panel glass rounded-2xl p-5  animate-pulse"
        >
          <div className="h-5 w-32 rounded-lg bg-surface-2" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-14 rounded-xl bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 text-[12.5px] leading-relaxed text-muted md:col-span-2">
        {label}
        <b className="text-ink">資料尚未入庫</b>
        ；處置與暫停名單依交易所盤後公告更新，本站待入庫後即時呈現，不預先寫死截圖數字。
      </p>
    </div>
  );
}

/** 誠實空清單（有上游但該日無資料／無來源）。 */
function HonestEmpty({ note }: { note: string }): ReactElement {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5">
      <p className="text-[12.5px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

/** 處置卡片（處置中／即將）—— 逐字對齊 risk.html。 */
function DispositionCards({ items }: { items: DispositionItem[] }): ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.stock_id}
          className="data-panel hud-panel glass rounded-2xl p-5  border-l-2 border-l-up"
        >
          <a href={`/stock/?id=${item.stock_id}`} className="block">
            <p className="text-lg font-black text-accent">{item.label}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
              <div className="rounded-xl bg-surface-2 px-2 py-2">
                <div className="text-xs text-muted">處置原因</div>
                <div className="text-sm font-bold">{item.reason}</div>
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-2">
                <div className="text-xs text-muted">目前分盤</div>
                {/* 交易所處置措施一律含人工管制撮合（分盤撮合），實站亦固定顯示此值。 */}
                <div className="text-sm font-black text-up">{item.interval || '分盤撮合'}</div>
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-2 sm:col-span-1 col-span-2">
                <div className="text-xs text-muted">處置期間</div>
                <div className="num text-sm font-bold">{item.period}</div>
              </div>
            </div>
          </a>
        </div>
      ))}
    </div>
  );
}

/** 處置候選卡片 —— 逐字對齊 risk.html。 */
function CandidateCards({ items }: { items: CandidateItem[] }): ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.stock_id}
          className="data-panel hud-panel glass rounded-2xl p-5  border-l-2 border-l-amber-400"
        >
          <a href={`/stock/?id=${item.stock_id}`} className="block">
            <div className="flex items-center justify-between">
              <p className="text-lg font-black text-accent">{item.label}</p>
              <span className="num font-black text-up">6日 +{item.ret_6d_pct}%</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              收 <b className="num text-ink">{item.close}</b>｜ 漲速已達注意等級，若再強勢恐進處置（分盤交易）。
            </p>
          </a>
        </div>
      ))}
    </div>
  );
}

/** 融券回補期間／暫停先賣後買 —— `<ul>` 兩欄列，逐字對齊 risk.html。 */
function SuspensionList({ items }: { items: SuspensionItem[] }): ReactElement {
  return (
    <div className="data-panel hud-panel glass rounded-2xl   p-0">
      <ul className="grid md:grid-cols-2">
        {items.map((item) => (
          <li key={item.stock_id} className="border-b border-line/60 px-4 py-3">
            <a
              href={`/stock/?id=${item.stock_id}`}
              className="font-bold text-accent underline-offset-4 hover:underline"
            >
              {item.label}
            </a>
            <span className="ml-2 text-[12px] text-muted">
              {item.reason}（{item.period}）
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 當日沖銷成交量值 —— `<ul>` 左右列，逐字對齊 risk.html。 */
function DayTradingList({ items }: { items: DayTradingItem[] }): ReactElement {
  return (
    <div className="data-panel hud-panel glass rounded-2xl   p-0">
      <ul>
        {items.map((item) => (
          <li
            key={item.stock_id}
            className="flex justify-between gap-3 border-b border-line/60 px-4 py-2 last:border-0"
          >
            <a href={`/stock/?id=${item.stock_id}`} className="font-bold text-accent">
              {item.label}
            </a>
            <span className="num text-sm">{item.volume.toLocaleString('zh-Hant')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RiskClient(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/risk', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad status'))))
      .then((body) => {
        if (cancelled) return;
        if (body?.ok === true) {
          setState({ status: 'ready', data: body as RiskData });
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

  // 注意股文案：優先取 API 的實站原文，載入中／錯誤時仍顯示同一句永久性文案。
  const attentionNote = state.status === 'ready' ? state.data.attention_note : ATTENTION_NOTE;
  const dataDate =
    state.status === 'ready' ? state.data.date : state.status === 'loading' ? '載入中…' : '尚未入庫';
  const d = state.status === 'ready' ? state.data : null;

  return (
    <>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        資料日 <b className="text-ink">{dataDate}</b>
      </p>

      {/* 注意股＝本站刻意不列示（永久狀態），永遠顯示實站原文，非載入中骨架。 */}
      <SectionHeading>注意</SectionHeading>
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <p className="text-[13.5px] leading-relaxed text-ink">{attentionNote}</p>
        <p className="mt-2 text-[12.5px] text-muted">
          下方提供處置預警／即將分盤與處置中名單{d ? `，資料日 ${d.date}` : ''}。
        </p>
      </div>

      {state.status === 'loading' && (
        <>
          <SectionHeading>處置預警／即將</SectionHeading>
          <SkeletonGrid label="處置預警名單" cards={2} />
          <SectionHeading>處置中</SectionHeading>
          <SkeletonGrid label="處置中名單" cards={6} />
          <SectionHeading>處置候選</SectionHeading>
          <SkeletonGrid label="處置候選名單" cards={6} />
        </>
      )}

      {state.status === 'error' && (
        <>
          <SectionHeading>處置預警／即將</SectionHeading>
          <EmptyState title="目前沒有資料" desc="此資料日沒有即將分盤列。" />
          <SectionHeading>處置中</SectionHeading>
          <div className="data-panel hud-panel glass rounded-2xl p-5" role="status">
            <p className="text-[13.5px] leading-relaxed text-ink">
              處置名單暫時無法取得（交易所上游無回應）。
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              本站不顯示推測數字，請稍後重試或以交易所公告為準。
            </p>
          </div>
        </>
      )}

      {d && (
        <>
          <SectionHeading>處置預警／即將（{d.disposition_upcoming.length}）</SectionHeading>
          {d.disposition_upcoming.length > 0 ? (
            <DispositionCards items={d.disposition_upcoming} />
          ) : (
            <EmptyState title="目前沒有資料" desc="此資料日沒有即將分盤列。" />
          )}

          <SectionHeading>處置中（{d.disposition.length}）</SectionHeading>
          {d.disposition.length > 0 ? (
            <DispositionCards items={d.disposition} />
          ) : (
            <HonestEmpty note="此資料日交易所未公布處置名單；名單依交易所盤後公告更新。" />
          )}

          <SectionHeading>處置候選（{d.disposition_candidates.length}）</SectionHeading>
          {d.disposition_candidates.length > 0 ? (
            <CandidateCards items={d.disposition_candidates} />
          ) : (
            <HonestEmpty note="處置候選需依「注意交易資訊」累計判定，本站暫不自算，故不列示。" />
          )}

          <SectionHeading>融券回補期間（{d.margin_suspension.length}）</SectionHeading>
          {d.margin_suspension.length > 0 ? (
            <SuspensionList items={d.margin_suspension} />
          ) : (
            <HonestEmpty note="融券回補期間（暫停融資融券）查無免費公開端點，本站誠實留空；請以交易所公告為準。" />
          )}

          <SectionHeading>暫停先賣後買（{d.daytrade_suspension.length}）</SectionHeading>
          {d.daytrade_suspension.length > 0 ? (
            <SuspensionList items={d.daytrade_suspension} />
          ) : (
            <HonestEmpty note="暫停先賣後買（暫停當日沖銷）查無免費公開端點，本站誠實留空；請以交易所公告為準。" />
          )}

          <SectionHeading>暫停交易（{d.suspended.length}）</SectionHeading>
          {d.suspended.length > 0 ? (
            <SuspensionList items={d.suspended} />
          ) : (
            <EmptyState title="目前沒有資料" desc="資料日沒有暫停交易列。" />
          )}

          <SectionHeading>當日沖銷成交量值（{d.day_trading.length}）</SectionHeading>
          {d.day_trading.length > 0 ? (
            <DayTradingList items={d.day_trading} />
          ) : (
            <HonestEmpty note="當日沖銷成交量值查無免費公開端點，本站誠實留空；為盤後公開統計。" />
          )}
        </>
      )}

      <DataCaveatDetails>
        <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
        <p>時點：盤中為即時快照、法人／分點／資券為盤後</p>
        <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
        <p>處置與暫停名單依交易所盤後公告更新。</p>
        <p>以上是已發生的公開統計，不是進出建議。</p>
      </DataCaveatDetails>
    </>
  );
}
