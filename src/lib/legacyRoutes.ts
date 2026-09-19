/**
 * 博主站路由 → 峰子路由 對照表
 * ----------------------------------------------------------------------------
 * 背景：複刻博主的網頁／App 時，文章與學堂內文的 CTA 按鈕指向博主自己的路由
 *       （例如「前往 今日戰情 →」→ `/today/`）。這些路由在峰子尚未逐一實作，
 *       若直接沿用會 404。本檔為唯一的對照來源，供 /school、/learn 等頁面共用。
 *
 * 原則：
 *   1. CTA 的「文字」一律保留博主原文（不可改寫）。
 *   2. 只轉換 href。`exact: true` 表示語意等價；`exact: false` 表示權宜對應，
 *      待 P3 實作對應畫面後應改為 exact。
 *   3. 查不到對照時 fallback 至 `/diary`（App 首頁分頁），確保不 404。
 *
 * 待辦（P3）：博主的已登入畫面清單見下表；目前峰子僅有 9 條路由。
 *   /today/ /picks/ /patterns/ /signal/ /market/ /leverage/ /fade/ /risk/
 *   /reports/ /notify/ /industry/ /sector/ /alerts/ /valuation/ /ranking/
 *   /swing/ /dividend/ /cb/ /margin-maint/ /radar/ /watchlist/ /ask/ /dojo/
 *   /stock/ /learn/ /school/
 */

/** 峰子既有路由（僅這 9 條是真的存在）。 */
export const PEAK_ROUTES = [
  '/',
  '/diary',
  '/radar',
  '/review',
  '/chart',
  '/ai',
  '/sim',
  '/watchlist',
  '/chips',
  '/s',
  '/learn',
  '/school',
] as const;

export interface RouteMapping {
  /** 峰子對應路由；null = 無對應，將 fallback。 */
  target: string | null;
  /** true = 語意等價；false = 權宜對應，P3 需重做。 */
  exact: boolean;
  /** 博主原畫面的中文名稱（供除錯與 P3 盤點用）。 */
  label: string;
}

/** 精確前綴（含萬用字元）優先於固定表。 */
const PREFIX_MAPPINGS: Array<[string, RouteMapping]> = [
  ['/learn/', { target: '/learn', exact: true, label: '文章' }],
  ['/school/', { target: '/school', exact: true, label: '學堂' }],
];

const EXACT_MAPPINGS: Record<string, RouteMapping> = {
  '/': { target: '/', exact: true, label: '首頁' },
  '/radar/': { target: '/radar', exact: true, label: '事件雷達' },
  '/watchlist/': { target: '/watchlist', exact: true, label: '自選股' },
  '/ask/': { target: '/ai', exact: true, label: '問 AI' },
  '/dojo/': { target: '/sim', exact: true, label: '練功房' },
};

/** 權宜對應：語意相近但峰子尚無對應畫面。 */
const APPROX_MAPPINGS: Record<string, RouteMapping> = {
  '/today/': { target: '/diary', exact: false, label: '今日戰情' },
  '/market/': { target: '/diary', exact: false, label: '大盤環境' },
  '/industry/': { target: '/diary', exact: false, label: '產業地圖' },
  '/sector/': { target: '/diary', exact: false, label: '族群熱圖' },
  '/picks/': { target: '/radar', exact: false, label: '量價觀察' },
  '/signal/': { target: '/radar', exact: false, label: '技術分析' },
  '/fade/': { target: '/radar', exact: false, label: '隔日沖分點股' },
  '/risk/': { target: '/review', exact: false, label: '風險雷達' },
  '/reports/': { target: '/review', exact: false, label: '台股日報' },
  '/notify/': { target: '/review', exact: false, label: '戰情室警報' },
  '/alerts/': { target: '/review', exact: false, label: '到價提醒' },
  '/ranking/': { target: '/chips/2330', exact: false, label: '分點排行' },
  '/swing/': { target: '/chips/2330', exact: false, label: '波段·大戶籌碼' },
  '/leverage/': { target: '/chips/2330', exact: false, label: '資券·借券' },
  '/margin-maint/': { target: '/chips/2330', exact: false, label: '融資維持率' },
  '/valuation/': { target: '/s/2330', exact: false, label: '估值情境器' },
  '/dividend/': { target: '/s/2330', exact: false, label: '除權息行事曆' },
  '/cb/': { target: '/s/2330', exact: false, label: '可轉債套利' },
  '/patterns/': { target: '/chart', exact: false, label: '技術形態掃描' },
  '/stock/': { target: '/s/2330', exact: false, label: '個股盯盤' },
};

const FALLBACK = '/diary';

/** 去尾斜線、拆 query 後正規化。 */
function normalize(href: string): { path: string; query: string; hash: string } {
  const hashIdx = href.indexOf('#');
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
  const noHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const qIdx = noHash.indexOf('?');
  const query = qIdx >= 0 ? noHash.slice(qIdx) : '';
  const raw = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const path = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return { path, query, hash };
}

/** 從 `/stock/?id=2330` 取出 `2330`。 */
function tickerFromQuery(query: string): string | null {
  const m = /[?&]id=([^&]+)/.exec(query);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * 將博主的 href 轉為峰子可用的 href。
 *
 * @example resolveLegacyHref('/today/')            // '/diary'
 * @example resolveLegacyHref('/stock/?id=2330')    // '/s/2330'
 * @example resolveLegacyHref('/learn/w-bottom/')   // '/learn/w-bottom'
 */
export function resolveLegacyHref(href: string): string {
  return resolveLegacyRoute(href).href;
}

/** 同 resolveLegacyHref，但一併回傳對應品質資訊。 */
export function resolveLegacyRoute(href: string): { href: string; mapping: RouteMapping } {
  const { path, query, hash } = normalize(href);

  // 個股頁：/stock/?id=2330 → /s/2330
  if (path === '/stock') {
    const ticker = tickerFromQuery(query);
    if (ticker) {
      return { href: `/s/${ticker}`, mapping: { target: '/s', exact: false, label: '個股盯盤' } };
    }
    return { href: FALLBACK, mapping: APPROX_MAPPINGS['/stock/'] };
  }

  for (const [prefix, mapping] of PREFIX_MAPPINGS) {
    // prefix 以 '/' 結尾（如 '/learn/'）；normalize 已去尾斜線，故需同時比對
    // 去斜線後的根路徑（'/learn/' → '/learn'），否則 /learn/、/school/ 會誤落 fallback。
    const root = prefix.slice(0, -1);
    if (path === root || path.startsWith(prefix)) {
      return { href: path, mapping };
    }
  }

  const key = path === '/' ? '/' : `${path}/`;
  const exact = EXACT_MAPPINGS[key];
  if (exact?.target) {
    return { href: exact.target, mapping: exact };
  }

  const approx = APPROX_MAPPINGS[key];
  if (approx?.target) {
    return { href: approx.target, mapping: approx };
  }

  return {
    href: FALLBACK,
    mapping: { target: null, exact: false, label: `未對照（${href}）` },
  };
}

/** 供 /school、/learn 的「延伸閱讀」等處判斷連結是否為站內。 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}
