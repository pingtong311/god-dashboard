'use client';

/**
 * 看盤日記首頁（複刻「股市大佬」App 首頁，P0 前三塊）
 *
 * 1. 盤前資訊卡：加權指數 / 櫃買指數 / 漲跌家數 / 全市場成交金額
 * 2. 今日精選：日期摘要列
 * 3. 三欄焦點：今日強股 / 法人買超 / 產業焦點（皆為真資料；產業焦點取自 MI_INDEX tables[0] 類股指數）
 *
 * 指數資料刻意走兩支來源：新 route 提供加權指數收盤（indexClose），
 * 另呼叫既有 /api/skynet/twse 取盤中即時值；有即時值優先，失敗才退回收盤值。
 * 櫃買指數僅有即時來源，取不到時顯示「—」，不可整頁崩潰。
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Clock,
  Flame,
  Layers,
  PieChart,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  CheckCircle,
  Wallet,
  Zap,
  Newspaper,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import type { MarketOverview, TaifexFuturesQuote } from '@/types/market';
import type { ChannelData } from '@/types/channel';
import { useChannelData } from '@/hooks/useChannelData';
import styles from './diary.module.css';
import SectorMap from '@/components/SectorMap';
import Treemap from '@/components/Treemap';

/** /api/skynet/twse 回傳的單筆報價（僅取本頁需要的欄位）。 */
type LiveItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  source?: string;
};

type IndexDisplay = {
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sourceLabel: string;
};

/** 盤中快訊項目（對應 /api/skynet/insights 回傳格式） */
type InsightLog = {
  time: string;
  type: 'ALERT' | 'SCAN' | 'THOUGHT' | 'INIT' | 'ERROR';
  msg: string;
  isAlert?: boolean;
};

/** 成交金額易讀化：620,167,469,587 → '0.62兆'。 */
function formatTurnover(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '--';
  if (amount >= 1e12) return `${(amount / 1e12).toFixed(2)}兆`;
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}億`;
  return `${Math.round(amount).toLocaleString('zh-TW')}元`;
}

function formatPrice(value: number): string {
  return Number.isFinite(value) && value > 0
    ? value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';
}

function formatChange(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** 台股慣例：紅漲綠跌（深底版本）。 */
function toneClass(value: number): string {
  if (value > 0) return styles.up;
  if (value < 0) return styles.down;
  return styles.flat;
}

export default function DiaryPage() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [live, setLive] = useState<LiveItem[]>([]);
  const [futures, setFutures] = useState<TaifexFuturesQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // 即時行情輪詢相關
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, LiveItem>>({});
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 盤中快訊流
  const [newsItems, setNewsItems] = useState<InsightLog[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // 日期切換器相關
  const [tradingDates, setTradingDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  // 下拉重新整理相關
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 分點資料源 flag（spec §2-B）：快捷入口「籌碼研究 → /chips/2330」的分點明細是否已入庫。
  // 探測代號 = 該卡片連結的 target ticker（2330，資料驅動、不硬編碼他牌）；
  // false/未載入 → 卡片誠實標「分點未入庫」；true → 標「分點有來源」。
  const channel: ChannelData | null = useChannelData('2330');
  const hasChannelData: boolean = channel?.hasChannelData === true;

  // 下拉觸發閾值
  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  // 載入交易日清單
  useEffect(() => {
    let cancelled = false;
    async function fetchTradingDates() {
      try {
        const res = await fetch('/api/skynet/trading-dates?count=30', { cache: 'no-store' });
        const body = await res.json();
        if (res.ok && body?.ok && Array.isArray(body.dates)) {
          if (!cancelled) {
            setTradingDates(body.dates);
            setSelectedDate(body.current);
          }
        }
      } catch {
        // 忽略錯誤，使用預設當日
      }
    }
    fetchTradingDates();
    return () => { cancelled = true; };
  }, []);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setDateDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 即時行情輪詢（盤中每 10 秒、盤後每 60 秒）
  useEffect(() => {
    const isMarketHours = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const day = now.getDay(); // 0=週日, 6=週六
      if (day === 0 || day === 6) return false;
      const time = hours * 60 + minutes;
      // 盤中 09:00-13:30
      return time >= 9 * 60 && time <= 13 * 60 + 30;
    };

    const POLL_INTERVAL_MS = isMarketHours() ? 10_000 : 60_000;

    const fetchLive = async () => {
      try {
        const res = await fetch('/api/skynet/twse?tickers=t99,otc:o00,2330,2454,2317', { cache: 'no-store' });
        const body = (await res.json()) as { items?: LiveItem[] };
        if (res.ok && Array.isArray(body?.items)) {
          const priceMap: Record<string, LiveItem> = {};
          body.items.forEach(item => { priceMap[item.symbol] = item; });
          setLivePrices(priceMap);
          setIsLiveConnected(true);
        } else {
          setIsLiveConnected(false);
        }
      } catch {
        setIsLiveConnected(false);
      }
    };

    // 立即執行一次
    void fetchLive();

    pollIntervalRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // 盤中快訊流輪詢（每 30 秒）
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const res = await fetch('/api/skynet/insights', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setNewsItems(data);
      }
    } catch {
      // 靜默失敗
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNews();
    const interval = setInterval(fetchNews, 30_000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const load = useCallback(async (date?: string, quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');

    const dateParam = date ?? selectedDate;
    const url = dateParam
      ? `/api/skynet/market-overview?date=${dateParam.replace(/-/g, '')}&sectorLimit=5`
      : '/api/skynet/market-overview?sectorLimit=5';

    const [overviewResult, liveResult, futuresResult] = await Promise.allSettled([
      fetch(url, { cache: 'no-store' }).then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; data?: MarketOverview; message?: string };
        if (!res.ok || !body?.ok || !body.data) {
          throw new Error(body?.message || 'market overview unavailable');
        }
        return body.data;
      }),
      fetch('/api/skynet/twse?tickers=t99,otc:o00', { cache: 'no-store' }).then(async (res) => {
        const body = (await res.json()) as { items?: LiveItem[] };
        return Array.isArray(body?.items) ? body.items : [];
      }),
      // 台股期近月（TAIFEX OpenAPI EOD 來源；route 端已做 1 小時快取，盤中會顯示前一日收盤日期）
      fetch('/api/skynet/futures', { cache: 'no-store' }).then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; data?: TaifexFuturesQuote; message?: string };
        if (!res.ok || !body?.ok || !body.data) {
          throw new Error(body?.message || 'taifex futures unavailable');
        }
        return body.data;
      }),
    ]);

    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    else setError('大盤資料暫時無法取得，請稍後重試。');

    if (liveResult.status === 'fulfilled') setLive(liveResult.value);

    // 期近月：EOD 來源，讀不到就維持 null，第 3 格顯示占位 '--'，不造假數字。
    if (futuresResult.status === 'fulfilled') setFutures(futuresResult.value);
    else setFutures(null);

    setLoading(false);
    setRefreshing(false);
  }, [selectedDate]);

  // 下拉重新整理觸控處理
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    function onTouchStart(e: TouchEvent) {
      // 只在頁面頂部且未載入/重新整理時啟用
      if (window.scrollY === 0 && !loading && !refreshing) {
        pullStartRef.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (pullStartRef.current === null || !isPulling) return;
      if (window.scrollY > 0) return;

      const delta = e.touches[0].clientY - pullStartRef.current;
      if (delta > 0) {
        e.preventDefault();
        const distance = Math.min(delta * 0.5, MAX_PULL);
        setPullDistance(distance);
      }
    }

    function onTouchEnd() {
      if (pullStartRef.current === null || !isPulling) return;

      const triggered = pullDistance >= PULL_THRESHOLD;
      setPullDistance(0);
      setIsPulling(false);
      pullStartRef.current = null;

      if (triggered) {
        // 觸發重新整理
        void load(undefined, true);
        // 顯示 Toast
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2500);
      }
    }

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      content.removeEventListener('touchstart', onTouchStart);
      content.removeEventListener('touchmove', onTouchMove);
      content.removeEventListener('touchend', onTouchEnd);
    };
  }, [loading, refreshing, pullDistance, load]);

  useEffect(() => {
    void load();
  }, [load]);

  // 當選擇日期改變時重新載入
  useEffect(() => {
    if (selectedDate) {
      void load(selectedDate);
    }
  }, [selectedDate, load]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setDateDropdownOpen(false);
  };

  // 加權指數：優先輪詢即時（t99），其次載入時即時（t99），否則退回收盤值（indexClose）。
  const twsePoll = livePrices['t99'];
  const otcPoll = livePrices['o00'];
  const twseLive = live.find((item) => item.symbol === 't99' && item.price > 0) ?? null;
  const otcLive = live.find((item) => item.symbol === 'o00' && item.price > 0) ?? null;
  const indexClose = overview?.indexClose ?? null;

  const twseIndex: IndexDisplay | null = twsePoll
    ? { name: '加權指數', price: twsePoll.price, change: twsePoll.change, changePercent: twsePoll.changePercent, sourceLabel: '即時' }
    : twseLive
      ? { name: '加權指數', price: twseLive.price, change: twseLive.change, changePercent: twseLive.changePercent, sourceLabel: '即時' }
      : indexClose && indexClose.price > 0
        ? { name: '加權指數', price: indexClose.price, change: indexClose.change, changePercent: indexClose.changePercent, sourceLabel: '收盤' }
        : null;

  const otcIndex: IndexDisplay | null = otcPoll
    ? { name: '櫃買指數', price: otcPoll.price, change: otcPoll.change, changePercent: otcPoll.changePercent, sourceLabel: '即時' }
    : otcLive
      ? { name: '櫃買指數', price: otcLive.price, change: otcLive.change, changePercent: otcLive.changePercent, sourceLabel: '即時' }
      : null;

  // 台股市近月（第 3 格）：TAIFEX OpenAPI EOD 來源，sourceLabel 為「收盤 MM/DD」。
  // 盤中（08:45–13:45）顯示前一日收盤價，因 TAIFEX OpenAPI 為 EOD 來源。
  // 即時行情需 Shioaji VPS（未啟用）或 Fugle 期權方案（現 403）。
  const futuresIndex: IndexDisplay | null =
    futures && typeof futures.lastPrice === 'number' && futures.lastPrice > 0
      ? {
          name: futures.name || '台股期近月',
          price: futures.lastPrice,
          change: futures.change ?? 0,
          changePercent: futures.changePercent ?? 0,
          sourceLabel: futures.sourceLabel,
        }
      : null;

  const breadth = overview?.breadth ?? null;
  const turnoverText = overview ? formatTurnover(overview.turnover.total) : '--';

  return (
    <div className={styles.diaryRoot}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}><Sparkles size={18} /></span>
            <div>
              <strong>看盤日記</strong>
              <span>MARKET DIARY</span>
            </div>
          </div>
          {/* 即時連線狀態指示器 */}
          <div className={styles.liveStatus} aria-live="polite">
            <span className={`${styles.liveDot} ${isLiveConnected ? styles.liveConnected : styles.liveDisconnected}`} />
            <span className={styles.liveText}>{isLiveConnected ? '即時連線中' : '連線中斷'}</span>
          </div>
          {/* 日期切換下拉選單 */}
          <div className={styles.dateDropdown} ref={dateDropdownRef}>
            <button
              className={styles.dateTrigger}
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              aria-expanded={dateDropdownOpen}
              aria-haspopup="listbox"
              aria-label={`選擇交易日，目前為 ${selectedDate || '今日'}`}
            >
              <span className={styles.dateLabel}>{selectedDate || '今日'}</span>
              <ChevronDown size={14} className={`${styles.chevron} ${dateDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
            {dateDropdownOpen && (
              <ul className={styles.dateList} role="listbox" aria-label="交易日清單">
                {tradingDates.map((date) => (
                  <li key={date} role="option" aria-selected={date === selectedDate}>
                    <button
                      className={`${styles.dateOption} ${date === selectedDate ? styles.dateOptionSelected : ''}`}
                      onClick={() => handleDateSelect(date)}
                    >
                      {date}
                    </button>
                  </li>
                ))}
                {tradingDates.length === 0 && (
                  <li className={styles.dateOptionEmpty}>載入中…</li>
                )}
              </ul>
            )}
          </div>
          <button
            className={styles.iconButton}
            onClick={() => load(undefined, true)}
            disabled={refreshing}
            aria-label="重新整理大盤資訊"
          >
            <RefreshCw size={17} className={refreshing ? styles.spinning : ''} />
          </button>
        </header>

        {/* 下拉重新整理指示器 */}
        {isPulling && pullDistance > 0 && (
          <div className={styles.pullIndicator} style={{ height: pullDistance }} aria-hidden="true">
            <div className={styles.pullContent}>
              <RefreshCw
                size={20}
                className={`${styles.pullIcon} ${pullDistance >= PULL_THRESHOLD ? styles.pullIconReady : ''}`}
              />
              <span className={styles.pullText}>
                {pullDistance >= PULL_THRESHOLD ? '鬆開以重新整理' : '下拉以重新整理'}
              </span>
            </div>
          </div>
        )}

        <div className={styles.content} ref={contentRef}>
          {error ? (
            <div className={styles.errorBanner}>
              <span>{error}</span>
              <button onClick={() => load()}>重試</button>
            </div>
          ) : null}

          {loading ? (
            <div className={styles.loading}>
              <RefreshCw className={styles.spinning} />
              <span>正在讀取大盤資訊</span>
            </div>
          ) : null}

          {!loading ? (
            <>
              {/* 1. 盤前資訊卡 */}
              <section className={styles.preCard}>
                <div className={styles.preHeader}>
                  <div>
                    <span className={styles.kicker}>盤前資訊</span>
                    <h1>台股大盤總覽</h1>
                  </div>
                  <span className={styles.updateNote}><Clock size={13} />下次更新：次一交易日 21:30</span>
                </div>

                <div className={styles.indexRow}>
                  <div className={styles.indexCell}>
                    <span>{twseIndex?.name ?? '加權指數'}</span>
                    <strong className={twseIndex ? toneClass(twseIndex.change) : styles.flat}>
                      {twseIndex ? formatPrice(twseIndex.price) : '—'}
                    </strong>
                    <em className={twseIndex ? toneClass(twseIndex.change) : styles.flat}>
                      {twseIndex
                        ? `${formatChange(twseIndex.change)} (${formatPercent(twseIndex.changePercent)})`
                        : '—'}
                      {twseIndex ? <i>{twseIndex.sourceLabel}</i> : null}
                    </em>
                  </div>
                  <div className={styles.indexCell}>
                    <span>{otcIndex?.name ?? '櫃買指數'}</span>
                    <strong className={otcIndex ? toneClass(otcIndex.change) : styles.flat}>
                      {otcIndex ? formatPrice(otcIndex.price) : '—'}
                    </strong>
                    <em className={otcIndex ? toneClass(otcIndex.change) : styles.flat}>
                      {otcIndex
                        ? `${formatChange(otcIndex.change)} (${formatPercent(otcIndex.changePercent)})`
                        : '—'}
                      {otcIndex ? <i>{otcIndex.sourceLabel}</i> : null}
                    </em>
                  </div>
                  {/* 第 3 格：台股期近月（TAIFEX OpenAPI 收盤 EOD；讀不到顯示占位 '--'，不造假數字） */}
                  <div className={styles.indexCell}>
                    <span>{futuresIndex?.name ?? '台股期近月'}</span>
                    <strong className={futuresIndex ? toneClass(futuresIndex.change) : styles.flat}>
                      {futuresIndex ? formatPrice(futuresIndex.price) : '—'}
                    </strong>
                    <em className={futuresIndex ? toneClass(futuresIndex.change) : styles.flat}>
                      {futuresIndex
                        ? `${formatChange(futuresIndex.change)} (${formatPercent(futuresIndex.changePercent)})`
                        : '—'}
                      {futuresIndex ? <i>{futuresIndex.sourceLabel}</i> : null}
                    </em>
                  </div>
                </div>

                <div className={styles.statRow}>
                  <div className={styles.statCell}>
                    <span>上漲家數</span>
                    <strong className={styles.up}>{breadth ? breadth.up.toLocaleString('zh-TW') : '—'}</strong>
                  </div>
                  <div className={styles.statCell}>
                    <span>下跌家數</span>
                    <strong className={styles.down}>{breadth ? breadth.down.toLocaleString('zh-TW') : '—'}</strong>
                  </div>
                  <div className={styles.statCell}>
                    <span>持平家數</span>
                    <strong className={styles.flat}>{breadth ? breadth.flat.toLocaleString('zh-TW') : '—'}</strong>
                  </div>
                  <div className={styles.statCell}>
                    <span>全市場成交金額</span>
                    <strong>{turnoverText}</strong>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button className={styles.ghostButton} onClick={() => load(undefined, true)} disabled={refreshing}>
                    <Search size={15} />查詢盤前資訊
                  </button>
                  <button className={styles.goldButton}>
                    完整精選<ChevronRight size={15} />
                  </button>
                </div>
              </section>

              {/* 2. 今日精選摘要列 */}
              <section className={styles.summaryCard}>
                <span className={styles.kicker}>今日精選</span>
                <p className={styles.summaryLine}>
                  {overview ? (
                    <>
                      <b>{overview.date}</b> 上漲 <b className={styles.up}>{breadth ? breadth.up.toLocaleString('zh-TW') : '--'}</b> 家、
                      下跌 <b className={styles.down}>{breadth ? breadth.down.toLocaleString('zh-TW') : '--'}</b> 家、
                      持平 <b className={styles.flat}>{breadth ? breadth.flat.toLocaleString('zh-TW') : '--'}</b> 家，
                      上漲 <b>{breadth ? (breadth.upRatio * 100).toFixed(1) : '--'}%</b>、成交 <b>{turnoverText}</b>
                    </>
                  ) : '—'}
                </p>
              </section>

              {/* 3. 三欄焦點 */}
              <section className={styles.focusGrid}>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <span><Flame size={15} />今日強股</span>
                    <em>漲幅前 5</em>
                  </div>
                  {overview?.topGainers?.length ? (
                    <ul className={styles.list}>
                      {overview.topGainers.map((item) => (
                        <li key={item.symbol}>
                          <Link href={`/chart?ticker=${item.symbol}`} className={styles.listLink}>
                            <div className={styles.listName}>
                              <strong>{item.name || '--'}</strong>
                              <span>{item.symbol}</span>
                            </div>
                            <div className={styles.listRight}>
                              <b>{formatPrice(item.price)}</b>
                              <span className={toneClass(item.change)}>{formatPercent(item.changePercent)}</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.empty}><span>暫無資料</span></div>
                  )}
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <span><Building2 size={15} />法人買超</span>
                    <em>三大法人買超前 5</em>
                  </div>
                  {overview?.institutionalBuy?.length ? (
                    <ul className={styles.list}>
                      {overview.institutionalBuy.map((item) => (
                        <li key={item.symbol}>
                          <Link href={`/chart?ticker=${item.symbol}`} className={styles.listLink}>
                            <div className={styles.listName}>
                              <strong>{item.name || '--'}</strong>
                              <span>{item.symbol}</span>
                            </div>
                            <div className={styles.listRight}>
                              <b className={styles.up}>{item.netLots.toLocaleString('zh-TW')}</b>
                              <span>張</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.empty}><span>暫無資料</span></div>
                  )}
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <span><Layers size={15} />產業焦點</span>
                    <em>{overview?.sectorFocus?.length ? `漲幅前 ${overview.sectorFocus.length}` : '類股指數'}</em>
                  </div>
                  {overview?.sectorFocus?.length ? (
                    <ul className={styles.list}>
                      {overview.sectorFocus.map((item) => (
                        <li key={item.name}>
                          <div className={styles.listRow}>
                            <div className={styles.listName}>
                              <strong>{item.name || '--'}</strong>
                              <span>{formatChange(item.change)} 點</span>
                            </div>
                            <div className={styles.listRight}>
                              <b>{formatPrice(item.index)}</b>
                              <span className={toneClass(item.changePercent)}>{formatPercent(item.changePercent)}</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.empty}>
                      <Layers size={24} />
                      <span>暫無類股資料</span>
                    </div>
                  )}
                </div>
              </section>

              {/* 盤中快訊流 */}
              <section className={styles.newsSection}>
                <div className={styles.newsHeader}>
                  <div className={styles.newsTitle}>
                    <Newspaper size={15} />
                    <span>盤中快訊</span>
                  </div>
                  <div className={styles.newsStatus}>
                    {newsLoading ? (
                      <RefreshCw size={14} className={styles.spinning} />
                    ) : (
                      <Zap size={14} className={styles.zapIcon} />
                    )}
                    <span className={styles.newsStatusText}>即時更新</span>
                  </div>
                </div>
                <div className={styles.newsList}>
                  {newsItems.length > 0 ? (
                    newsItems.map((item, index) => (
                      <article
                        key={`${item.time}-${index}`}
                        className={`${styles.newsItem} ${styles[item.type.toLowerCase()]} ${item.isAlert ? styles.alert : ''}`}
                      >
                        <time className={styles.newsTime}>{item.time}</time>
                        <div className={styles.newsContent}>
                          <h4 className={styles.newsTitleText}>
                            {item.type === 'ALERT' ? '⚠ 重大訊號' : item.type === 'SCAN' ? '📊 掃描訊號' : item.type === 'THOUGHT' ? '💡 策略思考' : item.type === 'INIT' ? '🔄 系統同步' : '❌ 連線錯誤'}
                          </h4>
                          <p className={styles.newsBody}>{item.msg}</p>
                        </div>
                        {item.msg.match(/\[(\d{4,6}[A-Z]?)\s/) && (
                          <Link
                            href={`/chart?ticker=${item.msg.match(/\[(\d{4,6}[A-Z]?)\s/)?.[1]}`}
                            className={styles.newsTickerLink}
                          >
                            {item.msg.match(/\[(\d{4,6}[A-Z]?)\s/)?.[1]}
                          </Link>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className={styles.newsEmpty}>
                      <Newspaper size={24} />
                      <span>暫無快訊，等待下一輪同步…</span>
                    </div>
                  )}
                </div>
              </section>

              {/* 4. 產業地圖（32 類股色塊） */}
              <SectorMap initialData={overview?.sectorFocus ?? []} />

              {/* 5. 族群熱圖（方塊圖） */}
              <Treemap />

              {/* 6. 快捷入口（複刻博主「股票▾」與「我的▾」的功能頁入口） */}
              <section className={styles.quickSection} aria-labelledby="quick-title">
                <h2 id="quick-title" className={styles.quickTitle}>快捷入口</h2>
                <div className={styles.quickGrid}>
                  <Link href="/radar" className={styles.quickCard}>
                    <Radar size={20} aria-hidden="true" />
                    <div>
                      <strong>資金雷達</strong>
                      <span>四大排序找出主力佈局標的</span>
                    </div>
                  </Link>
                  <Link href="/sim" className={styles.quickCard}>
                    <Wallet size={20} aria-hidden="true" />
                    <div>
                      <strong>模擬練習</strong>
                      <span>虛擬資金 1,000,000 零風險練手感</span>
                    </div>
                  </Link>
                  <Link href="/watchlist" className={styles.quickCard}>
                    <Star size={20} aria-hidden="true" />
                    <div>
                      <strong>我的關注</strong>
                      <span>自選股分群與漲跌提醒</span>
                    </div>
                  </Link>
                  <Link href="/chips/2330" className={styles.quickCard}>
                    <PieChart size={20} aria-hidden="true" />
                    <div>
                      <strong>籌碼研究</strong>
                      {/* 分點明細依 hasChannelData 分支（spec §2-B）：false → 誠實標「分點未入庫」；
                          true（日後 FinMind Sponsor 開通）→ 標「分點明細」可用。 */}
                      <span>
                        {hasChannelData
                          ? '分點明細、集保級距、法人歷史'
                          : '分點未入庫、集保級距、法人歷史'}
                      </span>
                    </div>
                  </Link>
                </div>
              </section>
            </>
          ) : null}
        </div>

        {/* Toast 通知 */}
        {showToast && (
          <div className={styles.toast} role="status" aria-live="polite">
            <CheckCircle size={18} />
            <span>資料已更新</span>
          </div>
        )}
      </div>
    </div>
  );
}
