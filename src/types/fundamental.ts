/**
 * 基本面 / 財報資料型別（spec data-source-matrix §2-A）。
 *
 * 欄位來源對照（缺失一律 null，不用 0，前端顯示「未入庫」）：
 * - peRatio / pbRatio / dividendYield ← TWSE BWIBBU_ALL（日更，估值欄）
 * - monthlyRevenue / monthlyRevenueYoY ← MOPS 月營收（季/月更）
 * - eps / grossMargin / roe / debtRatio ← MOPS 財報，缺時 FinMind 基本面欄位備援
 *
 * ⚠ 誠實原則：某欄 null = 來源取不到或資料未入庫，絕不補腦、不硬編碼樣本數字。
 */

export interface FundamentalData {
  /** 股票代號（4 位或 t99）。 */
  ticker: string;
  /** 公司名稱；三個來源皆無名稱時為 null。 */
  name: string | null;
  /** 月營收（新台幣）；MOPS 月營收缺失時 null。 */
  monthlyRevenue: number | null;
  /** 月營收年增率（%）；無法計算時 null。 */
  monthlyRevenueYoY: number | null;
  /** EPS（元）；MOPS 財報 / FinMind 皆缺時 null。 */
  eps: number | null;
  /** 毛利率（%）；財報缺失時 null。 */
  grossMargin: number | null;
  /** ROE（%）；財報缺失時 null。 */
  roe: number | null;
  /** 負債比（%）；財報缺失時 null。 */
  debtRatio: number | null;
  /** 市益率 PE；TWSE BWIBBU 缺失時 null。 */
  peRatio: number | null;
  /** 市帳率 PB；TWSE BWIBBU 缺失時 null。 */
  pbRatio: number | null;
  /** 現金股利殖利率（%）；TWSE BWIBBU 缺失時 null。 */
  dividendYield: number | null;
  /** 財報數據截至日（'YYYY-MM-DD' 或季標記）；無財報資料時 null。 */
  asOfDate: string | null;
  /** ISO 時間戳：本回傳抓取的當下時間，供快取新鮮度追蹤。 */
  fetchedAt: string;
}

/** /api/skynet/fundamental 回應契約（對齊 futures route：成功 { ok: true, data }）。 */
export type FundamentalResponse =
  | { ok: true; data: FundamentalData }
  | { ok: false; message: string };
