'use client';

/**
 * 天網 K 線圖查看器 — KLinePanel 主元件
 *
 * 包含：
 * - QuoteBar 子元件（現價資訊列）
 * - TimeframeToggle（日K / 分K 切換）
 * - CandlestickChart（K 線圖）
 * - 記憶體快取（Daily K，TTL 5 分鐘）
 * - AbortController（切換 ticker 時取消前一個請求）
 * - framer-motion slide-down 動畫
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import CandlestickChart from './CandlestickChart';
import { calculateSMA } from '@/lib/sma';
import { calculateMACD, calculateKD, calculateBollingerBands } from '@/lib/indicators';
import {
  isCacheValid,
  sliceCandles,
  filterCompletedCandles,
  isInTradingHours,
  formatDateLabel,
  getCandleDirection,
  getChangeColor,
} from '@/lib/klineUtils';
import type {
  ChartCandle,
  QuoteResponse,
  CacheEntry,
  CandlesResponse,
} from '@/types/kline';

// ── 常數 ───────────────────────────────────────────────

// 日期範圍選項（#9）
type DateRange = '1W' | '1M' | '3M' | '6M';
type MarketPreset = 'TW' | 'HK' | 'US';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange; days: number }[] = [
  { label: '1W', value: '1W', days: 7 },
  { label: '1M', value: '1M', days: 30 },
  { label: '3M', value: '3M', days: 90 },
  { label: '6M', value: '6M', days: 180 },
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
  invalid_ticker: '無效的股票代號。',
  network_error: '網路連線異常，請檢查網路後再試。',
};

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
  const changeColor = Number.isFinite(changePercent) ? getChangeColor(changePercent) : '#94a3b8';

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
          <Loader2 size={14} className="animate-spin" style={{ color: '#64748b' }} />
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
}

export default function KLinePanel({ ticker, onClose, target, stopLoss, market = 'TW' }: KLinePanelProps) {
  const [timeframe, setTimeframe] = useState<'daily' | 'intraday'>('daily');
  const [dateRange, setDateRange] = useState<DateRange>('3M'); // #9 日期範圍
  const [dailyCandles, setDailyCandles] = useState<ChartCandle[] | null>(null);
  const [intradayCandles, setIntradayCandles] = useState<ChartCandle[] | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuoteError] = useState(false);

  // 快取（Daily K，TTL 5 分鐘）
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
        if (!errData?.error || errData.error === 'upstream_error') {
          setError('分K 資料暫不可用（目前方案未提供盤中分K），請改用日K。');
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
    setIntradayCandles(null);
    setQuote(null);
    setError(null);
    setTimeframe('daily');
    setDateRange('3M');

    // 同時發出 daily + quote 請求
    fetchDaily(ticker, controller.signal, '3M');
    fetchQuote(ticker, controller.signal);

    return () => {
      controller.abort();
    };
  }, [ticker, fetchDaily, fetchQuote]);

  useEffect(() => {
    if (!intradayAvailable && timeframe === 'intraday') {
      setTimeframe('daily');
    }
  }, [intradayAvailable, timeframe]);

  // ── 切換日期範圍（#9） ───────────────────────────────

  const handleDateRangeChange = useCallback((range: DateRange) => {
    if (range === dateRange) return;
    setDateRange(range);
    setDailyCandles(null);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchDaily(ticker, controller.signal, range);
  }, [dateRange, ticker, fetchDaily]);

  // ── 切換 Timeframe ───────────────────────────────────

  const handleTimeframeChange = useCallback((tf: 'daily' | 'intraday') => {
    if (tf === timeframe) return;
    setTimeframe(tf);
    setError(null);

    if (tf === 'intraday' && !intradayCandles) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchIntraday(ticker, controller.signal);
    }
  }, [timeframe, intradayCandles, ticker, fetchIntraday]);  // ── 決定顯示的資料 ───────────────────────────────────

  const displayCandles = timeframe === 'daily' ? dailyCandles : intradayCandles;

  // ── 渲染 ─────────────────────────────────────────────

  return (
    <motion.div
      className="kline-panel"
      initial={{ opacity: 0, y: -20, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* 面板標題列 */}
      <div className="kline-panel-header">
        <div className="kline-panel-title">
          <TrendingUp size={18} style={{ color: '#00f0ff' }} />
          <span>K 線圖</span>
          {market !== 'TW' && <span className="kline-market-badge">{market}</span>}
        </div>

        {/* QuoteBar */}
        <QuoteBar ticker={ticker} quote={quote} loading={quoteLoading} />

        {/* Timeframe 切換 */}
        <div className="kline-timeframe-toggle">
          <button
            className={`kline-tf-btn ${timeframe === 'daily' ? 'active' : ''}`}
            onClick={() => handleTimeframeChange('daily')}
          >
            日K
          </button>
          <button
            className={`kline-tf-btn ${timeframe === 'intraday' ? 'active' : ''} ${!intradayAvailable ? 'disabled' : ''}`}
            onClick={() => intradayAvailable && handleTimeframeChange('intraday')}
            disabled={!intradayAvailable}
            title={intradayAvailable ? '切換到盤中分K' : '港股 / 美股目前僅提供日K與報價'}
          >
            分K（盤中）
          </button>
        </div>

        {/* 日期範圍切換（#9，僅日K 顯示） */}
        {timeframe === 'daily' && (
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

        {!intradayAvailable && (
          <div className="kline-offhours-notice">
            <Clock size={14} />
            <span>目前為 {market} 模式，僅提供日K與即時報價</span>
          </div>
        )}

        {/* 關閉按鈕 */}
        <button className="kline-close-btn" onClick={onClose} aria-label="關閉 K 線圖">
          <X size={18} />
        </button>
      </div>

      {/* 非交易時段提示 */}
      {timeframe === 'intraday' && !inTradingHours && (
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
            <p>載入 {ticker} {timeframe === 'daily' ? '日K' : '分K'} 資料中...</p>
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
          <CandlestickChart candles={displayCandles} timeframe={timeframe} target={target} stopLoss={stopLoss} />
        )}

        {/* 無資料 */}
        {!loading && !error && displayCandles && displayCandles.length === 0 && (
          <div className="kline-empty">
            <p>無法取得 {ticker} 的{timeframe === 'daily' ? '日K' : '盤中'}資料</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
