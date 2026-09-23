/**
 * TPEX 上櫃券商分點活躍度（收盤分點資料，spec data-source-matrix §2-D「B3」）
 * GET /api/skynet/channel-broker（?ticker= 可傳但忽略——此端點是「全上櫃市場
 * 當日分點營業金額彙總」，非單股分點資料，不分 ticker）
 *
 * 資料源（單源，免費、免金鑰、OpenAPI JSON）：
 *   https://www.tpex.org.tw/openapi/v1/tpex_daily_broker1
 *   （上櫃各券商分點當日營業金額統計表，約 854 筆，Code/Name 分點層級，
 *   收盤後批次產製 T+0 約 16:10-18:00；**僅分點營業金額彙總，非逐股分點買賣**）
 *
 * ⚠ 誠實定位（spec 裁示，不可省略）：
 * - 回傳 shape 帶固定 note：「僅分點營業金額彙總，非逐股分點買賣」。
 * - 收盤後批次 → 定位「籌碼背景濾網」，非盤中訊號；前端文案須區分。
 * - ticker 參數不適用：route 不依 ticker 過濾，回傳全上櫃當日分點活躍度 top N。
 *   全量逐股分點仍是付費資料（TWSE eshop / FinMind Sponsor），走 §2-B 未入庫路徑。
 *
 * 架構照抄 src/app/api/skynet/futures/route.ts：
 * - 模組層 inflight Map（per-key promise 去重，finally 清空，含 rejected）
 * - in-memory TTL cache：TPEX 日資料收盤批次，30 分鐘 TTL 夠用
 * - redirect:'manual' + AbortSignal.timeout(4000)：3xx 主動攔下不 follow，
 *   20s 掛起被 4s 斷掉走 stale-on-error
 * - stale-on-error：上游失敗但有過期快取 → 回快取快照 + X-Skynet-Stale: true
 * - 失敗結果不寫 cache；全 null 結果不寫 cache（避免鎖住後續重試）
 * - 一律 200 不 5xx（team-lead 慣例，避開 502 的 UI 炸彈）
 * - 純 ASCII header（CF Workers CJK header 會 500）；note（中文）只放 body
 * - 嚴禁 localeCompare（ICU 冷啟動）：tradingAmount 排序用 Number 差值比較
 *
 * 空值防護：TPEX 數值欄皆字串，'-' / 'NULL' / '' / 'nan' 一律轉 null
 * （絕不當 0，否則營業金額會顯示成 0 元偽裝「無交易」）。
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  ChannelBrokerData,
  ChannelBrokerResponse,
  ChannelBrokerRow,
} from '@/types/channelBroker';

/** 精確 URL 常量（比照 futures 慣例：無尾斜線、無 query，避開邊緣快取陷阱）。 */
const TPEX_BROKER1_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_daily_broker1';
/** 上游 fetch 超時：4s（HIT ~0.5s；回源掛起會被 4s 斷掉走 stale-on-error）。 */
const UPSTREAM_TIMEOUT_MS = 4_000;
/** in-memory 快取 TTL：30 分鐘（TPEX 日資料收盤批次，30min 內不會換新日）。 */
const CHANNEL_BROKER_TTL_MS = 30 * 60 * 1000;
/** 回傳 top N（spec 裁示 N=10 合理）。 */
const TOP_N = 10;
/** 誠實註記（固定文案：分點營業金額彙總 ≠ 逐股分點買賣）。 */
const HONEST_NOTE = '僅分點營業金額彙總，非逐股分點買賣';

/** TPEX tpex_daily_broker1 單筆欄位（值皆字串，可能為 '-' / 'NULL' / ''）。 */
type TpxBrokerRow = {
  Date?: string;
  Ranking?: string;
  Code?: string;
  Name?: string;
  TradingAmount?: string;
  DayClosingRatio?: string;
  [key: string]: string | undefined;
};

/** 快取快照（{ ts, data }；data 內 tradingAmount 皆已解析為 number | null）。 */
type BrokerCache = { ts: number; data: ChannelBrokerData };

/**
 * in-flight 去重（全上櫃單一 key，N 個並發請求只觸發 1 次 216KB fetch+parse）。
 * 存「進行中的 fetch Promise」而非結果（resolve 值為 ChannelBrokerData | null），
 * finally 裡清空（含 rejected）。
 */
let inflight: Promise<ChannelBrokerData | null> | null = null;

/** 全上櫃單一 in-memory 快取（TPEX 日資料不分行，一個 key 就夠；in-memory 不寫 KV）。 */
let cached: BrokerCache | null = null;

/** 空值防護：'-' / 'NULL' / '' / 'nan' / 非數字 一律回 null（絕不當 0，不補腦）。 */
function parseNumOrNull(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '' || s === '-' || s.toUpperCase() === 'NULL' || s.toLowerCase() === 'nan') {
    return null;
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** 非空 trimmed 字串 → string（名稱/代號欄；空白視同缺失回 ''，維持 row shape 完整）。 */
function parseText(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const s = String(value).trim();
  return s === '-' ? '' : s;
}

/**
 * ROC 'MMMmmdd'（7 位：3 位民國年 + 2 位月 + 2 位日，TPEX 實測 '1150922'）
 * → AD 'YYYY-MM-DD'；格式異常回 null（不補腦）。
 */
function rocToAdDate(value: string | undefined | null): string | null {
  const s = parseText(value);
  if (!/^\d{7}$/.test(s)) return null;
  // TPEX Date 欄例：'1150922' = 民國 115（AD 2026）-09-22 → '2026-09-22'。
  const rocYear = Number.parseInt(s.slice(0, 3), 10);
  const month = Number.parseInt(s.slice(3, 5), 10);
  const day = Number.parseInt(s.slice(5, 7), 10);
  if (rocYear < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${rocYear + 1911}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 從 TPEX 全表挑 top N（tradingAmount 降序、null 沉底；嚴禁 localeCompare，
 * 用 Number 差值比較零成本）。無任何有效營業金額筆數 → 回 null（不寫 cache）。
 */
function buildBrokerData(raw: TpxBrokerRow[]): ChannelBrokerData | null {
  // 形狀斷言（必需）：在任何欄位讀取之前，擋「200 + 非 array」內容（HTML 阻擋頁等）。
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const rows = raw
    .map((r) => {
      // DayClosingRatio 保持原始字串（如 '7.37%'）；哨兵值（''/'-'）→ null，不補腦。
      const ratio = parseText(r.DayClosingRatio);
      return {
        code: parseText(r.Code),
        name: parseText(r.Name),
        tradingAmount: parseNumOrNull(r.TradingAmount),
        dayClosingRatio: ratio === '' ? null : ratio,
      };
    })
    .filter((r): r is ChannelBrokerRow => r.code !== '' || r.name !== '');

  if (rows.length === 0) return null;

  // 誠實判定：至少一筆 tradingAmount 非 null 才算「有分點活躍度資料」。
  // 全 null（上游回全哨兵值）→ hasBrokerActivity: false + 不寫 cache（交回降級）。
  const hasBrokerActivity = rows.some((r) => r.tradingAmount !== null);

  // 排序：tradingAmount 降序，null 沉底；同值穩定（原始序=上游 Ranking 序）。
  const sorted = [...rows].sort((a, b) => {
    if (a.tradingAmount === null && b.tradingAmount === null) return 0;
    if (a.tradingAmount === null) return 1;
    if (b.tradingAmount === null) return -1;
    return Number(b.tradingAmount) - Number(a.tradingAmount);
  });

  // asOfDate 取表內最常見 Date（批次日）；缺失/null 不補腦。
  const asOfDate =
    raw.length > 0 ? rocToAdDate(raw[0].Date) : null;

  const data: ChannelBrokerData = {
    hasBrokerActivity,
    source: hasBrokerActivity ? 'TPEX tpex_daily_broker1' : null,
    asOfDate: hasBrokerActivity ? asOfDate : null,
    topBrokers: hasBrokerActivity ? sorted.slice(0, TOP_N) : [],
    note: HONEST_NOTE,
  };
  return data;
}

/**
 * 抓 TPEX 全表並解析；網路/DNS/逾時/非 2xx/HTML/非 JSON array 一律回 null。
 * redirect:'manual'（3xx 主動攔下不 follow）+ AbortSignal.timeout(4s)。
 */
async function fetchBrokerRaw(): Promise<ChannelBrokerData | null> {
  let raw: unknown;
  try {
    const res = await fetch(TPEX_BROKER1_URL, {
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null; // 必要但不充分（HTML 200 陷阱靠下方斷言擋）
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('html')) return null; // 阻擋頁（200 + text/html）主動攔下
    raw = await res.json(); // 非 JSON 在此拋 SyntaxError → catch → null
  } catch {
    // Timeout / AbortError / DNS / SyntaxError：一律回 null 交回 stale-on-error。
    return null;
  }
  // 形狀斷言（必需）：擋「200 + 非 array」內容。
  if (!Array.isArray(raw)) return null;
  return buildBrokerData(raw as TpxBrokerRow[]);
}

/** 帶 inflight 去重 + TTL 快取 + stale-on-error 的取資料入口。 */
async function getBrokerData(): Promise<{ data: ChannelBrokerData | null; stale: boolean }> {
  // TTL 快取命中（30min）：直接回快照，CPU ≈ 0。
  if (cached && Date.now() - cached.ts < CHANNEL_BROKER_TTL_MS) {
    return { data: cached.data, stale: false };
  }

  if (inflight) {
    // 命中進行中 promise：直接 await（N 並發只 1 次 fetch）。
    const hit = await inflight;
    if (hit !== null) {
      return { data: hit, stale: false };
    }
    // hit === null：走下方 stale-on-error / 冷啟動失敗判定（與首次抓取同路徑）。
  } else {
    // 未命中：啟動抓取；inflight 去重 + finally 清空（含 rejected）。
    const promise = fetchBrokerRaw().then((data) => {
      // 僅「成功且至少一筆有效」才寫 cache：失敗不污染快取；
      // 全 null 結果不寫 cache（避免把失敗鎖 30min 跳過重試）。
      if (data !== null && data.hasBrokerActivity) {
        cached = { ts: Date.now(), data };
      }
      return data;
    });
    inflight = promise;
    void promise.finally(() => {
      if (inflight === promise) inflight = null; // 只在仍是本條目時清空，避免誤清後續 inflight。
    });
    const result = await promise;
    if (result !== null) {
      return { data: result, stale: false };
    }
  }

  // 上游失敗：stale-on-error 回過期快取快照（前端 X-Skynet-Stale 顯示「前一批次」）。
  if (cached) {
    return { data: cached.data, stale: true };
  }

  // 冷啟動首次失敗：回 null（交回 200 + ok:false，不 5xx）。
  return { data: null, stale: false };
}

/** 回應 header：純 ASCII（CF Workers CJK header 會 500）；note 中文只放 body。 */
function responseHeaders(stale: boolean): Record<string, string> {
  return {
    'Cache-Control': 'public, s-maxage=1800',
    'X-Skynet-Data-Source': 'tpex-broker1',
    ...(stale ? { 'X-Skynet-Stale': 'true' } : {}),
  };
}

/**
 * GET /api/skynet/channel-broker
 * ?ticker= 可傳但**忽略**：此端點是全上櫃市場當日分點營業金額彙總（B3 裁示），
 * 非單股分點資料——不分 ticker、不依 ticker 過濾（誠實：全量逐股分點走 §2-B 付費路徑）。
 *
 * 回 200 + { ok: true, data: ChannelBrokerData }（成功/誠實未入庫皆 ok:true 帶 flag）；
 * 上游失敗且無快取 → 200 + { ok: false, message: 'tpex_broker_unavailable' }，不 5xx。
 * 依專案慣例「唯讀 GET route 不加 guardMutation」。
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const { data, stale } = await getBrokerData();

  if (data === null) {
    // 冷啟動首次失敗且無快取可降級：200 + ok:false，前端顯示「資料未入庫」，不 5xx。
    return NextResponse.json<ChannelBrokerResponse>(
      { ok: false, message: 'tpex_broker_unavailable' },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=1800' } },
    );
  }

  return NextResponse.json<ChannelBrokerResponse>(
    { ok: true, data },
    { status: 200, headers: responseHeaders(stale) },
  );
}
