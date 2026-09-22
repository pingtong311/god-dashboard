/**
 * 券商分點資料狀態代理（誠實骨架 route，spec data-source-matrix §2-B）
 * GET /api/skynet/channel?ticker=2330
 *
 * 背景（複刻 B 路定案，2026-09-22 裁示）：
 * - 券商分點逐筆／日匯總是 **FinMind Sponsor-only** 付費資料；免費層只有
 *   券商主檔（TaiwanSecuritiesTraderInfo），無分點逐筆。
 * - 本 route **不打任何上游**（不引入付費來源、不抓 TaiwanSecuritiesTraderInfo 以外的東西），
 *   現況恆回 { ok: true, data: { hasChannelData: false, source: null, asOfDate: null } }。
 * - 回 ok:true（骨架可用）而非 ok:false：這是「誠實的無資料」，不是「上游故障」；
 *   前端拿 flag 做「有/無分點資料」兩分支 UI（有 → 完整分析；無 → 「資料未入庫」文案）。
 * - 日後 FinMind Sponsor 開通時，只改本 route 的回傳（填真資料 + hasChannelData: true），
 *   前端四畫面（/chips、/radar、/diary、/s/[ticker]）不需再動。
 *
 * 架構比照 src/app/api/skynet/futures/route.ts 的 inflight + TTL 模式
 * （per-ticker inflight 去重 + redirect:'manual' + AbortSignal.timeout(4000)）：
 * - 現況無 fetch，inflight/TTL 是「為日後接真來源留好的殼」——
 *   resolveChannel 內的 TODO 標明接 FinMind Sponsor 後在此處填真實抓取邏輯，
 *   保留 inflight 去重與 per-ticker TTL 快取結構，N 個並發請求同 ticker 只觸發 1 次上游。
 * - redirect: 'manual'：日後接上上游時若遇 302 陷阱（比照 futures 的尾斜線 302 實測），
 *   manual 模式回 3xx 由本 route 主動擋掉，不 follow 到「200 + HTML」陷阱。
 *
 * 回傳 shape：{ ok: true, data: { hasChannelData, source, asOfDate } }；
 * 不 5xx（依專案慣例，前端 allSettled 依 flag 渲染「未入庫」文案）。
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChannelData, ChannelResponse } from '@/types/channel';

/**
 * 上游 fetch 超時：4s（比照 futures route；HIT ~0.5s，回源 20s 掛起會被 4s 斷掉）。
 * 現況無上游呼叫，此常量为日後接 FinMind Sponsor 時啟用（redirect:'manual' 搭配）。
 */
export const UPSTREAM_TIMEOUT_MS = 4_000;

/** per-ticker 快取 TTL：1 小時（分點資料為 EOD 性質，收盤後 1h 內換新日）。 */
const CHANNEL_TTL_MS = 3_600_000;

/** 股票代號格式：4~6 位數字（可帶 1 個 t99/t999 前綴外之字母後綴，對齊專案既有慣例 ^\d{4,6}[A-Z]?$）。 */
function isValidTicker(raw: string | undefined | null): boolean {
  return raw !== null && raw !== undefined && /^\d{4,6}[A-Z]?$/.test(raw);
}

/**
 * per-ticker inflight 去重（比照 futures 的 module-level inflight）：
 * N 個並發請求同 ticker 只觸發 1 次 resolveChannel；finally 清空（含 rejected）。
 * 現況 resolveChannel 是同步骨架（無 fetch），inflight 為日後接真實來源保留結構。
 */
const inflightByTicker = new Map<string, Promise<ChannelData | null>>();

/** per-ticker in-memory 快取（TTL 1h）：金鑰 = ticker，現況恆 miss（回傳即無效，不需常駐）。 */
const cachedByTicker = new Map<string, { ts: number; data: ChannelData }>();

/**
 * 解析某 ticker 的分點資料狀態。
 *
 * 現況（誠實骨架）：無免費分點資料源 → 恆回 hasChannelData: false，
 * source/asOfDate 回 null（不補零、不造假分點數字）。
 *
 * TODO(finmind-sponsor)：FinMind Sponsor 開通後，在此處接真實來源
 *（分點逐筆/日匯總端點），並啟用下方保留的 fetch 參數：
 *   - redirect: 'manual'（302 陷阱主動擋下，不 follow 到 200+HTML）
 *   - AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
 *   - inflightByTicker / cachedByTicker 已就位（per-ticker 去重 + 1h TTL），直接套用。
 * 接上後 hasChannelData 依實際回傳決定（取到分點逐筆 → true，source: 'FinMind Sponsor'）。
 */
function resolveChannel(_ticker: string): Promise<ChannelData | null> {
  return Promise.resolve({
    hasChannelData: false,
    source: null,
    asOfDate: null,
  });
}

/**
 * 帶 inflight 去重 + TTL 快取的取資料入口（日後接真實來源時的呼叫點）。
 * 現況：resolveChannel 同步回骨架 flag；inflight/cached 結構照留，接真來源改 resolveChannel 內部即可。
 */
function getChannelData(ticker: string): Promise<ChannelData | null> {
  const normalized = ticker.toUpperCase();
  const hit = cachedByTicker.get(normalized);
  if (hit && Date.now() - hit.ts < CHANNEL_TTL_MS) {
    return Promise.resolve(hit.data);
  }
  let promise = inflightByTicker.get(normalized);
  if (!promise) {
    promise = resolveChannel(normalized).then((data) => {
      if (data) {
        cachedByTicker.set(normalized, { ts: Date.now(), data });
      }
      return data;
    });
    inflightByTicker.set(normalized, promise);
    void promise.finally(() => {
      inflightByTicker.delete(normalized);
    });
  }
  return promise;
}

/**
 * GET /api/skynet/channel?ticker=2330
 * 回 200 + { ok: true, data: ChannelData }（骨架可用，不 5xx）。
 * 非法/缺 ticker：回 200 + { ok: false, message: 'invalid_ticker' }（誠實骨架不下游）。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? '';

  if (!isValidTicker(ticker)) {
    return NextResponse.json<ChannelResponse>(
      { ok: false, message: 'invalid_ticker' },
      { status: 200 }
    );
  }

  const data = await getChannelData(ticker);

  if (!data) {
    // 現況 resolveChannel 不會回 null（骨架恆回 flag 物件）；null 僅供日後接真實來源的故障路徑。
    return NextResponse.json<ChannelResponse>(
      { ok: false, message: 'channel_unavailable' },
      { status: 200 }
    );
  }

  return NextResponse.json<ChannelResponse>(
    { ok: true, data },
    { status: 200, headers: { 'X-Skynet-Channel-Data': data.hasChannelData ? 'true' : 'false' } }
  );
}
