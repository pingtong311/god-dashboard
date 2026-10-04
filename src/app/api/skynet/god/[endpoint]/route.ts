import { NextResponse } from 'next/server';
import {
  GOD_ENDPOINTS,
  GOD_STALE_THRESHOLD_MS,
  godKvKey,
  isGodEndpoint,
  type GodEnvelope,
} from '@/lib/godBridge';
import { readKvJsonDetailed } from '@/lib/kvReadCache';

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
 * Cache-Control：見下方 CACHE_HEADERS 的說明（2026-10-04 起由 no-store 改為盤後快取）。
 */

/**
 * 快取標頭（2026-10-04 調整）。
 *
 * 這些端點讀的是 agent 每日推上來的 KV 信封，屬**盤後資料**（一天數份、非秒級即時），
 * 原本一律 no-store 導致每次瀏覽都重讀 KV → Cloudflare 發出「KV 每日操作數達 50%」告警。
 * 現改為：
 *   - 有資料（ready:true）→ 瀏覽器 60 秒、CDN 10 分鐘、過期後先回舊值再背景更新
 *   - 尚未產出（ready:false）→ 只快取 30 秒，讓資料一到就能很快被看到
 *   - 參數錯誤（400）→ no-store，不快取錯誤
 *
 * ⚠️ src/middleware.ts 對 /api/skynet/god/* 亦設同名標頭且**優先於**此處；
 *    兩邊同步維護，此處保留是為了即使 middleware 被移除仍行為正確。
 */
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
} as const;

/** 尚未產出時只短快取，避免資料一到卻仍被舊的空回應擋住。 */
const NOT_READY_HEADERS = { 'Cache-Control': 'public, max-age=30' } as const;

/** 錯誤回應不快取。 */
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

  // 三層快取讀取（L1 isolate in-memory → L2 Cache API → L3 KV）。
  //
  // 為什麼不能直接 `kv.get(key,'json')`：那會在**每個請求**都付出一次 KV 讀取
  // （計入免費方案每日 100,000 次上限 → 2026-10-04 已達 50% 告警）＋ 一次 JSON.parse。
  // 走快取層後，L1 命中時**零 KV 讀取、零解析**——在 10ms CPU 預算下是關鍵差異。
  //
  // ⚠ 一致性：in-memory 快取無法被其他 isolate 主動失效，故「有值」TTL 60 秒、
  //    「查無值」TTL 20 秒（詳見 src/lib/kvReadCache.ts 檔首）。
  const read = await readKvJsonDetailed<GodEnvelope>(godKvKey(endpoint));

  // KV 未綁定／讀取拋錯 → 沿用既有契約回「KV 尚未綁定」（不讓前端誤判為服務故障）。
  if (read.status === 'unbound' || read.status === 'error') {
    return NextResponse.json(
      { ok: true, endpoint, ready: false, message: 'KV 尚未綁定' },
      { status: 200, headers: NOT_READY_HEADERS },
    );
  }

  // 尚未產出（missing）或內容損壞（corrupt）→ 都還不是可用資料。
  if (read.status !== 'ok') {
    return NextResponse.json(
      { ok: true, endpoint, ready: false, message: 'GOD 辦公室資料尚未產出' },
      { status: 200, headers: NOT_READY_HEADERS },
    );
  }

  const stored = read.value;

  // age_ms = now − received_at；received_at 無法解析時視為 0（不造假）。
  const receivedAtMs = Date.parse(stored.received_at);
  const ageMs = Number.isFinite(receivedAtMs) ? Date.now() - receivedAtMs : 0;
  const stale = ageMs > GOD_STALE_THRESHOLD_MS;

  return NextResponse.json(
    { ok: true, ready: true, ...stored, endpoint, age_ms: ageMs, stale },
    {
      status: 200,
      headers: {
        ...CACHE_HEADERS,
        // 觀測用：這一擊是由哪一層服務的。
        //   l1 = isolate in-memory（零 KV 讀取）／ l2 = Cache API（零 KV 讀取）／ kv = 真的讀了 KV
        // 用途：驗證「KV 讀取量下降」是否真的發生（免費方案每日 100,000 次上限）。
        'X-Skynet-Kv-Cache': read.source,
      },
    },
  );
}
