/**
 * /today 今日戰情 —— 圖示 path 常數與格式工具。
 * ----------------------------------------------------------------------------
 * 所有 SVG path 逐字取自 captured/login-capture/html/today.html（Phosphor 系列，
 * fill="currentColor"、viewBox="0 0 256 256"），寬度由呼叫端指定。
 *
 * ⚠ 依專案既有慣例（見 @/components/IndexMarquee 的 SNAPSHOT、
 *   @/app/market/market-data.ts）：沒有對接資料來源的欄位先以「實站 capture 逐字
 *   快照」呈現並在註解標明；有真實來源的欄位一律由資料算出，絕不用 Math.random
 *   或自行捏造數字。
 */

// Phosphor MagnifyingGlass —— 「查個股」（常用工具，20px）
export const ICON_SEARCH =
  'M232.49,215.51,185,168a92.12,92.12,0,1,0-17,17l47.53,47.54a12,12,0,0,0,17-17ZM44,112a68,68,0,1,1,68,68A68.07,68.07,0,0,1,44,112Z';

// Phosphor Article —— 「看日報」與小卡「日報」（20px / 17px，同一 path）
export const ICON_ARTICLE =
  'M92,108a12,12,0,0,1,12-12h72a12,12,0,0,1,0,24H104A12,12,0,0,1,92,108Zm12,52h72a12,12,0,0,0,0-24H104a12,12,0,0,0,0,24ZM236,64V184a28,28,0,0,1-28,28H36A32,32,0,0,1,4,180V88a12,12,0,0,1,24,0v92a8,8,0,0,0,16,0V64A20,20,0,0,1,64,44H216A20,20,0,0,1,236,64Zm-24,4H68V180a32,32,0,0,1-1,8H208a4,4,0,0,0,4-4Z';

// Phosphor Star —— 「自選股」與小卡「自選」（20px / 17px，同一 path）
export const ICON_STAR =
  'M243,96a20.33,20.33,0,0,0-17.74-14l-56.59-4.57L146.83,24.62a20.36,20.36,0,0,0-37.66,0L87.35,77.44,30.76,82A20.45,20.45,0,0,0,19.1,117.88l43.18,37.24-13.2,55.7A20.37,20.37,0,0,0,79.57,233L128,203.19,176.43,233a20.39,20.39,0,0,0,30.49-22.15l-13.2-55.7,43.18-37.24A20.43,20.43,0,0,0,243,96ZM172.53,141.7a12,12,0,0,0-3.84,11.86L181.58,208l-47.29-29.08a12,12,0,0,0-12.58,0L74.42,208l12.89-54.4a12,12,0,0,0-3.84-11.86L41.2,105.24l55.4-4.47a12,12,0,0,0,10.13-7.38L128,41.89l21.27,51.5a12,12,0,0,0,10.13,7.38l55.4,4.47Z';

// Phosphor Dumbbell —— 「練功房」（常用工具，20px）
export const ICON_DUMBBELL =
  'M244,116V88a20,20,0,0,0-20-20H208V64a20,20,0,0,0-20-20H164a20,20,0,0,0-20,20v52H112V64A20,20,0,0,0,92,44H68A20,20,0,0,0,48,64v4H32A20,20,0,0,0,12,88v28a12,12,0,0,0,0,24v28a20,20,0,0,0,20,20H48v4a20,20,0,0,0,20,20H92a20,20,0,0,0,20-20V140h32v52a20,20,0,0,0,20,20h24a20,20,0,0,0,20-20v-4h16a20,20,0,0,0,20-20V140a12,12,0,0,0,0-24ZM36,164V92H48v72Zm52,24H72V68H88Zm96,0H168V68h16Zm36-24H208V92h12Z';

// Phosphor GridFour —— 「全部工具」連結（18px）
export const ICON_GRID =
  'M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z';

// Phosphor Warning —— 「注意與處置」標題（18px）
export const ICON_WARNING =
  'M240.26,186.1,152.81,34.23h0a28.74,28.74,0,0,0-49.62,0L15.74,186.1a27.45,27.45,0,0,0,0,27.71A28.31,28.31,0,0,0,40.55,228h174.9a28.31,28.31,0,0,0,24.79-14.19A27.45,27.45,0,0,0,240.26,186.1Zm-20.8,15.7a4.46,4.46,0,0,1-4,2.2H40.55a4.46,4.46,0,0,1-4-2.2,3.56,3.56,0,0,1,0-3.73L124,46.2a4.77,4.77,0,0,1,8,0l87.44,151.87A3.56,3.56,0,0,1,219.46,201.8ZM116,136V104a12,12,0,0,1,24,0v32a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,176Z';

// Phosphor ChartLineUp —— 「法人買超 Top3」標題（18px）
export const ICON_CHART_UP =
  'M108.62,103.79a12,12,0,0,1,7.59-15.17l12-4A12,12,0,0,1,144,96v40a12,12,0,0,1-24,0V112h0A12,12,0,0,1,108.62,103.79ZM252,208a12,12,0,0,1-12,12H16a12,12,0,0,1,0-24h4V104A20,20,0,0,1,40,84H76V56A20,20,0,0,1,96,36h64a20,20,0,0,1,20,20v68h36a20,20,0,0,1,20,20v52h4A12,12,0,0,1,252,208Zm-72-60v48h32V148Zm-80,48h56V60H100Zm-56,0H76V108H44Z';

// Phosphor ChartLine —— 小卡「盤感」標題（17px）
export const ICON_PULSE =
  'M244,128a12,12,0,0,1-12,12H207.42l-36.69,73.37A12,12,0,0,1,160,220h-.6a12,12,0,0,1-10.61-7.72L95,71.15,66.92,133A12,12,0,0,1,56,140H24a12,12,0,0,1,0-24H48.27L85.08,35a12,12,0,0,1,22.13.7l54.28,142.46,27.78-55.56A12,12,0,0,1,200,116h32A12,12,0,0,1,244,128Z';

// ── 格式工具（與 @/app/market/market-data.ts 同口徑） ──────────────────────

/** 指數點數格式化（zh-Hant 千分位；48024.6 → '48,024.6'）。 */
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

/** 成交金額（元）→ 兆（2 位小數，9400 億 → '0.94 兆'）。 */
export function formatTrillions(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return '--';
  return `${(yuan / 1e12).toFixed(2)} 兆`;
}

/** 法人淨買賣超（張）格式化：正數帶 '+'、負數帶 '-'（-398907 → '-398,907 張'）。 */
export function formatSignedLots(lots: number): string {
  if (!Number.isFinite(lots)) return '-- 張';
  return `${lots > 0 ? '+' : ''}${lots.toLocaleString('zh-Hant')} 張`;
}

// ── 排行頭像底色（裝飾用，aria-hidden） ───────────────────────────────────

/**
 * 實站 capture 的排行頭像為漸層圓 + 股票名首字（today.html；tab-today.html 部分
 * 改用站方 favicon 圖片，本站無公司網域對應表，統一用漸層首字版本）。
 * 底色由股票代號 hash 決定（同代號永遠同色），純裝飾、不承载資料語意。
 */
const AVATAR_BASES: ReadonlyArray<ReadonlyArray<number>> = [
  [54, 120, 86], // 綠（capture 合晶 6182）
  [66, 120, 54], // 橄欖（capture 南亞 1303）
  [54, 58, 120], // 藍（capture 南茂 8150）
  [120, 54, 86],
  [54, 120, 120],
  [120, 86, 54],
  [86, 54, 120],
  [120, 120, 54],
];

/** 由股票代號算出固定漸層（135deg，暗色收尾）。 */
export function avatarGradient(symbol: string): string {
  let hash = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 31 + symbol.charCodeAt(index)) >>> 0;
  }
  const [r, g, b] = AVATAR_BASES[hash % AVATAR_BASES.length]!;
  return `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgb(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)}))`;
}
