/**
 * Fugle 請求層 cache（spec §2-C：防爆 100 req/hr + 5 req/min 免費額度）。
 *
 * 供 kline/ + fusion/ route 共用的純 in-memory 請求層快取原語
 *（比照 futures/route.ts 的 inflight 去重 + TTL cache + stale-on-error 架構；
 * 本層不做 KV / 邊界 cache——那是 futures 收盤資料專屬的三層設計，Fugle 只需 60s 請求層）。
 *
 * 行為：
 * - per-`key` inflight 去重：N 個並發請求只觸發 1 次上游 fetch；存「進行中 Promise」，
 *   finally 裡清空（含 rejected），避免卡住直到 isolate 重啟。
 * - 60s TTL cache（FUGLE_CACHE_TTL_MS）：使用者搜尋 → 查 cache → 沒有最新 → 打 Fugle →
 *   寫入 cache → 回傳。**不要每次使用者直打 Fugle。**
 * - stale-on-error：上游失敗（HTTP 非 2xx / 逾時 / 網路錯誤 / JSON 解析失敗）且存在
 *   已過期快照 → 回快照（source 'fugle-stale'，呼叫端加 X-Skynet-Stale: true header）；
 *   完全無快照 → data null（source 'fugle-miss'），呼叫端走既有 fallback（如 Yahoo）。
 * - 失敗結果（含解析失敗）絕不寫入 cache：不補零、不造假數字。
 *
 * 本檔只提供「fetch + cache」原語；端點 URL 建構、參數正規化、回應 shape
 * 全部留在各 route 內，對前端透明（純包 cache 層）。
 */

/** Fugle 回應快取 TTL：60 秒（spec §2-C 即時性可接受範圍）。 */
export const FUGLE_CACHE_TTL_MS = 60_000;
/** 上游 fetch 超時：4 秒（比照 futures/route.ts 的 UPSTREAM_TIMEOUT_MS 模式）。 */
export const FUGLE_UPSTREAM_TIMEOUT_MS = 4_000;
/** 快取容量上限（per-isolate 純 in-memory；超出從最舊 FIFO 逐出，防無界增長）。 */
const MAX_CACHE_ENTRIES = 512;

/**
 * 嘗試（fetcher）結果：
 * - data：成功取到已解析的上游 JSON（呼叫端決定型別 T）。
 * - upstream-failure：上游失敗；status 為 HTTP 狀態碼（JSON 解析失敗 / 逾時 / 網路錯誤為 undefined）。
 * 呼叫端自行在 fetcher 內決「什麼才算有效資料」（例如 candles 少於 21 根視同失敗不寫 cache）。
 */
export type FugleAttempt<T> =
  | { kind: 'data'; data: T }
  | {
      kind: 'upstream-failure';
      /** 上游 HTTP 狀態碼（逾時 / 網路錯誤 / JSON 解析失敗為 undefined）。 */
      status?: number;
      /** true = 上游逾時（AbortSignal.timeout 觸發），呼叫端可自訂 error 映射。 */
      timeout?: boolean;
    };

export type FugleCacheSource = 'fugle-cache' | 'fugle-fresh' | 'fugle-stale' | 'fugle-miss';

export type FugleCacheOutcome<T> = {
  /** 已解析資料；僅 'fugle-miss' 時為 null。 */
  data: T | null;
  /** cache=命中 60s TTL；fresh=新鮮上游抓；stale=上游掛後回過期快照；miss=上游掛且無快照。 */
  source: FugleCacheSource;
  /** 上游 HTTP 狀態（僅 stale/miss 有；JSON 解析失敗 / 逾時 / 網路錯誤為 undefined）。 */
  upstreamStatus?: number;
  /** 上游失敗原因為逾時（僅 stale/miss 可能有；呼叫端可自訂 error 映射）。 */
  upstreamTimeout?: boolean;
  /** 快照取得時間（ISO；miss 為 undefined）——供運維追蹤快取新鮮度。 */
  fetchedAt?: string;
};

type CacheEntry = { ts: number; data: unknown };

const cacheEntries = new Map<string, CacheEntry>();
const inflightMap = new Map<string, Promise<unknown>>();

/**
 * 組快取金鑰：per-(ticker, 請求參數) 唯一 key。
 * 例：buildFugleCacheKey('kline', ['2330', 'daily', '2026-01-01']) → 'kline:2330:daily:2026-01-01'。
 * 缺失參數一律轉 ''（統一 key，不把 undefined 漏成 "undefined" 字串以外的歧義）。
 */
export function buildFugleCacheKey(
  namespace: string,
  parts: ReadonlyArray<string | number | undefined | null>
): string {
  return [namespace, ...parts.map((part) => String(part ?? ''))].join(':');
}

/** 寫入 / 更新快取（FIFO 淘汰最舊，Map 依插入序）。 */
function remember(key: string, data: unknown): void {
  cacheEntries.delete(key);
  cacheEntries.set(key, { ts: Date.now(), data });
  while (cacheEntries.size > MAX_CACHE_ENTRIES) {
    const oldest = cacheEntries.keys().next();
    if (oldest.done === true) break;
    cacheEntries.delete(oldest.value);
  }
}

/** 依嘗試結果定案：成功寫 cache；失敗回 stale 快照或 miss。 */
function settle<T>(key: string, attemptResult: FugleAttempt<T>): FugleCacheOutcome<T> {
  if (attemptResult.kind === 'data') {
    remember(key, attemptResult.data);
    return { data: attemptResult.data, source: 'fugle-fresh', fetchedAt: new Date().toISOString() };
  }
  // 上游失敗：不寫 cache；過期快照仍在 → stale-on-error（呼叫端加 X-Skynet-Stale: true）。
  const stale = cacheEntries.get(key);
  if (stale) {
    return {
      data: stale.data as T,
      source: 'fugle-stale',
      upstreamStatus: attemptResult.status,
      upstreamTimeout: attemptResult.timeout,
      fetchedAt: new Date(stale.ts).toISOString(),
    };
  }
  return { data: null, source: 'fugle-miss', upstreamStatus: attemptResult.status, upstreamTimeout: attemptResult.timeout };
}

/**
 * 包一層 cache 的 Fugle 上游 fetch：
 * 1. 60s 內同 key 命中 → 直接回（CPU ≈ 0，不打上游）
 * 2. 命中進行中 inflight → 直接 await（N 併發 1 次上游）
 * 3. miss → 跑 attempt → 成功寫 cache / 失敗回 stale 快照或 miss
 *
 * attempt 拒絕（reject）會被歸為 upstream-failure，不會污染其他 await 同一 inflight 的呼叫端。
 */
export async function fetchFugleCached<T>(
  key: string,
  attempt: () => Promise<FugleAttempt<T>>
): Promise<FugleCacheOutcome<T>> {
  const hit = cacheEntries.get(key);
  if (hit && Date.now() - hit.ts < FUGLE_CACHE_TTL_MS) {
    return { data: hit.data as T, source: 'fugle-cache', fetchedAt: new Date(hit.ts).toISOString() };
  }

  const running = inflightMap.get(key);
  if (running) {
    const attemptResult = (await running) as FugleAttempt<T>;
    return settle(key, attemptResult);
  }

  const attemptPromise: Promise<unknown> = Promise.resolve()
    .then(attempt)
    .catch((): FugleAttempt<never> => ({ kind: 'upstream-failure' }));
  inflightMap.set(key, attemptPromise);
  let attemptResult: FugleAttempt<T>;
  try {
    attemptResult = (await attemptPromise) as FugleAttempt<T>;
  } finally {
    inflightMap.delete(key); // 必須在 finally 清空（含 rejected），否則卡住直到 isolate 重啟
  }
  return settle(key, attemptResult);
}
