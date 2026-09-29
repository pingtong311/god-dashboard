/**
 * 可轉債（CB）代理（發行資料 + 賣回權時程 + 自產轉換溢價率排序）
 * GET /api/skynet/cb
 *
 * 業主指定對齊實站 blackstockai.com/api/cb-arbitrage 的 schema：
 *   { items[]（轉換溢價率排序）, put_schedule[]（賣回權時程）, calendar[], note }
 *
 * ── 資料源（2026-09-29 實測確認）──────────────────────────────────────────────
 * ① 轉(交)換債發行資料下載（TPEX 免費 OpenAPI，免金鑰）
 *      https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data
 *    → put_schedule（賣回權）、calendar（發行／掛牌／到期）、ShortName 名稱對照。
 *
 * ② 轉(交)換債日統計報表「檔案清單」
 *      https://www.tpex.org.tw/www/zh-tw/bond/cbDaily?response=json&date=YYYY/MM/DD&fileCode=cbdrs001
 *    ★ 必要參數是 fileCode（cbdrs001＝轉換公司債資訊看板）。只給 date 會回
 *      {"stat":"參數輸入錯誤"}——這正是先前誤判「TPEX/TWSE 免費 OpenAPI 皆無 CB
 *      盤後成交價」的原因，該斷言已作廢。
 *    ★ date 是「月」粒度：給該月任一天 → 回該月已發布的檔案清單（新→舊）。
 *      不給 date → 回當月；給未來月份 → stat ok 但 0 筆。
 *    → tables[0].data[0] = ['115/09/24', '/storage/bond_zone/tradeinfo/cb/2026/202609/RSdrs001.20260924-C.csv', '...xls']
 *
 * ③ 該 CSV（BIG5，約 93KB，381 列；同月每日一份）
 *      https://www.tpex.org.tw{②回的 data[0][1]}
 *    HEADER 20 欄：
 *      債券代碼,債券簡稱,轉換起日,轉換迄日,轉換價格,下次轉換價格生效日期,
 *      最近賣回權起日,最近賣回權迄日,最近賣回權價格,強制贖回起日,強制贖回迄日,
 *      強制贖回價格,終止櫃檯買賣日,原始發行總額,上月底發行餘額,
 *      轉債參考價格,轉換標的股票價格,停止交易起日,停止交易迄日,票面利率
 *    → 單一檔案同時含「CB 收市價（轉債參考價格）」「現行轉換價（轉換價格）」
 *      「標的股價（轉換標的股票價格）」，故自產溢價率排序只需 2 次請求，不必逐檔。
 *
 * ── 計算（實測對齊實站 30/30，含排序位置）────────────────────────────────────
 *    轉換價值 = 轉換標的股票價格 × 100 ÷ 轉換價格      （每 100 元面額）
 *    折價率%  = (轉債參考價格 ÷ 轉換價值 − 1) × 100
 *    升冪排序取前 30；缺任一價或除零者剔除。
 *    實例：629010 良維十（轉換價 74.4、標的股價 274.00、CB 收市價 335.00）
 *          → 轉換價值 368.28、折價率 -9.04%（與實站顯示逐字一致）
 *
 * ── 編碼 ─────────────────────────────────────────────────────────────────────
 *  CSV 為 BIG5。已實測 `new TextDecoder('big5')` 可用：
 *    - 本機 workerd（wrangler 4.107.0，compatibility_date 2026-06-01）：
 *      探測 [0xA5,0x78] → 「台」✅
 *    - Node v22.22.2：探測 [0xA5,0x78] → 「台」✅
 *  若某 runtime 不支援 big5 而退回 latin1，中文名會失去 CJK → 自動改用 ISSBD5 的
 *  ShortName 補名（見 resolveName）。數字欄全為 ASCII，兩種解碼皆正確。
 *  ★ 金額欄含千分位逗號（如 "8,000,000,000"），故仍走標準 CSV 引號解析，
 *    不可直接 split(',')。
 *
 * ── 誠實分工（業主明示原則）──────────────────────────────────────────────────
 *   ✅ items（轉換溢價率排序）：TPEX 公開檔案自產，本站可稽核、可重算。
 *   ✅ put_schedule（賣回權時程）／calendar：ISSBD5 自產。
 *   ❌ 本 route 未借用任何實站快照。
 *
 * 失敗處理：
 *   - ISSBD5 失敗 → 502 { ok:false, error:'cb_upstream_error' }。
 *   - 日行情清單／CSV 失敗 → 仍回 200，items 為空並附 items_unavailable_reason
 *     （不影響 put_schedule / calendar；絕不用 0 或假數字湊排序）。
 * 架構照抄 src/app/api/skynet/t86/route.ts：8s timeout、AbortController、try/catch。
 */

import { NextResponse } from 'next/server';

/** 櫃買中心站台 origin。 */
const TPEX_ORIGIN = 'https://www.tpex.org.tw';
/** ① 轉(交)換債發行資料下載（TPEX 免費 OpenAPI，免金鑰）。 */
const TPEX_CB_ISSUANCE_URL = `${TPEX_ORIGIN}/openapi/v1/bond_ISSBD5_data`;
/** ② 轉(交)換債日統計報表檔案清單。 */
const TPEX_CB_DAILY_LIST_URL = `${TPEX_ORIGIN}/www/zh-tw/bond/cbDaily`;
/** ② 的必要參數：轉換公司債資訊看板。 */
const CB_DAILY_FILE_CODE = 'cbdrs001';
/** 上游 fetch 超時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 排序取前 N 筆（對齊實站 30 列）。 */
const TOP_N = 30;
/** 誠實註記（對齊實站 note 語意）。 */
const HONEST_NOTE =
  '轉換溢價率＝可轉債市價相對轉換價值的差異。負值只表示公式差異，尚未計入流動性、借券、閉鎖期、稅費與成交限制，不代表存在可執行交易。賣回時程為公開時程表。';
/** 轉換溢價率排序無法產生時的原因（前端據此誠實說明）。 */
const ITEMS_UNAVAILABLE_REASON =
  '櫃買中心 CB 日行情檔（cbdrs001）暫時無法取得，故本次不提供轉換溢價率排序。';

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

/**
 * 轉換溢價率排序單列（對齊實站 items[] schema）。
 * 全部由 TPEX CB 日行情檔（cbdrs001）自產。
 * 註：`due_date` 取自 CSV「轉換迄日」（實站該列標示「到期」，值等於轉換迄日）。
 */
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
  /** 為何 items 為空（誠實說明，前端顯示用；有資料時為空字串）。 */
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

/** 取台北時區（UTC+8）的今日年月日。 */
function taipeiToday(): { y: number; m: number } {
  const t = new Date(Date.now() + 8 * 3_600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

/**
 * 候選查詢月份（`YYYY/MM/01`）：本月 → 上月 → 上上月。
 * 上游 date 為月粒度；月初尚未發布當月檔案時需往前找，故最多試 3 個月。
 */
function monthCandidates(): string[] {
  const { y, m } = taipeiToday();
  const out: string[] = [];
  for (let back = 0; back < 3; back += 1) {
    const total = y * 12 + (m - 1) - back;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    out.push(`${yy}/${String(mm).padStart(2, '0')}/01`);
  }
  return out;
}

/** 民國 `115/09/24` → `2026-09-24`；格式不符 → 空字串。 */
function rocSlashToIso(raw: string): string {
  const m = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(str(raw));
  if (!m) return '';
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

/** 西元 `2028/05/13` → `2028-05`（實站「到期」欄口徑）；格式不符 → 空字串。 */
function toYearMonth(raw: string): string {
  const m = /^(\d{4})\/(\d{2})\/\d{2}$/.exec(str(raw));
  return m ? `${m[1]}-${m[2]}` : '';
}

/**
 * 解析一行標準 CSV（支援雙引號包裹與 `""` 轉義）。
 * 金額欄含千分位逗號，故不可直接 split(',')。
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * 解 CSV 位元組：先用「嚴格 UTF-8」試，失敗才當 BIG5。
 *
 * 為什麼不直接固定 BIG5：現行上游確實是 BIG5，但若上游哪天改餵 UTF-8，
 * 直接 big5 解碼會把中文欄位名（債券代碼／轉債參考價格／轉換標的股票價格）
 * 全部解成亂碼 → 欄位對不上 → 每列被剔除 → 靜默變成空資料，且只會顯示
 * 「暫時無法取得」這種看不出真正原因的訊息。改為先試 UTF-8（fatal）即可
 * 兩種編碼都正確；BIG5 位元組幾乎必然是非法 UTF-8，會如預期丟出例外。
 *
 * 實測 `new TextDecoder('big5')` 在 workerd（compatibility_date 2026-06-01）
 * 與 Node v22 皆可用；兩者皆失敗才退回 latin1（數字欄全為 ASCII，仍可算）。
 */
function decodeCsvBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // 不是 UTF-8 → 依上游現行規格當 BIG5。
  }
  try {
    return new TextDecoder('big5').decode(buf);
  } catch {
    return new TextDecoder('latin1').decode(buf);
  }
}

/** 名稱是否含中日韓漢字（big5 解碼成功才有；latin1 退回時為 false）。 */
function hasCjk(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

/**
 * 由 CB 日行情 CSV 自產轉換溢價率排序。
 * CSV 每列格式：`TYPE,f1,f2,...`（TYPE ∈ TITLE / DATADATE / ALIGN / HEADER / BODY）。
 */
function buildItems(csvText: string, issuanceByCode: Map<string, RawCbIssuance>): CbItem[] {
  let header: string[] | null = null;
  const items: CbItem[] = [];

  for (const line of csvText.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const cells = parseCsvLine(line);
    const type = str(cells[0]);
    if (type === 'HEADER') {
      header = cells.slice(1).map((h) => str(h));
      continue;
    }
    if (type !== 'BODY' || header === null) continue;

    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = str(cells[i + 1]);
    });

    const cbId = row['債券代碼'];
    const cbPrice = toNumOrNull(row['轉債參考價格']);
    const convPrice = toNumOrNull(row['轉換價格']);
    const underlying = toNumOrNull(row['轉換標的股票價格']);
    // 缺任一價或除零者剔除（無法計算轉換價值）。
    if (!cbId || cbPrice === null || convPrice === null || underlying === null || convPrice === 0) {
      continue;
    }

    const convValue = Number(((underlying * 100) / convPrice).toFixed(2));
    if (convValue === 0) continue;

    const csvName = row['債券簡稱'];
    const issuance = issuanceByCode.get(cbId);
    // big5 解碼成功時 CSV 名稱最完整（ISSBD5 缺 5 檔：37083/37084/45641/68731/84732，
    // 其中 3 檔會出現在前 30 名）；解碼失敗（無 CJK）才回退 ISSBD5。
    const name = hasCjk(csvName) ? csvName : str(issuance?.ShortName);

    items.push({
      cb_id: cbId,
      cb_name: name,
      conversion_price: convPrice,
      underlying_price: underlying,
      cb_price: cbPrice,
      conversion_value: convValue,
      premium_pct: Number(((cbPrice / convValue - 1) * 100).toFixed(2)),
      outstanding: toNumOrNull(issuance?.OutstandingAmount),
      coupon_rate: toNumOrNull(row['票面利率']),
      due_date: toYearMonth(row['轉換迄日']),
    });
  }

  return items
    .sort((a, b) => (a.premium_pct ?? 0) - (b.premium_pct ?? 0))
    .slice(0, TOP_N);
}

/**
 * 取最新一份 CB 日行情 CSV 的文字內容。
 * 依候選月份逐月查檔案清單（新→舊），取 `tables[0].data[0][1]` 的路徑下載。
 * 任一階段失敗 → null（呼叫端據此誠實留空 items）。
 */
async function fetchLatestCbDailyCsv(): Promise<string | null> {
  for (const date of monthCandidates()) {
    const url = `${TPEX_CB_DAILY_LIST_URL}?response=json&date=${encodeURIComponent(date)}&fileCode=${CB_DAILY_FILE_CODE}`;
    let listed: unknown;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      listed = await res.json();
    } catch {
      continue;
    }
    const tables = (listed as { tables?: { data?: string[][] }[] })?.tables;
    const rows = Array.isArray(tables) && tables.length > 0 ? tables[0]?.data : undefined;
    const csvPath = Array.isArray(rows) && rows.length > 0 ? str(rows[0]?.[1]) : '';
    if (!csvPath) continue;

    try {
      const res = await fetchWithTimeout(`${TPEX_ORIGIN}${csvPath}`);
      if (!res.ok) continue;
      return decodeCsvBytes(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  return null;
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
  const issuanceByCode = new Map<string, RawCbIssuance>();
  for (const row of listed) {
    issuanceByCode.set(str(row.BondCode), row);
  }

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

  // items：由 TPEX CB 日行情檔（cbdrs001）自產轉換溢價率排序（升冪取前 30）。
  const csvText = await fetchLatestCbDailyCsv();
  const items = csvText === null ? [] : buildItems(csvText, issuanceByCode);

  const body: CbResponse = {
    available: true,
    date: dataDate,
    data_scope: '盤後',
    next_update: '下一交易日盤後',
    items,
    put_schedule,
    calendar,
    note: HONEST_NOTE,
    items_unavailable_reason: items.length > 0 ? '' : ITEMS_UNAVAILABLE_REASON,
    provenance: {
      source: 'self-produced',
      upstream: `${TPEX_CB_ISSUANCE_URL} + ${TPEX_CB_DAILY_LIST_URL}?fileCode=${CB_DAILY_FILE_CODE}`,
    },
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
