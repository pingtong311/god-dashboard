/**
 * M9 成交動能（估算）表格 + M9b 口徑 —— SPEC 會員四頁 §M9，逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * ⚠ 16 個產業的「近 1／5 日成交額與漲跌」目前無對接來源（官方產業成交金額表
 *   未入庫；本站行情管線只有全市場總額與類股指數，無產業別成交額）。
 *   依規格書 §5 誠實標示：保留 section 外殼、標題、表頭與口徑 <details>，
 *   tbody 以 animate-pulse 骨架列 + role="status" 呈現，不造假數字、不寫死條寬。
 *
 * M9b 口徑 <details> 包在這個 section 裡面（SPEC 明確要求），用共用元件
 * DataCaveatDetails；「資料日」欄位照實標「尚未入庫」。
 */
import type { ReactElement } from 'react';
import DataCaveatDetails from '@/components/DataCaveatDetails';

const SKELETON_ROW_COUNT = 6;

export default function SectorMomentumTable(): ReactElement {
  return (
    <section className="mt-4 overflow-x-clip pb-4 pr-14" aria-label="產業成交動能">
      <h2 className="text-[14px] font-black text-ink">成交動能（估算），不是法人買賣超</h2>
      <p className="text-[12px] text-muted">近 1／5 日產業成交額與漲跌　資料尚未入庫</p>
      <div className="mt-2 overflow-x-clip rounded-2xl border border-line">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-surface-2 text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2 font-bold">產業</th>
              <th className="px-2 py-2 font-bold">1 日</th>
              <th className="px-2 py-2 font-bold">5 日</th>
              <th className="px-2 py-2 font-bold">漲跌</th>
            </tr>
          </thead>
          <tbody role="status" aria-label="成交動能資料尚未入庫">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
              <tr key={rowIndex} className="border-t border-line/70 bg-surface">
                <td className="max-w-[9rem] truncate px-3 py-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
                </td>
                <td className="px-2 py-2">
                  <div className="h-2 max-w-[6rem] animate-pulse rounded bg-surface-2" />
                </td>
                <td className="px-2 py-2">
                  <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
                </td>
                <td className="px-2 py-2">
                  <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataCaveatDetails>
        <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
        <p>時點：盤後統計　資料日 尚未入庫</p>
        <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
        <p>
          近 1 日＝該產業當日成交金額；近 5 日＝最近 5
          個交易日加總。漲跌＝相對前一窗成交額變化，或成分股成交額加權漲跌幅。動能估＝成交額 ×
          sign(漲跌)。這不是法人買賣超，也不是資金流向結論。本表依官方產業成交金額表（非法人買賣超欄）。
        </p>
        <p>以上是已發生的公開統計，不是進出建議。</p>
      </DataCaveatDetails>
    </section>
  );
}
