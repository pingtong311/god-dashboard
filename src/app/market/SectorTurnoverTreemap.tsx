/**
 * M8 產業成交額熱力（treemap）—— SPEC 會員四頁 §M8，外殼逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * ⚠ 15 格 button 的「產業成交額」資料目前無對接來源：
 *   - /api/skynet/treemap 是「市值族群熱圖」（面積∝市值、依股票名稱關鍵字分類），
 *     語意與本區塊「面積＝成交額、顏色＝漲跌幅」不同，不能混用；
 *   - TWSE／TPEx 官方產業成交額統計表未入庫。
 *   依規格書 §5 誠實標示：保留 section 外殼、標題與頁尾說明，圖面以
 *   animate-pulse 骨架 + role="status" 呈現，不手刻座標、不造假數字。
 */
import type { ReactElement } from 'react';

export default function SectorTurnoverTreemap(): ReactElement {
  return (
    <section className="mt-4 overflow-x-clip">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-black text-ink">產業成交額熱力</h2>
          <p className="text-[12px] text-muted">
            面積＝成交額，顏色＝漲跌幅（紅漲綠跌）　資料尚未入庫
          </p>
        </div>
      </div>
      <div className="relative w-full overflow-hidden rounded-2xl border border-line">
        <div className="relative w-full" style={{ paddingTop: '62%' }}>
          <div
            className="absolute inset-0 animate-pulse bg-surface-2"
            role="status"
            aria-label="產業成交額熱力圖資料尚未入庫"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-muted">
            資料尚未入庫
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        公開市場成交統計（價、量、漲跌幅），漲跌幅以交易所參考價為基準，除權息日不失真；僅描述已發生的成交，不構成任何買賣建議。
      </p>
    </section>
  );
}
