/**
 * /swing 大戶持股「週序列」— 實站歷史快照（site-mirror）
 * ============================================================================
 * 快照來源：
 *   captured/login-capture/api/blackstockai.com_api_swing-hub_.json
 *   實站 API：https://blackstockai.com/api/swing-hub（HTTP 200）
 *   快照基準日（集保資料週期）：2026-09-18
 *   抓取時間：2026-09-24T23:39:29+0800（= 2026-09-24T15:39:29Z）
 *     └ 該快照 JSON 本身無時間戳欄位（僅 url / status / body），故此值取自
 *       快照檔案的檔案系統 mtime（`stat`），非任意編造。
 *
 * ★★ 為什麼是 site-mirror 而不是 self-produced ★★
 *   `delta_1w`（本週增減）／`delta_4w`（四週增減）／`up_weeks`（連續增加週數）需要
 *   **TDCC 集保戶股權分散表的歷史「週」序列**（例：2520 冠德需要 15 週）。
 *   但 TDCC OpenAPI 1-5 **只回當週**（實測 distinct 資料日期僅 1 個），本站目前只累積
 *   1 週，**無法自算**這三個欄位。依業主指示「能自己產生的就用自己數據、不能產生的
 *   就用實站數據」，故以實站快照補這三個欄位，並誠實標為 site-mirror（附基準日）。
 *
 * ★ 這是「能力問題」不是「可信度問題」：數字本身可信，只是本站算不出來。
 *   故用 site-mirror（借用 + 標「本站無法重算」），**不是** site-unreliable。
 *   機制與 /backtest 相同，見 src/lib/provenance.ts 與
 *   src/app/backtest/mirror/backtest-2330-2026-09-24.ts。
 *
 * ★ as-of 日期對齊：本站顯示的「集保資料週期：2026-09-18」與本快照基準日相同，
 *   故不是混用不同日期的資料。
 *
 * ★ 使用方式（route）：以 stock_id 查 WHALE_MIRROR_MAP；**查不到時欄位顯示
 *   「累積中」**（回 null），**絕不以 0 或空字串代替**（今日清單成員可能與快照不同）。
 *   **當本站未來 TDCC 累積足夠週數、能自算時，應優先採用自產值，本 mirror 僅為
 *   fallback。**
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色。
 */

import type { Provenance } from '@/lib/provenance';

/** 單一股票的大戶持股週序列欄位（對應實站 whale_in / whale_out 的 item 子集）。 */
export interface WhaleWeekly {
  /** 股票代號。 */
  stock_id: string;
  /** 本週增減（百分點）。 */
  delta_1w: number | null;
  /** 四週增減（百分點）。 */
  delta_4w: number | null;
  /** 連續增加週數。 */
  up_weeks: number | null;
  /** 連續減少週數。 */
  down_weeks: number | null;
  /** 該股累積週數。 */
  weeks: number | null;
}

/**
 * 快照 whale_in + whale_out 全部 item 的週序列欄位（逐值取自快照 JSON，依 stock_id 排序）。
 * ⚠ 此為實站歷史快照，非即時、非本站自產。
 */
export const WHALE_WEEKLY_MIRROR: readonly WhaleWeekly[] = [
  { stock_id: '1102', delta_1w: 0.06, delta_4w: 0.45, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '1215', delta_1w: -0.33, delta_4w: -0.86, up_weeks: 0, down_weeks: 13, weeks: 16 },
  { stock_id: '1314', delta_1w: 1.71, delta_4w: 2.55, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '1722', delta_1w: -0.29, delta_4w: -0.78, up_weeks: 0, down_weeks: 6, weeks: 17 },
  { stock_id: '1785', delta_1w: -0.27, delta_4w: -1.11, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '2030', delta_1w: 0.04, delta_4w: 1.83, up_weeks: 8, down_weeks: 0, weeks: 11 },
  { stock_id: '2033', delta_1w: 0.14, delta_4w: 1.72, up_weeks: 6, down_weeks: 0, weeks: 11 },
  { stock_id: '2101', delta_1w: 0.01, delta_4w: 0.61, up_weeks: 7, down_weeks: 0, weeks: 12 },
  { stock_id: '2206', delta_1w: 0.09, delta_4w: 0.37, up_weeks: 6, down_weeks: 0, weeks: 18 },
  { stock_id: '2233', delta_1w: -2.29, delta_4w: -6.05, up_weeks: 0, down_weeks: 5, weeks: 16 },
  { stock_id: '2308', delta_1w: -0.13, delta_4w: -0.48, up_weeks: 0, down_weeks: 16, weeks: 20 },
  { stock_id: '2332', delta_1w: -0.36, delta_4w: -2.8, up_weeks: 0, down_weeks: 5, weeks: 19 },
  { stock_id: '2351', delta_1w: 0.27, delta_4w: 5.67, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '2354', delta_1w: 0.64, delta_4w: 2.18, up_weeks: 4, down_weeks: 0, weeks: 20 },
  { stock_id: '2359', delta_1w: -0.63, delta_4w: -6.12, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '2362', delta_1w: 0.09, delta_4w: 1.35, up_weeks: 6, down_weeks: 0, weeks: 12 },
  { stock_id: '2474', delta_1w: 0.48, delta_4w: 2.43, up_weeks: 6, down_weeks: 0, weeks: 20 },
  { stock_id: '2480', delta_1w: 0.2, delta_4w: 0.63, up_weeks: 5, down_weeks: 0, weeks: 11 },
  { stock_id: '2520', delta_1w: 0.41, delta_4w: 1.09, up_weeks: 12, down_weeks: 0, weeks: 15 },
  { stock_id: '2611', delta_1w: 0.88, delta_4w: 1.15, up_weeks: 10, down_weeks: 0, weeks: 11 },
  { stock_id: '2636', delta_1w: 0.82, delta_4w: 2.76, up_weeks: 4, down_weeks: 0, weeks: 11 },
  { stock_id: '2867', delta_1w: 0.31, delta_4w: 1.14, up_weeks: 9, down_weeks: 0, weeks: 13 },
  { stock_id: '2880', delta_1w: 0.1, delta_4w: 0.39, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '2884', delta_1w: 0.1, delta_4w: 1.08, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '2887', delta_1w: 0.12, delta_4w: 0.48, up_weeks: 8, down_weeks: 0, weeks: 20 },
  { stock_id: '2889', delta_1w: -0.13, delta_4w: -1.04, up_weeks: 0, down_weeks: 7, weeks: 18 },
  { stock_id: '3003', delta_1w: 0.39, delta_4w: 3.2, up_weeks: 4, down_weeks: 0, weeks: 11 },
  { stock_id: '3045', delta_1w: 0.17, delta_4w: 0.69, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '3055', delta_1w: -0.11, delta_4w: -1.03, up_weeks: 0, down_weeks: 8, weeks: 20 },
  { stock_id: '3094', delta_1w: 2.01, delta_4w: 8.21, up_weeks: 4, down_weeks: 0, weeks: 20 },
  { stock_id: '3209', delta_1w: -0.13, delta_4w: -4.52, up_weeks: 0, down_weeks: 5, weeks: 15 },
  { stock_id: '3217', delta_1w: -1.92, delta_4w: -2.71, up_weeks: 0, down_weeks: 5, weeks: 11 },
  { stock_id: '3236', delta_1w: -0.05, delta_4w: -1.19, up_weeks: 0, down_weeks: 6, weeks: 19 },
  { stock_id: '3324', delta_1w: 0.16, delta_4w: 13.07, up_weeks: 4, down_weeks: 0, weeks: 20 },
  { stock_id: '3356', delta_1w: 1.26, delta_4w: 2.17, up_weeks: 10, down_weeks: 0, weeks: 11 },
  { stock_id: '3402', delta_1w: 0.47, delta_4w: 3.29, up_weeks: 5, down_weeks: 0, weeks: 11 },
  { stock_id: '3406', delta_1w: 0.21, delta_4w: 6.52, up_weeks: 7, down_weeks: 0, weeks: 20 },
  { stock_id: '3413', delta_1w: -0.37, delta_4w: -2.57, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '3630', delta_1w: 0.14, delta_4w: 0.45, up_weeks: 6, down_weeks: 0, weeks: 11 },
  { stock_id: '3714', delta_1w: 0.1, delta_4w: 0.99, up_weeks: 11, down_weeks: 0, weeks: 20 },
  { stock_id: '4303', delta_1w: 1.27, delta_4w: 2.54, up_weeks: 4, down_weeks: 0, weeks: 11 },
  { stock_id: '4551', delta_1w: -0.21, delta_4w: -2.61, up_weeks: 0, down_weeks: 5, weeks: 18 },
  { stock_id: '4927', delta_1w: 0.44, delta_4w: 2.94, up_weeks: 5, down_weeks: 0, weeks: 17 },
  { stock_id: '4976', delta_1w: 0.14, delta_4w: 1.7, up_weeks: 5, down_weeks: 0, weeks: 16 },
  { stock_id: '5009', delta_1w: 0.45, delta_4w: 1.18, up_weeks: 7, down_weeks: 0, weeks: 14 },
  { stock_id: '5209', delta_1w: -0.41, delta_4w: -1.45, up_weeks: 0, down_weeks: 6, weeks: 11 },
  { stock_id: '5284', delta_1w: 0.59, delta_4w: 1.71, up_weeks: 5, down_weeks: 0, weeks: 18 },
  { stock_id: '5309', delta_1w: -0.91, delta_4w: -3.25, up_weeks: 0, down_weeks: 6, weeks: 11 },
  { stock_id: '5351', delta_1w: -1.2, delta_4w: -8.03, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '5388', delta_1w: -1.72, delta_4w: -7.79, up_weeks: 0, down_weeks: 5, weeks: 19 },
  { stock_id: '5392', delta_1w: 1.9, delta_4w: 3.39, up_weeks: 4, down_weeks: 0, weeks: 17 },
  { stock_id: '5439', delta_1w: -0.56, delta_4w: -3.73, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '5475', delta_1w: -2.17, delta_4w: -5.26, up_weeks: 0, down_weeks: 7, weeks: 20 },
  { stock_id: '5880', delta_1w: 0.19, delta_4w: 0.77, up_weeks: 5, down_weeks: 0, weeks: 20 },
  { stock_id: '6179', delta_1w: 1.89, delta_4w: 9.23, up_weeks: 4, down_weeks: 0, weeks: 14 },
  { stock_id: '6209', delta_1w: -0.53, delta_4w: -1.77, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '6214', delta_1w: 0.02, delta_4w: 4.02, up_weeks: 6, down_weeks: 0, weeks: 20 },
  { stock_id: '6274', delta_1w: -0.21, delta_4w: -3.02, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '6290', delta_1w: 0.37, delta_4w: 3.48, up_weeks: 4, down_weeks: 0, weeks: 20 },
  { stock_id: '6412', delta_1w: -0.15, delta_4w: -0.47, up_weeks: 0, down_weeks: 9, weeks: 11 },
  { stock_id: '6414', delta_1w: -0.34, delta_4w: -1.87, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '6451', delta_1w: -1.32, delta_4w: -4.08, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '6467', delta_1w: -2.1, delta_4w: -5.8, up_weeks: 0, down_weeks: 5, weeks: 13 },
  { stock_id: '6488', delta_1w: -0.61, delta_4w: -2.81, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '6782', delta_1w: 1.7, delta_4w: 3.96, up_weeks: 4, down_weeks: 0, weeks: 14 },
  { stock_id: '6849', delta_1w: -0.51, delta_4w: -1.38, up_weeks: 0, down_weeks: 10, weeks: 11 },
  { stock_id: '6861', delta_1w: -2.75, delta_4w: -5.35, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '6944', delta_1w: 0.63, delta_4w: 4.5, up_weeks: 4, down_weeks: 0, weeks: 20 },
  { stock_id: '6947', delta_1w: -2.43, delta_4w: -3.35, up_weeks: 0, down_weeks: 8, weeks: 11 },
  { stock_id: '6990', delta_1w: -0.94, delta_4w: -5.33, up_weeks: 0, down_weeks: 18, weeks: 19 },
  { stock_id: '7717', delta_1w: -1.9, delta_4w: -3.97, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '7827', delta_1w: 0.14, delta_4w: 0.76, up_weeks: 5, down_weeks: 0, weeks: 11 },
  { stock_id: '7871', delta_1w: -1.06, delta_4w: -4.34, up_weeks: 0, down_weeks: 15, weeks: 16 },
  { stock_id: '7924', delta_1w: -0.06, delta_4w: -1.16, up_weeks: 0, down_weeks: 12, weeks: 13 },
  { stock_id: '7942', delta_1w: -0.12, delta_4w: -5.42, up_weeks: 0, down_weeks: 7, weeks: 8 },
  { stock_id: '8069', delta_1w: -0.02, delta_4w: -1.74, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '8086', delta_1w: -0.22, delta_4w: -4.09, up_weeks: 0, down_weeks: 6, weeks: 20 },
  { stock_id: '8096', delta_1w: -1.9, delta_4w: -4.59, up_weeks: 0, down_weeks: 8, weeks: 20 },
  { stock_id: '8112', delta_1w: -1.28, delta_4w: -6.53, up_weeks: 0, down_weeks: 5, weeks: 20 },
  { stock_id: '8155', delta_1w: -1.32, delta_4w: -2.35, up_weeks: 0, down_weeks: 5, weeks: 19 },];

/**
 * 來源標記（site-mirror）。
 * - upstream：實站 API URL。
 * - snapshot_date：集保資料週期基準日。
 * - captured_at：快照抓取 ISO 時間（取自快照檔 mtime，見檔頭說明）。
 */
export const WHALE_MIRROR_META: Provenance = {
  source: 'site-mirror',
  upstream: 'https://blackstockai.com/api/swing-hub',
  snapshot_date: '2026-09-18',
  captured_at: '2026-09-24T15:39:29.000Z',
};

/** 以 stock_id 查週序列欄位的快速索引。 */
export const WHALE_MIRROR_MAP: ReadonlyMap<string, WhaleWeekly> = new Map(
  WHALE_WEEKLY_MIRROR.map((entry) => [entry.stock_id, entry]),
);
