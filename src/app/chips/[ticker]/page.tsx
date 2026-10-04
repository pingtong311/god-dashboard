'use client';

/**
 * 籌碼研究頁 /chips/[ticker]
 * 複刻「股市大佬 TradeBoss」App 的籌碼研究功能（深色主體）。
 *
 * 五個分頁：
 * 1. 分點明細   → 無公開資料源 →「資料未入庫」（絕不捏造分點名稱與張數）
 * 2. 集保級距   → TDCC 集保戶股權分散表（合併為 5 個級距 + 集中度）
 * 3. 三大法人   → TWSE T86 近 N 日歷史（外資／投信／自營商／合計）
 * 4. 融資融券   → TWSE MI_MARGN 近 N 日餘額走勢
 * 5. 關鍵大股東 → 無公開資料源 →「資料未入庫」
 *
 * 資料一律走 /api/skynet/chips 與 /api/skynet/twse，取不到就顯示空狀態。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, Download, RefreshCw, Share2, TrendingUp, Users } from 'lucide-react';
import styles from './chips.module.css';
import { useChannelData } from '@/hooks/useChannelData';
import { useTpxBrokerActivity } from '@/hooks/useTpxBrokerActivity';
import type { ChannelData } from '@/types/channel';

// ── recharts 專用色票 ────────────────────────────────────
// recharts 的 stroke / fill 不吃 CSS 變數，故集中定義實際色碼。
// 對應 theme.css：--gold #c5a059 / --line #3a3558 / --muted #b7c0d4。
const CHART = {
  foreign: '#4a7fd4',
  trust: '#3aa76d',
  dealer: '#d4574a',
  total: '#c5a059',
  grid: '#3a3558',
  axis: '#b7c0d4',
} as const;

// ── 型別 ────────────────────────────────────────────────

interface TWSEItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  tradeDate?: string;
}

interface InstitutionalRow {
  date: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
}

interface MarginRow {
  date: string;
  marginBalance: number;
  shortBalance: number;
  marginRatio: number | null;
}

interface TdccRow {
  level: string;
  holders: number;
  lots: number;
  pct: number;
}

interface ChipsData {
  ticker: string;
  name: string;
  tradeDate: string;
  institutionalHistory: InstitutionalRow[];
  marginHistory: MarginRow[];
  tdcc: TdccRow[] | null;
  concentration: number | null;
  fetchedAt: string;
}

type TabKey = 'branches' | 'tdcc' | 'institutional' | 'margin' | 'holders';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'branches', label: '分點明細' },
  { key: 'tdcc', label: '集保級距' },
  { key: 'institutional', label: '三大法人' },
  { key: 'margin', label: '融資融券' },
  { key: 'holders', label: '關鍵大股東' },
];

const DAY_OPTIONS: number[] = [20, 60, 120];

// ── 格式化工具 ──────────────────────────────────────────

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return Math.round(value).toLocaleString('zh-TW');
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${formatInteger(value)}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** 以「億」為單位（估算市值）。 */
function formatYi(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${(value / 1e8).toFixed(1)} 億`;
}

/** 以「萬」為單位（估算市值）。 */
function formatWan(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${(value / 1e4).toFixed(1)} 萬`;
}

/** 'YYYY-MM-DD' → 'MM/DD'。 */
function toShortDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

/** 匯出 CSV（含 BOM，Excel 開中文不亂碼）。 */
function exportCsv(filename: string, header: string[], rows: Array<Array<string | number>>): void {
  const escape = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [header, ...rows].map((row) => row.map(escape).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── 分點資料分支（spec §2-B）────────────────────────────
// 券商分點逐筆 = FinMind Sponsor-only 付費資料。useChannelData 抓
// /api/skynet/channel?ticker=... 的 hasChannelData flag：
// - false（現況恆定值）→ 誠實「資料未入庫」文案
// - true（日後 FinMind Sponsor 開通）→ 分點分析區塊（現況無資料，只留 skeleton + TODO，不補腦）
// channel === null（載入中／route 回 ok:false／非法代號）一律當「無資料」走未入庫分支。

// ── 主元件 ──────────────────────────────────────────────

export default function ChipsPage() {
  const params = useParams<{ ticker: string }>();
  const router = useRouter();

  const ticker = useMemo(() => {
    const raw = params?.ticker;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value ?? '').trim().toUpperCase();
  }, [params]);

  const [days, setDays] = useState<number>(60);
  const [activeTab, setActiveTab] = useState<TabKey>('branches');
  const [branchSide, setBranchSide] = useState<'buy' | 'sell'>('buy');
  const [quote, setQuote] = useState<TWSEItem | null>(null);
  const [data, setData] = useState<ChipsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // 分點資料源 flag（spec §2-B：false → 誠實「未入庫」；true → 分點分析區塊）
  const channel: ChannelData | null = useChannelData(ticker);

  // 券商分點活躍度（spec §2-D「B3」：TPEX 上櫃分點營業金額彙總 top N，全上櫃不分 ticker；
  // 收盤後批次、僅分點營業金額彙總、非逐股分點買賣）
  const tpxBroker = useTpxBrokerActivity();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toneClass = useCallback(
    (value: number): string => (value > 0 ? styles.up : value < 0 ? styles.down : styles.flat),
    []
  );

  const validTicker = /^\d{4,6}[A-Z]?$/.test(ticker);

  const load = useCallback(
    async (quiet = false) => {
      if (!validTicker) {
        setError('股票代號格式不正確（需為 4~6 位數字，可帶一個字母後綴）');
        setLoading(false);
        return;
      }

      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError('');

      const [chipsResult, quoteResult] = await Promise.allSettled([
        fetch(`/api/skynet/chips?ticker=${encodeURIComponent(ticker)}&days=${days}`).then(async (res) => {
          const body = await res.json();
          if (!res.ok || body?.error) throw new Error(body?.error || 'chips_unavailable');
          return body as ChipsData;
        }),
        fetch(`/api/skynet/twse?tickers=${encodeURIComponent(ticker)}`, { cache: 'no-store' }).then(
          async (res) => {
            const body = await res.json();
            const items: TWSEItem[] = Array.isArray(body?.items) ? body.items : [];
            return items.length > 0 ? items[0] : null;
          }
        ),
      ]);

      if (chipsResult.status === 'fulfilled') {
        setData(chipsResult.value);
      } else {
        setData(null);
        setError('籌碼資料暫時無法取得，請稍後重試。');
      }

      if (quoteResult.status === 'fulfilled') setQuote(quoteResult.value);

      setLoading(false);
      setRefreshing(false);
    },
    [days, ticker, validTicker]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const institutional = data?.institutionalHistory ?? [];
  const marginHistory = data?.marginHistory ?? [];
  const tdcc = data?.tdcc ?? null;
  const displayName = quote?.name || data?.name || '';
  const tradeDate = data?.tradeDate || (quote?.tradeDate
    ? `${quote.tradeDate.slice(0, 4)}-${quote.tradeDate.slice(4, 6)}-${quote.tradeDate.slice(6, 8)}`
    : '');

  /** 估算市值 = 張 × 1000 股 × 現價。 */
  const estimatedValuePerLot = (quote?.price ?? 0) * 1000;

  const latestMargin = marginHistory.length > 0 ? marginHistory[marginHistory.length - 1] : null;

  const chartMargin = useMemo(
    () =>
      marginHistory.map((row) => ({
        date: toShortDate(row.date),
        融資餘額: row.marginBalance,
        融券餘額: row.shortBalance,
      })),
    [marginHistory]
  );

  const chartInstitutional = useMemo(
    () =>
      institutional.map((row) => ({
        date: toShortDate(row.date),
        外資: row.foreignNet,
        投信: row.trustNet,
        自營商: row.dealerNet,
        合計: row.totalNet,
      })),
    [institutional]
  );

  const chartTdcc = useMemo(
    () => (tdcc ?? []).map((row) => ({ name: row.level, 張數: row.lots, 佔比: row.pct })),
    [tdcc]
  );

  // ── 匯出 CSV（依當前分頁） ────────────────────────────

  const handleExport = useCallback(() => {
    if (activeTab === 'institutional') {
      if (institutional.length === 0) return;
      exportCsv(
        `${ticker}_三大法人_近${days}日.csv`,
        ['日期', '外資(張)', '投信(張)', '自營商(張)', '合計(張)'],
        institutional.map((row) => [
          row.date,
          row.foreignNet,
          row.trustNet,
          row.dealerNet,
          row.totalNet,
        ])
      );
      return;
    }
    if (activeTab === 'margin') {
      if (marginHistory.length === 0) return;
      exportCsv(
        `${ticker}_融資融券_近${days}日.csv`,
        ['日期', '融資餘額(張)', '融券餘額(張)', '資券比'],
        marginHistory.map((row) => [
          row.date,
          row.marginBalance,
          row.shortBalance,
          row.marginRatio ?? '',
        ])
      );
      return;
    }
    if (activeTab === 'tdcc') {
      if (!tdcc || tdcc.length === 0) return;
      exportCsv(
        `${ticker}_集保級距.csv`,
        ['級距', '人數', '張數', '佔比(%)'],
        tdcc.map((row) => [row.level, row.holders, row.lots, row.pct])
      );
    }
  }, [activeTab, days, institutional, marginHistory, tdcc, ticker]);

  const canExport =
    (activeTab === 'institutional' && institutional.length > 0) ||
    (activeTab === 'margin' && marginHistory.length > 0) ||
    (activeTab === 'tdcc' && !!tdcc && tdcc.length > 0);

  // ── 渲染 ──────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* 頁首 */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="返回上一頁"
          >
            <ChevronLeft size={20} />
          </button>
          <div className={styles.headerTitle}>
            <h1 className={styles.title}>籌碼研究</h1>
            <div className={styles.subTitle}>
              <span className={styles.tickerCode}>{ticker || '--'}</span>
              {displayName ? <span className={styles.stockName}>{displayName}</span> : null}
            </div>
          </div>
          <div className={styles.headerMeta}>
            {tradeDate ? <span>資料日 {tradeDate}</span> : <span>資料日 --</span>}
          </div>
        </div>

        {/* 即時報價 */}
        <div className={styles.quoteRow}>
          {quote && quote.price > 0 ? (
            <>
              <span className={`${styles.quotePrice} ${toneClass(quote.change)}`}>
                {formatNumber(quote.price)}
              </span>
              <span className={`${styles.quoteChange} ${toneClass(quote.change)}`}>
                {formatSigned(quote.change)} ({formatPercent(quote.changePercent)})
              </span>
              <span className={styles.quoteVolume}>
                量 {formatInteger(quote.volume)} 張
              </span>
            </>
          ) : (
            <span className={styles.quoteMuted}>即時報價暫無資料</span>
          )}
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="重新整理籌碼資料"
          >
            <RefreshCw size={15} className={refreshing ? styles.spinning : ''} />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {/* 日期範圍選擇器 */}
        <div className={styles.rangeRow} role="group" aria-label="日期範圍">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.rangeButton} ${days === option ? styles.rangeActive : ''}`}
              onClick={() => setDays(option)}
            >
              近 {option} 日
            </button>
          ))}
          <button
            type="button"
            className={styles.exportButton}
            onClick={handleExport}
            disabled={!canExport}
          >
            <Download size={14} />
            匯出 CSV
          </button>
        </div>

        {/* 錯誤橫幅 */}
        {error ? (
          <div className={styles.errorBanner}>
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>
              重新整理
            </button>
          </div>
        ) : null}

        {/* 分頁切換 */}
        <nav className={styles.tabBar} aria-label="籌碼資料分頁">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 載入中骨架 */}
        {loading ? (
          <div className={styles.skeletonWrap}>
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
        ) : null}

        {!loading ? (
          <>
            {/* ── 分點明細 ─────────────────────────────── */}
            {activeTab === 'branches' ? (
              <section className={styles.section} aria-label="分點明細">
                <h2 className={styles.sectionTitle}>分點明細</h2>
                <div className={styles.subTabRow}>
                  <button
                    type="button"
                    className={`${styles.subTab} ${branchSide === 'buy' ? styles.subTabActive : ''}`}
                    onClick={() => setBranchSide('buy')}
                  >
                    買超前 20
                  </button>
                  <button
                    type="button"
                    className={`${styles.subTab} ${branchSide === 'sell' ? styles.subTabActive : ''}`}
                    onClick={() => setBranchSide('sell')}
                  >
                    賣超前 20
                  </button>
                </div>
                {/* 依 hasChannelData 分支（spec §2-B）：false/未載入 → 誠實「未入庫」；true → 分點分析區塊 */}
                {channel?.hasChannelData === true ? (
                  // TODO(channel-data)：FinMind Sponsor 開通後，在此依 channel.source / channel.asOfDate
                  // 渲染分點逐筆表（分點名、買張、賣張、買賣超），資料由 /api/skynet/channel 回傳；
                  // 現況無真資料，先留 skeleton，絕不補腦、不造假分點名稱與張數。
                  <div className={styles.chartSkeleton} aria-busy="true" />
                ) : (
                  <div className={styles.emptyState}>
                    <Share2 size={26} />
                    <div className={styles.emptyTitle}>資料未入庫</div>
                    <div className={styles.emptyDesc}>
                      券商分點逐筆為付費資料源（FinMind Sponsor），目前未接。
                    </div>
                  </div>
                )}

                {/* 券商分點活躍度小卡（spec §2-D「B3」：TPEX 上櫃分點營業金額彙總 top N）
                    ⚠ 誠實定位：全上櫃市場分點彙總（不分 ticker）、收盤後批次、僅分點營業金額彙總，
                    非逐股分點買賣；渲染前顯示在上方「未入庫」提示下方，補上「籌碼背景濾網」視角。 */}
                <div className={styles.brokerCard}>
                  <div className={styles.brokerCardHead}>
                    <span className={styles.brokerCardTitle}>券商分點活躍度（TPEX 上櫃）</span>
                    {tpxBroker?.asOfDate ? (
                      <span className={styles.brokerCardDate}>收盤 {tpxBroker.asOfDate}</span>
                    ) : null}
                  </div>

                  {tpxBroker === null ? (
                    <div className={styles.brokerEmpty}>資料未入庫（TPEX 分點營業金額彙總暫無資料）</div>
                  ) : tpxBroker.hasBrokerActivity && tpxBroker.topBrokers.length > 0 ? (
                    <>
                      <table className={styles.brokerTable}>
                        <thead>
                          <tr>
                            <th>分點</th>
                            <th className={styles.right}>營業金額</th>
                            <th className={styles.right}>當日止占比</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tpxBroker.topBrokers.map((row, idx) => (
                            <tr key={`${row.code || 'x'}-${idx}`}>
                              <td>
                                <span className={styles.num}>{row.code}</span> {row.name}
                              </td>
                              <td className={`${styles.right} ${styles.num}`}>
                                {row.tradingAmount !== null ? formatInteger(row.tradingAmount) : '--'}
                              </td>
                              <td className={`${styles.right} ${styles.num}`}>{row.dayClosingRatio ?? '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className={styles.brokerNote}>
                        {tpxBroker.note}；收盤後批次，非盤中即時。
                      </div>
                    </>
                  ) : (
                    <div className={styles.brokerEmpty}>今日無有效分點營業金額筆數（資料未入庫）</div>
                  )}
                </div>
              </section>
            ) : null}

            {/* ── 集保級距 ─────────────────────────────── */}
            {activeTab === 'tdcc' ? (
              <section className={styles.section} aria-label="集保級距">
                <h2 className={styles.sectionTitle}>集保級距</h2>

                {tdcc && tdcc.length > 0 ? (
                  <>
                    <div className={styles.metricCards}>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>集中度</span>
                        <span className={styles.metricValue}>
                          {data?.concentration !== null && data?.concentration !== undefined
                            ? data.concentration.toFixed(2)
                            : '--'}
                        </span>
                        <span className={styles.metricHint}>1000 張以上持股佔比</span>
                      </div>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>總股東人數</span>
                        <span className={styles.metricValue}>
                          {formatInteger(tdcc.reduce((sum, row) => sum + row.holders, 0))}
                        </span>
                        <span className={styles.metricHint}>各級距人數加總</span>
                      </div>
                    </div>

                    <div className={styles.chartBox}>
                      {mounted ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart
                            data={chartTdcc}
                            layout="vertical"
                            margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
                          >
                            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                            <XAxis
                              type="number"
                              stroke={CHART.axis}
                              tick={{ fill: CHART.axis, fontSize: 12 }}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={86}
                              stroke={CHART.axis}
                              tick={{ fill: CHART.axis, fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                color: 'var(--ink)',
                              }}
                              formatter={(value) => [`${formatInteger(Number(value))} 張`, '張數']}
                            />
                            <Bar dataKey="張數" fill={CHART.total} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.chartSkeleton} />
                      )}
                    </div>

                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>級距</th>
                          <th className={styles.right}>人數</th>
                          <th className={styles.right}>張數</th>
                          <th className={styles.right}>佔比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tdcc.map((row) => (
                          <tr key={row.level}>
                            <td>{row.level}</td>
                            <td className={`${styles.right} ${styles.num}`}>
                              {formatInteger(row.holders)}
                            </td>
                            <td className={`${styles.right} ${styles.num}`}>
                              {formatInteger(row.lots)}
                            </td>
                            <td className={`${styles.right} ${styles.num}`}>{row.pct.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <Users size={26} />
                    <div className={styles.emptyTitle}>資料未入庫</div>
                    <div className={styles.emptyDesc}>
                      TDCC 集保戶股權分散表目前取不到資料（可能非交易日或上游未回應）。
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* ── 三大法人 ─────────────────────────────── */}
            {activeTab === 'institutional' ? (
              <section className={styles.section} aria-label="三大法人">
                <h2 className={styles.sectionTitle}>三大法人（近 {days} 日）</h2>

                {institutional.length > 0 ? (
                  <>
                    <div className={styles.chartBox}>
                      {mounted ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <ComposedChart
                            data={chartInstitutional}
                            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                          >
                            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              stroke={CHART.axis}
                              tick={{ fill: CHART.axis, fontSize: 11 }}
                              minTickGap={20}
                            />
                            <YAxis
                              stroke={CHART.axis}
                              tick={{ fill: CHART.axis, fontSize: 11 }}
                              width={56}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                color: 'var(--ink)',
                              }}
                              formatter={(value) => `${formatSigned(Number(value))} 張`}
                            />
                            <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: 12 }} />
                            <Bar dataKey="合計" fill={CHART.total} opacity={0.35} radius={[3, 3, 0, 0]} />
                            <Line
                              type="monotone"
                              dataKey="外資"
                              stroke={CHART.foreign}
                              dot={false}
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="投信"
                              stroke={CHART.trust}
                              dot={false}
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="自營商"
                              stroke={CHART.dealer}
                              dot={false}
                              strokeWidth={2}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.chartSkeleton} />
                      )}
                    </div>

                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th className={styles.right}>外資</th>
                          <th className={styles.right}>投信</th>
                          <th className={styles.right}>自營商</th>
                          <th className={styles.right}>合計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...institutional].reverse().map((row) => (
                          <tr key={row.date}>
                            <td className={styles.num}>{row.date}</td>
                            <td className={`${styles.right} ${styles.num} ${toneClass(row.foreignNet)}`}>
                              {formatSigned(row.foreignNet)}
                            </td>
                            <td className={`${styles.right} ${styles.num} ${toneClass(row.trustNet)}`}>
                              {formatSigned(row.trustNet)}
                            </td>
                            <td className={`${styles.right} ${styles.num} ${toneClass(row.dealerNet)}`}>
                              {formatSigned(row.dealerNet)}
                            </td>
                            <td className={`${styles.right} ${styles.num} ${toneClass(row.totalNet)}`}>
                              {formatSigned(row.totalNet)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <TrendingUp size={26} />
                    <div className={styles.emptyTitle}>暫無資料</div>
                    <div className={styles.emptyDesc}>
                      TWSE T86 三大法人資料尚未更新或查無此代號。
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* ── 融資融券 ─────────────────────────────── */}
            {activeTab === 'margin' ? (
              <section className={styles.section} aria-label="融資融券">
                <h2 className={styles.sectionTitle}>融資融券（近 {days} 日）</h2>

                {marginHistory.length > 0 && latestMargin ? (
                  <>
                    <div className={styles.metricCards}>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>融資餘額</span>
                        <span className={styles.metricValue}>
                          {estimatedValuePerLot > 0
                            ? formatYi(latestMargin.marginBalance * estimatedValuePerLot)
                            : '--'}
                        </span>
                        <span className={styles.metricHint}>
                          {formatInteger(latestMargin.marginBalance)} 張（估算市值）
                        </span>
                      </div>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>融券餘額</span>
                        <span className={styles.metricValue}>
                          {estimatedValuePerLot > 0
                            ? formatWan(latestMargin.shortBalance * estimatedValuePerLot)
                            : '--'}
                        </span>
                        <span className={styles.metricHint}>
                          {formatInteger(latestMargin.shortBalance)} 張（估算市值）
                        </span>
                      </div>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>資券比</span>
                        <span className={styles.metricValue}>
                          {latestMargin.marginRatio !== null
                            ? latestMargin.marginRatio.toFixed(2)
                            : '--'}
                        </span>
                        <span className={styles.metricHint}>融資餘額 / 融券餘額</span>
                      </div>
                    </div>

                    <div className={styles.chartBox}>
                      {mounted ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart
                            data={chartMargin}
                            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                          >
                            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              stroke={CHART.axis}
                              tick={{ fill: CHART.axis, fontSize: 11 }}
                              minTickGap={20}
                            />
                            <YAxis
                              yAxisId="left"
                              stroke={CHART.foreign}
                              tick={{ fill: CHART.axis, fontSize: 11 }}
                              width={62}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              stroke={CHART.dealer}
                              tick={{ fill: CHART.axis, fontSize: 11 }}
                              width={56}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                color: 'var(--ink)',
                              }}
                              formatter={(value) => `${formatInteger(Number(value))} 張`}
                            />
                            <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: 12 }} />
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="融資餘額"
                              stroke={CHART.foreign}
                              dot={false}
                              strokeWidth={2}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="融券餘額"
                              stroke={CHART.dealer}
                              dot={false}
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.chartSkeleton} />
                      )}
                    </div>

                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th className={styles.right}>融資餘額（張）</th>
                          <th className={styles.right}>融券餘額（張）</th>
                          <th className={styles.right}>資券比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...marginHistory].reverse().map((row) => (
                          <tr key={row.date}>
                            <td className={styles.num}>{row.date}</td>
                            <td className={`${styles.right} ${styles.num}`}>
                              {formatInteger(row.marginBalance)}
                            </td>
                            <td className={`${styles.right} ${styles.num}`}>
                              {formatInteger(row.shortBalance)}
                            </td>
                            <td className={`${styles.right} ${styles.num}`}>
                              {row.marginRatio !== null ? row.marginRatio.toFixed(2) : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <TrendingUp size={26} />
                    <div className={styles.emptyTitle}>暫無資料</div>
                    <div className={styles.emptyDesc}>
                      TWSE MI_MARGN 融資融券資料尚未更新或查無此代號。
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* ── 關鍵大股東 ───────────────────────────── */}
            {activeTab === 'holders' ? (
              <section className={styles.section} aria-label="關鍵大股東">
                <h2 className={styles.sectionTitle}>關鍵大股東</h2>
                {/* 依 hasChannelData 分支（spec §2-B）：分點/大股東同源（付費資料源），false/未載入 → 誠實「未入庫」 */}
                {channel?.hasChannelData === true ? (
                  // TODO(channel-data)：FinMind Sponsor 開通後，在此渲染關鍵大股東/千張大戶明細；
                  // 現況無真資料，先留 skeleton，絕不補腦、不造假持股比例。
                  <div className={styles.chartSkeleton} aria-busy="true" />
                ) : (
                  <div className={styles.emptyState}>
                    <Users size={26} />
                    <div className={styles.emptyTitle}>資料未入庫</div>
                    <div className={styles.emptyDesc}>
                      董監持股比例與千張大戶變動需付費或申報明細資料源，目前未接。
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* 交叉連結 */}
            <div className={styles.crossLinks}>
              <Link href={`/s/${ticker}`} className={styles.crossLink}>
                個股盤後研究 →
              </Link>
              <Link href={`/chart?ticker=${ticker}`} className={styles.crossLink}>
                看 K 線圖 →
              </Link>
            </div>

            <p className={styles.footerNote}>
              資料來源：TWSE T86 / MI_MARGN、TDCC 集保戶股權分散表（公開資料）。僅供研究參考，不構成投資建議。
            </p>
          </>
        ) : null}
      </div>

      {/*
        底部功能列不在本頁渲染 —— src/app/layout.tsx:51 已全域掛載唯一一份 <AppTabBar />，
        且其 TAB_BAR_PREFIXES 已包含 '/chips'。/diary、/review、/chart、/ai 也都是依賴那一份。
        若本頁再渲染一次，畫面上會出現兩條重疊的底部列。
      */}
    </div>
  );
}
