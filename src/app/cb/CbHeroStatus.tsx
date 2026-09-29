'use client';

/**
 * 可轉債 — hero「盤後資料日」狀態列（用戶端資料載入）
 * ----------------------------------------------------------------------------
 * 逐字對齊 cb.html hero 第二行：`盤後資料日：2026-09-24｜下一交易日盤後更新`
 * （日期與更新頻率取自 GET /api/skynet/cb 的 date / next_update）。
 *
 * 先前此處誤植為「轉換溢價率需 CB 盤後成交價，目前無免費資料源」——該斷言已作廢
 * （CB 日行情檔 cbdrs001 可自產，見 route.ts）。上游無回應時只顯示更新頻率，
 * 不捏造日期。
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CbResponse } from '@/app/api/skynet/cb/route';

export default function CbHeroStatus(): ReactElement {
  const [date, setDate] = useState('');
  const [nextUpdate, setNextUpdate] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skynet/cb', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: CbResponse) => {
        if (cancelled) return;
        if (json && json.available === true) {
          setDate(json.date);
          setNextUpdate(json.next_update);
        }
      })
      .catch(() => {
        /* 上游無回應 → 保持空白，不捏造日期 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!date && !nextUpdate) return <p className="mt-2 text-sm text-muted">盤後資料</p>;

  return (
    <p className="mt-2 text-sm text-muted">
      {date ? `盤後資料日：${date}` : '盤後資料'}
      {nextUpdate ? `｜${nextUpdate}更新` : ''}
    </p>
  );
}
