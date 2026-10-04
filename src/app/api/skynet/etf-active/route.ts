/**
 * 主動式 ETF 代理（掛牌清單 + 盤後收盤價）
 * GET /api/skynet/etf-active
 *
 * 職責：
 * - 打證交所免費 OpenAPI，產出「主動式 ETF」清單與其盤後收盤價，
 *   對齊實站 blackstockai.com/api/p1/etf-active 的 JSON 形狀（items[]）。
 *
 * 上游（皆為證交所免費 OpenAPI，免金鑰）：
 *   1) 主動式 ETF 基本資料清單：
 *      https://openapi.twse.com.tw/v1/opendata/t187ap47_L
 *      → 回傳 271 檔各類基金；以「基金類型」含「主動式」篩出主動式 ETF（實測 33 檔）。
 *        欄位：基金代號 / 基金簡稱 / 基金類型 / 基金中文名稱 / 基金英文名稱 / 上市日期 …
 *   2) ETF 收盤價（全市場均價檔）：
 *      https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL
 *      → {Date, Code, Name, ClosingPrice, MonthlyAveragePrice}（約 3 萬筆，含 ETF）。
 *
 * 誠實分工（業主明示原則：能自產就自產、缺資料要誠實）：
 *   ✅ ETF 清單 / 名稱 / 收盤價 / 月均價  → 上游有，自產。
 *   ❌ 持股明細（holdings）與當日買賣異動張數（changes）
 *        → 這是投信每日公告的持股，證交所 openapi **沒有**此欄位（已查 t187ap47_L 全部
 *          29 欄，僅有基金層級中繼資料，無成分股；TPEX openapi 亦無主動式 ETF 成分股端點）。
 *          故 holdings / changes 一律回傳**空陣列**，由前端誠實呈現「資料尚未入庫」，
 *          **絕不以 0 或假數字冒充**。
 *
 * 失敗處理：
 *   - 清單上游失敗 → 502 { ok:false, error:'etf_active_upstream_error' }。
 *   - 收盤價上游失敗 → 仍回 200，但所有收盤價欄位為 null（不影響清單；前端顯示「—」）。
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時並行抓 2 個上游、解析約 3 萬筆資料，CPU 實測中位數 ~45ms，
 *   超過 Free plan 10ms 上限 → 間歇性 503 error code: 1102。
 *   → 解法：把計算搬到本機（scripts/precompute-scan.mjs），結果寫進 KV；
 *     邊緣端只做 `kv.get(key)` → `new Response(text)`，**不解析、不序列化**。
 *
 * **變體（variant）設計**：本端點**沒有查詢參數** → 不需要 variant，
 *   只讀 base key `scan:etf-active`。
 *
 * **模式選擇：寬鬆模式**（同 dividend-calendar / block-trades）
 *   - 消費者需 `available` + `items[]` → 嚴格模式會讓可用頁面變錯誤狀態。
 *   - 即時計算仍回 200（尚未被砍）⇒ 降級即時計算 = 維持現況。
 *   - ⇒ 只在 KV 未綁定 / 未命中才走即時計算；命中時永遠零解析直送。
 */

import { NextResponse } from 'next/server';
import { precomputedHitResponse, readPrecomputedDetailed } from '@/lib/precomputed';
import { getEtfActive, type EtfActiveData } from '@/app/etf-active/etf-active-data';

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
  const read = await readPrecomputedDetailed('etf-active');
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // 尚未產出／內容損壞／KV 讀取失敗 → 走即時計算（寬鬆模式）。
  if (read.status !== 'unbound') {
    // 嘗試即時計算
    try {
      const result = await getEtfActive();
      if (result) {
        return NextResponse.json(
          { ...result.data, provenance: { source: 'self-produced', upstream: result.upstream[0], upstreams: result.upstream } },
          { headers: LIVE_HEADERS },
        );
      }
    } catch {
      // 即時計算也失敗 → 回 502
    }
    return NextResponse.json({ ok: false, error: 'etf_active_upstream_error' }, { status: 502 });
  }

  // ── KV 未綁定（本地 dev／尚未部署）→ 走即時計算，維持本機可開發性 ──
  try {
    const result = await getEtfActive();
    if (!result) {
      return NextResponse.json({ ok: false, error: 'etf_active_upstream_error' }, { status: 502 });
    }
    return NextResponse.json(
      { ...result.data, provenance: { source: 'self-produced', upstream: result.upstream[0], upstreams: result.upstream } },
      { headers: LIVE_HEADERS },
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'etf_active_fetch_error' }, { status: 500 });
  }
}
