'use client';

/**
 * /patterns 資料共用 Context（用戶端）
 * ============================================================================
 * 為什麼需要：
 *   頁首（hero）的「資料日」列與資料區（頁籤／清單）都源自同一支端點
 *   GET /api/skynet/pattern-screen。若兩個位置各自 fetch，會對同一份（可能不小的）
 *   payload 重複請求兩次。故此處以單一 Provider **集中抓取一次**，透過 Context 讓
 *   頁首的 <PatternsDataDate /> 與資料區的 <PatternsClient /> 共用同一份狀態。
 *
 * 誠實原則：
 *   載入中 / 失敗 / 未就緒皆為明確狀態，消費端據此顯示誠實文案，絕不捏造數字。
 *
 * 紅漲綠跌：本檔只做資料取得，不涉顏色。
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { PatternScreenResponse } from '@/app/api/skynet/pattern-screen/route';

/** /patterns 資料載入狀態（頁首資料日列與資料區共用）。 */
export type PatternScreenState =
  | { status: 'loading' }
  | { status: 'ready'; data: PatternScreenResponse }
  | { status: 'error' };

/** 預設值為載入中（尚未掛上 Provider 時的安全值）。 */
const PatternScreenContext = createContext<PatternScreenState>({ status: 'loading' });

/**
 * 取得 /patterns 的資料載入狀態。
 * 須在 <PatternsDataProvider> 的子樹內使用；否則永遠回 'loading'。
 */
export function usePatternScreen(): PatternScreenState {
  return useContext(PatternScreenContext);
}

/**
 * 集中抓取一次 /api/skynet/pattern-screen，供頁首資料日列與資料區共用。
 *
 * 以 `ok === true` 判定成功；非 200 或非 JSON 皆歸為 error（由消費端顯示誠實文案）。
 */
export default function PatternsDataProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<PatternScreenState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/pattern-screen')
      .then((res) => res.json())
      .then((json: PatternScreenResponse) => {
        if (cancelled) return;
        if (json && json.ok === true) setState({ status: 'ready', data: json });
        else setState({ status: 'error' });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <PatternScreenContext.Provider value={state}>{children}</PatternScreenContext.Provider>;
}
