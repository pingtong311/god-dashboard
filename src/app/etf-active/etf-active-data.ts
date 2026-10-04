/**
 * 主動式 ETF 資料層（離線預算用）
 *
 * 從 route 抽出，供 `scripts/precompute-scan.mjs` bundle 使用（不 import next/server）。
 * 回傳形狀對齊 route：`{ data, upstream }`（攤平，非 `{ok,data}`）。
 */
import { twseDateToIso } from '@/lib/twseFormat';

/** 主動式 ETF 清單上游（證交所 opendata）。 */
const TWSE_ACTIVE_ETF_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap47_L';
/** ETF 收盤均價上游（證交所 exchangeReport）。 */
const TWSE_STOCK_AVG_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL';
/** 上游 fetch 超時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 主動式 ETF 的「基金類型」判別關鍵字。 */
const ACTIVE_ETF_KEYWORD = '主動式';
/** 誠實註記（固定文案，對齊實站 note）。 */
const HONEST_NOTE = '主動式 ETF 持股與異動，盤後客觀表。';
/** 下一交易日更新時間（對齊實站文案）。 */
const NEXT_UPDATE = '下一交易日 23:08';

/** 主動式 ETF 清單單筆（t187ap47_L 的原始欄位，值皆字串）。 */
interface RawActiveEtf {
  基金代號?: string;
  基金簡稱?: string;
  基金類型?: string;
  基金中文名稱?: string;
  基金英文名稱?: string;
  上市日期?: string;
  [key: string]: string | undefined;
}

/** ETF 收盤均價單筆（STOCK_DAY_AVG_ALL 的原始欄位，值皆字串）。 */
interface RawStockAvg {
  Date?: string;
  Code?: string;
  Name?: string;
  ClosingPrice?: string;
  MonthlyAveragePrice?: string;
  [key: string]: string | undefined;
}

/** 持股明細列（對齊實站 schema；本站無資料源 → 恆為空陣列）。 */
export interface EtfHolding {
  stock_id: string;
  shares: number;
  weight: number;
}

/** 當日異動列（對齊實站 schema；本站無資料源 → 恆為空陣列）。 */
export interface EtfChange {
  stock_id: string;
  buy: number;
  sell: number;
}

/** 主動式 ETF 單筆（對齊實站 items[]，另加自產的收盤價欄位）。 */
export interface EtfActiveItem {
  etf_id: string;
  name: string;
  /** 盤後收盤價（自產；無資料為 null）。 */
  closing_price: number | null;
  /** 月均價（自產；無資料為 null）。 */
  monthly_avg_price: number | null;
  /** 持股明細：本站無資料源，恆為空陣列。 */
  holdings: EtfHolding[];
  /** 當日異動：本站無資料源，恆為空陣列。 */
  changes: EtfChange[];
}

/** 回應資料結構（攤平，供離線預算直接 JSON.stringify）。 */
export interface EtfActiveData {
  available: boolean;
  date: string;
  data_scope: string;
  next_update: string;
  note: string;
  items: EtfActiveItem[];
  provenance: { source: 'self-produced'; upstream: string; upstreams: string[] };
  fetchedAt: string;
}

/** 帶 timeout 的 fetch（AbortController，逾時丟 AbortError）。 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** 解析數字字串（去除千分位逗號）；'---' / '-' / '' / 非數字 → null（絕不當 0）。 */
function toNumOrNull(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '---' || s.toUpperCase() === 'NULL' || s.toUpperCase() === 'NAN') {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 取字串欄位並 trim。 */
function str(raw: unknown): string {
  return String(raw ?? '').trim();
}

/**
 * 抓取並組裝主動式 ETF 資料。
 * 供離線預算呼叫；route 亦呼叫此函式，保證結果一致。
 */
export async function getEtfActive(): Promise<{ data: EtfActiveData; upstream: string[] } | null> {
  // 1) 先抓主動式 ETF 清單（核心；失敗即回 null）。
  let listRaw: unknown;
  try {
    const res = await fetchWithTimeout(TWSE_ACTIVE_ETF_URL);
    if (!res.ok) return null;
    listRaw = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(listRaw)) return null;

  const activeEtfs = (listRaw as RawActiveEtf[])
    .filter((row) => str(row['基金類型']).includes(ACTIVE_ETF_KEYWORD))
    .map((row) => ({
      etf_id: str(row['基金代號']),
      name: str(row['基金簡稱']),
    }))
    .filter((row) => row.etf_id.length > 0);

  // 2) 再抓收盤價（次要；失敗降級為 null，不影響清單）。
  const priceByCode = new Map<string, { close: number | null; avg: number | null }>();
  let priceDate = '';
  try {
    const res = await fetchWithTimeout(TWSE_STOCK_AVG_URL);
    if (res.ok) {
      const priceRaw = (await res.json()) as RawStockAvg[];
      if (Array.isArray(priceRaw)) {
        for (const row of priceRaw) {
          const code = str(row.Code);
          if (code.length === 0) continue;
          if (!priceDate) priceDate = twseDateToIso(String(row.Date ?? ''));
          priceByCode.set(code, {
            close: toNumOrNull(row.ClosingPrice),
            avg: toNumOrNull(row.MonthlyAveragePrice),
          });
        }
      }
    }
  } catch {
    // 收盤價上游失敗：保留空 Map，價格顯示「—」。
  }

  const items: EtfActiveItem[] = activeEtfs.map((etf) => {
    const price = priceByCode.get(etf.etf_id);
    return {
      etf_id: etf.etf_id,
      name: etf.name,
      closing_price: price?.close ?? null,
      monthly_avg_price: price?.avg ?? null,
      // 持股明細與當日異動：證交所 openapi 無此資料，誠實留空。
      holdings: [],
      changes: [],
    };
  });

  const data: EtfActiveData = {
    available: true,
    date: priceDate,
    data_scope: '盤後',
    next_update: NEXT_UPDATE,
    note: HONEST_NOTE,
    items,
    provenance: {
      source: 'self-produced',
      upstream: TWSE_ACTIVE_ETF_URL,
      upstreams: [TWSE_ACTIVE_ETF_URL, TWSE_STOCK_AVG_URL],
    },
    fetchedAt: new Date().toISOString(),
  };

  return { data, upstream: [TWSE_ACTIVE_ETF_URL, TWSE_STOCK_AVG_URL] };
}