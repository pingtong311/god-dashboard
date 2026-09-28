/**
 * 鉅額交易代理 — GET /api/skynet/block-trades
 * ============================================================================
 * 職責：代理證交所「鉅額交易日成交資訊」BFIAUU，按證券代號彙總後，
 * 輸出**對齊實站 /api/p1/block-trades** 的 JSON 形狀，並附上資料來源標記。
 *
 * 形狀（成功）：
 *   { available:true, date:'YYYY-MM-DD', data_scope:'盤後', next_update:'下一交易日 23:08',
 *     note:'盤後鉅額成交金額加總，不是進出場。', items:[{stock_id,label,n,money_yi}],
 *     provenance:{ source:'self-produced', upstream:'<實際 URL>' }, fetchedAt:'<ISO>' }
 *
 * 失敗（上游全數失敗／無資料）：
 *   502 + { ok:false, error:'block_trades_upstream_error' }（絕不回假數字）
 *
 * 資料誠實原則：全部由本站自打證交所免費官方 API 產生，不抄實站快照數字。
 * 註：Cache-Control 標記會被 src/middleware.ts 對 /api/skynet/* 覆寫為 no-store
 *     （此 header 僅為 route 層意圖標記，非實際生效防線）。
 */

import { NextResponse } from 'next/server';
import { getBlockTrades } from '@/app/block-trades/block-trades-data';

export async function GET() {
  try {
    const result = await getBlockTrades();
    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'block_trades_upstream_error' },
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
        { ok: false, error: 'block_trades_timeout' },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'block_trades_fetch_error' },
      { status: 500 },
    );
  }
}
