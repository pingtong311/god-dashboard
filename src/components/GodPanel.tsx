'use client';

/**
 * GodPanel —— GOD 辦公室（華爾街峰子）分析資料共用面板。
 * ----------------------------------------------------------------------------
 * 峰子 App 是「呈現查詢資料的窗口」；真正的資料由 GOD 辦公室（本機 Agent 辦公室）
 * 產出後推入 KV，App 透過 GET /api/skynet/god/{endpoint} 讀取。
 *
 * 回應契約（由讀取端點提供，本元件只消費，不負責建立）：
 *   200 { ok:true, endpoint, ready:true,  schema_version, generated_at, provenance,
 *         payload, received_at, age_ms, stale }
 *   200 { ok:true, endpoint, ready:false, message:'GOD 辦公室資料尚未產出' }
 *
 * 最高原則 —— 資料誠實（違反即為錯誤）：
 *   - ready:false → 誠實顯示「GOD 辦公室資料尚未產出」，絕不顯示 0 或假數據。
 *   - payload 結構依 endpoint 而異且未知 → 只以「白名單」防禦性呈現已知欄位，
 *     不硬解未知欄位、不臆測、不補值；Array.isArray / optional chaining 層層守衛。
 *   - 永遠顯示出處與產出時間（可追溯）；stale 時額外標示資料已過期。
 *
 * Client component：需在瀏覽器 fetch，mount 後（useEffect）才抓資料，不在 render 期 fetch。
 */

import { useEffect, useId, useState, type ReactElement } from 'react';

export type GodPanelProps = {
  /** GOD 讀取端點名（例：radar、dashboard）。 */
  endpoint: string;
  /** 面板標題；預設「GOD 辦公室分析」。 */
  title?: string;
};

/** GET /api/skynet/god/{endpoint} 的回應信封（未知欄位一律防禦性處理）。 */
export type GodEnvelope = {
  ok?: boolean;
  endpoint?: string;
  ready?: boolean;
  message?: string;
  schema_version?: string;
  generated_at?: string;
  provenance?: unknown;
  payload?: unknown;
  received_at?: string;
  age_ms?: number;
  stale?: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'notReady' }
  | { status: 'ready'; envelope: GodEnvelope }
  | { status: 'error' };

const DEFAULT_TITLE = 'GOD 辦公室分析';

/** 已知純量欄位 → 中文標籤（只列已知者；未知欄位不呈現）。 */
const SCALAR_LABELS: Readonly<Record<string, string>> = {
  trade_date: '交易日',
  date: '資料日',
  latest: '最新交易日',
  is_open: '盤中狀態',
  scope: '資料範圍',
  data_scope: '資料範圍',
  movers_scope: '異動時效',
  as_of: '資料時點',
  n_stocks: '計入檔數',
  red: '上漲家數',
  green: '下跌家數',
  flat: '平盤家數',
  turnover: '成交金額',
};

/** 已知清單欄位 → 中文標籤（只列已知者；未知欄位不呈現）。 */
const LIST_LABELS: Readonly<Record<string, string>> = {
  movers: '異動標的',
  locked_yesterday: '昨日鎖漲跌停',
  disposition_unlock: '處置股解禁',
  news_movers: '新聞異動',
  block_trades: '鉅額交易',
  inst_top_buy: '法人買超前段',
  inst_flow: '三大法人買賣超',
  top_gainers: '漲幅前段',
  top_institutional_buys: '法人買超前段',
  industry_focus: '族群焦點',
  items: '清單',
  boards: '看板',
};

/** 清單最多呈現幾筆（其餘僅提示，避免長頁）。 */
const MAX_LIST_ITEMS = 6;

/* -------------------------------------------------------------------------- */
/* 防禦性工具                                                                 */
/* -------------------------------------------------------------------------- */

/** 是否為非 null、非陣列的物件。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 是否為可安全轉字串的純量。 */
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** 成交金額（元，原始值）→ 兆／億／元。 */
function formatTurnover(yuan: number): string {
  if (!Number.isFinite(yuan)) return '—';
  if (Math.abs(yuan) >= 1e12) return `${(yuan / 1e12).toFixed(2)} 兆`;
  if (Math.abs(yuan) >= 1e8) return `${(yuan / 1e8).toFixed(1)} 億`;
  return `${yuan.toLocaleString('zh-TW')} 元`;
}

/** 帶正負號的百分比。 */
function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** 純量欄位格式化（布林轉中文、成交金額轉兆／億）。 */
function formatScalar(key: string, value: string | number | boolean): string {
  if (typeof value === 'boolean') {
    if (key === 'is_open') return value ? '盤中' : '盤後';
    return value ? '是' : '否';
  }
  if (typeof value === 'number') {
    if (key === 'turnover') return formatTurnover(value);
    return value.toLocaleString('zh-TW');
  }
  return value;
}

/** 取清單項目的主文字（防禦性：依序找常見欄位，找不到回「—」）。 */
function itemPrimary(item: Record<string, unknown>): string {
  const keys = ['label', 'name', 'stock_name', 'title', 'industry', 'sid', 'stock_id', 'id'];
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '—';
}

/** 取清單項目的次要指標（含台股慣例：紅漲綠跌）。 */
function itemSecondary(item: Record<string, unknown>): { text: string; tone: string } | null {
  const pct = item.change_pct;
  if (typeof pct === 'number') {
    return {
      text: formatSignedPercent(pct),
      tone: pct > 0 ? 'text-up' : pct < 0 ? 'text-down' : 'text-muted',
    };
  }
  if (typeof item.metric_text === 'string' && item.metric_text !== '') {
    return { text: item.metric_text, tone: 'text-ink' };
  }
  if (typeof item.net_buy === 'string' && item.net_buy !== '') {
    return { text: item.net_buy, tone: 'text-ink' };
  }
  const lots = item.net_lots;
  if (typeof lots === 'number') {
    return {
      text: `${lots.toLocaleString('zh-TW')} 張`,
      tone: lots > 0 ? 'text-up' : lots < 0 ? 'text-down' : 'text-muted',
    };
  }
  if (typeof item.summary === 'string' && item.summary !== '') {
    return { text: item.summary, tone: 'text-muted' };
  }
  return null;
}

/** 單一清單列（防禦性：非物件項目也能安全呈現）。 */
function ListRow({ item }: { item: unknown }): ReactElement {
  if (!isRecord(item)) {
    return (
      <li className="flex items-baseline justify-between gap-2 text-[12.5px] text-ink">
        <span className="truncate">{String(item)}</span>
      </li>
    );
  }
  const secondary = itemSecondary(item);
  return (
    <li className="flex items-baseline justify-between gap-2 text-[12.5px]">
      <span className="truncate text-ink">{itemPrimary(item)}</span>
      {secondary ? (
        <span className={`num shrink-0 font-black ${secondary.tone}`}>{secondary.text}</span>
      ) : null}
    </li>
  );
}

/** 防禦性呈現 payload 重點：只認已知欄位，未知欄位不硬解、不臆測。 */
export function GodPayloadHighlights({ payload }: { payload: unknown }): ReactElement {
  if (!isRecord(payload)) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted">
        GOD 辦公室回傳的資料格式未識別，僅顯示出處與產出時間。
      </p>
    );
  }

  // 部分 endpoint（例：daily-highlights）把重點放在 payload.data 內，合併一層。
  const root: Record<string, unknown> = isRecord(payload.data) ? payload.data : payload;

  const scalars = Object.entries(SCALAR_LABELS)
    .map(([key, label]) => {
      const value = root[key];
      return isScalar(value) ? { key, label, text: formatScalar(key, value) } : null;
    })
    .filter((entry): entry is { key: string; label: string; text: string } => entry !== null);

  const lists = Object.entries(LIST_LABELS)
    .map(([key, label]) => {
      const value = root[key];
      return Array.isArray(value) && value.length > 0
        ? { key, label, items: value as unknown[] }
        : null;
    })
    .filter((entry): entry is { key: string; label: string; items: unknown[] } => entry !== null);

  // 白話摘要（例：market_summary.summary、根層 summary）。
  const summaryText =
    isRecord(root.market_summary) && typeof root.market_summary.summary === 'string'
      ? root.market_summary.summary
      : typeof root.summary === 'string' && root.summary !== ''
        ? root.summary
        : null;

  const hasContent = scalars.length > 0 || lists.length > 0 || summaryText !== null;

  if (!hasContent) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted">
        GOD 辦公室回傳的資料未含可摘要欄位，僅顯示出處與產出時間。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {summaryText !== null ? (
        <p className="text-[13px] font-bold leading-relaxed text-ink">{summaryText}</p>
      ) : null}

      {scalars.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1.5">
          {scalars.map((entry) => (
            <div key={entry.key} className="flex items-baseline gap-1.5">
              <dt className="text-[11.5px] font-bold text-muted">{entry.label}</dt>
              <dd className="num text-[13px] font-black text-ink">{entry.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {lists.map((entry) => (
        <section key={entry.key}>
          <h3 className="text-[12.5px] font-black text-ink">{entry.label}</h3>
          <ul className="mt-1 space-y-1">
            {entry.items.slice(0, MAX_LIST_ITEMS).map((item, index) => (
              <ListRow key={index} item={item} />
            ))}
          </ul>
          {entry.items.length > MAX_LIST_ITEMS ? (
            <p className="mt-1 text-[11px] text-muted">
              另有 {entry.items.length - MAX_LIST_ITEMS} 筆，完整清單見 GOD 辦公室。
            </p>
          ) : null}
        </section>
      ))}

      {typeof root.note === 'string' && root.note !== '' ? (
        <p className="text-[11.5px] leading-relaxed text-muted">{root.note}</p>
      ) : null}
    </div>
  );
}

/**
 * GOD 辦公室分析面板。
 *
 * @param props.endpoint GOD 讀取端點名（radar／dashboard／…）。
 * @param props.title 面板標題，預設「GOD 辦公室分析」。
 */
export default function GodPanel({ endpoint, title = DEFAULT_TITLE }: GodPanelProps): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const load = async (): Promise<void> => {
      // 無 fetch 的環境（如未掛 fetch 的 jsdom）誠實走錯誤狀態，不讓元件崩潰。
      if (typeof fetch !== 'function') {
        if (!cancelled) setState({ status: 'error' });
        return;
      }
      try {
        const res = await fetch(`/api/skynet/god/${endpoint}`, { cache: 'no-store' });
        const body = (await res.json()) as GodEnvelope | null;
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
  }, [endpoint]);

  return (
    <section aria-labelledby={headingId} className="data-panel hud-panel glass mt-4 rounded-2xl p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-1.5 text-[14px] font-black text-ink">
          <span aria-hidden="true" className="text-accent">
            ◆
          </span>
          {title}
        </h2>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
          GOD 辦公室
        </span>
      </div>

      {state.status === 'loading' ? (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">正在讀取 GOD 辦公室資料…</span>
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" aria-hidden="true" />
          <div className="h-5 w-full animate-pulse rounded bg-surface-2" aria-hidden="true" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-surface-2" aria-hidden="true" />
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
        <div role="status" aria-live="polite">
          <GodPayloadHighlights payload={state.envelope.payload} />
          <p className="mt-3 border-t border-line/60 pt-2 text-[11.5px] leading-relaxed text-muted">
            資料來源：GOD 辦公室 · 產出時間{' '}
            {typeof state.envelope.generated_at === 'string' && state.envelope.generated_at !== ''
              ? state.envelope.generated_at
              : '未提供'}
            {state.envelope.stale === true ? '（資料已超過 6 小時）' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
