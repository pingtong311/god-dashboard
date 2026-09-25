/**
 * M3 客觀漲跌摘要（規則加總）—— SPEC 會員四頁 §M3，逐字複刻 tab-market.html。
 * ----------------------------------------------------------------------------
 * ⚠ 明細項目（費半／那斯達克／韓國／台幣／外資期貨淨未平倉）目前**無對接來源**，
 *   先以實站快照逐字呈現（與 IndexMarquee／FuturesOptionsPanel 同策略）。
 *
 * 結論句由規則輸出（SPEC：「結論句顏色與明細數量由後端規則輸出」）：
 *   下跌項目較多 → 「外圍市場下跌項目較多」+ text-red-400 + 紅色左邊框（capture 樣式）
 *   上漲項目較多 → 「外圍市場上漲項目較多」+ text-up + 綠色左邊框
 *   勢均力敵     → 「外圍市場漲跌互見」（盤中快照版 states/tab-market/00 即此文案）
 */
import type { ReactNode, ReactElement } from 'react';

type Direction = 'up' | 'down';

type SummaryItem = {
  direction: Direction;
  node: ReactNode;
};

/** 實站快照明細（tab-market.html 逐字，5 條）。 */
const SNAPSHOT_ITEMS: readonly SummaryItem[] = [
  {
    direction: 'down',
    node: (
      <>
        · 費城
        <a href="/sector/?cat=semiconductor" className="font-bold text-accent underline">
          半導體
        </a>
        跌 1.82%
      </>
    ),
  },
  { direction: 'down', node: <>· 那斯達克跌 0.78%</> },
  { direction: 'up', node: <>· 韓國綜合漲 1.04%</> },
  { direction: 'down', node: <>· 台幣相對美元貶值</> },
  { direction: 'down', node: <>· 外資期貨淨未平倉 -77,031 口</> },
];

type Verdict = {
  label: string;
  valueTone: string;
  rail: string;
};

/** 依漲跌項目數量規則算出結論句與配色。 */
function computeVerdict(items: readonly SummaryItem[]): Verdict {
  const up = items.filter((item) => item.direction === 'up').length;
  const down = items.filter((item) => item.direction === 'down').length;
  if (down > up) {
    return { label: '外圍市場下跌項目較多', valueTone: 'text-red-400', rail: 'border-l-red-500' };
  }
  if (up > down) {
    return { label: '外圍市場上漲項目較多', valueTone: 'text-up', rail: 'border-l-emerald-500' };
  }
  return { label: '外圍市場漲跌互見', valueTone: 'text-muted', rail: 'border-l-line' };
}

export default function MarketSummaryPanel(): ReactElement {
  const verdict = computeVerdict(SNAPSHOT_ITEMS);

  return (
    <div
      className={`data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 ${verdict.rail}`}
    >
      <p className="text-sm font-bold text-muted">客觀漲跌摘要（規則加總）</p>
      <p className={`mt-1 text-xl font-black ${verdict.valueTone}`}>{verdict.label}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed">
        依目前或最近收盤的客觀漲跌加總；不代表台股後續方向，也不構成多空操作指引。
      </p>
      <ul className="mt-2 grid gap-1 text-[12.5px] text-muted">
        {SNAPSHOT_ITEMS.map((item, index) => (
          <li key={index}>{item.node}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        依台指期、費半、那斯達克、台幣匯率自動加權判讀；為氣氛描述，非漲跌預測。
      </p>
    </div>
  );
}
