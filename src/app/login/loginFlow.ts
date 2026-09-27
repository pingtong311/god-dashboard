/**
 * loginFlow — /login 測試登入的「純邏輯與常數」。
 * ----------------------------------------------------------------------------
 * 這一層刻意不碰 DOM / React / localStorage，只放可獨立測試的純函式與常數，
 * 讓表單元件（LoginForm）與測試共用同一份「正確帳密」定義，避免兩處漂移。
 *
 * 背景：峰子（股市大佬 TradeBoss 複刻）的登入態「單一來源」是
 * src/lib/authState.ts 的 `warroom_token`（沿用實站鍵名，刻意設計）。
 * 本檔只負責「驗證帳密」與「提供固定測試 token」，實際寫入 localStorage
 * 與導向由 LoginForm 於送出事件中處理（確保 SSR 不讀寫 localStorage）。
 */

/** 測試帳號（BOSS 指定：admin）。 */
export const TEST_USERNAME = 'admin';

/** 測試密碼（BOSS 指定：1234）。 */
export const TEST_PASSWORD = '1234';

/**
 * 固定測試 token（格式比照實站登入後 localStorage 的 `warroom_token`：
 * `3682.1792855876.075d86e85ad87a96d014813bf8639df3`）。
 * 僅作為「已登入」的旗標值，不具任何安全意義。
 */
export const TEST_LOGIN_TOKEN = '3682.1792855876.075d86e85ad87a96d014813bf8639df3';

/** 登入成功後的導向路徑（會員態首頁「今日戰情」）。 */
export const LOGIN_REDIRECT_PATH = '/today/';

/**
 * 驗證帳密是否為測試帳號。
 *
 * @param username 使用者輸入的帳號（僅去頭尾空白後比對）。
 * @param password 使用者輸入的密碼（完全比對，不去空白）。
 * @returns 帳密正確回 `true`，否則 `false`。
 */
export function verifyCredentials(username: string, password: string): boolean {
  return username.trim() === TEST_USERNAME && password === TEST_PASSWORD;
}
