/**
 * 資料日期與口徑（today.html 結尾 <details>）—— 外殼用共用元件，內文逐字。
 * ----------------------------------------------------------------------------
 * 「資料日」取 loadMarketOverview 的最新交易日（server component，與
 * @/components/IndexMarquee 同策略；模組層 TTL 快取，與跑馬燈共用同一份）。
 * 上游不可用時標「尚未取得」，不放推測日期。
 */
import type { ReactElement } from 'react';
import DataCaveatDetails from '@/components/DataCaveatDetails';
import { loadMarketOverview } from '@/lib/marketOverview';

export default async function TodayCaveat(): Promise<ReactElement> {
  let date = '尚未取得';
  try {
    date = (await loadMarketOverview()).date;
  } catch {
    // 上游不可用時誠實標示，不放推測日期。
  }

  return (
    <DataCaveatDetails>
      <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
      <p>時點：盤後統計　資料日 {date}</p>
      <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
      <p>法人、處置、注意股缺口見各模組說明。</p>
      <p>以上是已發生的公開統計，不是進出建議。</p>
    </DataCaveatDetails>
  );
}
