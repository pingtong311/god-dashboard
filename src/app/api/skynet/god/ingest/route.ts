import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';
import {
  GOD_ENDPOINTS,
  GOD_KV_TTL_SECONDS,
  MAX_PAYLOAD_BYTES,
  getKv,
  godKvKey,
  parseIngestBody,
  payloadByteLength,
  type GodEnvelope,
} from '@/lib/godBridge';

/**
 * GOD 辦公室資料 ingest 端點（方案 B：GOD 主動 POST 推資料）
 * POST /api/skynet/god/ingest
 *
 * 由 GOD 辦公室（本機）以 HTTP POST 推入標準化 JSON 信封；App 存進 KV
 * （key `god:<endpoint>`，TTL 7 天），供 GET /api/skynet/god/[endpoint] 讀取。
 *
 * 安全：機器對機器，必須帶 token（Authorization: Bearer <SKYNET_DASHBOARD_API_TOKEN>
 * 或 header x-skynet-api-token）。刻意 allowSameOrigin:false——不開放同源繞過，
 * 因為此端點不是給瀏覽器用的。守衛細節見 src/lib/apiGuard.ts。
 *
 * 回應契約：
 *   200 { ok:true, endpoint, key, bytes, storedAt, expiresAt }
 *   400 { ok:false, error, message }（body 非法）
 *   400 { ok:false, error:'unknown_endpoint', allowed: GOD_ENDPOINTS }
 *   413 { ok:false, error:'payload_too_large', limit: MAX_PAYLOAD_BYTES }
 *   503 { ok:false, error:'kv_unavailable', message }
 *
 * 所有常數與純函式放在 @/lib/godBridge；route 檔僅匯出 HTTP 方法。
 */
export async function POST(request: Request) {
  // 寫入型端點守衛：機器對機器（非瀏覽器），故不開放同源繞過，一律需 token。
  const guard = guardMutation(request, {
    endpoint: 'god-ingest',
    maxRequests: 60,
    allowSameOrigin: false,
  });
  if (guard) return guard;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: '請求內容不是合法 JSON。' },
      { status: 400 },
    );
  }

  const parsed = parseIngestBody(raw);
  if (!parsed.ok) {
    if (parsed.error === 'unknown_endpoint') {
      return NextResponse.json(
        { ok: false, error: 'unknown_endpoint', allowed: GOD_ENDPOINTS },
        { status: 400 },
      );
    }
    if (parsed.error === 'payload_too_large') {
      return NextResponse.json(
        { ok: false, error: 'payload_too_large', limit: MAX_PAYLOAD_BYTES },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { ok: false, error: parsed.error, message: parsed.message },
      { status: 400 },
    );
  }

  const { endpoint, payload, generated_at, schema_version, provenance } = parsed.value;

  // 明確量測 payload 序列化後位元組數（同時作為回應的 bytes 欄位）。
  const bytes = payloadByteLength(payload);
  if (bytes > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'payload_too_large', limit: MAX_PAYLOAD_BYTES },
      { status: 413 },
    );
  }

  const kv = await getKv();
  if (!kv) {
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 尚未綁定，無法儲存 GOD 辦公室資料。' },
      { status: 503 },
    );
  }

  const storedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + GOD_KV_TTL_SECONDS * 1000).toISOString();
  const key = godKvKey(endpoint);

  // 存成完整信封（App 補上 received_at）；schema_version 缺席時以 '1' 兜底。
  const envelope: GodEnvelope = {
    schema_version: schema_version ?? '1',
    endpoint,
    generated_at,
    provenance,
    payload,
    received_at: storedAt,
  };

  try {
    await kv.put(key, JSON.stringify(envelope), { expirationTtl: GOD_KV_TTL_SECONDS });
  } catch {
    // KV 寫入失敗：明確回報 503，讓 GOD 側可重試；不假裝成功（資料誠實）。
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable', message: 'KV 寫入失敗，請稍後再試。' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ok: true, endpoint, key, bytes, storedAt, expiresAt },
    { status: 200 },
  );
}
