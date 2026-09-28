/**
 * 可轉債（CB）代理（發行資料 + 賣回權時程）
 * GET /api/skynet/cb
 *
 * ── 資料源調查結論（重要：下一個人不必重複踩坑）──────────────────────────────
 * 業主指定要對齊實站 blackstockai.com/api/cb-arbitrage 的 schema：
 *   { items[]（轉換溢價率排序）, put_schedule[]（賣回權時程）, note }
 *
 * 已實測（curl）的櫃買中心（TPEX）路徑與結果：
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_cb_daily          → 302 導回首頁
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_cb_info           → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_cb_daily_quotes   → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_cb_issuance       → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/bond_CB                → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_bond_CB           → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/tpex_cb_conversion_price → 302
 *   ✗ https://www.tpex.org.tw/openapi/v1/swagger.json           → 302（錯的前綴）
 *   ✗ https://www.tpex.org.tw/web/bond/...                       → 302 /errors
 *   ✗ https://www.tpex.org.tw/www/zh-tw/bond/...                 → 302 /errors
 *   ✗ https://mops.twse.com.tw/（POST）                          → 200 但回「FOR SECURITY
 *        REASONS, THIS PAGE CAN NOT BE ACCESSED」（擋自動化）
 *
 * 突破點：TPEX OpenAPI 的 **Swagger 規格書**在
 *   https://www.tpex.org.tw/openapi/swagger.json （注意：不是 /openapi/v1/swagger.json）
 *   內含全部 225 條合法路徑；逐一比對後，「債券」分類下與 CB 相關的**只有**：
 *     ✅ /bond_ISSBD5_data  「轉(交)換債發行資料下載」  ← 本 route 採用
 *     △ /bond_cb_daily      「轉(交)換公司債買賣斷券商買賣日報表」（券商層級彙總，
 *                            實測當日回單筆且值全 null；非逐檔 CB 收盤價，無用）
 *     △ /tpex_dpsp_monthly_CBmcs007「可轉債資產交換 ASO/ASW 銀行承作餘額」（非行情）
 *   **Swagger 內沒有任何 CB 盤後成交價 / 收盤參考價端點。**
 *
 * ── 誠實分工（業主明示原則）─────────────────────────────────────────────────
 *   ✅ put_schedule（賣回權時程）：/bond_ISSBD5_data 直接有
 *        PutOptionDate / PutOptionPrice / ShortName / BondCode → 自產（實測 262 檔有賣回日）。
 *   ✅ calendar（發行／掛牌／到期行事曆）：同源有 IssueDate / ListingDate / MaturityDate → 自產。
 *   ❌ items（轉換溢價率排序）：需要 CB **盤後成交價**才能算溢價率，
 *        而 TPEX/TWSE 免費 OpenAPI 皆無此欄位 → **無法計算**，故回傳空陣列，
 *        前端誠實呈現「資料尚未入庫」，**絕不用 0 或假數字湊出排序**。
 *        （備註：/bond_ISSBD5_data 的 Conversion/ExchangePriceAtIssuance 是「發行時轉換價」，
 *          非現行轉換價，且無 CB 市價，故連轉換價值都無法可靠計算。）
 *
 * 失敗處理：上游失敗 → 502 { ok:false, error:'cb_upstream_error' }。
 * 架構照抄 src/app/api/skynet/t86/route.ts：8s timeout、AbortController、try/catch。
 */

import { NextResponse } from 'next/server';

/** 櫃買中心「轉(交)換債發行資料下載」上游（TPEX 免費 OpenAPI，免金鑰）。 */
const TPEX_CB_ISSUANCE_URL = 'https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data';
/** 上游 fetch 超時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 誠實註記（對齊實站 note 語意）。 */
const HONEST_NOTE =
  '轉換溢價率＝可轉債市價相對轉換價值的差異。負值只表示公式差異，尚未計入流動性、借券、閉鎖期、稅費與成交限制，不代表存在可執行交易。賣回時程為公開時程表。';
/** 轉換溢價率排序無法產生時的原因（前端據此誠實說明）。 */
const ITEMS_UNAVAILABLE_REASON =
  'CB 盤後成交價無免費資料源（TPEX/TWSE OpenAPI 皆無），無法計算轉換價值與溢價率，故不提供排序。';

/** /bond_ISSBD5_data 單筆原始欄位（值皆字串，可能為 ''）。 */
interface RawCbIssuance {
  Date?: string;
  IssuerCode?: string;
  IssuerName?: string;
  BondCode?: string;
  ShortName?: string;
  IssueDate?: string;
  MaturityDate?: string;
  ListingDate?: string;
  IssueAmount?: string;
  OutstandingAmount?: string;
  CouponRate?: string;
  PutOptionDate?: string;
  PutOptionPrice?: string;
  'Conversion/ExchangePriceAtIssuance'?: string;
  'Conversion/ExchangePeriodStartDate'?: string;
  'Conversion/ExchangePeriodEndDate'?: string;
  [key: string]: string | undefined;
}

/** 賣回權時程單列（對齊實站 put_schedule schema）。 */
export interface CbPutScheduleRow {
  cb_id: string;
  name: string;
  put_price: number | null;
  put_date: string;
  /** 賣回權期間結束日：上游無此欄位 → 空字串（誠實留白）。 */
  end_date: string;
}

/** 發行／掛牌行事曆單列（自產；對齊實站「官方發行、掛牌及到期日期」語意）。 */
export interface CbCalendarRow {
  cb_id: string;
  name: string;
  issue_date: string;
  listing_date: string;
  maturity_date: string;
}

/** 轉換溢價率排序單列（對齊實站 items[] schema；本站無 CB 市價 → 恆為空陣列）。 */
export interface CbItem {
  cb_id: string;
  cb_name: string;
  conversion_price: number | null;
  underlying_price: number | null;
  cb_price: number | null;
  conversion_value: number | null;
  premium_pct: number | null;
  outstanding: number | null;
  coupon_rate: number | null;
  due_date: string;
}

/** /api/skynet/cb 回應形狀。 */
export interface CbResponse {
  available: boolean;
  date: string;
  data_scope: string;
  next_update: string;
  items: CbItem[];
  put_schedule: CbPutScheduleRow[];
  calendar: CbCalendarRow[];
  note: string;
  /** 為何 items 為空（誠實說明，前端顯示用）。 */
  items_unavailable_reason: string;
  provenance: { source: 'self-produced'; upstream: string };
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
 * - 8 碼（例：20260928）→ 西元 YYYYMMDD。
 * - 7 碼（例：1150924）→ 民國 YYYMMDD，年 + 1911。
 * - 空字串 → 空字串；其他 → 原樣回傳。
 */
function normalizeDate(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (/^\d{7}$/.test(s)) {
    const year = Number(s.slice(0, 3)) + 1911;
    return `${year}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
  }
  return s;
}

/** 解析數字字串（去除千分位逗號）；'' / '-' / 'NULL' / 'NAN' / 非數字 → null。 */
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
  let raw: unknown;
  try {
    const res = await fetchWithTimeout(TPEX_CB_ISSUANCE_URL);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'cb_upstream_error' }, { status: 502 });
    }
    raw = await res.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'cb_upstream_error' }, { status: 502 });
  }

  if (!Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: 'cb_upstream_error' }, { status: 502 });
  }

  const rows = raw as RawCbIssuance[];
  // 僅取有債券代號（已掛牌 CB）者。
  const listed = rows.filter((row) => str(row.BondCode).length > 0);

  // 資料日：取第一筆非空 Date。
  let dataDate = '';
  for (const row of rows) {
    const d = normalizeDate(row.Date);
    if (d) {
      dataDate = d;
      break;
    }
  }

  // put_schedule：有賣回權日期者，依賣回日由近到遠排序（時程表可讀性）。
  const put_schedule: CbPutScheduleRow[] = listed
    .filter((row) => normalizeDate(row.PutOptionDate).length > 0)
    .map((row) => ({
      cb_id: str(row.BondCode),
      name: str(row.ShortName),
      put_price: toNumOrNull(row.PutOptionPrice),
      put_date: normalizeDate(row.PutOptionDate),
      end_date: '',
    }))
    .sort((a, b) => a.put_date.localeCompare(b.put_date));

  // calendar：官方發行／掛牌／到期日期（同源可自產）。
  const calendar: CbCalendarRow[] = listed
    .map((row) => ({
      cb_id: str(row.BondCode),
      name: str(row.ShortName),
      issue_date: normalizeDate(row.IssueDate),
      listing_date: normalizeDate(row.ListingDate),
      maturity_date: normalizeDate(row.MaturityDate),
    }))
    .filter((row) => row.issue_date.length > 0)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date));

  const body: CbResponse = {
    available: true,
    date: dataDate,
    data_scope: '盤後',
    next_update: '下一交易日盤後',
    // 轉換溢價率排序：無 CB 盤後成交價可算 → 誠實留空，不造假。
    items: [],
    put_schedule,
    calendar,
    note: HONEST_NOTE,
    items_unavailable_reason: ITEMS_UNAVAILABLE_REASON,
    provenance: {
      source: 'self-produced',
      upstream: TPEX_CB_ISSUANCE_URL,
    },
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
