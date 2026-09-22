/**
 * 個股結構結論與白話版結論（chart.md §4 / §6 對齊）
 *
 * 施工原則（spec §0/§8 明令）：
 * - 所有數字一律由「公開 K 線/均線/MACD」即時計算，**不得硬編碼樣本數字**。
 * - 樣本數字（如 346.88、150.83）僅為影片幀內容，作為欄位形狀參考。
 * - 讀不到 / 資料不足的欄位回傳 null，UI 顯示「--」，不補腦。
 */

import type { ChartCandle } from '@/types/kline';
import { calculateMACD } from '@/lib/indicators';

// ── 格式化工具 ─────────────────────────────────────────

/** 數值格式化：null/NaN → '--'，否則保留 2 位小數。 */
function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

/** 有符號百分比：null → '--'。 */
function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// ── 個股結構結論（§4，三條） ─────────────────────────────

export interface StructConclusion {
  /** 上沿壓力（近 20 日最高） */
  resistance: number | null;
  /** 上沿 20 日變化率（%） */
  resistanceChangePct: number | null;
  /** 短期均線（SMA5 現值） */
  shortMa: number | null;
  /** 中期均線（SMA20 現值） */
  midMa: number | null;
  /** 短均 > 中均 */
  shortAboveMid: boolean;
  /** 收盤是否接近壓力區（收 > 壓力 - 3%） */
  closeNearResistance: boolean;
  /** 下方支撐（近 20 日最低） */
  support: number | null;
  /** 上沿距下沿幅度（%） */
  rangePct: number | null;
  /** 收盤是否跌破支撐 */
  brokeSupport: boolean;
  /** 量比（今量 / 20 日均量） */
  volumeRatio: number | null;
  /** 收盤是否高於當日均量基準的「放量」判定（量比 > 1） */
  volumeHeavy: boolean;
  /** 收盤位置（高區/低區/中區），依收盤在近 20 日區間的位置 */
  closePosition: '高區' | '低區' | '中區' | '—';
  /** 收盤價 */
  close: number | null;
}

/**
 * 由最後一根 K 棒＋近 20 日區間，產出三條結構結論所需的數值。
 * 全部為公開 K 線可算；樣本數字絕不寫死。
 */
export function computeStructuralConclusion(candles: ChartCandle[]): StructConclusion | null {
  if (!candles || candles.length < 21) return null;

  const last = candles[candles.length - 1];
  const window = candles.slice(-20);
  const recentHigh = Math.max(...window.map((c) => c.high));
  const recentLow = Math.min(...window.map((c) => c.low));

  // 上沿 20 日變化：20 日前的最高 對 現在的Highest（用 SMA20 的位移近似上沿移動）
  const sma20Now = last.sma20 ?? null;
  const sma20Prev = candles[candles.length - 21].sma20 ?? null;
  const resistanceChangePct =
    sma20Now != null && sma20Prev != null && sma20Prev !== 0
      ? ((sma20Now - sma20Prev) / sma20Prev) * 100
      : null;

  const shortMa = last.sma5 ?? null;
  const midMa = last.sma20 ?? null;

  // 量比：今量 / 前 20 日均量（不含今日，避免自我比較）
  const vols = candles.slice(-21, -1).map((c) => c.volume).filter((v) => Number.isFinite(v) && v > 0);
  const avgVol = vols.length ? vols.reduce((a, v) => a + v, 0) / vols.length : null;
  const volumeRatio = avgVol && last.volume > 0 ? last.volume / avgVol : null;

  const rangePct = recentHigh !== recentLow ? ((recentHigh - recentLow) / recentLow) * 100 : null;
  const close = last.close;
  const rangeMid = (recentHigh + recentLow) / 2;
  const closePosition: StructConclusion['closePosition'] =
    recentHigh === recentLow
      ? '—'
      : close > rangeMid + (recentHigh - recentLow) * 0.15
        ? '高區'
        : close < rangeMid - (recentHigh - recentLow) * 0.15
          ? '低區'
          : '中區';

  return {
    resistance: recentHigh,
    resistanceChangePct,
    shortMa,
    midMa,
    shortAboveMid: shortMa != null && midMa != null && shortMa > midMa,
    closeNearResistance: recentHigh > 0 && close > recentHigh * 0.97,
    support: recentLow,
    rangePct,
    brokeSupport: close < recentLow,
    volumeRatio,
    volumeHeavy: volumeRatio != null && volumeRatio > 1,
    closePosition,
    close,
  };
}

/**
 * 依 §4 三條結論的句型，產出白話文字（數字全來自 computeStructuralConclusion）。
 * 個股名稱以 quote.name 帶入，樣本名稱（大立光/台虹）一律不硬編碼。
 */
export function buildStructLines(
  s: StructConclusion,
  name: string
): { text: string }[] {
  const who = name.trim() || '該股';

  const line1 = s.shortAboveMid
    ? `1. 上沿均線持續上移 → ${who} 上沿 ${fmt(s.resistance)} 元、近期均線變化 ${fmtPct(s.resistanceChangePct)}，短期均線 ${fmt(s.shortMa)} 元，中期均線 ${fmt(s.midMa)} 元，短均 > 中均，走勢偏多。`
    : `1. 上沿均線未持續上移 → ${who} 上沿 ${fmt(s.resistance)} 元、近期均線變化 ${fmtPct(s.resistanceChangePct)}，短期均線 ${fmt(s.shortMa)} 元，中期均線 ${fmt(s.midMa)} 元，短均未站上中均，走勢未偏多。`;

  const line2 = s.brokeSupport
    ? `2. 收盤已跌破下方支撐 ${fmt(s.support)} 元：上沿距下沿約 ${fmtPct(s.rangePct)}，均線結構轉弱，需降低期待。`
    : `2. 下方支撐 ${fmt(s.support)} 元：上沿距下沿約 ${fmtPct(s.rangePct)}，若跌破支撐 ${fmt(s.support)}，均線結構可能轉弱，需降低期待。`;

  const volumePart = s.volumeHeavy
    ? `量比 ${fmt(s.volumeRatio)}（高於 20 日均量），放量偏多`
    : `量比 ${fmt(s.volumeRatio)}（未達 20 日均量），量能未放大`;

  const line3 = s.closeNearResistance
    ? `3. 收 ${fmt(s.close)} 接近壓力 ${fmt(s.resistance)}（上沿），${volumePart}，收在${s.closePosition}。`
    : `3. 收 ${fmt(s.close)} 未接近壓力 ${fmt(s.resistance)}（上沿），${volumePart}，收在${s.closePosition}。`;

  return [
    { text: line1 },
    { text: line2 },
    { text: line3 },
  ];
}

// ── 白話版結論（§6） ────────────────────────────────────

export interface PlainConclusion {
  /** 趨勢判斷：「上升趨勢」/「下降趨勢」/「盤整」 */
  trend: '上升趨勢' | '下降趨勢' | '盤整' | '—';
  /** 收盤 vs 20 日線 */
  close: number | null;
  ma20: number | null;
  closeAboveMa20: boolean;
  /** MACD 動能：DIF vs DEA */
  dif: number | null;
  dea: number | null;
  macdPositive: boolean;
  /** 9 日區間距（收盤到 9 日前收盤的距離 %） */
  nineDayDistancePct: number | null;
  /** 量變化方向：放大/收縮 */
  volumeTrend: '放大' | '收縮' | '—';
  /** 誰在上面：收盤 / MA20 / MACD 零軸 的相對關係白話 */
  aboveBelow: string[];
}

/**
 * 由均線/MACD/量產出白話結論（§6：「誰在上面、誰在下面、誰在放、誰在縮」）。
 * 所有數字即時計算，不硬編碼；資料不足時給 '—' 且不腦補。
 */
export function computePlainConclusion(candles: ChartCandle[]): PlainConclusion | null {
  if (!candles || candles.length < 30) return null;

  const last = candles[candles.length - 1];
  const close = last.close;
  const ma20 = last.sma20 ?? null;
  const closeAboveMa20 = ma20 != null && close > ma20;

  // MACD（以 closes 重算，確保有 DIF/DEA）
  const closes = candles.map((c) => c.close);
  const macd = calculateMACD(closes);
  const dif = macd.dif[closes.length - 1] ?? null;
  const dea = macd.signal[closes.length - 1] ?? null;
  const macdPositive = dif != null && dea != null && dif > dea;

  // 9 日前收盤距離（%）
  const nineAgo = candles.length - 10 >= 0 ? closes[closes.length - 10] : null;
  const nineDayDistancePct =
    nineAgo != null && nineAgo !== 0 ? ((close - nineAgo) / nineAgo) * 100 : null;

  // 量變化：近 5 日均量 vs 前 5 日均量
  const vols = candles.map((c) => c.volume).filter((v) => Number.isFinite(v) && v >= 0);
  let volumeTrend: PlainConclusion['volumeTrend'] = '—';
  if (vols.length >= 10) {
    const recent5 = vols.slice(-5).reduce((a, v) => a + v, 0) / 5;
    const prev5 = vols.slice(-10, -5).reduce((a, v) => a + v, 0) / 5;
    if (prev5 > 0) volumeTrend = recent5 >= prev5 ? '放大' : '收縮';
  }

  // 趨勢：MA 多空排列（SMA5 > SMA20）→ 上升；反之下降；否則盤整
  const shortMa = last.sma5 ?? null;
  let trend: PlainConclusion['trend'] = '—';
  if (shortMa != null && ma20 != null) {
    trend = shortMa > ma20 ? '上升趨勢' : shortMa < ma20 ? '下降趨勢' : '盤整';
  }

  const aboveBelow: string[] = [];
  if (ma20 != null) aboveBelow.push(closeAboveMa20 ? '收盤在 20 日線上面' : '收盤在 20 日線下面');
  if (dif != null && dea != null) aboveBelow.push(macdPositive ? 'MACD DIF 在 DEA 上面（動能偏多）' : 'MACD DIF 在 DEA 下面（動能偏空）');
  if (volumeTrend !== '—') aboveBelow.push(`成交量${volumeTrend}`);

  return {
    trend,
    close,
    ma20,
    closeAboveMa20,
    dif,
    dea,
    macdPositive,
    nineDayDistancePct,
    volumeTrend,
    aboveBelow,
  };
}

/** 依 §6 句型產出白話結論內文（數字全來自 computePlainConclusion，不補腦）。 */
export function buildPlainLines(p: PlainConclusion): { heading: string; body: string[] } {
  const body: string[] = [];
  body.push(
    `近收 ${fmt(p.close)}，收在 20 日線 ${fmt(p.ma20)} ${
      p.closeAboveMa20 ? '以上' : '以下'
    }，20 日動能${p.macdPositive ? '偏多，構成最近一段的成本推升' : '偏空，成本區尚未站穩'}。`
  );
  if (p.nineDayDistancePct != null) {
    body.push(
      `距離 9 日前收盤約 ${fmtPct(p.nineDayDistancePct)}：${
        p.nineDayDistancePct > 0 ? '價格站得起來' : '價格仍弱'
      }。`
    );
  }
  for (const line of p.aboveBelow) body.push(line + '。');
  body.push(
    `現在的量能${p.volumeTrend === '放大' ? '在放' : p.volumeTrend === '收縮' ? '在縮' : '變化不明'}，` +
      `${p.trend === '上升趨勢' ? '結構是上升趨勢' : p.trend === '下降趨勢' ? '結構是下降趨勢' : p.trend === '盤整' ? '結構是盤整' : '結構待觀察'}。`
  );

  return {
    heading: `白話版結論：現在的結構是「${p.trend === '—' ? '待觀察' : p.trend}」`,
    body,
  };
}
