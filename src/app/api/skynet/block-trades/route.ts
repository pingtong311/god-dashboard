/**
 * 鉅額交易代理 — GET /api/skynet/block-trades
 * ============================================================================
 * 職責：代理**證交所（上市）BFIAUU** 與**櫃買中心（上櫃）openapi
 * tpex_daily_qutoes_block**，合併兩市後按證券代號彙總，
 * 輸出**對齊實站 /api/p1/block-trades** 的 JSON 形狀，並附上資料來源標記。
 *
 * 形狀（成功）：
 *   { available:true, date:'YYYY-MM-DD', data_scope:'盤後', next_update:'下一交易日 23:08',
 *     note:'盤後鉅額成交金額加總，不是進出場。', items:[{stock_id,label,n,money_yi}],
 *     gaps:['<已知缺口說明，無缺口為空陣列>'],
 *     provenance:{ source:'self-produced',
 *       upstream:{ twse:'<BFIAUU 實際 URL>', tpex:'<openapi URL 或 null>' } },
 *     fetchedAt:'<ISO>' }
 *
 * 日期對齊：以 TWSE 日期為準；TPEX 端點無日期參數，若其回傳日期不同則不併入、記 gaps。
 *
 * 已知缺口（gaps）：TPEX 未取得或日期不一致時如實標註；不以 0 或猜測值補齊。
 *
 * 失敗（上游全數失敗／無資料）：
 *   502 + { ok:false, error:'block_trades_upstream_error' }（絕不回假數字）
 *
 * 資料誠實原則：全部由本站自打證交所免費官方 API 產生，不抄實站快照數字。
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時並行抓 TWSE BFIAUU 與 TPEX openapi，且 TWSE 側**未指定日期時
 *   會逐日往回探測**（LOOKBACK_DAYS = 10，每個交易日一次上游 fetch）。
 *   以 `wrangler tail --format=json` 實測：
 *     min / p25 / median / p75 / max = **13 / 15 / 18 / 20 / 286 ms**，≤10ms = **0/13**。
 *   → 屬「暖機後仍穩定超限」型（中位 18ms ≈ 上限 1.8 倍），不是單純冷啟動問題。
 *
 * **變體（variant）設計**：本端點**沒有查詢參數** → 不需要 variant，
 *   只讀 base key `scan:block-trades`。
 *
 * ## ⚠ 本端點走「寬鬆模式」（同 dividend-calendar）
 *
 *   消費者 `src/app/block-trades/BlockTradesClient.tsx`：
 *     `if (!json?.available || !Array.isArray(json.items)) throw new Error('unavailable')`
 *   → 回 `200 + ready:false` 會讓**一個原本可用的頁面變成「暫時無法取得」的錯誤狀態**。
 *
 *   而本端點即時計算仍回 200（未被砍）⇒ **降級回即時計算＝維持現況，不是回歸**。
 *   ⇒ 只在 **KV 未綁定** 與 **KV 未命中** 兩種情況才走即時計算；命中時永遠零解析直送。
 *
 * ## 🔴 資料時點：本端點需要「深夜場」預算
 *
 *   TWSE 鉅額交易**含盤後時段（交易至 17:00）**，且本頁自述更新時間為「下一交易日 23:08」。
 *   ⇒ 每日 **16:35** 的盤後場跑預算時，TWSE 當日資料**尚未定稿**，
 *     寫進 KV 後會被凍結到隔天 16:35。
 *   ⇒ 因此另有 **23:30 深夜場**（`--only=block-trades`）覆寫為當日最終版。
 *     見 `scripts/com.god.precompute-scans.plist`（兩個 StartCalendarInterval）。
 *   兩場合起來：隔一交易日 09:00 看到的是「前一日已定稿」的完整資料。
 */

import { NextResponse } from 'next/server';
import { precomputedHitResponse, readPrecomputedDetailed } from '@/lib/precomputed';
import { getBlockTrades } from '@/app/block-trades/block-trades-data';

/**
 * ⚠ 必須強制 dynamic。
 *
 * 本 route 的 GET **不接收任何參數**，且命中預算時整條路徑不含 `fetch`。
 * Next.js 對「無參數、無動態 API」的 GET route handler 會嘗試**在建置期靜態求值**
 * ——那會在 `next build` 時就去讀一次 KV 並把結果烘進產物，之後永遠回同一份
 * （且建置環境通常沒有 KV 綁定）。顯式宣告 `force-dynamic` 可完全排除這個風險。
 */
export const dynamic = 'force-dynamic';

/** 即時計算（降級路徑）的回應標頭：不進邊緣快取，避免把慢路徑快取起來。 */
const LIVE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Skynet-Data-Source': 'live-compute',
};

export async function GET() {
  // ── 盤後預算直送：零解析、零序列化、零上游抓取 ──
  const read = await readPrecomputedDetailed('block-trades');
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // ── 未命中（missing / error）或 KV 未綁定（unbound）→ 降級回即時計算 ──
  // 詳見檔首「寬鬆模式」說明：本頁的消費者要求 `available === true`，
  // 回 ready:false 會讓可用的頁面變成錯誤狀態，故選擇降級服務。
  try {
    const result = await getBlockTrades();
    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'block_trades_upstream_error' },
        { status: 502, headers: LIVE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ...result.data,
        provenance: { source: 'self-produced', upstream: result.upstream },
        fetchedAt: new Date().toISOString(),
      },
      { headers: LIVE_HEADERS },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { ok: false, error: 'block_trades_timeout' },
        { status: 504, headers: LIVE_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'block_trades_fetch_error' },
      { status: 500, headers: LIVE_HEADERS },
    );
  }
}
