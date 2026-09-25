'use client';

import { useEffect, useState } from 'react';

/**
 * authState — 登入狀態的單一來源（client-only）。
 *
 * 博主（股市大佬 TradeBoss）以 localStorage 的 `warroom_token` 記錄登入憑證
 * （實測自登入後 Playwright 抓取的 localStorage.json：
 *   {"warroom_token":"3682.1792855876.075d86e85ad87a96d014813bf8639df3", …}）。
 * 峰子沿用同一個鍵，讓「登入態外殼」與實站對齊。
 *
 * 目前尚未實作登入流程，故此處只做「讀取」：只要 `warroom_token` 存在即視為已登入。
 * 不引入任何狀態管理套件；以最小方案 `useState` + `useEffect` 取得，
 * 避免 SSR/CSR 首屏不一致（初始值固定 false，mount 後才讀 localStorage）。
 */

/** 登入憑證在 localStorage 的鍵名（與實站一致）。 */
export const LOGIN_TOKEN_KEY = 'warroom_token';

/**
 * 讀取目前登入狀態（同步、僅能在 client 端呼叫）。
 *
 * @returns 已登入回 `true`；未登入、SSR 環境或 localStorage 不可用時回 `false`。
 */
export function readIsLoggedIn(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return Boolean(window.localStorage.getItem(LOGIN_TOKEN_KEY));
  } catch {
    // localStorage 不可用（如隱私模式、被停用）時視為未登入。
    return false;
  }
}

/**
 * React hook：取得目前登入狀態（hydration 安全）。
 *
 * 初始值固定 `false`（SSR 與 CSR 首屏一致），於 `useEffect` 內才讀取實際值。
 *
 * @returns 目前是否已登入。
 */
export function useIsLoggedIn(): boolean {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(readIsLoggedIn());
  }, []);

  return isLoggedIn;
}
