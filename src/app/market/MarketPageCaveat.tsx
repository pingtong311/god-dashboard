/**
 * M14 頁尾資料口徑（market 頁尾變體）—— SPEC 會員四頁 §M14／§0-3。
 * ----------------------------------------------------------------------------
 * 外殼用共用元件 DataCaveatDetails；內文為本頁變體：
 *   「時點：收盤快照　資料日 YYYY-MM-DD」＋熱力圖／產業表口徑條。
 *
 * 資料日取最新交易日（loadMarketOverview，TWSE 行情管線）；
 * 上游不可用時標「尚未入庫」，不寫死日期。
 */
import type { ReactElement } from 'react';
import DataCaveatDetails from '@/components/DataCaveatDetails';
import { loadMarketOverview } from '@/lib/marketOverview';

/** 同步呈現元件（測試直接用）；資料日由 caller 傳入。 */
export function MarketCaveatView({ dataDate }: { dataDate: string }): ReactElement {
  return (
    <DataCaveatDetails>
      <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
      <p>{`時點：收盤快照　資料日 ${dataDate}`}</p>
      <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
      <p>
        熱力圖面積為成交額、顏色為漲跌幅；產業分類缺失時會改標成交額熱力（前 N
        檔）。產業表是成交動能（估算），不是法人買賣超。
      </p>
      <p>以上是已發生的公開統計，不是進出建議。</p>
    </DataCaveatDetails>
  );
}

export default async function MarketPageCaveat(): Promise<ReactElement> {
  let dataDate = '尚未入庫';
  try {
    const overview = await loadMarketOverview();
    dataDate = overview.date;
  } catch {
    // 上游不可用時不讓整頁掛掉；載入失敗的區塊各自顯示 '--'。
  }
  return <MarketCaveatView dataDate={dataDate} />;
}
