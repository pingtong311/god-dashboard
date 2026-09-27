/**
 * GOD 辦公室資料橋接層（方案 B：App 側）
 * ----------------------------------------------------------------------------
 * 架構背景：
 *   - 本專案（峰子 App）：前端／呈現查詢資料的窗口，部署在 Cloudflare 邊緣（公網）。
 *   - GOD 辦公室（華爾街峰子）：本機 Agent 辦公室，主維運後端、整理規劃數據，
 *     在 http://127.0.0.1:4010/api/* 產出 6 種標準化 JSON。
 *   兩者無法直接互通（本機 vs 公網）。方案 B：GOD 辦公室「主動 POST 推」資料到
 *   峰子 App，App 存進 KV 供頁面讀取。
 *
 * 重要設計決策：
 *   不把 Cloudflare KV 的寫入憑證交給 GOD 辦公室，而是由 App 提供一個「帶 token 的
 *   ingest 端點」。GOD 側只需一個 HTTP POST，完全不需要 Cloudflare 帳號權限。
 *
 * 本檔只放「共用常數與純函式」——App Router 的 route 檔僅允許匯出 HTTP 方法與
 * 特定設定值，故所有可被 route 與測試共用的邏輯集中在此。
 *
 * 信封格式（GOD 辦公室產出）：
 *   { schema_version, endpoint, generated_at, provenance, payload }
 *   App 於 ingest 時補上 received_at，存成完整 GodEnvelope。
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * 允許的 6 個標準化端點白名單（GOD 辦公室 http://127.0.0.1:4010/api/* 產出）。
 * 以 `as const` 宣告，供 `GodEndpoint` 型別推導與執行期白名單判斷共用（單一真相來源）。
 */
export const GOD_ENDPOINTS = [
  'latest-date',
  'dashboard',
  'radar',
  'sector-sniper',
  'daily-highlights',
  'warroom-boards',
] as const;

/** 白名單端點聯合型別（由 GOD_ENDPOINTS 推導，新增端點只需改一處）。 */
export type GodEndpoint = (typeof GOD_ENDPOINTS)[number];

/** KV key 前綴：所有 GOD 資料集中於 `god:` 命名空間，避免與 futures 等其他 key 混淆。 */
export const GOD_KV_PREFIX = 'god:';

/**
 * 產生 `god:<endpoint>` 的 KV key。
 * @param endpoint 已通過白名單的端點
 * @returns 形如 `god:dashboard` 的 key
 */
export function godKvKey(endpoint: GodEndpoint): string {
  return `${GOD_KV_PREFIX}${endpoint}`;
}

/**
 * KV TTL：7 天。
 * 刻意取長（涵蓋週末與連假），避免 GOD 辦公室在長假期間未推送時資料過期變空，
 * 讓頁面在長假後仍能讀到最近一次的有效快照。
 */
export const GOD_KV_TTL_SECONDS = 604800;

/** 單次 ingest payload 上限：256KB（262144 bytes），超過回 413。 */
export const MAX_PAYLOAD_BYTES = 262144;

/** GET 端點的 stale 判定門檻：6 小時。超過視為過期（資料誠實，前端可據此提示）。 */
export const GOD_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * 標準化信封（存進 KV 的形狀）。
 * received_at 由 App 於 ingest 時以 `new Date().toISOString()` 補上，
 * 供 GET 端點計算 age_ms 與 stale。
 */
export type GodEnvelope = {
  /** 信封版本（GOD 側提供；缺席時 App 以 '1' 兜底）。 */
  schema_version: string;
  /** 端點名稱（白名單之一）。 */
  endpoint: GodEndpoint;
  /** GOD 側產出時間（ISO 字串）。 */
  generated_at: string;
  /** 來源追蹤資訊（可選，形狀由 GOD 側自定）。 */
  provenance?: unknown;
  /** 實際資料內容。 */
  payload: unknown;
  /** App 收件時間（ISO 字串），由 ingest 補上。 */
  received_at: string;
};

/** 通過驗證的 ingest 輸入（parseIngestBody 成功時的 value）。 */
export type IngestInput = {
  endpoint: GodEndpoint;
  payload: unknown;
  generated_at: string;
  schema_version?: string;
  provenance?: unknown;
};

/** parseIngestBody 的結果：成功帶 value，失敗帶 error（機器可判）與 message（人可讀）。 */
export type ParseIngestResult =
  | { ok: true; value: IngestInput }
  | { ok: false; error: string; message: string };

/**
 * 白名單判斷（型別守衛）。
 * @param value 任意值
 * @returns 是否為允許的端點
 */
export function isGodEndpoint(value: unknown): value is GodEndpoint {
  return typeof value === 'string' && (GOD_ENDPOINTS as readonly string[]).includes(value);
}

/**
 * KV 綁定型別（Cloudflare KV Namespace 的最小介面子集）。
 * 本專案的 KV 綁定名為 SKYNET_CACHE（見 wrangler.jsonc 的 [[kv_namespaces]]）。
 */
export type SkynetKv = {
  get: (key: string, type?: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

/**
 * 取 KV 綁定（可能 undefined——本地 dev / 未綁定 / 非 Workers 環境）。
 *
 * 透過 @opennextjs/cloudflare 的 getCloudflareContext({ async: true }) 取得 Workers
 * 綁定集合 env（即 env.SKYNET_CACHE）。
 *
 * ⚠ 不可改用 `globalThis.SKYNET_CACHE`：@opennextjs/cloudflare v1.20.1 在 Workers
 * 生產環境並不會把綁定掛上 globalThis，該寫法在生產環境恆為 undefined（導致 KV 快取
 * 從未生效）。正確用法見 src/app/api/skynet/line-webhook/route.ts。
 *
 * 讀寫端一律以 try/catch 兜底，KV 缺席時不可阻塞主流程（本專案既有慣例）。
 */
export async function getKv(): Promise<SkynetKv | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { SKYNET_CACHE?: SkynetKv }).SKYNET_CACHE;
  } catch {
    // 本地 dev / 未綁定 / 非 Workers 環境：回 undefined，讀寫一律兜底不阻塞主流程。
    return undefined;
  }
}

/**
 * JSON 序列化；不可序列化（循環引用等）回 null。
 * 用於「payload 可序列化」與位元組數計算的共用底層。
 */
function safeStringify(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
}

/**
 * payload 序列化後的位元組數（UTF-8）。
 * 不可序列化時回 0（呼叫端在此之前應已擋掉）。
 * @param payload 任意 payload
 * @returns 位元組數
 */
export function payloadByteLength(payload: unknown): number {
  const serialized = safeStringify(payload);
  if (serialized === null) return 0;
  return new TextEncoder().encode(serialized).length;
}

/**
 * 驗證 ingest 請求 body（純函式，不觸及網路／KV）。
 *
 * 規則：
 *   1. body 必須是物件
 *   2. endpoint 必須存在、為字串且在白名單內
 *   3. payload 必須存在且可序列化為 JSON
 *   4. payload 序列化後位元組數不得超過 MAX_PAYLOAD_BYTES
 *   5. generated_at 必須為非空字串
 *
 * @param body 已解析的 JSON（未知形狀）
 * @returns 成功 `{ ok:true, value }`；失敗 `{ ok:false, error, message }`
 */
export function parseIngestBody(body: unknown): ParseIngestResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body', message: '請求內容必須是 JSON 物件。' };
  }

  const record = body as Record<string, unknown>;

  const endpoint = record.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return { ok: false, error: 'invalid_endpoint', message: '缺少 endpoint 欄位或型別錯誤。' };
  }
  if (!isGodEndpoint(endpoint)) {
    return { ok: false, error: 'unknown_endpoint', message: `不支援的 endpoint：${endpoint}` };
  }

  if (!('payload' in record) || record.payload === undefined) {
    return { ok: false, error: 'missing_payload', message: '缺少 payload 欄位。' };
  }
  const serialized = safeStringify(record.payload);
  if (serialized === null) {
    return { ok: false, error: 'invalid_payload', message: 'payload 無法序列化為 JSON。' };
  }
  if (new TextEncoder().encode(serialized).length > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: 'payload_too_large',
      message: `payload 超過上限 ${MAX_PAYLOAD_BYTES} bytes。`,
    };
  }

  const generatedAt = record.generated_at;
  if (typeof generatedAt !== 'string' || generatedAt.length === 0) {
    return {
      ok: false,
      error: 'invalid_generated_at',
      message: '缺少 generated_at 欄位或型別錯誤。',
    };
  }

  const value: IngestInput = {
    endpoint,
    payload: record.payload,
    generated_at: generatedAt,
    schema_version:
      typeof record.schema_version === 'string' ? record.schema_version : undefined,
    provenance: record.provenance,
  };

  return { ok: true, value };
}
