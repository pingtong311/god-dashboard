/**
 * TWSE T86 三大法人買賣超（個股）代理
 * GET /api/skynet/t86?tickers=2330,0050
 * GET /api/skynet/t86                （省略 tickers → 回傳全市場，1377 筆）
 * GET /api/skynet/t86?tickers=2330&date=20260918   （指定日期，供歷史區間呼叫端使用）
 *
 * 職責：
 * - 代理證交所「三大法人買賣超日報」T86，提供**個股層級**的法人買賣超（張）
 * - 未指定 date 時，自動回推至最近一個有資料的交易日（最多 10 天）
 * - 標準化為一致的 JSON 形狀，並把單位從「股」換算為「張」
 *
 * 為什麼需要這支：專案原有的 /api/skynet/opendata?type=institutional 只回**全市場加總**，
 * 無法判斷「某一檔個股當日是否被法人買超」。/radar 與 /watchlist 都需要個股層級資料。
 *
 * 欄位索引（實測 2026-09-18，19 欄）：
 *   0 證券代號  1 證券名稱
 *   2/3/4   外陸資 買進/賣出/買賣超（不含外資自營商）  → 外資取 index 4
 *   5/6/7   外資自營商 買進/賣出/買賣超
 *   8/9/10  投信 買進/賣出/買賣超                      → 投信取 index 10
 *   11      自營商買賣超股數（合計＝自行買賣＋避險）    → 自營商取 index 11
 *   12/13/14 自營商 自行買賣 買進/賣出/買賣超
 *   15/16/17 自營商 避險 買進/賣出/買賣超
 *   18      三大法人買賣超股數                          → 合計取 index 18
 *
 * 驗算（2330，2026-09-18）：
 *   6,039,352（外資）+ 478,401（投信）+ 1,361,432（自營商 index 11）= 7,879,185 = index 18 ✅
 *   註：index 14 只有「自行買賣」不含避險，故自營商不可用 index 14。
 */

import { NextRequest, NextResponse } from 'next/server';

const TWSE_BASE = 'https://www.twse.com.tw/rwd/zh/fund/T86';
const FETCH_TIMEOUT_MS = 8_000;
const LOOKBACK_DAYS = 10;

export interface T86Item {
  symbol: string;
  name: string;
  foreignNet: number; // 張
  trustNet: number;   // 張
  dealerNet: number;  // 張
  totalNet: number;   // 張
}

export interface T86Response {
  tradeDate: string; // YYYY-MM-DD
  items: T86Item[];
  fetchedAt: string;
}

/** 產生證交所 rwd 端點要的西元日期（YYYYMMDD）。 */
function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 把 "20260918" 轉成 "2026-09-18"。 */
function formatDisplayDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 解析含千分位逗號的股數字串 → 張（四捨五入）。 */
function toLots(raw: unknown): number {
  const n = Number(String(raw ?? '0').replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 1000);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        // 證交所會檢查 Referer；實測只帶 UA 時，抓「非最新」日期會回 HTTP 428（限流）。
        Referer: 'https://www.twse.com.tw/zh/trading/foreign/t86.html',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

interface T86Raw {
  stat?: string;
  date?: string;
  fields?: string[];
  data?: string[][];
}

/**
 * 取得 T86 資料。
 * - 未指定 date：從今天往回找最近一個有資料的交易日（最多 LOOKBACK_DAYS 天）。
 * - 指定 date（YYYYMMDD）：只試該日，抓不到就回 null（供「歷史區間」呼叫端使用）。
 */
async function fetchLatestT86(date?: string): Promise<{ raw: T86Raw; ymd: string } | null> {
  if (date) {
    if (!/^\d{8}$/.test(date)) return null;
    try {
      const res = await fetchWithTimeout(`${TWSE_BASE}?response=json&date=${date}&selectType=ALLBUT0999`);
      if (!res.ok) return null;
      const raw = (await res.json()) as T86Raw;
      if (raw?.stat === 'OK' && Array.isArray(raw.data) && raw.data.length > 0) {
        return { raw, ymd: date };
      }
    } catch {
      return null;
    }
    return null;
  }

  const now = new Date();
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const ymd = formatTwseDate(d);
    try {
      const res = await fetchWithTimeout(`${TWSE_BASE}?response=json&date=${ymd}&selectType=ALLBUT0999`);
      if (!res.ok) continue;
      const raw = (await res.json()) as T86Raw;
      if (raw?.stat === 'OK' && Array.isArray(raw.data) && raw.data.length > 0) {
        return { raw, ymd };
      }
    } catch {
      // 單日失敗就繼續往回找，不中斷整體流程。
      continue;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get('tickers') ?? '';
  const dateParam = searchParams.get('date')?.trim();
  const requested = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const requestedSet = new Set(requested);

  try {
    const found = await fetchLatestT86(dateParam);
    if (!found) {
      return NextResponse.json({ error: 't86_upstream_error' }, { status: 502 });
    }

    const { raw, ymd } = found;
    const rows = raw.data ?? [];

    const allItems: T86Item[] = rows
      // 跳過欄位數不足的畸形列（防禦上游格式變動）
      .filter((row) => Array.isArray(row) && row.length >= 19)
      .map((row) => ({
        symbol: String(row[0] ?? '').trim(),
        name: String(row[1] ?? '').trim(),
        foreignNet: toLots(row[4]),
        trustNet: toLots(row[10]),
        dealerNet: toLots(row[11]),
        totalNet: toLots(row[18]),
      }))
      .filter((item) => item.symbol.length > 0);

    // 未指定 tickers → 回傳全市場；否則只回傳被查詢的個股。
    const items =
      requestedSet.size === 0 ? allItems : allItems.filter((item) => requestedSet.has(item.symbol));

    const body: T86Response = {
      tradeDate: formatDisplayDate(raw.date || ymd),
      items,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 't86_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 't86_fetch_error' }, { status: 500 });
  }
}
