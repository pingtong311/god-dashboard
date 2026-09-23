/**
 * TPEX 上櫃券商分點活躍度型別（spec data-source-matrix §2-D「B3」）。
 *
 * ⚠ 誠實定位（spec 裁示，不可省略）：TPEX `tpex_daily_broker1` 是「上櫃各券商
 * 分點當日營業金額彙總」（854 筆、Code/Name 分點層級、**無個股**），
 * 不是「逐股分點買賣」。route 回傳的 note 欄必須誠實標「僅分點營業金額彙總，
 * 非逐股分點買賣」；收盤後批次（T+0 約 16:10-18:00），定位「籌碼背景濾網」，
 * 非盤中訊號。全量逐股分點仍走 B 路（付費未接，`channel.ts` 的
 * hasChannelData 恆 false 不變）。
 */

/** TPEX 分點單筆（top N 內的一列；缺值一律 null，不補 0、不補腦）。 */
export interface ChannelBrokerRow {
  /** 券商分點代號（TPEX Code，如 '9887'）；上游缺欄時 ''。 */
  code: string;
  /** 券商分點名稱（TPEX Name，如 '元大總公司'）；上游缺欄時 ''。 */
  name: string;
  /** 當日營業金額（TPEX TradingAmount，字串轉數字）；哨兵值（''/'-'/'NULL'/'nan'）轉 null。 */
  tradingAmount: number | null;
  /** 當日止占比（TPEX DayClosingRatio，如 '7.37%'）；保持原始字串，缺值 null。 */
  dayClosingRatio: string | null;
}

/** /api/skynet/channel-broker 成功回應的資料體（誠實 shape：不分 ticker、非逐股）。 */
export interface ChannelBrokerData {
  /** 是否取到有效分點營業金額筆數（false = 誠實「資料未入庫」，不補零）。 */
  hasBrokerActivity: boolean;
  /** 資料源標記；無資料時 null。 */
  source: string | null;
  /** 資料截至日 'YYYY-MM-DD'（由 ROC YYYYMMDD 轉 AD）；無資料時 null。 */
  asOfDate: string | null;
  /** 當日分點營業金額 top N（N=10，tradingAmount 降序、null 沉底）。 */
  topBrokers: ChannelBrokerRow[];
  /** 誠實註記：「僅分點營業金額彙總，非逐股分點買賣」（固定文案，前端必顯）。 */
  note: string;
}

/** /api/skynet/channel-broker 回應契約（對齊 futures/fundamental route：成功 { ok: true, data }）。 */
export type ChannelBrokerResponse =
  | { ok: true; data: ChannelBrokerData }
  | { ok: false; message: string };
