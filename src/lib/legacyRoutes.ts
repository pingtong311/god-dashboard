/**
 * 博主站路由 → 峰子路由 對照表
 * ----------------------------------------------------------------------------
 * 背景：複刻博主的網頁／App 時，文章與學堂內文的 CTA 按鈕指向博主自己的路由
 *       （例如「前往 今日戰情 →」→ `/today/`）。本檔曾是「博主 href → 峰子舊 href」
 *       的轉譯層；如今 44 個實站路由已全部以**實站權威路徑**建置完成
 *       （見 src/lib/hubTools.ts），本檔對已知路由一律回傳 **identity**，
 *       只剩少數部落格內文出現、但 hub 清單沒有的路由需要權宜對應。
 *
 * 原則：
 *   1. CTA 的「文字」一律保留博主原文（不可改寫）。
 *   2. 只轉換 href。`exact: true` 表示語意等價；`exact: false` 表示權宜對應。
 *   3. 查不到對照時 fallback 至首頁 `/`，確保不 404。
 */

import { HUB_TOOLS } from './hubTools';

/** 峰子既有路由（hub 權威清單 + 峰子自有頁面）。 */
export const PEAK_ROUTES = [
  '/',
  '/today',
  '/live',
  '/reports',
  '/sector',
  '/radar',
  '/market',
  '/market-center',
  '/trump',
  '/futures-opt',
  '/stock',
  '/signal',
  '/ranking',
  '/brokers',
  '/backtest',
  '/research',
  '/picks',
  '/fade',
  '/patterns',
  '/swing',
  '/tools',
  '/valuation',
  '/leverage',
  '/dividend',
  '/risk',
  '/margin-maint',
  '/etf-active',
  '/block-trades',
  '/cb',
  '/watchlist',
  '/alerts',
  '/portfolio',
  '/notify',
  '/member',
  '/app',
  '/partners',
  '/community',
  '/ask',
  '/dojo',
  '/guess',
  '/learn',
  '/school',
  '/guide',
  '/manual',
  '/hub',
  '/legal',
  // ── 峰子自有頁面（不在實站 hub 清單，但確實存在）──────────────────────
  '/review',
  '/chart',
  '/s',
  '/chips',
  '/settings',
] as const;

export interface RouteMapping {
  /** 峰子對應路由；null = 無對應，將 fallback。 */
  target: string | null;
  /** true = 語意等價；false = 權宜對應。 */
  exact: boolean;
  /** 博主原畫面的中文名稱（供除錯與盤點用）。 */
  label: string;
}

/** 精確前綴（含萬用字元）優先於固定表。 */
const PREFIX_MAPPINGS: ReadonlyArray<[string, RouteMapping]> = [
  ['/learn/', { target: '/learn', exact: true, label: '文章' }],
  ['/school/', { target: '/school', exact: true, label: '學堂' }],
];

/**
 * 實站 hub 權威路由（44 條）＋首頁：全部 identity。
 * 來源：src/lib/hubTools.ts 的 HUB_TOOLS（單一來源，避免漂移）。
 */
const EXACT_MAPPINGS: Record<string, RouteMapping> = {
  '/': { target: '/', exact: true, label: '首頁' },
  ...HUB_TOOLS.reduce<Record<string, RouteMapping>>((acc, tool) => {
    acc[tool.href] = { target: tool.href.replace(/\/$/, ''), exact: true, label: tool.title };
    return acc;
  }, {}),
};

/** 權宜對應：hub 清單沒有、但部落格內文 CTA 會出現的路由。 */
const APPROX_MAPPINGS: Record<string, RouteMapping> = {
  '/industry/': { target: '/sector', exact: false, label: '產業地圖' },
};

const FALLBACK = '/';

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
 * 將博主的 href 轉為站內可用的 href。
 *
 * @example resolveLegacyHref('/today/')            // '/today'
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
    return { href: exact.target + (query || '') + (hash || ''), mapping: exact };
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
