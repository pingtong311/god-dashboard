/**
 * /api/skynet/pattern-screen —— K 線型態掃描（讀離線預算結果，Edge 上絕不重算）
 * ============================================================================
 * GET /api/skynet/pattern-screen
 *
 * ⚠ 為什麼本檔變這麼薄（務必先讀懂再改）：
 *   舊版本在**單次請求內**讀 KV 裡 70 個交易日的全市場日 K（每日約 2.5MB）、
 *   展開約 2,000 檔 × 70 根 ≈ 14 萬根 K 棒，再跑 7 種型態幾何辨識——數百毫秒量級。
 *   Cloudflare Free plan 的 Worker CPU 上限是 **10ms**，實測線上直接
 *   **503 error code: 1102**（超出資源限制）。本機 `npx jest` 全綠，證明不是邏輯錯，
 *   是 Edge 的資源天花板。
 *
 *   業主裁示：**離線預算 + 寫入 KV**。重計算搬到本機腳本
 *   （`scripts/precompute-scan.mjs`，無 CPU 限制），本 route **只讀 KV 的精簡結果**。
 *   組裝邏輯與預算腳本共用 `src/lib/scanPayload.ts`（單一真相來源，不得有第二份拷貝）。
 *
 * 本檔的硬性約束：
 *   - **只**讀 KV key `scan:pattern-screen`（1 次 KV get），絕不讀 70 天日 K。
 *   - `listStoredDates` / `loadRange` / `scanSeriesList` **一律不得**出現在本檔。
 *   - 有值 → 原樣回傳（外加 `computedAt`、`precomputed: true`），前端不用改。
 *   - 無值 / KV 未綁定 / parse 失敗 → 200 + `ready:false` + `reason:'not_precomputed'`
 *     + 誠實文案（說清楚是「每日盤後離線預算、目前沒有結果」）。
 *
 * 資料誠實（業主明令）：
 *   - **絕不可**在尚未預算時回空 patterns 假裝掃過。
 *   - **絕不可**把「尚未預算」寫成「載入中」——那是永久拿不到的狀態。
 *   - 缺資料一律「—」或誠實說明，絕不以 0 代替、不捏造、不用 Math.random。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import {
  SCAN_KV_KEY_PATTERN_SCREEN,
  buildPatternScreenKvCorrupt,
  buildPatternScreenKvUnbound,
  buildPatternScreenNotReady,
  isUsablePatternScreenPayload,
  type PatternScreenResponse,
} from '@/lib/scanPayload';

export const dynamic = 'force-dynamic';

/** 為維持既有外部 import（`import type { PatternScreenResponse } from '.../route'`）而 re-export。 */
export type { PatternScreenResponse } from '@/lib/scanPayload';

/** 統一的 no-store 回應（預算結果每日更新，且尚未預算時不可被快取成「有資料」）。 */
function json(body: PatternScreenResponse): NextResponse {
  return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();

  // 1. 取 KV 綁定（未綁定 = 本地 dev 或尚未部署）。
  const kv = await getKv();
  if (!kv) {
    return json({ ...buildPatternScreenKvUnbound(), fetchedAt });
  }

  // 2. 讀預算結果（唯一一次 KV get；失敗視為尚未預算，不拋錯）。
  let raw: string | null = null;
  try {
    raw = await kv.get(SCAN_KV_KEY_PATTERN_SCREEN);
  } catch {
    raw = null;
  }
  if (raw === null || raw === undefined || raw === '') {
    return json({ ...buildPatternScreenNotReady(), fetchedAt });
  }

  // 3. parse（損壞一律視為尚未預算，不以空清單冒充）。
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ...buildPatternScreenKvCorrupt(), fetchedAt });
  }
  if (!isUsablePatternScreenPayload(parsed)) {
    return json({ ...buildPatternScreenKvCorrupt(), fetchedAt });
  }

  // 4. 原樣回傳（前端欄位完全不變），僅標註來源與讀取時間。
  return json({ ...parsed, precomputed: true, fetchedAt });
}
