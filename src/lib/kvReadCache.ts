/**
 * src/lib/kvReadCache.ts
 * ────────────────────────────────────────────────────────────────────────────
 * 【免費方案降本核心】Cloudflare KV 讀取的三層快取。
 *
 * 背景（為什麼需要這個）：
 *   2026-10-04 09:14 BOSS 收到 Cloudflare 告警「**KV 每日操作數已達免費方案 50%**」。
 *   免費方案 KV 每日上限：**讀 100,000 次 / 寫 1,000 次**（超過即回 429，Worker 會失敗）。
 *
 *   原本以為「開啟 `Cache-Control: public` 就能讓邊緣快取擋掉重複讀取」——
 *   但 2026-10-04 實測**推翻了這個假設**：
 *     連打 `/api/skynet/cb` 4 次 → `wrangler tail` 收到 **4 筆 Worker 執行事件**，
 *     且回應**完全沒有 `cf-cache-status`、也沒有 `age`**。
 *   ⇒ **`*.workers.dev` 沒有 CDN 快取層**，`Cache-Control` 只在**瀏覽器端**生效。
 *   ⇒ 要在**免費方案**下壓低 KV 讀取，只剩兩條路：
 *        (a) isolate 內的 in-memory 快取（模組層級變數，跨請求存活）
 *        (b) Cache API（`caches.default`，Worker 自行讀寫邊緣快取，跨 isolate）
 *     本檔就是這兩層的實作。
 *
 * 三層架構（由上而下，命中即返回）：
 *   ┌ L1 isolate in-memory ── Map，命中成本 ≈ 0（零 KV 讀取、零解析）
 *   ├ L2 Cache API ────────── 跨 isolate、同機房；存**文字**，命中仍需 JSON.parse
 *   └ L3 KV ──────────────── 唯一真實來源（讀取計費）
 *
 * ⚠ 為什麼 L1 要分「文字」與「已解析物件」兩種：
 *   對「只是要原樣轉發」的端點（如 precomputed 的零解析直送），快取**文字**最好——
 *   命中時 `new Response(text)` 完全不用解析。
 *   對「需要讀欄位」的端點（如 god 信封要算 age_ms），快取**已解析物件**最好——
 *   命中時連 `JSON.parse` 都省了。這在 10ms CPU 預算下是關鍵差異。
 *
 * ⚠ 一致性取捨（務必理解，否則會誤以為「資料不見了」）：
 *   in-memory 快取**無法被其他 isolate 主動失效**。當 `/api/skynet/god/ingest`
 *   在 A isolate 寫入新資料時，B isolate 的 in-memory 快取仍會持有舊值直到 TTL 到期。
 *   → 因此「有值」的 TTL 設 60 秒、「查無值」的 TTL 設 20 秒：
 *     新資料最多 60 秒後可見；「尚未產出」最多 20 秒後就會重新查 KV（避免資料到了卻卡住）。
 *     這比原本 `ready:false` 的 30 秒快取更保守。
 *
 * ⚠ 絕不快取「拋錯」。KV 讀取失敗一律視為 error 且不寫入快取，
 *   否則一次網路抖動會讓錯誤狀態被鎖住 TTL 那麼久。
 *
 * ⚠ 為什麼要區分 unbound / error / missing（而不是一律 null）：
 *   本專案的資料誠實原則是「尚未產出」與「端點故障」必須可區分。
 *   `KV 尚未綁定` ≠ `資料尚未產出`，混為一談會讓前端誤判為服務故障。
 *   （2026-10-04 實際踩到：把 read-throw 收斂成 null，導致 god-bridge 測試紅。）
 */

import { getKv } from '@/lib/godBridge';

/** 「有值」的 L1 TTL：60 秒。 */
const MEM_TTL_MS = 60_000;
/** 「查無值」的 L1 TTL：20 秒（比 ready:false 的 30 秒快取更保守）。 */
const MEM_MISS_TTL_MS = 20_000;
/** L1 最多保留幾筆（避免 isolate 長時間存活導致記憶體無上限成長）。 */
const MEM_MAX_ENTRIES = 48;
/** L2 Cache API 的 TTL：60 秒（與 L1 對齊）。 */
const CACHE_API_TTL_S = 60;

/** L1 條目：value 為 null 代表「查無此 key」（negative cache）。 */
type MemEntry = { value: string | null; ts: number; ttl: number };

/** isolate 內共用（同一 bundle 內所有 import 本模組的 route 共享同一個 Map）。 */
const memText = new Map<string, MemEntry>();
/** 已解析物件的 L1（給需要讀欄位的端點用，命中時省下 JSON.parse）。 */
const memJson = new Map<string, { value: unknown; ts: number; ttl: number }>();

/** 簡易 LRU：超過上限時刪掉最舊插入的一筆（Map 保持插入序）。 */
function evictIfNeeded(map: Map<string, unknown>): void {
  while (map.size > MEM_MAX_ENTRIES) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}

/**
 * 取 Cache API（`caches.default`）。本地 dev／非 Workers 環境可能不存在 → 回 undefined。
 * ⚠ 不可假設它一定可用；一律以 try/catch 兜底，缺席時直接跳過 L2。
 */
function getCacheApi(): Cache | undefined {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return c?.default;
  } catch {
    return undefined;
  }
}

/**
 * L2 的合成 URL。Cache API 以 URL 為 key，這裡用保留網域避免與真實請求衝突。
 * ⚠ 必須是合法 URL，且不同 KV key 要對應不同 URL。
 */
function l2Url(key: string): string {
  return `https://kv-read-cache.internal/${encodeURIComponent(key)}`;
}

/** 讀 L2；命中回文字，否則 null。任何錯誤一律視為 miss。 */
async function readL2(key: string): Promise<string | null> {
  const cache = getCacheApi();
  if (!cache) return null;
  try {
    const hit = await cache.match(l2Url(key));
    if (!hit) return null;
    const text = await hit.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** 寫 L2；失敗不阻塞（L2 是優化非必需）。 */
async function writeL2(key: string, text: string): Promise<void> {
  const cache = getCacheApi();
  if (!cache) return;
  try {
    await cache.put(
      l2Url(key),
      new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `max-age=${CACHE_API_TTL_S}`,
        },
      }),
    );
  } catch {
    /* L2 寫入失敗不影響正確性 */
  }
}

/**
 * 命中的層級（供觀測用）。
 * - `l1`：isolate 內 in-memory（**零 KV 讀取**）
 * - `l2`：Cache API（**零 KV 讀取**）
 * - `kv`：真正讀了 KV（計費）
 */
export type KvCacheTier = 'l1' | 'l2' | 'kv';

/**
 * KV 文字讀取的四態結果。
 *
 * - `ok`      ：讀到內容（非空字串）
 * - `missing` ：key 不存在或值為空（**已 negative cache**）
 * - `error`   ：KV 讀取拋錯（**不快取**，讓下次有機會成功）
 * - `unbound` ：KV 未綁定（本地 dev／尚未部署／`getCloudflareContext` 失敗）
 */
export type KvTextRead =
  | { status: 'ok'; text: string; source: KvCacheTier }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'unbound' };

/**
 * 三層快取讀取 KV **文字**，保留完整四態。
 *
 * ⚠ 一律以**文字模式**讀取（`kv.get(key)`，**不可**傳 `'json'`）：
 *   KV 直接回傳字串，由呼叫端決定要不要解析，避免被迫付出解析成本。
 */
export async function readKvTextDetailed(key: string): Promise<KvTextRead> {
  const now = Date.now();

  // ── L1：isolate in-memory（成本 ≈ 0）
  const l1 = memText.get(key);
  if (l1 && now - l1.ts < l1.ttl) {
    return l1.value === null
      ? { status: 'missing' }
      : { status: 'ok', text: l1.value, source: 'l1' };
  }

  // ── L2：Cache API（跨 isolate；存文字，命中免 KV 讀取）
  const l2 = await readL2(key);
  if (l2 !== null) {
    memText.set(key, { value: l2, ts: now, ttl: MEM_TTL_MS });
    evictIfNeeded(memText);
    return { status: 'ok', text: l2, source: 'l2' };
  }

  // ── L3：KV（唯一真實來源，計費）
  const kv = await getKv();
  if (!kv) return { status: 'unbound' };

  let text: unknown;
  try {
    text = await kv.get(key);
  } catch {
    // 讀取失敗**不快取**（避免把錯誤狀態鎖住 TTL）。
    return { status: 'error' };
  }

  if (typeof text !== 'string' || text.length === 0) {
    // negative cache：避免對「尚未產出」的 key 反覆打 KV。
    memText.set(key, { value: null, ts: now, ttl: MEM_MISS_TTL_MS });
    evictIfNeeded(memText);
    return { status: 'missing' };
  }

  memText.set(key, { value: text, ts: now, ttl: MEM_TTL_MS });
  evictIfNeeded(memText);
  void writeL2(key, text);
  return { status: 'ok', text, source: 'kv' };
}

/**
 * 三層快取讀取 KV **文字**（簡化版）。
 *
 * @returns 文字內容；`missing` / `error` / `unbound` 一律回 `null`
 */
export async function readKvTextCached(key: string): Promise<string | null> {
  const result = await readKvTextDetailed(key);
  return result.status === 'ok' ? result.text : null;
}

/**
 * 三層快取讀取 KV 並**解析為物件**。
 *
 * 給「需要讀欄位」的端點用（例如 god 信封要算 `age_ms`）。
 * L1 直接存已解析物件 → 命中時**連 `JSON.parse` 都省下**（10ms 預算下的關鍵）。
 *
 * ⚠ 本函式**不區分**失敗原因，一律回 `null`。
 *    若呼叫端需要區分（本專案慣例：`KV 尚未綁定`／`資料尚未產出`／`內容損壞` 必須不同文案），
 *    請改用 `readKvJsonDetailed()`。
 */
export async function readKvJsonCached<T>(key: string): Promise<T | null> {
  const result = await readKvJsonDetailed<T>(key);
  return result.status === 'ok' ? result.value : null;
}

/** `readKvJsonDetailed` 的五態結果（沿用 `KvTextRead` 的語意）。 */
export type KvJsonRead<T> =
  | { status: 'ok'; value: T; source: KvCacheTier }
  | { status: 'missing' }
  | { status: 'corrupt' }
  | { status: 'error' }
  | { status: 'unbound' };

/**
 * 三層快取讀取 KV 並解析，**保留完整狀態**。
 *
 * 用於需要誠實區分「尚未產出」／「內容損壞」／「KV 未綁定」的端點
 * （例如 `swing-hub` 會分別回 `buildSwingHubNotReady()` 與 `buildSwingHubKvCorrupt()`）。
 *
 * ⚠ 損壞的內容**不快取**（讓資料修好後能立即恢復），僅成功的解析結果進 L1。
 */
export async function readKvJsonDetailed<T>(key: string): Promise<KvJsonRead<T>> {
  const now = Date.now();
  const hit = memJson.get(key);
  if (hit && now - hit.ts < hit.ttl) {
    // L1 的已解析物件快取命中 → 零 KV 讀取、零 JSON.parse。
    return { status: 'ok', value: hit.value as T, source: 'l1' };
  }

  const read = await readKvTextDetailed(key);
  if (read.status !== 'ok') return { status: read.status };

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return { status: 'corrupt' };
  }
  if (parsed === null || typeof parsed !== 'object') return { status: 'corrupt' };

  memJson.set(key, { value: parsed, ts: now, ttl: MEM_TTL_MS });
  evictIfNeeded(memJson);
  return { status: 'ok', value: parsed as T, source: read.source };
}

/**
 * 寫入 KV 後呼叫，清掉本 isolate 的 L1（避免自己寫完自己讀到舊值）。
 *
 * ⚠ 只清得掉**本 isolate**；其他 isolate 仍要等 TTL 到期（見檔首「一致性取捨」）。
 */
export function invalidateKvReadCache(key: string): void {
  memText.delete(key);
  memJson.delete(key);
}

/**
 * 清空**所有** L1 快取。
 *
 * ⚠ 測試必用：L1 是**模組層級變數**，會在同一測試檔的 `it()` 之間存活。
 *   若不在 `beforeEach` / `afterEach` 清掉，前一個測試塞進去的值會被下一個測試讀到，
 *   造成「明明 mock 回無值，卻拿到 ready:true」這類**假失敗**。
 *   （2026-10-04 實際踩到：swing-hub / cb / god-bridge 三個 route 測試共 12 筆失敗。）
 *
 * ⚠ 生產環境**不要**隨意呼叫：清空等於放棄快取帶來的 KV 讀取節省。
 */
export function clearKvReadCache(): void {
  memText.clear();
  memJson.clear();
}
