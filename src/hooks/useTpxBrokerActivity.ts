'use client';

/**
 * TPEX 上櫃券商分點活躍度 hook（spec data-source-matrix §2-D「B3」）。
 *
 * 抓取 /api/skynet/channel-broker（全上櫃市場當日分點營業金額彙總 top N，
 * **不分 ticker**——端點回傳的誠實 shape 已標「僅分點營業金額彙總，非逐股分點買賣」）。
 *
 * 回傳三態（誠實降級，不補腦）：
 * - ChannelBrokerData（ok:true）→ 前端依 hasBrokerActivity 分支：
 *   - true  → 渲染分點營業金額 top N 表 + 誠實註記（收盤後批次，非盤中即時）
 *   - false → 誠實「資料未入庫」（今日無有效分點營業金額筆數）
 * - null（載入中 / ok:false / 網路失敗）→ 誠實「資料未入庫」（上游未回，不造假數字）
 *
 * 與 useChannelData（§2-B 逐股分點付費路徑，hasChannelData 恆 false）互不干預：
 * 本 hook 只負責 B3 免費分點彙總層，逐股分點仍走 §2-B 未入庫文案。
 */

import { useEffect, useState } from 'react';
import type { ChannelBrokerData, ChannelBrokerResponse } from '@/types/channelBroker';

export function useTpxBrokerActivity(): ChannelBrokerData | null {
  const [data, setData] = useState<ChannelBrokerData | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 端點不分 ticker（全上櫃市場當日彙總），無 query 參數。
        const res = await fetch('/api/skynet/channel-broker', { cache: 'no-store' });
        const body = (await res.json()) as ChannelBrokerResponse;
        if (cancelled) return;
        // ok:true → 回 data（含 hasBrokerActivity flag）；ok:false / 異常 → null（未入庫分支）
        setData(body.ok && body.data ? body.data : null);
      } catch {
        if (!cancelled) setData(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
