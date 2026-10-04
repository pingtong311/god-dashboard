import { NextResponse, type NextRequest } from 'next/server';

/**
 * /api/skynet/* 的快取政策（2026-10-04 重構）
 * ────────────────────────────────────────────────────────────────────────
 * 背景：本檔原本對「所有」/api/skynet/* 一律覆寫 `no-store`，
 *   把各 route 自己宣告的 public 快取政策全部抹掉。後果是**每次瀏覽**
 *   都重新執行 Worker、重新讀 KV →
 *   2026-10-04 09:14 Cloudflare 發出「KV 每日操作數已達免費方案 50%」告警
 *   （超過每日上限即回 429，Worker 操作會失敗）。
 *
 * 修正原則：**誰最懂自己的資料，就由誰宣告快取政策。**
 *   1. 盤後預算端點與已自行宣告政策的 route → 列入 ROUTE_MANAGED_PATHS，
 *      middleware **不覆寫**，讓 route 依「有資料 / 尚未產出」給不同政策。
 *   2. 其餘 /api/skynet/*（即時性資料）與 /review → 維持 no-store。
 *
 * ⚠️ middleware 設定的標頭**優先於** route 內設定的同名標頭。
 *    已於 2026-10-04 實測：radar / t86 / chips / block-trades / fundamental
 *    在 route 內宣告 `public, max-age=300`，線上實際回應卻是
 *    `cache-control: no-store, max-age=0`。
 *    ⇒ 要讓 route 的政策生效，**必須**先把它從這裡的覆寫範圍排除。
 *
 * ⚠️ 新增 /api/skynet/* 端點時：若該 route 有自己宣告 Cache-Control，
 *    請把路徑加進 ROUTE_MANAGED_PATHS；否則會被這裡蓋成 no-store。
 */

/**
 * 這些路徑的 route **自己**就宣告了 Cache-Control，middleware 不覆寫。
 *
 * 🔴 2026-10-04 實測的重大限制（務必先讀）：
 *   **只有「輕量」端點能安全開啟邊緣快取。**
 *   Cloudflare 為了快取回應，必須**先把完整回應緩衝起來**，這個緩衝成本
 *   會算進 Worker 的 CPU 時間；Free plan 上限只有 **10ms**。
 *   → 重端點（要 JSON.parse／重建大物件）一旦被快取，就會在「快取未命中」時
 *     直接 **503 error code: 1102**（命中時不執行 Worker，反而正常）。
 *   實測（同一端點連打 4 次）：
 *     pattern-screen（403KB）→ 503 503 **200** 503   ← 命中才 200，未命中 1102
 *     swing-hub（97KB）      → 200 200 200 200      ← 穩定
 *     cb（79KB）             → 200 200 200 200      ← 穩定
 *
 *   因此本清單**只收錄已實測穩定的輕量端點**；重的全市場端點一律維持
 *   no-store（讓回應以串流方式送出，不觸發快取緩衝），其效能問題改由
 *   **盤後預算（P1）**解決，而不是靠邊緣快取。
 */
const ROUTE_MANAGED_PATHS = new Set([
  // 盤後預算／KV 端點，且回應輕量（實測穩定 200）
  '/api/skynet/swing-hub', // 97KB，讀 KV，實測 200×4
  '/api/skynet/cb', // 79KB，讀 KV，實測 200×4
  '/api/skynet/futures', // 239B，讀 KV
  '/api/skynet/signal-log', // 163B，讀 5 個 KV key
  //
  // ── 2026-10-04 P1-B1 新增：已遷移為「離線預算 ＋ 邊緣零解析直送」 ──
  //
  // 這些端點**原本是重端點**（在請求時抓／解析 MB 級 JSON）→ 因此原本被刻意
  // 排除在本清單外。遷移後邊緣端只做 `kv.get(key)` → `new Response(text)`，
  // **零解析、零序列化、零上游抓取**，回應體積如下（實測）：
  '/api/skynet/trading-dates', //   434B，讀 1 個 KV key（母清單切片）
  '/api/skynet/market-overview', // 4.0KB，讀 1 個 KV key（零解析直送）
  '/api/skynet/treemap', //  21.7KB，讀 1 個 KV key（零解析直送）
  '/api/skynet/market-bars', // 1.5KB（metadata-only）／最壞為 200 + ready:false
  '/api/skynet/dividend-calendar', // 2.8KB，讀 1 個 KV key（零解析直送）
  '/api/skynet/block-trades', // 1.7KB，讀 1 個 KV key（零解析直送）
  '/api/skynet/trump-radar', // 41.7KB，讀 1 個 KV key（零解析直送）
  //
  // ⚠️ 仍刻意**未**列入（維持 no-store，因為快取未命中時會 1102）：
  //   - /api/skynet/pattern-screen（403KB）—— 維持 no-store 反而穩定 200
  //   - radar / t86 / chips / fundamental / margin-maint / etf-active / risk /
  //     candidate-chart / channel-broker /
  //     mops / stock-research / opendata —— 皆仍是「即時計算」或「重解析」端點。
  //     ⚠ 這些端點遷移完成後**應逐一加入本清單**（route 屆時會宣告
  //       `Cache-Control: public, …`，不加進來就會被這裡蓋成 no-store，形同白做）。
  //   - fusion —— 走 Fugle，可能含盤中即時報價。
]);

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // App 七端點（GET /api/skynet/god/<endpoint>）讀的是 agent 推上來的 KV 信封，
  // 同屬盤後資料，由該 route 自行宣告政策。但 /ingest 是寫入端點，絕不可快取。
  const isGodRead =
    pathname.startsWith('/api/skynet/god/') && pathname !== '/api/skynet/god/ingest';

  if (isGodRead || ROUTE_MANAGED_PATHS.has(pathname)) {
    return response;
  }

  if (pathname === '/review' || pathname.startsWith('/api/skynet/')) {
    response.headers.set('cache-control', 'no-store, max-age=0');
    response.headers.set('pragma', 'no-cache');
    response.headers.set('expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/review', '/api/skynet/:path*'],
};
