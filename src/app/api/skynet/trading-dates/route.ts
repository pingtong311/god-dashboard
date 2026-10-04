/**
 * 近期交易日清單 API
 * GET /api/skynet/trading-dates?count=30
 * 回傳：{ ok: true, dates: ['2026-10-02', '2026-10-01', ...], current: '2026-10-02' }
 *
 * 供前端日期切換器下拉選單使用（首頁 / 與 /market-center 都會在載入時呼叫）。
 *
 * ## 2026-10-04 架構變更：改為「離線預算」
 *
 * **為什麼非改不可**：
 *   本端點原本在請求時 `resolveLatestTradingDate()` ＋ 為了湊滿 count 個交易日，
 *   對每個候選日呼叫 `loadMarketOverview(candidate)` —— 每次是 TWSE `MI_INDEX`
 *   （4.8MB）＋ `T86`（2.17MB）兩發上游。最多 **61 次上游抓取**，實測 **12.9 秒**；
 *   且在 Free plan 的 10ms CPU 上限下會**間歇性** 503 `error code: 1102`
 *   （isolate 冷啟動時爆表、暖機時僥倖通過）。首頁每次載入都打這支 → 必須修。
 *
 *   交易日清單一天最多變一次 → 完美適合離線預算：本機算好寫進 KV
 *   （`scan:trading-dates`，母清單含最多 60 筆），邊緣端只讀一個 key。
 *
 * ## 與其他 P1 端點的差異：這裡**允許**在邊緣端解析
 *
 *   母清單約 720 bytes，`JSON.parse` ＋ `slice` ＋ `JSON.stringify` 約 0.2–0.4ms，
 *   加上 7ms 地板值仍安全落在 10ms 內（算術見 `@/lib/tradingDates` 的
 *   `MAX_PARSE_BYTES`）。「邊緣零解析」規則的目的是避免解析 MB 級 JSON，
 *   不是禁止一切 `JSON.parse`。**但 `MAX_PARSE_BYTES` 是硬防線**：一旦母清單
 *   異常膨脹就拒絕解析並回 `ready:false`，絕不冒險爆 CPU。
 *
 *   這樣設計的好處：**一個 KV key 支援所有 count**，不必為每個 count 各存一份。
 *
 * ## 誠實原則
 *
 *   預算尚未產出 / 內容損壞 → 200 + `ready:false` ＋說明文案（**不回 5xx**、
 *   不偽裝成「載入中」）。唯一例外是 **KV 未綁定**（本地開發／尚未部署），
 *   此時改用專案日曆即時計算（純計算、零上游），維持本機可開發性。
 */

import { NextRequest, NextResponse } from 'next/server';
import { readKvTextDetailed } from '@/lib/kvReadCache';
import {
  TRADING_DATES_KV_KEY,
  buildTradingDatesList,
  buildTradingDatesPayload,
  normalizeTradingDatesCount,
  parseTradingDatesList,
} from '@/lib/tradingDates';

/** 交易日清單的共享快取標頭（`max-age` 作用在瀏覽器，見 precomputed.ts 的說明）。 */
const CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
  'X-Skynet-Data-Source': 'precomputed-kv',
};

/** 尚未產出時的回應（200 + `ready:false`，短快取讓資料一到就能很快被看到）。 */
function notReadyResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      ready: false,
      endpoint: 'trading-dates',
      message: '盤後預算尚未產出（請執行 scripts/precompute-scan.mjs）',
    },
    { headers: { 'Cache-Control': 'public, max-age=30', 'X-Skynet-Data-Source': 'precomputed-kv' } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = normalizeTradingDatesCount(searchParams.get('count'));

  if (count === null) {
    return NextResponse.json(
      { error: 'invalid_count', message: 'count must be 1-60' },
      { status: 400 },
    );
  }

  // ── 盤後預算直送（一個 key 支援所有 count）──
  const read = await readKvTextDetailed(TRADING_DATES_KV_KEY);

  if (read.status === 'ok') {
    const all = parseTradingDatesList(read.text);
    // ⚠ 形狀不符／超過 MAX_PARSE_BYTES → 一律視為「尚未產出」，絕不半信半疑地用。
    if (all !== null && all.length > 0) {
      return NextResponse.json(buildTradingDatesPayload(all, count), {
        headers: { ...CACHE_HEADERS, 'X-Skynet-Kv-Cache': read.source },
      });
    }
    return notReadyResponse();
  }

  // ── KV 未綁定（本地 dev／尚未部署）→ 用專案日曆即時計算（純計算、零上游）──
  // ⚠ 線上環境 KV 一定綁定，因此線上永遠不會走到這裡。
  if (read.status === 'unbound') {
    const all = buildTradingDatesList();
    if (all.length > 0) {
      return NextResponse.json(buildTradingDatesPayload(all, count), {
        headers: { ...CACHE_HEADERS, 'X-Skynet-Data-Source': 'local-calendar' },
      });
    }
  }

  // 缺值／讀取失敗 → 誠實回 ready:false（不 5xx）。
  return notReadyResponse();
}
