/**
 * 券商分點資料型別（spec data-source-matrix §2-B：分點四畫面分支 UI）。
 *
 * ⚠ 誠實原則（複刻 B 路定案）：券商分點逐筆／日匯總是 **FinMind Sponsor-only**
 * 付費資料，免費層只有券商主檔（TaiwanSecuritiesTraderInfo）。現況走 B 路：
 * 誠實標「資料未入庫」，不付費、不造假、不補零。
 *
 * 使用方式：前端分點區塊依 hasChannelData 分支——
 * - false（現況永遠是這個值）→ 顯示「資料未入庫（券商分點逐筆為付費資料源，目前未接）」
 * - true（日後 FinMind Sponsor 開通後）→ 渲染完整分點分析區塊
 * 現況前端 true 分支只留 skeleton + TODO 註解，不補內容、不補腦。
 */

export interface ChannelData {
  /** 有沒有券商分點逐筆／日匯總資料。現況無免費分點資料源，永遠 false（誠實）。 */
  hasChannelData: boolean;
  /** 有資料時標來源（如 'FinMind Sponsor'）；無資料時 null。 */
  source?: string | null;
  /** 分點資料截至日期 'YYYY-MM-DD'；無資料時 null。 */
  asOfDate?: string | null;
}

/** /api/skynet/channel 回應契約（對齊 futures/fundamental route：成功 { ok: true, data }）。 */
export type ChannelResponse =
  | { ok: true; data: ChannelData }
  | { ok: false; message: string };
