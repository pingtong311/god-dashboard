/**
 * /api/skynet/pattern-screen —— K 線型態掃描（自產，非代理實站）
 * ============================================================================
 * GET /api/skynet/pattern-screen
 *
 * 職責：
 *   以 src/lib/marketBars.ts 的全市場日 K（KV `mkt:bars:<date>`）為上游，
 *   在 **server 端逐日組裝序列 → 執行 7 種型態幾何辨識**（src/lib/patternScan.ts），
 *   回傳對齊實站 https://blackstockai.com/api/pattern-screen 的 schema。
 *
 * 架構約束（決定本檔設計）：
 *   - 實站上游已封鎖（`blackstockai.com/api/pattern-screen` 用程式打回 HTTP 403），
 *     故**不可代理實站**，一律自算。
 *   - 全市場 120 天序列約 70MB，逼近 Workers 128MB 記憶體上限；故本端點**不把
 *     全量序列塞進 HTTP 回應**，而是用 `loadRange()` **分批**讀取、逐批組裝序列、
 *     逐批釋放（每批 BATCH 天），把記憶體峰值壓在單批 + 累積序列之內。
 *
 * 資料誠實：
 *   - KV 未綁定 / 尚未累積足夠日 K（< MIN_BARS_FOR_SCAN 根）→ 回
 *     `{ ok:true, ready:false, availableDays, minDaysRequired, message }`，
 *     **絕不回空 patterns 假裝掃過**。
 *   - `industry`（產業別）本站尚無代碼→名稱對照表，未提供時省略該欄並記於 `gaps`。
 *   - 上游名稱對照（TWSE BWIBBU_ALL / TPEX 收盤行情）為**盡力而為**，抓不到時
 *     名稱留空（label 只顯示代號），不捏造。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import {
  TPEX_OTC_URL,
  TWSE_MI_INDEX_URL,
  expandBars,
  listStoredDates,
  loadRange,
  type SkynetKvWithList,
} from '@/lib/marketBars';
import {
  MIN_BARS_FOR_SCAN,
  PATTERN_CRITERIA,
  PATTERN_META,
  PATTERN_ORDER,
  buildPatternItem,
  createSeriesBuilder,
  groupHitsByPattern,
  isScannableCode,
  scanSeriesList,
  type PatternId,
  type PatternItem,
} from '@/lib/patternScan';

export const dynamic = 'force-dynamic';

/** 掃描回看視窗（交易日）：70 天足以涵蓋雙底/頭肩/收斂三角的間距上限。 */
export const SCAN_WINDOW_TRADING_DAYS = 70;

/**
 * `loadRange()` 單批讀取天數。
 * 選 12 的理由：每批解析後約 12 × ~2.5MB ≈ 30MB，加上累積序列約 40MB，
 * 峰值 < 128MB；同時保留「一次讀多日、逐批釋放」的效率。
 */
export const LOAD_BATCH_DAYS = 12;

/** 統一的上游來源字串（本端點自產，非代理第三方）。 */
const UPSTREAM = `${TWSE_MI_INDEX_URL} + ${TPEX_OTC_URL}`;

/** 名稱對照上游（皆為免費官方 OpenAPI）。 */
const TWSE_NAME_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL';
const TPEX_NAME_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';

/** 上游 fetch 超時：8 秒。 */
const UPSTREAM_TIMEOUT_MS = 8_000;

/** 下次更新文案（逐字對齊實站 schema：不承諾具體時刻，只說下一交易日盤後）。 */
const NEXT_UPDATE = '下一交易日盤後';

/** 實站口徑註記（逐字照抄）。 */
const NOTE = '依已發生日 K 幾何條件分類；不提供方向、進出場或平台計算價位。';

/** 已知缺口說明。 */
const GAPS: readonly string[] = [
  'industry（產業別名稱）：TWSE t187ap03_L 僅提供產業「數字代碼」，本站尚無代碼→名稱對照表，故未提供此欄。',
  'stock_name：以 TWSE BWIBBU_ALL 與 TPEX 收盤行情 OpenAPI 盡力補齊；抓不到時名稱留空（label 僅顯示代號），不捏造。',
];

/** 上游 fetch（8 秒 timeout；失敗回 null，不拋錯）。 */
async function fetchJson(url: string, referer: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        Referer: referer,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 盡力取得「代號 → 名稱」對照（TWSE 上市 + TPEX 上櫃）。
 * 任一來源失敗皆不影響主流程（名稱留空）。
 */
async function fetchNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const twse = await fetchJson(TWSE_NAME_URL, 'https://www.twse.com.tw/zh/');
  if (Array.isArray(twse)) {
    for (const row of twse as Array<Record<string, unknown>>) {
      const code = row?.Code;
      const name = row?.Name;
      if (typeof code === 'string' && typeof name === 'string' && code) {
        map.set(code.trim(), name.trim());
      }
    }
  }

  const tpex = await fetchJson(TPEX_NAME_URL, 'https://www.tpex.org.tw/zh-tw/');
  if (Array.isArray(tpex)) {
    for (const row of tpex as Array<Record<string, unknown>>) {
      const code = row?.SecuritiesCompanyCode;
      const name = row?.CompanyName;
      if (typeof code === 'string' && typeof name === 'string' && code && !map.has(code.trim())) {
        map.set(code.trim(), name.trim());
      }
    }
  }

  return map;
}

/** 單一型態的 API 區塊（對齊實站 patterns.<id>）。 */
export type PatternScreenPattern = {
  meta: { name: string; desc: string; structure: string };
  items: PatternItem[];
  count: number;
};

/** pattern-screen 回應形狀（ready 與 not-ready 共用，選配欄位依狀態出現）。 */
export type PatternScreenResponse = {
  ok: boolean;
  ready: boolean;
  patterns?: Record<PatternId, PatternScreenPattern>;
  data_date?: string;
  data_scope?: string;
  next_update?: string;
  scope?: string;
  note?: string;
  criteria?: Record<string, number>;
  availableDays?: number;
  windowDays?: number;
  scannedStocks?: number;
  missing?: string[];
  gaps?: string[];
  minDaysRequired?: number;
  message?: string;
  reason?: string;
  provenance?: { source: string; upstream: string };
  fetchedAt?: string;
};

/** 統一的來源追蹤欄位。 */
const PROVENANCE = { source: 'self-produced' as const, upstream: UPSTREAM };

/** 資料尚未就緒的誠實回應（KV 未綁定 / 累積不足）。 */
function notReady(availableDays: number, reason: string, message: string): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      ready: false,
      availableDays,
      minDaysRequired: MIN_BARS_FOR_SCAN,
      reason,
      message,
      criteria: PATTERN_CRITERIA,
      gaps: GAPS,
      provenance: PROVENANCE,
      fetchedAt: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const kv = (await getKv()) as SkynetKvWithList | undefined;
  if (!kv) {
    return notReady(0, 'kv_unavailable', 'KV 尚未綁定（本地開發或尚未部署），無法讀取全市場日 K。');
  }

  const dates = await listStoredDates(kv);
  if (dates === null) {
    return notReady(0, 'kv_list_unavailable', 'KV 綁定不支援 list，無法列出已累積的日 K 日期。');
  }
  if (dates.length < MIN_BARS_FOR_SCAN) {
    return notReady(
      dates.length,
      'insufficient_data',
      `日 K 資料累積中，尚無法辨識型態（目前 ${dates.length} 天，至少需 ${MIN_BARS_FOR_SCAN} 天）。`,
    );
  }

  // 取最近 SCAN_WINDOW_TRADING_DAYS 個已入庫日期。
  const window = dates.slice(-SCAN_WINDOW_TRADING_DAYS);

  // 分批讀取（逐批釋放），把記憶體峰值壓在單批 + 累積序列之內。
  const builder = createSeriesBuilder();
  const usedDates: string[] = [];
  const missing: string[] = [];
  for (let i = 0; i < window.length; i += LOAD_BATCH_DAYS) {
    const batch = window.slice(i, i + LOAD_BATCH_DAYS);
    const { days, missing: batchMissing } = await loadRange(kv, batch);
    for (const day of days) {
      // 只掃描「股票 / ETF / TDR」，排除權證、ETN 等衍生性商品（見 isScannableCode 說明）。
      for (const bar of expandBars(day.twse)) {
        if (isScannableCode(bar.code)) builder.pushBar(bar);
      }
      for (const bar of expandBars(day.tpex)) {
        if (isScannableCode(bar.code)) builder.pushBar(bar);
      }
      usedDates.push(day.date);
    }
    missing.push(...batchMissing);
  }

  if (usedDates.length < MIN_BARS_FOR_SCAN) {
    return notReady(
      usedDates.length,
      'insufficient_data',
      `日 K 資料累積中，尚無法辨識型態（目前 ${usedDates.length} 天，至少需 ${MIN_BARS_FOR_SCAN} 天）。`,
    );
  }

  const seriesList = builder.toSeriesList();
  const hits = scanSeriesList(seriesList);
  const grouped = groupHitsByPattern(hits);

  const nameMap = await fetchNameMap();
  const seriesByCode = new Map(seriesList.map((s) => [s.code, s]));
  const dataDate = usedDates[usedDates.length - 1];

  const patterns = {} as Record<
    PatternId,
    { meta: (typeof PATTERN_META)[PatternId]; items: PatternItem[]; count: number }
  >;
  for (const id of PATTERN_ORDER) {
    const items: PatternItem[] = [];
    for (const code of grouped[id]) {
      const series = seriesByCode.get(code);
      if (!series) continue;
      items.push(buildPatternItem(series, nameMap.get(code) ?? '', dataDate));
    }
    patterns[id] = { meta: PATTERN_META[id], items, count: items.length };
  }

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      patterns,
      data_date: dataDate,
      data_scope: '盤後日 K',
      next_update: NEXT_UPDATE,
      scope: 'historical_geometry',
      note: NOTE,
      criteria: PATTERN_CRITERIA,
      availableDays: usedDates.length,
      windowDays: window.length,
      scannedStocks: seriesList.length,
      missing,
      gaps: GAPS,
      provenance: PROVENANCE,
      fetchedAt: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
