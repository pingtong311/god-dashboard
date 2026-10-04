/**
 * 看盤日記 — 大盤總覽（唯讀）
 *
 * GET /api/skynet/market-overview?date=YYYYMMDD&sectorLimit=32
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在單次請求內並行抓 TWSE `MI_INDEX`（**4.8MB**）與 `T86`（**2.17MB**），
 *   再解析約 **7MB** 的 JSON 並彙整全市場 3.5 萬列。而 Cloudflare **Free plan 的
 *   Worker CPU 上限只有 10ms**（本專案實測地板值就有 7ms）→ 線上直接
 *   **503 error code: 1102**，端點等同全毀。
 *   → 解法：把 7MB 的抓取與解析搬到本機（`scripts/precompute-scan.mjs`），
 *     結果寫進 KV；邊緣端只做 `kv.get(key)` → `new Response(text)`，
 *     **不解析、不序列化**。
 *
 * ## 變體（variant）設計
 *
 * 輸出取決於查詢參數，因此**每個參數組合存一個 KV key**：
 *   - 無參數／`sectorLimit=32` → `scan:market-overview`（32 是 `parseMarketOverview` 的內部預設）
 *   - `sectorLimit=5`          → `scan:market-overview:sl5`（market-center 使用）
 *   - `date=YYYYMMDD`          → `scan:market-overview:dYYYYMMDD[...]`（歷史回看）
 *
 * 實站實際使用的組合已於 2026-10-04 掃描 `src/` 確認：只有「無參數」「32」「5」
 * 三種，其中「32」與「無參數」等價 → 只需預算 2 個變體即可覆蓋全部頁面。
 *
 * ## 誠實原則
 *
 * 預算尚未產出時回 **200 + `ready:false`** ＋說明文案，**不 fallthrough 到即時計算**
 * （那只會再 1102），也**不回 5xx**。唯一的例外是 **KV 未綁定**（本地開發／尚未部署），
 * 此時才走即時計算，以維持本機可開發性。
 */

import { NextResponse } from 'next/server';
import { DEFAULT_SECTOR_LIMIT, loadMarketOverview, MarketOverviewError } from '@/lib/marketOverview';
import {
  precomputedHitResponse,
  precomputedNotReadyResponse,
  readPrecomputedDetailed,
} from '@/lib/precomputed';

/**
 * `parseMarketOverview` 的內部預設 sectorLimit（見 src/lib/marketOverview.ts）。
 *
 * ⚠ 從 lib 匯入而非在此另寫一份常數：route 的變體組裝與 lib 的快取 key 必須用
 *   **同一個**預設值，否則「無參數」與「=32」會被當成兩個變體，兩邊快取都不命中。
 */

/**
 * 組出預算變體後綴（`undefined` 代表 base key）。
 *
 * ⚠ 變體字串必須**短、穩定、可枚舉**：順序固定（date 在前、sectorLimit 在後），
 *   且 `sectorLimit` 等於預設值時**不列入**（讓「無參數」與「=32」共用同一個 key）。
 */
function buildVariant(
  dateParam: string | undefined,
  sectorLimit: number | undefined,
): string | undefined {
  const parts: string[] = [];
  if (dateParam !== undefined) parts.push(`d${dateParam}`);
  if (sectorLimit !== undefined && sectorLimit !== DEFAULT_SECTOR_LIMIT) {
    parts.push(`sl${sectorLimit}`);
  }
  return parts.length > 0 ? parts.join('_') : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date') ?? undefined;
  const sectorLimitParam = searchParams.get('sectorLimit');
  const sectorLimit = sectorLimitParam ? parseInt(sectorLimitParam, 10) : undefined;

  if (dateParam !== undefined && !/^\d{8}$/.test(dateParam)) {
    return NextResponse.json(
      { error: 'invalid_date', message: 'date must be YYYYMMDD' },
      { status: 400 }
    );
  }

  if (sectorLimit !== undefined && (!Number.isFinite(sectorLimit) || sectorLimit < 1 || sectorLimit > 50)) {
    return NextResponse.json(
      { error: 'invalid_sector_limit', message: 'sectorLimit must be 1-50' },
      { status: 400 }
    );
  }

  const variant = buildVariant(dateParam, sectorLimit);

  // ── 盤後預算直送：零解析、零序列化、零上游抓取 ──
  const read = await readPrecomputedDetailed('market-overview', variant);
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // 尚未產出／內容損壞／KV 讀取失敗 → 誠實回 ready:false（不 5xx、不重算）。
  if (read.status !== 'unbound') {
    return precomputedNotReadyResponse('market-overview', variant);
  }

  // ── KV 未綁定（本地 dev／尚未部署）→ 走即時計算，維持本機可開發性 ──
  // ⚠ 線上環境 KV 一定綁定，因此線上永遠不會走到這裡（也就不會 1102）。
  try {
    const data = await loadMarketOverview(dateParam, undefined, sectorLimit);
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
