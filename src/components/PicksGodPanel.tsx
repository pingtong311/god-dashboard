'use client';

/**
 * PicksGodPanel —— /picks（量價觀察）專用 GOD 辦公室面板。
 * ----------------------------------------------------------------------------
 * 消費 GET /api/skynet/god/sector-sniper，忠實呈現「產業龍頭／弱勢同業」對比
 * 與 BlackScore 狙擊評分。
 *
 * 與 GodPanel 共用的最高原則 —— 資料誠實：
 *   - ready:false → 誠實顯示「GOD 辦公室資料尚未產出」，絕不顯示 0 或假數據。
 *   - sector-sniper 信封內 provenance.internal_status 可能為 "DATA_INVALID"，
 *     這是 GOD 辦公室的誠實標示，必須顯眼呈現，不可隱藏或淡化。
 *   - 所有欄位層層守衛（Array.isArray / optional chaining / null → 「—」）。
 *
 * Client component：需在瀏覽器 fetch，mount 後（useEffect）才抓資料。
 */

import { useEffect, useId, useState, type ReactElement } from 'react';

/* -------------------------------------------------------------------------- */
/* 型別（依 sector-sniper.json 實際結構，防禦性寬鬆定義）                       */
/* -------------------------------------------------------------------------- */

type SniperStock = {
  stock_id?: string;
  label?: string;
  official_industry?: string;
  close?: number | null;
  change_pct?: number | null;
  volume_lots?: number | null;
  low_liquidity?: boolean;
  turnover_yi?: number | null;
};

type SniperItem = {
  industry?: string;
  leader?: SniperStock | null;
  weak_peers?: SniperStock[] | null;
  as_of?: string;
  data_scope?: string;
  read?: string;
};

type BlackScoreComponent = {
  name?: string;
  weight?: number;
  score?: number;
  reason?: string;
};

type BlackScore = {
  score?: number;
  max?: number;
  honest_gap?: boolean;
  gap_note?: string;
  ready_components?: BlackScoreComponent[] | null;
  missing_components?: BlackScoreComponent[] | null;
};

type SniperProvenance = {
  source?: string;
  as_of?: string;
  produced_by?: string;
  internal_status?: string;
};

type SniperPayload = {
  note?: string;
  scope?: string;
  items?: SniperItem[] | null;
  black_score?: BlackScore | null;
};

type SniperEnvelope = {
  ok?: boolean;
  ready?: boolean;
  endpoint?: string;
  message?: string;
  generated_at?: string;
  provenance?: unknown;
  payload?: unknown;
  stale?: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'notReady' }
  | { status: 'ready'; envelope: SniperEnvelope }
  | { status: 'error' };

/* -------------------------------------------------------------------------- */
/* 防禦性工具                                                                 */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatSignedPct(value: number | null | undefined): { text: string; tone: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { text: '—', tone: 'text-muted' };
  return {
    text: `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
    tone: value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-muted',
  };
}

function num(value: number | null | undefined, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('zh-TW')}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* 子元件                                                                     */
/* -------------------------------------------------------------------------- */

function StockLine({ stock, weak = false }: { stock: SniperStock; weak?: boolean }): ReactElement {
  const pct = formatSignedPct(stock.change_pct);
  return (
    <div className={weak ? 'opacity-75' : ''}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-black text-ink">
          {stock.label ?? '—'}
          {stock.stock_id ? (
            <span className="ml-1 text-[11px] font-normal text-muted">{stock.stock_id}</span>
          ) : null}
          {stock.low_liquidity ? (
            <span className="ml-1 rounded bg-line/40 px-1 text-[10px] font-bold text-muted">低流動性</span>
          ) : null}
        </span>
        <span className={`num text-[13px] font-black ${pct.tone}`}>{pct.text}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted">
        <span>收 {num(stock.close)}</span>
        <span>量 {num(stock.volume_lots, ' 張')}</span>
        <span>成交 {num(stock.turnover_yi, ' 億')}</span>
      </div>
    </div>
  );
}

function IndustryGroup({ item }: { item: SniperItem }): ReactElement {
  const leader = item.leader && isRecord(item.leader) ? (item.leader as unknown as SniperStock) : null;
  const weakPeers = Array.isArray(item.weak_peers) ? (item.weak_peers as SniperStock[]) : [];
  return (
    <section className="rounded-xl border border-line/70 bg-surface/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-black text-ink">{item.industry ?? '未命名產業'}</h4>
        {item.as_of ? <span className="text-[11px] text-muted">資料日 {item.as_of}</span> : null}
      </div>

      {leader ? (
        <div className="mb-2 rounded-lg bg-accent/10 p-2">
          <p className="mb-0.5 text-[11px] font-bold text-accent">產業龍頭</p>
          <StockLine stock={leader} />
        </div>
      ) : (
        <p className="mb-2 text-[12px] text-muted">產業龍頭：—（GOD 辦公室未提供）</p>
      )}

      <p className="mb-1 text-[11px] font-bold text-muted">弱勢同業</p>
      {weakPeers.length > 0 ? (
        <div className="space-y-1.5">
          {weakPeers.map((peer, i) => (
            <StockLine key={i} stock={peer} weak />
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted">—（尚無資料）</p>
      )}

      {item.read ? <p className="mt-2 text-[11px] leading-relaxed text-muted">{item.read}</p> : null}
    </section>
  );
}

function BlackScoreBlock({ score }: { score: BlackScore }): ReactElement {
  const scoreText = typeof score.score === 'number' ? score.score : null;
  const maxText = typeof score.max === 'number' ? score.max : null;
  const ready = Array.isArray(score.ready_components) ? score.ready_components : [];
  const missing = Array.isArray(score.missing_components) ? score.missing_components : [];

  return (
    <section className="rounded-xl border border-line/70 bg-surface/60 p-3">
      <h4 className="text-[13px] font-black text-ink">BlackScore 狙擊評分</h4>
      <p className="mt-1 num text-[20px] font-black text-accent">
        {scoreText !== null ? scoreText : '—'}
        <span className="text-[13px] font-normal text-muted">
          {maxText !== null ? ` / ${maxText}` : ''}
        </span>
      </p>

      {score.honest_gap ? (
        <p className="mt-1 rounded-md bg-line/30 px-2 py-1 text-[11.5px] leading-relaxed text-muted">
          ⚠ 誠實缺口：{score.gap_note ?? '資料不完整，評分僅供參考，不代表買賣建議。'}
        </p>
      ) : null}

      {ready.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11.5px] font-bold text-ink">已具備成分</p>
          <ul className="mt-0.5 space-y-0.5 text-[11.5px] text-muted">
            {ready.map((c, i) => (
              <li key={i}>
                {c.name ?? '—'}
                {typeof c.weight === 'number' ? `（權重 ${c.weight}）` : ''}
                {typeof c.score === 'number' ? `：${c.score}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11.5px] font-bold text-ink">尚缺成分（誠實標示）</p>
          <ul className="mt-0.5 space-y-0.5 text-[11.5px] text-muted">
            {missing.map((c, i) => (
              <li key={i}>
                {c.name ?? '—'}
                {typeof c.weight === 'number' ? `（權重 ${c.weight}）` : ''}
                {c.reason ? `：${c.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 主元件                                                                     */
/* -------------------------------------------------------------------------- */

export default function PicksGodPanel(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const load = async (): Promise<void> => {
      if (typeof fetch !== 'function') {
        if (!cancelled) setState({ status: 'error' });
        return;
      }
      try {
        const res = await fetch('/api/skynet/god/sector-sniper');
        const body = (await res.json()) as SniperEnvelope | null;
        if (cancelled) return;
        if (res.ok === false || !body || body.ok !== true) {
          setState({ status: 'error' });
          return;
        }
        if (body.ready === false) {
          setState({ status: 'notReady' });
          return;
        }
        setState({ status: 'ready', envelope: body });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby={headingId} className="data-panel hud-panel glass mt-4 rounded-2xl p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-1.5 text-[14px] font-black text-ink">
          <span aria-hidden="true" className="text-accent">
            ◆
          </span>
          量價觀察 · GOD 辦公室
        </h2>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
          sector-sniper
        </span>
      </div>

      {state.status === 'loading' ? (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">正在讀取 GOD 辦公室資料…</span>
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" aria-hidden="true" />
          <div className="h-20 w-full animate-pulse rounded bg-surface-2" aria-hidden="true" />
          <div className="h-16 w-2/3 animate-pulse rounded bg-surface-2" aria-hidden="true" />
        </div>
      ) : state.status === 'notReady' ? (
        <div role="status" aria-live="polite">
          <p className="text-[14px] font-bold text-ink">GOD 辦公室資料尚未產出</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            GOD 辦公室在交易日收盤後產出，請稍後再查看。
          </p>
        </div>
      ) : state.status === 'error' ? (
        <div role="status" aria-live="polite">
          <p className="text-[13px] font-bold text-ink">GOD 辦公室資料暫時無法取得</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            可能是網路或服務暫時異常，請稍後重試。
          </p>
        </div>
      ) : (
        <ReadyView envelope={state.envelope} />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Ready 視圖                                                                 */
/* -------------------------------------------------------------------------- */

function ReadyView({ envelope }: { envelope: SniperEnvelope }): ReactElement {
  const provenance = isRecord(envelope.provenance) ? (envelope.provenance as SniperProvenance) : null;
  const payload = isRecord(envelope.payload) ? (envelope.payload as SniperPayload) : null;
  const items = payload && Array.isArray(payload.items) ? (payload.items as SniperItem[]) : [];
  const blackScore = payload && isRecord(payload.black_score) ? (payload.black_score as BlackScore) : null;

  const isInvalid = provenance?.internal_status === 'DATA_INVALID';

  return (
    <div role="status" aria-live="polite" className="space-y-3">
      {/* 誠實來源標示（含 internal_status 顯眼提示） */}
      <div className="rounded-lg border border-line/70 bg-surface/60 p-2.5">
        <p className="text-[11.5px] leading-relaxed text-muted">
          資料來源：GOD 辦公室（sector-sniper）
          {provenance?.source ? ` · ${provenance.source}` : ''}
          {provenance?.as_of ? ` · 資料日 ${provenance.as_of}` : ''}
          {provenance?.produced_by ? ` · ${provenance.produced_by}` : ''}
        </p>
        {isInvalid ? (
          <p className="mt-1 rounded-md bg-line/40 px-2 py-1 text-[11.5px] font-bold leading-relaxed text-ink">
            ⚠ 資料完整性：未驗證（DATA_INVALID）— GOD 辦公室回報此批資料不完整，僅供參考，不代表買賣建議。
          </p>
        ) : null}
      </div>

      {/* BlackScore 評分（若有） */}
      {blackScore ? <BlackScoreBlock score={blackScore} /> : null}

      {/* 產業龍頭／弱勢同業 */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <IndustryGroup key={i} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-muted">GOD 辦公室尚未提供產業對比清單。</p>
      )}

      {/* payload.note */}
      {payload?.note ? (
        <p className="text-[11.5px] leading-relaxed text-muted">{payload.note}</p>
      ) : null}

      {/* 產出時間 + stale */}
      <p className="border-t border-line/60 pt-2 text-[11.5px] leading-relaxed text-muted">
        產出時間{' '}
        {typeof envelope.generated_at === 'string' && envelope.generated_at !== ''
          ? envelope.generated_at
          : '未提供'}
        {envelope.stale === true ? '（資料已超過 6 小時）' : ''}
      </p>
    </div>
  );
}
