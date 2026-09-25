import {
  resolveShell,
  hasShell,
  shouldShowHeader,
  shouldShowSiteFooter,
  shouldShowBottomTabBar,
  resolveTabbarVariant,
} from '@/lib/shellRoutes';

/**
 * 外殼路由表測試。
 *
 * 每一條斷言都對應登入前後實站抓取（https://blackstockai.com）的實測結果，
 * 用來防止「多個外殼元件各自維護前綴」而漂移。
 *
 * ★ 本次關鍵修正：登入後的頁面（'app'）**同樣有** site-header 與 site-footer，
 *   故 shouldShowHeader / shouldShowSiteFooter 對 guest 與 app 都要回 true。
 *   舊版把 'app' 當成「無 site-header」，是錯誤架構。
 */
describe('shellRoutes — 外殼判定', () => {
  describe('guest：未登入態（有 site-header + 5 欄 mobile-taskbar + site-footer）', () => {
    // 這些路徑逐一對應 extracted/site/ 內 site-header=1 且 mobile-taskbar=1 的檔案。
    const guestPaths: Array<[string, string]> = [
      ['/', 'home.html'],
      ['/learn', 'learn-index.html'],
      ['/learn/', 'learn-index.html（帶結尾斜線）'],
      ['/school', 'school.html'],
      ['/guide', 'guide.html'],
      ['/manual', 'manual.html'],
      ['/about', 'about.html'],
      ['/pricing', 'pricing.html'],
      ['/methodology', 'methodology.html'],
      ['/legal', 'legal.html'],
      ['/app', 'app.html'],
      ['/login', 'login.html'],
    ];

    it.each(guestPaths)('%s → guest（對應 %s）', (pathname) => {
      expect(resolveShell(pathname)).toBe('guest');
      expect(hasShell(pathname)).toBe(true);
      expect(shouldShowHeader(pathname)).toBe(true);
      expect(shouldShowSiteFooter(pathname)).toBe(true);
      expect(shouldShowBottomTabBar(pathname)).toBe(true);
      // 未登入時底部列採訪客態。
      expect(resolveTabbarVariant(false, pathname)).toBe('guest');
      // 登入後，即使是 guest 路由（/home /learn …）也改用會員態（實站實測）。
      expect(resolveTabbarVariant(true, pathname)).toBe('member');
    });
  });

  describe('app：登入後頁面（同樣有 site-header + site-footer，僅底部列換會員態）', () => {
    // 實站登入後 Playwright 抓取的頂層路由 + 峰子自有登入後頁面。
    const appPaths = [
      '/today',
      '/market',
      '/stock',
      '/brokers',
      '/member',
      '/radar',
      '/settings',
      '/community',
      '/live',
      '/diary',
      '/review',
      '/chart',
      '/ai',
      '/sim',
    ];

    it.each(appPaths)('%s → app（★ 仍有 site-header 與 site-footer）', (pathname) => {
      expect(resolveShell(pathname)).toBe('app');
      expect(hasShell(pathname)).toBe(true);
      // ★ 本次修正重點：登入後頁面照樣有 header / footer。
      expect(shouldShowHeader(pathname)).toBe(true);
      expect(shouldShowSiteFooter(pathname)).toBe(true);
      expect(shouldShowBottomTabBar(pathname)).toBe(true);
      // 登入後路由一律採會員態（即使登入態尚未就緒）。
      expect(resolveTabbarVariant(false, pathname)).toBe('member');
      expect(resolveTabbarVariant(true, pathname)).toBe('member');
    });

    it('/chips/<代號>、/stock/<代號> 動態子路徑也是 app', () => {
      expect(resolveShell('/chips/2330')).toBe('app');
      expect(resolveShell('/stock/2330')).toBe('app');
      expect(shouldShowHeader('/chips/2330')).toBe(true);
      expect(shouldShowSiteFooter('/chips/2330')).toBe(true);
      expect(shouldShowBottomTabBar('/chips/2330')).toBe(true);
    });

    it('/market-center 這種帶連字號的長前綴不與 /market 混淆', () => {
      expect(resolveShell('/market-center')).toBe('app');
      expect(resolveShell('/market')).toBe('app');
    });

    it('未知路徑回退為 guest，確保不會出現「無外殼孤島」', () => {
      expect(resolveShell('/some/unknown/page')).toBe('guest');
      expect(shouldShowHeader('/some/unknown/page')).toBe(true);
    });
  });

  describe('none：完全無外殼（SEO 文章 / 個股落地頁 / 靜態法遵頁）', () => {
    it('/learn/<slug> 沒有外殼（416 篇文章實測 site-header=0）', () => {
      const slug = '/learn/2330-chips-explained';
      expect(resolveShell(slug)).toBe('none');
      expect(hasShell(slug)).toBe(false);
      expect(shouldShowHeader(slug)).toBe(false);
      expect(shouldShowSiteFooter(slug)).toBe(false);
      expect(shouldShowBottomTabBar(slug)).toBe(false);
    });

    it('/s/<ticker> 沒有外殼（s2330.html 實測 site-header=0）', () => {
      const ticker = '/s/2330';
      expect(resolveShell(ticker)).toBe('none');
      expect(shouldShowHeader(ticker)).toBe(false);
      expect(shouldShowSiteFooter(ticker)).toBe(false);
      expect(shouldShowBottomTabBar(ticker)).toBe(false);
    });

    it('巢狀更深的子路徑同樣沒有外殼', () => {
      expect(resolveShell('/learn/a/b/c')).toBe('none');
      expect(resolveShell('/s/2330/')).toBe('none');
    });

    // 博主把這兩頁做成獨立靜態 .html，不經 App 版面（實測 site-header=0、mobile-taskbar=0）。
    it.each(['/privacy', '/terms', '/privacy/', '/terms/'])(
      '%s 是無外殼的獨立靜態頁',
      (pathname) => {
        expect(resolveShell(pathname)).toBe('none');
        expect(shouldShowHeader(pathname)).toBe(false);
        expect(shouldShowSiteFooter(pathname)).toBe(false);
        expect(shouldShowBottomTabBar(pathname)).toBe(false);
      },
    );
  });

  describe('★ 回歸：/learn 索引本身必須是 guest', () => {
    // 修復前的缺陷是「/learn 整個前綴都被隱藏」，
    // 導致 /learn 索引頁（learn-index.html，實測有外殼）被誤判成 SEO 版面而少了 header。
    it('不可被 /learn/<slug> 的規則誤傷', () => {
      expect(resolveShell('/learn')).toBe('guest');
      expect(resolveShell('/learn/')).toBe('guest');
      expect(shouldShowHeader('/learn')).toBe(true);
      expect(shouldShowSiteFooter('/learn')).toBe(true);
      expect(shouldShowBottomTabBar('/learn')).toBe(true);
    });
  });

  describe('邊界：路徑正規化與前綴誤判', () => {
    it('空字串與根路徑等價', () => {
      expect(resolveShell('')).toBe('guest');
      expect(resolveShell('/')).toBe('guest');
    });

    it('多重結尾斜線不影響判定', () => {
      expect(resolveShell('/school///')).toBe('guest');
      expect(resolveShell('/learn//')).toBe('guest');
      expect(resolveShell('/today//')).toBe('app');
    });

    it('相似但不相同的前綴不誤判', () => {
      // /s 是 SEO 子路徑前綴，但不該吃掉 /school /settings /sim /stock。
      expect(resolveShell('/school')).toBe('guest');
      expect(resolveShell('/settings')).toBe('app');
      expect(resolveShell('/sim')).toBe('app');
      expect(resolveShell('/stock')).toBe('app');
      // /learn-x 不是 /learn 的子路徑。
      expect(resolveShell('/learn-x')).toBe('guest');
      // /login 是 guest，不會被 /live 吃掉。
      expect(resolveShell('/login')).toBe('guest');
      expect(resolveShell('/live')).toBe('app');
    });
  });

  describe('resolveTabbarVariant — 底部列型態的單一事實來源', () => {
    it('未登入且非登入後路由 → guest', () => {
      expect(resolveTabbarVariant(false, '/')).toBe('guest');
      expect(resolveTabbarVariant(false, '/school')).toBe('guest');
    });

    it('已登入 → member（任何路由，實站實測）', () => {
      expect(resolveTabbarVariant(true, '/')).toBe('member');
      expect(resolveTabbarVariant(true, '/learn')).toBe('member');
    });

    it('登入後路由即使未登入也回 member（避免 /stock 出現訪客列）', () => {
      expect(resolveTabbarVariant(false, '/stock')).toBe('member');
      expect(resolveTabbarVariant(false, '/today')).toBe('member');
    });

    it('省略 pathname 時仍可運作（僅依登入狀態）', () => {
      expect(resolveTabbarVariant(false)).toBe('guest');
      expect(resolveTabbarVariant(true)).toBe('member');
    });
  });
});
