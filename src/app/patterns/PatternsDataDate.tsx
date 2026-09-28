'use client';

/**
 * 頁首「資料日」列（用戶端）
 * ----------------------------------------------------------------------------
 * 逐字對齊實站 patterns.html 的 hero 第二行：
 *   <p class="mt-2 text-sm text-muted">資料日：2026-09-24｜盤後日 K</p>
 *
 * 日期取自本站自算端點 GET /api/skynet/pattern-screen 的 data_date（與資料區同一份
 * 狀態，見 PatternsDataContext）。未就緒（日 K 累積不足）或請求失敗時顯示「—」
 * ——誠實留白，不捏造日期。
 */

import type { ReactElement } from 'react';
import { usePatternScreen } from './PatternsDataContext';

export default function PatternsDataDate(): ReactElement {
  const state = usePatternScreen();
  const date = state.status === 'ready' ? (state.data.data_date ?? '—') : '—';
  return <p className="mt-2 text-sm text-muted">資料日：{date}｜盤後日 K</p>;
}
