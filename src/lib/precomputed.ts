/**
 * src/lib/precomputed.ts
 * ────────────────────────────────────────────────────────────────────────────
 * 【P1 核心元件】「離線預算 ＋ 邊緣零解析直送」的共用讀取層。
 *
 * 為什麼需要這個（務必先讀懂，否則會把端點改壞）：
 *
 *   Cloudflare **Free plan 的 Worker CPU 上限是 10ms**。2026-10-04 以
 *   `wrangler tail --format=json` 實測 `cpuTime`，發現**地板值就有 7ms**
 *   （OpenNext 執行期初始化 ＋ 讀一個 KV key ＋ 回傳小 JSON）：
 *
 *     /api/skynet/god/latest-date   cpu= 7ms   ← 地板
 *     /api/skynet/signal-log        cpu= 8ms
 *     /api/skynet/cb                cpu=10ms   ← 正好卡在上限
 *     /api/skynet/god/dashboard     cpu=16ms   ← 已超出
 *
 *   ⇒ 任何「在請求時解析大 JSON」的端點（`JSON.parse` ＋ 重新組裝 ＋
 *     `JSON.stringify`）**必然爆表**，線上直接 **503 error code: 1102**。
 *     實測受害者：market-bars / block-trades / candidate-chart /
 *     dividend-calendar / etf-active / fundamental / chips / margin-maint /
 *     stock-research / market-overview / futures。
 *
 *   ⇒ 唯一可行架構：**把計算搬到本機（離線預算），KV 存「可直接送出的 JSON 字串」，
 *     邊緣端只做 `kv.get(key)`（文字）→ `new Response(text)`，完全不解析。**
 *     本檔就是那個「完全不解析」的讀取層。
 *
 * ⚠ 三個務必遵守的設計約束：
 *   1. **絕對不可以 `JSON.parse`**。要用 `kv.get(key)`（文字模式，不傳 'json'），
 *      並用 `new Response(text)` 直接轉發。用 `kv.get(key,'json')` 會讓 KV 在
 *      邊緣端解析整包 JSON——那正是 1102 的成因。
 *   2. **絕不 `JSON.stringify`**。payload 在離線端就已序列化完成。
 *   3. **無值時不可捏造**。`servePrecomputed()` 回 `null` 讓呼叫端自行決定；
 *      `servePrecomputedOrNotReady()` 回 200 + `ready:false` ＋誠實文案。
 *      **「尚未產出」與「端點故障」必須可區分**（本專案既有資料誠實原則）。
 *
 * ⚠ 為什麼 `ready:false` 比 fallback 好：
 *   對目前已經 1102 的端點而言，回 `200 + ready:false` 是**改善**（前端能顯示
 *   「尚未產出」），而 fallthrough 到原本的重計算只會繼續 1102。因此遷移完成後
 *   應改用 `servePrecomputedOrNotReady()`，讓邊緣端**永不**執行重計算。
 *
 * KV key 命名：`scan:<name>`（與 scripts/precompute-scan.mjs 既有慣例一致，
 *   該腳本已在使用 `scan:pattern-screen` / `scan:swing-hub` / `scan:cb`）。
 */

import { readKvTextCached, readKvTextDetailed, type KvTextRead } from '@/lib/kvReadCache';

/** 預算結果的 KV key 前綴（與 scripts/precompute-scan.mjs 一致）。 */
export const PRECOMPUTED_KV_PREFIX = 'scan:';

/**
 * 已納入離線預算的端點註冊表。
 *
 * ⚠ 新增端點時**必須**同時在 scripts/precompute-scan.mjs 加入對應的
 *    payload builder，否則邊緣端會永遠回 `ready:false`。
 *
 * 值 = KV key 後綴（不含 `scan:` 前綴）。
 */
export const PRECOMPUTED_ENDPOINTS = {
  'market-overview': 'market-overview',
  treemap: 'treemap',
  'trump-radar': 'trump-radar',
  'market-bars': 'market-bars',
  'candidate-chart': 'candidate-chart',
  'stock-research': 'stock-research',
  'dividend-calendar': 'dividend-calendar',
  'block-trades': 'block-trades',
  'etf-active': 'etf-active',
  'margin-maint': 'margin-maint',
  fundamental: 'fundamental',
  chips: 'chips',
} as const;

/** 已註冊的預算端點名稱（base name）。 */
export type PrecomputedName = keyof typeof PRECOMPUTED_ENDPOINTS;

/**
 * 組出完整的 KV key。
 *
 * @param name    base name（見 `PRECOMPUTED_ENDPOINTS`）
 * @param variant 可選的參數變體後綴，用於「同一端點但參數不同」的情況。
 *
 * 為什麼需要 variant：
 *   某些端點的輸出**取決於查詢參數**，不能只存一份。
 *   例：`/api/skynet/market-overview?sectorLimit=5` 與 `=32` 的 `sectorFocus` 數量不同。
 *   → `precomputedKvKey('market-overview')`      ⇒ `scan:market-overview`（預設 32）
 *     `precomputedKvKey('market-overview','sl5')` ⇒ `scan:market-overview:sl5`
 *
 * ⚠ 變體必須是**短、穩定、可枚舉**的字串（由呼叫端自行組）。
 *    不可直接把原始 query string 拼進來——順序與編碼不穩定會導致永不命中。
 */
export function precomputedKvKey(name: PrecomputedName, variant?: string): string {
  const base = PRECOMPUTED_ENDPOINTS[name];
  return variant ? `${PRECOMPUTED_KV_PREFIX}${base}:${variant}` : `${PRECOMPUTED_KV_PREFIX}${base}`;
}

/**
 * 預算結果的回應標頭。
 *
 * ⚠ `Cache-Control: public` 在 `*.workers.dev` 上**不會**產生邊緣快取
 *   （2026-10-04 實測：連打 4 次 → `wrangler tail` 收到 4 筆執行事件，
 *    且無 `cf-cache-status` / `age` 標頭）。
 *   這裡的 `max-age` 實際作用在**瀏覽器端**，可避免同一頁面反覆導覽時重打端點。
 *   邊緣端的 CPU 節省來自「零解析直送」，不是來自快取。
 */
export const PRECOMPUTED_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
  'X-Skynet-Data-Source': 'precomputed-kv',
};

/** 尚未產出時的回應標頭：短快取，讓資料一到就能很快被看到。 */
export const NOT_READY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=30',
  'X-Skynet-Data-Source': 'precomputed-kv',
};

/**
 * 讀取預算結果的**原始 JSON 字串**（不解析）。
 *
 * 走 `readKvTextCached` 的三層快取（isolate in-memory → Cache API → KV），
 * 因此同一 isolate 的重複請求**不會再打 KV**——這是免費方案下壓低
 * 「KV 每日讀取量」的關鍵（2026-10-04 實測 `workers.dev` 無 CDN 快取）。
 *
 * @returns 字串；KV 未綁定 / 讀取失敗 / 無此 key 皆回 `null`（絕不拋錯）。
 */
export async function readPrecomputedText(
  name: PrecomputedName,
  variant?: string,
): Promise<string | null> {
  return readKvTextCached(precomputedKvKey(name, variant));
}

/** 把預算結果文字包成可直接送出的 `Response`（**不做任何解析**）。 */
export function precomputedHitResponse(text: string): Response {
  return new Response(text, { status: 200, headers: { ...PRECOMPUTED_HEADERS } });
}

/** 組「盤後預算尚未產出」的誠實回應（200 + `ready:false`，絕不回 5xx）。 */
export function precomputedNotReadyResponse(name: PrecomputedName, variant?: string): Response {
  const body = JSON.stringify({
    ok: true,
    ready: false,
    endpoint: name,
    ...(variant ? { variant } : {}),
    message: '盤後預算尚未產出（請執行 scripts/precompute-scan.mjs）',
  });
  return new Response(body, { status: 200, headers: { ...NOT_READY_HEADERS } });
}

/**
 * 讀取預算結果並回傳**完整狀態**（含 `unbound`）。
 *
 * 給需要「KV 未綁定時走即時計算（本地開發）」的端點用。
 * 線上環境 KV 一定綁定，因此線上永遠不會走到 fallthrough 分支。
 */
export async function readPrecomputedDetailed(
  name: PrecomputedName,
  variant?: string,
): Promise<KvTextRead> {
  return readKvTextDetailed(precomputedKvKey(name, variant));
}

/**
 * 若有預算結果 → 回可直接送出的 `Response`；否則回 `null`（由呼叫端決定 fallback）。
 *
 * ⚠ 此函式**不做任何 JSON 解析或序列化**，是 CPU 成本最低的直送路徑。
 */
export async function servePrecomputed(
  name: PrecomputedName,
  variant?: string,
): Promise<Response | null> {
  const text = await readPrecomputedText(name, variant);
  if (text === null) return null;
  return precomputedHitResponse(text);
}

/**
 * 嚴格模式：有預算結果就直送；**沒有也回 200 + `ready:false`**，永不 fallthrough。
 *
 * 用於「已確認邊緣端重計算必然 1102」的端點——回 `ready:false` 是改善，
 * 繼續重計算只會 503。
 *
 * 回應形狀（對齊本專案 App 七端點的 ready 語意）：
 *   `{ ok:true, ready:false, endpoint, message:'盤後預算尚未產出' }`
 */
export async function servePrecomputedOrNotReady(
  name: PrecomputedName,
  variant?: string,
): Promise<Response> {
  const text = await readPrecomputedText(name, variant);
  if (text !== null) return precomputedHitResponse(text);
  // ⚠ 誠實文案：明確區分「尚未產出」與「端點故障」。不可回 5xx。
  return precomputedNotReadyResponse(name, variant);
}
