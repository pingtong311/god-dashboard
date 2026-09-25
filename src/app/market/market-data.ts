/**
 * /market 頁 — 格式工具與「無對接來源」區塊的實站快照常數。
 * ----------------------------------------------------------------------------
 * ⚠ 依專案既有慣例（見 @/components/IndexMarquee 的 SNAPSHOT、
 *   @/components/FuturesOptionsPanel 的 SNAPSHOT）：沒有對接資料來源的欄位先以
 *   「實站 capture 逐字快照」呈現，並在註解標明，待來源接入後改為動態注入。
 *   絕不用 Math.random 或自行捏造數字。
 *
 * 有真實來源的區塊（M6 台指期／加權、M12 上市廣度）不走本檔，直接 fetch
 *   /api/skynet/futures、/api/skynet/market-overview（與 /diary 同慣例）。
 */

/** 上櫃（櫃買）廣度卡快照（tab-market.html 逐字）。
 * 櫃買指數與上櫃漲跌家數目前無對接來源（TPEx 行情管線未入庫），先以快照呈現。 */
export const OTC_BREADTH_SNAPSHOT = {
  price: '412.99',
  changePercent: -0.18,
  up: 338,
  down: 347,
  /** 平均漲跌（快照值；本站行情管線未提供全市場平均漲跌，無法動態計算）。 */
  averageChange: '+0.26%',
  /** 成交金額（億，快照值）。 */
  turnoverInBillions: '1,937',
} as const;

/** 指數點數格式化（與 IndexMarquee 同口徑：zh-Hant 千分位）。 */
export function formatIndexPrice(price: number): string {
  return price.toLocaleString('zh-Hant');
}

/** 期貨整數報價格式化（48123 → '48,123'）。 */
export function formatFuturesPrice(price: number): string {
  return Math.round(price).toLocaleString('zh-Hant');
}

/** 漲跌%格式化（帶正負號；null／無效 → '--'，絕不偽裝 0）。 */
export function formatSignedPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '--';
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** 漲跌顏色語意（紅漲綠跌）：null／無效用 text-muted，平盤用 text-ink。 */
export function priceTone(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return 'text-muted';
  if (percent === 0) return 'text-ink';
  return percent > 0 ? 'text-up' : 'text-down';
}

/**
 * 市場廣度 badge 標籤：漲跌家數差距小於等於總和 25% 時標「廣度接近」
 * （capture 兩張卡 368/505、338/347 皆命中此規則，故照抄此結果）。
 * 無資料或總和為 0 時回 null（不顯示 badge）。
 */
export function breadthLabel(up: number, down: number): string | null {
  const total = up + down;
  if (total <= 0) return null;
  return Math.abs(up - down) / total <= 0.25 ? '廣度接近' : null;
}
