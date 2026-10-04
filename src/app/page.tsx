'use client';

/**
 * 首頁 —— 今日精華
 * 複刻「股市大佬」App 啟動首頁
 *
 * 版面結構：
 * 1. 頂部主導航（Navigation，已在 layout.tsx 統一掛載）
 * 2. 大盤指數卡（加權/櫃買/雙漲跌）
 * 3. 三欄焦點（今日強股/法人買超/產業焦點）
 * 4. 產業地圖（32 類股色塊）
 * 5. 族群熱圖（上市/上櫃/ETF 方塊圖）
 * 6. 日期切換器、下拉重新整理
 * 7. 底部功能列（AppTabBar，已在 layout.tsx 統一掛載）
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Clock,
  Flame,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { MarketOverview, TreemapData, TaifexFuturesQuote } from '@/types/market';
import styles from './page.module.css';
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

/** 常用工具卡資料（2 欄 × 3 列）。tag 為「免登入」時用金色標籤。 */
type ToolCardItem = {
  title: string;
  suitable: string;
  willSee: string;
  tag: string;
  free: boolean;
  href: string;
};

const TOOL_CARDS: readonly ToolCardItem[] = [
  {
    title: '新手導覽',
    suitable: '適合：第一次來',
    willSee: '會看到：今天先看哪三頁',
    tag: '免登入',
    free: true,
    href: '/guide',
  },
  {
    title: '台股學堂',
    suitable: '適合：名詞看不懂',
    willSee: '會看到：分點、集中度、量比白話',
    tag: '免登入',
    free: true,
    href: '/school',
  },
  {
    title: '個股盯盤',
    suitable: '適合：想查一檔',
    willSee: '會看到：走勢、籌碼、分點、風險',
    tag: '要登入',
    free: false,
    href: '/s/2330',
  },
  {
    title: '今日戰情',
    suitable: '適合：想看今天盤勢',
    willSee: '會看到：漲跌家數與資料日',
    tag: '要登入',
    free: false,
    href: '/today',
  },
  {
    title: '台股日報',
    suitable: '適合：想看盤後整理',
    willSee: '會看到：當日客觀摘要',
    tag: '要登入',
    free: false,
    href: '/reports',
  },
  {
    title: '文章',
    suitable: '適合：想看盤後解讀',
    willSee: '會看到：每天更新的教學長文',
    tag: '免登入',
    free: true,
    href: '/learn',
  },
];

/** 第一次用三卡（橫排）。 */
type QuickCardItem = {
  title: string;
  hint: string;
  href: string;
};

const QUICK_CARDS: readonly QuickCardItem[] = [
  { title: '今天市場怎麼了', hint: '先讀新手導覽', href: '/today' },
  { title: '查一檔股票', hint: '登入後看 2330', href: '/s/2330' },
  { title: '先學一個名詞', hint: '台股學堂白話', href: '/school' },
];

/** 常見問題 4 題（逐字）。 */
type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: '股市大佬是什麼？',
    answer:
      '股市大佬 TradeBoss 是台灣股票市場的公開籌碼與量價研究站。把券商分點買賣超、三大法人、日 K 結構與歷史統計整理成好讀的教學與工具。免登入可讀學堂與文章；登入後可查個股與日報。不是投顧、不代客操作、不構成投資建議。',
  },
  {
    question: '免登入可以看什麼？',
    answer:
      '公開教學文章、台股學堂、新手導覽、使用手冊、方案說明與法遵頁都可以直接讀。下面有 2330 的介面示例，說明登入後會看到哪幾塊。會員區的個股完整資料要登入後才開。',
  },
  {
    question: '這裡的數字是不是買賣建議？',
    answer:
      '不是。全站整理的是已發生的公開資料與歷史樣本。支撐壓力、均線與回撤價位是公式算出來的結構帶，不是進出場指令。投資有風險，請自行判斷。',
  },
  {
    question: '現在要付多少錢？',
    answer: '目前全站免費開放，不收月費。公開教學免登入就能讀；會員研究區註冊後即可使用。',
  },
];

/** 公司與客服底部連結列（7 個，金棕色小字）。 */
type CompanyLink = {
  label: string;
  href: string;
};

const COMPANY_LINKS: readonly CompanyLink[] = [
  { label: '關於本站', href: '/about' },
  { label: '新手導覽', href: '/guide' },
  { label: '隱私權政策', href: '/privacy' },
  { label: '服務條款', href: '/terms' },
  { label: 'AI 資料處理', href: '/methodology' },
  { label: '法遵說明', href: '/legal' },
  { label: '使用回饋/刪帳', href: '/about' },
];

export default function HomePage() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [live, setLive] = useState<LiveItem[]>([]);
  const [treemap, setTreemap] = useState<TreemapData | null>(null);
  const [futures, setFutures] = useState<TaifexFuturesQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // 未登入態「先查一檔看看」輸入代號（預填 2330）
  const [queryTicker, setQueryTicker] = useState('2330');
  const queryTickerHref = `/s/${queryTicker.trim() || '2330'}`;

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

  const load = useCallback(async (date?: string, quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');

    const dateParam = date ?? selectedDate;
    const url = dateParam
      ? `/api/skynet/market-overview?date=${dateParam.replace(/-/g, '')}&sectorLimit=32`
      : '/api/skynet/market-overview?sectorLimit=32';

    const [overviewResult, liveResult, treemapResult, futuresResult] = await Promise.allSettled([
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
      fetch('/api/skynet/treemap', { cache: 'no-store' }).then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; data?: TreemapData; message?: string };
        if (!res.ok || !body?.ok || !body.data) {
          throw new Error(body?.message || 'treemap unavailable');
        }
        return body.data;
      }),
      // 台股期近月（TAIFEX OpenAPI EOD 來源；route 端已做 1 小時快取，盤中會顯示前一日收盤日期）
      fetch('/api/skynet/futures').then(async (res) => {
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

    if (treemapResult.status === 'fulfilled') setTreemap(treemapResult.value);

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

  // 加權指數：優先盤中即時（t99），否則退回收盤值（indexClose）。
  const twseLive = live.find((item) => item.symbol === 't99' && item.price > 0) ?? null;
  const otcLive = live.find((item) => item.symbol === 'o00' && item.price > 0) ?? null;
  const indexClose = overview?.indexClose ?? null;

  const twseIndex: IndexDisplay | null = twseLive
    ? { name: '加權指數', price: twseLive.price, change: twseLive.change, changePercent: twseLive.changePercent, sourceLabel: '即時' }
    : indexClose && indexClose.price > 0
      ? { name: '加權指數', price: indexClose.price, change: indexClose.change, changePercent: indexClose.changePercent, sourceLabel: '收盤' }
      : null;

  const otcIndex: IndexDisplay | null = otcLive
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
              <strong>今日精華</strong>
              <span>MARKET DAILY</span>
            </div>
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
          {/* 0. 未登入態首屏（複刻博主「台股籌碼與當沖戰情室」逐字規格） */}

          {/* 第一屏：Hero + 先查一檔看看 */}
          <section className={styles.hero}>
            <div className={styles.heroLogo} aria-hidden="true">
              <svg viewBox="0 0 64 64" width="56" height="56" role="img" aria-label="TradeBoss 標誌占位">
                <circle cx="32" cy="32" r="30" fill="#0a1128" stroke="var(--bs-gold)" strokeWidth="2.5" />
                {/* 燭台 icon：陰燭 + 影線 */}
                <line x1="24" y1="14" x2="24" y2="50" stroke="var(--bs-gold)" strokeWidth="2" />
                <rect x="18" y="22" width="12" height="20" rx="2" fill="none" stroke="var(--bs-gold)" strokeWidth="2" />
                <line x1="40" y1="18" x2="40" y2="46" stroke="var(--bs-text-dim)" strokeWidth="2" />
                <rect x="34" y="24" width="12" height="16" rx="2" fill="var(--bs-gold)" />
              </svg>
            </div>
            <h1 className={styles.heroTitle}>台股籌碼與當沖戰情室</h1>
            <p className={styles.heroSub}>打開就知道今天發生什麼</p>
            <p className={styles.heroDesc}>
              用公開資料整理這支股票最近的走勢、分點集中與基本面；每個結論都應附資料日與限制。不是投顧、不構成投資建議。
            </p>

            <div className={styles.queryCard}>
              <div>
                <strong className={styles.queryTitle}>先查一檔看看</strong>
                <span className={styles.querySub}>
                  輸入代號。完整個股資料要登入；沒登入也可先看下面 2330 會出現哪些區塊。
                </span>
              </div>
              <div className={styles.queryRow}>
                <input
                  className={styles.queryInput}
                  value={queryTicker}
                  onChange={(event) => setQueryTicker(event.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="股票代號"
                />
                <Link className={styles.queryBtn} href={queryTickerHref}>
                  免費查看示例 →
                </Link>
              </div>
            </div>
          </section>

          {/* 第二屏：介面示例 */}
          <section className={styles.exampleCard}>
            <span className={styles.exampleKicker}>介面示例 · 非即時行情 · 非正式分析</span>
            <h2 className={styles.exampleTitle}>如果查 2330,登入後會看到什麼</h2>
            <p className={styles.exampleDesc}>
              這張卡只說明畫面結構，不是對台積電的研判或買賣建議。真實價格、分點與法人數字以登入後、頁上顯示的資料日為準。
            </p>
            <ul className={styles.exampleList}>
              <li>資料狀態：現價或收盤、資料時間、盤中或盤後</li>
              <li>一句摘要：已發生的走勢／籌碼整理，標「歷史資料」</li>
              <li>風險：處置、除權息、流動性等資料缺口</li>
              <li>波段／當沖：同一檔要看的东西不同，先選研究時間</li>
            </ul>
          </section>

          {/* 第三屏：第一次用 + 常用工具 */}
          <section className={styles.quickSection}>
            <h2 className={styles.quickTitle}>第一次用,走這三條</h2>
            <div className={styles.quickCards}>
              {QUICK_CARDS.map((card) => (
                <Link key={card.title} href={card.href} className={styles.quickCard}>
                  <strong>{card.title}</strong>
                  <span>{card.hint}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.toolsSection}>
            <div>
              <h2 className={styles.toolsTitle}>常用工具</h2>
              <p className={styles.toolsSub}>只列最常用。完整功能在登入後搜尋列。</p>
            </div>
            <div className={styles.toolsGrid}>
              {TOOL_CARDS.map((card) => (
                <Link key={card.title} href={card.href} className={styles.toolCard}>
                  <div className={styles.toolHead}>
                    <strong>{card.title}</strong>
                    <span className={card.free ? `${styles.toolTag} ${styles.toolTagFree}` : styles.toolTag}>
                      {card.tag}
                    </span>
                  </div>
                  <p>{card.suitable}</p>
                  <p>{card.willSee}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* 第四屏：資料從哪來 */}
          <section className={styles.sourceCard}>
            <h2 className={styles.sourceTitle}>資料從哪來、多久更新</h2>
            <ul className={styles.sourceList}>
              <li>行情／日線：證交所、櫃買公開資料</li>
              <li>籌碼／分點／法人：盤後結算（收盤後才出）</li>
              <li>盤中報價：第三方快照，可能有數秒延遲</li>
              <li>各頁會標資料日與下次更新</li>
            </ul>
          </section>

          {/* 第五屏：常見問題 */}
          <section className={styles.faqSection}>
            <h2 className={styles.faqTitle}>常見問題</h2>
            <div className={styles.faqList}>
              {FAQ_ITEMS.map((item) => (
                <div key={item.question} className={styles.faqItem}>
                  <strong className={styles.faqQuestion}>{item.question}</strong>
                  <p className={styles.faqAnswer}>{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 第六屏：公司與客服 */}
          <section className={styles.companyCard}>
            <h2 className={styles.companyTitle}>公司與客服</h2>
            <p className={styles.companyAnswer}>
              營運識別：TradeBoss 團隊。客服用 Telegram 或會員中心「使用回饋」。本站不會私訊要驗證碼、也不會要你匯款。法人登記資料尚未公開前，請以法遵頁為準。
            </p>
            <nav className={styles.companyLinks} aria-label="站內連結">
              {COMPANY_LINKS.map((link) => (
                <Link key={link.label} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </section>

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

              {/* 4. 產業地圖（32 類股色塊） */}
              <SectorMap initialData={overview?.sectorFocus ?? []} />

              {/* 5. 族群熱圖（方塊圖） */}
              <Treemap initialData={treemap} />
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