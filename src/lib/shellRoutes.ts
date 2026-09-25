/**
 * 全站「外殼路由表」—— 所有外殼元件共用同一份判定，避免各自維護前綴而漂移。
 *
 *   <Navigation />     頂部 site-header   → guest 與 app 皆顯示（none 隱藏）
 *   <ComplianceBar />  頂部法遵條         → guest 與 app 皆顯示（none 隱藏）
 *   <SiteFooter />     頁尾免責聲明       → guest 與 app 皆顯示（none 隱藏）
 *   <BottomTabBar />   底部固定列（5 欄） → guest 與 app 皆顯示（none 隱藏）
 *
 * ── 實測後的架構真相（登入前後完整抓取 https://blackstockai.com）──
 *
 * 博主站上**只有一套外殼**。登入前後的差別**僅在底部列的五個項目**，
 * 以及頂部 header 的內容（guest 為「文章／學堂／關於／登入」，
 * 登入後為「今天／股票／選股…」下拉選單）。外殼的有無完全一致：
 *
 *   A. 'guest' — 未登入態外殼。有 site-header + mobile-taskbar
 *                （aria-label="手機導覽（未登入）"）+ site-footer + compliance-bar。
 *      /  /learn  /school  /guide  /manual  /about  /pricing  /methodology
 *      /legal  /app  /login
 *      （★ /learn 索引本身**有**外殼；只有 /learn/<slug> 才是無外殼。）
 *
 *   B. 'app'   — 登入態外殼。**同樣有** site-header + site-footer + compliance-bar，
 *                差別只在底部列換成會員態（aria-label="手機主要導覽"，5 項：
 *                /today/ 戰情、/market/ 市場、/stock/ 個股、/brokers/ 籌碼、/member/ 我的）。
 *      /today  /market  /stock  /brokers  /member  /live  /reports  … 共 40 條實站路由，
 *      外加峰子自有的登入後頁面（/diary /review /chart /ai /sim /chips）。
 *
 *   C. 'none'  — 完全沒有導覽外殼（無 site-header、無 mobile-taskbar、無 site-footer）。
 *      /learn/<slug>   SEO 文章頁
 *      /s/<ticker>     SEO 個股落地頁
 *      /privacy  /terms  獨立靜態頁
 *
 * ⚠ 關鍵修正（本次）：舊版把 'app' 定義成「無 site-header，只顯示 AppTabBar」，
 *   **是錯的**。實測登入後 10 個頁面（/today/ /market/ /stock/ /brokers/ /member/
 *   /settings/ /community/ …）**全部都有 site-header 與 site-footer**。
 *   故 shouldShowHeader / shouldShowSiteFooter 對 guest 與 app **都要回 true**。
 *
 * ⚠ 判別依據是「該頁有沒有渲染 site-header / mobile-taskbar」，**不是** `lang` 屬性。
 *   416 篇文章的 lang 其實是 `zh-Hant`（與有外殼的 App 版面相同），
 *   而無外殼的 s2330.html 才是 `zh-Hant-TW`。`lang` 無法用來判別。
 */

/** 頁面外殼種類。 */
export type ShellKind =
  /** 未登入態：頂部 site-header + 底部 5 欄 mobile-taskbar（guest 版）+ site-footer。 */
  | 'guest'
  /** 登入態：同樣有 site-header + site-footer，底部列換成會員態 5 欄。 */
  | 'app'
  /** 純內容頁：完全沒有導覽外殼。 */
  | 'none';

/**
 * 未登入態頁面（含 `/learn` 索引本身）。
 * 逐項對應 extracted/site/ 內 site-header=1 且 mobile-taskbar=1 的檔案。
 */
const GUEST_EXACT: readonly string[] = [
  '/',
  '/learn',
  '/school',
  '/guide',
  '/manual',
  '/about',
  '/pricing',
  '/methodology',
  '/legal',
  '/app',
  '/login',
];

/**
 * 登入態頁面前綴（含子路徑）。
 * 來源：登入後 Playwright 抓取的 51 條路由清單（全為登入後頁面），
 * 再加上峰子自有的登入後頁面（/diary /review /chart /ai /sim /chips）。
 * 這些頁面**仍會顯示** site-header 與 site-footer，只是底部列改用會員態。
 */
const APP_PREFIXES: readonly string[] = [
  // ── 實站登入後路由（51 條清單中的頂層前綴）─────────────────────────────
  '/today',
  '/market',
  '/stock',
  '/brokers',
  '/member',
  '/live',
  '/reports',
  '/sector',
  '/radar',
  '/market-center',
  '/trump',
  '/futures-opt',
  '/signal',
  '/valuation',
  '/research',
  '/picks',
  '/patterns',
  '/swing',
  '/tools',
  '/risk',
  '/dividend',
  '/etf-active',
  '/cb',
  '/ranking',
  '/backtest',
  '/fade',
  '/leverage',
  '/margin-maint',
  '/block-trades',
  '/hub',
  '/watchlist',
  '/portfolio',
  '/alerts',
  '/notify',
  '/community',
  '/partners',
  '/ask',
  '/dojo',
  '/guess',
  '/settings',
  // ── 峰子自有的登入後頁面（保留於此，避免既有頁面突然變成 guest）────────
  '/diary',
  '/review',
  '/chart',
  '/ai',
  '/sim',
  '/chips',
];

/**
 * 只在**子路徑**才算 SEO 版面的前綴（自身仍屬 'guest'）。
 * 這是 `/learn` 與 `/s` 的關鍵差異：`/learn` 索引有外殼，`/learn/<slug>` 沒有。
 */
const SEO_SUBPATH_PREFIXES: readonly string[] = ['/learn', '/s'];

/**
 * 完全沒有外殼的**根層級**頁面（自身即為 SEO 版面）。
 * 博主把這兩頁做成獨立的靜態 .html，不經 Next.js App 版面，
 * 因此連 site-header 都沒有（實測 site-header=0、mobile-taskbar=0）。
 *   /privacy.html → 隱私權政策（14 個 h2 / 24 個 h3）
 *   /terms.html   → 服務條款（13 個 h2 / 25 個 h3）
 */
const NO_SHELL_EXACT: readonly string[] = ['/privacy', '/terms'];

/** 去掉結尾斜線（根路徑 `/` 保持不變），讓 `/learn/` 與 `/learn` 視為同一條。 */
function normalize(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * 判定某條路徑屬於哪一種外殼。
 *
 * @param pathname 來自 `usePathname()` 的路徑，可帶或不帶結尾斜線。
 * @returns `'guest'` | `'app'` | `'none'`
 */
export function resolveShell(pathname: string): ShellKind {
  const path = normalize(pathname);

  // 1) 完全無外殼的根層級頁面（隱私權政策 / 服務條款）。
  if (NO_SHELL_EXACT.includes(path)) {
    return 'none';
  }

  // 2) SEO 子路徑 —— /learn/<slug>、/s/<ticker> 完全無外殼。
  if (SEO_SUBPATH_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`))) {
    return 'none';
  }

  // 3) 登入態頁面（含子路徑）。
  if (APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return 'app';
  }

  // 4) 未登入態頁面。
  if (GUEST_EXACT.includes(path)) {
    return 'guest';
  }

  // 5) 其餘（例如尚未複刻的頁面）一律當作未登入態，
  //    確保任何新頁面至少有一條可用的導覽，不會出現「無外殼孤島」。
  return 'guest';
}

/**
 * 是否屬於「有外殼」的頁面（guest 或 app）。
 * 這是 header / footer / 底部列三者的共同前提：只有 'none' 才完全沒有外殼。
 */
export function hasShell(pathname: string): boolean {
  return resolveShell(pathname) !== 'none';
}

/**
 * 是否顯示頂部 site-header。
 * 實測：guest 與 app（登入後）**都有** site-header，故兩者皆回 true。
 */
export function shouldShowHeader(pathname: string): boolean {
  return hasShell(pathname);
}

/**
 * 是否顯示頁尾 site-footer。
 * 實測：guest 與 app（登入後）**都有** site-footer，故兩者皆回 true。
 */
export function shouldShowSiteFooter(pathname: string): boolean {
  return hasShell(pathname);
}

/**
 * 是否顯示底部固定列（guest / 會員兩態皆為 5 欄，僅 items 不同）。
 * 實測：guest 與 app（登入後）**都有** mobile-taskbar，故兩者皆回 true。
 */
export function shouldShowBottomTabBar(pathname: string): boolean {
  return hasShell(pathname);
}

/** 底部列型態：guest（未登入 5 項）或 member（登入後 5 項）。 */
export type TabbarVariant = 'guest' | 'member';

/**
 * 是否屬於「會員態外殼」（登入後）—— 供底部列（決定 items）與頂部 header
 * （決定內容）共用的單一事實來源，確保兩者永遠一致。
 *
 * 實站實測：**登入後所有頁面**（含 `/home` `/learn` `/school` 等 guest 路由）
 * 一律顯示會員態（底部列 5 項 + 會員版 header）；未登入時一律訪客態。
 * 額外保險：登入後路由（`resolveShell(pathname) === 'app'`）本質屬會員區，
 * 即使登入態尚未就緒（`warroom_token` 尚未寫入）也一律視為會員態。
 *
 * ⚠ 妥協說明：峰子目前**尚無真實登入流程**（`/login` 為靜態複刻頁），
 *   故以「登入狀態驅動 + 登入後路由回退」的混合式；待接上真實登入後，
 *   應收斂為「純登入狀態驅動」（移除路徑回退）。
 *
 * @param isLoggedIn 目前是否已登入（client 端由 `warroom_token` 判定）。
 * @param pathname   目前路徑（選填；用於登入後路由的保險判定）。
 */
export function isMemberShell(isLoggedIn: boolean, pathname = ''): boolean {
  if (resolveShell(pathname) === 'app') {
    return true;
  }
  return isLoggedIn;
}

/**
 * 決定底部列該採用哪一組 items —— 全站單一事實來源（委派 isMemberShell）。
 *
 * @param isLoggedIn 目前是否已登入（client 端由 `warroom_token` 判定）。
 * @param pathname   目前路徑（選填；用於登入後路由的保險判定）。
 * @returns `'guest'` | `'member'`
 */
export function resolveTabbarVariant(isLoggedIn: boolean, pathname = ''): TabbarVariant {
  return isMemberShell(isLoggedIn, pathname) ? 'member' : 'guest';
}
