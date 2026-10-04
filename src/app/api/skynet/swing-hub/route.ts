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
import { readKvJsonDetailed } from '@/lib/kvReadCache';
import {
  SCAN_KV_KEY_SWING_HUB,
  buildSwingHubKvCorrupt,
  buildSwingHubKvUnbound,
  buildSwingHubNotReady,
  isUsableSwingHubPayload,
  type SwingHubResponse,
} from '@/lib/scanPayload';

export const dynamic = 'force-dynamic';

/**
 * 盤後預算結果的回應標頭（2026-10-04 調整，原為一律 no-store）。
 *
 * 本端點讀的是每日 16:35 由本機排程寫入 KV 的預算結果，屬**盤後資料**，
 * 當日不會再變；但「尚未預算」是暫時狀態，不可被長快取成「有資料」。
 * 故分兩種：
 *   - 有預算結果（ready:true）→ 瀏覽器 60 秒、CDN 10 分鐘、過期後先回舊值再背景更新
 *   - 尚未預算（ready:false）→ 只快取 30 秒，資料一到就能很快被看到
 *
 * 為什麼要改：原本一律 no-store，使每次瀏覽都重讀 KV →
 * 2026-10-04 Cloudflare 發出「KV 每日操作數達免費方案 50%」告警。
 */
const CACHE_READY = 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400';
const CACHE_NOT_READY = 'public, max-age=30';

function json(body: SwingHubResponse): NextResponse {
  const ready = (body as { ready?: unknown }).ready === true;
  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': ready ? CACHE_READY : CACHE_NOT_READY },
  });
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();

  // 讀預算結果（三層快取：L1 isolate in-memory → L2 Cache API → L3 KV）。
  //
  // 為什麼不直接 `kv.get()`：那會在每個請求都付出一次 KV 讀取（計入免費方案
  // 每日 100,000 次上限）＋ 一次 97KB 的 JSON.parse。
  // 走快取層後，L1 命中時**零 KV 讀取、零解析**——本端點 CPU 實測已達 10ms 上限，
  // 這是唯一能騰出餘裕的方法。
  //
  // ⚠ 用 `readKvJsonDetailed`（多態）而非 `readKvJsonCached`：
  //    必須保留「KV 未綁定」／「尚未預算」／「KV 損壞」的不同文案，不可混為一談。
  const read = await readKvJsonDetailed<unknown>(SCAN_KV_KEY_SWING_HUB);

  if (read.status === 'unbound') {
    return json({ ...buildSwingHubKvUnbound(), fetchedAt });
  }
  if (read.status === 'error' || read.status === 'missing') {
    // 讀取拋錯或尚無值 → 都走誠實 not-ready（不拋 5xx、不以空 tabs 冒充）。
    return json({ ...buildSwingHubNotReady(), fetchedAt });
  }
  if (read.status === 'corrupt') {
    return json({ ...buildSwingHubKvCorrupt(), fetchedAt });
  }

  // 形狀驗證（形狀不符一律視為損壞，不以空 tabs 冒充）。
  const parsed = read.value;
  if (!isUsableSwingHubPayload(parsed)) {
    return json({ ...buildSwingHubKvCorrupt(), fetchedAt });
  }

  // 原樣回傳（前端欄位完全不變），僅標註來源與讀取時間。
  return json({ ...parsed, precomputed: true, fetchedAt });
}
