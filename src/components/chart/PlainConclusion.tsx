'use client';

/**
 * /chart「白話版結論」區塊（chart.md §6，逐字對齊）
 *
 * 小標逐字：`白話版：現在的結構是「上升趨勢」`（上升趨勢時；非上升時 `白話版：現在沒有確認的趨勢`）。
 * 內文：只寫能確認的數值（上升K線數、收盤、均線、MACD DIF/DEA），低信心處不腦補。
 * 圖下說明逐字：`圖上可以自己閱讀均線 + MACD + RSI + 下圖那些數字就是從這裡算出來的。`
 *
 * 不造假：sample 為 null（無資料）時只寫「目前沒有可確認的K線資料，不判斷結構。」
 */

import { useMemo } from 'react';
import {
  buildPlainConclusion,
  type ConclusionInputs,
} from '@/lib/uptrendConclusion';

interface PlainConclusionProps {
  /** 上升K線數判定樣本（無資料時 null）。 */
  sample: ConclusionInputs['sample'];
  /** 最新一根 MACD DIF。 */
  dif?: number | null;
  /** 最新一根 MACD DEA/Signal。 */
  dea?: number | null;
  /** 股票名稱。 */
  name?: string | null;
}

export default function PlainConclusion({ sample, dif, dea, name }: PlainConclusionProps) {
  const conclusion = useMemo(
    () => buildPlainConclusion({ sample, dif, dea, name }),
    [sample, dif, dea, name]
  );

  return (
    <section className="chart-plain" aria-label="白話版結論">
      <h3 className={`chart-plain-head ${conclusion.isUptrend ? 'chart-up' : ''}`}>
        {conclusion.headline}
      </h3>
      <p className="chart-plain-body">{conclusion.body}</p>
      <p className="chart-plain-note">{conclusion.note}</p>
    </section>
  );
}
