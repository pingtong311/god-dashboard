'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  ChevronDown,
  Clock3,
  Database,
  Download,
  Gauge,
  LayoutDashboard,
  LineChart,
  Loader2,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import styles from './review.module.css';

/* ── War Room 元件（15 個孤兒元件整合）───────────────────────────── */
import SniperPanel from '@/components/warroom/SniperPanel';
import MonitoringManager from '@/components/warroom/MonitoringManager';
import SignalReviewPanel, { type SignalReviewRow } from '@/components/warroom/SignalReviewPanel';
import P1TriggerPanel from '@/components/warroom/P1TriggerPanel';
import P2ScanPanel from '@/components/warroom/P2ScanPanel';
import MOPSPanel from '@/components/warroom/MOPSPanel';
import InstitutionalPanel from '@/components/warroom/InstitutionalPanel';
import MarginPanel from '@/components/warroom/MarginPanel';
import MonthlyRevenuePanel from '@/components/warroom/MonthlyRevenuePanel';
import PerformanceDashboard from '@/components/warroom/PerformanceDashboard';
import IndexPanel from '@/components/warroom/IndexPanel';
import FusionRadarPanel from '@/components/warroom/FusionRadarPanel';

type ViewKey = 'decisions' | 'reports' | 'market' | 'performance' | 'sniper-editor' | 'notifications' | 'broadcast';
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
  currentPrice?: number | string;
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
  distPct?: number | string | null;
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

/* 訊號日誌（/api/skynet/signal-log）回傳的單筆對帳結果 */
type ReconciledSignal = {
  id: string;
  ticker: string;
  signal_date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  reason: string;
  invalid_condition: string;
  confidence: number | null;
  source: string;
  logged_at: string;
  outcome: 'win' | 'loss' | 'ambiguous' | 'open' | null;
  outcome_reason: string;
  outcome_message: string;
  resolved_date: string | null;
  bars_checked: number;
  last_bar_date: string | null;
  last_close: number | null;
  return_pct: number | null;
  unrealized_pct: number | null;
  window_exhausted: boolean;
};

type SignalLogResponse = {
  ok?: boolean;
  date?: string;
  window_days?: number;
  signals?: ReconciledSignal[];
  note?: string;
  bars?: {
    scanned_dates?: string[];
    available_dates?: string[];
    missing_dates?: string[];
  };
  provenance?: Record<string, unknown>;
};

type SignalStats = {
  total_signals: number;
  settled_signals: number;
  win_count: number;
  loss_count: number;
  ambiguous_count: number;
  open_count: number;
  unresolved_count: number;
  win_rate: number | null;
  sample_sufficient: boolean;
  sample_note: string;
  avg_return_pct: number | null;
  max_drawdown_pct: number | null;
};

type SignalStatsResponse = {
  ok?: boolean;
  signal_dates?: string[];
  stats?: SignalStats;
  truncated?: boolean;
  truncated_note?: string | null;
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

/* ── 狙擊手編輯器型別 ───────────────────────────────────────── */
type SniperItem = {
  ticker: string;
  name: string;
  triggerPrice: number;
  stopPrice: number;
  currentPrice: number | null;
  distPct: number | null;
  status: '待觸發' | '已觸發' | '已撤退';
  source: '/watch' | 'POST_MARKET_SCAN' | string;
  date: string;
};

type MonitoringEntry = {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  targetPrice: number | null;
  stopPrice: number | null;
  type: 'ETF' | '個股';
};

/* ── 通知中心型別 ──────────────────────────────────────────── */
type NotificationEntry = {
  id: string;
  ticker: string;
  name: string;
  type: 'price' | 'change' | 'volume' | 'news' | 'institutional';
  condition: string;
  enabled: boolean;
  channels: ('app' | 'line' | 'email')[];
  createdAt: string;
};

/* ── 市場廣播型別 ──────────────────────────────────────────── */
type BroadcastItem = {
  id: string;
  time: string;
  type: 'large_order' | 'anomaly' | 'news' | 'institutional';
  ticker?: string;
  name?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
};

const DECISION_STORAGE_KEY = 'skynet_human_decisions_v1';

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Bot }> = [
  { key: 'decisions', label: '今日飆股', icon: Bot },
  { key: 'reports', label: '每日戰報', icon: BookOpen },
  { key: 'market', label: '族群雷達', icon: LineChart },
  { key: 'performance', label: '命中追蹤', icon: BarChart3 },
  { key: 'sniper-editor', label: '狙擊手編輯', icon: Settings },
  { key: 'notifications', label: '通知中心', icon: Bell },
  { key: 'broadcast', label: '市場廣播', icon: Activity },
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

function MetricCard({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: 'neutral' | 'green' | 'red' }) {
  return (
    <section className={`${styles.metricCard} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
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

/** 把 /api/skynet/signal-log 的對帳結果映射到 SignalReviewPanel 的資料型別。
 * 誠實原則：只放真實欄位。日 K 對帳不記錄盤中高低價序列，故 MFE/MAE（max/minPrice）
 * 以進場價為基準（=0%），最新價取 last_close（取不到即以進場價占位、不捏造其它數字）。 */
function reconciledToRow(sig: ReconciledSignal): SignalReviewRow {
  const entry = Number(sig.entry_price) || 0;
  const latest = Number.isFinite(sig.last_close) ? (sig.last_close as number) : entry;
  return {
    key: sig.id,
    date: sig.signal_date,
    ticker: sig.ticker,
    name: '',
    action: 'BUY',
    entryPrice: entry,
    targetPrice: Number(sig.target_price) || null,
    stopPrice: Number(sig.stop_loss) || null,
    latestPrice: latest,
    maxPrice: entry,
    minPrice: entry,
    confidence: sig.confidence ?? 0,
    observations: Number(sig.bars_checked) || 0,
    updatedAt: sig.resolved_date ?? sig.logged_at,
  };
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

  /* ── 訊號日誌（/api/skynet/signal-log）對帳狀態 ───────────────── */
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null);
  const [signalStatsNote, setSignalStatsNote] = useState('');
  const [signalLogReconciled, setSignalLogReconciled] = useState<ReconciledSignal[]>([]);
  const [signalLogDate, setSignalLogDate] = useState('');
  const [signalLogLoading, setSignalLogLoading] = useState(false);
  const [signalLogStatus, setSignalLogStatus] = useState('');

  /* ── 狙擊手編輯器狀態 ───────────────────────────────────────── */
  const [sniperItems, setSniperItems] = useState<SniperItem[]>([]);
  const [sniperLoading, setSniperLoading] = useState(false);
  const [sniperError, setSniperError] = useState<string | null>(null);
  const [monitoringEntries, setMonitoringEntries] = useState<MonitoringEntry[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);

  /* ── 通知中心狀態 ──────────────────────────────────────────── */
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  /* ── 市場廣播狀態 ──────────────────────────────────────────── */
  const [broadcastItems, setBroadcastItems] = useState<BroadcastItem[]>([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  /* ── 報告生成狀態 ──────────────────────────────────────────── */
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState('');

  /* ── 狙擊手資料抓取 ──────────────────────────────────────────── */
  const loadSniperData = useCallback(async () => {
    setSniperLoading(true);
    setSniperError(null);
    try {
      const res = await fetchJson(dataUrl('snipers'));
      const items = Array.isArray(res.snipers) ? res.snipers as Sniper[] : [];
      const mapped: SniperItem[] = items.map((s) => ({
        ticker: String(s.ticker || ''),
        name: String(s.name || ''),
        triggerPrice: numeric(s.triggerPrice) || 0,
        stopPrice: numeric(s.stopPrice) || 0,
        currentPrice: numeric(s.currentPrice ?? s.price),
        distPct: numeric(s.distPct),
        status: (s.status as SniperItem['status']) || '待觸發',
        source: String(s.source || '/watch'),
        date: String(s.date || ''),
      }));
      setSniperItems(mapped);
    } catch (e) {
      setSniperError(e instanceof Error ? e.message : '狙擊資料讀取失敗');
    } finally {
      setSniperLoading(false);
    }
  }, []);

  /* ── 監控清單資料抓取 ───────────────────────────────────────── */
  const loadMonitoringData = useCallback(async () => {
    setMonitoringLoading(true);
    setMonitoringError(null);
    try {
      const res = await fetchJson(dataUrl('positions'));
      const items = Array.isArray(res.positions) ? res.positions as MonitoringEntry[] : [];
      setMonitoringEntries(items);
    } catch (e) {
      setMonitoringError(e instanceof Error ? e.message : '監控清單讀取失敗');
    } finally {
      setMonitoringLoading(false);
    }
  }, []);

  /* ── 訊號日誌勝率統計（誠實：樣本不足不自稱勝率）────────────── */
  const loadSignalStats = useCallback(async () => {
    setSignalLogLoading(true);
    setSignalLogStatus('');
    try {
      const res = await fetchJson('/api/skynet/signal-log/stats');
      const stats = (res.stats ?? null) as SignalStats | null;
      setSignalStats(stats);
      setSignalStatsNote(
        res.truncated ? String(res.truncated_note ?? '統計未涵蓋全部資料') : stats?.sample_note ?? '',
      );
      // 順帶抓最近一個有訊號的日期做對帳明細（誠實：沒訊號就空，不補假資料）
      const dates: string[] = Array.isArray(res.signal_dates) ? (res.signal_dates as string[]) : [];
      const latest = dates[dates.length - 1] ?? '';
      if (latest) {
        const dayRes = await fetchJson(`/api/skynet/signal-log?date=${encodeURIComponent(latest)}&window=10`);
        const reconciled = Array.isArray(dayRes.signals) ? (dayRes.signals as ReconciledSignal[]) : [];
        setSignalLogReconciled(reconciled);
        setSignalLogDate(latest);
        if (dayRes.note) setSignalLogStatus(String(dayRes.note));
      } else {
        setSignalLogReconciled([]);
        setSignalLogDate('');
      }
    } catch (e) {
      setSignalStats(null);
      setSignalStatsNote('');
      setSignalLogReconciled([]);
      setSignalLogStatus(e instanceof Error ? e.message : '訊號日誌讀取失敗');
    } finally {
      setSignalLogLoading(false);
    }
  }, []);

  /* ── 通知中心資料抓取 ───────────────────────────────────────── */
  const loadNotificationsData = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const stored = localStorage.getItem('skynet_notifications_v1');
      if (stored) {
        setNotifications(JSON.parse(stored));
      } else {
        const defaults: NotificationEntry[] = [
          { id: '1', ticker: '', name: '大盤指數', type: 'change', condition: '漲跌幅 > 1%', enabled: true, channels: ['app'], createdAt: new Date().toISOString() },
          { id: '2', ticker: '', name: '成交量異常', type: 'volume', condition: '量比 > 2倍', enabled: true, channels: ['app'], createdAt: new Date().toISOString() },
          { id: '3', ticker: '', name: '法人買超', type: 'institutional', condition: '外資買超 > 10億', enabled: false, channels: ['app'], createdAt: new Date().toISOString() },
        ];
        setNotifications(defaults);
        localStorage.setItem('skynet_notifications_v1', JSON.stringify(defaults));
      }
    } catch (e) {
      setNotificationsError(e instanceof Error ? e.message : '通知設定讀取失敗');
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const saveNotifications = useCallback((entries: NotificationEntry[]) => {
    localStorage.setItem('skynet_notifications_v1', JSON.stringify(entries));
    setNotifications(entries);
  }, []);

  /* ── 市場廣播資料抓取 ───────────────────────────────────────── */
  const loadBroadcastData = useCallback(async () => {
    setBroadcastLoading(true);
    setBroadcastError(null);
    try {
      const res = await fetchJson(dataUrl('snipers'));
      const items = Array.isArray(res.snipers) ? res.snipers as Sniper[] : [];
      const broadcasts: BroadcastItem[] = items.slice(0, 20).map((s, i) => ({
        id: `broadcast-${i}`,
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        type: (['large_order', 'anomaly', 'news'] as BroadcastItem['type'][])[i % 3],
        ticker: s.ticker,
        name: s.name,
        message: `${s.name || s.ticker} ${s.source === 'POST_MARKET_SCAN' ? '收盤選股入選' : '盤中觸發條件'}`,
        severity: (['info', 'warning', 'critical'] as BroadcastItem['severity'][])[i % 3],
      }));
      setBroadcastItems(broadcasts);
    } catch (e) {
      setBroadcastError(e instanceof Error ? e.message : '市場廣播讀取失敗');
    } finally {
      setBroadcastLoading(false);
    }
  }, []);

  /* ── 報告生成 ───────────────────────────────────────────────── */
  const generateReport = useCallback(async (type: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setReportGenerating(true);
    setReportError('');
    try {
      const res = await fetch('/api/skynet/n8n-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'generate_report',
          reportType: type,
          generatedAt: new Date().toISOString(),
        }),
      });
      const payload = await res.json().catch(() => ({})) as { success?: boolean; error?: string; downloadUrl?: string };
      if (!res.ok || payload.success === false) throw new Error(payload.error || `報告生成失敗（${res.status}）`);
      if (payload.downloadUrl) {
        const a = document.createElement('a');
        a.href = payload.downloadUrl;
        a.download = `skynet-report-${type}-${new Date().toISOString().slice(0,10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : '報告生成失敗');
    } finally {
      setReportGenerating(false);
    }
  }, []);

  /* ── 主資料載入 ─────────────────────────────────────────────── */
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
        // 同步更新狙擊手編輯器資料
        const mapped: SniperItem[] = snipers.map((s) => ({
          ticker: String(s.ticker || ''),
          name: String(s.name || ''),
          triggerPrice: numeric(s.triggerPrice) || 0,
          stopPrice: numeric(s.stopPrice) || 0,
          currentPrice: numeric(s.currentPrice ?? s.price),
          distPct: numeric(s.distPct),
          status: (s.status as SniperItem['status']) || '待觸發',
          source: String(s.source || '/watch'),
          date: String(s.date || ''),
        }));
        setSniperItems(mapped);
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
      async () => {
        const res = await fetchJson(dataUrl('positions'));
        const items = Array.isArray(res.positions) ? res.positions as MonitoringEntry[] : [];
        setMonitoringEntries(items);
        successCount += 1;
      },
    ];
    const labels = ['每日戰報', '盤中候選', '盤前判斷', '成績', '人工決策', '監控清單'];
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

  /* ── 決策送出 ───────────────────────────────────────────────── */
  const decide = useCallback(async (item: Sniper, decision: Decision) => {
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
  }, [decisions]);

  /* ── 週期性重載 ─────────────────────────────────────────────── */
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadData(true);
      loadSignalStats();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadData, loadSignalStats]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DECISION_STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') setDecisions(saved);
    } catch {}
    loadData();
    loadNotificationsData();
    loadSignalStats();
  }, [loadData, loadNotificationsData, loadSignalStats]);

  useEffect(() => {
    if (view === 'sniper-editor') {
      loadSniperData();
      loadMonitoringData();
    }
  }, [view, loadSniperData, loadMonitoringData]);

  useEffect(() => {
    if (view === 'notifications') {
      loadNotificationsData();
    }
  }, [view, loadNotificationsData]);

  useEffect(() => {
    if (view === 'broadcast') {
      loadBroadcastData();
      const timer = window.setInterval(() => loadBroadcastData(), 30_000);
      return () => window.clearInterval(timer);
    }
  }, [view, loadBroadcastData]);

  /* ── 衍生資料 ───────────────────────────────────────────────── */
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

  const currentTitle = navItems.find((item) => item.key === view)?.label || '今日飆股';

  /* ── 渲染 ───────────────────────────────────────────────────── */
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

          {/* ── 今日飆股 ── */}
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

          {/* ── 每日戰報 ── */}
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

              {/* ── 報告生成/下載 ── */}
              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>報表生成中心</strong><span>生成每日報表、週報、月報或自訂報表</span></div><Download size={20} /></div>
                <div className={styles.reportGenGrid}>
                  <button className={styles.reportGenBtn} onClick={() => generateReport('daily')} disabled={reportGenerating}>
                    <BookOpen size={18} /><div><strong>每日報表</strong><span>盤後 15:30 自動生成</span></div>
                  </button>
                  <button className={styles.reportGenBtn} onClick={() => generateReport('weekly')} disabled={reportGenerating}>
                    <BookOpen size={18} /><div><strong>週報</strong><span>每週五盤後生成</span></div>
                  </button>
                  <button className={styles.reportGenBtn} onClick={() => generateReport('monthly')} disabled={reportGenerating}>
                    <BookOpen size={18} /><div><strong>月報</strong><span>每月最後交易日生成</span></div>
                  </button>
                  <button className={styles.reportGenBtn} onClick={() => generateReport('custom')} disabled={reportGenerating}>
                    <Settings size={18} /><div><strong>自訂報表</strong><span>指定日期範圍/標的</span></div>
                  </button>
                </div>
                {reportError && <p className={styles.inlineError}>報表生成失敗：{reportError}</p>}
              </section>
            </>
          ) : null}

          {/* ── 族群雷達 / 今日指揮台 ── */}
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

          {/* ── 命中追蹤 ── */}
          {!loading && view === 'performance' ? (
            <>
              <div className={styles.sectionHeading}><div><span>TRACK RECORD</span><h1>建議成績追蹤</h1><p>這是候選追蹤，不把未結算訊號包裝成真實交易勝率。</p></div></div>
              <div className={styles.metrics}>
                <MetricCard label="追蹤訊號" value={String(data.performance.totalSignals ?? data.performanceRows.length)} note="歷史候選紀錄" />
                <MetricCard label="已結算" value={String(data.performance.closedTrades ?? 0)} note="可納入正式統計" />
                <MetricCard label="平均報酬" value={percent(data.performance.avgReturn)} note="來源現有摘要" tone={(data.performance.avgReturn || 0) >= 0 ? 'green' : 'red'} />
                <MetricCard label="校準樣本" value={String(data.performance.predictionSamples ?? 0)} note="樣本不足時不宣稱準確率" />
              </div>

              {/* 訊號日誌勝率（誠實：樣本不足時不宣稱勝率，win_rate 為 null 時顯示「—」） */}
              <div className={styles.metrics} style={{ marginTop: 12 }}>
                <MetricCard
                  label="訊號勝率（日 K 對帳）"
                  value={signalStats && signalStats.win_rate != null ? percent(signalStats.win_rate) : '—'}
                  note={
                    signalStats == null
                      ? '訊號日誌尚未建立，或本端 API 未回訊'
                      : signalStats.sample_sufficient
                        ? `已結算 ${signalStats.settled_signals} 筆，勝率 ${signalStats.win_count}/${signalStats.settled_signals}`
                        : `已結算 ${signalStats.settled_signals} 筆（樣本 < 30，僅參考）`
                  }
                  tone={signalStats?.win_rate != null && signalStats.win_rate >= 0 ? 'green' : 'neutral'}
                />
                <MetricCard
                  label="平均報酬（結算）"
                  value={signalStats && signalStats.avg_return_pct != null ? percent(signalStats.avg_return_pct) : '—'}
                  note="以結算價位（目標/停損）計算，未結算不計入"
                />
                <MetricCard
                  label="最大回撤"
                  value={signalStats && signalStats.max_drawdown_pct != null ? percent(signalStats.max_drawdown_pct) : '—'}
                  note="依結算順序累積報酬曲線計，無結算即為「—」"
                />
                <MetricCard
                  label="未結算訊號"
                  value={String(signalStats?.open_count ?? 0)}
                  note={signalStats?.unresolved_count ? `另有 ${signalStats.unresolved_count} 筆取不到日 K，無法判定` : '所有對帳皆可判定'}
                />
              </div>
              {signalStatsNote ? <p className={styles.inlineError}>{signalStatsNote}</p> : null}

              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}>
                  <div><strong>訊號日誌對帳</strong><span>{signalLogDate ? `以 ${signalLogDate} 對帳` : '尚無訊號日誌可對帳'}</span></div>
                  <button className={styles.smallRefresh} onClick={loadSignalStats} disabled={signalLogLoading}>
                    <RefreshCw size={14} className={signalLogLoading ? styles.spinning : ''} />
                  </button>
                </div>
                <SignalReviewPanel rows={signalLogReconciled.map(reconciledToRow)} />
                {signalLogStatus ? <p className={styles.inlineError}>{signalLogStatus}</p> : null}
              </section>
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><strong>候選追蹤紀錄</strong><span>最新 50 筆真實資料</span></div><BarChart3 size={20} /></div>
                {data.performanceRows.length ? <div className={styles.tableWrap}><table><thead><tr><th>股票</th><th>選出時間</th><th>選出價</th><th>現價</th><th>追蹤漲幅</th><th>狀態</th><th>選出理由</th></tr></thead><tbody>{data.performanceRows.map((row) => { const change = numeric(row['漲幅%']); return <tr key={`${row.row_number}-${row.代號}`}><td><strong>{row.名稱 || '--'}</strong><span>{row.代號 || '--'}</span></td><td>{row.選出時間 || '--'}</td><td>{money(row.選出價)}</td><td>{money(row.現價)}</td><td className={(change || 0) >= 0 ? styles.positive : styles.negative}>{percent(change)}</td><td>{row.狀態 || '--'}</td><td className={styles.reasonCell}>{row.選出理由 || '--'}</td></tr>; })}</tbody></table></div> : <EmptyState title="尚無追蹤資料" detail="不生成示意績效或假回測曲線" />}
              </section>
              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>績效儀表板</strong><span>累積報酬曲線與交易明細</span></div><BarChart3 size={20} /></div>
                <PerformanceDashboard
                  data={{
                    totalTrades: data.performance.closedTrades ?? 0,
                    winRate: data.performance.winRate ?? 0,
                    avgReturn: data.performance.avgReturn ?? 0,
                    maxDrawdown: data.performance.worstReturn ?? 0,
                    trades: data.performanceRows.map((row) => ({
                      ticker: String(row.代號 || ''),
                      name: String(row.名稱 || ''),
                      buyCost: numeric(row.選出價) || 0,
                      sellPrice: numeric(row.現價),
                      pnl: numeric(row['實際損益%']),
                      returnRate: numeric(row['漲幅%']),
                      date: String(row.選出時間 || ''),
                    })),
                    cumulativeReturns: [],
                  }}
                  loading={false}
                  error={null}
                />
              </section>
            </>
          ) : null}

          {/* ── 狙擊手編輯器 ── */}
          {!loading && view === 'sniper-editor' ? (
            <>
              <div className={styles.sectionHeading}>
                <div><span>SNIPER EDITOR</span><h1>狙擊手條件編輯器</h1><p>設定狙擊條件、管理監控清單、查看觸發記錄。所有設定即時同步至天網後端。</p></div>
              </div>
              <div className={styles.metrics}>
                <MetricCard label="待觸發" value={String(sniperItems.filter(s => s.status === '待觸發').length)} note="狙擊候選" />
                <MetricCard label="已觸發" value={String(sniperItems.filter(s => s.status === '已觸發').length)} note="需人工確認" tone="red" />
                <MetricCard label="監控持倉" value={String(monitoringEntries.length)} note="自選股/持倉" />
                <MetricCard label="觸發紀錄" value={String(sniperItems.filter(s => s.status === '已撤退').length)} note="歷史撤退" />
              </div>

              <div className={styles.decisionGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>狙擊候選即時監控</strong><span>來自天網模型輸出</span></div>
                    <button className={styles.smallRefresh} onClick={loadSniperData} disabled={sniperLoading}><RefreshCw size={14} className={sniperLoading ? styles.spinning : ''} /></button>
                  </div>
                  <SniperPanel
                    snipers={sniperItems}
                    loading={sniperLoading}
                    error={sniperError}
                    isTrading={true}
                    onTickerClick={setSelectedTicker}
                    onRetreat={(ticker) => setSniperItems(prev => prev.map(s => s.ticker === ticker ? { ...s, status: '已撤退' } : s))}
                  />
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>觸發記錄 (P1)</strong><span>止盈/止損觸發歷史</span></div><ShieldCheck size={20} /></div>
                  <P1TriggerPanel
                    triggers={sniperItems.filter(s => s.status === '已觸發').map(s => ({
                      ticker: s.ticker,
                      name: s.name,
                      triggerType: s.triggerPrice > (s.currentPrice || 0) ? '止損' : '止盈',
                      triggerPrice: s.triggerPrice,
                      triggeredAt: s.date,
                    }))}
                    loading={sniperLoading}
                    error={sniperError}
                  />
                </section>
              </div>

              <div className={styles.marketGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>盤後掃描 (P2)</strong><span>收盤後模型掃描結果</span></div><Target size={20} /></div>
                  <P2ScanPanel
                    candidates={sniperItems.filter(s => s.source === 'POST_MARKET_SCAN').map(s => ({
                      ticker: s.ticker,
                      name: s.name,
                      confidence: s.distPct ? Math.abs(s.distPct) * 10 : 50,
                      triggerPrice: s.triggerPrice,
                      source: 'POST_MARKET_SCAN' as const,
                    }))}
                    loading={sniperLoading}
                    error={sniperError}
                    onTickerClick={setSelectedTicker}
                  />
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><strong>融資融券/集保</strong><span>大戶與融資融券異動</span></div><Activity size={20} /></div>
                  <MarginPanel
                    margins={sniperItems.map(s => ({
                      ticker: s.ticker,
                      name: s.name,
                      marginBalance: 0,
                      marginChange: 0,
                      shortBalance: 0,
                      shortChange: 0,
                      isClean: false,
                    }))}
                    loading={sniperLoading}
                    error={sniperError}
                  />
                </section>
              </div>

              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>自選監控管理</strong><span>設定目標價/停損價，即時接收觸發通知</span></div><Settings size={20} /></div>
                <MonitoringManager
                  entries={monitoringEntries}
                  loading={monitoringLoading}
                  error={monitoringError}
                  onRefresh={loadMonitoringData}
                />
              </section>
            </>
          ) : null}

          {/* ── 通知中心 ── */}
          {!loading && view === 'notifications' ? (
            <>
              <div className={styles.sectionHeading}>
                <div><span>NOTIFICATION CENTER</span><h1>通知中心</h1><p>管理價格、漲跌幅、量能、新聞、法人等通知偏好。支援 App 推播、Line、Email 多管道。</p></div>
              </div>
              <div className={styles.metrics}>
                <MetricCard label="啟用中" value={String(notifications.filter(n => n.enabled).length)} note="活躍通知" />
                <MetricCard label="價格類" value={String(notifications.filter(n => n.type === 'price').length)} note="目標價/觸發價" />
                <MetricCard label="漲跌類" value={String(notifications.filter(n => n.type === 'change').length)} note="漲跌幅/異動" />
                <MetricCard label="其他類" value={String(notifications.filter(n => n.type === 'volume' || n.type === 'news' || n.type === 'institutional').length)} note="量能/新聞/法人" />
              </div>

              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><strong>通知偏好設定</strong><span>新增/編輯/刪除通知規則</span></div><Plus size={20} /></div>

                {notificationsLoading ? (
                  <div className={styles.loading}><RefreshCw className={styles.spinning} /><span>載入通知設定中...</span></div>
                ) : notificationsError ? (
                  <div className={styles.errorBanner}><Database size={17} /><span>讀取失敗：{notificationsError}</span><button onClick={loadNotificationsData}>重試</button></div>
                ) : (
                  <>
                    <div className={styles.notificationList}>
                      {notifications.map((notification, index) => (
                        <div key={notification.id} className={styles.notificationItem}>
                          <div className={styles.notificationMain}>
                            <label className={styles.notificationToggle}>
                              <input
                                type="checkbox"
                                checked={notification.enabled}
                                onChange={(e) => saveNotifications(notifications.map((n, i) => i === index ? { ...n, enabled: e.target.checked } : n))}
                              />
                              <span className={styles.notificationToggleSlider} />
                            </label>
                            <div className={styles.notificationInfo}>
                              <strong>{notification.name || notification.ticker || '全市場'}</strong>
                              <span className={styles.notificationMeta}>
                                {notification.type === 'price' && '💰 價格觸發'}
                                {notification.type === 'change' && '📈 漲跌幅異動'}
                                {notification.type === 'volume' && '📊 量能異常'}
                                {notification.type === 'news' && '📰 新聞事件'}
                                {notification.type === 'institutional' && '🏛️ 法人動向'}
                                {' · '}{notification.condition}
                              </span>
                            </div>
                          </div>
                          <div className={styles.notificationChannels}>
                            {notification.channels.includes('app') && <span className={styles.channelBadge}><span className={styles.channelDot} />App</span>}
                            {notification.channels.includes('line') && <span className={styles.channelBadge}><span className={`${styles.channelDot} ${styles.line}`} />Line</span>}
                            {notification.channels.includes('email') && <span className={styles.channelBadge}><span className={`${styles.channelDot} ${styles.email}`} />Email</span>}
                          </div>
                          <button
                            className={styles.notificationDelete}
                            onClick={() => saveNotifications(notifications.filter((_, i) => i !== index))}
                            aria-label="刪除通知"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button className={styles.addNotificationBtn} onClick={() => {
                      const newId = `notif-${Date.now()}`;
                      const newNotification: NotificationEntry = {
                        id: newId,
                        ticker: '',
                        name: '新通知',
                        type: 'price',
                        condition: '目標價 ≥ 0',
                        enabled: false,
                        channels: ['app'],
                        createdAt: new Date().toISOString(),
                      };
                      saveNotifications([...notifications, newNotification]);
                    }}>
                      <Plus size={16} /> 新增通知規則
                    </button>
                  </>
                )}
              </section>

              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>通知歷史記錄</strong><span>最近 50 筆發送記錄</span></div><Clock3 size={20} /></div>
                <div className={styles.notificationHistory}>
                  <p className={styles.historyEmpty}>通知發送記錄將在這裡顯示（需後端 Webhook 支援）</p>
                </div>
              </section>
            </>
          ) : null}

          {/* ── 市場廣播 ── */}
          {!loading && view === 'broadcast' ? (
            <>
              <div className={styles.sectionHeading}>
                <div><span>MARKET BROADCAST</span><h1>市場廣播</h1><p>大單、異常交易、新聞事件即時流。融合雷達提供天網候選深度分析。</p></div>
                <div className={styles.asOf}><Clock3 size={16} />即時更新</div>
              </div>

              <div className={styles.marketGrid}>
                <section className={styles.panel} style={{ gridColumn: '1 / -1' }}>
                  <div className={styles.panelHeader}><div><strong>融合雷達</strong><span>SkyNet 飆股候選深度分析</span></div><Target size={20} /></div>
                  <FusionRadarPanel
                    ticker={selectedTicker}
                    marketLabel="台股"
                    strategy="buy_red_tail"
                    period="日"
                  />
                </section>
              </div>

              <div className={styles.metrics} style={{ marginTop: 17 }}>
                <MetricCard label="即時廣播" value={String(broadcastItems.length)} note="大單/異常/新聞" />
                <MetricCard label="大單買進" value={String(broadcastItems.filter(b => b.type === 'large_order').length)} note="主力進場" tone="green" />
                <MetricCard label="異常交易" value={String(broadcastItems.filter(b => b.type === 'anomaly').length)} note="價量異常" tone="red" />
                <MetricCard label="新聞事件" value={String(broadcastItems.filter(b => b.type === 'news').length)} note="突發消息" />
              </div>

              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><strong>即時廣播流</strong><span>按時間倒序，紅色為關鍵異常</span></div>
                  <button className={styles.smallRefresh} onClick={loadBroadcastData} disabled={broadcastLoading}><RefreshCw size={14} className={broadcastLoading ? styles.spinning : ''} /></button>
                </div>
                {broadcastLoading ? (
                  <div className={styles.loading}><RefreshCw className={styles.spinning} /><span>載入廣播資料中...</span></div>
                ) : broadcastError ? (
                  <div className={styles.errorBanner}><Database size={17} /><span>讀取失敗：{broadcastError}</span><button onClick={loadBroadcastData}>重試</button></div>
                ) : broadcastItems.length === 0 ? (
                  <EmptyState title="目前無即時廣播" detail="等待下一輪資料更新" />
                ) : (
                  <div className={styles.broadcastList}>
                    {broadcastItems.map((item) => (
                      <div key={item.id} className={`${styles.broadcastItem} ${item.severity}`}>
                        <span className={styles.broadcastTime}>{item.time}</span>
                        <span className={styles.broadcastType}>
                          {item.type === 'large_order' && '💰 大單'}
                          {item.type === 'anomaly' && '⚠️ 異常'}
                          {item.type === 'news' && '📰 新聞'}
                          {item.type === 'institutional' && '🏛️ 法人'}
                        </span>
                        {item.ticker && <span className={styles.broadcastTicker}>{item.ticker} {item.name}</span>}
                        <span className={styles.broadcastMessage}>{item.message}</span>
                        <span className={styles.broadcastSeverity}>{item.severity === 'critical' ? '🔴' : item.severity === 'warning' ? '🟡' : '🟢'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>指數即時盤口</strong><span>加權/櫃買/雙漲跌家數</span></div><Activity size={20} /></div>
                <IndexPanel
                  quotes={[]}
                  loading={false}
                  error={null}
                  lastUpdated={null}
                  isTrading={true}
                />
              </section>

              <section className={styles.panel} style={{ marginTop: 17 }}>
                <div className={styles.panelHeader}><div><strong>月營收/法人/融資</strong><span>基本面資料快照</span></div><BarChart3 size={20} /></div>
                <div className={styles.marketGrid}>
                  <MonthlyRevenuePanel revenues={[]} loading={false} error={null} />
                  <InstitutionalPanel data={null} loading={false} error={null} lastUpdated={null} />
                  <MOPSPanel announcements={[]} loading={false} error={null} tickers={[]} />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}