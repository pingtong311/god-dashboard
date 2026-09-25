/**
 * /reports/ 台股日報（today 群組）—— 客戶端列表元件。
 *
 * 逐字複刻 captured/login-capture/html/reports.html 的 <main> 結構與文案：
 *   - 「相關功能切換」pill 導覽（TodayGroupNav）
 *   - 標題／四象限說明／前往盤中工作區連結／出刊節奏說明／「重新整理日報」
 *   - 「最新一篇」與「較早的日報（N 篇）」<details> 摺疊列表
 *
 * 資料：/api/skynet/daily-reports（Google Sheets 公開表代理）。
 * 每筆含日期／時間／名稱／摘要／分析理由；**瀏覽與留言數無對應欄位，如實省略**，
 * 並把來源頻道（TG／LINE／WEB）標出，不造假數字。
 * 載入中顯示骨架（role="status" + animate-pulse + 正在整理…），
 * 取不到資料就誠實呈現空狀態或錯誤訊息。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TodayGroupNav from '@/components/TodayGroupNav';
import '../live/today-group.css';

/** /api/skynet/daily-reports 回傳的單筆日報（只取頁面需要的欄位）。 */
type DailyReport = {
  date: string;
  time: string;
  name: string;
  channel: string;
  summary: string;
  message: string;
};

/** 列表狀態。 */
type ListState =
  | { kind: 'loading' }
  | { kind: 'ok'; reports: DailyReport[] }
  | { kind: 'empty' }
  | { kind: 'error' };

/** 載入骨架卡（對齊實站「載入中」語彙）。 */
function SkeletonCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="hud-panel block w-full animate-pulse rounded-2xl border border-line bg-surface p-4 text-left md:p-5"
    >
      <div className="h-4 w-20 rounded bg-line/60" />
      <div className="mt-3 h-4 w-3/4 rounded bg-line/50" />
      <div className="mt-2 h-3.5 w-1/2 rounded bg-line/40" />
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">正在整理…</p>
    </div>
  );
}

/** 單篇日報卡（可點擊展開摘要與分析理由）。 */
function ReportCard({
  report,
  badge,
  defaultOpen = false,
}: {
  report: DailyReport;
  badge: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="hud-panel block w-full rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 md:p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-line/80 px-2 py-0.5 text-[12px] font-bold text-muted">{badge}</span>
        </div>
        <b className="mt-1.5 block text-[15px]">{report.name} · {report.date}</b>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {report.date} · {report.time || '--'} · 來源 {report.channel}
        </p>
      </button>
      {open ? (
        <div className="rounded-2xl border border-line/70 bg-surface/70 p-4 text-[13px] leading-relaxed text-muted">
          {report.summary ? (
            <p className="whitespace-pre-wrap break-words text-ink">{report.summary}</p>
          ) : null}
          {report.message ? (
            <p className="mt-2 whitespace-pre-wrap break-words">{report.message}</p>
          ) : null}
          {!report.summary && !report.message ? <p>本篇日報沒有附帶文字內容。</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ReportsList() {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [refreshedAt, setRefreshedAt] = useState<string>('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/skynet/daily-reports?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const json = (await res.json()) as { reports?: DailyReport[] };
      const reports = Array.isArray(json.reports) ? json.reports.filter((row) => row && row.message) : [];
      setRefreshedAt(new Date().toLocaleString('zh-TW', { hour12: false }));
      setState(reports.length > 0 ? { kind: 'ok', reports } : { kind: 'empty' });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <TodayGroupNav />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">台股日報</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">日報整理已發生的市場資料，不是明天的漲跌預測。原本的「四象限」就是四類資料：成交量與買超集中度、股價與融資變化、分點歷史買賣、同產業漲跌比較。顏色只用來分組，不是買賣燈號。</p>
        <Link
          className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-bold text-accent"
          href="/live/"
        >
          盤中看資料？前往盤中工作區 →
        </Link>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">每個交易日盤後，資料整理完成後上架；週六日與國定假日不會出新篇。 每週日另有「大環境週報」（全球情勢上周重點＋本週注意）。 名詞看不懂？先去{' '}
          <Link className="font-bold text-accent" href="/school/"> 台股學堂 </Link>查。
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.kind === 'loading'}
          className="mt-3 min-h-10 rounded-xl border border-line px-4 text-[12.5px] font-bold text-muted transition hover:border-accent hover:text-accent active:scale-[0.98] disabled:opacity-60"
        >
          {state.kind === 'loading' ? '重新整理日報中…' : '重新整理日報'}
        </button>
        {refreshedAt ? (
          <p className="mt-1.5 text-[11px] text-muted">上次更新 {refreshedAt}</p>
        ) : null}

        <div className="mt-4 grid gap-3">
          {state.kind === 'loading' ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : null}

          {state.kind === 'error' ? (
            <p role="alert" className="rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
              日報資料暫時讀不到（公開來源不可用），請稍後再按「重新整理日報」。
            </p>
          ) : null}

          {state.kind === 'empty' ? (
            <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
              目前沒有可顯示的日報。盤後資料整理完成後會自動上架；週六日與國定假日不出篇。
            </div>
          ) : null}

          {state.kind === 'ok' ? (
            <>
              <ReportCard report={state.reports[0]} badge="最新一篇" defaultOpen />
              {state.reports.length > 1 ? (
                <details className="rounded-2xl border border-line/80 bg-surface/70 p-4">
                  <summary className="cursor-pointer text-[13.5px] font-black text-accent">
                    較早的日報（{state.reports.length - 1} 篇）
                  </summary>
                  <div className="mt-3 grid gap-3">
                    {state.reports.slice(1).map((report) => (
                      <ReportCard key={`${report.date}-${report.time}-${report.name}`} report={report} badge="台股日報" />
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
