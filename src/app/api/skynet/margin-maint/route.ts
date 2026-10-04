/**
 * /api/skynet/margin-maint —— 融資維持率（真實資料代理）
 * GET /api/skynet/margin-maint
 *
 * 職責：
 * - 直接打證交所（TWSE）**免費官方端點**，自產「大盤融資維持率」，並誠實處理
 *   「個股維持率」——因為交易所根本沒公開可算的欄位。
 * - 對齊實站 `https://blackstockai.com/api/p1/margin-maint` 的 body schema。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 上游調查結論（逐一實測，2026-09-27）：
 *
 * ① 個股「融資維持率」——**無法自算**（誠實留空）：
 *    - `openapi/v1/exchangeReport/MI_MARGN` 每筆欄位為
 *      {股票代號, 股票名稱, 融資買進, 融資賣出, 融資現金償還, 融資前日餘額, 融資今日餘額,
 *       融資限額, 融券…, 資券互抵, 註記}。
 *      → 只有「融資餘額（交易單位／張）」，**沒有「融資金額（元）」**。
 *    - `rwd/zh/marginTrading/MI_MARGN?response=json&date=YYYYMMDD&selectType=ALL` 有兩張表：
 *      ・信用交易統計（市場總計）：含「融資金額(仟元)」→ 只有**全市場加總**。
 *      ・融資融券彙總（全部）：每檔僅「交易單位」→ 個股仍無金額。
 *    - 維持率定義＝擔保品市值 ÷ 融資金額。個股缺「融資金額」與「融資成本均價」，
 *      分母無法誠實取得，**故個股維持率一律留空**（不以 0 代替、不捏造）。
 *
 * ② 大盤「融資維持率」——**可自算**（本檔實作）：
 *    公式：market_maintenance = Σ(個股融資今日餘額張 × 1000 股/張 × 收盤價元/股) ÷ 融資金額(仟元) × 1000(仟元→元) × 100%
 *      - 分子（擔保品市值）：個股融資餘額（rwd MI_MARGN 第 2 表 index 6）× 收盤價
 *        （`openapi/v1/exchangeReport/STOCK_DAY_AVG_ALL`，欄位 {Date,Code,Name,ClosingPrice}）。
 *      - 分母（融資金額）：rwd MI_MARGN 第 1 表「融資金額(仟元)」今日餘額（index 5）。
 *    實測驗算（資料日 2026-09-24）：自算 = 193.87%，實站 market_maintenance = 193.88%，
 *    相差 0.01 個百分點（來源為少數個股缺價／四捨五入），證明公式與口徑正確。
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 資料誠實原則：個股維持率缺來源一律回空陣列＋`items_note` 說明，
 * **絕不以 0 代替、不捏造、不用 Math.random**。
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時並行抓 2 個上游、解析約 3.5 萬筆資料，CPU 實測中位數 ~38ms，
 *   超過 Free plan 10ms 上限 → 穩定 503 error code: 1102。
 *   → 解法：把計算搬到本機（scripts/precompute-scan.mjs），結果寫進 KV；
 *     邊緣端只做 `kv.get(key)` → `new Response(text)`，**不解析、不序列化**。
 *
 * **變體（variant）設計**：本端點**沒有查詢參數** → 不需要 variant，
 *   只讀 base key `scan:margin-maint`。
 *
 * **模式選擇：嚴格模式**（同 trump-radar）
 *   - 本端點現況本來就是壞的（穩定 1102），回 `ready:false` 是改善，無回歸。
 *   - 唯一例外是 KV 未綁定（本地開發），此時走即時計算以維持可開發性。
 */

import { NextRequest, NextResponse } from 'next/server';
import { precomputedHitResponse, precomputedNotReadyResponse, readPrecomputedDetailed } from '@/lib/precomputed';
import { getMarginMaint, type MarginMaintData } from '@/app/margin-maint/margin-maint-data';

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

export async function GET(_req: NextRequest): Promise<Response> {
  // ── 盤後預算直送：零解析、零序列化、零上游抓取 ──
  const read = await readPrecomputedDetailed('margin-maint');
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // 尚未產出／內容損壞／KV 讀取失敗 → 誠實回 ready:false（嚴格模式，不 fallthrough）。
  if (read.status !== 'unbound') {
    return precomputedNotReadyResponse('margin-maint');
  }

  // ── KV 未綁定（本地 dev／尚未部署）→ 走即時計算，維持本機可開發性 ──
  // ⚠ 線上環境 KV 一定綁定，因此線上永遠不會走到這裡（也就不會 1102）。
  try {
    const result = await getMarginMaint();
    if (!result) {
      return NextResponse.json({ ok: false, error: 'margin_maint_upstream_error' }, { status: 502 });
    }
    return NextResponse.json(
      { ...result.data, provenance: { source: 'self-produced', upstream: result.upstream.twse, upstreams: [result.upstream.twse].filter(Boolean) } },
      { headers: LIVE_HEADERS },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'margin_maint_timeout' }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: 'margin_maint_fetch_error' }, { status: 500 });
  }
}