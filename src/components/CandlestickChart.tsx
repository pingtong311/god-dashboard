'use client';

/**
 * 天網 K 線圖查看器 — CandlestickChart 元件
 *
 * 使用 recharts ComposedChart 渲染 K 線圖、SMA 均線、Bollinger Bands、
 * 成交量子圖、MACD 子圖、KD 子圖，以及 Target / StopLoss 水平線。
 * 支援滑鼠滾輪縮放、拖曳平移、觸控雙指縮放與單指拖曳。
 * 新增：同步游標 - 跨所有子圖表同步顯示十字線與價格/時間資訊
 */

import React, { useCallback, useRef, useState, useEffect, createContext, useContext, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { ChartCandle, ChartLayers, ZoomCommand } from '@/types/kline';
import { getCandleColor, clampZoom } from '@/lib/klineUtils';

// ── 預設圖層（未傳入 layers 時） ─────────────────────────
const DEFAULT_LAYERS: ChartLayers = { ma: true, bb: true, macd: true, rsi: false, cdp: false };

// ── Crosshair Context for synchronization across subcharts ───────────────────

interface CrosshairData {
  index: number | null;
  time: string | null;
  price: number | null;
  volume: number | null;
  macd: { dif: number | null; signal: number | null; hist: number | null } | null;
  kd: { k: number | null; d: number | null } | null;
}

interface CrosshairContextValue {
  crosshair: CrosshairData;
  setCrosshair: (data: Partial<CrosshairData>) => void;
  clearCrosshair: () => void;
}

const CrosshairContext = createContext<CrosshairContextValue | null>(null);

export function useCrosshair() {
  const ctx = useContext(CrosshairContext);
  if (!ctx) throw new Error('useCrosshair must be used within CrosshairProvider');
  return ctx;
}

interface CrosshairProviderProps {
  children: React.ReactNode;
  visibleCandles: ChartCandle[];
  timeframe: Timeframe;
}

export function CrosshairProvider({ children, visibleCandles, timeframe }: CrosshairProviderProps) {
  const [crosshair, setCrosshairState] = useState<CrosshairData>({
    index: null,
    time: null,
    price: null,
    volume: null,
    macd: null,
    kd: null,
  });

  // Compute derived values when index changes
  useEffect(() => {
    if (crosshair.index !== null && crosshair.index >= 0 && crosshair.index < visibleCandles.length) {
      const candle = visibleCandles[crosshair.index];
      const time = candle[timeframe === 'daily' ? 'date' : 'time'] || candle.dateRaw || '';
      const price = candle.close;
      const volume = candle.volume;
      const macd = candle.dif != null ? { dif: candle.dif, signal: candle.signal ?? null, hist: candle.hist ?? null } : null;
      const kd = candle.k != null ? { k: candle.k, d: candle.d ?? null } : null;

      setCrosshairState(prev => ({
        ...prev,
        time,
        price,
        volume,
        macd,
        kd,
      }));
    } else {
      setCrosshairState(prev => ({
        ...prev,
        time: null,
        price: null,
        volume: null,
        macd: null,
        kd: null,
      }));
    }
  }, [crosshair.index, visibleCandles, timeframe]);

  const setCrosshair = useCallback((data: Partial<CrosshairData>) => {
    setCrosshairState(prev => ({ ...prev, ...data }));
  }, []);

  const clearCrosshair = useCallback(() => {
    setCrosshairState({
      index: null,
      time: null,
      price: null,
      volume: null,
      macd: null,
      kd: null,
    });
  }, []);

  return (
    <CrosshairContext.Provider value={{ crosshair, setCrosshair, clearCrosshair }}>
      {children}
    </CrosshairContext.Provider>
  );
}

// ── 自訂 Tooltip ───────────────────────────────────────

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KlineTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartCandle;
  if (!d) return null;

  const label = d.date || d.time || d.dateRaw || '';
  const formatNum = (v: unknown, digits = 2) => {
    const n = toFiniteNumber(v, NaN);
    return Number.isFinite(n) ? n.toFixed(digits) : '--';
  };

  return (
    <div className="kline-tooltip">
      <p className="kline-tooltip-date">{label}</p>
      <div className="kline-tooltip-row">
        <span>開</span><span>{formatNum(d.open)}</span>
      </div>
      <div className="kline-tooltip-row">
        <span>高</span><span>{formatNum(d.high)}</span>
      </div>
      <div className="kline-tooltip-row">
        <span>低</span><span>{formatNum(d.low)}</span>
      </div>
      <div className="kline-tooltip-row">
        <span>收</span>
        <span style={{ color: getCandleColor(d.direction) }}>
          {formatNum(d.close)}
        </span>
      </div>
      <div className="kline-tooltip-row">
        <span>量</span><span>{Number.isFinite(toFiniteNumber(d.volume, NaN)) ? toFiniteNumber(d.volume, 0).toLocaleString() : '--'}</span>
      </div>
    </div>
  );
}

// ── 自訂蠟燭 Shape ─────────────────────────────────────

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartCandle;
  background?: { y: number; height: number };
}

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;

  if (!payload || width <= 0) return null;

  const open = toFiniteNumber(payload.open);
  const high = toFiniteNumber(payload.high, open);
  const low = toFiniteNumber(payload.low, open);
  const close = toFiniteNumber(payload.close, open);
  const direction = payload.direction;
  const color = getCandleColor(direction);
  const centerX = x + width / 2;

  const bodyTop = y;
  const bodyBottom = y + height;

  const bodyRange = Math.abs(close - open);
  const pixelsPerUnit = bodyRange > 0 ? height / bodyRange : 0;

  const highY = bodyRange > 0
    ? bodyTop - (high - Math.max(open, close)) * pixelsPerUnit
    : bodyTop - 2;

  const lowY = bodyRange > 0
    ? bodyBottom + (Math.min(open, close) - low) * pixelsPerUnit
    : bodyBottom + 2;

  return (
    <g>
      {/* 上影線 */}
      <line x1={centerX} y1={highY} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
      {/* 蠟燭實體 */}
      <rect x={x + 1} y={bodyTop} width={Math.max(width - 2, 1)} height={Math.max(height, 1)} fill={color} stroke={color} strokeWidth={0.5} />
      {/* 下影線 */}
      <line x1={centerX} y1={bodyBottom} x2={centerX} y2={lowY} stroke={color} strokeWidth={1} />
    </g>
  );
}

// ── MACD Histogram Shape ───────────────────────────────

interface HistShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartCandle;
}

function HistShape(props: HistShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || width <= 0) return null;
  const hist = payload.hist;
  if (hist == null) return null;
  const color = hist >= 0 ? '#ef4444' : '#22c55e';
  return <rect x={x + 1} y={y} width={Math.max(width - 2, 1)} height={Math.max(Math.abs(height), 1)} fill={color} />;
}

// ── Crosshair Reference Lines ──────────────────────────

interface CrosshairLinesProps {
  chartType: 'main' | 'volume' | 'macd' | 'kd';
  yDomain?: [number, number];
  height?: number;
}

function CrosshairLines({ chartType, yDomain, height = 200 }: CrosshairLinesProps) {
  const { crosshair } = useCrosshair();
  const { index, price, volume, macd, kd, time } = crosshair;
  
  if (index === null) return null;

  // For recharts, we use ReferenceLine components which are positioned by data coordinates
  // We'll render them conditionally based on chartType
  const xKey = 'x'; // recharts uses internal x coordinate

  switch (chartType) {
    case 'main':
      return (
        <>
          {price !== null && (
            <ReferenceLine
              y={price}
              stroke="rgba(197,160,89,0.5)"
              strokeWidth={1}
              strokeDasharray="4 4"
              label={{
                value: `${price.toFixed(2)}`,
                fill: 'var(--accent)',
                fontSize: 10,
                position: 'right',
              }}
            />
          )}
          {time && (
            <ReferenceLine
              x={index}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
        </>
      );
    case 'volume':
      return (
        <>
          {volume !== null && (
            <ReferenceLine
              y={volume}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
          {time && (
            <ReferenceLine
              x={index}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
        </>
      );
    case 'macd':
      return (
        <>
          {macd && macd.hist !== null && (
            <ReferenceLine
              y={macd.hist}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
          {time && (
            <ReferenceLine
              x={index}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
        </>
      );
    case 'kd':
      return (
        <>
          {kd && kd.k !== null && (
            <ReferenceLine
              y={kd.k}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
          {time && (
            <ReferenceLine
              x={index}
              stroke="rgba(197,160,89,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
        </>
      );
    default:
      return null;
  }
}

// ── Drawing Types ────────────────────────────────────────

interface Drawing {
  id: string;
  type: 'trendline' | 'horizontal' | 'fibonacci';
  points: { x?: number; y?: number; time: string; price: number }[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

// ── Drawing Overlay Component ──────────────────────────

interface DrawingOverlayProps {
  drawings: Drawing[];
  visibleCandles: ChartCandle[];
  timeframe: Timeframe;
  yDomain: [number, number];
  height: number;
  width: number;
  chartType: 'main' | 'volume' | 'macd' | 'kd';
  activeTool: 'none' | 'trendline' | 'horizontal' | 'fibonacci';
  onAddDrawing?: (drawing: Omit<Drawing, 'id'>) => void;
}

function DrawingOverlay({
  drawings,
  visibleCandles,
  timeframe,
  yDomain,
  height,
  width,
  chartType,
  activeTool,
  onAddDrawing,
}: DrawingOverlayProps) {
  if (chartType !== 'main') return null; // Only render on main chart

  const xKey = timeframe === 'intraday' ? 'time' : 'date';
  const [minPrice, maxPrice] = yDomain;

  // Convert drawing points to SVG coordinates
  const getPointCoords = (point: { x?: number; y?: number; time: string; price: number }) => {
    // If point already has x, y coordinates, use them (but need to adjust for current visible range)
    if (point.x !== undefined && point.y !== undefined) {
      return { x: point.x, y: point.y };
    }
    const candleIndex = visibleCandles.findIndex(c => (c[xKey] || c.dateRaw) === point.time);
    if (candleIndex === -1) return null;
    const x = (candleIndex + 0.5) * (width / Math.max(1, visibleCandles.length));
    const y = ((maxPrice - point.price) / (maxPrice - minPrice)) * height;
    return { x, y };
  };

  return (
    <g>
      {drawings.map(drawing => {
        const coords = drawing.points.map(getPointCoords).filter((c): c is { x: number; y: number } => c !== null);
        if (coords.length < 2) return null;

        const strokeDasharray = drawing.lineStyle === 'dashed' ? '6 4' : drawing.lineStyle === 'dotted' ? '2 4' : undefined;

        if (drawing.type === 'trendline' || drawing.type === 'horizontal') {
          return (
            <line
              key={drawing.id}
              x1={coords[0].x}
              y1={coords[0].y}
              x2={coords[coords.length - 1].x}
              y2={coords[coords.length - 1].y}
              stroke={drawing.color}
              strokeWidth={drawing.lineWidth}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
            />
          );
        }

        if (drawing.type === 'fibonacci' && coords.length >= 2) {
          const [start, end] = coords;
          const priceDiff = end.y - start.y; // Note: y is inverted (0 at top)
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          return (
            <g key={drawing.id}>
              {levels.map((level, i) => {
                const y = start.y + priceDiff * level;
                return (
                  <>
                    <line
                      key={`fib-${i}`}
                      x1={0}
                      y1={y}
                      x2={width}
                      y2={y}
                      stroke={drawing.color}
                      strokeWidth={drawing.lineWidth}
                      strokeDasharray="4 4"
                      opacity={0.7}
                    />
                    <text
                      key={`fib-label-${i}`}
                      x={width - 5}
                      y={y - 2}
                      textAnchor="end"
                      fontSize={10}
                      fill={drawing.color}
                      fontFamily="var(--font-mono)"
                    >
                      {(level * 100).toFixed(1)}%
                    </text>
                  </>
                );
              })}
            </g>
          );
        }

        return null;
      })}

      {/* Active drawing preview */}
      {activeTool !== 'none' && onAddDrawing && (
        <DrawingPreview
          activeTool={activeTool}
          visibleCandles={visibleCandles}
          timeframe={timeframe}
          yDomain={yDomain}
          height={height}
          width={width}
          onComplete={onAddDrawing}
        />
      )}
    </g>
  );
}

// Drawing preview while creating
interface DrawingPreviewProps {
  activeTool: 'trendline' | 'horizontal' | 'fibonacci';
  visibleCandles: ChartCandle[];
  timeframe: Timeframe;
  yDomain: [number, number];
  height: number;
  width: number;
  onComplete: (drawing: Omit<Drawing, 'id'>) => void;
}

function DrawingPreview({
  activeTool,
  visibleCandles,
  timeframe,
  yDomain,
  height,
  width,
  onComplete,
}: DrawingPreviewProps) {
  const [points, setPoints] = useState<{ time: string; price: number }[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const xKey = timeframe === 'intraday' ? 'time' : 'date';
  const [minPrice, maxPrice] = yDomain;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    setMousePos({ x: relX, y: relY });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length >= (activeTool === 'horizontal' ? 1 : 2)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const candleIndex = Math.floor(relX / (width / Math.max(1, visibleCandles.length)));
    const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, candleIndex));
    const candle = visibleCandles[clampedIndex];
    const price = candle.close;
    const time = candle[xKey] || candle.dateRaw || '';

    const newPoints = [...points, { time, price }];
    setPoints(newPoints);

    if (newPoints.length === (activeTool === 'horizontal' ? 1 : 2)) {
      onComplete({
        type: activeTool,
        points: newPoints,
        color: '#c5a059', // gold color
        lineWidth: 2,
        lineStyle: 'solid',
      });
      setPoints([]);
    }
  }, [activeTool, points, visibleCandles, timeframe, width, onComplete]);

  if (points.length === 0 && !mousePos) return null;

  const previewCoords = points.map(p => {
    const candleIndex = visibleCandles.findIndex(c => (c[xKey] || c.dateRaw) === p.time);
    if (candleIndex === -1) return null;
    const x = (candleIndex + 0.5) * (width / Math.max(1, visibleCandles.length));
    const y = ((maxPrice - p.price) / (maxPrice - minPrice)) * height;
    return { x, y };
  }).filter((c): c is { x: number; y: number } => c !== null);

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {previewCoords.length === 1 && mousePos && (
        <line
          x1={previewCoords[0].x}
          y1={previewCoords[0].y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#c5a059"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      )}
      {previewCoords.length === 2 && (
        <line
          x1={previewCoords[0].x}
          y1={previewCoords[0].y}
          x2={previewCoords[1].x}
          y2={previewCoords[1].y}
          stroke="#c5a059"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// ── Main Chart Component ──────────────────────────────

import type { Timeframe } from './KLinePanel';

interface CandlestickChartProps {
  candles: ChartCandle[];
  timeframe: Timeframe;
  target?: number;    // 目標價水平線
  stopLoss?: number;  // 防守價水平線
  drawings?: Drawing[];
  onAddDrawing?: (drawing: Omit<Drawing, 'id'>) => void;
  activeTool?: 'none' | 'trendline' | 'horizontal' | 'fibonacci';
  onCandleHover?: (candle: ChartCandle | null) => void;
  onHoverPositionChange?: (pos: { x: number; y: number } | null) => void;
  /** 圖層開關（chart.md §5.2：均線/布林/MACD/RSI/CDP） */
  layers?: ChartLayers;
  /** 縮放指令（chart.md §5.2：縮小/放大/全覽），nonce 遞增觸發 */
  zoomCmd?: ZoomCommand;
  /** 點擊 K 棒回傳（選中後驅動指標列 §5.3） */
  onCandleSelect?: (candle: ChartCandle) => void;
}

export default function CandlestickChart({ candles, timeframe, target, stopLoss, drawings = [], onAddDrawing, activeTool = 'none', onCandleHover, onHoverPositionChange, layers = DEFAULT_LAYERS, zoomCmd, onCandleSelect }: CandlestickChartProps) {
  // 縮放與平移狀態
  const [visibleCount, setVisibleCount] = useState(() => Math.min(candles.length, 60));
  const [startIndex, setStartIndex] = useState(0);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // 觸控縮放
  const lastTouchDist = useRef<number | null>(null);

  // 當 candles 變化時重置視窗
  useEffect(() => {
    const count = Math.min(candles.length, 60);
    setVisibleCount(count);
    setStartIndex(Math.max(0, candles.length - count));
  }, [candles]);

  // ── 縮放指令（chart.md §5.2：縮小/放大/全覽） ──────────
  useEffect(() => {
    if (!zoomCmd || zoomCmd.nonce === 0) return;
    switch (zoomCmd.action) {
      case 'in': // 縮小：顯示更多 K 棒
        setVisibleCount((prev) => {
          const next = clampZoom(prev + 20);
          setStartIndex((si) => Math.min(si, Math.max(0, candles.length - next)));
          return next;
        });
        break;
      case 'out': // 放大：顯示更少 K 棒（錨定右端最新 K）
        setVisibleCount((prev) => {
          const next = clampZoom(prev - 20);
          setStartIndex(Math.max(0, candles.length - next));
          return next;
        });
        break;
      case 'all': // 全覽：顯示全部
        setVisibleCount(candles.length);
        setStartIndex(0);
        break;
    }
  }, [zoomCmd, candles.length]);

  // 計算可見資料（先於點擊選中回調宣告，供 §5.3 指標列使用）
  const visibleCandles = useMemo(() => candles.slice(startIndex, startIndex + visibleCount), [candles, startIndex, visibleCount]);

  // ── 點擊 K 棒選中（驅動指標列 §5.3） ────────────────────
  const handleChartClick = useCallback((e: React.MouseEvent) => {
    if (!onCandleSelect) return;
    const container = chartContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const candleWidth = rect.width / Math.max(1, visibleCandles.length);
    const index = Math.floor(relX / candleWidth);
    const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, index));
    if (visibleCandles[clampedIndex]) {
      onCandleSelect(visibleCandles[clampedIndex]);
    }
  }, [visibleCandles, onCandleSelect]);

  // RSI 子圖 70/30 警戒參考線已在 RSI ComposedChart 內以 ReferenceLine 繪製

  // ── 滾輪縮放 ──────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 5 : -5;
    setVisibleCount((prev) => {
      const next = clampZoom(prev + delta);
      setStartIndex((si) => {
        const maxStart = Math.max(0, candles.length - next);
        return Math.min(si, maxStart);
      });
      return next;
    });
  }, [candles.length]);

  // ── 拖曳平移 ──────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    setIsDraggingState(true);
    dragStartX.current = e.clientX;
    dragStartIndex.current = startIndex;
  }, [startIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const candleShift = Math.round(-dx / 8);
    const newStart = Math.max(
      0,
      Math.min(
        candles.length - visibleCount,
        dragStartIndex.current + candleShift
      )
    );
    setStartIndex(newStart);
  }, [candles.length, visibleCount]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
  }, []);

  // ── 觸控縮放與拖曳 ────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      setIsDraggingState(true);
      dragStartX.current = e.touches[0].clientX;
      dragStartIndex.current = startIndex;
    }
  }, [startIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = lastTouchDist.current / dist;
      lastTouchDist.current = dist;
      setVisibleCount((prev) => clampZoom(Math.round(prev * ratio)));
    } else if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - dragStartX.current;
      const candleShift = Math.round(-dx / 8);
      const newStart = Math.max(
        0,
        Math.min(
          candles.length - visibleCount,
          dragStartIndex.current + candleShift
        )
      );
      setStartIndex(newStart);
    }
  }, [candles.length, visibleCount]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    isDragging.current = false;
    setIsDraggingState(false);
    lastTouchDist.current = null;
  }, []);

  // ── Mouse tracking for crosshair & hover tooltip ──────────────────────
  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    const container = chartContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    // Approximate index from X position
    const candleWidth = rect.width / Math.max(1, visibleCandles.length);
    const index = Math.floor(relX / candleWidth);
    const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, index));
    // Update crosshair context via custom event
    window.dispatchEvent(new CustomEvent('crosshair-move', { detail: { index: clampedIndex, timeframe } }));
    // Also trigger hover tooltip callback
    if (onCandleHover && visibleCandles[clampedIndex]) {
      onCandleHover(visibleCandles[clampedIndex]);
      onHoverPositionChange?.({ x: relX + 10, y: relY - 120 }); // Offset for tooltip positioning
    }
  }, [visibleCandles.length, timeframe, onCandleHover, onHoverPositionChange]);

  const handleChartMouseLeave = useCallback(() => {
    window.dispatchEvent(new CustomEvent('crosshair-leave'));
    onCandleHover?.(null);
    onHoverPositionChange?.(null);
  }, [onCandleHover, onHoverPositionChange]);

  // Long press detection for touch devices
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleTouchStartForHover = useCallback((e: React.TouchEvent) => {
    // Clear any existing timer
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    
    const touch = e.touches[0];
    const container = chartContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    const relY = touch.clientY - rect.top;
    const candleWidth = rect.width / Math.max(1, visibleCandles.length);
    const index = Math.floor(relX / candleWidth);
    const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, index));
    
    // Start long press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      if (onCandleHover && visibleCandles[clampedIndex]) {
        onCandleHover(visibleCandles[clampedIndex]);
        onHoverPositionChange?.({ x: relX + 10, y: relY - 120 });
      }
    }, 500);
  }, [visibleCandles.length, onCandleHover, onHoverPositionChange]);

  const handleTouchEndForHover = useCallback((e?: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // On touch end, clear hover after a delay
    setTimeout(() => {
      onCandleHover?.(null);
      onHoverPositionChange?.(null);
    }, 1000);
  }, [onCandleHover, onHoverPositionChange]);

  // ── 渲染 ───────────────────────────────────────────────
  if (!candles.length) {
    return <div className="kline-empty"><p>無資料</p></div>;
  }

  // X 軸標籤格式
  const xKey = timeframe === 'intraday' ? 'time' : 'date';

  // Y 軸範圍（加 padding）
  const prices = visibleCandles.flatMap((c) => [c.high, c.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePadding = (maxPrice - minPrice) * 0.05 || 1;
  const yDomain: [number, number] = [
    Math.floor((minPrice - pricePadding) * 100) / 100,
    Math.ceil((maxPrice + pricePadding) * 100) / 100,
  ];

  // 成交量 Y 軸範圍
  const maxVolume = Math.max(...visibleCandles.map((c) => c.volume), 1);

  // MACD Y 軸範圍
  const macdValues = visibleCandles.flatMap((c) => [c.dif, c.signal, c.hist]).filter((v): v is number => v != null);
  const macdMin = macdValues.length ? Math.min(...macdValues) : -1;
  const macdMax = macdValues.length ? Math.max(...macdValues) : 1;
  const macdPad = (macdMax - macdMin) * 0.1 || 0.1;

  // ── 動態版面高度（§5.2 圖層切換：副圖隨圖層開關增减） ──
  const mainHeightPct = 100 - 12 - 10 - (layers.macd ? 12 : 0) - (layers.rsi ? 12 : 0);

  return (
    <CrosshairProvider visibleCandles={visibleCandles} timeframe={timeframe}>
      <div
        ref={chartContainerRef}
        className="kline-chart-wrap"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={onCandleSelect ? handleChartClick : undefined}
        onMouseLeave={handleChartMouseLeave}
        onTouchStart={(e) => { handleTouchStart(e); handleTouchStartForHover(e); }}
        onTouchMove={handleTouchMove}
        onTouchEnd={(e) => { handleTouchEnd(e); handleTouchEndForHover(e); }}
        onMouseEnter={handleChartMouseMove}
        style={{ cursor: isDraggingState ? 'grabbing' : 'crosshair', userSelect: 'none', position: 'relative' }}
      >
        {/* 主圖（K 線 + SMA + 布林 + 水平線），高度隨副圖開關動態調整 */}
        <div style={{ height: `${mainHeightPct}%`, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={visibleCandles}
              margin={{ top: 8, right: 72, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
              <XAxis
                dataKey={xKey}
                tick={{ fill: 'var(--muted)', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: 'var(--muted)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => Number.isFinite(v) ? v.toFixed(1) : '--'}
              />
              <Tooltip content={<KlineTooltip />} />

              <CrosshairLines chartType="main" yDomain={yDomain} />

              {/* Drawing Overlay */}
              <DrawingOverlay
                drawings={drawings}
                visibleCandles={visibleCandles}
                timeframe={timeframe}
                yDomain={yDomain}
                height={400} // approximate, will be scaled by ResponsiveContainer
                width={800}
                chartType="main"
                activeTool={activeTool}
                onAddDrawing={onAddDrawing}
              />

              {/* Bollinger Bands（layers.bb） */}
              {layers.bb && (
                <>
                  <Line type="monotone" dataKey="bbUpper" stroke="rgba(59,130,246,0.5)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="BB Upper" />
                  <Line type="monotone" dataKey="bbMiddle" stroke="rgba(148,163,184,0.6)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="BB Middle" />
                  <Line type="monotone" dataKey="bbLower" stroke="rgba(59,130,246,0.5)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="BB Lower" />
                </>
              )}

              {/* CDP 最佳終點覆蓋線（layers.cdp） */}
              {layers.cdp && (
                <>
                  <Line type="monotone" dataKey="cdpUpper" stroke="rgba(236,72,153,0.6)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="CDP Upper" />
                  <Line type="monotone" dataKey="cdpMiddle" stroke="rgba(148,163,184,0.5)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="CDP Middle" />
                  <Line type="monotone" dataKey="cdpLower" stroke="rgba(34,197,94,0.6)" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} name="CDP Lower" />
                </>
              )}

              {/* 蠟燭實體 */}
              <Bar dataKey="bodyHeight" minPointSize={1} shape={<CandleShape />} isAnimationActive={false}>
                {visibleCandles.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getCandleColor(entry.direction)} />
                ))}
              </Bar>

              {/* SMA 均線（layers.ma，§5.5 顏色：MA5 黃、MA10 綠、MA20 紫） */}
              {layers.ma && (
                <>
                  <Line type="monotone" dataKey="sma5" stroke="#eab308" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="SMA5" />
                  <Line type="monotone" dataKey="sma10" stroke="#22c55e" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="SMA10" />
                  <Line type="monotone" dataKey="sma20" stroke="#a855f7" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="SMA20" />
                  <Line type="monotone" dataKey="sma60" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="SMA60" />
                </>
              )}

              {/* Target 水平線（綠色虛線） */}
              {target != null && (
                <ReferenceLine y={target} stroke="#22c55e" strokeDasharray="4 2" label={{ value: `目標 ${target}`, fill: '#22c55e', fontSize: 10, position: 'right' }} />
              )}

              {/* StopLoss 水平線（紅色虛線） */}
              {stopLoss != null && (
                <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="4 2" label={{ value: `防守 ${stopLoss}`, fill: '#ef4444', fontSize: 10, position: 'right' }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 成交量子圖 12% */}
        <div style={{ height: '12%', marginTop: '2px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleCandles} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
              <XAxis dataKey={xKey} tick={false} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} />
              <YAxis domain={[0, maxVolume * 1.1]} tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => {
                const value = toFiniteNumber(v, NaN);
                if (!Number.isFinite(value)) return '--';
                if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
                return String(value);
              }} />
              <CrosshairLines chartType="volume" />
              <Bar dataKey="volume" isAnimationActive={false}>
                {visibleCandles.map((entry, index) => (
                  <Cell key={`vol-${index}`} fill={entry.direction === 'up' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* MACD 子圖 10%（§5.4 副圖 MACD；依圖層 layers.macd 開關） */}
        {layers.macd && (
        <div style={{ height: '12%', marginTop: '2px' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.1em' }}>MACD</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleCandles} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
              <XAxis dataKey={xKey} tick={false} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} />
              <YAxis domain={[macdMin - macdPad, macdMax + macdPad]} tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => Number.isFinite(v) ? v.toFixed(2) : '--'} />
              <CrosshairLines chartType="macd" />
              <Bar dataKey="hist" isAnimationActive={false} shape={<HistShape />}>
                {visibleCandles.map((entry, index) => (
                  <Cell key={`hist-${index}`} fill={(entry.hist ?? 0) >= 0 ? '#ef4444' : '#22c55e'} />
                ))}
              </Bar>
              {/* §5.5 顏色：DIF 粉、DEA 藍 */}
              <Line type="monotone" dataKey="dif" stroke="#ec4899" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="DIF" />
              <Line type="monotone" dataKey="signal" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="DEA" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}

        {/* RSI 子圖 12%（§5.2 圖層 RSI；依 layers.rsi 開關） */}
        {layers.rsi && (
        <div style={{ height: '12%', marginTop: '2px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.1em' }}>RSI</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleCandles} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
              <XAxis dataKey={xKey} tick={false} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={56} ticks={[0, 30, 50, 70, 100]} />
              <ReferenceLine y={70} stroke="rgba(239,68,68,0.35)" strokeDasharray="4 4" />
              <ReferenceLine y={30} stroke="rgba(34,197,94,0.35)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="rsi" stroke="#c084fc" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="RSI" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}

        {/* KD 子圖 10% */}
        <div style={{ height: '10%', marginTop: '2px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleCandles} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
              <XAxis dataKey={xKey} tick={false} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={56} ticks={[0, 20, 50, 80, 100]} />
              <CrosshairLines chartType="kd" />
              <Line type="monotone" dataKey="k" stroke="#eab308" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="K" />
              <Line type="monotone" dataKey="d" stroke="#f97316" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} name="D" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 圖例區域（§5.5：MA5 MA10 MA20 DIF DEA，依圖層開關顯示） */}
        <div className="kline-legend">
          {layers.ma && (
            <>
              <span style={{ color: '#eab308' }}>● MA5</span>
              <span style={{ color: '#22c55e' }}>● MA10</span>
              <span style={{ color: '#a855f7' }}>● MA20</span>
              <span style={{ color: '#3b82f6' }}>● MA60</span>
            </>
          )}
          {layers.bb && (
            <>
              <span style={{ color: 'rgba(59,130,246,0.8)' }}>● BB Upper</span>
              <span style={{ color: 'rgba(59,130,246,0.8)' }}>● BB Lower</span>
            </>
          )}
          {layers.cdp && (
            <>
              <span style={{ color: 'rgba(236,72,153,0.8)' }}>● CDP 上</span>
              <span style={{ color: 'rgba(34,197,94,0.8)' }}>● CDP 下</span>
            </>
          )}
          {layers.macd && (
            <>
              <span style={{ color: '#ec4899' }}>● DIF</span>
              <span style={{ color: '#3b82f6' }}>● DEA</span>
            </>
          )}
          {layers.rsi && <span style={{ color: '#c084fc' }}>● RSI</span>}
          <span style={{ color: '#eab308' }}>● KD K</span>
          <span style={{ color: '#f97316' }}>● KD D</span>
        </div>
      </div>
    </CrosshairProvider>
  );
}