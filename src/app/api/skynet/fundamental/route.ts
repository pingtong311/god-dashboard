/**
 * 個股基本面 / 財報代理（spec data-source-matrix §2-A）
 * GET /api/skynet/fundamental?ticker=2330
 *
 * 三個公開來源，全部 graceful 降級（單一來源 404 / timeout / 200+HTML 陷阱 → 該組欄 null，
 * 整包至少回一份；取不到的欄一律 null，不補腦、不硬編碼樣本數字）：
 *
 * 1. TWSE OpenAPI BWIBBU_ALL（日更）
 *    https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL
 *    content-type: application/json（沙箱實測 200，~116KB 全表），單列欄位
 *    { Date:'1150921', Code, Name, PERatio, PBratio, DividendYield }。提供：
 *    名稱、peRatio、pbRatio、dividendYield（空字串 = 無資料 → null）。
 *
 * 2. MOPS 月營收/財報（月/季更）
 *    月營收：https://mops.twse.com.tw/mops/web/ajax_t01x302（POST form，回 ~13 個月，
 *      自行算 YoY，不信任上游算好的欄；去年同月取不到 → null）。
 *    季別指標（EPS/毛利率/ROE/負債比）：https://mops.twse.com.tw/mops/web/ajax_t02bp02。
 *    ⚠ 上游可能回「200 + 安全性封鎖 HTML」（沙箱出口實測被擋；Workers 出口同
 *    既有 mops/route.ts 的 ajax_t05st01 慣例上可用）——靠 !res.ok + content-type
 *    application/json 檢查 + res.json() 拋錯 + 陣列形狀斷言四重兜底轉 null。
 *
 * 3. FinMind 免費層 income_statement（季更，僅 EPS fallback）
 *    https://api.finmind.com.tw/v4/financials?symbol=2330&statement=income_statement
 *    &sort_column=date&sort=desc&limit=1。只讀 EPS（字串值 'nan'/'null'/'' → null），
 *    且僅當 MOPS 財報 EPS 缺失才呼叫（免費層 50 req/min，節流）。
 *
 * ⚠ fetch 策略（比照 futures/route.ts，team-lead 裁示架構）：
 * - redirect:'manual' + AbortSignal.timeout(4000)：上游 3xx/逾時一律轉 null
 * - per-ticker inflight 去重（N 個並發同 ticker 只觸發各來源 1 次 fetch+parse）
 * - TTL 分層：估值欄 30 分鐘（日更，同 futures 30min 慣例）；財報欄 24 小時（季更 +
 *   FinMind 免費層節流關鍵）
 * - stale-on-error：估值上游全掛時，30 分鐘內快取仍可回傳 + X-Skynet-Stale: true
 * - 三來源彼此獨立：任一失敗不拖垮其他，取到幾欄回幾欄
 *
 * 回傳 shape：{ ok: true, data: FundamentalData }（src/types/fundamental.ts）；
 * 全來源皆無且無快取 → 200 + { ok: false, message: 'fundamental_unavailable' }
 * （比照 futures：不 5xx，前端逐欄顯示「未入庫」）。
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */

import { NextRequest, NextResponse } from 'next/server';
import type { FundamentalData, FundamentalResponse } from '@/types/fundamental';

/** 上游 fetch 超時：4s（比照 futures；回源慢掛起會被斷掉走 stale-on-error）。 */
const UPSTREAM_TIMEOUT_MS = 4_000;
/** 估值欄（BWIBBU，日更）快取 TTL：30 分鐘（同 futures 30min 慣例）。 */
const VALUATION_TTL_MS = 30 * 60 * 1000;
/** 財報欄（MOPS/FinMind，季更）快取 TTL：24 小時（FinMind 免費層 50 req/min 節流）。 */
const FINANCIALS_TTL_MS = 24 * 60 * 60 * 1000;

/** MOPS 共同 header（UA/Referer 比照 mops/route.ts 既有慣例）。 */
const MOPS_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 SkyNet',
  Referer: 'https://mops.twse.com.tw/',
};

/** BWIBBU_ALL 全表單列（值皆字串，空字串 = 無資料）。 */
type BwibbuRow = {
  Date?: string;
  Code?: string;
  Name?: string;
  PERatio?: string;
  PBratio?: string;
  DividendYield?: string;
  [key: string]: string | undefined;
};

/** MOPS t01x302 月營收單列（值皆字串；欄名依公開回傳慣例，缺欄為 undefined）。 */
type MopsRevenueRow = {
  co_id?: string;
  co_name?: string;
  year?: string;
  month?: string;
  revenue?: string;
  yoy?: string;
  [key: string]: string | undefined;
};

/** MOPS t02bp02 季別財務指標單列（EPS/毛利率/ROE/負債比，字串值）。 */
type MopsQuarterRow = {
  co_name?: string;
  date?: string;
  'EPS'?: string;
  '毛利率'?: string;
  'ROE'?: string;
  '負債比'?: string;
  [key: string]: string | undefined;
};

/** FinMind v4 financials income_statement 單列（值皆字串，可能 'nan'/'null'/''）。 */
type FinMindIncomeRow = {
  date?: string;
  EPS?: string;
  [key: string]: string | undefined;
};

/** 估值側快取（BWIBBU 解析結果，30min TTL）。 */
type ValuationCache = {
  ts: number;
  name: string | null;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
};

/** 財報側快取（MOPS 季/月 + FinMind EPS 合併結果，24h TTL）。 */
type FinancialsCache = {
  ts: number;
  /** 公司名稱（MOPS co_name；BWIBBU 名稱缺失時的備援）。 */
  name: string | null;
  monthlyRevenue: number | null;
  monthlyRevenueYoY: number | null;
  eps: number | null;
  grossMargin: number | null;
  roe: number | null;
  debtRatio: number | null;
  asOfDate: string | null;
};

/** BWIBBU 解析結果（未含 ts，快取時才封裝）。 */
type ValuationParsed = Omit<ValuationCache, 'ts'>;

/** per-ticker 分層快取（估值 30min / 財報 24h；估值掛了財報仍可回，反之亦然）。 */
const cache = new Map<string, { valuation: ValuationCache | null; financials: FinancialsCache | null }>();

/** per-ticker inflight 去重：同 ticker 並發請求只觸發各來源 1 次 fetch。 */
const inflight = new Map<
  string,
  { valuation: Promise<ValuationParsed | null> | null; financials: Promise<FinancialsCache> | null }
>();

/** 空值防護：'' / '-' / 'NULL' / 'nan' / undefined → null（絕不當 0，不補腦）。 */
function parseNumOrNull(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '' || s === '-' || s.toUpperCase() === 'NULL' || s.toLowerCase() === 'nan') {
    return null;
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** 非空 trimmed 字串 → string | null（名稱欄用；空白視同無）。 */
function parseTextOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * 共用上游 fetch：redirect:'manual'（3xx 直接攔下，絕不 follow 到 HTML 頁）
 * + AbortSignal.timeout(4s)；!res.ok → null。
 * content-type 判定（MOPS 回 JSON 時 ctype 可能是 text/javascript，故不用
 * application/json 白名單；但 MOPS「安全性封鎖」頁是 200 + text/html → 明確擋下，
 * 剩下的靠 res.json() 對 HTML 拋 SyntaxError + 下游形狀斷言雙重兜底，比照 futures）。
 */
async function fetchJsonSafe<T>(url: string, init?: { method?: string; body?: string }): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      ...(init?.body !== undefined ? { body: init.body } : {}),
      headers: init?.body
        ? { 'Content-Type': 'application/x-www-form-urlencoded', ...MOPS_HEADERS, 'X-Requested-With': 'XMLHttpRequest' }
        : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('html')) return null; // MOPS 封鎖頁陷阱（200 + text/html）
    return (await res.json()) as T;
  } catch {
    // Timeout / AbortError / DNS / SyntaxError（HTML 被當 JSON 解）一律 null，交回來源層降級
    return null;
  }
}

/** 取 BWIBBU_ALL 全表中該 ticker 的「最新一列」；無表 / 無此 ticker → null。 */
function pickLatestBwibbu(raw: BwibbuRow[] | null, ticker: string): BwibbuRow | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw.filter((r) => parseTextOrNull(r.Code) === ticker);
  if (rows.length === 0) return null;
  // Date 為 ROC YYYYMMDD 7 位定長純數字：字典序 = 數值序，嚴禁 localeCompare（同 futures 裁示）
  let latest = rows[0];
  for (const r of rows) {
    const a = String(latest.Date ?? '');
    const b = String(r.Date ?? '');
    if (b > a) latest = r;
  }
  return latest;
}

/** 共用的 per-ticker inflight 條目（get-or-create；估值/財報兩側共用同一 object，避免互相覆蓋）。 */
function inflightEntry(ticker: string): {
  valuation: Promise<ValuationParsed | null> | null;
  financials: Promise<FinancialsCache> | null;
} {
  let entry = inflight.get(ticker);
  if (!entry) {
    entry = { valuation: null, financials: null };
    inflight.set(ticker, entry);
  }
  return entry;
}

/**
 * 來源 1：TWSE BWIBBU_ALL → 名稱 + 估值欄（PE/PB/殖利率）。
 * 30min TTL + inflight 去重；失敗 → null（該組欄全 null，不影響其他來源）。
 */
function fetchValuation(ticker: string): Promise<ValuationParsed | null> {
  const entry = inflightEntry(ticker);
  if (entry.valuation) return entry.valuation;

  const promise = (async (): Promise<ValuationParsed | null> => {
    // 快取命中（30min TTL）：直接回快取快照，不打上游
    const c = cache.get(ticker);
    if (c?.valuation && Date.now() - c.valuation.ts < VALUATION_TTL_MS) {
      return c.valuation;
    }
    // 未命中 / 過期 → 重抓；stale-on-error 由 buildData 讀 cache.get 補回過期快取
    const raw = await fetchJsonSafe<BwibbuRow[]>('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL');
    const row = pickLatestBwibbu(raw, ticker);
    if (!row) return null; // 形狀斷言不通過 / 查無 ticker：整包估值 null（不寫快取）
    const parsed: ValuationParsed = {
      name: parseTextOrNull(row.Name),
      peRatio: parseNumOrNull(row.PERatio),
      pbRatio: parseNumOrNull(row.PBratio),
      dividendYield: parseNumOrNull(row.DividendYield),
    };
    // 成功才寫快取（同步寫，stale-on-error 才能讀到；失敗不污染快取）
    const cur = cache.get(ticker) ?? { valuation: null, financials: null };
    cur.valuation = { ts: Date.now(), ...parsed };
    cache.set(ticker, cur);
    return parsed;
  })();

  entry.valuation = promise;
  void promise.finally(() => {
    const cur = inflight.get(ticker);
    if (cur && cur.valuation === promise) cur.valuation = null;
  });
  return promise;
}

/**
 * 來源 2a：MOPS 月營收（t01x302，回 ~13 個月窗口）→ 最新月營收 + 自算 YoY。
 * 去年同月找不到或分母 ≤ 0 → monthlyRevenueYoY null（不補腦）。
 */
async function fetchMopsMonthlyRevenue(ticker: string): Promise<{
  monthlyRevenue: number | null;
  monthlyRevenueYoY: number | null;
  name: string | null;
  asOfDate: string | null;
}> {
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  const endYm = `${endYear}${String(endMonth).padStart(2, '0')}`;
  // 13 個月窗口（含去年同月，供自算 YoY）：start = 去年同月
  const startYm = `${endYear - 1}${String(endMonth).padStart(2, '0')}`;
  const body =
    `step=2&FIRSTIN=1&off=1&co_id=${encodeURIComponent(ticker)}` +
    `&d5=${encodeURIComponent(startYm)}&d6=${encodeURIComponent(endYm)}`;
  const raw = await fetchJsonSafe<MopsRevenueRow[]>('https://mops.twse.com.tw/mops/web/ajax_t01x302', {
    method: 'POST',
    body,
  });
  if (!Array.isArray(raw) || raw.length === 0) {
    return { monthlyRevenue: null, monthlyRevenueYoY: null, name: null, asOfDate: null };
  }
  // 正規化為 'YYYY-MM'，時間升序；無效列剔除（不補腦）
  const valid = raw
    .map((r) => {
      const y = String(r.year ?? '').trim();
      const m = String(r.month ?? '').trim().replace(/^0+(?=\d)/, '');
      return {
        ym: /^\d{4}$/.test(y) && /^\d{1,2}$/.test(m) ? `${y}-${m.padStart(2, '0')}` : null,
        revenue: parseNumOrNull(r.revenue),
        coName: parseTextOrNull(r.co_name),
      };
    })
    .filter((r): r is { ym: string; revenue: number | null; coName: string | null } => r.ym !== null)
    .sort((a, b) => a.ym.localeCompare(b.ym)); // 定長 'YYYY-MM' 字典序 = 時間序
  if (valid.length === 0) {
    return { monthlyRevenue: null, monthlyRevenueYoY: null, name: null, asOfDate: null };
  }
  const latest = valid[valid.length - 1];
  // 去年同月：'YYYY-MM' → 年 -1，月不變（r.ym 為帶 dash 的 'YYYY-MM'，同格式比較）
  const lyYear = Number.parseInt(latest.ym.slice(0, 4), 10) - 1;
  const lyYm = `${lyYear}-${latest.ym.slice(5, 7)}`;
  const prevYearSame = valid.find((r) => r.ym === lyYm);
  const monthlyRevenueYoY =
    latest.revenue !== null &&
    prevYearSame !== undefined &&
    prevYearSame.revenue !== null &&
    prevYearSame.revenue > 0
      ? ((latest.revenue - prevYearSame.revenue) / prevYearSame.revenue) * 100
      : null;
  return {
    monthlyRevenue: latest.revenue,
    monthlyRevenueYoY,
    name: latest.coName,
    asOfDate: latest.ym,
  };
}

/**
 * 來源 2b：MOPS 季別財務指標（t02bp02）→ 最近一季 EPS/毛利率/ROE/負債比。
 * 欄名依 MOPS 公開回傳（EPS、毛利率、ROE、負債比），缺欄 → null，不補腦。
 */
async function fetchMopsQuarter(ticker: string): Promise<{
  eps: number | null;
  grossMargin: number | null;
  roe: number | null;
  debtRatio: number | null;
  name: string | null;
  asOfDate: string | null;
}> {
  const now = new Date();
  // 季別窗口：去年 1 季 → 本年第 2 季（覆蓋最近已發布季報；MOPS t02bp02 月份格式 YYYYMM）
  const year = now.getFullYear();
  const body =
    `step=2&FIRSTIN=1&off=1&co_id=${encodeURIComponent(ticker)}` +
    `&b1=${year - 1}01&b2=${year}06`;
  const raw = await fetchJsonSafe<MopsQuarterRow[]>('https://mops.twse.com.tw/mops/web/ajax_t02bp02', {
    method: 'POST',
    body,
  });
  if (!Array.isArray(raw) || raw.length === 0) {
    return { eps: null, grossMargin: null, roe: null, debtRatio: null, name: null, asOfDate: null };
  }
  const rows = raw
    .map((r) => ({
      date: parseTextOrNull(r.date),
      eps: parseNumOrNull(r['EPS']),
      grossMargin: parseNumOrNull(r['毛利率']),
      roe: parseNumOrNull(r['ROE']),
      debtRatio: parseNumOrNull(r['負債比']),
      coName: parseTextOrNull(r.co_name),
    }))
    .filter((r) => r.date !== null)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')); // 定長日期字典序 = 時間序
  if (rows.length === 0) {
    return { eps: null, grossMargin: null, roe: null, debtRatio: null, name: null, asOfDate: null };
  }
  const latest = rows[rows.length - 1];
  return {
    eps: latest.eps,
    grossMargin: latest.grossMargin,
    roe: latest.roe,
    debtRatio: latest.debtRatio,
    name: latest.coName,
    asOfDate: latest.date,
  };
}

/** 來源 3：FinMind income_statement（免費層）→ 僅 EPS fallback（MOPS EPS 缺時才呼叫）。 */
async function fetchFinMindEps(ticker: string): Promise<{ eps: number | null; asOfDate: string | null }> {
  const url =
    `https://api.finmind.com.tw/v4/financials?symbol=${encodeURIComponent(ticker)}` +
    `&statement=income_statement&sort_column=date&sort=desc&limit=1`;
  const raw = await fetchJsonSafe<FinMindIncomeRow[]>(url);
  if (!Array.isArray(raw) || raw.length === 0) return { eps: null, asOfDate: null };
  const first = raw[0];
  return {
    eps: parseNumOrNull(first?.EPS),
    asOfDate: parseTextOrNull(first?.date),
  };
}

/**
 * 財報側合併：MOPS 月營收 + MOPS 季別指標（並行），EPS 缺失時才走 FinMind fallback。
 * 24h TTL + inflight 去重；全失敗 → 回 nulls（絕不補腦、不造假數字）。
 */
async function buildFinancials(ticker: string): Promise<FinancialsCache> {
  const c = cache.get(ticker);
  if (c?.financials && Date.now() - c.financials.ts < FINANCIALS_TTL_MS) return c.financials;

  const [monthly, quarter] = await Promise.all([
    fetchMopsMonthlyRevenue(ticker),
    fetchMopsQuarter(ticker),
  ]);

  let eps = quarter.eps;
  let asOfDate = laterDate(quarter.asOfDate, monthly.asOfDate);
  // 僅當 MOPS EPS 缺失才呼叫 FinMind（免費層節流）
  if (eps === null) {
    const finmind = await fetchFinMindEps(ticker);
    eps = finmind.eps;
    if (asOfDate === null && finmind.asOfDate !== null) asOfDate = finmind.asOfDate;
  }

  const merged: FinancialsCache = {
    ts: Date.now(),
    name: laterName(quarter.name, monthly.name),
    monthlyRevenue: monthly.monthlyRevenue,
    monthlyRevenueYoY: monthly.monthlyRevenueYoY,
    eps,
    grossMargin: quarter.grossMargin,
    roe: quarter.roe,
    debtRatio: quarter.debtRatio,
    asOfDate,
  };
  // 僅「至少一欄有值」才寫 24h 快取：全 null（全來源失手）不寫，
  // 避免把失敗結果當「季更無資料」鎖 24h 而跳過 FinMind fallback（同估值層慣例）
  const hasAny =
    merged.monthlyRevenue !== null ||
    merged.monthlyRevenueYoY !== null ||
    merged.eps !== null ||
    merged.grossMargin !== null ||
    merged.roe !== null ||
    merged.debtRatio !== null;
  if (hasAny) {
    const cur = cache.get(ticker) ?? { valuation: null, financials: null };
    cur.financials = merged;
    cache.set(ticker, cur);
  }
  return merged;
}

/** 取較晚的 asOfDate（季報 vs 月營收；定長 'YYYY-MM' / 'YYYY-MM-DD' 字典序可比），皆 null → null。 */
function laterDate(a: string | null, b: string | null): string | null {
  if (a !== null && b !== null) return a.localeCompare(b) >= 0 ? a : b;
  return a ?? b;
}

/** 名稱取非空者（月營收 co_name 優先），皆無 → null（不補腦）。 */
function laterName(a: string | null, b: string | null): string | null {
  if (a !== null) return a;
  return b;
}

/** 以 inflight 去重包裝 buildFinancials（N 並發同 ticker 只 1 次）。 */
function fetchFinancials(ticker: string): Promise<FinancialsCache> {
  const entry = inflightEntry(ticker);
  if (entry.financials) return entry.financials;
  const promise = buildFinancials(ticker);
  entry.financials = promise;
  void promise.finally(() => {
    const cur = inflight.get(ticker);
    if (cur && cur.financials === promise) cur.financials = null;
  });
  return promise;
}

/** 組包：估值 + 財報並行；任一侧 null → 該組欄全 null；整包永遠有 shape。 */
async function buildData(ticker: string): Promise<{
  data: FundamentalData;
  stale: boolean;
}> {
  const [valuation, financials] = await Promise.all([
    fetchValuation(ticker),
    fetchFinancials(ticker),
  ]);
  const c = cache.get(ticker);
  const valuationFailed = valuation === null;
  // stale-on-error（同 futures 裁示）：估值上游失敗 → 回最後一個估值快取快照
  // （不看 TTL，TTL 只管快取命中路徑；寧回過期快照也不全欄「未入庫」）
  const stale = valuationFailed && c?.valuation != null;
  const staleValuation = stale ? c?.valuation ?? null : null;
  const data: FundamentalData = {
    ticker,
    // 名稱優先 BWIBBU，缺時 MOPS co_name，全缺時 stale 快取；仍無才 null（不補腦）
    name:
      parseTextOrNull(valuation?.name ?? null) ??
      financials.name ??
      (staleValuation?.name ?? null),
    monthlyRevenue: financials.monthlyRevenue,
    monthlyRevenueYoY: financials.monthlyRevenueYoY,
    eps: financials.eps,
    grossMargin: financials.grossMargin,
    roe: financials.roe,
    debtRatio: financials.debtRatio,
    peRatio: valuation?.peRatio ?? staleValuation?.peRatio ?? null,
    pbRatio: valuation?.pbRatio ?? staleValuation?.pbRatio ?? null,
    dividendYield: valuation?.dividendYield ?? staleValuation?.dividendYield ?? null,
    asOfDate: financials.asOfDate,
    fetchedAt: new Date().toISOString(),
  };
  return { data, stale };
}

/** 回應 header：X-Skynet-Stale 標記「上游全掛、回的是快取快照」。 */
function responseHeaders(stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'public, s-maxage=1800',
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<FundamentalResponse>> {
  const ticker = (req.nextUrl.searchParams.get('ticker') ?? '').trim().toUpperCase();
  if (!/^(\d{4}|T99)$/.test(ticker)) {
    return NextResponse.json<FundamentalResponse>({ ok: false, message: 'invalid_ticker' }, {
      status: 200,
    });
  }

  const { data, stale } = await buildData(ticker);

  // 整包全 null（三來源皆失手且無快取可補）→ ok:false，前端逐欄「未入庫」，不 5xx
  const hasAny =
    data.name !== null ||
    data.peRatio !== null ||
    data.pbRatio !== null ||
    data.dividendYield !== null ||
    data.monthlyRevenue !== null ||
    data.eps !== null ||
    data.grossMargin !== null ||
    data.roe !== null ||
    data.debtRatio !== null;
  if (!hasAny) {
    return NextResponse.json<FundamentalResponse>(
      { ok: false, message: 'fundamental_unavailable' },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=1800' } }
    );
  }

  return NextResponse.json<FundamentalResponse>({ ok: true, data }, { status: 200, headers: responseHeaders(stale) });
}
