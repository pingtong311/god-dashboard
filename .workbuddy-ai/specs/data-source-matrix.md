# Data Source Matrix — 修正版（複刻收口後依此施工）

> 產出者：team-lead（齊活林）
> 產出日：2026-09-22
> 用途：複刻主線收口後，依此 spec 補強資料層。施工前請先讀完本檔 + `finmind-channels-schema.md`。
> 來源：BOSS 貼的建議報告 + 我逐條核對後**修正事實錯誤**的版本。
> 2026-09-23 補：BOSS 第三方分點分析 → 新增 §2-D「收盤分點 DB」路線，修正「即時 vs 收盤」分點界線。

## 0. 與 BOSS 建議報告的差異（先讀）

報告 90% 正確，但以下三處**不能照著做**：

| 報告說法 | 修正 | 原因 |
|---|---|---|
| 「TWSE MIS 盤中即時行情」（`mis.twse.com.tw` 當 API） | ❌ 事實錯誤。`mis.twse.com.tw` 是**人工網頁查詢**，官方 OpenAPI 端點只有**收盤後日/月/年**資料，無免費即時 REST 端點（`/v1/stock` 實測 404，見 #74）。**盤中即時免費穩定路徑 = 無**，Fugle 是現況唯一即時補位。 | 報告是文書引用「`mis.twse.com.tw` 列為基本市況報導網站」，不是可抓的 API。 |
| 「PostgreSQL + Redis Data Engine」 | ❌ 誤判現狀。現況是**純 Cloudflare Workers**：route 內 in-memory cache + KV namespace，無 PG/Redis（且 Free plan 無 PG 額度）。這是**產品化/商用後**的目標架構，現在做會打爆 CF Free 的 CPU/記憶體限制。 | 現在照做是 premature。 |
| 「把現有 kline/fusion/radar/futures/opendata 對進 Matrix」 | ⚠️ 部分沒接上。這些 route **已接好**（TWSE/TPEX/MOPS/TAIFEX 全在）。報告缺的是**基本面/財報**整列，才是真缺口。 | 報告沒意識到這些已落地。 |

**裁定：複刻收口前不動架構、不接 DB。收口後依本 spec 依序做 A→B→C。**

---

## 1. 資料缺口分級（沿用報告，修正誤判）

| 等級 | 資料 | 判斷 | 現狀 |
|---|---|---|---|
| 🟢 | TWSE/TPEX 日資料、法人、籌碼、當沖、PE/PB/殖利率 | 免費完全可做 | ✅ 已接 `opendata/`、`radar/`、`twse/`、`uptrend/`、`kline/`、`fusion/` |
| 🟢 | 大盤／個股盤中收盤行情 | 免費官方可做 | ✅ 已接 |
| 🟡 | 期貨每日行情（TX 開/高/低/收/結算/未平倉） | 免費官方可做 | ✅ 已接 `futures/`（TAIFEX OpenAPI） |
| 🟡 | 期貨盤中即時（最新成交/最佳買賣價） | 官方 MIS 網頁可看，**無免費穩定 API** | 現況無；要即時只能 Fugle 降級或 Shioaji（CF 邊緣不適用） |
| 🟡 | 股票盤中即時（即時價/量） | **無免費穩定 API**（報告的 MIS 誤判） | Fugle 30 根分鐘 K + Yahoo fallback |
| 🟠 | 期貨近 30 日 Tick（公開下載） | 免費但有下載量限制 | 現況未接；可補（Collector 型） |
| 🟠 | 即時逐筆成交 | 免費方式多但**無穩定 API** | 現況無；不追 |
| 🔴 | 逐股×分點賣買超（全市場、全分點、可歷史） | **付費**（TWSE eshop 買賣日報表 NT$30k-100k/月，授權限內部使用；免費 `bsr.twse.com.tw` 僅當日+驗證碼+不得散布）；**TWSE OpenAPI 無此端點（實測 302 不存在）** | 走 B 路「未入庫」（全量逐股分點未付費不接） |
| 🟢 | 券商分點營業金額彙總（TPEX 上櫃，分點層級、無個股） | **免費** OpenAPI `tpex_daily_broker1`（854 筆，Code/Name 分點層級） | §2-D「B3」可立即做：誠實標「僅分點營業金額彙總，非逐股分點買賣」 |
| 🔴 | 盤中即時券商分點 | **無免費路徑**（交易所收盤後 16:10-18:00 才產製批次；Shioaji Tick 無券商欄位已證實） | 不追；收盤分點背景濾網走 §2-D |
| 🔴 | 長期期貨 Tick（>30 日）／完整 L2 | 官方明確付費申請 | 不追 |

---

## 2. 資料源 × 功能 Matrix（修正版）

> 施工順序：A（基本面/財報）→ B（分點分支 UI）→ C（Fugle cache）。每項標「複刻收口後」才動。

### A. 基本面 / 財報資料層（最該補的空白，現況完全沒接）

| App 功能 | 資料欄位 | Source | 免費？ | 更新頻率 | Cache | 備援 | 現況 |
|---|---|---|---|---|---|---|---|
| 個股基本面卡 | 月營收、YoY、MoM | MOPS + TWSE `BWIBBU_ALL` | 🟢 | 月 | ✅ route 內 | FinMind | **未接** |
| 個股基本面卡 | EPS、毛利率、營益率、淨利率 | MOPS 財報 + FinMind | 🟢 | 季 | ✅ | — | **未接** |
| 個股基本面卡 | ROE、ROA、負債比 | MOPS 財報 | 🟢 | 季 | ✅ | — | **未接** |
| 個股基本面卡 | 自由現金流、股利、除權息 | MOPS + FinMind | 🟢 | 季/年 | ✅ | — | **未接** |
| 估值 | PE、PB、殖利率 | TWSE `BWIBBU_ALL` | 🟢 | 日 | ✅ | Fugle | 部分在 `fusion/` |

> 施工要點：新建 `src/app/api/skynet/fundamental/route.ts`（MOPS 財報端點 + TWSE BWIBBU），前端 `/s/[ticker]` 加「基本面」區塊。全部公開資料，不造假。

### B. 分點四畫面分支 UI（複刻 B 路的正確做法）

現況：`/chips/[ticker]`、`/radar`、`/diary` 直接標「資料未入庫」。
目標：做「**有付費資料 → 顯示完整分點分析 / 無 → 顯示『資料未入庫』**」分支 UI（不是死標「未入庫」）。

```text
                    券商分點
                       │
             ┌─────────┴─────────┐
             │                   │
        有付費資料            沒有資料
             │                   │
       顯示完整分析       顯示「資料未入庫」
```

> 施工要點：在分點區塊加一個「資料來源狀態」flag（`hasChannelData: boolean`）。false 時顯示「資料未入庫（需付費來源）」；true 時渲染分析。現況永遠 false（無付費），但 UI 結構留好，日後接 FinMind Sponsor 只改 flag。

### C. Fugle 請求層 cache（防爆 100 req/hr）

現況：Fugle 在 `kline/` + `fusion/` 當降級源，**無請求層 cache**，每次直打 → 免費額度極易爆。
目標：使用者搜尋 → 查 cache → 沒有最新 → 打 Fugle → 寫入 cache → 回傳。**不要每次使用者直打 Fugle。**

> 施工要點：`kline/` + `fusion/` route 加 in-memory TTL cache（同 `futures/` 的 `inflight` 去重 + `DAILY_CACHE_TTL_MS` 模式），Fugle 回應快取 60s（即時性可接受範圍）。

### D. 收盤分點資料（**免費路徑極限** + 付費全量 DB；經 channel-verify 實測修正，2026-09-23）

**來源**：BOSS 第三方「券商分點」分析主張「自己建分點日 DB 不必付費」。但 **channel-verify 用 curl 實測修正了原假設**：TWSE OpenAPI **無「逐股 × 分點」端點**（`TWSELLBUY` 302 不存在，143 path 全查「分點」0 次）；真正含券商代號的官方「買賣日報表」取用路徑只有 **`bsr.twse.com.tw`（圖形驗證碼＋僅當日＋「不得逕自散布或販售」）** 或 **eshop 付費（NT$30k-100k/月，授權限內部）**。故「免費自建分點日 DB」**不成立**。

**分點資料的真實結構（實測）：**

| 路徑 | 端點 / 來源 | 性質 | 可用性 |
|---|---|---|---|
| **B3（免費、可立即做）** | TPEX `openapi/v1/tpex_daily_broker1` | 券商**分點營業金額彙總**（854 筆，Code/Name 分點層級，**無個股**） | 🟢 免費、免金鑰、OpenAPI JSON |
| **B3'（免費、有限）** | TPEX `openapi/v1/tpex_active_broker_volume` | 逐股 × 券商，但**僅前 30 檔 × 每檔前 10 家**、`SecuritiesFirmsCode`=**總公司**層級（非分點代號） | 🟡 免費但範圍窄、非分點 |
| 全量逐股分點 | TWSE eshop 買賣日報表（**NT$30k-100k/月**）或 `bsr.twse.com.tw`（驗證碼、僅當日、不得散布） | 全市場逐股×分點 | 🔴 付費 / 無法自動化 |
| 盤中即時分點 | 無（交易所收盤後 16:10-18:00 才產製批次；Shioaji Tick 無券商欄位已證實） | 即時 | 🔴 不追 |
| 富邦/MoneyDJ `djhtm` 分點頁 | 第三方白牌（MoneyDJ 引擎），**無授權標示、無 robots.txt** | 逐股×分點（收盤批次） | ⚠️ 法遵風險，**不爬** |

**裁定：**
- **不做「D 收盤分點全量 DB」**（免費路徑不存在；全量需付費且授權限內部，不合法定「可散布」）。
- **可做 B3**：接 TPEX `tpex_daily_broker1` 做「上櫃券商分點活躍度」小卡（**分點營業金額彙總，非逐股分點**），誠實標「僅分點營業金額彙總，非逐股分點買賣」。這是唯一**免費且合法**的分點維度資料。
- **B 路（現況 `hasChannelData=false`）保留**：全量逐股分點未付費 → 四畫面誠實標「未入庫」；文案精確化為「逐股分點為**付費**（TWSE eshop NT$30k-100k/月，授權限內部），目前未接」。
- **B3 定位**：收盤後批次（T+0 約 16:10-18:00），**籌碼背景濾網**，**非盤中訊號**。UI 須區分「分點營業金額彙總」與「逐股分點買賣」。

> 施工要點：新建 `src/app/api/skynet/channel-broker/route.ts`（TPEX `tpex_daily_broker1`，inflight + 30min TTL + stale-on-error，比照 `futures/`）；前端「個股/上櫃」頁加「券商分點活躍度」卡，誠實標性質。全量逐股分點仍走 B 路（未付費不接）。**不爬富邦/MoneyDJ `djhtm`。**

---

## 3. 現況已接（不需重做，僅供對照）

| Route | 資料源 | 端點 | 狀態 |
|---|---|---|---|
| `twse/` `radar/` `opendata/` `uptrend/` | TWSE OpenAPI | `openapi.twse.com.tw/v1/exchangeReport/{STOCK_DAY_ALL, MI_INDEX, BWIBBU_ALL}` | ✅ 已接 |
| `futures/` | TAIFEX OpenAPI | `openapi.taifex.com.tw/v1/DailyMarketReportFut` | ✅ 已接（#67 定稿） |
| `mops/` | MOPS | `mops.twse.com.tw/mops/web/t05st01` | ✅ 已接 |
| `radar/` | TPEX OpenAPI | `tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes` | ✅ 已接 |
| `kline/` `fusion/` | Fugle | `api.fugle.tw/marketdata/v1.0`（100 req/hr + 5 req/min，30 根分鐘 K 上限） | ✅ 已接（降級源，**待補 cache = §2.C**） |
| 備援 | Yahoo Finance | `query1.finance.yahoo.com`（無 SLA） | ✅ 已接（tertiary） |

---

## 4. 不追（明確排除）

| 項目 | 原因 |
|---|---|
| TWSE MIS 盤中即時當 API | 事實錯誤（§0），`mis.twse.com.tw` 是人工網頁，無免費 REST |
| **盤中即時券商分點** | **無免費路徑**（§2-D 實測）：交易所收盤後 16:10-18:00 才產製批次；盤中僅市級價量/內外盤，不含下單券商身分 |
| **全量逐股×分點 DB（自抓公開累積）** | **免費路徑不存在**（§2-D 實測）：TWSE OpenAPI 無逐股×分點端點（`TWSELLBUY` 302 不存在，143 path 全查「分點」0 次）；全量需 eshop 付費 NT$30k-100k/月且授權限內部使用、不得對外公開 |
| **爬富邦/MoneyDJ `djhtm` 分點頁** | 法遵風險：頁面**無授權標示、無 robots.txt**，且官方明載分點資料「不得逕自散布或販售」；第三方白牌（MoneyDJ 引擎） |
| 靠 Shioaji 補分點 | **Shioaji Tick/kbars 無券商分點欄位**（channel-verify Q4 實測證實）；「有永豐 API ≠ 有分點」 |
| TPEX 分點代號對照（自動破驗證碼） | TPEX 人工查詢 `brokerBS.php` 有圖形驗證碼；**不自動化破碼**（§2-D） |
| Shioaji 期貨 K 線 | 本機 daemon，CF 邊緣無（見 memory 2026-09-20 Shioaji 排除裁定） |
| 長期期貨 Tick | 官方明確付費申請 |
| PostgreSQL / Redis | 純 CF Workers 現狀無此架構；商用化階段再議 |
| 即時逐筆成交（完整 L2） | 無免費穩定 API，不追 |

> 注意：§4「不追」的是**盤中即時分點**、**全量逐股×分點 DB（付費授權限內部）**、**爬第三方 `djhtm`**；**§2-D「B3」＝ TPEX `tpex_daily_broker1`（分點營業金額彙總、免費、合法）可做**。

---

## 5. 施工順序（複刻收口後）

1. **A 基本面/財報**（最該補，讓 AI 分析從「今天漲 3%」升級成「價格+籌碼+基本面+事件」）✅ 已落地
2. **B 分點分支 UI**（B 路正確做法，留好 flag）✅ 已落地
3. **C Fugle cache**（防爆免費額度）✅ 已落地
4. **（可選）期貨近 30 日 Tick Collector**（Collector 型，非即時）
5. **（可選，新）D-B3：TPEX `tpex_daily_broker1` 分點營業金額彙總卡**（免費、合法、收盤後批次；誠實標「僅分點營業金額彙總，非逐股分點買賣」）

> 每項獨立成工，動 `src/app/api/skynet/*` + 對應前端頁，不改既有已接 route 的核心邏輯（增量補）。
> D 路（§2-D）施工前先讀「分點資料真實結構」表：B3 免費可做、全量逐股分點付費不接、盤中即時不追、不爬第三方 djhtm。
