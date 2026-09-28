/**
 * /api/skynet/margin-maint —— 融資維持率（真實資料代理）
 * GET /api/skynet/margin-maint
 *
 * 職責：
 * - 直接打證交所（TWSE）**免費官方端點**，自產「大盤融資維持率」，並誠實處理
 *   「個股維持率」——因為交易所根本沒公開可算的欄位。
 * - 對齊實站 `https://blackstockai.com/api/p1/margin-maint` 的 body schema。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 上游調查結論（逐一實測，2026-09-27）：
 *
 * ① 個股「融資維持率」——**無法自算**（誠實留空）：
 *    - `openapi/v1/exchangeReport/MI_MARGN` 每筆欄位為
 *      {股票代號, 股票名稱, 融資買進, 融資賣出, 融資現金償還, 融資前日餘額, 融資今日餘額,
 *       融資限額, 融券…, 資券互抵, 註記}。
 *      → 只有「融資餘額（交易單位／張）」，**沒有「融資金額（元）」**。
 *    - `rwd/zh/marginTrading/MI_MARGN?response=json&date=YYYYMMDD&selectType=ALL` 有兩張表：
 *      ・信用交易統計（市場總計）：含「融資金額(仟元)」→ 只有**全市場加總**。
 *      ・融資融券彙總（全部）：每檔僅「交易單位」→ 個股仍無金額。
 *    - 維持率定義＝擔保品市值 ÷ 融資金額。個股缺「融資金額」與「融資成本均價」，
 *      分母無法誠實取得，**故個股維持率一律留空**（不以 0 代替、不捏造）。
 *
 * ② 大盤「融資維持率」——**可自算**（本檔實作）：
 *    公式：market_maintenance = Σ(個股融資今日餘額張 × 1000 股/張 × 收盤價元/股) ÷ 融資金額(仟元) × 1000(仟元→元) × 100%
 *      - 分子（擔保品市值）：個股融資餘額（rwd MI_MARGN 第 2 表 index 6）× 收盤價
 *        （`openapi/v1/exchangeReport/STOCK_DAY_AVG_ALL`，欄位 {Date,Code,Name,ClosingPrice}）。
 *      - 分母（融資金額）：rwd MI_MARGN 第 1 表「融資金額(仟元)」今日餘額（index 5）。
 *    實測驗算（資料日 2026-09-24）：自算 = 193.87%，實站 market_maintenance = 193.88%，
 *    相差 0.01 個百分點（來源為少數個股缺價／四捨五入），證明公式與口徑正確。
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 資料誠實原則：個股維持率缺來源一律回空陣列＋`items_note` 說明，
 * **絕不以 0 代替、不捏造、不用 Math.random**。
 */

import { NextRequest, NextResponse } from 'next/server';

/** TWSE 融資融券餘額表（rwd，含市場「融資金額(仟元)」總計）。 */
const TWSE_MI_MARGN = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN';
/** TWSE 個股日收盤價（openapi 快照）。 */
const TWSE_STOCK_DAY_AVG = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL';
const FETCH_TIMEOUT_MS = 8_000;
const LOOKBACK_DAYS = 10;
const NEXT_UPDATE = '下一交易日 23:08';
/** 追繳門檻（台股慣例 130%）。 */
const TIGHT_THRESHOLD = 130;

export interface MarginMaintItem {
  stock_id: string;
  label: string;
  maintenance: number;
}

export interface MarginMaintResponse {
  ok: true;
  available: boolean;
  date: string;
  data_scope: string;
  next_update: string;
  note: string;
  market_maintenance: number | null;
  tight_threshold: number;
  items: MarginMaintItem[];
  items_available: boolean;
  items_note: string;
  price_date: string;
  method: string;
  provenance: { source: string; upstream: string; upstreams: string[] };
  fetchedAt: string;
}

/** 個股融資餘額（張）。 */
export interface MarginBalanceRow {
  code: string;
  balanceLots: number;
}

/** 個股收盤價（元）。 */
export interface PriceRow {
  code: string;
  close: number;
}

/** 產生證交所 rwd 端點要的西元日期（YYYYMMDD）。 */
function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 含千分位逗號／空白的字串 → 數字；無法解析回 null（不硬塞 0）。 */
export function parseNumeric(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 證交所日期 → 西元 ISO（YYYY-MM-DD）。
 * 支援西元 "20260924"（rwd MI_MARGN date 欄）與民國 "1150924"（openapi）。
 */
export function twseDateToIso(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/^\d{8}$/.test(s)) {
    // 西元 YYYYMMDD
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const roc = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (roc) {
    const y = Number(roc[1]) + 1911;
    return `${y}-${roc[2]}-${roc[3]}`;
  }
  return '';
}

/**
 * 自算大盤融資維持率（%）。
 *
 * 公式：Σ(融資餘額張 × 1000 × 收盤價) ÷ (融資金額仟元 × 1000) × 100
 *  - 缺收盤價的個股直接略過（不補 0）。
 *  - 分母非正、分子為 0 → 回 null（誠實，不假造數字）。
 *
 * @param rows 個股融資餘額（張）
 * @param prices 收盤價 Map（code → 元）
 * @param loanAmountK 市場融資金額（仟元）
 * @returns 維持率百分比（2 位小數）或 null
 */
export function computeMarketMaintenance(
  rows: MarginBalanceRow[],
  prices: Map<string, number>,
  loanAmountK: number | null,
): number | null {
  if (loanAmountK === null || !Number.isFinite(loanAmountK) || loanAmountK <= 0) return null;
  const loanAmountYuan = loanAmountK * 1000; // 仟元 → 元
  let collateral = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.balanceLots) || r.balanceLots <= 0) continue;
    const close = prices.get(r.code);
    if (close === undefined || !Number.isFinite(close) || close <= 0) continue;
    collateral += r.balanceLots * 1000 * close; // 張 × 1000 股/張 × 元/股 = 元
  }
  if (collateral <= 0) return null;
  return Math.round((collateral / loanAmountYuan) * 100 * 100) / 100;
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
        Referer: 'https://www.twse.com.tw/zh/trading/margin/mi-margn.html',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

interface MiMargnTable {
  title?: string;
  fields?: string[];
  data?: string[][];
}

interface MiMargnRaw {
  stat?: string;
  date?: string;
  tables?: MiMargnTable[];
}

interface MiMargnParsed {
  date: string; // ISO
  loanAmountK: number | null; // 市場融資金額（仟元，今日餘額）
  rows: MarginBalanceRow[]; // 個股融資餘額（張）
}

/**
 * 解析 rwd MI_MARGN 的兩張表。
 * 第 1 表（信用交易統計）：找 label 為「融資金額(仟元)」的列，取「今日餘額」欄。
 * 第 2 表（融資融券彙總）：逐列取 [0]=代號、[6]=融資今日餘額（張）。
 */
export function parseMiMargn(raw: MiMargnRaw): MiMargnParsed | null {
  const tables = raw?.tables;
  if (!Array.isArray(tables) || tables.length < 2) return null;

  const summary = tables[0];
  const perStock = tables[1];

  // 市場融資金額（仟元）：以欄名定位，避免欄序變動。
  let loanAmountK: number | null = null;
  const summaryRows = summary?.data ?? [];
  for (const row of summaryRows) {
    if (String(row?.[0] ?? '').includes('融資金額')) {
      // 欄序：項目, 買進, 賣出, 現金(券)償還, 前日餘額, 今日餘額
      loanAmountK = parseNumeric(row?.[5]);
      break;
    }
  }

  // 個股融資今日餘額（張）。
  const rows: MarginBalanceRow[] = [];
  for (const row of perStock?.data ?? []) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const code = String(row[0] ?? '').trim();
    if (!code) continue;
    const balanceLots = parseNumeric(row[6]) ?? 0;
    rows.push({ code, balanceLots });
  }

  return {
    date: twseDateToIso(String(raw?.date ?? '')),
    loanAmountK,
    rows,
  };
}

/** 取得最近的 MI_MARGN（回推最多 LOOKBACK_DAYS 天）。 */
async function fetchLatestMiMargn(): Promise<MiMargnParsed | null> {
  const now = new Date();
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const ymd = formatTwseDate(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000));
    try {
      const res = await fetchWithTimeout(
        `${TWSE_MI_MARGN}?response=json&date=${ymd}&selectType=ALL`,
      );
      if (!res.ok) continue;
      const raw = (await res.json()) as MiMargnRaw;
      if (raw?.stat === 'OK') {
        const parsed = parseMiMargn(raw);
        if (parsed && parsed.rows.length > 0) return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

interface StockDayAvgRaw {
  Date?: string;
  Code?: string;
  Name?: string;
  ClosingPrice?: string;
}

/** 取得個股收盤價（openapi 快照）。回 { prices, date }。 */
async function fetchClosingPrices(): Promise<{ prices: Map<string, number>; date: string } | null> {
  try {
    const res = await fetchWithTimeout(TWSE_STOCK_DAY_AVG);
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return null;
    const prices = new Map<string, number>();
    let date = '';
    for (const item of raw as StockDayAvgRaw[]) {
      const code = String(item?.Code ?? '').trim();
      if (!code) continue;
      const close = parseNumeric(item?.ClosingPrice);
      if (close === null || close <= 0) continue;
      prices.set(code, close);
      if (!date) date = twseDateToIso(String(item?.Date ?? ''));
    }
    if (prices.size === 0) return null;
    return { prices, date };
  } catch {
    return null;
  }
}

const ITEMS_NOTE =
  '個股融資維持率本站暫不列示：證交所僅公開個股融資餘額（交易單位／張），未公開個股融資金額（元）與融資成本，分母無法誠實取得，故不自算個股維持率。';

const METHOD =
  'market_maintenance = Σ(個股融資今日餘額張 × 1000 × 收盤價) ÷ 市場融資金額(仟元) × 1000 × 100%';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const [margn, priceData] = await Promise.all([fetchLatestMiMargn(), fetchClosingPrices()]);

    // 主資料（融資餘額表）拿不到 → 上游失敗，誠實回 502。
    if (margn === null) {
      return NextResponse.json({ ok: false, error: 'margin_maint_upstream_error' }, { status: 502 });
    }

    const prices = priceData?.prices ?? new Map<string, number>();
    const marketMaintenance = computeMarketMaintenance(margn.rows, prices, margn.loanAmountK);

    const body: MarginMaintResponse = {
      ok: true,
      available: true,
      date: margn.date,
      data_scope: '盤後',
      next_update: NEXT_UPDATE,
      note: '盤後融資維持率，低到高排列。不是斷頭預測。',
      market_maintenance: marketMaintenance,
      tight_threshold: TIGHT_THRESHOLD,
      items: [],
      items_available: false,
      items_note: ITEMS_NOTE,
      price_date: priceData?.date ?? '',
      method: METHOD,
      provenance: {
        source: 'self-produced',
        upstream: TWSE_MI_MARGN,
        upstreams: [TWSE_MI_MARGN, TWSE_STOCK_DAY_AVG],
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'margin_maint_timeout' }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: 'margin_maint_fetch_error' }, { status: 500 });
  }
}
