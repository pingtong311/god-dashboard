/**
 * 看盤日記 — 大盤總覽（唯讀）
 *
 * GET /api/skynet/market-overview?date=YYYYMMDD
 *
 * - 唯讀端點，依專案慣例「唯讀 GET route 不加 guardMutation」，僅設 Cache-Control: no-store。
 * - 解析邏輯全部在 @/lib/marketOverview，本檔只負責 HTTP 進出與錯誤碼映射。
 * - 回應僅含萃取後的小 JSON，不外洩 tables[8] 的 3.5 萬列原始資料，也不外洩上游原始字串。
 */

import { NextResponse } from 'next/server';
import { loadMarketOverview, MarketOverviewError } from '@/lib/marketOverview';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date') ?? undefined;

  if (dateParam !== undefined && !/^\d{8}$/.test(dateParam)) {
    return NextResponse.json(
      { error: 'invalid_date', message: 'date must be YYYYMMDD' },
      { status: 400 }
    );
  }

  try {
    const data = await loadMarketOverview(dateParam);
    if (!Number.isFinite(data.indexClose.price) || data.indexClose.price <= 0) {
      return NextResponse.json(
        { error: 'upstream_error', message: 'market index unavailable' },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: true, data },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const code = error instanceof MarketOverviewError ? error.code : 'unknown';
    return NextResponse.json(
      { error: 'upstream_error', message: `market overview unavailable (${code})` },
      { status: 502 }
    );
  }
}
