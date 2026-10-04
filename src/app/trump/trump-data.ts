/**
 * 川普政策雷達（/trump）**上游抓取層**
 * ----------------------------------------------------------------------------
 * 本檔把「觸網」的部分從 route 抽出來，讓兩個呼叫端共用同一份實作：
 *   1. route（src/app/api/skynet/trump-radar/route.ts）—— 即時計算路徑
 *   2. 離線預算（scripts/precompute-scan.mjs）—— 盤後／深夜場預算
 *
 * ⚠ 為什麼一定要抽出來（不是為了漂亮）：
 *   `precompute-scan.mjs` 以 esbuild 直接 bundle 這個檔的進入點，
 *   因此它**必須是純 TypeScript 模組**（不可 import `next/server`）。
 *   若把抓取邏輯留在 route.ts 裡，預算腳本就無法重用，
 *   只能複製一份 → **兩份實作必然漂移**（形狀、UA、逾時、參數各改各的）。
 *
 * ⚠ 形狀一致性由 `buildTrumpRadarResponse()` 單一出口保證：
 *   route 與預算腳本**都必須**經過它組出最終回應，否則會出現
 *   「HTTP 200、資料也在、前端卻讀不到」的靜默失敗。
 *
 * 上游（皆為公開、免金鑰；研究員已實測 200）：
 *   1) 英文 Google News RSS 搜尋（主題詞，`when:<days>d` 控窗）→ items[]（origin='us'）
 *   2) 白宮官方 RSS https://www.whitehouse.gov/news/feed/ → 併入 items[]（origin='us'）
 *   3) 繁中 Google News RSS 搜尋（川普 關稅）→ tw_items[]（origin='tw'，台媒僅輔助）
 *
 * 🔴 2026-10-04 實測：**這三條上游從 Cloudflare 邊緣端全部不可達**
 *   （線上 `/api/skynet/trump-radar` 回 `{"ok":false,"error":"upstream_error"}`，
 *    耗時 8.48s ＝ 三條並行各自撞滿 8 秒逾時；同一時間**本機三條全數 HTTP 200**）。
 *   ⇒ 與 block-trades 的 TPEX 同一類問題：**上游可達性因執行位置而異**。
 *   ⇒ 這正是本端點非做離線預算不可的原因：不是為了省 CPU，是因為**在邊緣端根本拿不到資料**。
 *
 * 不造假原則：缺資料留白（空字串／空陣列），絕不以 0 冒充、絕不 Math.random。
 */

import {
  buildTrumpRadarPayload,
  type TrumpRadarPayload,
  type TrumpRadarResponse,
} from '@/lib/trumpRadar';

/** 上游 fetch 逾時：8 秒（RSS 為非官方端點，可能改版／限流）。 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

/** days 參數預設值（對齊實站 ?days=45，也是 /trump 頁唯一使用的值）。 */
export const DEFAULT_DAYS = 45;
/** days 參數下限／上限（防濫用）。 */
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;

/** 英文 Google News RSS 搜尋端點（主題詞以 `when:<days>d` 控窗）。 */
const GOOGLE_NEWS_EN_BASE = 'https://news.google.com/rss/search';
/** 繁中 Google News RSS 搜尋端點。 */
const GOOGLE_NEWS_TW_BASE = 'https://news.google.com/rss/search';
/** 白宮官方新聞 RSS（權威政策來源）。 */
export const WHITE_HOUSE_FEED_URL = 'https://www.whitehouse.gov/news/feed/';

/** 美國政策主題詞（對齊實站主題；`OR` 串接，Google News 支援）。 */
const EN_TOPIC_QUERY = 'Trump tariff OR chip export control OR Fed rate OR Trump China';
/** 台媒主題詞（繁中）。 */
const TW_TOPIC_QUERY = '川普 關稅';

/**
 * 上游 UA（Google News／白宮皆實測免 UA 可通；仍帶上以求穩定）。
 *
 * ⚠ 只送 User-Agent，**不送自訂 Accept**：白宮 feed（Cloudflare 前置）實測在
 *   帶 `Accept: application/rss+xml,…` 時回 403「Checking your browser」，
 *   UA-only 才 200（比照 futures 端點「不寫自訂 Accept 頭」的既有教訓）。
 */
const UPSTREAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 把 days 查詢參數夾在 [MIN_DAYS, MAX_DAYS]；非法 → 預設值。 */
export function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

/** 組英文 Google News RSS URL（主題詞 + when 控窗）。 */
export function buildEnUrl(days: number): string {
  const q = `${EN_TOPIC_QUERY} when:${days}d`;
  return `${GOOGLE_NEWS_EN_BASE}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

/** 組繁中 Google News RSS URL。 */
export function buildTwUrl(days: number): string {
  const q = `${TW_TOPIC_QUERY} when:${days}d`;
  return `${GOOGLE_NEWS_TW_BASE}?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

/** 帶 8 秒 timeout 的純文字 fetch；逾時／非 2xx／網路錯誤／空內容一律回 null。 */
export async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'User-Agent': UPSTREAM_UA },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 0 ? text : null;
  } catch {
    // 逾時（AbortError/TimeoutError）／網路錯誤：一律視為上游失敗。
    return null;
  }
}

/** 抓取結果：payload ＋ 實際上游清單 ＋ 輔助上游缺漏紀錄。 */
export type TrumpRadarFetchResult = {
  /** 已組好的 payload（尚未加 provenance／fetchedAt）。 */
  payload: TrumpRadarPayload;
  /**
   * 上游端點清單（固定三條、順序固定）。
   * ⚠ 刻意**列出全部三條**（不論成功與否）——與 2026-10-04 之前的線上回應逐字一致，
   *   避免前端／對帳工具因欄位內容變動而誤判。實際成敗請看 `gaps`。
   */
  upstream: string[];
  /**
   * 輔助上游失敗紀錄（白宮／繁中）。
   *
   * ⚠ **不寫進 payload**（保持對外形狀與遷移前逐字相同）。
   *   用途是讓**離線預算工具能大聲警告**——這是 block-trades 教訓的直接應用：
   *   「誠實降級」若沒有任何地方出聲，就會變成**靜默缺陷**（回 200、資料默默變少）。
   *   主要上游（英文 Google News）失敗時本函式回 `null`，不會產生 result，
   *   因此 `gaps` 只可能記錄輔助上游的失敗。
   */
  gaps: string[];
};

/**
 * 抓取三條上游並組出 payload。
 *
 * @returns 主要上游（英文 Google News）失敗 → `null`（呼叫端據此決定「不寫入」或「誠實失敗」）
 * @param opts.days 觀察窗天數（預設 DEFAULT_DAYS）
 * @param opts.nowMs 現在時間（測試可注入）
 */
export async function getTrumpRadar(opts?: {
  days?: number;
  nowMs?: number;
}): Promise<TrumpRadarFetchResult | null> {
  const days = opts?.days ?? DEFAULT_DAYS;
  const enUrl = buildEnUrl(days);
  const twUrl = buildTwUrl(days);

  // 三條並行；英文為主要來源，失敗即視為整體失敗。
  const [enXml, whXml, twXml] = await Promise.all([
    fetchText(enUrl),
    fetchText(WHITE_HOUSE_FEED_URL),
    fetchText(twUrl),
  ]);

  // 主要上游失敗 → 無資料可寫，誠實回 null（絕不用空殼假裝成功）。
  if (!enXml) return null;

  const gaps: string[] = [];
  if (!whXml) gaps.push('白宮官方 RSS 未取得（該來源條目本次缺席）');
  if (!twXml) gaps.push('繁中 Google News RSS 未取得（台媒輔助區塊本次缺席）');

  const payload = buildTrumpRadarPayload({
    enXml,
    twXml: twXml ?? '',
    whXml: whXml ?? '',
    days,
    ...(opts?.nowMs !== undefined ? { nowMs: opts.nowMs } : {}),
  });

  return { payload, upstream: [enUrl, WHITE_HOUSE_FEED_URL, twUrl], gaps };
}

/**
 * 把抓取結果組為最終對外回應（**route 與預算腳本共用的單一出口**）。
 *
 * ⚠ 回應形狀＝**攤平**：`{ ...payload, provenance, fetchedAt }`，
 *   **不是** `{ ok, data }` 包裝。`provenance.upstream` 是**字串陣列**。
 *   形狀弄錯的症狀是「HTTP 200、資料也在、前端卻讀不到」——不會有任何錯誤訊息。
 */
export function buildTrumpRadarResponse(
  result: TrumpRadarFetchResult,
  fetchedAt: string,
): TrumpRadarResponse {
  return {
    ...result.payload,
    provenance: { source: 'self-produced', upstream: result.upstream },
    fetchedAt,
  };
}
