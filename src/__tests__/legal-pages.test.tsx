/** @jest-environment jsdom */

/**
 * 單元測試 — 法遵靜態頁（src/components/LegalPage.tsx / src/lib/legalPages.ts）
 *             與資料層（src/data/legal-pages.json，抽取自博主 privacy.html / terms.html）
 *
 * 說明：LegalPage 是 Server Component，測試以 react-dom/server 的
 *       renderToStaticMarkup 取得 SSR 後的 HTML 字串再行斷言
 *       （與 static-page.test.tsx 同一套模式；環境未設定
 *        @testing-library/jest-dom，故一律用 expect(x).toContain / 正則）。
 *
 * 覆蓋：
 *   1. resolveLegalHref：博主 href → 峰子路由（只換 URL，不換文字）。
 *   2. block 數量與來源 HTML 一致（privacy 14 h2 / 24 h3；terms 13 h2 / 25 h3）。
 *   3. <h1> 原文與 meta（生效日期 / 最後更新）皆渲染。
 *   4. 無空文字 block；渲染輸出不含 React SSR 的 <!-- --> 註解殘留。
 *   5. 跨頁連結 nav 的 4 條 href 已轉為峰子路由。
 *   6. 逐句抽查：來源 3 句（各頁）逐字出現，證明未漏字或改寫。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import LegalPage from '@/components/LegalPage';
import {
  LEGAL_PAGE_SLUGS,
  buildLegalMetadata,
  getLegalPage,
  isInternalLegalHref,
  listLegalPages,
  resolveLegalHref,
  type LegalBlock,
  type LegalPageData,
} from '@/lib/legalPages';

/** 取得頁面 SSR 後的 HTML。 */
function render(page: LegalPageData): string {
  return renderToStaticMarkup(<LegalPage page={page} />);
}

/** 計算某型別 block 的數量。 */
function countType(page: LegalPageData, type: LegalBlock['type']): number {
  return page.blocks.filter((block) => block.type === type).length;
}

/** 取 HTML 內所有 href（依出現順序）。 */
function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe('resolveLegalHref：博主 href → 峰子路由（只換 URL）', () => {
  test('跨頁連結：/privacy.html → /privacy、/terms.html → /terms', () => {
    expect(resolveLegalHref('/privacy.html')).toBe('/privacy');
    expect(resolveLegalHref('/terms.html')).toBe('/terms');
  });

  test('terms 內文的絕對網址亦導向峰子路由', () => {
    expect(resolveLegalHref('https://blackstockai.com/privacy.html')).toBe('/privacy');
    expect(resolveLegalHref('https://blackstockai.com/terms.html')).toBe('/terms');
  });

  test('首頁與法遵說明原樣保留；外部連結（mailto）不動', () => {
    expect(resolveLegalHref('/')).toBe('/');
    expect(resolveLegalHref('/legal/')).toBe('/legal/');
    expect(resolveLegalHref('mailto:tradeboss1199@gmail.com')).toBe('mailto:tradeboss1199@gmail.com');
    expect(resolveLegalHref('https://duckduckgo.com/privacy')).toBe('https://duckduckgo.com/privacy');
  });

  test('isInternalLegalHref：站內 true；mailto / https / protocol-relative false', () => {
    expect(isInternalLegalHref('/privacy')).toBe(true);
    expect(isInternalLegalHref('/legal/')).toBe(true);
    expect(isInternalLegalHref('mailto:a@b.com')).toBe(false);
    expect(isInternalLegalHref('https://x.com')).toBe(false);
    expect(isInternalLegalHref('//cdn.example.com')).toBe(false);
  });
});

describe('block 數量與來源 HTML 一致', () => {
  test('privacy：14 個 h2、24 個 h3（來源 privacy.html 實測值）', () => {
    const page = getLegalPage('privacy');
    expect(countType(page, 'h2')).toBe(14);
    expect(countType(page, 'h3')).toBe(24);
    // 渲染後 DOM 的 <h2>/<h3> 數亦須一致（不可多渲染或少渲染）。
    const html = render(page);
    expect((html.match(/<h2[ >]/g) ?? []).length).toBe(14);
    expect((html.match(/<h3[ >]/g) ?? []).length).toBe(24);
  });

  test('terms：13 個 h2、25 個 h3（來源 terms.html 實測值）', () => {
    const page = getLegalPage('terms');
    expect(countType(page, 'h2')).toBe(13);
    expect(countType(page, 'h3')).toBe(25);
    const html = render(page);
    expect((html.match(/<h2[ >]/g) ?? []).length).toBe(13);
    expect((html.match(/<h3[ >]/g) ?? []).length).toBe(25);
  });

  test('listLegalPages 依序回傳 privacy、terms', () => {
    expect(listLegalPages().map((p) => p.slug)).toEqual(['privacy', 'terms']);
  });
});

describe('<h1> 與 meta（生效日期 / 最後更新）', () => {
  test.each(LEGAL_PAGE_SLUGS)('%s：<h1> 為原文標題', (slug) => {
    const page = getLegalPage(slug);
    const html = render(page);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${page.title}</h1>`));
  });

  test('privacy：生效日期 2026 年 8 月 29 日、最後更新 2026 年 9 月 10 日', () => {
    const page = getLegalPage('privacy');
    expect(page.meta.map((m) => [m.label, m.value])).toEqual([
      ['生效日期', '2026 年 8 月 29 日'],
      ['最後更新', '2026 年 9 月 10 日'],
    ]);
    const html = render(page);
    expect(html).toContain('<strong class="strong">生效日期</strong>：2026 年 8 月 29 日');
    expect(html).toContain('<strong class="strong">最後更新</strong>：2026 年 9 月 10 日');
  });

  test('terms：生效日期與最後更新皆為 2026 年 8 月 29 日', () => {
    const page = getLegalPage('terms');
    expect(page.meta.map((m) => [m.label, m.value])).toEqual([
      ['生效日期', '2026 年 8 月 29 日'],
      ['最後更新', '2026 年 8 月 29 日'],
    ]);
    const html = render(page);
    expect(html).toContain('<strong class="strong">生效日期</strong>：2026 年 8 月 29 日');
    expect(html).toContain('<strong class="strong">最後更新</strong>：2026 年 8 月 29 日');
  });

  test('buildLegalMetadata：<title> 逐字沿用博主 <title>', () => {
    expect(buildLegalMetadata(getLegalPage('privacy')).title).toBe('隱私權政策｜股市大佬 TradeBoss');
    expect(buildLegalMetadata(getLegalPage('terms')).title).toBe('服務條款｜股市大佬 TradeBoss');
  });
});

describe('無空文字、無 SSR 註解殘留', () => {
  test.each(LEGAL_PAGE_SLUGS)('%s：每個 block / 清單項文字皆非空', (slug) => {
    const page = getLegalPage(slug);
    let checked = 0;
    for (const block of page.blocks) {
      // 以 `in` 運算子收斂聯集：清單 block 有 items、文字 block 有 text。
      if ('items' in block) {
        expect(block.items.length).toBeGreaterThan(0);
        for (const item of block.items) {
          expect(item.text.trim()).not.toBe('');
          // item.text 必須等於 runs 串接（證明沒有壓平丟字）。
          expect(item.text).toBe(item.runs.map((run) => run.v).join(''));
          checked += 1;
        }
      } else if ('text' in block) {
        expect(block.text.trim()).not.toBe('');
        // text 必須等於 runs 串接（證明沒有壓平丟字）。
        expect(block.text).toBe(block.runs.map((run) => run.v).join(''));
        checked += 1;
      }
      // 其餘為 hr（無文字），略過。
    }
    expect(checked).toBeGreaterThan(0);
    page.meta.forEach((item) => expect(item.text.trim()).not.toBe(''));
  });

  test.each(LEGAL_PAGE_SLUGS)('%s：渲染輸出不含 <!-- 註解標記', (slug) => {
    const html = render(getLegalPage(slug));
    expect(html).not.toContain('<!--');
    // 亦不可在資料層出現（博主的 SSR 註解不得被當成內容抽進來）。
    expect(JSON.stringify(getLegalPage(slug))).not.toContain('<!--');
  });
});

describe('跨頁連結 nav：4 條 href 已轉為峰子路由', () => {
  test.each(LEGAL_PAGE_SLUGS)('%s：nav 為 /、/privacy、/terms、/legal/', (slug) => {
    const page = getLegalPage(slug);
    // 資料層保留博主原文（供溯源）。
    expect(page.nav.map((n) => n.href)).toEqual([
      '/',
      '/privacy.html',
      '/terms.html',
      '/legal/',
    ]);
    expect(page.nav.map((n) => n.label)).toEqual([
      '回首頁',
      '隱私權政策',
      '服務條款',
      '法遵說明',
    ]);
    // 渲染後（nav 位於最前，故取前 4 條 href）已轉為峰子路由。
    const html = render(page);
    expect(hrefsOf(html).slice(0, 4)).toEqual(['/', '/privacy', '/terms', '/legal/']);
    expect(html).toContain('aria-label="相關連結"');
  });
});

describe('原文照登：逐句抽查（未漏字、未改寫）', () => {
  const PRIVACY_SENTENCES = [
    '本服務由黑曜 AI／股市大佬營運團隊提供。AI 處理及選用網路查詢須在 App 內另外明確同意，不因繼續瀏覽而自動同意。',
    '我們絕不會將您的個人資料販售給第三方。',
    '本服務不針對 13 歲以下兒童。我們不會故意收集兒童的個人資料。如果您發現我們收集了兒童資料，請立即聯絡我們，我們會盡快刪除。',
  ];

  const TERMS_SENTENCES = [
    '歡迎使用股市大佬（以下簡稱「本服務」）。使用本服務即表示您同意遵守本服務條款。如果您不同意本條款，請勿使用本服務。',
    '本服務條款適用中華民國法律。',
    '若本條款任何條文被認定無效，其他條文仍然有效。',
  ];

  test('privacy：3 句原文逐字出現', () => {
    const html = render(getLegalPage('privacy'));
    PRIVACY_SENTENCES.forEach((sentence) => expect(html).toContain(sentence));
  });

  test('terms：3 句原文逐字出現', () => {
    const html = render(getLegalPage('terms'));
    TERMS_SENTENCES.forEach((sentence) => expect(html).toContain(sentence));
  });

  test('terms 的「隱私權政策」連結文字不變、href 指向峰子 /privacy', () => {
    const html = render(getLegalPage('terms'));
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*>隱私權政策<\/a>/);
  });

  test('privacy 的聯絡 Email 連結（mailto）原樣保留、文字不變', () => {
    const html = render(getLegalPage('privacy'));
    expect(html).toContain('href="mailto:tradeboss1199@gmail.com"');
    expect(html).toContain('tradeboss1199@gmail.com');
  });
});
