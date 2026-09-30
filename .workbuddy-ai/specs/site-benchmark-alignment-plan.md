# 實站標竿對齊計畫 v1.0

- 日期：2026-09-28（2026-09-30 複檢修正）
- 撰寫：峰子 App 團隊（天網）
- 狀態：**P0-1 已收口（route 全建好，剩 Plan A 部署）；P0-2/P0-3/P0-4 待開工**
- 依據：BOSS 裁示 1–4 + 92 份實站 API 完整度清單（逐份分類）

---

## 零、執行摘要

### 關鍵數字：92 份實站 API 的分類結果

| 分類 | 份數 | 占比 | 處理方式 |
|---|---|---|---|
| **A 可自產**（TWSE／TPEX／MOPS／TAIFEX 免費官方，或可自算） | **47** | **51%** | **自己產** |
| **B 需授權**（逐股分點、即時行情） | **9** | 10% | 現階段借用實站數據 |
| **C 需外部服務**（新聞／情緒） | **2** | 2% | 接 GNews 等 |
| **D 平台功能**（帳號／會員／社群／遊戲） | **34** | 37% | 複刻 UI，不需資料層 |

### 這個數字改變了結論

前一輪我判定「現階段不能取代股市大佬」，理由是 API 覆蓋率 6.5%。

**現在更精確的說法是**：

> **92 份中只有 9 份（10%）是我們拿不到的。其餘 83 份（90%）要嘛我們能自產（47 份），要嘛只是平台功能不是資料（34 份），要嘛接個外部服務就有（2 份）。**
>
> **真正的瓶頸不是「拿不到資料」，是「還沒做」。**

### 三個最高槓桿的施工點

**① 頁面已建、route 缺（13 個）**

這些頁面 UI 已經複刻好了，只差資料層：

```
/fade  /backtest  /patterns  /swing  /block-trades  /dividend  /risk
/cb    /etf-active  /margin-maint  /trump  /strategy  /sim
```

**UI 已經在了，補 route 就能見效——這是投報率最高的施工點。**

**② 47 份 A 類中，有 10 組是「同一類資料的多個端點」**

例如期權有 4 份（`options-index`、`p1/futures-opt`、`futures-large-traders`、`futures-spread`），全部來自 TAIFEX 同一個來源。**一次接好資料源，四個端點同時到位。**

**③ 峰子已有實站沒有的能力**

`channel-broker`（TPEX 分點營業金額彙總）是**實站完全沒有**的端點——這是我們唯一免費合法的分點維度。

---

## 一、BOSS 裁示的落地解讀

| BOSS 的指示 | 落地做法 |
|---|---|
| 「現階段以實站為基礎標竿對照組」 | 建立**可重複執行的對照流程**（見第三節），量化追蹤對齊進度 |
| 「能自己產生的就用自己的數據」 | A 類 47 份 → 自產，並與實站同日對照驗證 |
| 「不能產生的就用實站的數據」 | B 類 9 份 → 借用實站快照，**但必須標示來源與日期** |
| 「等可以補到都對齊了…再來補實站有而我們沒有的」 | 以 `provenance.source` 統計**自產率**，作為進入第二階段的門檻 |

### 關鍵設計：`provenance.source` 是進度儀表板

每一份產出都必須標記資料來源：

```json
{
  "provenance": {
    "source": "self-produced" | "site-mirror",
    "as_of": "2026-09-28",
    "note": "site-mirror 表示此資料借用實站快照，非自產"
  }
}
```

這樣就能隨時算出：

```
自產率 = self-produced 的欄位數 / 總欄位數
```

**這就是「對齊了沒」的量化標準，也是進入第二階段的客觀門檻。**

---

## 二、分類結果與施工分組

### A 類（47 份）：可自產，按資料源分組

| 資料源 | 端點數 | 端點清單 |
|---|---|---|
| **TWSE 盤後統計** | 12 | `dashboard` `daily-highlights` `latest-date` `market-heatmap` `sector-heatmap` `industry-momentum` `margin-radar`×2 `sbl-radar` `national-team` `p1/block-trades` `p1/margin-maint` |
| **TWSE 個股** | 11 | `stock-bars`×2 `stock-search` `stock/industry` `stock-ranks` `stock-disposition` `disposition-calc` `valuation-history` `chip-overview` `p1/stock-flags` `market/projected-volume` |
| **TAIFEX 期權** | 6 | `futures-spread` `futures-large-traders` `options-index` `p1/futures-opt` `market-sentiment` `market-chip-bias` |
| **TWSE 事件／日曆** | 5 | `market-center/events` `dividend-calendar` `risk` `cb-arbitrage`(TPEX) `market-center/revenue`(MOPS) |
| **技術自算** | 5 | `tech-scan` `pattern-screen` `jack-signal` `sector-sniper` `warroom-boards` |
| **ETF** | 3 | `market-center/etfs` `p1/etf-active` `market-env` |
| **其他** | 5 | `radar`(混合) `swing-hub`(混合) `market-center/historical-styles`(混合) `member/radar-boards` `member/research-score`(混合) |

### B 類（9 份）：需授權，現階段借用實站

```
broker-flow    broker-map    broker-ranking    broker-backtest    broker-guide
stock-force    fade-watch    intraday-indicators    （+ market-center/historical-styles 的 brokers 欄）
```

**核心瓶頸是「逐股 × 分點」這個付費維度。** 依 `data-source-matrix.md`：
- TWSE OpenAPI **沒有**逐股分點端點（`TWSELLBUY` 回 302，不存在）
- 付費管道：TWSE eshop（NT$30k–100k／月，授權限內部使用）、FinMind Sponsor

### C 類（2 份）

`stock-news`（新聞＋情緒）、`trump-radar`（美國新聞 RSS＋情緒）

### D 類（34 份）

帳號／認證／會員／自選／投資帳本／推播／社群／猜K線／任務／工作區。
**不需複刻資料層**，但其中 `member/watchlist`、`member/research-score`、`market-center/workspace` **含資料欄**，UI 複刻時要接 A/B 源。

---

## 三、標竿對照機制（BOSS 明確要求）

### 設計目標

把「以實站為標竿」變成**可重複執行、可量化**的流程，而不是一次性比對。

### 對照流程

```
【每次對照的四個步驟】

① 抓取實站當日 API 快照
   工具：tools/capture-logged-in.js（已存在，用持久化 profile）
   注意：nginx 以 User-Agent 阻擋自動化，必須用真實 Chrome UA（腳本已處理）

② 讀取我們自產的對應資料

③ 逐欄位三方比對
   - schema 對齊率：欄位名與型別是否一致
   - 值一致率：數值是否在容差內
   - 填充率：是否有值

④ 產出對照報告
   未達標項目 → 回施工清單
```

### 驗收門檻（建議）

| 指標 | 門檻 | 說明 |
|---|---|---|
| schema 對齊率 | **100%** | 欄位名與型別必須完全一致 |
| 值一致率 | **≥ 95%** | 數值容差建議：整數須完全相同；百分比 ±0.1%；金額 ±0.1% |
| 填充率 | **≥ 90%** | 未達 90% 的欄位必須有 `honest_gap` 標示 |
| 自產率 | 逐季提升 | 進入第二階段的門檻，建議 **≥ 80%** |

### 對照的三種結果與處理

| 結果 | 處理 |
|---|---|
| ✅ 完全一致 | 通過，納入自產 |
| ⚠️ 我們有值、實站無值 | 可能是我們的優勢（如 `black_score`），記錄並保留 |
| ❌ 不一致 | 排查是資料源差異還是計算錯誤；**不可直接改成實站的值**（那是掩蓋問題） |

> **重要原則**：對照的目的是**驗證**，不是**抄答案**。若不一致就抄實站的值，等於放棄自產能力，也失去「超越實站」的可能。

---

## 四、施工順序

### P0｜最高槓桿，立即見效

| # | 項目 | 為什麼先做 |
|---|---|---|
| P0-1 | **補 13 個「頁面已建、route 缺」的資料層** | UI 已在，補 route 即見效 |
| P0-2 | **建立 `provenance.source` 標記機制** | 這是對齊進度的儀表板，沒它就無法追蹤 |
| P0-3 | **建立標竿對照腳本** | BOSS 要的對照機制，且是後續驗收工具 |
| P0-4 | **A 類 47 份的施工清單**（依資料源分 7 組） | 一次接好一個資料源，多個端點同時到位 |

### P1｜自產能力建設

| # | 項目 | 說明 |
|---|---|---|
| P1-1 | 接 TWSE 盤後統計源（覆蓋 12 個端點） | 一次接好，最多端點受益 |
| P1-2 | 接 TAIFEX 期權源（覆蓋 6 個端點） | 同上 |
| P1-3 | 接 TWSE 事件／日曆（5 個端點） | 除權息、處置、鉅額 |
| P1-4 | 技術自算（5 個端點） | 日 K 已有，補型態掃描 |
| P1-5 | 補 4 份混合類的**逐欄**資料源決策 | 不可整支當 A |

### P2｜借用與誠實標示

| # | 項目 | 說明 |
|---|---|---|
| P2-1 | B 類 9 份借用實站快照，標 `site-mirror` | 含分點四畫面 |
| P2-2 | 分點：維持 `channel-broker`（TPEX 彙總）為唯一免費維度 | 逐股分點誠實標「未入庫」 |
| P2-3 | C 類 2 份接 GNews | 唯一低成本可補的新聞源 |

### P3｜第二階段（自產率 ≥ 80% 後）

補實站有而我們沒有的、以及我們獨有的能力（`channel-broker`、GOD 橋接、AI 問答）。

---

## 五、分點：具體處理方案

### 現況

| 分點 API | 實站快照覆蓋 | 我們能否自取 |
|---|---|---|
| `broker-map`（全市場名冊） | ✅ buy[180] + sell[180] | ❌ 需授權 |
| `broker-ranking`（排行） | ✅ 30 筆 | ❌ 需授權 |
| `broker-flow`（逐股） | ⚠️ **只有 2330** | ❌ 需授權 |
| `broker-backtest`（回測） | ⚠️ **只有 2330** | ❌ 需授權 |
| `broker-guide`（主力名冊） | ❌ 空（warming） | ❌ 需授權 |

### 借用實站數據的兩個層次（需 BOSS 選擇）

**選項 A｜只借現有快照（低成本）**
- 可補：`broker-map`（180 分點）、`broker-ranking`（30 筆）
- 不可補：逐股分點（只有 2330）
- 代價：零
- 限制：資料停在 2026-09-24，不會更新

**選項 B｜補抓全市場逐股分點（高成本）**
- 需逐檔造訪 453 個頁面（`capture-logged-in.js` 是被動攔截模式，必須造訪頁面才會發出 API 請求）
- 代價：453 次頁面造訪、需評估站方負擔與合規風險
- 效益：`broker-flow`／`broker-backtest` 可覆蓋全市場

> **我方建議：先做選項 A。** 理由：
> 1. 分點的價值在「歷史序列」，單日快照無法支撐 `broker-backtest`（需要半年資料）
> 2. 補抓 453 頁只得到「一天」的資料，隔天又過期
> 3. 若真要分點，**付費授權才是可持續的路**（也才能支撐回測）
> 4. 現階段用 `channel-broker`（TPEX 彙總）+ 誠實標示，已能滿足「背景濾網」的定位

---

## 六、待 BOSS 裁示

| # | 事項 | 我方建議 |
|---|---|---|
| 1 | 是否核准本計畫的施工順序（P0→P1→P2） | 建議核准 |
| 2 | P0-1「13 個頁面已建、route 缺」是否優先開工 | **強烈建議**，投報率最高 |
| 3 | 分點走「選項 A（只借現有快照）」還是「選項 B（補抓 453 檔）」 | 建議 **A**，理由見第五節 |
| 4 | 對照門檻是否採納（schema 100%／值 95%／填充 90%） | 建議採納，可依實際調整 |
| 5 | 是否維持「不一致時不抄實站值」的原則 | **強烈建議維持**，否則失去自產能力 |
| 6 | 進入第二階段的自產率門檻 | 建議 **80%** |

---

## 附錄：完整度清單的分類方法

- 分類依據：`data-source-matrix.md` 的 A/B/C/D 定義，套用兩條鐵律
  - 「逐股 × 分點 ＝ 付費」
  - 「盤中即時無免費路徑」
- 混合類 4 份（`radar`、`swing-hub`、`market-center/historical-styles`、`member/research-score`）需**逐欄**決定資料源，不可整支當 A
- 需人工確認 1 項：`industry-momentum` 的 `source` 欄自稱 FinMind 付費 dataset，但揭露欄位（產業成交金額）可由 TWSE 官方表自算 → 判 A，但若要求完全比照實站數字需再確認

---

## 七、2026-09-30 複檢修正：P0-1「13 頁缺口」已收口（重要）

> 原 P0-1 列「13 個頁面已建、route 缺」——此判定已過時。經 `src/app/api/` 全量盤點（48 支 route.ts）+ 13 頁逐一複檢，現況如下：

### 13 頁複檢結果

| 路徑 | 頁面 | API route | 真實資料狀態 |
|---|---|---|---|
| `/backtest` | ✅ | `api/skynet/backtest` | ✅ 自產（限 2330×auto site-mirror，其他標 `ok:false` 誠實錯誤） |
| `/block-trades` | ✅ | `api/skynet/block-trades` | ✅ 自產（TWSE BFIAUU + TPEX，失敗回 502 不造假） |
| `/dividend` | ✅ | `api/skynet/dividend-calendar` | ✅ 自產（含自算殖利率） |
| `/risk` | ✅ | `api/skynet/risk` | ✅ 自產（TWSE punish + TPEX disposal） |
| `/etf-active` | ✅ | `api/skynet/etf-active` | ✅ 自產（TWSE opendata） |
| `/margin-maint` | ✅ | `api/skynet/margin-maint` | ✅ 自產（大盤維持率自算） |
| `/trump` | ✅ | `api/skynet/trump-radar` | ✅ 自產（Google News + 白宮 RSS + KV 快取） |
| `/patterns` | ✅ | `api/skynet/pattern-screen` | ⚠️ **KV-only**：讀 `scan:pattern-screen`，未預算回 `ready:false` |
| `/swing` | ✅ | `api/skynet/swing-hub` | ⚠️ **KV-only**：讀 `scan:swing-hub`，未預算回 `ready:false` |
| `/cb` | ✅ | `api/skynet/cb` | ⚠️ **KV-only**：讀 `scan:cb`，未預算回 `not_precomputed` |
| `/fade` | ✅ | — | 誠實靜態頁（分點逐筆為付費源，`hasChannelData` 恆 false，無假數據） |
| `/strategy` | ✅ | — | 誠實靜態頁（19 條策略快照展示，兩區塊標「本站無法提供」） |
| `/sim` | —（路徑錯位） | `api/skynet/market-overview` + `kline` | ✅ 實際在 `/skynet/day-trading-sim`，已接真實 API |

### 關鍵結論

1. **「route 缺」的問題已不存在**——13 頁全部已有對應 route（或設計上即為誠實靜態頁、或路徑錯位已解決）。
2. **唯一真實剩餘缺口**：`pattern-screen` / `swing-hub` / `cb` 三條 route 雖已建好，但為 **KV-only 薄讀取層**，需離線 `scripts/precompute-scan.mjs` 每日盤後寫入 KV 才會有真實資料。這正是 **Plan A（Edge 預算化）的交付物**，程式碼已實作並提交（`86737b7`）——現況只差 **BOSS 本機部署排程**（backfill → precompute → deploy:cf → 裝 launchd plist）。
3. **P0-1 的施工優先級已轉移**：從「補 route」變成「部署 Plan A 讓 3 條 KV 路由上線」。

### 修正後的施工順序

| # | 項目 | 狀態 |
|---|---|---|
| P0-1 | 13 頁資料層 | ✅ 收口（route 全建；3 條 KV 路由待 Plan A 部署） |
| P0-2 | `provenance.source` 標記機制 | ⏳ 待開工（設計已定義，尚未全量落地） |
| P0-3 | 標竿對照腳本 | ⏳ 待開工 |
| P0-4 | A 類 47 份施工清單 | ⏳ 待開工（其中基本面/財報、分點 B3 等已在 `data-source-matrix.md` §2 落地） |

本計畫為唯讀分析後的文件產出，未修改任何程式碼或資料（§七為狀態複檢說明）。
