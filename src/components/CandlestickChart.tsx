'use client';

/**
 * 天網 K 線圖查看器 — CandlestickChart 元件
 *
 * 使用 recharts ComposedChart 渲染 K 線圖、SMA 均線、Bollinger Bands、
 * 成交量子圖、MACD 子圖、KD 子圖，以及 Target / StopLoss 水平線。
 * 支援滑鼠滾輪縮放、拖曳平移、觸控雙指縮放與單指拖曳。
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
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
import type { ChartCandle } from '@/types/kline';
import { getCandleColor, clampZoom } from '@/lib/klineUtils';

// ── Props ──────────────────────────────────────────────

interface CandlestickChartProps {
  candles: ChartCandle[];
  timeframe: 'daily' | 'intraday';
  target?: number;    // 目標價水平線
  stopLoss?: number;  // 防守價水平線
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// ── 自訂 Tooltip ───────────────────────────────────────

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
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    payload,
  } = props;

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
      <line
        x1={centerX}
        y1={highY}
        x2={centerX}
        y2={bodyTop}
        stroke={color}
        strokeWidth={1}
      />
      {/* 蠟燭實體 */}
      <rect
        x={x + 1}
        y={bodyTop}
        width={Math.max(width - 2, 1)}
        height={Math.max(height, 1)}
        fill={color}
        stroke={color}
        strokeWidth={0.5}
      />
      {/* 下影線 */}
      <line
        x1={centerX}
        y1={bodyBottom}
        x2={centerX}
        y2={lowY}
        stroke={color}
        strokeWidth={1}
      />
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
  return (
    <rect
      x={x + 1}
      y={y}
      width={Math.max(width - 2, 1)}
      height={Math.max(Math.abs(height), 1)}
      fill={color}
    />
  );
}

// ── 主元件 ─────────────────────────────────────────────

export default function CandlestickChart({ candles, timeframe, target, stopLoss }: CandlestickChartProps) {
  // 縮放與平移狀態
  const [visibleCount, setVisibleCount] = useState(() => Math.min(candles.length, 60));
  const [startIndex, setStartIndex] = useState(0);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);

  // 觸控縮放
  const lastTouchDist = useRef<number | null>(null);

  // 當 candles 變化時重置視窗
  useEffect(() => {
    const count = Math.min(candles.length, 60);
    setVisibleCount(count);
    setStartIndex(Math.max(0, candles.length - count));
  }, [candles]);

  // 計算可見資料
  const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);

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

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
    lastTouchDist.current = null;
  }, []);

  // ── 渲染 ───────────────────────────────────────────────

  if (!candles.length) {
    return (
      <div className="kline-empty">
        <p>無資料</p>
      </div>
    );
  }

  // X 軸標籤格式
  const xKey = timeframe === 'daily' ? 'date' : 'time';

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

  return (
    <div
      className="kline-chart-wrap"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: isDraggingState ? 'grabbing' : 'grab', userSelect: 'none' }}
    >
      {/* 主圖（K 線 + SMA + Bollinger Bands + 水平線）68% */}
      <div style={{ height: '68%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleCandles}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
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

            {/* Bollinger Bands */}
            <Line
              type="monotone"
              dataKey="bbUpper"
              stroke="rgba(59,130,246,0.5)"
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="BB Upper"
            />
            <Line
              type="monotone"
              dataKey="bbMiddle"
              stroke="rgba(148,163,184,0.6)"
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="BB Middle"
            />
            <Line
              type="monotone"
              dataKey="bbLower"
              stroke="rgba(59,130,246,0.5)"
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="BB Lower"
            />

            {/* 蠟燭實體 */}
            <Bar
              dataKey="bodyHeight"
              minPointSize={1}
              shape={<CandleShape />}
              isAnimationActive={false}
            >
              {visibleCandles.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getCandleColor(entry.direction)}
                />
              ))}
            </Bar>

            {/* SMA 均線 */}
            <Line
              type="monotone"
              dataKey="sma5"
              stroke="#eab308"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="SMA5"
            />
            <Line
              type="monotone"
              dataKey="sma10"
              stroke="#f97316"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="SMA10"
            />
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#a855f7"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="SMA20"
            />
            <Line
              type="monotone"
              dataKey="sma60"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="SMA60"
            />

            {/* Target 水平線（綠色虛線） */}
            {target != null && (
              <ReferenceLine
                y={target}
                stroke="#22c55e"
                strokeDasharray="4 2"
                label={{ value: `目標 ${target}`, fill: '#22c55e', fontSize: 10, position: 'right' }}
              />
            )}

            {/* StopLoss 水平線（紅色虛線） */}
            {stopLoss != null && (
              <ReferenceLine
                y={stopLoss}
                stroke="#ef4444"
                strokeDasharray="4 2"
                label={{ value: `防守 ${stopLoss}`, fill: '#ef4444', fontSize: 10, position: 'right' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 成交量子圖 12% */}
      <div style={{ height: '12%', marginTop: '2px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleCandles}
            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
            <XAxis
              dataKey={xKey}
              tick={false}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            />
              <YAxis
                domain={[0, maxVolume * 1.1]}
                tick={{ fill: 'var(--muted)', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => {
                const value = toFiniteNumber(v, NaN);
                if (!Number.isFinite(value)) return '--';
                if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
                return String(value);
                }}
              />
            <Bar
              dataKey="volume"
              isAnimationActive={false}
            >
              {visibleCandles.map((entry, index) => (
                <Cell
                  key={`vol-${index}`}
                  fill={entry.direction === 'up' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MACD 子圖 10% */}
      <div style={{ height: '10%', marginTop: '2px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleCandles}
            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
            <XAxis
              dataKey={xKey}
              tick={false}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            />
              <YAxis
              domain={[macdMin - macdPad, macdMax + macdPad]}
              tick={{ fill: 'var(--muted)', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => Number.isFinite(v) ? v.toFixed(2) : '--'}
            />
            {/* HIST 柱狀圖（正值紅色、負值綠色） */}
            <Bar
              dataKey="hist"
              isAnimationActive={false}
              shape={<HistShape />}
            >
              {visibleCandles.map((entry, index) => (
                <Cell
                  key={`hist-${index}`}
                  fill={(entry.hist ?? 0) >= 0 ? '#ef4444' : '#22c55e'}
                />
              ))}
            </Bar>
            {/* DIF 線 */}
            <Line
              type="monotone"
              dataKey="dif"
              stroke="#00f0ff"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="DIF"
            />
            {/* SIGNAL 線 */}
            <Line
              type="monotone"
              dataKey="signal"
              stroke="#f97316"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="SIGNAL"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* KD 子圖 10% */}
      <div style={{ height: '10%', marginTop: '2px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleCandles}
            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
            <XAxis
              dataKey={xKey}
              tick={false}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--muted)', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={56}
              ticks={[0, 20, 50, 80, 100]}
            />
            {/* K 線（黃色） */}
            <Line
              type="monotone"
              dataKey="k"
              stroke="#eab308"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="K"
            />
            {/* D 線（橘色） */}
            <Line
              type="monotone"
              dataKey="d"
              stroke="#f97316"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="D"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 圖例區域 */}
      <div className="kline-legend">
        {/* SMA */}
        <span style={{ color: '#eab308' }}>● SMA5</span>
        <span style={{ color: '#f97316' }}>● SMA10</span>
        <span style={{ color: '#a855f7' }}>● SMA20</span>
        <span style={{ color: '#3b82f6' }}>● SMA60</span>
        {/* Bollinger Bands */}
        <span style={{ color: 'rgba(59,130,246,0.8)' }}>● BB Upper</span>
        <span style={{ color: 'rgba(59,130,246,0.8)' }}>● BB Lower</span>
        {/* MACD */}
        <span style={{ color: '#00f0ff' }}>● MACD DIF</span>
        <span style={{ color: '#f97316' }}>● MACD SIG</span>
        {/* KD */}
        <span style={{ color: '#eab308' }}>● KD K</span>
        <span style={{ color: '#f97316' }}>● KD D</span>
      </div>
    </div>
  );
}
