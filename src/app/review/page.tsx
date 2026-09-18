'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import styles from './review.module.css';

type ViewKey = 'decisions' | 'reports' | 'market' | 'performance';
type Decision = 'APPROVED' | 'REJECTED';

type Sniper = {
  ticker?: string;
  name?: string;
  triggerPrice?: number | string;
  stopPrice?: number | string;
  status?: string;
  confidence?: number | string;
  modelScore?: number | string;
  signalScore?: number | string;
  chaseRisk?: number | string;
  tradabilityScore?: number | string;
  firstModelScore?: number | string;
  modelScoreDelta?: number | string;
  source?: string;
  theme?: string;
  price?: number | string;
  changePct?: number | string;
  dayChangePct?: number | string;
  change20mPct?: number | string | null;
  previousChangePct?: number | string | null;
  changeWindowMinutes?: number | string | null;
  firstSeenAt?: string;
  firstPrice?: number | string | null;
  entryPrice?: number | string | null;
  fillStatus?: string;
  pathQuality?: string;
  mfePct?: number | string | null;
  maePct?: number | string | null;
  observationCount?: number | string;
  profit1Price?: number | string | null;
  profit2Price?: number | string | null;
  profit3Price?: number | string | null;
  stopRiskPct?: number | string | null;
  quoteTime?: string;
  quoteAgeSec?: number | string | null;
  quoteSource?: string;
  calibration?: {
    band?: string;
    sampleSize?: number;
    totalSamples?: number;
    minimumBandSamples?: number;
    minimumTotalSamples?: number;
    positiveRate?: number | null;
    hit1Rate?: number | null;
    stopRate?: number | null;
    ready?: boolean;
  };
  factorSnapshot?: {
    tdccStatus?: string;
    tdccDate?: string;
    large400Pct?: number;
    large400Change1wPctPoint?: number | null;
    institutionStatus?: string;
    institutionDate?: string;
    foreignNet?: number;
    trustNet?: number;
    institutionTotalNet?: number;
  };
  volume?: number | string;
  riskReward?: number | string;
  anchorTime?: string;
  date?: string;
  note?: string;
};

type PerformanceRow = {
  row_number?: number;
  代號?: string | number;
  名稱?: string;
  選出時間?: string;
  選出價?: number | string;
  選出理由?: string;
  現價?: number | string;
  '漲幅%'?: number | string;
  狀態?: string;
  '實際損益%'?: number | string;
};

type PerformanceSummary = {
  date?: string;
  totalSignals?: number;
  activeTracking?: number;
  closedTrades?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
  avgReturn?: number;
  bestReturn?: number;
  worstReturn?: number;
  predictionSamples?: number;
};

type AlphaRoom = {
  focusTags?: string | string[];
  avoidTags?: string | string[];
  bullScore?: number;
  mentionedStocks?: string[];
  summary?: string;
  date?: string;
};


type ReportChart = { ticker: string; url: string; metaUrl: string };
type ReportEvidence = {
  technical?: boolean;
  expert?: boolean;
  realtime?: boolean;
  knowledgeBase?: boolean;
  warning?: boolean;
  explanationLines?: string[];
  labels?: string[];
};

type DailyReport = {
  date: string;
  time: string;
  code: string;
  name: string;
  status: string;
  channel: string;
  summary: string;
  message: string;
  charts?: ReportChart[];
  evidence?: ReportEvidence;
};

type DailyReportsData = {
  updatedAt?: string;
  days: string[];
  reports: DailyReport[];
  auditSummary?: {
    total?: number;
    technical?: number;
    expert?: number;
    realtime?: number;
    warnings?: number;
    chartCards?: number;
    duplicateFiltered?: number;
    deliveryMode?: string;
  };
};

type DashboardData = {
  snipers: Sniper[];
  sniperDate: string;
  performanceRows: PerformanceRow[];
  performance: PerformanceSummary;
  alpha: AlphaRoom;
};

const EMPTY_DATA: DashboardData = {
  snipers: [],
  sniperDate: '',
  performanceRows: [],
  performance: {},
  alpha: {},
};

const DECISION_STORAGE_KEY = 'skynet_human_decisions_v1';

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Bot }> = [
  { key: 'decisions', label: '今日飆股', icon: Bot },
  { key: 'reports', label: '每日戰報', icon: BookOpen },
  { key: 'market', label: '族群雷達', icon: LineChart },
  { key: 'performance', label: '命中追蹤', icon: BarChart3 },
];

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown): string {
  const number = numeric(value);
  return number === null ? '--' : new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(number);
}

function percent(value: unknown): string {
  const number = numeric(value);
  return number === null ? '--' : `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(/[,，、/]/).map((item) => item.trim()).filter(Boolean);
}

function compactTime(value: string | undefined): string {
  if (!value) return '--';
  const match = value.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1] || value;
}

function observationChange(sniper: Sniper): string {
  const change20m = numeric(sniper.change20mPct);
  if (change20m !== null) return `20 分 ${percent(change20m)}`;
  const previous = numeric(sniper.previousChangePct);
  const minutes = numeric(sniper.changeWindowMinutes);
  if (previous !== null && minutes !== null) return `${Math.round(minutes)} 分 ${percent(previous)}`;
  return '首次觀測';
}

function calibrationLabel(sniper: Sniper): string {
  const calibration = sniper.calibration;
  const sampleSize = Number(calibration?.sampleSize || 0);
  if (!calibration?.ready) return `${calibration?.band || '同分組'} ${sampleSize}/${calibration?.minimumBandSamples || 100}；總樣本 ${calibration?.totalSamples || 0}/${calibration?.minimumTotalSamples || 300}，累積中`;
  return `${calibration.band || '同分組'}｜60 分上漲 ${calibration.positiveRate}%｜+1% ${calibration.hit1Rate}%｜停損 ${calibration.stopRate}%`;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function dataUrl(type: string): string {
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (local || type === 'decision_reviews') return `/api/skynet/n8n-proxy?type=${encodeURIComponent(type)}`;
  return `https://skynet-cmd.duckdns.org/webhook/skynet-dashboard?type=${encodeURIComponent(type)}&_ts=${Date.now()}`;
}

function statusLabel(sniper: Sniper, decision?: Decision): string {
  if (decision === 'APPROVED') return '已加入觀察';
  if (decision === 'REJECTED') return '不列入觀察';
  const raw = String(sniper.status || '').trim();
  return raw || '等待人工決定';
}

function sourceLabel(source: string | undefined): string {
  const value = String(source || '');
  if (value.includes('0905')) return '09:05 即時雷達';
  if (value.includes('TWSE') || value.includes('TPEX')) return '交易所盤中資料';
  return value || '來源未標示';
}

function MetricCard({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: 'neutral' | 'green' | 'red' }) {
  return (
    <section className={`${styles.metricCard} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}


function reportTitle(name: string): string {
  return String(name || '戰報')
    .replace(/^TG\s*-\s*/i, '')
    .replace(/_?LINE/gi, '')
    .replace(/P2\s*/gi, '')
    .replace(/推送/g, '')
    .replace(/\s+/g, ' ')
    .trim() || '戰報';
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.emptyState}>
      <Database size={28} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export default function ReviewPage() {
  const [view, setView] = useState<ViewKey>('decisions');
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [decisionBusy, setDecisionBusy] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [reportsData, setReportsData] = useState<DailyReportsData>({ days: [], reports: [] });
  const [selectedReportDate, setSelectedReportDate] = useState('');

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    let successCount = 0;
    const failures: string[] = [];
    const commit = (updater: (current: DashboardData) => DashboardData) => {
      successCount += 1;
      setData(updater);
      setLoading(false);
    };
    const tasks = [
      async () => {
        const payload = await fetchJson('/api/skynet/daily-reports/');
        const reports = Array.isArray(payload.reports) ? payload.reports as DailyReport[] : [];
        const days = Array.isArray(payload.days) ? payload.days.map(String) : [];
        setReportsData({ updatedAt: String(payload.updatedAt || ''), days, reports, auditSummary: payload.auditSummary || {} });
        setSelectedReportDate((current) => current || days[0] || '');
        successCount += 1;
        setLoading(false);
      },
      async () => {
        const payload = await fetchJson(dataUrl('snipers'));
        const snipers = Array.isArray(payload.snipers) ? payload.snipers as Sniper[] : [];
        commit((current) => ({ ...current, snipers, sniperDate: String(payload.date || '') }));
        setSelectedTicker((current) => current || String(snipers[0]?.ticker || ''));
      },
      async () => {
        const payload = await fetchJson(dataUrl('alpha'));
        commit((current) => ({ ...current, alpha: (payload.warRoom || {}) as AlphaRoom }));
      },
      async () => {
        const payload = await fetchJson(dataUrl('personal_performance'));
        commit((current) => ({
          ...current,
          performanceRows: Array.isArray(payload.rows) ? payload.rows as PerformanceRow[] : [],
          performance: (payload.summary || {}) as PerformanceSummary,
        }));
      },
      async () => {
        const payload = await fetchJson(dataUrl('decision_reviews'));
        const rows = Array.isArray(payload.decisions) ? payload.decisions as Array<{ ticker?: unknown; decision?: unknown }> : [];
        const remote = rows.reduce<Record<string, Decision>>((result, row) => {
          const ticker = String(row.ticker || '').trim();
          const decision = String(row.decision || '').toUpperCase();
          if (ticker && (decision === 'APPROVED' || decision === 'REJECTED')) result[ticker] = decision;
          return result;
        }, {});
        setDecisions((current) => {
          const merged = { ...current, ...remote };
          localStorage.setItem(DECISION_STORAGE_KEY, JSON.stringify(merged));
          return merged;
        });
        successCount += 1;
      },
    ];
    const labels = ['每日戰報', '盤中候選', '盤前判斷', '成績', '人工決策'];
    for (let index = 0; index < tasks.length; index += 1) {
      try {
        await tasks[index]();
      } catch (cause) {
        failures.push(`${labels[index]}：${cause instanceof Error ? cause.message : '讀取失敗'}`);
      }
    }
    if (successCount === 0) setError(failures.join('；') || '資料讀取失敗');
    else if (failures.length) setError(`部分資料暫時未回應：${failures.map((item) => item.split('：')[0]).join('、')}`);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => loadData(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DECISION_STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') setDecisions(saved);
    } catch {}
    loadData();
  }, [loadData]);

  const filteredSnipers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data.snipers;
    return data.snipers.filter((item) => [item.ticker, item.name, item.theme].some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [data.snipers, search]);

  const selected = data.snipers.find((item) => String(item.ticker) === selectedTicker) || filteredSnipers[0];
  const pendingCount = data.snipers.filter((item) => !decisions[String(item.ticker || '')]).length;
  const focusTags = list(data.alpha.focusTags);
  const avoidTags = list(data.alpha.avoidTags);
  const selectedReports = reportsData.reports.filter((report) => report.date === selectedReportDate);
  const reportStats = {
    total: reportsData.reports.length,
    today: selectedReports.length,
    latest: selectedReports[0]?.time || '--',
    chartCards: selectedReports.reduce((sum, report) => sum + (report.charts?.length || 0), 0),
    evidence: selectedReports.filter((report) => report.evidence?.technical || report.evidence?.expert || report.evidence?.knowledgeBase || report.evidence?.realtime).length,
    warnings: selectedReports.filter((report) => report.evidence?.warning).length,
  };

  const sectorRows = useMemo(() => {
    const groups = new Map<string, { count: number; changes: number[]; leaders: string[] }>();
    for (const item of data.snipers) {
      const key = String(item.theme || '未分類');
      const row = groups.get(key) || { count: 0, changes: [], leaders: [] };
      row.count += 1;
      const change = numeric(item.changePct);
      if (change !== null) row.changes.push(change);
      if (item.name) row.leaders.push(`${item.name}(${item.ticker || ''})`);
      groups.set(key, row);
    }
    return Array.from(groups.entries()).map(([theme, row]) => ({
      theme,
      count: row.count,
      avgChange: row.changes.length ? row.changes.reduce((a, b) => a + b, 0) / row.changes.length : null,
      leaders: row.leaders.slice(0, 3),
    })).sort((a, b) => b.count - a.count || (b.avgChange || 0) - (a.avgChange || 0));
  }, [data.snipers]);

  async function decide(item: Sniper, decision: Decision) {
    const ticker = String(item.ticker || '');
    if (!ticker) return;
    setDecisionBusy(ticker);
    setDecisionError('');
    try {
      const response = await fetch('/api/skynet/n8n-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'review_notification',
          ticker,
          name: item.name || '',
          decision,
          proposalStatus: decision,
          decidedAt: new Date().toISOString(),
          humanApprovalRequired: true,
          orderSubmissionAllowed: false,
          channel: 'DASHBOARD',
        }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || `決策服務拒絕寫入（${response.status}）`);
      if (payload.success === false) throw new Error(payload.message || payload.error || '決策內容未被接受');
      const next = { ...decisions, [ticker]: decision };
      setDecisions(next);
      localStorage.setItem(DECISION_STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      setDecisionError(cause instanceof Error ? cause.message : '決策寫入失敗');
    } finally {
      setDecisionBusy('');
    }
  }

  const currentTitle = navItems.find((item) => item.key === view)?.label || '今日飆股';

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <div className={styles.brandMark}><Sparkles size={19} /></div>
          <div><strong>SkyNet</strong><span>AI Trader</span></div>
          <button className={styles.mobileClose} onClick={() => setMobileNav(false)} aria-label="關閉選單"><X size={20} /></button>
        </div>
        <nav className={styles.sideNav} aria-label="主要功能">
          <button className={styles.commandLink} onClick={() => { setView('market'); setMobileNav(false); }}>
            <LayoutDashboard size={18} /><span>今日指揮台</span>
          </button>
          <span className={styles.navLabel}>飆股 AI</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={view === item.key ? styles.activeNav : ''} onClick={() => { setView(item.key); setMobileNav(false); }}>
                <Icon size={18} /><span>{item.label}</span>{item.key === 'decisions' && pendingCount > 0 ? <em>{pendingCount}</em> : null}
              </button>
            );
          })}
        </nav>
        <div className={styles.assistantPolicy}>
          <ShieldCheck size={20} />
          <div><strong>候選優先模式</strong><span>自選/持倉不進排行</span></div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} onClick={() => setMobileNav(true)} aria-label="開啟選單"><Menu size={21} /></button>
          <div className={styles.pageTitle}><span>SkyNet 飆股 AI</span><strong>{currentTitle}</strong></div>
          <label className={styles.searchBox}>
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋今日候選、代號或族群" />
          </label>
          <button className={styles.iconButton} onClick={() => loadData(true)} disabled={refreshing} title="重新整理即時資料" aria-label="重新整理即時資料">
            <RefreshCw size={18} className={refreshing ? styles.spinning : ''} />
          </button>
          <div className={styles.channelState}><Bell size={17} /><span>LINE / WEB</span><i /></div>
        </header>

        <div className={styles.content}>
          {error ? <div className={styles.errorBanner}><Database size={17} /><span>即時資料讀取失敗：{error}</span><button onClick={() => loadData()}>重試</button></div> : null}
          {loading ? <div className={styles.loading}><RefreshCw className={styles.spinning} /><span>正在讀取即時資料</span></div> : null}

          {!loading && view === 'decisions' ? (
            <>
              <div className={styles.sectionHeading}>
                <div><span>SKYNET CANDIDATES</span><h1>今日飆股候選</h1><p>只看天網模型跑出的候選；自選、持倉與戰報文字不進排行。</p></div>
                <div className={styles.asOf}><Clock3 size={16} />資料時間 {compactTime(data.snipers[0]?.quoteTime || data.snipers[0]?.anchorTime || data.sniperDate)}</div>
              </div>
              <div className={styles.metrics}>
                <MetricCard label="今日候選" value={String(data.snipers.length)} note="來自盤中即時雷達" />
                <MetricCard label="待確認" value={String(pendingCount)} note="追蹤或忽略" tone={pendingCount ? 'red' : 'green'} />
                <MetricCard label="今日平均訊號分" value={data.snipers.length ? `${(data.snipers.reduce((sum, item) => sum + (numeric(item.signalScore ?? item.modelScore ?? item.confidence) || 0), 0) / data.snipers.length).toFixed(0)}/100` : '--'} note="訊號分不是勝率" />
                <MetricCard label="已結算樣本" value={String(data.performance.closedTrades ?? 0)} note="未滿樣本不宣稱勝率" />
              </div>

              <div className={styles.decisionGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>候選排行</strong><span>真實盤中模型輸出</span></div><span>{filteredSnipers.length} 筆</span></div>
                  {filteredSnipers.length ? (
                    <div className={styles.proposalList}>
                      {filteredSnipers.map((item) => {
                        const ticker = String(item.ticker || '');
                        const isActive = String(selected?.ticker || '') === ticker;
                        const change = numeric(item.dayChangePct ?? item.changePct);
                        return (
                          <button key={`${ticker}-${item.anchorTime || ''}`} className={isActive ? styles.selectedProposal : ''} onClick={() => setSelectedTicker(ticker)}>
                            <div className={styles.stockIdentity}><strong>{item.name || '--'}</strong><span>{ticker} · {item.theme || '未分類'}</span></div>
                            <div className={styles.priceCell}><strong>{money(item.price)}</strong><span className={(change || 0) >= 0 ? styles.positive : styles.negative}>當日 {percent(change)} · {observationChange(item)}</span></div>
                            <div className={styles.confidence}><span>{money(item.signalScore ?? item.modelScore ?? item.confidence)}/100</span><i><b style={{ width: `${Math.max(0, Math.min(100, numeric(item.signalScore ?? item.modelScore ?? item.confidence) || 0))}%` }} /></i></div>
                            <div className={styles.statusCell}><span>{statusLabel(item, decisions[ticker])}</span><ChevronRight size={17} /></div>
                          </button>
                        );
                      })}
                    </div>
                  ) : <EmptyState title="目前沒有盤中候選" detail="系統不會用自選、持倉或範例股票填滿佇列" />}
                </section>

                <section className={styles.panel}>
                      <div className={styles.panelHeader}><div><strong>候選決策卡</strong><span>成交標記、觸發、防守與驗證</span></div><ShieldCheck size={20} /></div>
                  {selected ? (
                    <div className={styles.proposalDetail}>
                      <div className={styles.detailHero}>
                        <div className={styles.stockBadge}>{String(selected.ticker || '').slice(0, 2)}</div>
                        <div><h2>{selected.name || '--'} <span>{selected.ticker || '--'}</span></h2><p>{selected.theme || '未分類'} · {sourceLabel(selected.source)}</p></div>
                        <span className={styles.watchBadge}>飆股候選</span>
                      </div>
                      <div className={styles.tradeNumbers}>
                        <div><span>現價</span><strong>{money(selected.price)}</strong></div>
                        <div><span>當日漲跌</span><strong className={(numeric(selected.dayChangePct ?? selected.changePct) || 0) >= 0 ? styles.positive : styles.negative}>{percent(selected.dayChangePct ?? selected.changePct)}</strong></div>
                        <div><span>前次觀測</span><strong>{observationChange(selected)}</strong></div>
                        <div><span>首次至今</span><strong>MFE {percent(selected.mfePct)} · MAE {percent(selected.maePct)}</strong></div>
                        <div><span>成交標記</span><strong>{selected.fillStatus === 'FILLED_NEXT_QUOTE' ? `下一筆報價 ${money(selected.entryPrice)}` : selected.fillStatus === 'UNFILLED_LIMIT_UP' ? '漲停未成交' : '等待下一筆報價'}</strong></div>
                        <div><span>進場觸發</span><strong>{money(selected.triggerPrice)}</strong></div>
                        <div><span>止盈參考</span><strong>{money(selected.profit1Price)} (+1%) · {money(selected.profit2Price)} (+2%) · {money(selected.profit3Price)} (+3%)</strong></div>
                        <div><span>防守參考</span><strong className={styles.negative}>{money(selected.stopPrice)} · {percent(selected.stopRiskPct)}</strong></div>
                        <div><span>訊號分</span><strong>{money(selected.firstModelScore)} → {money(selected.signalScore ?? selected.modelScore ?? selected.confidence)}/100（{percent(selected.modelScoreDelta)}）</strong></div>
                        <div><span>追價／交易</span><strong>追價風險 {money(selected.chaseRisk)}/100 · 可交易性 {money(selected.tradabilityScore)}/100</strong></div>
                        <div><span>60 分校準</span><strong>{calibrationLabel(selected)}</strong></div>
                        <div><span>大戶資料</span><strong>{numeric(selected.factorSnapshot?.large400Pct) === null ? '集保週資料累積中' : `400張以上 ${money(selected.factorSnapshot?.large400Pct)}% · 週變化 ${percent(selected.factorSnapshot?.large400Change1wPctPoint)} · ${selected.factorSnapshot?.tdccDate || '--'}`}</strong></div>
                        <div><span>法人資料</span><strong>{selected.factorSnapshot?.institutionStatus === 'ONE_SESSION' ? `外資 ${money((selected.factorSnapshot?.foreignNet || 0) / 1000)}張 · 投信 ${money((selected.factorSnapshot?.trustNet || 0) / 1000)}張 · ${selected.factorSnapshot?.institutionDate || '--'}` : '盤後資料累積中'}</strong></div>
                        <div><span>報價時間</span><strong>{compactTime(selected.quoteTime || selected.anchorTime)} · {numeric(selected.quoteAgeSec) === null ? '延遲未取得' : `延遲 ${Math.round(numeric(selected.quoteAgeSec) || 0)} 秒`}</strong></div>
                      </div>
                      <div className={styles.reasonBox}><span>提案理由</span><p>{selected.note || '來源未提供文字理由，僅保留量價欄位供人工判斷。'}</p></div>
                      <div className={styles.validationList}>
                        <div><Check size={15} /><span>股票代號與即時價格</span><strong>{selected.ticker && numeric(selected.price) !== null ? '通過' : '缺資料'}</strong></div>
                        <div><Check size={15} /><span>觸發價與防守價</span><strong>{numeric(selected.triggerPrice) !== null && numeric(selected.stopPrice) !== null ? '通過' : '缺資料'}</strong></div>
                        <div><ShieldCheck size={15} /><span>券商自動下單</span><strong>永久關閉</strong></div>
                      </div>
                      {decisionError ? <p className={styles.inlineError}>決策紀錄寫入失敗：{decisionError}</p> : null}
                      <div className={styles.decisionActions}>
                        <button className={styles.rejectButton} onClick={() => decide(selected, 'REJECTED')} disabled={decisionBusy === selected.ticker}><X size={17} />剔除候選</button>
                        <button className={styles.approveButton} onClick={() => decide(selected, 'APPROVED')} disabled={decisionBusy === selected.ticker}><Check size={17} />列入追蹤</button>
                      </div>
                      <p className={styles.orderNotice}>主排行只接受天網候選；此處只記錄追蹤決策，不代表買進，也不會送出券商委託。</p>
                    </div>
                  ) : <EmptyState title="選擇一筆提案" detail="查看觸發價、防守價與資料來源" />}
                </section>
              </div>
            </>
          ) : null}

          {!loading && view === 'reports' ? (
            <>
              <div className={styles.sectionHeading}>
                <div><span>DAILY REPORT ARCHIVE</span><h1>每日戰報</h1><p>LINE/TG 外送已停止；控制中心作為主收件匣。左側依日期整理，右側看原文、技術圖卡、查核來源與資料警示。</p></div>
                <div className={styles.asOf}><Clock3 size={16} />更新 {compactTime(reportsData.updatedAt)}</div>
              </div>
              <div className={styles.metrics}>
                <MetricCard label="可查日期" value={String(reportsData.days.length)} note="依戰報快照分組" />
                <MetricCard label="當天訊息" value={String(reportStats.today)} note={selectedReportDate || '尚未選日期'} tone={reportStats.today ? 'green' : 'red'} />
                <MetricCard label="技術圖卡" value={String(reportStats.chartCards)} note="股票代號自動產生圖" />
                <MetricCard label="查核來源" value={String(reportStats.evidence)} note={reportStats.warnings ? `含 ${reportStats.warnings} 則資料警示` : '技術/模型/即時來源'} />
              </div>
              <div className={styles.reportGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>日期樹</strong><span>點日期看當天全部戰報</span></div><BookOpen size={20} /></div>
                  {reportsData.days.length ? (
                    <div className={styles.reportTree}>
                      {reportsData.days.map((day) => {
                        const rows = reportsData.reports.filter((report) => report.date === day);
                        const active = day === selectedReportDate;
                        return (
                          <button key={day} className={active ? styles.activeDay : ''} onClick={() => setSelectedReportDate(day)}>
                            <span>{active ? '▾' : '▸'} {day}</span>
                            <em>{rows.length}</em>
                            <small>{rows[0]?.time || '--'} 最新</small>
                          </button>
                        );
                      })}
                    </div>
                  ) : <EmptyState title="尚無戰報快照" detail="排程產生後會自動出現在這裡" />}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>{selectedReportDate || '未選日期'}</strong><span>收發內容訊息</span></div><button className={styles.smallRefresh} onClick={() => loadData(true)}>重整</button></div>
                  {selectedReports.length ? (
                    <div className={styles.reportMessages}>
                      {selectedReports.map((report, index) => (
                        <article key={`${report.date}-${report.time}-${report.name}-${index}`}>
                          <header>
                            <div><strong>{reportTitle(report.name)}</strong><span>{report.time || '--'} · 控制中心存檔 · {report.status || 'STATUS 未標示'}</span></div>
                            <b>{report.summary || '快照'}</b>
                          </header>
                          <div className={styles.evidenceStrip}>
                            {(report.evidence?.labels?.length ? report.evidence.labels : ['原文快照']).map((label) => <span key={label} className={label.includes('警示') ? styles.warningPill : ''}>{label}</span>)}
                          </div>
                          {report.evidence?.explanationLines?.length ? (
                            <div className={styles.analysisBox}>
                              <strong>技術/來源重點</strong>
                              <ul>{report.evidence.explanationLines.map((line) => <li key={line}>{line}</li>)}</ul>
                            </div>
                          ) : null}
                          {report.charts?.length ? (
                            <div className={styles.chartGrid}>
                              {report.charts.map((chart) => (
                                <figure key={chart.ticker}>
                                  <img src={chart.url} alt={`${chart.ticker} 技術分析圖`} loading="lazy" />
                                  <figcaption>{chart.ticker} 技術圖卡：價格結構、均線、量能、RSI/MACD 輔助判讀</figcaption>
                                </figure>
                              ))}
                            </div>
                          ) : null}
                          <pre>{report.message}</pre>
                        </article>
                      ))}
                    </div>
                  ) : <EmptyState title="當天沒有戰報內容" detail="請切換左側日期或等待下一輪排程寫入" />}
                </section>
              </div>
            </>
          ) : null}

          {!loading && view === 'market' ? (
            <>
              <div className={styles.sectionHeading}><div><span>MARKET DESK</span><h1>今日指揮台</h1><p>直接回答今天看哪個族群、哪幾檔，以及什麼狀況會改變判斷。</p></div><div className={styles.scoreDial}><span>市場分數</span><strong>{numeric(data.alpha.bullScore) ?? '--'}</strong></div></div>
              <div className={styles.marketGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>今天先看</strong><span>盤中雷達族群聚合</span></div><Target size={20} /></div>
                  {sectorRows.length ? <div className={styles.sectorList}>{sectorRows.slice(0, 5).map((row, index) => <div key={row.theme}><em>{index + 1}</em><div><strong>{row.theme}</strong><span>{row.leaders.join('、') || '尚無個股名稱'}</span></div><div><strong>{row.count} 檔</strong><span className={(row.avgChange || 0) >= 0 ? styles.positive : styles.negative}>{percent(row.avgChange)}</span></div></div>)}</div> : <EmptyState title="盤中雷達尚無資料" detail="不以盤前模板代替即時族群" />}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>盤前判斷</strong><span>{data.alpha.date || '時間未提供'}</span></div><Gauge size={20} /></div>
                  <div className={styles.tagBlock}><span>關注族群</span><div>{focusTags.length ? focusTags.map((tag) => <b key={tag}>{tag}</b>) : <i>未提供</i>}</div></div>
                  <div className={styles.tagBlock}><span>避開族群</span><div>{avoidTags.length ? avoidTags.map((tag) => <b className={styles.riskTag} key={tag}>{tag}</b>) : <i>未提供</i>}</div></div>
                  <div className={styles.marketSummary}><span>會影響盤勢的資訊</span><p>{data.alpha.summary || '尚未取得今日市場摘要。'}</p></div>
                </section>
              </div>
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><strong>盤中個股雷達</strong><span>依模型信心排序，不代表委託順序</span></div><Activity size={20} /></div>
                {data.snipers.length ? <div className={styles.radarGrid}>{data.snipers.slice(0, 8).map((item) => <button key={`${item.ticker}-${item.quoteTime || item.anchorTime}`} onClick={() => { setSelectedTicker(String(item.ticker || '')); setView('decisions'); }}><div><strong>{item.name || '--'}</strong><span>{item.ticker} · {item.theme || '未分類'}</span></div><b>{money(item.price)}</b><span className={(numeric(item.dayChangePct ?? item.changePct) || 0) >= 0 ? styles.positive : styles.negative}>當日 {percent(item.dayChangePct ?? item.changePct)}</span><small>觸發 {money(item.triggerPrice)} · 防守 {money(item.stopPrice)}</small></button>)}</div> : <EmptyState title="目前沒有即時候選" detail="等下一次正常排程掃描" />}
              </section>
            </>
          ) : null}

          {!loading && view === 'performance' ? (
            <>
              <div className={styles.sectionHeading}><div><span>TRACK RECORD</span><h1>建議成績追蹤</h1><p>這是候選追蹤，不把未結算訊號包裝成真實交易勝率。</p></div></div>
              <div className={styles.metrics}>
                <MetricCard label="追蹤訊號" value={String(data.performance.totalSignals ?? data.performanceRows.length)} note="歷史候選紀錄" />
                <MetricCard label="已結算" value={String(data.performance.closedTrades ?? 0)} note="可納入正式統計" />
                <MetricCard label="平均報酬" value={percent(data.performance.avgReturn)} note="來源現有摘要" tone={(data.performance.avgReturn || 0) >= 0 ? 'green' : 'red'} />
                <MetricCard label="校準樣本" value={String(data.performance.predictionSamples ?? 0)} note="樣本不足時不宣稱準確率" />
              </div>
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><strong>候選追蹤紀錄</strong><span>最新 50 筆真實資料</span></div><BarChart3 size={20} /></div>
                {data.performanceRows.length ? <div className={styles.tableWrap}><table><thead><tr><th>股票</th><th>選出時間</th><th>選出價</th><th>現價</th><th>追蹤漲幅</th><th>狀態</th><th>選出理由</th></tr></thead><tbody>{data.performanceRows.map((row) => { const change = numeric(row['漲幅%']); return <tr key={`${row.row_number}-${row.代號}`}><td><strong>{row.名稱 || '--'}</strong><span>{row.代號 || '--'}</span></td><td>{row.選出時間 || '--'}</td><td>{money(row.選出價)}</td><td>{money(row.現價)}</td><td className={(change || 0) >= 0 ? styles.positive : styles.negative}>{percent(change)}</td><td>{row.狀態 || '--'}</td><td className={styles.reasonCell}>{row.選出理由 || '--'}</td></tr>; })}</tbody></table></div> : <EmptyState title="尚無追蹤資料" detail="不生成示意績效或假回測曲線" />}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
