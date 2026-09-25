/**
 * 「台灣市場」分頁內容（M5–M13）—— server component。
 * ----------------------------------------------------------------------------
 * 由 page.tsx 透過 MarketTabs（client）以 children 傳入，全部在 server side 組好。
 * M5／M11 是純標題列；M6／M12 是 client 元件（前端 fetch 自家 API）；
 * M7／M8／M9 無對接來源，保留 capture 外殼 + 誠實骨架；M10 用共用元件
 * FuturesOptionsPanel（async server component，自己 loadFuturesOptions）。
 */
import type { ReactElement } from 'react';
import FuturesOptionsPanel from '@/components/FuturesOptionsPanel';
import FuturesIndexStats from './FuturesIndexStats';
import IndexMiniChart from './IndexMiniChart';
import MarketBreadthCards from './MarketBreadthCards';
import SectorMomentumTable from './SectorMomentumTable';
import SectorTurnoverTreemap from './SectorTurnoverTreemap';

function SectionTitle({ children }: { children: string }): ReactElement {
  return (
    <div className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{children}</h2>
        </div>
      </div>
    </div>
  );
}

export default function TaiwanMarketTab(): ReactElement {
  return (
    <>
      {/* M5 區塊標題列（裝飾性，非卡片） */}
      <SectionTitle>台指期 × 加權指數</SectionTitle>

      {/* M6 台指期 × 加權指數 4 格 data-stat */}
      <FuturesIndexStats />

      {/* M7 加權指數近 10 日迷你圖（資料尚未入庫：骨架） */}
      <IndexMiniChart />

      {/* M8 產業成交額熱力（資料尚未入庫：骨架） */}
      <SectorTurnoverTreemap />

      {/* M9 成交動能（估算）表格 + M9b 口徑（資料尚未入庫：骨架） */}
      <SectorMomentumTable />

      {/* M10 大盤期權（共用元件，與 /today 同結構） */}
      <div className="mt-4">
        <FuturesOptionsPanel />
      </div>

      {/* M11 區塊標題列（裝飾性，非卡片） */}
      <SectionTitle>上市 vs 上櫃市場廣度</SectionTitle>

      {/* M12 上市／上櫃兩張廣度卡 */}
      <MarketBreadthCards />

      {/* M13 更新頻率說明 */}
      <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm leading-relaxed text-muted">
        台股區塊盤中約每分鐘更新；國際市場為延遲報價。期貨若含夜盤報價、現貨已收盤時，期現價差會偏大，僅供參考。連動說明為歷史經驗描述，非因果保證。
      </p>
    </>
  );
}
