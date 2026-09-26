/** @jest-environment jsdom */

/**
 * 單元測試 — 靜態單頁共用渲染器（src/components/StaticPage.tsx）
 *             與資料層（src/lib/staticPages.ts）
 *
 * 說明：StaticPage 是 Server Component，測試以 react-dom/server 的
 *       renderToStaticMarkup 取得 SSR 後的 HTML 字串再行斷言。
 *       （環境中 @testing-library/react 缺少 peer dependency
 *        @testing-library/dom，無法載入，故不使用 RTL。）
 *
 * 覆蓋：
 *   1. resolveStaticHref：站內轉換、#anchor 與外部連結原樣保留。
 *   2. 8 個靜態頁的 h1（title）與 lead 皆渲染。
 *   3. 各 block 型別（card/article/p/list/link/h3/details）渲染正確。
 *   4. title 為空的卡片不產生空標題元素。
 *   5. sectionNav 的 #anchor 不被 legacyRoutes 轉換（仍為 #…）。
 *   6. CTA 顯示文字未被改寫（僅 href 轉換）。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import StaticPage from '@/components/StaticPage';
import { resolveLegacyHref } from '@/lib/legacyRoutes';
import {
  STATIC_PAGE_SLUGS,
  buildAnchorMap,
  getStaticPage,
  isExternalHref,
  listStaticPages,
  resolveStaticHref,
  type StaticBlock,
  type StaticPageData,
} from '@/lib/staticPages';

/** 取得頁面 SSR 後的 HTML。 */
function renderPage(page: StaticPageData): string {
  return renderToStaticMarkup(<StaticPage page={page} />);
}

/** 計算某個 class 名稱在 HTML 中出現的次數（CSS Module 以 styleMock 對應為原名）。 */
function countClass(html: string, className: string): number {
  return (html.match(new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`, 'g')) ?? []).length;
}

describe('resolveStaticHref：站內轉換、錨點與外部連結原樣保留', () => {
  test('站內路徑 → 完全交由 legacyRoutes 轉換（與 resolveLegacyHref 一致）', () => {
    ['/today/', '/school/', '/learn/', '/dojo/', '/guide/', '/member/?tab=feedback'].forEach(
      (href) => {
        expect(resolveStaticHref(href)).toBe(resolveLegacyHref(href));
      },
    );
  });

  test('已知穩定對照：/today/ → /today（identity）', () => {
    expect(resolveStaticHref('/today/')).toBe('/today');
  });

  test('頁內錨點（#）一律不被轉換', () => {
    expect(resolveStaticHref('#who')).toBe('#who');
    expect(resolveStaticHref('#disclaimer')).toBe('#disclaimer');
    expect(resolveStaticHref('#start')).toBe('#start');
  });

  test('外部連結（http / mailto / protocol-relative）原樣保留', () => {
    const external = [
      'https://apps.apple.com/tw/app/id6796674804',
      'https://law.fsc.gov.tw/LawContent.aspx?id=FL030633',
      'mailto:tradeboss1199@gmail.com',
      '//cdn.example.com/x.png',
    ];
    external.forEach((href) => expect(resolveStaticHref(href)).toBe(href));
    expect(isExternalHref('mailto:a@b.com')).toBe(true);
    expect(isExternalHref('#who')).toBe(false);
    expect(isExternalHref('/today/')).toBe(false);
  });
});

describe('8 個靜態頁：h1（title）與 lead 皆渲染', () => {
  test.each(STATIC_PAGE_SLUGS)('%s', (slug) => {
    const page = getStaticPage(slug);
    const html = renderPage(page);

    // h1 內含 title
    expect(html).toMatch(new RegExp(`<h1[^>]*>[\\s\\S]*${escapeRegExp(page.title)}[\\s\\S]*</h1>`));
    // lead 出現（原文照登，不改寫）
    if (page.lead) {
      expect(html).toContain(page.lead);
    }
  });

  test('login 頁（sections 為空）仍渲染 hero，且不產生任何章節標題（h2）', () => {
    const page = getStaticPage('login');
    expect(page.sections).toHaveLength(0);
    const html = renderPage(page);
    expect(html).toMatch(/<h1[^>]*>股市大佬<\/h1>/);
    expect(html).not.toContain('<h2');
  });
});

/** 取 block 的代表文字（用於「無漏 block」驗證）。 */
function blockSignature(block: StaticBlock): string | null {
  switch (block.type) {
    case 'card':
    case 'article':
      return (
        block.title ||
        block.body ||
        (block.items && block.items[0]) ||
        (block.cta && block.cta.label) ||
        null
      );
    case 'p':
    case 'h3':
      return block.text || null;
    case 'list': {
      const first = block.items[0];
      if (!first) {
        return null;
      }
      // 有序清單：元件會把前綴編號拆成徽章，故代表文字需去編號後再比對。
      if (block.ordered) {
        const match = /^(\d+)\s*([\s\S]*)$/.exec(first);
        return match && match[2].trim() ? match[2] : first;
      }
      return first;
    }
    case 'link':
      return block.label || null;
    case 'details':
      return block.summary || null;
    default:
      return null;
  }
}

/** 依 React 的文字轉義規則轉義（供字串比對）。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

describe('無漏 block：每個 block 的代表文字都出現在 HTML', () => {
  const pages = listStaticPages();

  test.each(pages.map((p) => [p.slug, p] as const))('%s', (_slug, page) => {
    const html = renderPage(page);
    let checked = 0;
    page.sections.forEach((section) => {
      section.blocks.forEach((block) => {
        const signature = blockSignature(block);
        if (signature) {
          expect(html).toContain(escapeHtml(signature));
          checked += 1;
        }
      });
    });
    // 有 block 的頁面必須真的檢查到（避免 signature 全為 null 造成假通過）；
    // login 的 sections 為空（博主表單為客戶端渲染），故不適用。
    const totalBlocks = page.sections.reduce((sum, s) => sum + s.blocks.length, 0);
    if (totalBlocks > 0) {
      expect(checked).toBeGreaterThan(0);
    }
  });

  test('manual 共 86 個 block、about 共 32 個 block（與 JSON 一致）', () => {
    const count = (page: StaticPageData) =>
      page.sections.reduce((sum, s) => sum + s.blocks.length, 0);
    expect(count(getStaticPage('manual'))).toBe(86);
    expect(count(getStaticPage('about'))).toBe(32);
  });
});

/** 用於逐型別驗證的合成頁（內容刻意帶可辨識字串）。 */
const SYNTHETIC: StaticPageData = {
  slug: 'guide',
  path: '/guide/',
  eyebrow: 'EYEBROW-原文',
  title: '合成標題',
  lead: '合成說明',
  heroCtas: [{ href: '/today/', label: 'CTA原文', variant: 'primary' }],
  sectionNav: [],
  subNav: [],
  sections: [
    {
      heading: '合成章節',
      blocks: [
        {
          type: 'card',
          eyebrow: '卡-eyebrow',
          title: '卡-title',
          body: '卡-body',
          cta: { href: '/school/', label: '卡-CTA原文' },
        },
        { type: 'card', eyebrow: '', title: '', body: '只有-body-的卡', cta: null },
        { type: 'article', eyebrow: '', title: '', body: '文章-body', cta: null },
        { type: 'p', role: 'eyebrow', text: 'P-eyebrow' },
        { type: 'p', role: 'title', text: 'P-title' },
        { type: 'p', role: 'body', text: 'P-body' },
        { type: 'list', ordered: true, items: ['1第一項', '2第二項'] },
        { type: 'list', ordered: false, items: ['· 甲', '· 乙'] },
        { type: 'link', href: '/guide/', label: '連結-label', desc: '連結-desc' },
        { type: 'h3', text: 'H3-小標' },
        {
          type: 'details',
          summary: '折疊-summary',
          blocks: [{ type: 'p', role: 'body', text: '折疊內文' }],
        },
      ],
    },
  ],
};

describe('block 型別各自渲染正確', () => {
  const html = renderPage(SYNTHETIC);

  test('card（含 eyebrow / title / body / CTA）', () => {
    expect(html).toContain('卡-eyebrow');
    expect(html).toContain('卡-title');
    expect(html).toContain('卡-body');
    expect(html).toContain('卡-CTA原文');
    // 有 eyebrow 的卡片帶金色左緣 class（cardAccent）
    expect(countClass(html, 'cardAccent')).toBe(1);
  });

  test('article', () => {
    expect(html).toContain('文章-body');
    expect(countClass(html, 'article')).toBe(1);
  });

  test('p（三種 role）', () => {
    expect(html).toContain('P-eyebrow');
    expect(html).toContain('P-title');
    expect(html).toContain('P-body');
    expect(countClass(html, 'pEyebrow')).toBe(1);
    expect(countClass(html, 'pTitle')).toBe(1);
    // 2 個 body：1 個頂層 + 1 個位於 <details> 內
    expect(countClass(html, 'pBody')).toBe(2);
  });

  test('list（有序拆編號成徽章；無序原樣）', () => {
    // 有序：編號前綴被拆出（html 內不含 "1第一項"，而是徽章 1 + 文字 第一項）
    expect(html).toContain('第一項');
    expect(html).toContain('第二項');
    expect(html).not.toContain('1第一項');
    expect(countClass(html, 'numBadge')).toBe(2);
    // 無序：原樣
    expect(html).toContain('· 甲');
    expect(html).toContain('· 乙');
  });

  test('link（label + desc）', () => {
    expect(html).toContain('連結-label');
    expect(html).toContain('連結-desc');
    expect(countClass(html, 'link')).toBe(1);
  });

  test('h3', () => {
    expect(html).toMatch(/<h3[^>]*>H3-小標<\/h3>/);
  });

  test('details（原生 <details>，無需 client JS）', () => {
    expect(html).toContain('<details');
    expect(html).toContain('折疊-summary');
    expect(html).toContain('折疊內文');
  });

  test('section-mark 裝飾元素存在於章節標題列', () => {
    expect(html).toMatch(/aria-hidden="true" class="sectionMark"/);
    expect(html).toMatch(/<h2[^>]*>合成章節<\/h2>/);
  });
});

describe('title 為空的卡片不產生空標題元素', () => {
  test('只有 body 的卡片：不渲染空 title 節點', () => {
    const html = renderPage(SYNTHETIC);
    // 合成頁只有 1 張卡片有 title
    expect(countClass(html, 'cardTitle')).toBe(1);
    // 不存在空字串的標題節點
    expect(html).not.toMatch(/class="cardTitle"[^>]*>\s*<\/p>/);
    expect(html).toMatch(/class="cardTitle">卡-title<\/p>/);
  });

  test('真實頁面（legal）所有 cardTitle 皆非空', () => {
    const html = renderPage(getStaticPage('legal'));
    const titles = html.match(/class="cardTitle">([^<]*)<\/p>/g) ?? [];
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((t) => expect(t.replace(/class="cardTitle">/, '').replace(/<\/p>$/, '').trim()).not.toBe(''));
  });
});

describe('sectionNav 的 #anchor 不被轉換', () => {
  test('legal：hero 索引膠囊 href 仍為 #…（非 fallback /diary）', () => {
    const page = getStaticPage('legal');
    const html = renderPage(page);
    const hrefs = (html.match(/class="heroNavLink"[^>]*href="([^"]+)"/g) ?? []).map((m) =>
      m.replace(/.*href="([^"]+)"/, '$1'),
    );
    expect(hrefs).toHaveLength(page.sectionNav.length);
    page.sectionNav.forEach((nav) => expect(hrefs).toContain(nav.href));
    hrefs.forEach((href) => expect(href.startsWith('#')).toBe(true));
  });

  test('buildAnchorMap：manual 每個 sectionNav 都對到章節；legal #who → 我們是誰', () => {
    const manual = getStaticPage('manual');
    const manualAnchors = buildAnchorMap(manual);
    // manual 有 10 個 sectionNav、11 個 section（最後一個「還有問題？」無 anchor）
    expect(manualAnchors.filter(Boolean)).toHaveLength(manual.sectionNav.length);
    const startIdx = manual.sections.findIndex((s) => s.heading === '註冊、登入與通知設定');
    expect(manualAnchors[startIdx]).toBe('start');

    const legal = getStaticPage('legal');
    const legalAnchors = buildAnchorMap(legal);
    const whoIdx = legal.sections.findIndex((s) => s.heading === '我們是誰');
    expect(legalAnchors[whoIdx]).toBe('who');
  });
});

describe('CTA 顯示文字未被改寫（僅 href 轉換）', () => {
  test('guide hero CTA：文字保留原文、href 轉為峰子路由', () => {
    const page = getStaticPage('guide');
    const html = renderPage(page);
    const cta = page.heroCtas[0];
    expect(html).toContain(cta.label);
    // /today/ 為實站權威路徑（identity），再經 trailingSlash:true 補尾斜線 → /today/。
    expect(html).toContain('href="/today/"');
  });

  test('合成頁 CTA：文字為 JSON 原文', () => {
    const html = renderPage(SYNTHETIC);
    expect(html).toContain('CTA原文');
    expect(html).toContain('卡-CTA原文');
    expect(html).toContain('href="/today/"');
  });

  test('外部 CTA 另開新視窗且 href 不變（app 頁 App Store 連結）', () => {
    const page = getStaticPage('app');
    const html = renderPage(page);
    const cta = page.heroCtas[0];
    expect(html).toContain(cta.label);
    expect(html).toContain(`href="${cta.href}"`);
    expect(html).toContain('target="_blank"');
  });
});

/** 轉義正則特殊字元。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
