/**
 * M7 加權指數近 10 日迷你圖 —— SPEC 會員四頁 §M7，外殼逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * ⚠ capture 的 recharts AreaChart（150×36，stroke #ef4444、漸層 sp-u）資料是
 *   「加權指數近 10 日」收盤序列；本站目前無對接來源（/api/skynet/kline 需
 *   Fugle API Key，且為個股 K 線，非指數日線）。依規格書 §5 誠實標示：
 *   保留 capture 外殼與標題，圖面以 animate-pulse 骨架 + role="status" 呈現，
 *   不嵌入快照 SVG 路徑冒充當日走勢，也不造假序列。
 *
 * 右半格在快照中本來就是空的（grid grid-cols-2 只有一格內容），照抄。
 */
import type { ReactElement } from 'react';

export default function IndexMiniChart(): ReactElement {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3">
      <div className="data-panel hud-panel glass rounded-2xl p-3.5  ">
        <p className="text-[11px] font-bold text-muted">加權指數 近 10 日</p>
        <div className="mt-1">
          <div
            style={{ width: '150px', height: '36px' }}
            className="relative overflow-hidden rounded bg-surface-2"
            role="status"
            aria-label="加權指數近 10 日資料尚未入庫"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-pulse bg-gradient-to-t from-transparent to-surface-2"
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-muted">
              資料尚未入庫
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
