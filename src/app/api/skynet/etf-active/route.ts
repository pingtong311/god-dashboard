/**
 * 主動式 ETF 代理（掛牌清單 + 盤後收盤價）
 * GET /api/skynet/etf-active
 *
 * 職責：
 * - 打證交所免費 OpenAPI，產出「主動式 ETF」清單與其盤後收盤價，
 *   對齊實站 blackstockai.com/api/p1/etf-active 的 JSON 形狀（items[]）。
 *
 * 上游（皆為證交所免費 OpenAPI，免金鑰）：
 *   1) 主動式 ETF 基本資料清單：
 *      https://openapi.twse.com.tw/v1/opendata/t187ap47_L
 *      → 回傳 271 檔各類基金；以「基金類型」含「主動式」篩出主動式 ETF（實測 33 檔）。
 *        欄位：基金代號 / 基金簡稱 / 基金類型 / 基金中文名稱 / 基金英文名稱 / 上市日期 …
 *   2) ETF 收盤價（全市場均價檔）：
 *      https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL
 *      → {Date, Code, Name, ClosingPrice, MonthlyAveragePrice}（約 3 萬筆，含 ETF）。
 *
 * 誠實分工（業主明示原則：能自產就自產、缺資料要誠實）：
 *   ✅ ETF 清單 / 名稱 / 收盤價 / 月均價  → 上游有，自產。
 *   ❌ 持股明細（holdings）與當日買賣異動張數（changes）
 *        → 這是投信每日公告的持股，證交所 openapi **沒有**此欄位（已查 t187ap47_L 全部
 *          29 欄，僅有基金層級中繼資料，無成分股；TPEX openapi 亦無主動式 ETF 成分股端點）。
 *          故 holdings / changes 一律回傳**空陣列**，由前端誠實呈現「資料尚未入庫」，
 *          **絕不以 0 或假數字冒充**。
 *
 * 失敗處理：
 *   - 清單上游失敗 → 502 { ok:false, error:'etf_active_upstream_error' }。
 *   - 收盤價上游失敗 → 仍回 200，但所有收盤價欄位為 null（不影響清單；前端顯示「—」）。
 *
 * 架構照抄 src/app/api/skynet/t86/route.ts：8s timeout、AbortController、try/catch。
 */

import { NextResponse } from 'next/server';

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

/** /api/skynet/etf-active 回應形狀。 */
export interface EtfActiveResponse {
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

/**
 * 把上游日期字串正規化為 `YYYY-MM-DD`。
 * - 8 碼（例：20260928）→ 視為西元 YYYYMMDD。
 * - 7 碼（例：1150924）→ 視為民國 YYYMMDD，年 + 1911。
 * - 其他 → 原樣回傳（不猜測）。
 */
function normalizeDate(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (/^\d{7}$/.test(s)) {
    const year = Number(s.slice(0, 3)) + 1911;
    return `${year}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
  }
  return s;
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

export async function GET() {
  // 1) 先抓主動式 ETF 清單（核心；失敗即 502）。
  let listRaw: unknown;
  try {
    const res = await fetchWithTimeout(TWSE_ACTIVE_ETF_URL);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: 'etf_active_upstream_error' },
        { status: 502 },
      );
    }
    listRaw = await res.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'etf_active_upstream_error' },
      { status: 502 },
    );
  }

  if (!Array.isArray(listRaw)) {
    return NextResponse.json(
      { ok: false, error: 'etf_active_upstream_error' },
      { status: 502 },
    );
  }

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
          // 同日同代號可能重複，後者覆蓋前者即可。
          if (!priceDate) priceDate = normalizeDate(row.Date);
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

  const body: EtfActiveResponse = {
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

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
