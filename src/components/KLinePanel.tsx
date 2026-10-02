'use client';

/**
 * God K 線圖查看器 — KLinePanel 主元件
 *
 * 包含：
 * - QuoteBar 子元件（現價資訊列）
 * - TimeframeToggle（日K / 分K 切換）
 * - CandlestickChart（K 線圖）
 * - 記憶體快取（Daily K，TTL 5 分鐘）
 * - AbortController（切換 ticker 時取消前一個請求）
 * - framer-motion slide-down 動畫
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { motion } from 'framer-motion';
import { X, Loader2, AlertTriangle, TrendingUp, Clock, BarChart2, Minus, Maximize2, GitBranch, Trash2, Undo2, Save, Share2, MessagesSquare, ZoomIn, ZoomOut, Scan } from 'lucide-react';
import CandlestickChart, { CrosshairProvider, useCrosshair } from './CandlestickChart';
import { calculateSMA } from '@/lib/sma';
import { calculateMACD, calculateKD, calculateBollingerBands, calculateRSI, calculateBIAS, calculateCDP } from '@/lib/indicators';
import {
  isCacheValid,
  sliceCandles,
  filterCompletedCandles,
  isInTradingHours,
  formatDateLabel,
  getCandleDirection,
  getChangeColor,
} from '@/lib/klineUtils';
import {
  computeStructuralConclusion,
  buildStructLines,
  computePlainConclusion,
  buildPlainLines,
} from '@/lib/techConclusion';
import type {
  ChartCandle,
  ChartLayers,
  ZoomCommand,
  QuoteResponse,
  CacheEntry,
  CandlesResponse,
} from '@/types/kline';

// ── 常數 ───────────────────────────────────────────────

// 日期範圍選項（#9；93D 為 chart.md §5「K 線 93 日」視窗）
export type DateRange = '1W' | '1M' | '3M' | '6M' | '93D';
// Timeframe 類型：支援日K、週K、月K、分K
export type Timeframe = 'daily' | 'weekly' | 'monthly' | 'intraday';
type MarketPreset = 'TW' | 'HK' | 'US';

// chart.md §5.2 圖層切換列（均線 布林 MACD RSI CDP）
export type LayerKey = 'ma' | 'bb' | 'macd' | 'rsi' | 'cdp';

export const LAYER_OPTIONS: { key: LayerKey; label: string }[] = [
  { key: 'ma', label: '均線' },
  { key: 'bb', label: '布林' },
  { key: 'macd', label: 'MACD' },
  { key: 'rsi', label: 'RSI' },
  { key: 'cdp', label: 'CDP' },
];

const DATE_RANGE_OPTIONS: { label: string; value: DateRange; days: number }[] = [
  { label: '1W', value: '1W', days: 7 },
  { label: '1M', value: '1M', days: 30 },
  { label: '3M', value: '3M', days: 90 },
  { label: '6M', value: '6M', days: 180 },
  // 93 日視窗（chart.md §5：K 線 93 日；取曆日 93 天，交易日約 65 根）
  { label: '93D', value: '93D', days: 93 },
];

// Timeframe 切換選項（對應博主版面：日K 週K 月K 分K）
const TIMEFRAME_OPTIONS: { value: Timeframe; label: string; disabledMarkets: MarketPreset[] }[] = [
  { value: 'daily', label: '日K', disabledMarkets: [] },
  { value: 'weekly', label: '週K', disabledMarkets: [] },
  { value: 'monthly', label: '月K', disabledMarkets: [] },
  { value: 'intraday', label: '分K', disabledMarkets: ['HK', 'US'] },
];

function getFromDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

const MAX_DAILY_CANDLES = 180; // 擴大上限以支援 6M

const ERROR_MESSAGES: Record<string, string> = {
  api_key_not_configured:
    '尚未設定 Fugle API Key。請至富果官網（fugle.tw）申請後，設定至 .env.local 的 FUGLE_API_KEY 欄位。',
  rate_limit_exceeded: 'API 請求已達速率上限（60次/分鐘），請稍後再試。',
  upstream_timeout: '富果 API 回應逾時，請稍後再試。',
  upstream_error: '無法取得 {ticker} 的資料，請確認股票代號是否正確。',
  intraday_not_subscribed: '分K 資料需訂閱 Fugle 付費方案（免費方案不含盤中分K），請改用日K/週K/月K。',
  invalid_ticker: '無效的股票代號。',
  network_error: '網路連線異常，請檢查網路後再試。',
};

// ── 指標狀態膠囊（RSI/KD/MACD/BIAS 的語氣色）──────────────
// globals.css 定義了 .indicator-status.bullish|.bearish|.neutral 三組配色；
// 這裡依狀態文字套對應 class（CSS 的 :has-text() 不是合法偽類，必須由 JS 帶 class）。
const INDICATOR_TONE: Record<string, 'bullish' | 'bearish' | 'neutral'> = {
  超買: 'bullish',
  多頭: 'bullish',
  偏多: 'bullish',
  嚴重偏離: 'bullish',
  超賣: 'bearish',
  空頭: 'bearish',
  偏空: 'bearish',
  中性: 'neutral',
  貼合: 'neutral',
  黃金交叉: 'neutral',
  死亡交叉: 'neutral',
};

function IndicatorStatusChip({ children }: { children: React.ReactNode }): React.ReactElement {
  const tone = INDICATOR_TONE[String(children)] ?? '';
  const className = tone ? `indicator-status ${tone}` : 'indicator-status';
  return <div className={className}>{children}</div>;
}

// ── 畫圖工具類型 ────────────────────────────────────────

type DrawingTool = 'none' | 'trendline' | 'horizontal' | 'fibonacci';

interface Drawing {
  id: string;
  type: 'trendline' | 'horizontal' | 'fibonacci';
  points: { x?: number; y?: number; time: string; price: number }[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

const DRAWING_TOOLS: { id: DrawingTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'none', label: '游標', icon: <Maximize2 size={16} />, shortcut: 'V' },
  { id: 'trendline', label: '趨勢線', icon: <GitBranch size={16} />, shortcut: 'T' },
  { id: 'horizontal', label: '水平線', icon: <Minus size={16} />, shortcut: 'H' },
  { id: 'fibonacci', label: '斐波那契', icon: <Maximize2 size={16} />, shortcut: 'F' },
];

const DRAWING_STORAGE_KEY = 'kline_drawings_';

function getDrawingStorageKey(ticker: string, timeframe: string): string {
  return `${DRAWING_STORAGE_KEY}${ticker}_${timeframe}`;
}

function loadDrawings(ticker: string, timeframe: string): Drawing[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(getDrawingStorageKey(ticker, timeframe));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveDrawings(ticker: string, timeframe: string, drawings: Drawing[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getDrawingStorageKey(ticker, timeframe), JSON.stringify(drawings));
  } catch {
    // Ignore quota exceeded
  }
}

function getErrorMessage(errorCode: string, ticker: string): string {
  const msg = ERROR_MESSAGES[errorCode] ?? `發生未知錯誤（${errorCode}）`;
  return msg.replace('{ticker}', ticker);
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// ── 指標列格式化工具（§5.3，數值缺失顯示 '--'，不補腦） ──

/** 價格欄位（開/高/低/收）：整數化顯示，缺失 '--' */
function fmtNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

/** 均線欄位（MA5/10/20）：保留 2 位，缺失 '--' */
function fmtNum2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

// ── 資料轉換：API Candle → ChartCandle ────────────────

function toChartCandle(
  raw: { date?: string; time?: string; open: unknown; high: unknown; low: unknown; close: unknown; volume: unknown },
  isIntraday = false
): ChartCandle {
  const dateRaw = raw.date ?? raw.time ?? '';
  const open = toFiniteNumber(raw.open);
  const high = toFiniteNumber(raw.high, open);
  const low = toFiniteNumber(raw.low, open);
  const close = toFiniteNumber(raw.close, open);
  const volume = toFiniteNumber(raw.volume);
  const direction = getCandleDirection(open, close);

  return {
    date: !isIntraday && raw.date ? formatDateLabel(raw.date) : undefined,
    time: isIntraday ? (raw.time ?? raw.date?.split('T')[1]?.substring(0, 5)) : undefined,
    dateRaw,
    open,
    high,
    low,
    close,
    volume,
    bodyLow: Math.min(open, close),
    bodyHigh: Math.max(open, close),
    bodyHeight: Math.abs(close - open),
    direction,
  };
}

function injectSMA(candles: ChartCandle[]): ChartCandle[] {
  const closes = candles.map((c) => c.close);
  const sma5 = calculateSMA(closes, 5);
  const sma10 = calculateSMA(closes, 10);
  const sma20 = calculateSMA(closes, 20);
  const sma60 = calculateSMA(closes, 60);

  return candles.map((c, i) => ({
    ...c,
    sma5: sma5[i],
    sma10: sma10[i],
    sma20: sma20[i],
    sma60: sma60[i],
  }));
}

function injectIndicators(candles: ChartCandle[]): ChartCandle[] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const macd = calculateMACD(closes);
  const kd = calculateKD(highs, lows, closes);
  const bb = calculateBollingerBands(closes);
  const rsi = calculateRSI(closes);
  const bias = calculateBIAS(closes);
  const cdp = calculateCDP(highs, lows, closes);

  return candles.map((c, i) => ({
    ...c,
    dif: macd.dif[i],
    signal: macd.signal[i],
    hist: macd.hist[i],
    k: kd.k[i],
    d: kd.d[i],
    bbUpper: bb.upper[i],
    bbMiddle: bb.middle[i],
    bbLower: bb.lower[i],
    rsi: rsi.rsi[i],
    cdpUpper: cdp.upper[i],
    cdpMiddle: cdp.middle[i],
    cdpLower: cdp.lower[i],
    bias6: bias.bias6[i],
    bias12: bias.bias12[i],
    bias24: bias.bias24[i],
  }));
}

// ── QuoteBar 子元件 ────────────────────────────────────

interface QuoteBarProps {
  ticker: string;
  quote: QuoteResponse | null;
  loading: boolean;
}

export function QuoteBar({ ticker, quote, loading }: QuoteBarProps) {
  const price = toFiniteNumber(quote?.price, NaN);
  const change = toFiniteNumber(quote?.change, NaN);
  const changePercent = toFiniteNumber(quote?.changePercent, NaN);
  const displayPrice = Number.isFinite(price) ? price.toFixed(2) : '--';
  const displayChange = Number.isFinite(change)
    ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}`
    : '--';
  const displayChangePercent = Number.isFinite(changePercent)
    ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
    : '--';
  const changeColor = Number.isFinite(changePercent) ? getChangeColor(changePercent) : 'var(--muted)';

  return (
    <div className="kline-quote-bar">
      <div className="kline-quote-left">
        <span className="kline-quote-ticker">{ticker}</span>
        {quote?.name && (
          <span className="kline-quote-name">{quote.name}</span>
        )}
      </div>
      <div className="kline-quote-right">
        {loading ? (
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)' }} />
        ) : (
          <>
            <span className="kline-quote-price" style={{ color: changeColor }}>
              {displayPrice}
            </span>
            <span className="kline-quote-change" style={{ color: changeColor }}>
              {displayChange}
            </span>
            <span className="kline-quote-pct" style={{ color: changeColor }}>
              {displayChangePercent}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── KLinePanel 主元件 ──────────────────────────────────

interface KLinePanelProps {
  ticker: string;
  onClose: () => void;
  target?: number;    // 目標價（來自 AnalysisCard）
  stopLoss?: number;  // 防守價（來自 AnalysisCard）
  market?: MarketPreset;
  /**
   * chart.md §2/§4/§5/§6 技術分析模式（/chart 專用）：
   * 開啟後附加「技術分析」標題、個股結構結論、93 日視窗、圖層切換列、
   * 指標列、白話版結論；不影響既有 /skynet/day-trading-sim 的用法。
   */
  techPanel?: boolean;
}

export default function KLinePanel({ ticker, onClose, target, stopLoss, market = 'TW', techPanel = false }: KLinePanelProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [dateRange, setDateRange] = useState<DateRange>(techPanel ? '93D' : '3M'); // #9 日期範圍
  const [dailyCandles, setDailyCandles] = useState<ChartCandle[] | null>(null);
  const [weeklyCandles, setWeeklyCandles] = useState<ChartCandle[] | null>(null);
  const [monthlyCandles, setMonthlyCandles] = useState<ChartCandle[] | null>(null);
  const [intradayCandles, setIntradayCandles] = useState<ChartCandle[] | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuoteError] = useState(false);
  // 技術指標面板開關
  const [showIndicators, setShowIndicators] = useState(false);

  // chart.md §5.2 圖層切換（預設：均線 + MACD 開，與博主幀一致）
  const [layers, setLayers] = useState<ChartLayers>({ ma: true, bb: false, macd: true, rsi: false, cdp: false });
  const [zoomNonce, setZoomNonce] = useState(0);
  const zoomActionRef = useRef<'in' | 'out' | 'all'>('all');
  const sendZoomCommand = useCallback((action: 'in' | 'out' | 'all') => {
    zoomActionRef.current = action;
    setZoomNonce((prev) => prev + 1);
  }, []);
  const zoomCmd: ZoomCommand = useMemo(
    () => ({ action: zoomActionRef.current, nonce: zoomNonce }),
    [zoomNonce]
  );

  // 長按/懸停浮標狀態
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandle | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // 畫圖工具狀態
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingHistory, setDrawingHistory] = useState<Drawing[][]>([]);

  // 載入儲存的畫圖
  useEffect(() => {
    const saved = loadDrawings(ticker, timeframe);
    setDrawings(saved);
    setDrawingHistory([saved]);
  }, [ticker, timeframe]);

  // 儲存畫圖
  useEffect(() => {
    if (drawings.length > 0) {
      saveDrawings(ticker, timeframe, drawings);
    }
  }, [drawings, ticker, timeframe]);

  // 更新 drawingHistory 供復原
  useEffect(() => {
    setDrawingHistory(prev => [...prev.slice(-19), drawings]); // 最多保留 20 步
  }, [drawings]);

  // 復原功能
  const undoDrawing = useCallback(() => {
    if (drawingHistory.length > 1) {
      const newHistory = drawingHistory.slice(0, -1);
      const previous = newHistory[newHistory.length - 1];
      setDrawings(previous);
      setDrawingHistory(newHistory);
    }
  }, [drawingHistory]);

  // 清除所有畫圖
  const clearDrawings = useCallback(() => {
    setDrawings([]);
    setDrawingHistory([[]]);
  }, []);

  // 加入新畫圖
  const addDrawing = useCallback((drawing: Omit<Drawing, 'id'>) => {
    const newDrawing: Drawing = { ...drawing, id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}` };
    setDrawings(prev => [...prev, newDrawing]);
    setActiveTool('none');
  }, []);

  // 快取（Daily/Weekly/Monthly K，TTL 5 分鐘）
  const dailyCache = useRef<Map<string, CacheEntry>>(new Map());

  // AbortController（切換 ticker 時取消前一個請求）
  const abortRef = useRef<AbortController | null>(null);

  // 判斷是否在交易時段
  const now = new Date();
  const taipeiHour = parseInt(
    new Intl.DateTimeFormat('zh-TW', { hour: 'numeric', hour12: false, timeZone: 'Asia/Taipei' }).format(now)
  );
  const taipeiMinute = now.getMinutes();
  const inTradingHours = isInTradingHours(taipeiHour, taipeiMinute);
  const intradayAvailable = market === 'TW';

  // 取得目前 timeframe 可用的蠟燭資料
  const getCandlesForTimeframe = useCallback((tf: Timeframe) => {
    switch (tf) {
      case 'daily': return dailyCandles;
      case 'weekly': return weeklyCandles;
      case 'monthly': return monthlyCandles;
      case 'intraday': return intradayCandles;
    }
  }, [dailyCandles, weeklyCandles, monthlyCandles, intradayCandles]);

  // 設定蠟燭資料
  const setCandlesForTimeframe = useCallback((tf: Timeframe, candles: ChartCandle[] | null) => {
    switch (tf) {
      case 'daily': setDailyCandles(candles); break;
      case 'weekly': setWeeklyCandles(candles); break;
      case 'monthly': setMonthlyCandles(candles); break;
      case 'intraday': setIntradayCandles(candles); break;
    }
  }, []);

  // ── 取得 Daily K 資料 ────────────────────────────────

  const fetchDaily = useCallback(async (t: string, signal: AbortSignal, range: DateRange = '3M') => {
    // 快取 key 包含 range
    const cacheKey = `${t}_${range}`;
    const cached = dailyCache.current.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp, Date.now())) {
      setDailyCandles(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const days = DATE_RANGE_OPTIONS.find(o => o.value === range)?.days ?? 90;
      const from = getFromDate(days);
      const res = await fetch(`/api/skynet/kline?ticker=${t}&market=${market}&type=daily&from=${from}`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'upstream_error' }));
        setError(getErrorMessage(errData.error ?? 'upstream_error', t));
        return;
      }

      const data: CandlesResponse = await res.json();
      if (signal.aborted) return;

      const chartCandles = (data.candles ?? []).map((c) => toChartCandle(c, false));
      const sliced = sliceCandles(chartCandles, MAX_DAILY_CANDLES);
      const withSMA = injectSMA(sliced);
      const withIndicators = injectIndicators(withSMA);

      // 存入快取（含 range key）
      dailyCache.current.set(cacheKey, { data: withIndicators, timestamp: Date.now() });
      setDailyCandles(withIndicators);
    } catch {
      if (signal.aborted) return;
      setError(getErrorMessage('network_error', t));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [market]);

  // ── 取得 Weekly K 資料 ───────────────────────────────

  const fetchWeekly = useCallback(async (t: string, signal: AbortSignal, range: DateRange = '3M') => {
    const cacheKey = `${t}_weekly_${range}`;
    const cached = dailyCache.current.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp, Date.now())) {
      setWeeklyCandles(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const days = DATE_RANGE_OPTIONS.find(o => o.value === range)?.days ?? 90;
      const from = getFromDate(days);
      const res = await fetch(`/api/skynet/kline?ticker=${t}&market=${market}&type=weekly&from=${from}`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'upstream_error' }));
        setError(getErrorMessage(errData.error ?? 'upstream_error', t));
        return;
      }

      const data: CandlesResponse = await res.json();
      if (signal.aborted) return;

      const chartCandles = (data.candles ?? []).map((c) => toChartCandle(c, false));
      const withSMA = injectSMA(chartCandles);
      const withIndicators = injectIndicators(withSMA);

      dailyCache.current.set(cacheKey, { data: withIndicators, timestamp: Date.now() });
      setWeeklyCandles(withIndicators);
    } catch {
      if (signal.aborted) return;
      setError(getErrorMessage('network_error', t));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [market]);

  // ── 取得 Monthly K 資料 ──────────────────────────────

  const fetchMonthly = useCallback(async (t: string, signal: AbortSignal, range: DateRange = '3M') => {
    const cacheKey = `${t}_monthly_${range}`;
    const cached = dailyCache.current.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp, Date.now())) {
      setMonthlyCandles(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const days = DATE_RANGE_OPTIONS.find(o => o.value === range)?.days ?? 90;
      const from = getFromDate(days);
      const res = await fetch(`/api/skynet/kline?ticker=${t}&market=${market}&type=monthly&from=${from}`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'upstream_error' }));
        setError(getErrorMessage(errData.error ?? 'upstream_error', t));
        return;
      }

      const data: CandlesResponse = await res.json();
      if (signal.aborted) return;

      const chartCandles = (data.candles ?? []).map((c) => toChartCandle(c, false));
      const withSMA = injectSMA(chartCandles);
      const withIndicators = injectIndicators(withSMA);

      dailyCache.current.set(cacheKey, { data: withIndicators, timestamp: Date.now() });
      setMonthlyCandles(withIndicators);
    } catch {
      if (signal.aborted) return;
      setError(getErrorMessage('network_error', t));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [market]);

  // ── 取得 Intraday K 資料 ─────────────────────────────

  const fetchIntraday = useCallback(async (t: string, signal: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/skynet/kline?ticker=${t}&market=${market}&type=intraday`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'upstream_error' }));
        // 分K 需要 Fugle 付費方案（免費方案不含 intraday/candles），失敗時給明確提示，
        // 避免沿用 upstream_error 的一般文案而誤導使用者以為是代號打錯。
        if (!errData?.error || errData.error === 'upstream_error' || errData.error === 'intraday_not_subscribed') {
          setError(getErrorMessage(errData.error ?? 'intraday_not_subscribed', t));
        } else {
          setError(getErrorMessage(errData.error, t));
        }
        return;
      }

      const data: CandlesResponse = await res.json();
      if (signal.aborted) return;

      const chartCandles = (data.candles ?? []).map((c) => toChartCandle(c, true));
      const filtered = filterCompletedCandles(chartCandles, Date.now());
      const withSMA = injectSMA(filtered);
      const withIndicators = injectIndicators(withSMA);
      setIntradayCandles(withIndicators);
    } catch {
      if (signal.aborted) return;
      setError(getErrorMessage('network_error', t));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [market]);

  // ── 取得 Quote 資料 ──────────────────────────────────

  const fetchQuote = useCallback(async (t: string, signal: AbortSignal) => {
    setQuoteLoading(true);
    setQuoteError(false);

    try {
      const res = await fetch(`/api/skynet/kline?ticker=${t}&market=${market}&type=quote`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        setQuoteError(true);
        return;
      }

      const data: QuoteResponse = await res.json();
      if (signal.aborted) return;
      setQuote(data);
    } catch {
      if (signal.aborted) return;
      setQuoteError(true);
    } finally {
      if (!signal.aborted) setQuoteLoading(false);
    }
  }, [market]);

  // ── 主要資料載入 Effect ──────────────────────────────

  useEffect(() => {
    // 取消前一個請求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 重置狀態
    setDailyCandles(null);
    setWeeklyCandles(null);
    setMonthlyCandles(null);
    setIntradayCandles(null);
    setQuote(null);
    setError(null);
    setTimeframe('daily');
    setDateRange(techPanel ? '93D' : '3M');

    // 同時發出 daily + quote 請求
    fetchDaily(ticker, controller.signal, techPanel ? '93D' : '3M');
    fetchQuote(ticker, controller.signal);

    return () => {
      controller.abort();
    };
  }, [ticker, fetchDaily, fetchQuote, techPanel]);

  useEffect(() => {
    if (!intradayAvailable && timeframe === 'intraday') {
      setTimeframe('daily');
    }
    // 週K/月K 在所有市場都可用（由 daily 重採樣而來）
  }, [intradayAvailable, timeframe]);

  // ── 切換日期範圍（#9） ───────────────────────────────

  const handleDateRangeChange = useCallback((range: DateRange) => {
    if (range === dateRange) return;
    setDateRange(range);
    // 清除所有 timeframe 的快取資料，強制重新載入
    setDailyCandles(null);
    setWeeklyCandles(null);
    setMonthlyCandles(null);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    
    // 根據目前 timeframe 載入對應資料
    switch (timeframe) {
      case 'daily':
        fetchDaily(ticker, controller.signal, range);
        break;
      case 'weekly':
        fetchWeekly(ticker, controller.signal, range);
        break;
      case 'monthly':
        fetchMonthly(ticker, controller.signal, range);
        break;
      case 'intraday':
        // intraday 不使用 dateRange
        break;
    }
  }, [dateRange, timeframe, ticker, fetchDaily, fetchWeekly, fetchMonthly]);

  // ── 切換 Timeframe ───────────────────────────────────

  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    if (tf === timeframe) return;
    setTimeframe(tf);
    setError(null);

    // 檢查該 timeframe 是否已有資料，若無則載入
    const existingCandles = getCandlesForTimeframe(tf);
    if (!existingCandles) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      
      switch (tf) {
        case 'daily':
          fetchDaily(ticker, controller.signal, dateRange);
          break;
        case 'weekly':
          fetchWeekly(ticker, controller.signal, dateRange);
          break;
        case 'monthly':
          fetchMonthly(ticker, controller.signal, dateRange);
          break;
        case 'intraday':
          if (intradayAvailable) {
            fetchIntraday(ticker, controller.signal);
          }
          break;
      }
    }
  }, [timeframe, dateRange, ticker, intradayAvailable, fetchDaily, fetchWeekly, fetchMonthly, fetchIntraday, getCandlesForTimeframe]);  // ── 決定顯示的資料 ───────────────────────────────────

  const displayCandles = getCandlesForTimeframe(timeframe);

  // chart.md §5.3 指標列：選中的 K 棒（預設最新一根，點擊 K 棒可切換）
  const [selectedCandle, setSelectedCandle] = useState<ChartCandle | null>(null);
  useEffect(() => {
    // 切換 ticker / timeframe 時重置選中
    setSelectedCandle(null);
  }, [ticker, timeframe]);
  useEffect(() => {
    // K 棒資料更新後：若尚未選中，預設選最新一根
    if (selectedCandle === null && displayCandles && displayCandles.length > 0) {
      setSelectedCandle(displayCandles[displayCandles.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCandles]);
  const handleCandleSelect = useCallback((candle: ChartCandle) => {
    setSelectedCandle(candle);
  }, []);
  // 指標列顯示的 K 棒：選中棒仍在此資料集內則用選中棒，否則退回最新棒
  const indicatorCandle: ChartCandle | null = useMemo(() => {
    if (selectedCandle && displayCandles && displayCandles.includes(selectedCandle)) {
      return selectedCandle;
    }
    return displayCandles && displayCandles.length > 0 ? displayCandles[displayCandles.length - 1] : null;
  }, [selectedCandle, displayCandles]);

  // ── 技術分析：個股結構結論（§4，公開 K 線可算，不硬編碼樣本數字） ──
  const struct = useMemo(
    () => (displayCandles && displayCandles.length > 0 ? computeStructuralConclusion(displayCandles) : null),
    [displayCandles]
  );
  const structLines = useMemo(() => (struct ? buildStructLines(struct, quote?.name ?? ticker) : null), [struct, quote, ticker]);

  // ── 白話版結論（§6，由均線/MACD/量數值產出，不補腦） ──
  const plain = useMemo(
    () => (displayCandles && displayCandles.length > 0 ? computePlainConclusion(displayCandles) : null),
    [displayCandles]
  );
  const plainLines = useMemo(() => (plain ? buildPlainLines(plain) : null), [plain]);

  // 取得 timeframe 的中文標籤
  const getTimeframeLabel = (tf: Timeframe) => {
    const opt = TIMEFRAME_OPTIONS.find(o => o.value === tf);
    return opt?.label ?? tf;
  };

  // 非交易時段提示
  const showOffHoursNotice = timeframe === 'intraday' && !inTradingHours;

  // ── 渲染 ─────────────────────────────────────────────

  return (
    <div
      className="kline-panel"
      style={{ opacity: 1, transform: 'none' }}
    >
      {/* 面板標題列 */}
      <div className="kline-panel-header">
        <div className="kline-panel-title">
          <TrendingUp size={18} style={{ color: '#00f0ff' }} />
          <span>{techPanel ? '技術分析' : 'K 線圖'}</span>
          {techPanel && <span className="kline-tech-subtitle">輸入代號、名稱、大盤、籌碼、均線與高點結構</span>}
          {market !== 'TW' && <span className="kline-market-badge">{market}</span>}
        </div>

        {/* QuoteBar */}
        <QuoteBar ticker={ticker} quote={quote} loading={quoteLoading} />

        {/* Timeframe 切換（日K 週K 月K 分K） */}
        <div className="kline-timeframe-toggle">
          {TIMEFRAME_OPTIONS.map(opt => {
            const isDisabled = opt.disabledMarkets.includes(market);
            return (
              <button
                key={opt.value}
                className={`kline-tf-btn ${timeframe === opt.value ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && handleTimeframeChange(opt.value)}
                disabled={isDisabled}
                title={isDisabled ? `${market} 暫不支援 ${opt.label}` : `切換到 ${opt.label}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 技術指標面板開關 */}
        <button
          className={`kline-indicator-toggle ${showIndicators ? 'active' : ''}`}
          onClick={() => setShowIndicators(!showIndicators)}
          aria-pressed={showIndicators}
          aria-label="切換技術指標面板"
        >
          <BarChart2 size={16} />
          <span>指標</span>
        </button>

        {/* 畫圖工具列 */}
        <div className="kline-drawing-toolbar" role="group" aria-label="畫圖工具">
          {DRAWING_TOOLS.map(tool => (
            <button
              key={tool.id}
              className={`kline-drawing-btn ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-pressed={activeTool === tool.id}
            >
              {tool.icon}
              <span className="kline-drawing-btn-label">{tool.label}</span>
            </button>
          ))}
          {drawings.length > 0 && (
            <>
              <button
                className="kline-drawing-btn undo"
                onClick={undoDrawing}
                title="復原 (Ctrl+Z)"
                disabled={drawingHistory.length <= 1}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="kline-drawing-btn clear"
                onClick={clearDrawings}
                title="清除所有畫圖"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>

        {/* 日期範圍切換（#9，日K/週K/月K 顯示） */}
        {(timeframe === 'daily' || timeframe === 'weekly' || timeframe === 'monthly') && (
          <div className="kline-daterange-toggle">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`kline-tf-btn ${dateRange === opt.value ? 'active' : ''}`}
                onClick={() => handleDateRangeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {!intradayAvailable && timeframe === 'intraday' && (
          <div className="kline-offhours-notice">
            <Clock size={14} />
            <span>目前為 {market} 模式，僅提供日K/週K/月K與即時報價</span>
          </div>
        )}

        {/* 關閉按鈕 */}
        <button className="kline-close-btn" onClick={onClose} aria-label="關閉 K 線圖">
          <X size={18} />
        </button>
      </div>

      {/* 非交易時段提示 */}
      {showOffHoursNotice && (
        <div className="kline-offhours-notice">
          <Clock size={14} />
          <span>目前非交易時段，顯示最近一個交易日資料</span>
        </div>
      )}

      {/* 主要內容區 */}
      <div className="kline-panel-body">
        {/* 載入中 */}
        {loading && (
          <div className="kline-loading">
            <Loader2 size={28} className="animate-spin" style={{ color: '#00f0ff' }} />
            <p>載入 {ticker} {getTimeframeLabel(timeframe)} 資料中...</p>
          </div>
        )}

        {/* 錯誤訊息 */}
        {!loading && error && (
          <div className="kline-error">
            <AlertTriangle size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* K 線圖 */}
        {!loading && !error && displayCandles && displayCandles.length > 0 && (
          <div className="kline-candle-card">
            {/* K 線卡標題（§5.4）：`<代號> <名稱> 近 93 日K`（techPanel 時） */}
            <div className="kline-candle-card-title">
              <span className="kline-candle-card-ticker">{ticker}</span>
              {quote?.name && <span className="kline-candle-card-name">{quote.name}</span>}
              <span className="kline-candle-card-window">
                {techPanel ? '近 93 日K' : `${TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label ?? timeframe}`}
              </span>
              {/* 圖層切換列（§5.2：均線 布林 MACD RSI CDP ＋ 縮小 放大 全覽） */}
              <div className="kline-layer-toggle" role="group" aria-label="圖層切換">
                {LAYER_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    className={`kline-layer-btn ${layers[opt.key] ? 'active' : ''}`}
                    onClick={() => setLayers((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                    aria-pressed={layers[opt.key]}
                  >
                    {opt.label}
                  </button>
                ))}
                <span className="kline-layer-sep" aria-hidden="true" />
                <button className="kline-zoom-btn" onClick={() => sendZoomCommand('in')} title="縮小">
                  <ZoomIn size={14} />
                </button>
                <button className="kline-zoom-btn" onClick={() => sendZoomCommand('out')} title="放大">
                  <ZoomOut size={14} />
                </button>
                <button className="kline-zoom-btn" onClick={() => sendZoomCommand('all')} title="全覽">
                  <Scan size={14} />
                </button>
              </div>
              {/* 分享（§5.1，純前端 UI：複製連結，不造假） */}
              <button
                className="kline-share-btn"
                onClick={() => {
                  const url = window.location.href;
                  void navigator.clipboard?.writeText(url).catch(() => undefined);
                }}
                title="複製頁面連結"
              >
                <Share2 size={14} />
                <span>分享</span>
              </button>
            </div>

            {/* 指標列（§5.3：日期 開 高 低 收 MA5 MA10 MA20） */}
            <div className="kline-indicator-row" role="list" aria-label="指標列">
              <span className="kline-ind-item date">{indicatorCandle?.dateRaw ?? '--'}</span>
              <span className="kline-ind-item">開 {fmtNum(indicatorCandle?.open)}</span>
              <span className="kline-ind-item">高 {fmtNum(indicatorCandle?.high)}</span>
              <span className="kline-ind-item">低 {fmtNum(indicatorCandle?.low)}</span>
              <span className="kline-ind-item close">收 {fmtNum(indicatorCandle?.close)}</span>
              <span className="kline-ind-item ma">MA5 {fmtNum2(indicatorCandle?.sma5)}</span>
              <span className="kline-ind-item ma">MA10 {fmtNum2(indicatorCandle?.sma10)}</span>
              <span className="kline-ind-item ma">MA20 {fmtNum2(indicatorCandle?.sma20)}</span>
            </div>

            {/* 技術分析「個股結構結論」（§4，依公開 K 線計算，不硬編碼） */}
            {techPanel && structLines && (
              <div className="kline-struct-conclusions">
                <h3 className="kline-struct-title">個股結構結論</h3>
                <ol className="kline-struct-list">
                  {structLines.map((line, i) => (
                    <li key={i} className="kline-struct-item">{line.text}</li>
                  ))}
                </ol>
              </div>
            )}

            <CandlestickChart
              candles={displayCandles}
              timeframe={timeframe}
              target={target}
              stopLoss={stopLoss}
              drawings={drawings}
              onAddDrawing={addDrawing}
              activeTool={activeTool}
              onCandleHover={setHoveredCandle}
              onHoverPositionChange={setHoverPosition}
              layers={layers}
              zoomCmd={zoomCmd}
              onCandleSelect={handleCandleSelect}
            />

            {/* 白話版結論（§6，數字由均線/MACD 即時產出，不補腦） */}
            {techPanel && plainLines && (
              <div className="kline-plain-conclusion">
                <h3 className="kline-plain-title">{plainLines.heading}</h3>
                <div className="kline-plain-body">
                  {plainLines.body.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <div className="kline-plain-note">
                  這些數字是均線 20、MA5 與 20 日線算出來的。你不用懂公式，看懂「誰在上面、誰在下面、誰在放、誰在縮」就夠了。
                </div>
                <a
                  className="kline-ask-ai"
                  href={`/ai?ticker=${encodeURIComponent(ticker)}`}
                  title="問 AI"
                  aria-label="問 AI"
                >
                  <MessagesSquare size={16} />
                  <span>問 AI</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* 長按/懸停浮標提示 */}
        {hoveredCandle && hoverPosition && (
          <div
            className="kline-candle-tooltip"
            style={{
              left: hoverPosition.x,
              top: hoverPosition.y,
            }}
          >
            <div className="tooltip-row"><span>時間</span><strong>{hoveredCandle.date ?? hoveredCandle.time ?? hoveredCandle.dateRaw}</strong></div>
            <div className="tooltip-row"><span>開盤</span><strong>{hoveredCandle.open.toFixed(2)}</strong></div>
            <div className="tooltip-row"><span>最高</span><strong>{hoveredCandle.high.toFixed(2)}</strong></div>
            <div className="tooltip-row"><span>最低</span><strong>{hoveredCandle.low.toFixed(2)}</strong></div>
            <div className="tooltip-row"><span>收盤</span><strong>{hoveredCandle.close.toFixed(2)}</strong></div>
            <div className="tooltip-row"><span>成交量</span><strong>{hoveredCandle.volume.toLocaleString()}</strong></div>
          </div>
        )}

        {/* 無資料 */}
        {!loading && !error && displayCandles && displayCandles.length === 0 && (
          <div className="kline-empty">
            <p>無法取得 {ticker} 的 {getTimeframeLabel(timeframe)} 資料</p>
          </div>
        )}

        {/* 技術指標面板 */}
        {showIndicators && displayCandles && displayCandles.length > 0 && (
          <TechnicalIndicatorsPanel candles={displayCandles} timeframe={timeframe} />
        )}
      </div>
    </div>
  );
}

// ── 技術指標面板子元件 ──────────────────────────────────

interface TechnicalIndicatorsPanelProps {
  candles: ChartCandle[];
  timeframe: Timeframe;
}

function TechnicalIndicatorsPanel({ candles, timeframe }: TechnicalIndicatorsPanelProps) {
  const xKey = timeframe === 'intraday' ? 'time' : 'date';

  // 取得最後一根有效數據
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];

  return (
    <div className="kline-indicators-panel">
      <div className="kline-indicators-header">
        <h3>技術指標</h3>
        <div className="kline-indicators-summary">
          {lastCandle?.rsi != null && (
            <span className="indicator-badge rsi">
              RSI(14): {lastCandle.rsi.toFixed(1)}
              {lastCandle.rsi > 70 ? ' 🔴' : lastCandle.rsi < 30 ? ' 🟢' : ''}
            </span>
          )}
          {lastCandle?.bias6 != null && (
            <span className="indicator-badge bias">
              BIAS6: {lastCandle.bias6 >= 0 ? '+' : ''}{lastCandle.bias6.toFixed(2)}%
            </span>
          )}
          {lastCandle?.k != null && lastCandle?.d != null && (
            <span className="indicator-badge kd">
              KD: K={lastCandle.k.toFixed(1)} D={lastCandle.d.toFixed(1)}
            </span>
          )}
          {lastCandle?.dif != null && lastCandle?.signal != null && (
            <span className="indicator-badge macd">
              MACD: {lastCandle.dif >= lastCandle.signal ? '🟢' : '🔴'}
            </span>
          )}
        </div>
      </div>

      <div className="kline-indicators-grid">
        {/* RSI */}
        <div className="indicator-card">
          <h4>RSI (14)</h4>
          <div className="indicator-value">
            {lastCandle?.rsi != null ? lastCandle.rsi.toFixed(1) : '--'}
          </div>
          <IndicatorStatusChip>
            {lastCandle?.rsi != null
              ? lastCandle.rsi > 70
                ? '超買'
                : lastCandle.rsi < 30
                ? '超賣'
                : '中性'
              : '—'}
          </IndicatorStatusChip>
          <div className="indicator-mini-chart" aria-hidden="true">
            {candles.slice(-30).map((c, i) => (
              <div
                key={i}
                className="mini-bar rsi-bar"
                style={{
                  height: `${c.rsi != null ? Math.max(2, c.rsi) : 2}%`,
                  background: c.rsi != null ? (c.rsi > 70 ? '#ef4444' : c.rsi < 30 ? '#22c55e' : '#00f0ff') : 'transparent',
                }}
              />
            ))}
          </div>
        </div>

        {/* KD */}
        <div className="indicator-card">
          <h4>KD (9,3,3)</h4>
          <div className="indicator-value-kd">
            K: {lastCandle?.k != null ? lastCandle.k.toFixed(1) : '--'} /
            D: {lastCandle?.d != null ? lastCandle.d.toFixed(1) : '--'}
          </div>
          <IndicatorStatusChip>
            {lastCandle?.k != null && lastCandle?.d != null
              ? lastCandle.k > 80 && lastCandle.d > 80
                ? '超買'
                : lastCandle.k < 20 && lastCandle.d < 20
                ? '超賣'
                : lastCandle.k > lastCandle.d
                ? '黃金交叉'
                : '死亡交叉'
              : '—'}
          </IndicatorStatusChip>
          <div className="indicator-mini-chart" aria-hidden="true">
            {candles.slice(-30).map((c, i) => (
              <div
                key={`kd-${i}`}
                className="mini-bar kd-bar"
                style={{
                  height: `${c.k != null ? Math.max(2, c.k) : 2}%`,
                  background: c.k != null && c.d != null && c.k > c.d ? '#eab308' : '#f97316',
                }}
              />
            ))}
          </div>
        </div>

        {/* MACD */}
        <div className="indicator-card">
          <h4>MACD (12,26,9)</h4>
          <div className="indicator-value-macd">
            DIF: {lastCandle?.dif != null ? lastCandle.dif.toFixed(2) : '--'} |
            SIG: {lastCandle?.signal != null ? lastCandle.signal.toFixed(2) : '--'} |
            HIST: {lastCandle?.hist != null ? lastCandle.hist.toFixed(2) : '--'}
          </div>
          <IndicatorStatusChip>
            {lastCandle?.dif != null && lastCandle?.signal != null
              ? lastCandle.dif > lastCandle.signal
                ? '多頭'
                : '空頭'
              : '—'}
          </IndicatorStatusChip>
          <div className="indicator-mini-chart" aria-hidden="true">
            {candles.slice(-30).map((c, i) => (
              <div
                key={`macd-${i}`}
                className="mini-bar macd-bar"
                style={{
                  height: `${c.hist != null ? Math.max(2, Math.min(100, Math.abs(c.hist) * 10 + 50)) : 2}%`,
                  background: c.hist != null && c.hist >= 0 ? '#ef4444' : '#22c55e',
                }}
              />
            ))}
          </div>
        </div>

        {/* BIAS */}
        <div className="indicator-card">
          <h4>BIAS 乖離率</h4>
          <div className="indicator-value-bias">
            6: {lastCandle?.bias6 != null ? (lastCandle.bias6 >= 0 ? '+' : '') + lastCandle.bias6.toFixed(2) + '%' : '--'} |
            12: {lastCandle?.bias12 != null ? (lastCandle.bias12 >= 0 ? '+' : '') + lastCandle.bias12.toFixed(2) + '%' : '--'} |
            24: {lastCandle?.bias24 != null ? (lastCandle.bias24 >= 0 ? '+' : '') + lastCandle.bias24.toFixed(2) + '%' : '--'}
          </div>
          <IndicatorStatusChip>
            {lastCandle?.bias6 != null
              ? lastCandle.bias6 > 5
                ? '嚴重偏離'
                : lastCandle.bias6 > 2
                ? '偏多'
                : lastCandle.bias6 < -5
                ? '嚴重偏離'
                : lastCandle.bias6 < -2
                ? '偏空'
                : '貼合'
              : '—'}
          </IndicatorStatusChip>
          <div className="indicator-mini-chart" aria-hidden="true">
            {candles.slice(-30).map((c, i) => (
              <div
                key={`bias-${i}`}
                className="mini-bar bias-bar"
                style={{
                  height: `${c.bias6 != null ? Math.max(2, Math.min(100, c.bias6 * 5 + 50)) : 2}%`,
                  background: c.bias6 != null && c.bias6 >= 0 ? '#ef4444' : '#22c55e',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 詳細數值表格 */}
      <div className="kline-indicators-table">
        <h4>最近 5 根 K 棒數值</h4>
        <table>
          <thead>
            <tr>
              <th>日期/時間</th>
              <th>RSI</th>
              <th>K</th>
              <th>D</th>
              <th>DIF</th>
              <th>SIG</th>
              <th>HIST</th>
              <th>BIAS6</th>
              <th>BIAS12</th>
              <th>BIAS24</th>
            </tr>
          </thead>
          <tbody>
            {candles.slice(-5).reverse().map((c, i) => (
              <tr key={i}>
                <td>{c[xKey] || c.dateRaw}</td>
                <td>{c.rsi != null ? c.rsi.toFixed(1) : '--'}</td>
                <td>{c.k != null ? c.k.toFixed(1) : '--'}</td>
                <td>{c.d != null ? c.d.toFixed(1) : '--'}</td>
                <td>{c.dif != null ? c.dif.toFixed(2) : '--'}</td>
                <td>{c.signal != null ? c.signal.toFixed(2) : '--'}</td>
                <td>{c.hist != null ? c.hist.toFixed(2) : '--'}</td>
                <td>{c.bias6 != null ? (c.bias6 >= 0 ? '+' : '') + c.bias6.toFixed(2) + '%' : '--'}</td>
                <td>{c.bias12 != null ? (c.bias12 >= 0 ? '+' : '') + c.bias12.toFixed(2) + '%' : '--'}</td>
                <td>{c.bias24 != null ? (c.bias24 >= 0 ? '+' : '') + c.bias24.toFixed(2) + '%' : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
