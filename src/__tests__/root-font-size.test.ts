/**
 * 根字級規則測試（「拖拉視窗時整體等比縮放」）
 * ----------------------------------------------------------------------------
 * 實站（captured/login-capture/css/22j_792g-trnl.css）逐字有：
 *   html{ … font-size:16px }
 *   @media (min-width:768px){ html{ font-size:19px } }
 * 因全站幾乎都用 rem，根字級一變即整體等比縮放。業主明確點名此細節。
 *
 * CSS 難以在 jsdom 端以 computed style 驗證（jsdom 不做 media query 佈局），
 * 故改以「讀取原始檔並斷言規則存在」鎖定回歸。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

/** 移除註解，避免註解內文字造成誤判。 */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('globals.css — 根字級（等比縮放）', () => {
  test('html 有 font-size: 16px', () => {
    expect(cssWithoutComments).toMatch(/html\s*\{[^}]*font-size:\s*16px/);
  });

  test('≥768px 的 media query 內 html font-size: 19px', () => {
    expect(cssWithoutComments).toMatch(
      /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[\s\S]*?html\s*\{[^}]*font-size:\s*19px/,
    );
  });

  test('html 有 text-size-adjust（含 webkit 前綴）', () => {
    expect(cssWithoutComments).toMatch(/html\s*\{[^}]*text-size-adjust:\s*100%/);
    expect(cssWithoutComments).toMatch(/-webkit-text-size-adjust:\s*100%/);
  });

  test('html 有 scroll-behavior: smooth', () => {
    expect(cssWithoutComments).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/);
  });

  test('html 區塊未寫死 color-scheme（避免蓋掉主題切換）', () => {
    const htmlBlock = cssWithoutComments.match(/html\s*\{[^}]*\}/);
    expect(htmlBlock).not.toBeNull();
    expect(htmlBlock?.[0]).not.toContain('color-scheme');
  });
});
