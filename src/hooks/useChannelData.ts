'use client';

/**
 * 券商分點資料源可用性 flag hook（spec data-source-matrix §2-B：分點四畫面分支 UI）。
 *
 * 抓取 /api/skynet/channel?ticker=...，回傳 ChannelData 供前端做「有/無分點資料」兩分支：
 * - hasChannelData === true  → 渲染分點分析區塊（現況無真實來源，頁面端只留 skeleton + TODO）
 * - hasChannelData === false → 顯示誠實「資料未入庫」文案（券商分點逐筆為付費資料源，目前未接）
 * - null（載入中 / ok:false / 網路失敗）→ 一律當「無資料」處理，走「未入庫」分支（誠實，不造假）
 *
 * 依 spec 硬約束：不補腦、不硬編碼、不造假分點數字——本 hook 只做 flag 透傳，不產生任何數字。
 */

import { useEffect, useState } from 'react';
import type { ChannelData, ChannelResponse } from '@/types/channel';

/** 代號格式對齊專案既有慣例（4~6 位數字，可帶一個字母後綴；t99 等前綴代號不適用分點查詢）。 */
function isValidTicker(raw: string): boolean {
  return /^\d{4,6}[A-Z]?$/.test(raw);
}

export function useChannelData(ticker: string): ChannelData | null {
  const [data, setData] = useState<ChannelData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const value = (ticker ?? '').trim().toUpperCase();

    if (!isValidTicker(value)) {
      setData(null);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/skynet/channel?ticker=${encodeURIComponent(value)}`,
          { cache: 'no-store' }
        );
        const body = (await res.json()) as ChannelResponse;
        if (cancelled) return;
        // ok:true → 回 flag；ok:false / 異常 → null（走「未入庫」誠實分支）
        setData(body.ok && body.data ? body.data : null);
      } catch {
        if (!cancelled) setData(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return data;
}
