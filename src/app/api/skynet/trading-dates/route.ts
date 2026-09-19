/**
 * 近期交易日清單 API
 * 供前端日期切換器下拉選單使用。
 *
 * GET /api/skynet/trading-dates?count=30
 * 回傳：{ ok: true, dates: ['2026-09-17', '2026-09-16', ...], current: '2026-09-17' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadMarketOverview, MarketOverviewError, resolveLatestTradingDate } from '@/lib/marketOverview';

const MAX_LOOKBACK_DAYS = 60; // 最多往前找 60 個自然日
const DEFAULT_COUNT = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const countParam = searchParams.get('count');
  const count = countParam ? Math.min(parseInt(countParam, 10), 60) : DEFAULT_COUNT;

  if (!Number.isFinite(count) || count < 1) {
    return NextResponse.json(
      { error: 'invalid_count', message: 'count must be 1-60' },
      { status: 400 }
    );
  }

  try {
    // 取得最新交易日
    const latest = await resolveLatestTradingDate();
    if (!latest) {
      return NextResponse.json(
        { error: 'no_trading_date', message: '無法取得最新交易日' },
        { status: 502 }
      );
    }

    const dates: string[] = [latest];
    let current = latest;

    // 往前逐日探測，直到湊齊 count 個交易日或達到上限
    for (let i = 1; dates.length < count && i < MAX_LOOKBACK_DAYS; i++) {
      const candidate = shiftYmd(current, -1);
      try {
        const overview = await loadMarketOverview(candidate);
        if (Number.isFinite(overview.indexClose.price) && overview.indexClose.price > 0) {
          dates.push(candidate);
          current = candidate;
        }
      } catch {
        // 非交易日或資料錯誤，繼續往前
      }
    }

    // 格式化為 YYYY-MM-DD
    const formatted = dates.map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);

    return NextResponse.json(
      { ok: true, dates: formatted, current: formatted[0] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const code = error instanceof MarketOverviewError ? error.code : 'unknown';
    return NextResponse.json(
      { error: 'upstream_error', message: `trading dates unavailable (${code})` },
      { status: 502 }
    );
  }
}

/** 將 'YYYYMMDD' 位移 deltaDays 天（負數為往前）。 */
function shiftYmd(ymd: string, deltaDays: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}