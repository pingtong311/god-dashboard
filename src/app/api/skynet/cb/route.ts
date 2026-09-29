/**
 * 可轉債（CB）唯讀端點 —— 只讀 KV 的離線預算結果
 * GET /api/skynet/cb
 *
 * ── 為什麼改成「只讀 KV」────────────────────────────────────────────────────
 *  原本本 route 在 Edge（Cloudflare Workers）上即時打櫃買中心並重算，實測：
 *    - TPEX `bond_ISSBD5_data` 回應 **261,756 bytes、耗時 25 秒**，而 route 的
 *      upstream timeout 只有 8 秒 → 逾時 → 線上 **502 cb_upstream_error**
 *    - 就算把 timeout 拉長，在 Workers 裡 `JSON.parse` 261KB／上千筆物件一樣會越過
 *      Cloudflare Free plan 的 **10ms CPU 上限** → 1102（同專案 pattern-screen /
 *      swing-hub 就是這樣死的，線上回 503 error code: 1102）
 *  → 業主裁示改「**離線預算 + 寫入 KV**」：重計算搬到本機腳本（無 CPU 限制），
 *    Worker 只讀 KV 的精簡結果。
 *
 * 本 route 的硬約束（違反就是線上 502／1102 重演）：
 *   ✅ 只做：`getKv()` → `kv.get('scan:cb')` → JSON.parse → 回傳
 *   ❌ 絕對禁止：fetch 任何上游、做任何重計算、解析任何 CSV
 *   （計算邏輯統一在 src/lib/cbPremium.ts，由本機預算腳本呼叫。）
 *
 * ── 回應契約 ───────────────────────────────────────────────────────────────
 *  ① KV 有值且可解析 → 200 + 完整 CbResponse + `computedAt`（預算時間）
 *     + `precomputed:true`。其餘欄位與原本完全一致，前端不用改。
 *  ② 無值／KV 未綁定／值損壞 → 200 + 誠實 not-ready：
 *     { ok:true, available:false, items:[], put_schedule:[], calendar:[],
 *       items_unavailable_reason:'...', computedAt:'', precomputed:false, provenance }
 *     ★ 文案說明「本站採每日盤後預算，目前尚無預算結果」，
 *       **不可寫「載入中」**——這是永久拿不到的狀態，不是等待中的狀態。
 *
 * ── 資料源與公式（完整說明見 src/lib/cbPremium.ts 檔頭）────────────────────
 *  ① TPEX `bond_ISSBD5_data`（發行資料）→ put_schedule / calendar / 名稱對照
 *  ② TPEX `cbDaily?fileCode=cbdrs001`（日行情檔清單）→ CSV（BIG5，20 欄）
 *     轉換價值 = 標的股價 × 100 ÷ 轉換價格；折價率% = (CB收市價 ÷ 轉換價值 − 1) × 100
 *     升冪取前 30；缺任一價或除零者剔除。
 *
 * ── 誠實分工（業主明示原則）──────────────────────────────────────────────────
 *   ✅ items（轉換溢價率排序）／put_schedule／calendar：TPEX 公開檔案自產，可稽核。
 *   ❌ 未借用任何實站快照；缺資料一律 null／空字串，不用 0 冒充、不捏造。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import { NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import {
  CB_KV_KEY,
  buildNotReadyPayload,
  parseCbKvValue,
  type CbNotReadyResponse,
  type CbPrecomputedResponse,
} from '@/lib/cbPremium';

// 前端既有元件（src/app/cb/*）從本路徑匯入型別，故原樣再匯出，維持相容。
export type {
  CbResponse,
  CbItem,
  CbPutScheduleRow,
  CbCalendarRow,
} from '@/lib/cbPremium';

export const dynamic = 'force-dynamic';

/** 命中預算結果時的快取時間：盤後資料，5 分鐘。 */
const CACHE_OK = 'public, max-age=300';
/** 尚無預算結果時的快取時間：縮短為 60 秒，預算一寫入就能盡快被看見。 */
const CACHE_NOT_READY = 'public, max-age=60';

export async function GET() {
  // ── 只讀 KV；KV 缺席或讀取拋錯一律視為「尚無預算結果」，不拋 5xx ──
  let raw: string | null = null;
  try {
    const kv = await getKv();
    if (kv) {
      raw = await kv.get(CB_KV_KEY);
    }
  } catch {
    // KV 讀取失敗（未綁定／權限／逾時）→ 走 not-ready，誠實說明，不捏造資料。
    raw = null;
  }

  if (raw !== null && raw !== '') {
    const parsed = parseCbKvValue(raw);
    if (parsed !== null) {
      const body: CbPrecomputedResponse = {
        ...parsed.payload,
        computedAt: parsed.computedAt,
        precomputed: true,
      };
      return NextResponse.json(body, { headers: { 'Cache-Control': CACHE_OK } });
    }
  }

  // KV 無值 / 未綁定 / 內容損壞 → 200 + 誠實 not-ready（不是 502、不是空集合冒充成功）
  const body: CbNotReadyResponse = {
    ok: true,
    ...buildNotReadyPayload(),
    computedAt: '',
    precomputed: false,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': CACHE_NOT_READY } });
}
