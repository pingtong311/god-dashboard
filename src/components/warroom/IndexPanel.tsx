'use client';

import { TrendingUp, TrendingDown, Minus, WifiOff, Clock } from 'lucide-react';
import { getTwseColorClass } from '@/lib/colorUtils';

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  isTrading: boolean;
  timestamp?: string;
  tradeDate?: string;
  source?: 'twse-mis-live' | 'twse-openapi-fallback';
}

function safeFixed(value: unknown, digits: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

interface IndexPanelProps {
  quotes: IndexQuote[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  isTrading: boolean;
}

function QuoteCard({ quote }: { quote: IndexQuote }) {
  const colorClass = getTwseColorClass(quote.changePercent);
  const Icon = quote.changePercent > 0 ? TrendingUp : quote.changePercent < 0 ? TrendingDown : Minus;

  return (
    <div className="index-quote-card">
      <div className="index-quote-header">
        <span className="index-quote-name">{quote.name}</span>
        <span className="index-quote-symbol text-gray-500 text-xs">{quote.symbol}</span>
      </div>
      <div className={`index-quote-price ${colorClass}`}>
        {quote.price > 0 ? quote.price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
      </div>
      <div className={`index-quote-change ${colorClass} flex items-center gap-1`}>
        <Icon size={13} />
        <span>
          {quote.change > 0 ? '+' : ''}{safeFixed(quote.change, 2)}
          {' '}({quote.changePercent > 0 ? '+' : ''}{safeFixed(quote.changePercent, 2)}%)
        </span>
      </div>
      <div className="index-quote-meta">
        <span className={quote.source === 'twse-mis-live' ? 'live' : 'stale'}>
          {quote.source === 'twse-mis-live' ? 'LIVE' : '日資料'}
        </span>
        {(quote.tradeDate || quote.timestamp) && (
          <small>{[quote.tradeDate, quote.timestamp].filter(Boolean).join(' ')}</small>
        )}
      </div>
    </div>
  );
}

export default function IndexPanel({ quotes, loading, error, lastUpdated, isTrading }: IndexPanelProps) {
  return (
    <div className="warroom-panel">
      <div className="warroom-panel-header">
        <TrendingUp size={16} className="text-cyan-400" />
        <span className="warroom-panel-title">大盤指數</span>
        {!isTrading && (
          <span className="pill muted ml-2 text-xs"><Clock size={12} /> 非交易時段</span>
        )}
        {lastUpdated && (
          <span className="text-gray-600 text-xs ml-auto">{lastUpdated}</span>
        )}
      </div>

      {loading && (
        <div className="warroom-panel-loading">載入指數中...</div>
      )}

      {error && !loading && (
        <div className="warroom-panel-error">
          <WifiOff size={14} />
          <span>指數資料源異常，請稍後重試</span>
        </div>
      )}

      {!loading && !error && quotes.length === 0 && (
        <div className="warroom-panel-empty">目前尚無指數資料</div>
      )}

      {!loading && !error && quotes.length > 0 && (
        <div className="index-quotes-grid">
          {quotes.map(q => <QuoteCard key={q.symbol} quote={q} />)}
        </div>
      )}
    </div>
  );
}
