/**
 * /live/ 盤中戰情（today 群組）—— 客戶端工作區元件。
 *
 * 逐字複刻 captured/login-capture/html/live.html 的 <main> 內容：
 *   - 「相關功能切換」pill 導覽（TodayGroupNav）
 *   - 「盤中模式」二段切換（個股工作區／全市場戰情）
 *   - 工作區標頭（操作說明 <details>、非盤中提示、代號查詢表單）
 *   - 「工作區工具」三段切換（盤口／五檔、逐筆成交、通知設定）
 *   - 「工作區通知」側欄（通知記錄，文案照抄實站）
 *
 * 資料：個股現價來自 /api/skynet/twse（TWSE MIS 公開行情代理，含盤後回退），
 *       查詢後每 15 秒自動重抓（對齊實站「盤中持續更新」語意）。
 *       五檔／逐筆成交／通知設定／全市場戰情目前**無對接來源**，
 *       一律以 role="status" 的載入骨架如實呈現，不造假資料。
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import TodayGroupNav from '@/components/TodayGroupNav';
import type { TWSEMISItem } from '@/app/api/skynet/twse/route';
import './today-group.css';

/** 個股報價查詢狀態。 */
type QuoteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: TWSEMISItem }
  | { kind: 'empty' }
  | { kind: 'error' };

/** 盤中模式。 */
type LiveMode = 'workspace' | 'market';

/** 工作區工具分頁。 */
type WorkspaceTool = 'quote' | 'trades' | 'notify';

/** 漲跌色：紅漲綠跌。 */
function toneClass(value: number): string {
  return value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-muted';
}

/** 漲跌幅加號格式化（+2.25% / -0.5%）。 */
function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value.toFixed(2))}%`;
}

/** 資料來源標記（如實標示，不美化）。 */
function sourceLabel(source: TWSEMISItem['source']): string {
  if (source === 'twse-mis-live') return 'TWSE 即時';
  if (source === 'twse-openapi-fallback') return 'TWSE 盤後';
  return '公開資料';
}

/** 載入骨架（對齊實站「載入中」語彙：role="status" + animate-pulse + 正在整理…）。 */
function LoadingPanel({ label = '正在整理…' }: { label?: string }) {
  return (
    <div role="status" className="animate-pulse space-y-3">
      <div className="h-3.5 w-1/3 rounded bg-line/60" />
      <div className="h-7 w-2/3 rounded bg-line/40" />
      <div className="h-3.5 w-1/2 rounded bg-line/40" />
      <p className="text-[12.5px] leading-relaxed text-muted">{label}</p>
    </div>
  );
}

/** 空狀態提示（如實呈現「查無報價」，不編造數字）。 */
function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

export default function LiveWorkspace() {
  const [mode, setMode] = useState<LiveMode>('workspace');
  const [tool, setTool] = useState<WorkspaceTool>('quote');
  const [symbol, setSymbol] = useState('');
  const [quote, setQuote] = useState<QuoteState>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQuote = useCallback(async (code: string) => {
    setQuote({ kind: 'loading' });
    try {
      const res = await fetch(
        `/api/skynet/twse?tickers=${encodeURIComponent(code)}&_=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setQuote({ kind: 'error' });
        return;
      }
      const json = (await res.json()) as { items?: TWSEMISItem[]; error?: string };
      const item = json.items?.[0];
      setQuote(item ? { kind: 'ok', data: item } : { kind: 'empty' });
    } catch {
      setQuote({ kind: 'error' });
    }
  }, []);

  // 每 15 秒重抓一次現價（對齊實站「盤中持續更新」；清單在 symbol 改變時一併清除）。
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (quote.kind !== 'ok') return undefined;
    const code = quote.data.symbol;
    timerRef.current = setInterval(() => {
      void fetchQuote(code);
    }, 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quote, fetchQuote]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = symbol.trim();
    if (!/^\d{4,6}[A-Za-z]?$/.test(code)) {
      setQuote({ kind: 'empty' });
      return;
    }
    void fetchQuote(code);
  };

  return (
    <>
      <TodayGroupNav />
      <div className="page-enter">
        <nav aria-label="盤中模式" className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={mode === 'workspace'}
            onClick={() => setMode('workspace')}
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-bold bg-accent text-bg"
          >
            個股工作區
          </button>
          <button
            type="button"
            aria-pressed={mode === 'market'}
            onClick={() => setMode('market')}
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-bold bg-surface text-ink"
          >
            全市場戰情
          </button>
        </nav>

        {mode === 'workspace' ? (
          <div data-stock-browse-local="true" data-stock-browse-ids="" className="min-w-0 space-y-3">
            <header className="rounded-2xl border border-line bg-surface p-4">
              <h1 className="text-xl font-black">盤中工作區</h1>
              <details className="mt-2 text-sm leading-relaxed text-muted">
                <summary className="min-h-11 cursor-pointer py-2 font-bold text-accent">
                  第一次用？30 秒看懂操作
                </summary>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>輸入股票代號，看「盤口／五檔」。五檔是目前掛出的買賣委託，還不是成交，也可能撤單。</li>
                  <li>切到「逐筆成交」，查看已成交的價格與張數，先核對資料日期與時間。</li>
                  <li>在「通知設定」選主題和成交量門檻；收到通知後，按「同頁查看」接著看該股。</li>
                </ol>
                <p className="mt-2">漲幅達 8% 只代表通知當時已漲到門檻，不代表接下來會漲停。收盤後資料留在同一頁，不用另開覆盤頁。</p>
              </details>
              <p className="mt-1 text-sm leading-relaxed text-muted">盤中持續更新，13:30 收盤後原地保留最後收到的資料，不用切換頁面。</p>
              <p role="status" className="mt-2 text-xs leading-relaxed text-muted">非盤中時段｜保留最後資料供查看。五檔與逐筆成交可能不同日期或時間，請以各欄標示為準。</p>
              <form className="mt-3 flex min-w-0 gap-2" onSubmit={handleSubmit}>
                <input
                  aria-label="工作區股票代號"
                  inputMode="numeric"
                  placeholder="股票代號，例如 2330"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-base text-ink"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                />
                <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-bg">
                  查詢
                </button>
              </form>
            </header>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <section className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
                <nav aria-label="工作區工具" className="mb-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    aria-pressed={tool === 'quote'}
                    onClick={() => setTool('quote')}
                    className="min-h-11 rounded-xl px-2 text-sm font-bold bg-accent text-bg"
                  >
                    盤口／五檔
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'trades'}
                    onClick={() => setTool('trades')}
                    className="min-h-11 rounded-xl px-2 text-sm font-bold bg-surface-2 text-ink"
                  >
                    逐筆成交
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'notify'}
                    onClick={() => setTool('notify')}
                    className="min-h-11 rounded-xl px-2 text-sm font-bold bg-surface-2 text-ink"
                  >
                    通知設定
                  </button>
                </nav>

                {tool === 'quote' ? (
                  <QuoteArea quote={quote} />
                ) : tool === 'trades' ? (
                  <div className="space-y-3">
                    <LoadingPanel label="逐筆成交明細資料來源尚未接入，正在整理…" />
                    <p className="text-[12.5px] leading-relaxed text-muted">
                      逐筆成交資料目前無對接來源，先以載入狀態呈現；現價可切回「盤口／五檔」查看。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <LoadingPanel label="通知設定資料來源尚未接入，正在整理…" />
                    <p className="text-[12.5px] leading-relaxed text-muted">
                      通知主題與成交量門檻目前無對接來源；沒有訊號不代表行情故障。
                    </p>
                  </div>
                )}
              </section>

              <aside aria-label="工作區通知" className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
                <h2 className="text-base font-bold">通知記錄</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">每 15 秒更新記錄，不會更改你的手機推播模式。請留意訊息時間，舊通知不是即時行情。</p>
                <ul className="mt-3 space-y-3">
                  <li className="min-w-0 border-b border-line pb-3">
                    <h3 className="break-words text-sm font-bold">管理員回覆了你的回饋</h3>
                    <time className="text-xs text-muted">2026-09-21 23:15</time>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">這則內容像是站長發布的任務規則，而非會員建議，我不會把它當成待評估的許願。若你是收到此通知的會員，請依規定如實回報心得或問題；若認為規則有誤，請直接聯繫管理員確認。</p>
                    <div className="mt-2 flex flex-wrap gap-2" />
                  </li>
                </ul>
              </aside>
            </div>

            <p className="px-1 text-xs leading-relaxed text-muted">通知是事件記錄，並非目前報價；請核對通知時間。盤後 K 線請至完整個股頁查看。</p>
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <header className="rounded-2xl border border-line bg-surface p-4">
              <h1 className="text-xl font-black">全市場戰情</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">全市場戰情（漲跌家數、成交密度、分點動態）的資料來源尚未接入，目前如實以載入狀態呈現。</p>
              <div className="mt-3">
                <LoadingPanel label="全市場戰情資料整理中…" />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                盤中可先至{' '}
                <a className="font-bold text-accent" href="/market/">大盤</a>
                {' '}或{' '}
                <a className="font-bold text-accent" href="/radar/">事件</a>
                {' '}查看公開資料。
              </p>
            </header>
          </div>
        )}
      </div>
    </>
  );
}

/** 盤口／五檔區塊：依查詢狀態呈現閒置提示／載入骨架／報價／查無結果。 */
function QuoteArea({ quote }: { quote: QuoteState }) {
  if (quote.kind === 'idle') {
    return (
      <EmptyPanel>輸入股票代號，或從通知按「同頁查看」。沒有訊號不代表行情故障，請先確認訂閱主題。</EmptyPanel>
    );
  }

  if (quote.kind === 'loading') {
    return <LoadingPanel label="正在整理盤口資料…" />;
  }

  if (quote.kind === 'empty') {
    return (
      <EmptyPanel>查不到這個代號的公開報價。請確認代號（例如 2330）與上市／上櫃別，或稍後再試。</EmptyPanel>
    );
  }

  if (quote.kind === 'error') {
    return (
      <EmptyPanel>公開行情服務暫時不可用，無法顯示現價；請稍後再查詢。</EmptyPanel>
    );
  }

  const { data } = quote;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <b className="text-[15px]">{data.symbol}</b>
          <span className="ml-1.5 text-[12.5px] text-muted">{data.name}</span>
        </div>
        <span className={`num text-2xl font-black ${toneClass(data.change)}`}>
          {data.price.toLocaleString('zh-Hant')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">漲跌</p>
          <p className={`num mt-0.5 font-black ${toneClass(data.change)}`}>
            {data.change > 0 ? '+' : ''}{Number(data.change.toFixed(2))}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">漲跌幅</p>
          <p className={`num mt-0.5 font-black ${toneClass(data.change)}`}>{formatPercent(data.changePercent)}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">開盤</p>
          <p className="num mt-0.5 font-bold text-ink">{data.open.toLocaleString('zh-Hant')}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">最高</p>
          <p className="num mt-0.5 font-bold text-ink">{data.high.toLocaleString('zh-Hant')}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">最低</p>
          <p className="num mt-0.5 font-bold text-ink">{data.low.toLocaleString('zh-Hant')}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <p className="text-[11px] font-bold text-muted">成交量</p>
          <p className="num mt-0.5 font-bold text-ink">{data.volume.toLocaleString('zh-Hant')} 張</p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        資料時間 {data.timestamp || '--'}{data.tradeDate ? `（${data.tradeDate}）` : ''}・{sourceLabel(data.source)}
      </p>
      <p className="text-[11px] leading-relaxed text-muted">
        五檔與逐筆成交明細的資料來源尚未接入，暫以載入狀態呈現；現價為 TWSE 公開行情代理，盤後可能回退為收盤均價。
      </p>
    </div>
  );
}
