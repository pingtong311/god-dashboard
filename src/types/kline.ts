/**
 * 天網 K 線圖查看器 — 共用型別定義
 */

// ── 基礎 K 線資料 ──────────────────────────────────────

/** API 回傳的原始 K 線資料（daily 或 intraday） */
export interface Candle {
  date?: string;    // Daily K: 'YYYY-MM-DD'
  time?: string;    // Intraday K: 'HH:MM'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 前端標準化後的 K 線資料（含計算欄位） */
export interface ChartCandle {
  // 時間軸
  date?: string;    // Daily: 'MM/DD'（顯示用）
  time?: string;    // Intraday: 'HH:MM'（顯示用）
  dateRaw: string;  // 原始日期字串（排序用）

  // OHLCV
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  // 計算欄位（CandlestickChart 使用）
  bodyLow: number;    // min(open, close)
  bodyHigh: number;   // max(open, close)
  bodyHeight: number; // |close - open|
  direction: 'up' | 'down' | 'flat';

  // SMA（由 KLinePanel 計算後注入）
  sma5?: number | null;
  sma10?: number | null;
  sma20?: number | null;
  sma60?: number | null;

  // MACD（由 KLinePanel 計算後注入）
  dif?: number | null;
  signal?: number | null;
  hist?: number | null;

  // KD（由 KLinePanel 計算後注入）
  k?: number | null;
  d?: number | null;

  // Bollinger Bands（由 KLinePanel 計算後注入）
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;

  // RSI（由 KLinePanel 計算後注入）
  rsi?: number | null;

  // CDP 最佳終點（由 KLinePanel 計算後注入）
  cdpUpper?: number | null;
  cdpMiddle?: number | null;
  cdpLower?: number | null;

  // BIAS（由 KLinePanel 計算後注入）
  bias6?: number | null;
  bias12?: number | null;
  bias24?: number | null;
}

// ── API 回應格式 ───────────────────────────────────────

/** /api/skynet/kline?type=daily 或 type=intraday 的回應 */
export interface CandlesResponse {
  candles: Candle[];
}

/** /api/skynet/kline?type=quote 的回應 */
export interface QuoteResponse {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

/** API 錯誤回應 */
export interface ErrorResponse {
  error:
    | 'invalid_ticker'
    | 'invalid_type'
    | 'upstream_error'
    | 'rate_limit_exceeded'
    | 'upstream_timeout'
    | 'api_key_not_configured';
}

// ── 元件狀態 ───────────────────────────────────────────

/** KLinePanel 內部狀態 */
export interface KLinePanelState {
  timeframe: 'daily' | 'intraday';
  dailyCandles: ChartCandle[] | null;
  intradayCandles: ChartCandle[] | null;
  quote: QuoteResponse | null;
  loading: boolean;
  quoteLoading: boolean;
  error: string | null;
  quoteError: boolean;
}

/** 快取條目 */
export interface CacheEntry {
  data: ChartCandle[];
  timestamp: number;  // Date.now()
}

// ── API 請求參數 ───────────────────────────────────────

/** /api/skynet/kline 的查詢參數 */
export interface KlineQueryParams {
  ticker: string;
  type: 'daily' | 'intraday' | 'quote';
}
