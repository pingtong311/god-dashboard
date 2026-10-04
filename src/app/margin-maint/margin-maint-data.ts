/**
 * 融資維持率資料層（離線預算用）
 *
 * 從 route 抽出，供 `scripts/precompute-scan.mjs` bundle 使用（不 import next/server）。
 * 回傳形狀對齊 route：`{ data, upstream }`（攤平，非 `{ok,data}`）。
 */
import { twseDateToIso, parseNumeric } from '@/lib/twseFormat';

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

export interface MarginMaintData {
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
  gaps: string[];
  provenance: { source: string; upstream: string; upstreams: string[] };
  fetchedAt: string;
}

export interface MarginBalanceRow {
  code: string;
  balanceLots: number;
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
  date: string;
  loanAmountK: number | null;
  rows: MarginBalanceRow[];
}

interface StockDayAvgRaw {
  Date?: string;
  Code?: string;
  Name?: string;
  ClosingPrice?: string;
}

/** 產生證交所 rwd 端點要的西元日期（YYYYMMDD）。 */
function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
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

/** 「我們查過什麼」的死路清單（本身即資產，上游封閉後不可能重走）。 */
const MARGIN_GAPS: string[] = [
  '逐檔融資金額（元）：不存在於公開端點，故逐檔維持率無法直接取得。',
  'TWSE openapi `exchangeReport/MI_MARGN`：逐檔僅「交易單位(張)」欄（買進/賣出/現金償還/前日餘額/今日餘額/限額），無金額。',
  'TWSE rwd `marginTrading/MI_MARGN?selectType=ALL`：第 1 表「信用交易統計」僅提供全市場融資金額(仟元)；第 2 表逐檔仍僅張。selectType=MS/01/02/03 僅依產業別過濾，欄位不變。',
  'TWSE openapi swagger（143 paths）：融資類端點僅 `exchangeReport/MI_MARGN` 一個。',
  'TPEx openapi `tpex_mainboard_margin_balance`：有 MarginPurchaseUtilizationRate（融資使用率），但無金額、無維持率。',
  'TPEx `tpex_margin_balance`、`tpex_margin_transactions`：皆回 HTTP 302（不存在）。',
  '結論：逐檔維持率非官方欄位；本站在此僅提供可自算的大盤維持率，個股維持率誠實留空（不以 0 代替）。',
];

/**
 * 自算大盤融資維持率（%）。
 *
 * 公式：Σ(融資餘額張 × 1000 × 收盤價) ÷ (融資金額仟元 × 1000) × 100
 *  - 缺收盤價的個股直接略過（不補 0）。
 *  - 分母非正、分子為 0 → 回 null（誠實，不假造數字）。
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

/**
 * 抓取並組裝融資維持率資料。
 * 供離線預算呼叫；route 亦呼叫此函式，保證結果一致。
 */
export async function getMarginMaint(): Promise<{ data: MarginMaintData; upstream: { twse: string; tpex: string | null } } | null> {
  try {
    const [margn, priceData] = await Promise.all([fetchLatestMiMargn(), fetchClosingPrices()]);

    // 主資料（融資餘額表）拿不到 → 上游失敗，誠實回 null。
    if (margn === null) {
      return null;
    }

    const prices = priceData?.prices ?? new Map<string, number>();
    const marketMaintenance = computeMarketMaintenance(margn.rows, prices, margn.loanAmountK);

    const data: MarginMaintData = {
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
      gaps: MARGIN_GAPS,
      provenance: {
        source: 'self-produced',
        upstream: TWSE_MI_MARGN,
        upstreams: [TWSE_MI_MARGN, TWSE_STOCK_DAY_AVG],
      },
      fetchedAt: new Date().toISOString(),
    };

    return { data, upstream: { twse: TWSE_MI_MARGN, tpex: null } };
  } catch {
    return null;
  }
}