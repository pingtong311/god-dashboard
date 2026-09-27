import { NextResponse } from 'next/server';
import {
  GOD_ENDPOINTS,
  GOD_STALE_THRESHOLD_MS,
  getKv,
  godKvKey,
  isGodEndpoint,
  type GodEnvelope,
} from '@/lib/godBridge';

/**
 * GOD 辦公室資料讀取端點
 * GET /api/skynet/god/[endpoint]
 *
 * 供前端頁面讀取由 POST /api/skynet/god/ingest 存進 KV 的 GOD 辦公室資料。
 *
 * 資料誠實原則（刻意設計）：
 *   - 「尚未產出」與「端點壞掉」是兩件事。無資料時回 200 + ready:false
 *     （message『GOD 辦公室資料尚未產出』），而非 404——讓前端能區分
 *     「還沒產出」與「端點故障」。
 *   - KV 未綁定同樣回 200 + ready:false（message『KV 尚未綁定』），
 *     不讓前端誤判為服務故障。
 *
 * 回應契約：
 *   200 { ok:true, endpoint, ready:true, ...信封, age_ms, stale }（有資料）
 *   200 { ok:true, endpoint, ready:false, message:'GOD 辦公室資料尚未產出' }（KV 空）
 *   200 { ok:true, endpoint, ready:false, message:'KV 尚未綁定' }（KV 不可用）
 *   400 { ok:false, error:'unknown_endpoint', allowed }（白名單外）
 *
 * Next 15 的 params 為 Promise（見 src/app/s/[ticker]/page.tsx 既有寫法）。
 * Cache-Control: no-store（middleware 對 /api/skynet/* 另有強制覆寫，此處顯式標記）。
 */

/** 統一的 no-store 標頭（避免邊緣／瀏覽器快取到即時性資料）。 */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await params;

  if (!isGodEndpoint(endpoint)) {
    return NextResponse.json(
      { ok: false, error: 'unknown_endpoint', allowed: GOD_ENDPOINTS },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const kv = await getKv();
  if (!kv) {
    return NextResponse.json(
      { ok: true, endpoint, ready: false, message: 'KV 尚未綁定' },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  let stored: GodEnvelope | null = null;
  try {
    // 照抄 futures route：以 'json' 讀取，讓 KV 直接回傳已解析物件。
    stored = (await kv.get(godKvKey(endpoint), 'json')) as GodEnvelope | null;
  } catch {
    // KV 讀取拋錯 → 視為不可用；回 200 + ready:false，不讓前端誤判為故障。
    return NextResponse.json(
      { ok: true, endpoint, ready: false, message: 'KV 尚未綁定' },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  if (!stored) {
    return NextResponse.json(
      { ok: true, endpoint, ready: false, message: 'GOD 辦公室資料尚未產出' },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  // age_ms = now − received_at；received_at 無法解析時視為 0（不造假）。
  const receivedAtMs = Date.parse(stored.received_at);
  const ageMs = Number.isFinite(receivedAtMs) ? Date.now() - receivedAtMs : 0;
  const stale = ageMs > GOD_STALE_THRESHOLD_MS;

  return NextResponse.json(
    { ok: true, ready: true, ...stored, endpoint, age_ms: ageMs, stale },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
