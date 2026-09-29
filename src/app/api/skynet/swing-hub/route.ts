/**
 * /api/skynet/swing-hub —— 波段條件 16 頁籤（讀離線預算結果，Edge 上絕不重算）
 * ============================================================================
 * GET /api/skynet/swing-hub
 *
 * ⚠ 為什麼本檔變這麼薄（務必先讀懂再改）：
 *   舊版本在**單次請求內**讀 KV 裡約 65 個交易日的全市場日 K、組裝全市場序列、
 *   跑 16 個條件運算，並同時打 5 個上游（TDCC / T86 / MI_MARGN / 月營收 / 除權息）。
 *   Cloudflare Free plan 的 Worker CPU 上限是 **10ms**，實測線上直接
 *   **503 error code: 1102**（超出資源限制）。業主裁示改為「**離線預算 + 寫入 KV**」：
 *   重計算搬到本機腳本（`scripts/precompute-scan.mjs`），本 route **只讀 KV**。
 *   組裝邏輯與預算腳本共用 `src/lib/scanPayload.ts`（單一真相來源，不得有第二份拷貝）。
 *
 * 本檔的硬性約束：
 *   - **只**讀 KV key `scan:swing-hub`（1 次 KV get），絕不讀日 K、絕不打上游。
 *   - `loadRange` / `buildCodeSeries` / `compute*` **一律不得**出現在本檔。
 *   - 有值 → 原樣回傳（外加 `computedAt`、`precomputed: true`），前端不用改。
 *   - 無值 / KV 未綁定 / parse 失敗 → 200 + `ready:false` + `reason:'not_precomputed'`
 *     + 誠實文案（說清楚是「每日盤後離線預算、目前沒有結果」）。
 *
 * 資料誠實（業主明令）：
 *   - 缺資料一律回空陣列 + 該 tab 的 unavailable_reason，**絕不以 0／假資料填充**。
 *   - badnews（新聞）本站無資料源 → 預算時即固定留白。
 *   - **絕不可**把「尚未預算」寫成「載入中」——那是永久拿不到的狀態。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import { NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import {
  SCAN_KV_KEY_SWING_HUB,
  buildSwingHubKvCorrupt,
  buildSwingHubKvUnbound,
  buildSwingHubNotReady,
  isUsableSwingHubPayload,
  type SwingHubResponse,
} from '@/lib/scanPayload';

export const dynamic = 'force-dynamic';

/** 統一的 no-store 回應（預算結果每日更新，且尚未預算時不可被快取成「有資料」）。 */
function json(body: SwingHubResponse): NextResponse {
  return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();

  // 1. 取 KV 綁定（未綁定 = 本地 dev 或尚未部署）。
  const kv = await getKv();
  if (!kv) {
    return json({ ...buildSwingHubKvUnbound(), fetchedAt });
  }

  // 2. 讀預算結果（唯一一次 KV get；失敗視為尚未預算，不拋錯）。
  let raw: string | null = null;
  try {
    raw = await kv.get(SCAN_KV_KEY_SWING_HUB);
  } catch {
    raw = null;
  }
  if (raw === null || raw === undefined || raw === '') {
    return json({ ...buildSwingHubNotReady(), fetchedAt });
  }

  // 3. parse（損壞一律視為尚未預算，不以空 tabs 冒充）。
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ...buildSwingHubKvCorrupt(), fetchedAt });
  }
  if (!isUsableSwingHubPayload(parsed)) {
    return json({ ...buildSwingHubKvCorrupt(), fetchedAt });
  }

  // 4. 原樣回傳（前端欄位完全不變），僅標註來源與讀取時間。
  return json({ ...parsed, precomputed: true, fetchedAt });
}
