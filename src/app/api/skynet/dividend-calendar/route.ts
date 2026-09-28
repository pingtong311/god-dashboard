/**
 * 除權息行事曆代理 — GET /api/skynet/dividend-calendar
 * ============================================================================
 * 職責：代理證交所「除權除息預告表」TWT48U，篩選未來 30 天內項目，並自算
 * 現金殖利率（現金股利 ÷ 收盤價，收盤價取自 STOCK_DAY_AVG_ALL），
 * 輸出**對齊實站 /api/dividend-calendar** 的 JSON 形狀，並附上資料來源標記。
 *
 * 形狀（成功）：
 *   { available:true, items:[{stock_id,label,industry,ex_date,days_left,
 *     cash_dividend,stock_dividend,close,cash_yield_pct}], note:'...',
 *     provenance:{ source:'self-produced', upstream:'<實際 URL>' }, fetchedAt:'<ISO>' }
 *
 * 失敗（主要上游失敗／無資料）：
 *   502 + { ok:false, error:'dividend_calendar_upstream_error' }（絕不回假數字）
 *
 * 資料誠實原則：全部由本站自打證交所免費官方 API 產生，不抄實站快照數字；
 * 缺收盤價時殖利率為 null（前端顯示「—」），不以 0 代替。
 * 註：Cache-Control 標記會被 src/middleware.ts 對 /api/skynet/* 覆寫為 no-store
 *     （此 header 僅為 route 層意圖標記，非實際生效防線）。
 */

import { NextResponse } from 'next/server';
import { getDividendCalendar } from '@/app/dividend/dividend-data';

export async function GET() {
  try {
    const result = await getDividendCalendar();
    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'dividend_calendar_upstream_error' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ...result.data,
        provenance: { source: 'self-produced', upstream: result.upstream },
        fetchedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { ok: false, error: 'dividend_calendar_timeout' },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'dividend_calendar_fetch_error' },
      { status: 500 },
    );
  }
}
