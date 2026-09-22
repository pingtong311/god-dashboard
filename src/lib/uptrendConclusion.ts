/**
 * /chart「白話版結論」純函數（chart.md §6，可單測、不造假）
 *
 * 依據「上上升勢」判定結果與最新K棒數值，產出白話版結論。
 * 原則：
 * - 結論只寫「能確認的」（chart.md §6「低信心處只寫能確認的」）：
 *   只用 上升K線數、收盤、均線、MACD DIF/DEA 等已計算出的數值，不腦補。
 * - 小標文案逐字：`白話版：現在的結構是「上升趨勢」`（僅當判定為上升趨勢時；
 *   非上升時小標逐字 `白話版：現在沒有確認的趨勢`，內文只寫能確認的數值）。
 * - 說明文字逐字（chart.md §5 圖下說明）：
 *   `圖上可以自己閱讀均線 + MACD + RSI + 下圖那些數字就是從這裡算出來的。`
 */

import type { UptrendSample } from './uptrendDetector';

export interface ConclusionInputs {
  /** 上升K線數判定樣本（無資料時 null）。 */
  sample: UptrendSample | null;
  /** 最新一根的 MACD DIF（無資料時 null）。 */
  dif?: number | null;
  /** 最新一根的 MACD DEA/Signal（無資料時 null）。 */
  dea?: number | null;
  /** 股票名稱（供文案引用；無時省略）。 */
  name?: string | null;
}

export interface PlainConclusion {
  /** 是否判定為「上升趨勢」（上升K線數 ≥ 4 且最新收盤收在均線之上）。 */
  isUptrend: boolean;
  /** 小標逐字文案。 */
  headline: string;
  /** 內文（逐字規則產出；低信心處只寫能確認的）。 */
  body: string;
  /** 圖下說明逐字（chart.md §5）。 */
  note: string;
}

/** 小標逐字（chart.md §6 f_0080）。 */
export const UPTREND_HEADLINE = '白話版：現在的結構是「上升趨勢」';
/** 非上升時的保守小標（只寫能確認的，不腦補結構）。 */
export const NEUTRAL_HEADLINE = '白話版：現在沒有確認的趨勢';
/** 圖下說明逐字（chart.md §5 f_0062/f_0080）。 */
export const CHART_NOTE_TEXT =
  '圖上可以自己閱讀均線 + MACD + RSI + 下圖那些數字就是從這裡算出來的。';

function fmt(value: number | null, digits = 2): string {
  return value != null && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function signed(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

/**
 * 產生白話版結論（純函數）。
 * 規則：
 * 1. sample 為 null（無資料）→ 中性小標 + 僅寫「目前沒有可確認的K線資料」。
 * 2. 上升K線數 ≥ 4 且最新收盤收在均線之上 → 上升小標（逐字）；
 *    內文只列能確認的數值：上升K線數、收盤、均線、DIF vs DEA（有值才寫）。
 * 3. 其他 → 中性小標；內文列 上升K線數 與 收盤，不做結構判定。
 */
export function buildPlainConclusion(inputs: ConclusionInputs): PlainConclusion {
  const { sample, dif, dea, name } = inputs;
  const label = name ? `「${name}」` : '';

  if (sample == null) {
    return {
      isUptrend: false,
      headline: NEUTRAL_HEADLINE,
      body: '目前沒有可確認的K線資料，不判斷結構。',
      note: CHART_NOTE_TEXT,
    };
  }

  const closeAboveMa =
    sample.ma != null && Number.isFinite(sample.ma) ? sample.close > sample.ma : false;
  const isUptrend = sample.meetsThreshold && closeAboveMa;

  if (isUptrend) {
    const parts: string[] = [
      `上升K線數 ${sample.upCandleCount} 根（≥ 4），${label}收盤收在均線之上。`,
    ];
    if (sample.ma != null) {
      parts.push(`收盤 ${fmt(sample.close)}、均線 ${fmt(sample.ma)}。`);
    }
    if (dif != null && dea != null && Number.isFinite(dif) && Number.isFinite(dea)) {
      parts.push(
        dif >= dea
          ? `MACD：DIF ${fmt(dif)} 在 DEA ${fmt(dea)} 之上。`
          : `MACD：DIF ${fmt(dif)} 在 DEA ${fmt(dea)} 之下。`
      );
    }
    return {
      isUptrend,
      headline: UPTREND_HEADLINE,
      body: parts.join(' '),
      note: CHART_NOTE_TEXT,
    };
  }

  return {
    isUptrend,
    headline: NEUTRAL_HEADLINE,
    body: `上升K線數 ${sample.upCandleCount} 根、收盤 ${fmt(sample.close)}${
      sample.prevClose != null ? `、漲跌 ${signed(sample.change)}（${signed(sample.changePercent)}%）` : ''
    }，只寫能確認的數值，不做結構判定。`,
    note: CHART_NOTE_TEXT,
  };
}
