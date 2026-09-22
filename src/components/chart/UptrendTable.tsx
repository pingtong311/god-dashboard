'use client';

/**
 * /chart「上上升勢」表（chart.md §2，逐字對齊）
 *
 * 表頭逐字：`股票 上升K線數 收盤 最高 最低 均線 均線收在 前收 漲跌 漲% 量比`
 * 說明文字逐字：
 *   - 標題：「上上升勢」
 *   - 「上上升勢」：連續出現兩根以上的「上升趨勢」K線（K線連續兩根收在均線/趨勢線之上），
 *     表示該價格區間已轉為「上升趨勢區間」。
 *   - 上方列表：上升K線數 ≥ 4 的股票；點任一檔可看它的K線走勢與上升趨勢區間。
 *
 * 資料來源：/api/skynet/uptrend（TWSE 公開日K）+ 本地計算：
 *   - 均線/均線收在：SMA20（chart.md §4「上升K線數」判定基準）
 *   - 前收/漲跌/漲%：由日K 序列計算
 *   - 量比：收量 / 前 5 根均量
 *   - 上升K線數：uptrendDetector.countConsecutiveUpCandles（純函數，可單測）
 *
 * 不造假：任一檔未取得日K → 該列顯示「--」並標記「TWSE 未取得」；
 * 全榜未取得 → 顯示占位（同「資料未入庫」處理原則），不填假數字。
 */

import { useMemo } from 'react';
import { calculateSMA } from '@/lib/sma';
import {
  buildUptrendSample,
  type UptrendCandle,
  type UptrendSample,
} from '@/lib/uptrendDetector';

export type { UptrendSample };

/** API 回傳的單檔結果。 */
export interface UptrendTickerData {
  code: string;
  name: string | null;
  candles: UptrendCandle[];
}

interface UptrendTableProps {
  /** /api/skynet/uptrend 回傳的榜列（candles 未注入 ma 前）。 */
  data: UptrendTickerData[] | null;
  loading: boolean;
  /** 點某列跳轉該檔 K 線。 */
  onSelect: (code: string) => void;
}

/** SMA20 注入 ma（chart.md §2「均線收在」判定用 MA20）。 */
function withMa(candles: UptrendCandle[]): UptrendCandle[] {
  const closes = candles.map((c) => c.close);
  const ma20 = calculateSMA(closes, 20);
  return candles.map((c, i) => ({ ...c, ma: ma20[i] }));
}

function fmtNum(value: number | null, digits = 2): string {
  return value != null && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function fmtSigned(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export default function UptrendTable({ data, loading, onSelect }: UptrendTableProps) {
  /** 每檔 → sample（含 ma 注入後的判定）；無 candles 時 null。 */
  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((item) => {
      if (!Array.isArray(item.candles) || item.candles.length === 0) {
        return { item, sample: null as UptrendSample | null };
      }
      const withMaCandles = withMa(item.candles);
      const sample = buildUptrendSample(withMaCandles, { minUpCandles: 4 });
      return { item, sample };
    });
  }, [data]);

  return (
    <section className="chart-uptrend">
      <h2 className="chart-uptrend-title">「上上升勢」</h2>
      <p className="chart-uptrend-desc">
        「上上升勢」：連續出現兩根以上的「上升趨勢」K線（K線連續兩根收在均線/趨勢線之上），表示該價格區間已轉為「上升趨勢區間」。
      </p>
      <p className="chart-uptrend-note">
        上方列表：上升K線數 ≥ 4 的股票；點任一檔可看它的K線走勢與上升趨勢區間。
      </p>

      <div className="chart-uptrend-scroll">
        <table className="chart-uptrend-table">
          <thead>
            <tr>
              <th>股票</th>
              <th>上升K線數</th>
              <th>收盤</th>
              <th>最高</th>
              <th>最低</th>
              <th>均線</th>
              <th>均線收在</th>
              <th>前收</th>
              <th>漲跌</th>
              <th>漲%</th>
              <th>量比</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="chart-uptrend-loading">載入中…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="chart-uptrend-empty">
                  資料未入庫：TWSE 公開日K 未取得（或榜列為空），不造假數字。
                </td>
              </tr>
            )}
            {!loading &&
              rows.map(({ item, sample }) => {
                const stockLabel = item.name ? `${item.code} ${item.name}` : item.code;
                return (
                  <tr
                    key={item.code}
                    className="chart-uptrend-row"
                    onClick={() => sample && onSelect(item.code)}
                    role={sample ? 'button' : undefined}
                    tabIndex={sample ? 0 : -1}
                    onKeyDown={(e) => {
                      if (sample && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelect(item.code);
                      }
                    }}
                  >
                    <td className="chart-uptrend-stock">{stockLabel}</td>
                    <td>{sample ? sample.upCandleCount : '--'}</td>
                    <td>{sample ? fmtNum(sample.close) : '--'}</td>
                    <td>{sample ? fmtNum(sample.high) : '--'}</td>
                    <td>{sample ? fmtNum(sample.low) : '--'}</td>
                    <td>{sample ? fmtNum(sample.ma) : '--'}</td>
                    <td>
                      {sample?.ma != null ? (
                        sample.close >= sample.ma ? (
                          <span className="chart-up">上</span>
                        ) : (
                          <span className="chart-down">下</span>
                        )
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>{sample ? fmtNum(sample.prevClose) : '--'}</td>
                    <td>
                      {sample ? (
                        <span className={sample.change != null && sample.change > 0 ? 'chart-up' : sample.change != null && sample.change < 0 ? 'chart-down' : ''}>
                          {fmtSigned(sample.change)}
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>
                      {sample ? (
                        <span className={sample.changePercent != null && sample.changePercent > 0 ? 'chart-up' : sample.changePercent != null && sample.changePercent < 0 ? 'chart-down' : ''}>
                          {fmtSigned(sample.changePercent)}%
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>{sample ? fmtNum(sample.volumeRatio) : '--'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
