'use client';

/**
 * /risk 注意與處置 —— 真實資料區塊（Client Component）
 * ----------------------------------------------------------------------------
 * 向本站代理 `GET /api/skynet/risk` 取真實資料（TWSE punish + TPEx disposal 自產）。
 * 上游失敗 → 誠實錯誤狀態（不顯示假資料）。
 *
 * 文案保真（重要，勿混淆兩種語意）：
 *   - 「注意股」＝**本站刻意不列示**（實站 attention_available:false，永久狀態）。
 *     一律顯示實站原文 `attention_note`（「本站暫不列示」），**不是**「資料尚未入庫」
 *     ——後者語意會變成「之後會列」，與實站不符。故此區塊在載入中／錯誤時也照顯示。
 *   - 「處置預警／處置中／處置候選」＝**真的會載入資料**，載入中顯示「資料尚未入庫」
 *     骨架是正確的。
 *
 * 版面文字與骨架樣式沿用原逐字複刻頁（risk.html）。
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

interface RiskData {
  date: string;
  data_scope: string;
  next_update: string;
  disposition: DispositionItem[];
  disposition_upcoming: DispositionItem[];
  disposition_candidates: unknown[];
  margin_suspension: unknown[];
  daytrade_suspension: unknown[];
  suspended: unknown[];
  day_trading: unknown[];
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

  return (
    <>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        資料日 <b className="text-ink">{dataDate}</b>
        {state.status === 'ready' && <span className="ml-2">下次更新 {state.data.next_update}</span>}
      </p>

      {/* 注意股＝本站刻意不列示（永久狀態），永遠顯示實站原文，非載入中骨架。 */}
      <SectionHeading>注意</SectionHeading>
      <div className="data-panel hud-panel glass rounded-2xl p-5">
        <p className="text-[13.5px] leading-relaxed text-ink">{attentionNote}</p>
        <p className="mt-2 text-[12.5px] text-muted">下方提供處置預警／即將分盤與處置中名單。</p>
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
          <EmptyState title="目前沒有資料" desc="暫時無法取得處置名單。" />
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

      {state.status === 'ready' && (
        <>
          <SectionHeading>處置預警／即將</SectionHeading>
          {state.data.disposition_upcoming.length > 0 ? (
            <DispositionList items={state.data.disposition_upcoming} />
          ) : (
            <EmptyState title="目前沒有資料" desc="此資料日沒有即將分盤列。" />
          )}

          <SectionHeading>處置中</SectionHeading>
          {state.data.disposition.length > 0 ? (
            <DispositionList items={state.data.disposition} />
          ) : (
            <HonestEmpty note="此資料日交易所未公布處置名單；名單依交易所盤後公告更新。" />
          )}

          <SectionHeading>處置候選</SectionHeading>
          {state.data.disposition_candidates.length > 0 ? (
            <SkeletonGrid label="處置候選名單" cards={6} />
          ) : (
            <HonestEmpty note="處置候選需依「注意交易資訊」累計判定，本站暫不自算，故不列示。" />
          )}
        </>
      )}

      {/* 其餘子清單：上游查無來源，永遠誠實留空（不以 0 代替）。 */}
      <SectionHeading>融券回補期間</SectionHeading>
      <HonestEmpty note="融券回補期間（暫停融資融券）查無免費公開端點，本站誠實留空；請以交易所公告為準。" />

      <SectionHeading>暫停先賣後買</SectionHeading>
      <HonestEmpty note="暫停先賣後買（暫停當日沖銷）查無免費公開端點，本站誠實留空；請以交易所公告為準。" />

      <SectionHeading>暫停交易</SectionHeading>
      <EmptyState title="目前沒有資料" desc="資料日沒有暫停交易列。" />

      <SectionHeading>當日沖銷成交量值</SectionHeading>
      <HonestEmpty note="當日沖銷成交量值查無免費公開端點，本站誠實留空；為盤後公開統計。" />

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

/** 處置名單：真實資料卡片。 */
function DispositionList({ items }: { items: DispositionItem[] }): ReactElement {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-0">
      <div className="grid gap-2 p-4 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.stock_id}
            className="rounded-xl border border-line/70 bg-surface p-3 transition"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-ink">{item.label}</span>
              {item.end_date && (
                <span className="num shrink-0 text-[11px] text-muted">迄 {item.end_date}</span>
              )}
            </div>
            {item.reason && (
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{item.reason}</p>
            )}
            {item.period && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">期間 {item.period}</p>
            )}
          </div>
        ))}
      </div>
      <p className="px-4 pb-4 text-[12px] leading-relaxed text-muted">
        共 <b className="num text-ink">{items.length}</b> 檔；名單依交易所盤後公告更新。
      </p>
    </div>
  );
}
