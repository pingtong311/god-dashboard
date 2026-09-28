/**
 * 川普政策雷達（/trump）自產資料 route
 * GET /api/skynet/trump-radar?days=45
 * ----------------------------------------------------------------------------
 * 職責：抓公開 RSS（非實站 API——實站上游已封鎖，程式打回 403），產出對齊實站
 * `blackstockai.com/api/trump-radar` JSON 形狀的**自產**資料。
 *
 * 上游（皆為公開、免金鑰；研究員已實測 200）：
 *   1) 英文 Google News RSS 搜尋（主題詞，`when:<days>d` 控窗）
 *      → items[]（origin='us'），source＝RSS 的 `<source>` 原文照抄。
 *   2) 白宮官方 RSS `https://www.whitehouse.gov/news/feed/`
 *      → 併入 items[]（origin='us'，source='The White House'，權威政策來源）。
 *   3) 繁中 Google News RSS 搜尋（`川普 關稅`）
 *      → tw_items[]（origin='tw'，台媒僅輔助參考）。
 *
 * 兩項關鍵設計決策（業主明示，違反等於任務失敗）：
 *   - 主題分類**可複製**（實測對齊實站約 90%）→ 以關鍵字規則實作（見 trumpRadar.ts）。
 *   - 情緒分類**一律留白**（實站情緒標記內部矛盾）→ 回應**省略** sentiment／n_pos／
 *     n_neg／n_neu／score／net／tone 等欄位，並以 `omitted_fields` 說明原因。
 *
 * 不造假原則：缺資料留白（空字串／空陣列），絕不以 0 冒充、絕不 Math.random。
 *
 * 快取（KV 綁定 SKYNET_CACHE，透過 src/lib/godBridge.ts 的 getKv() 取得）：
 *   - 30 分鐘 TTL：命中直接回（X-Skynet-Data-Source: kv-cache），不打上游。
 *   - stale-on-error：RSS 上游掛掉（逾時／非 2xx／網路錯誤）時，回上次快取 +
 *     `stale:true` 與 X-Skynet-Stale: true；**完全無快取時才誠實回失敗**。
 *   - KV 讀寫一律 try/catch 兜底，KV 缺席不可阻塞主流程。
 *
 * 失敗處理：上游全掛且無快取 → 200 + { ok:false, error:'upstream_error' }
 * （不 5xx、不回空陣列假裝成功）。
 *
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKv, type SkynetKv } from '@/lib/godBridge';
import {
  buildTrumpRadarPayload,
  type TrumpRadarFailure,
  type TrumpRadarResponse,
} from '@/lib/trumpRadar';

/** 上游 fetch 超時：8 秒（RSS 為非官方端點，可能改版／限流，逾時走 stale-on-error）。 */
const UPSTREAM_TIMEOUT_MS = 8_000;
/** KV 快取 TTL：30 分鐘。 */
const KV_TTL_MS = 30 * 60 * 1000;
/** KV key 前綴（含版本號，schema 變動時可安全失效舊資料）。 */
const KV_KEY_PREFIX = 'trump_radar:v1:';
/** days 參數預設值（對齊實站 ?days=45）。 */
const DEFAULT_DAYS = 45;
/** days 參數下限／上限（防濫用）。 */
const MIN_DAYS = 1;
const MAX_DAYS = 90;

/** 英文 Google News RSS 搜尋端點（主題詞以 `when:<days>d` 控窗）。 */
const GOOGLE_NEWS_EN_BASE = 'https://news.google.com/rss/search';
/** 繁中 Google News RSS 搜尋端點。 */
const GOOGLE_NEWS_TW_BASE = 'https://news.google.com/rss/search';
/** 白宮官方新聞 RSS（權威政策來源）。 */
const WHITE_HOUSE_FEED_URL = 'https://www.whitehouse.gov/news/feed/';

/** 美國政策主題詞（對齊實站主題；`OR` 串接，Google News 支援）。 */
const EN_TOPIC_QUERY = 'Trump tariff OR chip export control OR Fed rate OR Trump China';
/** 台媒主題詞（繁中）。 */
const TW_TOPIC_QUERY = '川普 關稅';

/** 上游 UA（Google News／白宮皆實測免 UA 可通；仍帶上以求穩定）。 */
const UPSTREAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** KV 存檔形狀：{ ts, payload }（ts 供 TTL 判定）。 */
type KvStored = { ts: number; payload: TrumpRadarResponse };

/** 把 days 查詢參數夾在 [MIN_DAYS, MAX_DAYS]；非法 → 預設值。 */
function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

/** 組英文 Google News RSS URL（主題詞 + when 控窗）。 */
function buildEnUrl(days: number): string {
  const q = `${EN_TOPIC_QUERY} when:${days}d`;
  return `${GOOGLE_NEWS_EN_BASE}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

/** 組繁中 Google News RSS URL。 */
function buildTwUrl(days: number): string {
  const q = `${TW_TOPIC_QUERY} when:${days}d`;
  return `${GOOGLE_NEWS_TW_BASE}?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

/** 帶 8 秒 timeout 的純文字 fetch；逾時／非 2xx／網路錯誤／空內容一律回 null。 */
async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // ⚠ 只送 User-Agent，**不送自訂 Accept**：白宮 feed（Cloudflare 前置）實測在
      //    帶 `Accept: application/rss+xml,…` 時回 403「Checking your browser」，
      //    UA-only 才 200（比照 futures/route.ts「不寫自訂 Accept 頭」的既有教訓）。
      headers: { 'User-Agent': UPSTREAM_UA },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 0 ? text : null;
  } catch {
    // 逾時（AbortError/TimeoutError）／網路錯誤：一律視為上游失敗（走 stale-on-error）。
    return null;
  }
}

/** 讀 KV 快取；解析失敗或形狀不符回 null（不阻塞）。 */
async function readKv(kv: SkynetKv | undefined, key: string): Promise<KvStored | null> {
  if (!kv) return null;
  try {
    const raw = (await kv.get(key, 'json')) as unknown;
    if (raw === null || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.ts !== 'number' || rec.payload === null || typeof rec.payload !== 'object') {
      return null;
    }
    return { ts: rec.ts, payload: rec.payload as TrumpRadarResponse };
  } catch {
    return null;
  }
}

/** 寫 KV 快取；失敗不阻塞主流程（KV 是優化非必需）。 */
async function writeKv(kv: SkynetKv | undefined, key: string, payload: TrumpRadarResponse): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify({ ts: Date.now(), payload } satisfies KvStored), {
      expirationTtl: Math.floor(KV_TTL_MS / 1000),
    });
  } catch {
    /* KV 寫失敗不阻塞；不記 log 以避免冷啟動 CPU 開銷 */
  }
}

/** 回應 header：10 分鐘共享快取標記 + 資料源 + stale 標記。 */
function jsonHeaders(source: string, stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'public, s-maxage=600',
    'X-Skynet-Data-Source': source,
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get('days'));
  const kvKey = `${KV_KEY_PREFIX}${days}`;
  const kv = await getKv();

  // 1) KV 新鮮命中（30 分鐘內）→ 直接回，不打上游。
  const cached = await readKv(kv, kvKey);
  if (cached && Date.now() - cached.ts < KV_TTL_MS) {
    return NextResponse.json(cached.payload, { status: 200, headers: jsonHeaders('kv-cache', false) });
  }

  // 2) 並行抓三份上游（英文／白宮／繁中）；英文為主要來源，失敗即視為整體失敗。
  const [enXml, whXml, twXml] = await Promise.all([
    fetchText(buildEnUrl(days)),
    fetchText(WHITE_HOUSE_FEED_URL),
    fetchText(buildTwUrl(days)),
  ]);

  if (enXml) {
    const payload: TrumpRadarResponse = {
      ...buildTrumpRadarPayload({
        enXml,
        twXml: twXml ?? '',
        whXml: whXml ?? '',
        days,
      }),
      provenance: {
        source: 'self-produced',
        upstream: [buildEnUrl(days), WHITE_HOUSE_FEED_URL, buildTwUrl(days)],
      },
      fetchedAt: new Date().toISOString(),
    };
    // 寫 KV（best-effort；失敗不阻塞本次回應）。
    await writeKv(kv, kvKey, payload);
    return NextResponse.json(payload, { status: 200, headers: jsonHeaders('rss-fresh', false) });
  }

  // 3) 英文上游失敗 → stale-on-error：回上次快取（標 stale），絕不假裝成功。
  if (cached) {
    return NextResponse.json(cached.payload, { status: 200, headers: jsonHeaders('kv-cache', true) });
  }

  // 4) 完全無快取 → 誠實失敗（200 + ok:false，不 5xx、不回空陣列）。
  const failure: TrumpRadarFailure = { ok: false, error: 'upstream_error', days };
  return NextResponse.json(failure, { status: 200, headers: jsonHeaders('upstream-error', false) });
}
