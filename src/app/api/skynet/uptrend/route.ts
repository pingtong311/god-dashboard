/**
 * /chart「上上升勢」榜 — TWSE 公開日K 代理路由
 *
 * GET /api/skynet/uptrend?tickers=8046,8072,2327,6224,6187
 *
 * 資料源：TWSE OpenAPI（公開資料，不造假）
 *   - 日K：https://openapi.twse.com.tw/v1/exchangeReport/MI_DAILYKLINE?symbol={代號}&period=3&dateStart=...
 *   - 日收盤價：STOCK_DAY_AVG_ALL（補 收盤／前收）
 * 任一來源失敗 → 200 + candles: []（前端顯示「TWSE 未取得」，不造假）。
 */

import { NextRequest, NextResponse } from 'next/server';

const TWSE_OPENAPI_BASE = 'https://openapi.twse.com.tw/v1/exchangeReport';

/** 預設榜：chart.md §2 表列的股票（代號逐字取自 f_0001 截圖：基群/聯陽/國巨/禾欣/群創）。 */
const DEFAULT_TICKERS = ['8046', '8072', '2327', '6224', '6187'];

/** 日K 拉取跨度：最近 3 個月（TWSE period 支援 1/3/6/9/12 個月）。 */
const PERIOD_MONTHS = 3;

export interface DailyKlineCandle {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface UptrendTickerResult {
  /** 代號（TWSE 原代號） */
  code: string;
  /** 中文名（TWSE 回傳；缺時回傳代號本身，不造假） */
  name: string | null;
  /** 日K（最舊在前）；未取得時為空陣列 */
  candles: DailyKlineCandle[];
}

export interface UptrendResponse {
  tickers: UptrendTickerResult[];
  /** 資料取得時間（ISO）；全部失敗時為 null */
  fetchedAt: string | null;
}

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toYMD(value: unknown): string | null {
  // TWSE 日K date 欄位為 'YYYYMMDD'
  const s = String(value ?? '');
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 本地日 → TWSE 'YYYYMMDD'（UTC+8）。 */
function toTaipeiYmd(date: Date): string {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

interface TwsedailyklineRow {
  date?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

interface TwseStockDayAvgRow {
  Code?: string;
  Name?: string;
  ClosingPrice?: string;
}

async function fetchCandlesForTicker(code: string, dateStart: string): Promise<DailyKlineCandle[] | null> {
  const url = `${TWSE_OPENAPI_BASE}/MI_DAILYKLINE?symbol=${encodeURIComponent(
    code
  )}&period=${PERIOD_MONTHS}&dateStart=${dateStart}`;
  const rows = await fetchJsonWithTimeout<TwsedailyklineRow[]>(url, 8_000);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const candles: DailyKlineCandle[] = [];
  for (const row of rows) {
    const date = toYMD(row.date);
    if (!date) continue;
    const close = parseNumber(row.close);
    if (close <= 0) continue;
    candles.push({
      date,
      open: parseNumber(row.open),
      high: parseNumber(row.high),
      low: parseNumber(row.low),
      close,
      volume: parseNumber(row.volume),
    });
  }
  // TWSE 回傳為由新到舊；反轉為最舊在前
  candles.reverse();
  return candles.length > 0 ? candles : null;
}

/** 補股票中文名：STOCK_DAY_AVG_ALL 一次取全市場。失敗時回傳空 Map（name 顯示 null，不造假）。 */
async function fetchTickerNames(codes: string[]): Promise<Map<string, string>> {
  const rows = await fetchJsonWithTimeout<TwseStockDayAvgRow[]>(
    `${TWSE_OPENAPI_BASE}/STOCK_DAY_AVG_ALL`,
    8_000
  );
  const map = new Map<string, string>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const code = String(row.Code ?? '').trim();
      const name = String(row.Name ?? '').trim();
      if (code && name) map.set(code, name);
    }
  }
  void codes;
  return map;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const param = searchParams.get('tickers') ?? '';
  const requested = param
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^\d{4}$/.test(t));
  const tickers = requested.length > 0 ? requested : DEFAULT_TICKERS;

  const dateStart = toTaipeiYmd(new Date(Date.now() - PERIOD_MONTHS * 30 * 24 * 60 * 60 * 1000));

  const [nameMap, candleResults] = await Promise.all([
    fetchTickerNames(tickers),
    Promise.all(tickers.map(async (code) => fetchCandlesForTicker(code, dateStart))),
  ]);

  const items: UptrendTickerResult[] = tickers.map((code, i) => ({
    code,
    name: nameMap.get(code) ?? null,
    candles: candleResults[i] ?? [],
  }));

  const body: UptrendResponse = {
    tickers: items,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
