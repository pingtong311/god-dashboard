/**
 * /api/skynet/risk —— 注意與處置（真實資料代理）
 * GET /api/skynet/risk
 *
 * 職責：
 * - 直接打證交所（TWSE）與櫃買中心（TPEx）的**免費官方端點**，自產「處置」名單，
 *   對齊實站 `https://blackstockai.com/api/risk?date=` 的 body schema。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 上游調查結論（逐一實測，2026-09-27）：
 *   ✅ 處置（上市）  TWSE `rwd/zh/announcement/punish?response=json&date=YYYYMMDD`
 *        fields = [編號, 公布日期, 證券代號, 證券名稱, 累計, 處置條件, 處置起迄時間, 處置措施, 處置內容, 備註]
 *        - 回傳「當下」處置公布快照（實測 date 參數不影響結果，皆回同一份）。
 *        - reason 對齊實站：`處置條件` ＋（有措施時）`｜處置措施`。
 *        - period 由 `處置起迄時間`（民國 "115/09/18～115/09/30"）轉西元。
 *   ✅ 處置（上櫃）  TPEx `openapi/v1/tpex_disposal_information`
 *        - 回傳 17 筆上櫃處置，欄位 DispositionPeriod="1150924~1151006"、DispositionReasons。
 *        - 實站 disposition 為「上市＋上櫃」合併（例：2305 全友＝上市、2221 大甲＝上櫃），故兩邊都要接。
 *   ✅ 處置預警／即將 由上述處置資料**自產**：處置期間起始日 > 資料日者歸此類（見
 *                    splitDispositionsByStart）。實站快照為 0 筆。
 *   ❌ 注意股        TWSE `announcement/notice` 可用，但**實站自己說暫不列示**，
 *                    故本站照抄 `attention_note` 並誠實留空（不自行列示）。
 *   ❌ 處置候選      需「注意交易資訊」累計判定（連續 N 營業日達漲幅／周轉率標準），
 *                    非單一端點可直接取得，本站暫不自算，誠實留空。
 *   ❌ 融券回補期間  查無免費公開端點；已試 TWSE `announcement/credit`、`creditSuspension`、
 *                    `marginSuspension`、`regSuspension`、`suspension`、`margin`、
 *                    `exchangeReport/TWT48U`（皆回空／302）。誠實留空。
 *   ❌ 暫停先賣後買  查無免費公開端點；已試 TWSE `announcement/daytrade`、`dayTradeSuspension`、
 *                    `afterTrading/TWTB4U`。誠實留空。
 *   ❌ 暫停交易      查無免費公開端點；已試 TWSE `announcement/regSuspension`、`suspension`、
 *                    `suspended`。誠實留空。
 *   ❌ 當日沖銷成交量值 查無免費公開端點。誠實留空。
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 資料誠實原則：缺資料一律回空陣列＋`gaps` 說明查過哪些路徑，
 * **絕不以 0 代替、不捏造、不用 Math.random**。
 */

import { NextRequest, NextResponse } from 'next/server';

/** TWSE 處置（上市）端點。 */
const TWSE_PUNISH = 'https://www.twse.com.tw/rwd/zh/announcement/punish';
/** TPEx 處置（上櫃）端點。 */
const TPEX_DISPOSAL = 'https://www.tpex.org.tw/openapi/v1/tpex_disposal_information';
const FETCH_TIMEOUT_MS = 8_000;
const LOOKBACK_DAYS = 10;
const NEXT_UPDATE = '下一交易日 23:08';

/** 實站口徑：注意股本站暫不列示，逐字照抄。 */
const ATTENTION_NOTE = '注意股名單本站暫不列示，請以交易所最新公告為準。';

export interface DispositionItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
  interval: string;
  end_date: string;
}

export interface MarginSuspensionItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
}

export interface DaytradeSuspensionItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
}

export interface SuspendedItem {
  stock_id: string;
  stock_name: string;
  label: string;
  reason: string;
  period: string;
}

export interface DayTradingItem {
  stock_id: string;
  stock_name: string;
  label: string;
  volume: number;
  buy_after_sale_blocked: boolean;
}

export interface RiskResponse {
  ok: true;
  date: string;
  data_scope: string;
  next_update: string;
  disposition: DispositionItem[];
  disposition_upcoming: DispositionItem[];
  disposition_candidates: unknown[];
  margin_suspension: MarginSuspensionItem[];
  daytrade_suspension: DaytradeSuspensionItem[];
  suspended: SuspendedItem[];
  day_trading: DayTradingItem[];
  attention: unknown[];
  attention_available: boolean;
  attention_note: string;
  gaps: string[];
  provenance: { source: string; upstream: string; upstreams: string[] };
  fetchedAt: string;
}

/** 產生證交所 rwd 端點要的西元日期（YYYYMMDD）。 */
function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 今天（西元）轉 "YYYY-MM-DD"。 */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 民國日期 → 西元 ISO（YYYY-MM-DD）。西元 = 民國 + 1911。
 * 支援兩種上游格式：
 *   - "115/09/18" 或 "115/9/18"（TWSE punish）
 *   - "1150918"（TPEx openapi）
 * 無法解析時回空字串（呼叫端據此留空，不硬塞假值）。
 */
export function rocDateToIso(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const slash = s.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const y = Number(slash[1]) + 1911;
    const mm = String(slash[2]).padStart(2, '0');
    const dd = String(slash[3]).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  const compact = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (compact) {
    const y = Number(compact[1]) + 1911;
    return `${y}-${compact[2]}-${compact[3]}`;
  }
  return '';
}

/**
 * 解析「處置起迄時間」為 { period, startDate, endDate }。
 * 支援 TWSE "115/09/18～115/09/30" 與 TPEx "1150924~1151006"。
 */
export function parsePeriodRange(raw: string): {
  period: string;
  startDate: string;
  endDate: string;
} {
  const s = String(raw ?? '').trim();
  if (!s) return { period: '', startDate: '', endDate: '' };
  const parts = s
    .split(/[~～]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    const start = rocDateToIso(parts[0]);
    const end = rocDateToIso(parts[1]);
    if (start && end) return { period: `${start}~${end}`, startDate: start, endDate: end };
  }
  const single = rocDateToIso(s);
  return single
    ? { period: single, startDate: single, endDate: single }
    : { period: '', startDate: '', endDate: '' };
}

/** 從 "YYYY-MM-DD~YYYY-MM-DD" 取起始日；無效回空字串。 */
export function periodStart(period: string): string {
  const s = String(period ?? '');
  const idx = s.indexOf('~');
  return idx > 0 ? s.slice(0, idx) : '';
}

/**
 * 將 TWSE punish 的資料列映射為 DispositionItem。
 * 欄位索引：[2]=證券代號 [3]=證券名稱 [5]=處置條件 [6]=處置起迄時間 [7]=處置措施
 * reason 對齊實站：`處置條件` ＋（措施非空時）`｜處置措施`。
 */
export function mapTwsePunishRow(row: unknown): DispositionItem | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const stockId = String(row[2] ?? '').trim();
  const stockName = String(row[3] ?? '').trim();
  if (!stockId) return null;
  const condition = String(row[5] ?? '').trim();
  const measure = String(row[7] ?? '').trim();
  const reason = measure ? `${condition}｜${measure}` : condition;
  const { period, endDate } = parsePeriodRange(String(row[6] ?? ''));
  return {
    stock_id: stockId,
    stock_name: stockName,
    label: `${stockId} ${stockName}`.trim(),
    reason,
    period,
    interval: '',
    end_date: endDate,
  };
}

/** TPEx openapi tpex_disposal_information 的原始形狀。 */
export interface TpexDisposalRaw {
  Date?: string;
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  DispositionPeriod?: string;
  DispositionReasons?: string;
  DisposalCondition?: string;
}

/** 將 TPEx 上櫃處置映射為 DispositionItem。 */
export function mapTpexDisposalRow(obj: TpexDisposalRaw): DispositionItem | null {
  const stockId = String(obj?.SecuritiesCompanyCode ?? '').trim();
  if (!stockId) return null;
  const stockName = String(obj?.CompanyName ?? '').trim();
  const reason = String(obj?.DispositionReasons ?? '').trim();
  const { period, endDate } = parsePeriodRange(String(obj?.DispositionPeriod ?? ''));
  return {
    stock_id: stockId,
    stock_name: stockName,
    label: `${stockId} ${stockName}`.trim(),
    reason,
    period,
    interval: '',
    end_date: endDate,
  };
}

/**
 * 合併上市＋上櫃處置，以 stock_id 去重（上市優先），依 end_date 由近到遠、再依代號排序。
 */
export function mergeDispositions(
  listed: DispositionItem[],
  otc: DispositionItem[],
): DispositionItem[] {
  const byId = new Map<string, DispositionItem>();
  for (const item of listed) {
    if (!byId.has(item.stock_id)) byId.set(item.stock_id, item);
  }
  for (const item of otc) {
    if (!byId.has(item.stock_id)) byId.set(item.stock_id, item);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.end_date !== b.end_date) return a.end_date < b.end_date ? -1 : 1;
    return a.stock_id < b.stock_id ? -1 : a.stock_id > b.stock_id ? 1 : 0;
  });
}

/** 取處置名單中最大的「公布日期」作為資料日，取不到則回今天。 */
function resolveDataDate(punishRows: string[][]): string {
  let latest = '';
  for (const row of punishRows) {
    const iso = rocDateToIso(String(row?.[1] ?? ''));
    if (iso && iso > latest) latest = iso;
  }
  return latest || todayIso();
}

/**
 * 依「處置期間起始日」把名單拆成兩類（對齊實站 disposition / disposition_upcoming）：
 *   - 起始日 > 資料日 → 處置預警／即將（disposition_upcoming）
 *   - 其餘（起始日 ≤ 資料日）→ 處置中（disposition）
 * 無起始日者一律歸入「處置中」（寧可多列，不漏列）。
 */
export function splitDispositionsByStart(
  items: DispositionItem[],
  dataDate: string,
): { current: DispositionItem[]; upcoming: DispositionItem[] } {
  const current: DispositionItem[] = [];
  const upcoming: DispositionItem[] = [];
  for (const item of items) {
    const start = periodStart(item.period);
    if (start && dataDate && start > dataDate) upcoming.push(item);
    else current.push(item);
  }
  return { current, upcoming };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        // 證交所會檢查 Referer；不帶會被擋（回非 JSON 或 428）。
        Referer: 'https://www.twse.com.tw/zh/announcement/punish.html',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

interface TwsePunishRaw {
  stat?: string;
  title?: string;
  fields?: string[];
  data?: string[][];
}

/**
 * 取得 TWSE 處置（上市）資料列。
 * 實測 date 參數不影響結果（皆回當下快照），但仍做回推以防休市／限流。
 * 全部失敗回 null。
 */
async function fetchTwsePunishRows(): Promise<string[][] | null> {
  const now = new Date();
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const ymd = formatTwseDate(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000));
    try {
      const res = await fetchWithTimeout(`${TWSE_PUNISH}?response=json&date=${ymd}`);
      if (!res.ok) continue;
      const raw = (await res.json()) as TwsePunishRaw;
      if (raw?.stat === 'OK' && Array.isArray(raw.data) && raw.data.length > 0) {
        return raw.data;
      }
    } catch {
      // 單日失敗就繼續往回找。
      continue;
    }
  }
  return null;
}

/** 取得 TPEx 上櫃處置；失敗回 null（呼叫端視為部分成功）。 */
async function fetchTpexDisposalRows(): Promise<TpexDisposalRaw[] | null> {
  try {
    const res = await fetchWithTimeout(TPEX_DISPOSAL);
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (Array.isArray(raw)) return raw as TpexDisposalRaw[];
    return null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const [twseRows, tpexRows] = await Promise.all([fetchTwsePunishRows(), fetchTpexDisposalRows()]);

    // 兩邊都拿不到 → 上游全掛，誠實回 502。
    if (twseRows === null && tpexRows === null) {
      return NextResponse.json({ ok: false, error: 'risk_upstream_error' }, { status: 502 });
    }

    const listed: DispositionItem[] = (twseRows ?? [])
      .map((row) => mapTwsePunishRow(row))
      .filter((x): x is DispositionItem => x !== null);
    const otc: DispositionItem[] = (tpexRows ?? [])
      .map((row) => mapTpexDisposalRow(row))
      .filter((x): x is DispositionItem => x !== null);

    const merged = mergeDispositions(listed, otc);
    const dataDate = resolveDataDate(twseRows ?? []);
    const { current: disposition, upcoming: dispositionUpcoming } = splitDispositionsByStart(
      merged,
      dataDate,
    );

    // 誠實記錄缺哪些子清單與查過的路徑（「我們查過什麼」本身即資產）。
    const gaps: string[] = [];
    if (twseRows === null) gaps.push('上市處置（TWSE announcement/punish）暫時無法取得。');
    if (tpexRows === null) gaps.push('上櫃處置（TPEx openapi tpex_disposal_information）暫時無法取得。');
    gaps.push(
      '注意股：依實站口徑暫不列示（見 attention_note）。TWSE announcement/notice 端點本身可用，是實站刻意不列示。',
    );
    gaps.push(
      '處置候選：屬「還沒做」而非「拿不到」——可由 TWSE announcement/notice 逐日累積「注意交易資訊」，再比對個股歷史漲幅／周轉率判定；本站尚未建此累計管線。',
    );
    gaps.push(
      '融券回補期間（暫停融資融券）：查無免費公開端點。已試 TWSE announcement/{credit, creditSuspension, marginSuspension, regSuspension, suspension, margin}、exchangeReport/TWT48U（皆回空）。',
    );
    gaps.push(
      '暫停先賣後買（暫停當日沖銷）：查無免費公開端點。已試 TWSE announcement/{daytrade, dayTradeSuspension}、afterTrading/TWTB4U（皆回空）。',
    );
    gaps.push('暫停交易：查無免費公開端點。已試 TWSE announcement/{regSuspension, suspension, suspended}（皆回空）。');
    gaps.push('當日沖銷成交量值：查無免費公開端點。');
    gaps.push(
      'TPEx 無對應公告端點：tpex_margin_balance、tpex_margin_transactions 皆回 HTTP 302。',
    );

    const body: RiskResponse = {
      ok: true,
      date: dataDate,
      data_scope: '盤後',
      next_update: NEXT_UPDATE,
      disposition,
      disposition_upcoming: dispositionUpcoming,
      disposition_candidates: [],
      margin_suspension: [],
      daytrade_suspension: [],
      suspended: [],
      day_trading: [],
      attention: [],
      attention_available: false,
      attention_note: ATTENTION_NOTE,
      gaps,
      provenance: {
        source: 'self-produced',
        upstream: TWSE_PUNISH,
        upstreams: [TWSE_PUNISH, TPEX_DISPOSAL],
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'risk_timeout' }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: 'risk_fetch_error' }, { status: 500 });
  }
}
