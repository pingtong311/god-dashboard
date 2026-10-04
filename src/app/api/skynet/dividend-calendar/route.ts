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
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時**並行抓 3 個上游、共約 3.9MB** 並解析：
 *     - TWT48U（除權除息預告表）        16.6 KB
 *     - STOCK_DAY_AVG_ALL（日收盤價） 2.60 MB  ← 只為了 5 檔的收盤價算殖利率
 *     - t187ap03_L（公司基本資料）     1.33 MB  ← 只為了產業別
 *   以 `wrangler tail --format=json` 實測 **cpuTime 51～143ms（中位數 76ms）**，
 *   是 Free plan 上限（10ms）的 **5～14 倍**（同批量測的地板值為 7ms）。
 *   目前仍回 200（超限不一定當下就被砍），但已長期處於危險區。
 *
 * **變體（variant）設計**：本端點**沒有查詢參數** → 不需要 variant，
 *   只讀 base key `scan:dividend-calendar`。
 *
 * ## ⚠ 本端點走「寬鬆模式」（與 treemap / trading-dates 的嚴格模式不同）
 *
 *   treemap / market-overview / trading-dates 遷移時採「嚴格模式」——KV 未命中即回
 *   `200 + ready:false`，因為那些端點在邊緣端重算必然 1102，回 `ready:false` 是改善。
 *
 *   本端點**不能**照做，理由是本頁有一個**真實消費者**：
 *     `src/app/dividend/DividendClient.tsx`
 *       → `if (!json?.available || !Array.isArray(json.items)) throw new Error('unavailable')`
 *     也就是說，回 `ready:false`（沒有 `available` / `items`）會讓**一個原本可用的頁面
 *     變成「暫時無法取得」的錯誤狀態**。
 *
 *   而本端點即使走即時計算也仍回 200（0.49s、cpuTime 中位數 76ms，尚未被砍），
 *   所以「降級回即時計算」= 維持現況，**不是回歸**；反之回 `ready:false` 才是回歸。
 *
 *   ⇒ 因此本端點只在 **KV 未綁定（unbound）** 與 **KV 未命中（missing/error）** 兩種情況
 *     才走即時計算；**命中時永遠零解析直送**。
 *     實務上預算每日 16:35 執行、TTL 7 天，未命中機率極低；
 *     真遇到時使用者看到的是「稍慢但正確」的資料，而不是壞掉的頁面。
 *
 * 註：Cache-Control 標記會被 src/middleware.ts 對 /api/skynet/* 覆寫為 no-store，
 *     除非該路徑已列入 ROUTE_MANAGED_PATHS（本端點已列入）。
 */

import { NextResponse } from 'next/server';
import { precomputedHitResponse, readPrecomputedDetailed } from '@/lib/precomputed';
import { getDividendCalendar } from '@/app/dividend/dividend-data';

/**
 * ⚠ 必須強制 dynamic。
 *
 * 本 route 的 GET **不接收任何參數**（端點沒有查詢參數），且命中預算時整條路徑
 * 不含 `fetch`。Next.js 對「無參數、無動態 API」的 GET route handler 會嘗試
 * **在建置期靜態求值**——那會在 `next build` 時就去讀一次 KV 並把結果烘進產物，
 * 之後永遠回同一份（且建置環境通常沒有 KV 綁定）。
 * 顯式宣告 `force-dynamic` 可完全排除這個風險（market-bars 亦同）。
 */
export const dynamic = 'force-dynamic';

/** 即時計算（降級路徑）的回應標頭：不進邊緣快取，避免把慢路徑快取起來。 */
const LIVE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Skynet-Data-Source': 'live-compute',
};

export async function GET() {
  // ── 盤後預算直送：零解析、零序列化、零上游抓取 ──
  const read = await readPrecomputedDetailed('dividend-calendar');
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // ── 未命中（missing / error）或 KV 未綁定（unbound）→ 降級回即時計算 ──
  // 詳見檔首「寬鬆模式」說明：本頁的消費者要求 `available === true`，
  // 回 ready:false 會讓可用的頁面變成錯誤狀態，故選擇降級服務。
  try {
    const result = await getDividendCalendar();
    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'dividend_calendar_upstream_error' },
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
        { ok: false, error: 'dividend_calendar_timeout' },
        { status: 504, headers: LIVE_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'dividend_calendar_fetch_error' },
      { status: 500, headers: LIVE_HEADERS },
    );
  }
}
