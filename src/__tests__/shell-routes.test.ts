import {
  resolveShell,
  shouldShowHeader,
  shouldShowMobileTaskbar,
  shouldShowAppTabBar,
} from '@/lib/shellRoutes';

/**
 * 外殼路由表測試。
 *
 * 每一條斷言都對應 extracted/site/ 本地快取裡的實測結果，
 * 用來防止「三個外殼元件各自維護前綴」而漂移。
 */
describe('shellRoutes — 外殼判定', () => {
  describe('guest：未登入態（有 site-header + 5 欄 mobile-taskbar）', () => {
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
      expect(shouldShowHeader(pathname)).toBe(true);
      expect(shouldShowMobileTaskbar(pathname)).toBe(true);
      expect(shouldShowAppTabBar(pathname)).toBe(false);
    });
  });

  describe('none：SEO 版面（完全無外殼）', () => {
    it('/learn/<slug> 沒有外殼（416 篇文章實測 site-header=0）', () => {
      const slug = '/learn/2330-chips-explained';
      expect(resolveShell(slug)).toBe('none');
      expect(shouldShowHeader(slug)).toBe(false);
      expect(shouldShowMobileTaskbar(slug)).toBe(false);
      expect(shouldShowAppTabBar(slug)).toBe(false);
    });

    it('/s/<ticker> 沒有外殼（s2330.html 實測 site-header=0）', () => {
      const ticker = '/s/2330';
      expect(resolveShell(ticker)).toBe('none');
      expect(shouldShowHeader(ticker)).toBe(false);
      expect(shouldShowMobileTaskbar(ticker)).toBe(false);
      expect(shouldShowAppTabBar(ticker)).toBe(false);
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
        expect(shouldShowMobileTaskbar(pathname)).toBe(false);
        expect(shouldShowAppTabBar(pathname)).toBe(false);
      },
    );

    // ★ 回歸測試：修復前的缺陷是「/learn 整個前綴都被隱藏」，
    //   導致 /learn 索引頁（learn-index.html，實測有外殼）被誤判成 SEO 版面而少了 header。
    it('★ /learn 索引本身必須是 guest，不可被 /learn/<slug> 的規則誤傷', () => {
      expect(resolveShell('/learn')).toBe('guest');
      expect(resolveShell('/learn/')).toBe('guest');
      expect(shouldShowHeader('/learn')).toBe(true);
      expect(shouldShowMobileTaskbar('/learn')).toBe(true);
    });
  });

  describe('app：峰子 App 主分頁（僅底部 AppTabBar）', () => {
    const appPaths = [
      '/diary',
      '/radar',
      '/review',
      '/chart',
      '/ai',
      '/sim',
      '/watchlist',
    ];

    it.each(appPaths)('%s → app（無 site-header，改由 AppTabBar 接手）', (pathname) => {
      expect(resolveShell(pathname)).toBe('app');
      expect(shouldShowHeader(pathname)).toBe(false);
      expect(shouldShowMobileTaskbar(pathname)).toBe(false);
      expect(shouldShowAppTabBar(pathname)).toBe(true);
    });

    it('/chips/<代號> 動態子路徑也是 app', () => {
      expect(resolveShell('/chips/2330')).toBe('app');
      expect(shouldShowAppTabBar('/chips/2330')).toBe(true);
      expect(shouldShowHeader('/chips/2330')).toBe(false);
    });

    it('未知路徑回退為 guest，確保不會出現「無外殼孤島」', () => {
      expect(resolveShell('/settings')).toBe('guest');
      expect(resolveShell('/some/unknown/page')).toBe('guest');
    });
  });

  describe('邊界：路徑正規化', () => {
    it('空字串與根路徑等價', () => {
      expect(resolveShell('')).toBe('guest');
      expect(resolveShell('/')).toBe('guest');
    });

    it('多重結尾斜線不影響判定', () => {
      expect(resolveShell('/school///')).toBe('guest');
      expect(resolveShell('/learn//')).toBe('guest');
    });

    it('相似但不相同的前綴不誤判', () => {
      // /s 是 SEO 子路徑前綴，但不該吃掉 /school 或 /sim。
      expect(resolveShell('/school')).toBe('guest');
      expect(resolveShell('/sim')).toBe('app');
      // /learn-x 不是 /learn 的子路徑。
      expect(resolveShell('/learn-x')).toBe('guest');
    });
  });
});
