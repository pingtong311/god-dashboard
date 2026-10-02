/**
 * God K 線圖查看器 — 純函式工具庫
 *
 * 所有函式均為純函式（無副作用），方便單元測試與屬性測試。
 */

import type { ChartCandle } from '@/types/kline';

// ── 蠟燭方向與顏色 ─────────────────────────────────────

/**
 * 判斷蠟燭方向
 * @param open  開盤價
 * @param close 收盤價
 * @returns 'up' | 'down' | 'flat'
 */
export function getCandleDirection(open: number, close: number): 'up' | 'down' | 'flat' {
  if (close > open) return 'up';
  if (close < open) return 'down';
  return 'flat';
}

/**
 * 依蠟燭方向取得顏色（台股慣例：上漲紅、下跌綠、平盤橘）
 * @param direction 蠟燭方向
 * @returns 顏色字串（hex）
 */
export function getCandleColor(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return '#ef4444';
  if (direction === 'down') return '#22c55e';
  return '#f97316';
}

// ── 日期格式化 ─────────────────────────────────────────

/**
 * 將 'YYYY-MM-DD' 格式的日期字串轉換為 'MM/DD' 顯示格式
 * @param dateStr 'YYYY-MM-DD' 格式的日期字串
 * @returns 'MM/DD' 格式字串
 */
export function formatDateLabel(dateStr: string): string {
  // 支援 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:MM:SS+08:00' 格式
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length < 3) return dateStr;
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');
  return `${month}/${day}`;
}

// ── 交易時段判斷 ───────────────────────────────────────

/**
 * 判斷是否在台股交易時段（台北時間 09:00–13:30）
 * @param hour   台北時間小時（0–23）
 * @param minute 台北時間分鐘（0–59）
 * @returns true 若在交易時段內
 */
export function isInTradingHours(hour: number, minute: number): boolean {
  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60;       // 09:00 = 540
  const closeMinutes = 13 * 60 + 30; // 13:30 = 810
  return totalMinutes >= openMinutes && totalMinutes <= closeMinutes;
}

// ── 縮放範圍限制 ───────────────────────────────────────

/**
 * 將縮放值限制在 [20, 120] 範圍內
 * @param value 輸入縮放值
 * @returns 限制後的整數值
 */
export function clampZoom(value: number): number {
  const clamped = Math.max(20, Math.min(120, value));
  return Math.round(clamped);
}

// ── 快取 TTL 判斷 ──────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘（毫秒）

/**
 * 判斷快取是否仍有效（TTL 5 分鐘）
 * @param timestamp 快取建立時間（Date.now()）
 * @param now       當前時間（Date.now()）
 * @returns true 若快取仍有效
 */
export function isCacheValid(timestamp: number, now: number): boolean {
  return now - timestamp < CACHE_TTL;
}

// ── 盤中 K 棒過濾 ──────────────────────────────────────

/**
 * 過濾掉當前分鐘及之後的 K 棒（只保留已完成的分鐘 K 線）
 * @param candles K 棒陣列（每個元素需有 time 欄位，格式 'HH:MM'）
 * @param now     當前時間戳記（毫秒，Date.now()）
 * @returns 過濾後的 K 棒陣列
 */
export function filterCompletedCandles(
  candles: ChartCandle[],
  now: number
): ChartCandle[] {
  // 當前分鐘起始點（floor 到分鐘）
  const currentMinuteStart = Math.floor(now / 60000) * 60000;

  return candles.filter((candle) => {
    const timeStr = candle.time || candle.dateRaw;
    if (!timeStr) return true;

    // 解析時間字串為今日的時間戳記
    const candleTs = parseCandleTimestamp(timeStr, now);
    if (candleTs === null) return true;

    return candleTs < currentMinuteStart;
  });
}

/**
 * 將 K 棒時間字串解析為時間戳記（毫秒）
 * 支援 'HH:MM' 和 ISO 8601 格式
 */
function parseCandleTimestamp(timeStr: string, now: number): number | null {
  // ISO 8601 格式（如 '2024-01-15T09:30:00+08:00'）
  if (timeStr.includes('T')) {
    const ts = new Date(timeStr).getTime();
    return isNaN(ts) ? null : ts;
  }

  // 'HH:MM' 格式 — 組合成今日日期
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const nowDate = new Date(now);
    const year = nowDate.getFullYear();
    const month = String(nowDate.getMonth() + 1).padStart(2, '0');
    const day = String(nowDate.getDate()).padStart(2, '0');
    const ts = new Date(`${year}-${month}-${day}T${match[1].padStart(2, '0')}:${match[2]}:00+08:00`).getTime();
    return isNaN(ts) ? null : ts;
  }

  return null;
}

// ── 漲跌幅顏色 ─────────────────────────────────────────

/**
 * 依漲跌幅取得顏色（台股慣例：正紅負綠零灰）
 * @param changePercent 漲跌幅（百分比數值，如 2.5 代表 +2.5%）
 * @returns 顏色字串（hex）
 */
export function getChangeColor(changePercent: number): string {
  if (changePercent > 0) return '#ef4444';  // 紅色（上漲）
  if (changePercent < 0) return '#22c55e';  // 綠色（下跌）
  return '#94a3b8';                          // 灰色（平盤）
}

// ── 資料截取 ───────────────────────────────────────────

/**
 * 取最後 maxCount 筆 K 棒資料
 * @param candles  K 棒陣列
 * @param maxCount 最大筆數
 * @returns 截取後的陣列（取末尾 maxCount 筆）
 */
export function sliceCandles<T>(candles: T[], maxCount: number): T[] {
  if (candles.length <= maxCount) return candles;
  return candles.slice(candles.length - maxCount);
}
