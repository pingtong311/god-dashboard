/**
 * /swing 波段條件資料端點（自產，非代理）
 * ============================================================================
 * GET /api/skynet/swing-hub
 *
 * 背景：實站 blackstockai.com/api/swing-hub 已封鎖（實測 HTTP 403），本站不代理，
 * 一律以**免費官方資料自行計算**（TWSE / TPEX / TDCC 集保 OpenAPI）。
 *
 * 架構（重要）：
 *   - 全市場日 K 序列在 server 端直接以 loadRange() 逐日讀 KV（不塞進 HTTP 回應、
 *     不 fetch 自己的 API）。⚠ 單一 request 回 120 天全市場序列約 69.8MB 會爆
 *     Workers 記憶體上限，故本端點只讀「MA60 所需」的約 65 個交易日。
 *   - 上游一律 8 秒 timeout + try/catch，單一上游失敗不影響其他 tab（各自誠實留白）。
 *
 * 資料誠實（業主明示）：
 *   - 缺資料一律回空陣列 + 該 tab 的 unavailable_reason，**絕不以 0／假資料填充**。
 *   - badnews（新聞）本站無資料源 → 固定留白。
 *   - whale delta 需歷史週檔 → delta 欄位 null（前端顯示「累積中」），帶出
 *     weeksAccumulated 讓使用者知道累積進度。
 *
 * 所有可測邏輯集中於 @/lib/swingConditions；本檔僅匯出 HTTP 方法。
 */

import { NextResponse } from 'next/server';
import { getKv } from '@/lib/godBridge';
import {
  MA_LONG,
  RS_LOOKBACK,
  SMART_RANGE_LOOKBACK,
  buildCodeSeries,
  computeBothBuy,
  computeBreak20,
  computeFill,
  computeInstitutionalStreak,
  computeMa60,
  computeMarginDrop,
  computePullback,
  computeReclaim,
  computeRevenue,
  computeRs,
  computeSector,
  computeSmart,
  computeWhale,
  parseExRightRows,
  parseMarginRows,
  parseRevenueRows,
  parseT86Rows,
  parseTdccRows,
  type CodeSeriesMap,
  type ConditionContext,
  type StockMetaMap,
  type SwingItem,
  type T86Day,
  type WhaleGrade,
} from '@/lib/swingConditions';
import {
  buildTradingDayWindow,
  formatTwseDate,
  loadRange,
  parseYmdToDate,
  todayTaipeiYmd,
  TWSE_MI_INDEX_URL,
  TPEX_OTC_URL,
  UPSTREAM_TIMEOUT_MS,
} from '@/lib/marketBars';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// 上游來源
// ---------------------------------------------------------------------------

/** TDCC 集保戶股權分散表（免費、免 key）。 */
const TDCC_URL = 'https://openapi.tdcc.com.tw/v1/opendata/1-5';
/** TWSE T86 三大法人買賣超日報。 */
const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86';
/** TWSE MI_MARGN 融資融券（rwd，可指定日期；供「約 20 交易日前」比較）。 */
const MI_MARGN_RWD_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN';
/** TWSE 月營收 OpenAPI（同時提供公司名稱與產業別）。 */
const REVENUE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
/** TWSE 除權除息預告表。 */
const EXRIGHT_URL = 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U';

/** T86 回推抓取的天數（日曆天；足以涵蓋 3 個「資料日」，含連假緩衝）。 */
const T86_LOOKBACK_CALENDAR_DAYS = 10;

/** 讀 KV 全市場日 K 的交易日天數（MA60 需 60 日，+5 餘裕）。 */
const MA_LOOKBACK_TRADING_DAYS = MA_LONG + 5;

/** 統一的來源追蹤欄位。 */
const PROVENANCE = {
  source: 'self-produced' as const,
  upstreams: [TDCC_URL, T86_URL, MI_MARGN_RWD_URL, REVENUE_URL, EXRIGHT_URL, TWSE_MI_INDEX_URL, TPEX_OTC_URL],
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// 上游抓取（8 秒 timeout + try/catch；失敗回 null）
// ---------------------------------------------------------------------------

async function fetchJson(url: string, referer?: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        ...(referer ? { Referer: referer } : {}),
        'User-Agent': UA,
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

/** '20260924' → '2026-09-24'。 */
function formatDisplayDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 抓取最近數個「資料日」的 T86（並行），回傳升冪、僅含有效日。
 */
async function fetchT86Days(): Promise<T86Day[]> {
  const now = new Date();
  const requests: Promise<T86Day | null>[] = [];
  for (let offset = 0; offset < T86_LOOKBACK_CALENDAR_DAYS; offset += 1) {
    const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const ymd = formatTwseDate(d);
    requests.push(
      fetchJson(`${T86_URL}?response=json&date=${ymd}&selectType=ALLBUT0999`, 'https://www.twse.com.tw/zh/trading/foreign/t86.html')
        .then((raw) => {
          if (!raw || (raw as { stat?: string }).stat !== 'OK') return null;
          const items = parseT86Rows(raw);
          if (items.length === 0) return null;
          const dateRaw = String((raw as { date?: string }).date ?? ymd);
          return { date: formatDisplayDate(dateRaw), items } satisfies T86Day;
        })
        .catch(() => null),
    );
  }
  const results = await Promise.all(requests);
  const days = results.filter((d): d is T86Day => d !== null);
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

/** 抓取 MI_MARGN（rwd，指定日期）→ 代號 → 融資今日餘額（張）。 */
async function fetchMarginMap(ymd: string): Promise<Map<string, number> | null> {
  const raw = await fetchJson(
    `${MI_MARGN_RWD_URL}?date=${ymd}&selectType=ALL&response=json`,
    'https://www.twse.com.tw/zh/trading/margin/mi-margn.html',
  );
  if (!raw || (raw as { stat?: string }).stat !== 'OK') return null;
  const tables = (raw as { tables?: Array<{ data?: unknown }> }).tables;
  if (!Array.isArray(tables) || tables.length < 2) return null;
  const stockTable = tables[1];
  if (!stockTable || !Array.isArray(stockTable.data)) return null;
  const map = parseMarginRows(stockTable.data);
  return map.size > 0 ? map : null;
}

// ---------------------------------------------------------------------------
// 回應組裝
// ---------------------------------------------------------------------------

type SwingTab = {
  id: string;
  title: string;
  desc: string;
  items: SwingItem[];
  unavailable_reason?: string;
  note?: string;
};

/** 16 個頁籤的 id／title／desc（逐字對齊實站 schema）。 */
const TAB_META: ReadonlyArray<{ id: string; title: string; desc: string }> = [
  { id: 'whale_in', title: '大戶持股比例增加', desc: '400 張以上持股級距的四週比例增加。' },
  { id: 'whale_out', title: '大戶持股比例減少', desc: '400 張以上持股級距的四週比例減少。' },
  { id: 'ma60', title: '收盤／月線／季線排列', desc: '資料日收盤 > MA20 > MA60，且 MA20 較前值增加。' },
  { id: 'pullback', title: '距月線正負 2%', desc: '資料日收盤高於 MA60，且距 MA20 在正負 2% 內。' },
  { id: 'foreign', title: '外資連買', desc: '外資連續 3 個資料日買超。' },
  { id: 'trust', title: '投信連買', desc: '投信連續 3 個資料日買超。' },
  { id: 'both', title: '雙法人同買', desc: '當日外資＋投信同時買超。' },
  { id: 'reclaim', title: '收盤由月線下方轉為上方', desc: '前一資料日收盤低於 MA20，本資料日收盤高於 MA20。' },
  { id: 'break20', title: '20 日新高且量增', desc: '資料日收盤為近 20 日新高，且成交量符合量增條件。' },
  { id: 'rs', title: '20 日區間報酬排序', desc: '近 20 日區間報酬與成交金額皆符合門檻。' },
  { id: 'sector', title: '族群 20 日報酬排序', desc: '族群 20 日平均報酬及個股區間報酬符合門檻。' },
  { id: 'margin', title: '融資餘額下降', desc: '融資餘額較約 20 日前下降，並列同期區間報酬。' },
  { id: 'revenue', title: '月營收增減條件', desc: '最近月營收 MoM 與 YoY 符合頁面所列門檻。' },
  { id: 'fill', title: '除權息填息', desc: '近期除權息個股相對參考價回升進度——填息／貼息觀察。' },
  { id: 'badnews', title: '負面敘事與當日跌幅', desc: '新聞標題規則分類為負面，並列資料日實際漲跌幅。' },
  { id: 'smart', title: '融資／大戶／量價交集', desc: '同時符合融資餘額、400 張以上持股級距與量價門檻。' },
];

/** 建立單一 tab（含可選的 unavailable_reason / note）。 */
function makeTab(
  id: string,
  items: SwingItem[],
  extra?: { unavailable_reason?: string; note?: string },
): SwingTab {
  const meta = TAB_META.find((t) => t.id === id);
  if (!meta) throw new Error(`unknown tab id: ${id}`);
  return {
    id: meta.id,
    title: meta.title,
    desc: meta.desc,
    items,
    ...(extra?.unavailable_reason ? { unavailable_reason: extra.unavailable_reason } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  };
}

/** 日 K 不足時的誠實理由文字。 */
function barsReason(kvBound: boolean, days: number, needed: number): string {
  if (!kvBound) return '全市場日 K 尚未綁定 KV，無法計算均線條件。';
  return `全市場日 K 目前僅累積 ${days} 個交易日，尚未達本條件所需的 ${needed} 日；資料累積中。`;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();

  // ---- 1. 並行抓取所有上游（各自 try/catch，互不影響） ----
  const [t86Days, tdccRaw, revenueRaw, exRightRaw] = await Promise.all([
    fetchT86Days(),
    fetchJson(TDCC_URL),
    fetchJson(REVENUE_URL),
    fetchJson(EXRIGHT_URL, 'https://www.twse.com.tw/zh/trading/historical/ex-rights.html'),
  ]);

  const tdcc = tdccRaw ? parseTdccRows(tdccRaw) : new Map<string, WhaleGrade>();
  const revenueRows = revenueRaw ? parseRevenueRows(revenueRaw) : [];
  const exRightRows = exRightRaw ? parseExRightRows(exRightRaw) : [];

  const t86Ready = t86Days.length > 0;
  const tdccReady = tdcc.size > 0;
  const revenueReady = revenueRows.length > 0;
  const exRightReady = exRightRows.length > 0;

  // ---- 2. 決定價格資料日 ----
  const priceDate = t86Ready ? t86Days[t86Days.length - 1].date : todayTaipeiYmd();
  const priceDateObj = parseYmdToDate(priceDate) ?? new Date();

  // ---- 3. 讀 KV 全市場日 K（MA60 所需約 65 交易日） ----
  const kv = await getKv();
  const window = buildTradingDayWindow(priceDateObj, MA_LOOKBACK_TRADING_DAYS);
  let series: CodeSeriesMap = new Map();
  let barsDays = 0;
  let kvBound = false;
  if (kv) {
    kvBound = true;
    const { days: found } = await loadRange(kv, window);
    barsDays = found.length;
    series = buildCodeSeries(found.map((d) => ({ date: d.date, twse: d.twse, tpex: d.tpex })));
  }

  // ---- 4. 名稱／產業地圖（來源：月營收 OpenAPI）＋ T86 名稱補位 ----
  const meta: StockMetaMap = new Map();
  for (const r of revenueRows) {
    meta.set(r.code, { name: r.name || undefined, industry: r.industry });
  }
  for (const day of t86Days) {
    for (const it of day.items) {
      const existing = meta.get(it.symbol);
      if (!existing) meta.set(it.symbol, { name: it.name || undefined });
      else if (!existing.name && it.name) existing.name = it.name;
    }
  }

  const ctx: ConditionContext = { series, meta, asOf: priceDate };

  // ---- 5. 融資：今日 + 約 20 交易日前（2 次上游） ----
  const marginWindow = buildTradingDayWindow(priceDateObj, 21); // 21 個交易日，[0] = 20 交易日前
  const baselineDate = marginWindow.length >= 21 ? marginWindow[0] : null;
  const priceYmd = priceDate.replace(/-/g, '');
  const baselineYmd = baselineDate ? baselineDate.replace(/-/g, '') : null;
  const [marginToday, marginBaseline] = await Promise.all([
    fetchMarginMap(priceYmd),
    baselineYmd ? fetchMarginMap(baselineYmd) : Promise.resolve(null),
  ]);
  const marginReady = marginToday !== null && marginBaseline !== null;

  // 融資變化（張）：代號 → delta。
  const marginDelta = new Map<string, number>();
  if (marginReady && marginToday && marginBaseline) {
    for (const [code, bal] of marginToday) {
      const prev = marginBaseline.get(code);
      if (prev !== undefined) marginDelta.set(code, bal - prev);
    }
  }

  // ---- 6. 逐 tab 計算 ----
  const barsEnoughMa = barsDays >= MA_LONG + 1;
  const barsEnoughShort = barsDays >= RS_LOOKBACK + 1;

  const tabs: SwingTab[] = [];

  // whale_in / whale_out（TDCC）
  const whaleItems = tdccReady ? computeWhale(ctx, tdcc, 1) : [];
  const whaleExtra = tdccReady
    ? { note: '集保 1-5 目前僅提供當週資料，歷史週檔尚未累積，delta 與連續週數顯示「累積中」。' }
    : { unavailable_reason: 'TDCC 集保戶股權分散表上游無回應。' };
  tabs.push(makeTab('whale_in', whaleItems, whaleExtra));
  tabs.push(makeTab('whale_out', whaleItems, whaleExtra));

  // ma60 / pullback（需 60 日）
  if (barsEnoughMa) {
    tabs.push(makeTab('ma60', computeMa60(ctx)));
    tabs.push(makeTab('pullback', computePullback(ctx)));
  } else {
    const reason = barsReason(kvBound, barsDays, MA_LONG + 1);
    tabs.push(makeTab('ma60', [], { unavailable_reason: reason }));
    tabs.push(makeTab('pullback', [], { unavailable_reason: reason }));
  }

  // foreign / trust / both（T86）
  if (t86Ready) {
    tabs.push(makeTab('foreign', computeInstitutionalStreak(ctx, t86Days, 'foreignNet')));
    tabs.push(makeTab('trust', computeInstitutionalStreak(ctx, t86Days, 'trustNet')));
    tabs.push(makeTab('both', computeBothBuy(ctx, t86Days[t86Days.length - 1])));
  } else {
    const reason = 'TWSE T86 三大法人上游無回應。';
    tabs.push(makeTab('foreign', [], { unavailable_reason: reason }));
    tabs.push(makeTab('trust', [], { unavailable_reason: reason }));
    tabs.push(makeTab('both', [], { unavailable_reason: reason }));
  }

  // reclaim / break20 / rs / sector（需 21 日）
  if (barsEnoughShort) {
    tabs.push(makeTab('reclaim', computeReclaim(ctx)));
    tabs.push(makeTab('break20', computeBreak20(ctx)));
    tabs.push(makeTab('rs', computeRs(ctx)));
    tabs.push(
      makeTab('sector', computeSector(ctx), {
        ...(meta.size === 0 ? { unavailable_reason: '產業分類來源（TWSE 月營收 OpenAPI）無回應，無法分族群。' } : {}),
      }),
    );
  } else {
    const reason = barsReason(kvBound, barsDays, RS_LOOKBACK + 1);
    tabs.push(makeTab('reclaim', [], { unavailable_reason: reason }));
    tabs.push(makeTab('break20', [], { unavailable_reason: reason }));
    tabs.push(makeTab('rs', [], { unavailable_reason: reason }));
    tabs.push(makeTab('sector', [], { unavailable_reason: reason }));
  }

  // margin
  tabs.push(
    makeTab(
      'margin',
      marginReady ? computeMarginDrop(ctx, marginToday as Map<string, number>, marginBaseline as Map<string, number>) : [],
      marginReady ? {} : { unavailable_reason: 'TWSE MI_MARGN 融資融券上游無回應或無法取得 20 交易日前基準。' },
    ),
  );

  // revenue
  tabs.push(
    makeTab('revenue', revenueReady ? computeRevenue(revenueRows) : [], revenueReady ? {} : { unavailable_reason: 'TWSE 月營收 OpenAPI 無回應。' }),
  );

  // fill
  const fillItems = exRightReady && barsDays > 0 ? computeFill(ctx, exRightRows) : [];
  const fillExtra = !exRightReady
    ? { unavailable_reason: 'TWSE 除權除息預告表上游無回應。' }
    : barsDays === 0
      ? { unavailable_reason: '需全市場日 K 才能計算除權息後相對參考價的回升進度。' }
      : {};
  tabs.push(makeTab('fill', fillItems, fillExtra));

  // badnews（留白）
  tabs.push(makeTab('badnews', [], { unavailable_reason: '本站尚無新聞資料源。' }));

  // smart
  const smartReady = marginReady && tdccReady && barsDays >= SMART_RANGE_LOOKBACK + 1;
  tabs.push(
    makeTab('smart', smartReady ? computeSmart(ctx, marginDelta, tdcc) : [], smartReady
      ? {}
      : { unavailable_reason: '需同時具備融資餘額、集保大戶比例與全市場日 K（40 日）三項資料。' }),
  );

  // ---- 7. 組裝回應（對齊實站 schema） ----
  const whaleWeek = tdcc.size > 0 ? [...tdcc.values()][0].date : '';
  const week = whaleWeek ? formatDisplayDate(whaleWeek) : '';

  const body = {
    ok: true,
    data_date: priceDate,
    data_scope: '盤後歷史條件',
    next_update: '下一交易日盤後',
    week,
    weeksAccumulated: tdccReady ? 1 : 0,
    tabs,
    note: '全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。',
    provenance: PROVENANCE,
    fetchedAt,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
