# FinMind 分點資料 Schema 規格書

> 持久化日期：2026-09-22
> 用途：日後接付費分點資料時，直接照本 spec 施工，不用重新摸索。

## 1. 資料表概覽

| 資料表 | FinMind 端點 | 層級 | 資料範圍 | 說明 |
|---|---|---|---|---|
| 券商分點逐筆 | `TaiwanStockTradingDailyReport` | **Sponsor 付費** | 2021-06-30 起 | 單日全市場逐筆分點資料（Parquet） |
| 分點日匯總 | `TaiwanStockTradingDailyReportSecIdAgg` | **Sponsor 付費** | 2021-06-30 起 | 按券商分點代碼匯總當日買賣超 |
| 券商主檔 | `TaiwanSecuritiesTraderInfo` | **免費** | 全量 | 分點代碼、名稱、地址、類型 |

## 2. 字段結構（分點逐筆）

| 字段 | 類型 | 說明 |
|---|---|---|
| `securities_trader` | string | 券商分點代號（如 `TWT38U`） |
| `securities_trader_id` | string | 券商分點 ID |
| `stock_id` | string | 股票代號（如 `2330`） |
| `date` | date | 成交日期 |
| `price` | float | 成交價格 |
| `buy` | int | 買進股數 |
| `sell` | int | 賣出股數 |

## 3. 請求限制

- **單次請求限一天**：`?date=2025-09-18`，不能跨日批量
- **Sponsor 層級**：需付費訂閱 FinMind Sponsor（非 Free 層可用）
- **資料格式**：Parquet 整日全市場下載（SponsorPro-only）；逐筆查詢（Sponsor）

## 4. 免費/付費邊界

| 功能 | 免費可用 | 需付費 |
|---|---|---|
| 券商主檔（代碼/名稱/地址） | ✅ `TaiwanSecuritiesTraderInfo` | — |
| 分點逐筆明細 | — | 🔴 Sponsor |
| 分點日匯總（單券商代號） | — | 🔴 Sponsor |
| 整日全市場 Parquet 下載 | — | 🔴 SponsorPro |

## 5. 替代路徑（無付費時的選項）

| 路徑 | 說明 | 限制 |
|---|---|---|
| **A. 證交所原始資料** | `bsr.twse.com.tw` 人工下載 | 有圖形驗證碼，無法自動化 |
| **B. 誠實標「資料未入庫」** | UI 顯示「券商分點資料需付費來源，目前未接入」 | 不造假、不暗示有資料 |
| **C. TWT38U/TWT44U/QFIIS** | TWSE 公開資料，免費無驗證碼 | 只有法人/投信買賣超，非券商分點 |

## 6. 現狀裁定（2026-09-22）

- **走 B 路**：分點四畫面誠實標「資料未入庫」，不買付費。
- **日後若要買**：直接照本 spec 接 `TaiwanStockTradingDailyReport` + `TaiwanSecuritiesTraderInfo`，不用重新摸索。
