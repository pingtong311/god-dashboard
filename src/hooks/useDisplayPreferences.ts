"use client";

/* ============================================================================
 * useDisplayPreferences — 全站顯示偏好的 React 綁定
 * ----------------------------------------------------------------------------
 * 供 /settings 等頁面使用：讀取目前值、切換值、寫回 localStorage，
 * 並即時套用到 <html>（documentElement）。
 *
 * 初始化策略（避免 hydration mismatch）：
 *  - 首次 render 一律使用 DEFAULT_DISPLAY_PREFERENCES（＝伺服器端相同），
 *    因此 SSR HTML 與 client 首次 render 一致。
 *  - 掛載後（useEffect）才讀取 localStorage 並同步真實值；此時 <head> 的
 *    阻塞式初始化腳本早已把真實主題套用到 DOM，故不會有主題閃爍。
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  applyDisplayPreferences,
  persistDisplayPreferences,
  readDisplayPreferences,
  type DensityPreference,
  type DisplayPreferences,
  type FontSizePreference,
  type ThemePreference,
  type UpDownPreference,
} from "@/lib/displayPreferences";

/** useDisplayPreferences 的回傳介面。 */
export interface UseDisplayPreferencesResult {
  /** 目前顯示偏好。 */
  preferences: DisplayPreferences;
  /** 是否已完成 localStorage 讀取（掛載後為 true）。 */
  ready: boolean;
  /** 設定明暗主題。 */
  setTheme: (theme: ThemePreference) => void;
  /** 在 dark／light 之間切換。 */
  toggleTheme: () => void;
  /** 設定舒適閱讀。 */
  setComfortRead: (enabled: boolean) => void;
  /** 切換舒適閱讀。 */
  toggleComfortRead: () => void;
  /** 設定漲跌色慣例。 */
  setUpDown: (value: UpDownPreference) => void;
  /** 在台股（紅漲綠跌）／美股（綠漲紅跌）慣例間切換。 */
  toggleUpDown: () => void;
  /** 設定資訊密度。 */
  setDensity: (value: DensityPreference) => void;
  /** 設定字級。 */
  setFontSize: (value: FontSizePreference) => void;
  /** 還原為預設偏好。 */
  reset: () => void;
}

/**
 * 顯示偏好 hook。
 * 讀取／切換／寫回 localStorage 並即時套用到 <html>。
 */
export function useDisplayPreferences(): UseDisplayPreferencesResult {
  const [preferences, setPreferences] = useState<DisplayPreferences>(
    DEFAULT_DISPLAY_PREFERENCES,
  );
  const [ready, setReady] = useState(false);
  // 保留最新值供事件回呼使用，避免閉包過期。
  const preferencesRef = useRef<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);

  useEffect(() => {
    const current = readDisplayPreferences();
    preferencesRef.current = current;
    setPreferences(current);
    applyDisplayPreferences(current);
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<DisplayPreferences>) => {
    const next: DisplayPreferences = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    applyDisplayPreferences(next);
    persistDisplayPreferences(next);
    setPreferences(next);
  }, []);

  const setTheme = useCallback(
    (theme: ThemePreference) => update({ theme }),
    [update],
  );

  const toggleTheme = useCallback(
    () => update({ theme: preferencesRef.current.theme === "dark" ? "light" : "dark" }),
    [update],
  );

  const setComfortRead = useCallback(
    (enabled: boolean) => update({ comfortRead: enabled }),
    [update],
  );

  const toggleComfortRead = useCallback(
    () => update({ comfortRead: !preferencesRef.current.comfortRead }),
    [update],
  );

  const setUpDown = useCallback(
    (value: UpDownPreference) => update({ upDown: value }),
    [update],
  );

  const toggleUpDown = useCallback(
    () => update({ upDown: preferencesRef.current.upDown === "us" ? "tw" : "us" }),
    [update],
  );

  const setDensity = useCallback(
    (value: DensityPreference) => update({ density: value }),
    [update],
  );

  const setFontSize = useCallback(
    (value: FontSizePreference) => update({ fontSize: value }),
    [update],
  );

  const reset = useCallback(
    () => update({ ...DEFAULT_DISPLAY_PREFERENCES }),
    [update],
  );

  return {
    preferences,
    ready,
    setTheme,
    toggleTheme,
    setComfortRead,
    toggleComfortRead,
    setUpDown,
    toggleUpDown,
    setDensity,
    setFontSize,
    reset,
  };
}
