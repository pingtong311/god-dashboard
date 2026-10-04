/**
 * 族群熱圖資料 API
 * GET /api/skynet/treemap?date=YYYYMMDD
 *
 * 彙整 MI_INDEX tables[8]（每日收盤行情）全市場個股，
 * 依產業分群計算市值權重，產出適合方塊圖的資料結構。
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時抓 TWSE `MI_INDEX`（**4.8MB**）並解析 tables[8] 全市場約
 *   3.5 萬列、依名稱關鍵字分類、依產業聚合。在 Free plan 的 10ms CPU 上限下，
 *   這種「請求時解析 MB 級 JSON」必然 **503 error code: 1102**。
 *
 * **順帶修掉的缺陷**：原本未指定日期時查「台北今天」，**週末／休市日抓 MI_INDEX
 *   會拿到 `stat !== 'OK'` → 直接 502**。首頁與 `/sector` 都是無參數呼叫，
 *   等於整個週末都是壞的。現在改為由 `@/lib/treemap` 的 `loadTreemap()` 自動
 *   解析最近交易日；而線上走離線預算，預算本身就是在真實交易日產出的。
 *
 * **本端點也是 `stock-research` 的相依**：`/api/skynet/stock-research` 會內部
 *   呼叫 `/api/skynet/treemap`，因此 treemap 一壞，stock-research 的族群區塊也跟著壞。
 *
 * ## 變體（variant）設計
 *
 *   - 無參數（前端首頁／`/sector`）→ `scan:treemap`（最近交易日）
 *   - `date=YYYYMMDD`               → `scan:treemap:dYYYYMMDD`
 *
 * ## 誠實原則
 *
 *   預算尚未產出 / 內容損壞 → 200 + `ready:false` ＋說明文案（**不回 5xx**、
 *   不 fallthrough 到即時計算）。唯一例外是 **KV 未綁定**（本地開發／尚未部署），
 *   此時才走即時計算，以維持本機可開發性。
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  precomputedHitResponse,
  precomputedNotReadyResponse,
  readPrecomputedDetailed,
} from '@/lib/precomputed';
import { loadTreemap } from '@/lib/treemap';

/** 組出預算變體後綴（`undefined` 代表 base key）。 */
function buildVariant(dateParam: string | undefined): string | undefined {
  return dateParam !== undefined ? `d${dateParam}` : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date') ?? undefined;

  if (dateParam !== undefined && !/^\d{8}$/.test(dateParam)) {
    return NextResponse.json(
      { error: 'invalid_date', message: 'date must be YYYYMMDD' },
      { status: 400 },
    );
  }

  const variant = buildVariant(dateParam);

  // ── 盤後預算直送：零解析、零序列化、零上游抓取 ──
  const read = await readPrecomputedDetailed('treemap', variant);
  if (read.status === 'ok') {
    return precomputedHitResponse(read.text);
  }

  // 尚未產出／內容損壞／KV 讀取失敗 → 誠實回 ready:false（不 5xx、不重算）。
  if (read.status !== 'unbound') {
    return precomputedNotReadyResponse('treemap', variant);
  }

  // ── KV 未綁定（本地 dev／尚未部署）→ 走即時計算，維持本機可開發性 ──
  // ⚠ 線上環境 KV 一定綁定，因此線上永遠不會走到這裡（也就不會 1102）。
  try {
    const payload = await loadTreemap(dateParam);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Skynet-Data-Source': 'live-compute' },
    });
  } catch (error) {
    console.error('Treemap API error:', error);
    return NextResponse.json(
      { error: 'upstream_error', message: 'treemap generation failed' },
      { status: 502 },
    );
  }
}
