'use client';

/**
 * 資金雷達（/radar）— 複刻「股市大佬」App 的資金流向排行頁。
 *
 * 四大分頁：資金集中 / 連買動能 / 法人同步 / 大量異常。
 * 每個分頁打一次 /api/skynet/radar?sort=...，並在前端做篩選、表頭排序、CSV 匯出。
 * 表格採虛擬滾動（只渲染可見區間），資料量 500+ 列仍保持流暢。
 *
 * 資料全部來自真實公開端點；取不到的欄位一律顯示「未入庫」，絕不捏造數字。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Inbox,
  Loader2,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import type { RadarRow, RadarSort } from '@/app/api/skynet/radar/route';
import { useChannelData } from '@/hooks/useChannelData';
import type { ChannelData } from '@/types/channel';
import GodPanel from '@/components/GodPanel';
import styles from './radar.module.css';

/** 固定列高（px），虛擬滾動據此換算可見區間。 */
const ROW_HEIGHT = 44;
/** 可見區間上下各多渲染幾列，避免快速滾動時出現空白。 */
const OVERSCAN = 6;
/** 載入骨架列數。 */
const SKELETON_ROWS = 10;

/** 四大分頁定義。 */
type TabDef = { key: RadarSort; label: string };

const TABS: TabDef[] = [
  { key: 'concentration', label: '資金集中' },
  { key: 'streak', label: '連買動能' },
  { key: 'sync', label: '法人同步' },
  { key: 'volume', label: '大量異常' },
];

/** 各分頁對應的「指標值」欄位標題。 */
const METRIC_LABEL: Record<RadarSort, string> = {
  concentration: '資金集中度',
  streak: '連續買超天數',
  sync: '法人同步買超',
  volume: '成交量異常倍數',
};

/** 可排序欄位。 */
type SortKey = 'symbol' | 'name' | 'metric' | 'changePercent' | 'totalNet';

/** 需要以「遞減」為預設方向的欄位。 */
const NUMERIC_SORT_KEYS: readonly SortKey[] = ['metric', 'changePercent', 'totalNet'];

/** 表頭排序狀態。 */
type TableSort = { key: SortKey; dir: 'asc' | 'desc' };

/** 篩選器選項。 */
type FilterOption = { value: string; label: string };

const MARKET_OPTIONS: FilterOption[] = [
  { value: '上市', label: '上市' },
  { value: '上櫃', label: '上櫃' },
  { value: 'ETF', label: 'ETF' },
];

/** 無市值資料源，以「成交金額」代理（後端已濾除 < 1,000 萬者）。 */
const CAP_OPTIONS: FilterOption[] = [
  { value: 'large', label: '大（≥10 億）' },
  { value: 'mid', label: '中（1~10 億）' },
  { value: 'small', label: '小（1,000 萬~1 億）' },
];

const PRICE_OPTIONS: FilterOption[] = [
  { value: 'lt50', label: '50 以下' },
  { value: '50to200', label: '50-200' },
  { value: 'gt200', label: '200 以上' },
];

/** 台股慣例：紅漲綠跌（深底版本）。 */
const toneClass = (v: number): string => (v > 0 ? styles.up : v < 0 ? styles.down : styles.flat);

/** 取得某列在指定分頁下的「指標值」。 */
function metricValue(row: RadarRow, sort: RadarSort): number | null {
  if (sort === 'concentration') return row.concentration;
  if (sort === 'streak') return row.streakDays;
  if (sort === 'sync') return row.totalNet;
  return row.volumeAnomaly;
}

/** 將指標值格式化為該分頁的顯示文字。 */
function formatMetric(row: RadarRow, sort: RadarSort): string {
  const value = metricValue(row, sort);
  if (value === null) return '未入庫';
  if (sort === 'concentration') return `${(value * 100).toFixed(1)}%`;
  if (sort === 'streak') return `${value.toLocaleString('zh-TW')} 天`;
  if (sort === 'sync') return `${value.toLocaleString('zh-TW')} 張`;
  return `${value.toFixed(1)}%`;
}

/** 張數格式化；null 顯示「未入庫」。 */
function formatLots(value: number | null): string {
  if (value === null) return '未入庫';
  return `${value.toLocaleString('zh-TW')} 張`;
}

/** 帶正負號的百分比。 */
function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** 更新時間（HH:MM）。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

/** CSV 單一儲存格跳脫（含逗號 / 引號 / 換行時加上引號）。 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 比較單一欄位（null 一律排最後）。 */
function compareRows(a: RadarRow, b: RadarRow, tableSort: TableSort, sort: RadarSort): number {
  let av: number | string | null;
  let bv: number | string | null;

  switch (tableSort.key) {
    case 'symbol':
      av = a.symbol;
      bv = b.symbol;
      break;
    case 'name':
      av = a.name;
      bv = b.name;
      break;
    case 'metric':
      av = metricValue(a, sort);
      bv = metricValue(b, sort);
      break;
    case 'changePercent':
      av = a.changePercent;
      bv = b.changePercent;
      break;
    case 'totalNet':
    default:
      av = a.totalNet;
      bv = b.totalNet;
      break;
  }

  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  const cmp =
    typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'zh-TW');

  return tableSort.dir === 'asc' ? cmp : -cmp;
}

/** 多選下拉（即時生效於已載入資料）。 */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const summary =
    selected.length === 0
      ? '全部'
      : options
          .filter((option) => selected.includes(option.value))
          .map((option) => option.label)
          .join('、');

  return (
    <div className={styles.filter} ref={rootRef}>
      <button
        type="button"
        className={styles.filterTrigger}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.filterLabel}>{label}</span>
        <span className={styles.filterValue}>{summary}</span>
        <ChevronDown size={14} className={open ? styles.chevronOpen : styles.chevron} />
      </button>

      {open ? (
        <div className={styles.filterMenu} role="listbox" aria-label={label}>
          {options.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.filterOption} ${active ? styles.filterOptionActive : ''}`}
                onClick={() =>
                  onChange(
                    active
                      ? selected.filter((value) => value !== option.value)
                      : [...selected, option.value],
                  )
                }
              >
                <span className={styles.checkbox}>{active ? <Check size={12} /> : null}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function RadarPage() {
  const router = useRouter();

  const [sort, setSort] = useState<RadarSort>('concentration');
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [tradeDate, setTradeDate] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // 篩選狀態（空陣列 = 不篩選）。
  const [marketFilter, setMarketFilter] = useState<string[]>([]);
  const [capFilter, setCapFilter] = useState<string[]>([]);
  const [priceFilter, setPriceFilter] = useState<string[]>([]);

  // 表頭排序；null = 沿用 API 回傳的自然排序。
  const [tableSort, setTableSort] = useState<TableSort | null>(null);

  // 分點資料源 flag（spec §2-B：false → 誠實「未入庫」；true → 分點有來源）。
  // 分點資料源是「來源層級」可用性（是否接了 FinMind Sponsor），不是逐標的差異，
  // 故以首行代號做探測（資料驅動、不硬編碼）；代號非法時 hook 回 null → 走未入庫分支。
  const channelProbeTicker = rows[0]?.symbol ?? '';
  const channel: ChannelData | null = useChannelData(channelProbeTicker);
  const hasChannelData: boolean = channel?.hasChannelData === true;

  // 虛擬滾動狀態。
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/skynet/radar?sort=${sort}`, { cache: 'no-store' });
      const body = (await res.json()) as {
        rows?: RadarRow[];
        tradeDate?: string;
        fetchedAt?: string;
        error?: string;
      };
      if (!res.ok || !Array.isArray(body.rows)) {
        throw new Error(body?.error ?? 'radar_unavailable');
      }
      setRows(body.rows);
      setTradeDate(body.tradeDate ?? '');
      setFetchedAt(body.fetchedAt ?? '');
    } catch {
      setRows([]);
      setError('資金雷達資料暫時無法取得，請稍後重試。');
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    void load();
  }, [load]);

  // 量測可視高度（供虛擬滾動計算）。
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight || 600);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [error]);

  // 切換分頁 / 排序 / 篩選時回到頂端。
  useEffect(() => {
    setScrollTop(0);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [sort, tableSort, marketFilter, capFilter, priceFilter]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    setTableSort((prev) => {
      if (!prev || prev.key !== key) {
        return { key, dir: NUMERIC_SORT_KEYS.includes(key) ? 'desc' : 'asc' };
      }
      return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
    });
  }, []);

  // 篩選（市值以成交金額代理：成交金額 = 成交張數 × 1000 × 收盤價）。
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (marketFilter.length > 0 && !marketFilter.includes(row.market)) {
        return false;
      }
      if (capFilter.length > 0) {
        const turnover = row.volumeLots * 1000 * row.price;
        const bucket = turnover >= 1e9 ? 'large' : turnover >= 1e8 ? 'mid' : 'small';
        if (!capFilter.includes(bucket)) return false;
      }
      if (priceFilter.length > 0) {
        const price = row.price;
        const bucket = price < 50 ? 'lt50' : price <= 200 ? '50to200' : 'gt200';
        if (!priceFilter.includes(bucket)) return false;
      }
      return true;
    });
  }, [rows, marketFilter, capFilter, priceFilter]);

  // 表頭排序（未指定時沿用 API 自然排序）。
  const displayRows = useMemo(() => {
    if (!tableSort) return filteredRows;
    const copy = [...filteredRows];
    copy.sort((a, b) => compareRows(a, b, tableSort, sort));
    return copy;
  }, [filteredRows, tableSort, sort]);

  // 虛擬滾動可見區間。
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    displayRows.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleRows = displayRows.slice(startIndex, endIndex);
  const padTop = startIndex * ROW_HEIGHT;
  const padBottom = Math.max(0, (displayRows.length - endIndex) * ROW_HEIGHT);

  // CSV 匯出：匯出「當前篩選 + 排序後」的資料。
  const handleExport = useCallback(() => {
    if (displayRows.length === 0 || exporting) return;
    setExporting(true);
    window.setTimeout(() => {
      try {
        const header = ['代號', '名稱', '市場', '指標', '漲跌%', '法人買賣超(張)', '分點'];
        // 分點欄依 hasChannelData 分支（spec §2-B）：false →「未入庫」（誠實）；
        // true → 僅標「有分點來源」（來源層級 flag，非逐標的數字；不補腦、不造分點張數）。
        const branchCell = hasChannelData ? '有分點來源' : '未入庫';
        const lines = displayRows.map((row) => [
          row.symbol,
          row.name,
          row.market,
          formatMetric(row, sort),
          row.changePercent.toFixed(2),
          row.totalNet === null ? '未入庫' : String(row.totalNet),
          branchCell,
        ]);
        // 開頭加 BOM，讓 Excel 正確辨識 UTF-8 中文。
        const csv =
          '\uFEFF' +
          [header, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `資金雷達_${tradeDate || 'unknown'}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    }, 120);
  }, [displayRows, sort, tradeDate, exporting, hasChannelData]);

  const renderSortIcon = (key: SortKey) => {
    const active = tableSort?.key === key;
    const Icon = active && tableSort?.dir === 'asc' ? ArrowUp : ArrowDown;
    return <Icon size={12} className={active ? styles.sortIconActive : styles.sortIcon} />;
  };

  return (
    <div className={styles.radarRoot}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Radar size={18} />
            </span>
            <div className={styles.brandText}>
              <strong>資金雷達</strong>
              <span>四大資金流向排序，找出主力正在佈局的標的</span>
            </div>
          </div>

          <div className={styles.topRight}>
            <div className={styles.meta}>
              <span className={styles.metaDate}>{tradeDate || '—'}</span>
              <span className={styles.metaTime}>
                {fetchedAt ? `更新於 ${formatTime(fetchedAt)}` : '尚未更新'}
              </span>
            </div>
            <button
              type="button"
              className={styles.exportButton}
              onClick={handleExport}
              disabled={exporting || displayRows.length === 0}
            >
              {exporting ? (
                <Loader2 size={15} className={styles.spinning} />
              ) : (
                <Download size={15} />
              )}
              {exporting ? '匯出中…' : '匯出 CSV'}
            </button>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="資金流向排序">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sort === tab.key}
              className={`${styles.tab} ${sort === tab.key ? styles.tabActive : ''}`}
              onClick={() => setSort(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.filterBar}>
          <span className={styles.filterTitle}>
            <SlidersHorizontal size={14} />
            篩選條件
          </span>
          <MultiSelect
            label="市場"
            options={MARKET_OPTIONS}
            selected={marketFilter}
            onChange={setMarketFilter}
          />
          <MultiSelect label="市值" options={CAP_OPTIONS} selected={capFilter} onChange={setCapFilter} />
          <MultiSelect
            label="股價區間"
            options={PRICE_OPTIONS}
            selected={priceFilter}
            onChange={setPriceFilter}
          />
          <span className={styles.filterNote}>
            市值以「成交金額」代理（大 ≥ 10 億、中 1~10 億、小 1,000 萬~1 億）；已濾除成交金額 &lt; 1,000
            萬之標的
          </span>
        </div>

        {error ? (
          <div className={styles.errorBanner} role="alert">
            <TriangleAlert size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>
              <RefreshCw size={13} />
              重新整理
            </button>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <div className={styles.tableInner}>
              <div className={styles.head}>
                <button type="button" className={styles.headCell} onClick={() => toggleSort('symbol')}>
                  代號{renderSortIcon('symbol')}
                </button>
                <button type="button" className={styles.headCell} onClick={() => toggleSort('name')}>
                  名稱{renderSortIcon('name')}
                </button>
                <button type="button" className={styles.headCell} onClick={() => toggleSort('metric')}>
                  {METRIC_LABEL[sort]}
                  {renderSortIcon('metric')}
                </button>
                <button
                  type="button"
                  className={styles.headCell}
                  onClick={() => toggleSort('changePercent')}
                >
                  漲跌{renderSortIcon('changePercent')}
                </button>
                <button type="button" className={styles.headCell} onClick={() => toggleSort('totalNet')}>
                  法人{renderSortIcon('totalNet')}
                </button>
                <div className={styles.headCellStatic}>分點</div>
              </div>

              <div className={styles.body} ref={bodyRef} onScroll={handleScroll}>
                {loading ? (
                  Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                    <div key={`skeleton-${index}`} className={styles.skeletonRow} aria-hidden="true">
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <span key={cell} className={styles.skeletonBar} />
                      ))}
                    </div>
                  ))
                ) : displayRows.length === 0 ? (
                  <div className={styles.empty}>
                    <Inbox size={26} />
                    <strong>暫無資料</strong>
                    <span>目前沒有符合篩選條件的標的，請調整篩選條件或稍後重試。</span>
                  </div>
                ) : (
                  <>
                    <div style={{ height: padTop }} aria-hidden="true" />
                    {visibleRows.map((row, index) => {
                      const absoluteIndex = startIndex + index;
                      return (
                        <div
                          key={row.symbol}
                          className={`${styles.row} ${absoluteIndex % 2 === 1 ? styles.rowEven : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(`/s/${row.symbol}`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              router.push(`/s/${row.symbol}`);
                            }
                          }}
                        >
                          <span className={`${styles.cell} ${styles.code}`}>{row.symbol}</span>
                          <span className={`${styles.cell} ${styles.name}`}>{row.name}</span>
                          <span className={`${styles.cell} ${styles.metric}`}>
                            {formatMetric(row, sort)}
                          </span>
                          <span className={`${styles.cell} ${toneClass(row.changePercent)}`}>
                            {formatSignedPercent(row.changePercent)}
                          </span>
                          <span
                            className={`${styles.cell} ${
                              row.totalNet === null ? styles.flat : toneClass(row.totalNet)
                            }`}
                          >
                            {formatLots(row.totalNet)}
                          </span>
                          {/* 分點欄依 hasChannelData 分支（spec §2-B）：true → 標「有分點來源」（來源層級 flag）；
                              false/未載入 → 誠實「未入庫」。現況無免費分點資料源，恆走「未入庫」。 */}
                          {hasChannelData ? (
                            <span className={`${styles.cell} ${styles.branch}`}>有分點來源</span>
                          ) : (
                            <span className={`${styles.cell} ${styles.branch}`}>未入庫</span>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ height: padBottom }} aria-hidden="true" />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        <GodPanel endpoint="radar" />
      </div>

      {/*
        底部功能列不在本頁渲染 —— src/app/layout.tsx:51 已全域掛載唯一一份 <AppTabBar />，
        且其 TAB_BAR_PREFIXES 已包含 '/radar'。/diary、/review、/chart、/ai 也都是依賴那一份。
        若本頁再渲染一次，畫面上會出現兩條重疊的底部列。
      */}
    </div>
  );
}
