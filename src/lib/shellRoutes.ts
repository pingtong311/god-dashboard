/**
 * 全站「外殼路由表」—— 三個外殼元件共用同一份判定，避免各自維護前綴而漂移。
 *
 *   <Navigation />      頂部 site-header      → 只在 'guest' 顯示
 *   <MobileTaskbar />   未登入態底部列（5 欄） → 只在 'guest' 顯示
 *   <AppTabBar />       峰子 App 底部功能列    → 只在 'app'   顯示
 *
 * ── 博主站上的三種頁面外殼（實測自 extracted/site/ 本地快取）──
 *
 * A. 'guest' — App 版面，**有** site-header + mobile-taskbar（aria-label="手機導覽（未登入）"）
 *      /                     home.html
 *      /learn                learn-index.html   ← 注意：索引頁有外殼
 *      /school /guide /manual /about /pricing /methodology /legal /app /login
 *
 * B. 'none' — SEO 版面，**兩者皆無**（無 site-header、無 <nav>、無 mobile-taskbar）
 *      /learn/<slug>         416 篇，`grep -l site-header learn/*.html` = 0
 *      /s/<ticker>           例 s2330.html，同為 0
 *      這兩者是給搜尋引擎與免登入訪客的純內容頁。
 *
 * C. 'app' — 博主登入後才有的 App 主體畫面（/today/ /picks/ …）。
 *      該批路由在博主站上是登入閘門後的 SPA（SSR 只吐「正在載入你的資料…」），
 *      內容無法抓取；峰子以自建的 App 主分頁 + <AppTabBar /> 接手。
 *
 * ⚠ 判別依據是「該頁有沒有渲染 site-header / mobile-taskbar」，**不是** `lang` 屬性。
 *   416 篇文章的 lang 其實是 `zh-Hant`（與有外殼的 App 版面相同），
 *   而無外殼的 s2330.html 才是 `zh-Hant-TW`。`lang` 無法用來判別。
 */

/** 頁面外殼種類。 */
export type ShellKind =
  /** 未登入態：頂部 site-header + 底部 5 欄 mobile-taskbar。 */
  | 'guest'
  /** 峰子 App 主分頁：僅底部 AppTabBar。 */
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
 * 峰子 App 主分頁前綴（含子路徑）。
 * 這些頁面不顯示網站 header —— 依博主設計，App 主體不應出現網站外殼。
 */
const APP_PREFIXES: readonly string[] = [
  '/diary',
  '/radar',
  '/review',
  '/chart',
  '/ai',
  '/sim',
  '/watchlist',
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

  // 3) 峰子 App 主分頁（含子路徑）。
  if (APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return 'app';
  }

  // 4) 未登入態頁面。
  if (GUEST_EXACT.includes(path)) {
    return 'guest';
  }

  // 5) 其餘（例如 /settings 等尚未複刻的頁面）一律當作未登入態，
  //    確保任何新頁面至少有一條可用的導覽，不會出現「無外殼孤島」。
  return 'guest';
}

/** 是否顯示頂部 site-header（未登入態）。 */
export function shouldShowHeader(pathname: string): boolean {
  return resolveShell(pathname) === 'guest';
}

/** 是否顯示未登入態底部列（5 欄）。 */
export function shouldShowMobileTaskbar(pathname: string): boolean {
  return resolveShell(pathname) === 'guest';
}

/** 是否顯示峰子 App 底部功能列。 */
export function shouldShowAppTabBar(pathname: string): boolean {
  return resolveShell(pathname) === 'app';
}
