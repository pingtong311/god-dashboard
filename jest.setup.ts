/**
 * jest.setup.ts — 測試環境全域設定
 * ----------------------------------------------------------------------------
 * 對齊 next.config.ts 的 `trailingSlash: true`：
 * Next.js 在 build 期（next/dist/build/define-env.js）會把
 * `process.env.__NEXT_TRAILING_SLASH` 設為 config.trailingSlash，
 * client 端 next/link 的 normalizePathTrailingSlash 依此變數決定是否保留/補上
 * 尾斜線。Jest 沒有經過 build，故在此手動鏡像同一環境變數，
 * 讓「真實 next/link」在 jsdom 下的行為與實站 render 一致
 * （/learn → /learn/、/diary → /diary/ 等）。
 */
process.env.__NEXT_TRAILING_SLASH = 'true';