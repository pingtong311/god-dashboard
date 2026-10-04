/**
 * 川普政策雷達（/trump）自產資料 route
 * GET /api/skynet/trump-radar?days=45
 * ----------------------------------------------------------------------------
 * 職責：抓公開 RSS（非實站 API——實站上游已封鎖，程式打回 403），產出對齊實站
 * `blackstockai.com/api/trump-radar` JSON 形狀的**自產**資料。
 *
 * 抓取實作在 `src/app/trump/trump-data.ts`（route 與離線預算共用同一份，
 * 避免兩份實作漂移）。
 *
 * ## 2026-10-04 架構變更：改為「離線預算 ＋ 邊緣零解析直送」
 *
 * **為什麼非改不可（這次不是為了 CPU，是為了「根本拿不到資料」）**：
 *   2026-10-04 實測線上 `GET /api/skynet/trump-radar?days=45`：
 *
 *     回應        {"ok":false,"error":"upstream_error","days":45}
 *     x-skynet-data-source: upstream-error
 *     耗時        8.48s
 *
 *   8.48s ＝ 三條上游並行、各自撞滿 8 秒逾時 ⇒ **從 Cloudflare 邊緣端三條全不可達**。
 *   同一時間在**本機**測同一組 URL：**三條全數 HTTP 200**（英文 52 則／白宮 30 則／
 *   繁中 100 則）。
 *   ⇒ 與 `block-trades` 的 TPEX 是**同一類問題**：上游可達性因執行位置而異。
 *   ⇒ 因此本端點遷移的目的**首先是「讓它真的有資料」**，其次才是省 CPU。
 *
 * **遷移後行為**：預設天數（45，也是 /trump 頁唯一使用的值）改讀離線預算
 *   `scan:trump-radar`，邊緣端只做 `kv.get(key)`（文字）→ `new Response(text)`，
 *   **零解析、零序列化、零上游抓取**。
 *
 * ## 模式選擇：嚴格模式（不是寬鬆模式）
 *
 *   ⚠ 判斷依據是「**先找消費者，再決定**」（見 deploy SKILL 的遷移模式章節）。
 *     `/trump` 的 `TrumpData.tsx` 驗證條件是：
 *       `candidate.ok === true && Array.isArray(candidate.items)`
 *     而 `precomputedNotReadyResponse()` 回的是
 *       `{ ok:true, ready:false, endpoint, message }` → `items` 不存在 → 前端進錯誤狀態。
 *
 *   那為什麼還是選嚴格模式？因為**本端點現況本來就是壞的**：
 *     - 遷移前：`{ok:false}` → 前端錯誤狀態（顯示「上游無回應」文案）
 *     - 遷移後 miss：`{ok:true, ready:false}` → 前端同樣錯誤狀態
 *     ⇒ **兩者對使用者等價，沒有回歸**；而 fallthrough 到即時計算只會多燒 8.48s 再失敗。
 *   （對照組：`dividend-calendar` / `block-trades` 遷移前**是好的**，
 *     回 `ready:false` 會把可用頁面改壞 → 那兩支才必須用寬鬆模式。）
 *
 * ## 變體（variant）設計
 *
 *   `days` 會改變 Google News 的 `when:<days>d` 控窗與 `withinWindow` 過濾，
 *   所以**不能只存一份**。但頁面只用 45，為其他 89 個值各存一份毫無意義：
 *
 *     - `days=45`（＝DEFAULT_DAYS）→ 走預算 `scan:trump-radar`（**無 variant**）
 *     - 其他 days 值            → 維持即時計算（頁面不使用；保留 API 相容性）
 *
 * ## 誠實原則
 *
 *   預算尚未產出／KV 讀取失敗 → 200 + `ready:false`（**不回 5xx**、不 fallthrough）。
 *   唯一例外是 **KV 未綁定**（本地開發／尚未部署），此時走即時計算以維持可開發性。
 *   主要上游（英文 Google News）失敗 → 200 + `{ok:false,error:'upstream_error'}`
 *   （不 5xx、不回空陣列假裝成功）。
 *
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKv, type SkynetKv } from '@/lib/godBridge';
import {
  precomputedHitResponse,
  precomputedNotReadyResponse,
  readPrecomputedDetailed,
} from '@/lib/precomputed';
import {
  DEFAULT_DAYS,
  buildTrumpRadarResponse,
  clampDays,
  getTrumpRadar,
} from '@/app/trump/trump-data';
import { type TrumpRadarFailure, type TrumpRadarResponse } from '@/lib/trumpRadar';

/**
 * 無參數／預設參數的 GET 在 Next.js 可能被嘗試**建置期靜態求值**
 * （`next build` 時讀一次 KV 並烘進產物）→ 顯式宣告為動態。
 * 本 route 的預算命中路徑**不含 `fetch`**，正是靜態求值最容易誤判的形狀。
 */
export const dynamic = 'force-dynamic';

/** KV 快取 TTL：30 分鐘（僅用於「非預設天數」的即時計算路徑）。 */
const KV_TTL_MS = 30 * 60 * 1000;
/** KV key 前綴（含版本號，schema 變動時可安全失效舊資料）。 */
const KV_KEY_PREFIX = 'trump_radar:v1:';

/** KV 存檔形狀：{ ts, payload }（ts 供 TTL 判定）。 */
type KvStored = { ts: number; payload: TrumpRadarResponse };

/** 讀 KV 快取；解析失敗或形狀不符回 null（不阻塞）。 */
async function readKv(kv: SkynetKv | undefined, key: string): Promise<KvStored | null> {
  if (!kv) return null;
  try {
    const raw = (await kv.get(key, 'json')) as unknown;
    if (raw === null || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.ts !== 'number' || rec.payload === null || typeof rec.payload !== 'object') {
      return null;
    }
    return { ts: rec.ts, payload: rec.payload as TrumpRadarResponse };
  } catch {
    return null;
  }
}

/** 寫 KV 快取；失敗不阻塞主流程（KV 是優化非必需）。 */
async function writeKv(kv: SkynetKv | undefined, key: string, payload: TrumpRadarResponse): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify({ ts: Date.now(), payload } satisfies KvStored), {
      expirationTtl: Math.floor(KV_TTL_MS / 1000),
    });
  } catch {
    /* KV 寫失敗不阻塞；不記 log 以避免冷啟動 CPU 開銷 */
  }
}

/** 回應 header：10 分鐘共享快取標記 + 資料源 + stale 標記。 */
function jsonHeaders(source: string, stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'public, s-maxage=600',
    'X-Skynet-Data-Source': source,
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

/**
 * 「非預設天數」的即時計算路徑（保留 API 相容性；/trump 頁不使用）。
 *
 * ⚠ 線上環境若走到這裡代表有人指定了 `days != 45`。此路徑仍可能因
 *   邊緣端不可達上游而回 `upstream_error`——這是**已知且刻意保留**的行為：
 *   不為一個頁面不使用的參數組合再做一份預算。
 */
async function serveLive(days: number): Promise<Response> {
  const kv = await getKv();
  const kvKey = `${KV_KEY_PREFIX}${days}`;

  // 1) KV 新鮮命中（30 分鐘內）→ 直接回，不打上游。
  const cached = await readKv(kv, kvKey);
  if (cached && Date.now() - cached.ts < KV_TTL_MS) {
    return NextResponse.json(cached.payload, { status: 200, headers: jsonHeaders('kv-cache', false) });
  }

  // 2) 抓三條上游；英文為主要來源，失敗即視為整體失敗。
  const result = await getTrumpRadar({ days });

  if (result) {
    if (result.gaps.length > 0) {
      // 誠實出聲：輔助上游失敗不阻塞，但必須留下紀錄（block-trades 的教訓：
      // 靜默降級會變成「回 200 但資料默默變少」的缺陷）。
      console.warn(`[trump-radar] 輔助上游缺漏：${result.gaps.join('；')}`);
    }
    const payload = buildTrumpRadarResponse(result, new Date().toISOString());
    await writeKv(kv, kvKey, payload);
    return NextResponse.json(payload, { status: 200, headers: jsonHeaders('rss-fresh', false) });
  }

  // 3) 英文上游失敗 → stale-on-error：回上次快取（標 stale），絕不假裝成功。
  if (cached) {
    return NextResponse.json(cached.payload, { status: 200, headers: jsonHeaders('kv-cache', true) });
  }

  // 4) 完全無快取 → 誠實失敗（200 + ok:false，不 5xx、不回空陣列）。
  const failure: TrumpRadarFailure = { ok: false, error: 'upstream_error', days };
  return NextResponse.json(failure, { status: 200, headers: jsonHeaders('upstream-error', false) });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get('days'));

  // ── 預設天數：離線預算直送（零解析、零序列化、零上游抓取） ──
  if (days === DEFAULT_DAYS) {
    const read = await readPrecomputedDetailed('trump-radar');
    if (read.status === 'ok') {
      return precomputedHitResponse(read.text);
    }
    // 尚未產出／KV 讀取失敗 → 誠實回 ready:false（不 5xx、不重算、不燒 8 秒逾時）。
    if (read.status !== 'unbound') {
      return precomputedNotReadyResponse('trump-radar');
    }
    // ── KV 未綁定（本地 dev／尚未部署）→ 走即時計算，維持本機可開發性 ──
    // ⚠ 線上環境 KV 一定綁定，因此線上永遠不會走到這裡。
  }

  return serveLive(days);
}
