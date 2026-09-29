# GOD 產出 vs 股市大佬實站：資料比對評估報告

- 日期：2026-09-28
- 撰寫：峰子 App 團隊（天網）
- 狀態：**待 BOSS 查核**
- 比對基準：
  - 實站側：`/Users/sheng-feng/Antigravity-Rule/IOS_design/captured/login-capture/api/`（92 份 API 快照，抓取於 2026-09-24）
  - GOD 側：`/Users/sheng-feng/Antigravity-Rule/FengTeam/data/api/app/`（6 份，2026-09-28 21:25 更新）
  - 同日歷史：`FengTeam/data/api/*_20260924.json`（可做同日值比對）

---

## 零、四個問題的直接回答

| BOSS 的問題 | 答案 |
|---|---|
| 相似度達到幾成？ | **結構（schema）75%**；**欄位覆蓋率 32%**；**資料填充度 36%** |
| 準確率達到幾成？ | **無法計算**——GOD 多數欄位是空的，沒有可比對的數值。僅 `latest-date` 一項完全一致 |
| 現階段能用峰子取代股市大佬嗎？ | **不能。** API 覆蓋率僅 **6.5%**（92 份做 6 份），頁面覆蓋率 **3.2%**（62 頁只有 2 頁消費） |
| 由我們產生會更精準嗎？ | **目前不會，但有一個結構性優勢**（GOD 是活的、實站快照是死的）。精準度要等建立對照組才能談 |

---

## 一、Schema 相似度：75%（這是好消息）

### 逐 endpoint 欄位比對

| endpoint | 實站欄位 | GOD 欄位 | 共同欄位 | 實站空值率 | GOD 空值率 | 陣列長度比 |
|---|---|---|---|---|---|---|
| dashboard | 28 | 15 | 9 | 7% | 40% | **31%** |
| daily-highlights | 34 | 19 | 18 | 0% | 53% | **56%** |
| sector-sniper | 17 | 30 | 17 | 0% | **0%** | **131%** |
| warroom-boards | 19 | 5 | 5 | 0% | 20% | **0%** |
| radar | 86 | 10 | 10 | 2% | 40% | **0%** |
| latest-date | 1 | 1 | 1 | 0% | 0% | — |
| **合計** | **185** | **80** | **60** | — | — | — |

### 兩個關鍵數字

```
GOD schema 精確度 = 共同欄位 / GOD 欄位 = 60/80 = 75%
   → GOD 自己定義的欄位，有四分之三與實站同名同義
   → 證明 GOD 是「照著實站的 schema 設計的」，方向正確

GOD 欄位覆蓋率 = 共同欄位 / 實站欄位 = 60/185 = 32%
   → 實站有的欄位，GOD 只做了三分之一
```

**結論：schema 設計對齊度高（75%），問題在「沒填滿」而不是「設計錯」。**

### 唯一超越實站的地方

`sector-sniper` 是 GOD 唯一勝過實站的一項：

| | 實站 | GOD |
|---|---|---|
| 欄位數 | 17 | **30** |
| 空值率 | 0% | **0%** |
| 陣列長度 | items[5] | items[1] |
| 獨有欄位 | — | **`black_score`**（score / max / honest_gap / gap_note / ready_components / missing_components） |

GOD 多做了 **BlackScore 分數**，而且附帶 `honest_gap` 與 `missing_components` 誠實標示——**這是實站沒有的**。

---

## 二、資料填充度：36%（這是壞消息）

### 最嚴重的三項

| endpoint | 實站 | GOD | 填充度 |
|---|---|---|---|
| **radar** | `movers[25]`（25 檔完整價量）+ `locked_yesterday` + `disposition_unlock` + `news_movers` + `block_trades` | `movers[0]`、`locked_yesterday[0]` | **0%** |
| **warroom-boards** | `boards[12]`（12 個戰情板塊） | `boards[0]` | **0%** |
| **dashboard** | `breadth[33]`、`inst_flow[3]`、`inst_top_buy[10]`、`index_spark.taiex[10]` | `breadth[0]`、`watch_groups[2]`、`avoid_groups[2]` | **31%** |

`dashboard` 的核心數值欄位全部是 `NoneType`：

```
red / green / flat / n_stocks / turnover  →  實站有值，GOD 全是 null
```

`daily-highlights` 的 `data.market_summary` 11 個欄位中，**7 個是 null**，`top_gainers` / `top_institutional_buys` / `industry_focus` **全部空陣列**。

---

## 三、同日值比對（2026-09-24）：一致率極低

GOD 保留了 09-24 的歷史檔，可與實站快照做**同日比對**：

| endpoint | 比對結果 |
|---|---|
| `latest-date` | ✅ **完全一致**（`latest = "2026-09-24"`） |
| `dashboard` | ❌ `ready: true→false`；`scope: "eod" → {object}`（型別不同） |
| `daily-highlights` | ❌ GOD 只有 `honest_gap / gap_note / date / note`，**沒有 `data`** |
| `radar` | ❌ GOD 只有 `honest_gap / gap_note / date / note`，**沒有 `movers`** |

**4 個可同日比對的 endpoint 中，只有 1 個完全一致。**

> 注意：GOD 對缺資料的處理是**誠實的**——它填 `honest_gap: true` + `gap_note` 說明，而不是填 0 或假數字。這是正確的做法（符合原版「缺資料顯示『—』或『未入庫』，不以 0 代替」的原則）。

---

## 四、契約合規：目前 6/6 通過（但有歷史違規紀錄）

GOD **有**契約驗證機制（`_quarantine/` + `.violation.json`），今天白天曾發生 4 次違規：

| 檔案 | 時間 | 違規內容 |
|---|---|---|
| `dashboard.json` | 12:48 | `/scope` 型別錯（給了 object，應為 string enum） |
| `latest-date.json` | 05:56 | `/latest` 不符 `YYYY-MM-DD` 格式 |
| `sector-sniper.json` | 08:06 | `/scope` 長度不足 8 字元 |
| `warroom-boards.json` | 12:48 | `/boards/0/scope`、`/boards/1/scope` 型別錯 |

**已全部隔離，且後續產出已修復。經複查，目前 6 個 endpoint 的 `scope` 欄位全部合規。**

> **診斷**：違規集中在同一個欄位 `scope`。實站的 `scope` 是「資料口徑標記」（`"eod"` / `"intraday"` / …），但 `daily-highlights` 的 `scope` 又是**說明文字**（`"盤後資料（最新交易日），客觀統計，非投資建議"`）——**不同 endpoint 的 scope 語義不同**。GOD 的 agent 誤解了這個欄位。這是**語義誤解**，不是能力不足。

**價值**：這套隔離機制是好的——它讓「壞資料進不了 App」，符合資料誠實原則。**應保留並強化。**

---

## 五、宏觀覆蓋率：這才是「能否取代」的真正答案

### API 覆蓋率：6.5%

```
實站 API 快照      92 份
GOD 可推送 endpoint  6 份
─────────────────────────
覆蓋率 = 6/92 = 6.5%
```

### 頁面覆蓋率：3.2%

```
峰子 App 頁面      62 個
消費 GOD 資料的頁面  2 個（/today/、/radar/）
─────────────────────────
覆蓋率 = 2/62 = 3.2%
```

### 實站 92 份 API 清單與 GOD 可自產性評估

| 類別 | API | GOD 可自產？ |
|---|---|---|
| **已做** | `dashboard` `radar` `daily-highlights` `sector-sniper` `warroom-boards` `latest-date` | ✅ 已推送（但填充度低） |
| **可自產**（免費公開源） | `market` `market-env` `market-heatmap` `market-sentiment` `industry-momentum` `sector-heatmap` `stock` `stock-bars` `stock-ranks` `stock-search` `tech-scan` `pattern-screen` `swing-hub` `chip-overview` `margin-radar` `sbl-radar` `dividend-calendar` `cb-arbitrage` `valuation-history` `futures-spread` `options-index` `futures-large-traders` `stock-disposition` `disposition-calc` `stock-force` `risk` `stock-news` | ✅ 應可做（TWSE/TPEX/MOPS/GNews） |
| **需授權** | `broker-flow` `broker-map` `broker-ranking` `broker-backtest` `broker-guide` `market-chip-bias` | ❌ 分點類（FinMind Sponsor／交易所授權） |
| **需外部服務** | `realtime` `intraday-indicators` `jack-signal` `stock-news`（即時） | ⚠️ 需即時行情授權 |
| **平台自身功能** | `account` `auth` `member` `passkey` `push` `public` `quests` `sim` `guess` `community` `brand-partners` `national-team` `site-status` `strategies` `market-center` `p1` | ➖ 非資料類，是站台功能 |

**關鍵洞察**：92 份 API 中，**約 27 份是 GOD 應該做得到的**（免費公開源），**6 份需授權**（分點），其餘是平台功能或需即時授權。

**→ 真正的缺口不是「做不到」，是「還沒做」。**

---

## 六、回答「由我們產生會不會更精準」

### 目前：不會

| 面向 | 實站 | GOD |
|---|---|---|
| 資料廣度 | 92 份 API | 6 份 |
| 資料填充度 | 高（空值率 0-7%） | 低（36%） |
| 分點（40% 權重） | ✅ 有授權 | ❌ 無 |
| 即時行情 | ✅ 有授權 | ❌ 無 |
| **資料新鮮度** | ❌ 快照停在 09-24 | ✅ **每天更新（今天 21:25）** |
| **契約驗證** | 未知 | ✅ **有隔離機制** |
| **缺資料誠實標示** | 部分 | ✅ **honest_gap 明確** |
| **BlackScore** | ❌ 無 | ✅ **有** |

### 但有兩個結構性優勢

1. **GOD 是活的，實站快照是死的。** 實站快照停在 2026-09-24，GOD 今天 21:25 還在更新。**這是「取代」在邏輯上唯一可能成立的地方——但前提是資料要填滿。**
2. **GOD 有契約驗證與誠實標示機制。** 壞資料進不了 App，缺資料明確標示。這比「看起來完整但可能是假的」更可靠。

### 「精準度」目前無法比較

因為 GOD 多數欄位是空的，**沒有可比對的數值**。要談精準度，必須先有：
- 填滿的資料
- 與實站的同日對照
- 樣本數與基準率（見前次方法論評估）

---

## 七、回答「GOD 生不出來才去抄股市大佬」

**策略方向對，但要修正三個地方：**

### 修正 1：抄的是「schema 與語義」，不是「數值」

數值是別人的資料，抄進我們的產出**不能當成我們的產出**，而且會失去「資料誠實」的立足點。

✅ 該抄：92 份 API 的**欄位結構、型別、enum 值、scope 語義**
❌ 不該抄：具體的數值（漲跌家數、法人買超張數…）

### 修正 2：順序不是「先抄」，是「先對齊再補」

```
① 以實站 92 份 API schema 建立「完整度清單」
② 逐項標記：GOD 可自產 / 需授權 / 不可得
③ 可自產的先做（約 27 份）
④ 需授權的誠實標「未入庫」（6 份分點類）
⑤ 不可得的維持誠實標示，不造假
```

### 修正 3：`scope` 語義要先釐清

今天的 4 次契約違規全部源自 `scope` 語義誤解。**不同 endpoint 的 scope 語義不同**（dashboard 是口徑代碼、daily-highlights 是說明文字），必須逐 endpoint 明確定義後再交給 agent。

---

## 八、回答「這樣會不會更完善」

**會，但關鍵不在「抄」，在「對齊」。**

目前最有價值的發現是：**GOD 的 schema 已經對齊 75%**。這說明架構方向是對的，缺的是**執行填充**。

```
現況：架構對（75%）、內容空（36%）
路徑：補填充 → 建對照 → 才談精準度
```

**如果按「先抄數值」的路走**，會得到一個看起來完整、但實際上是別人資料的 App——既不能證明自己的價值，也違背已建立的誠實原則。

**如果按「先對齊 schema、再逐項自產」的路走**，GOD + 峰子會形成一個**有契約保障、誠實標示、可持續更新**的系統。這才是「更完善」的正確含義。

---

## 九、待 BOSS 裁示

| # | 事項 | 我方建議 |
|---|---|---|
| 1 | 是否以實站 92 份 API schema 建立「完整度清單」並逐項分類 | **建議做**，這是補填充的施工圖 |
| 2 | 是否先補那 ~27 份「可自產」的 API | 建議優先，成本最低、效益最直接 |
| 3 | 分點類 6 份是否爭取授權 | 不取得則永遠缺 BlackScore 的 40 分權重 |
| 4 | 是否維持「缺資料誠實標示」原則 | **強烈建議維持**，這是目前 GOD 相對實站最可靠的優勢 |
| 5 | 「現階段能否取代」的結論是否接受 | 我方結論：**不能**，覆蓋率 6.5% 差距過大 |

---

## 附錄：本次比對的量化方法

```python
# schema 覆蓋率
共同欄位 / 實站欄位 = 60/185 = 32%
# schema 精確度
共同欄位 / GOD 欄位 = 60/80 = 75%
# 填充度（陣列長度比）
GOD 陣列總長 / 實站陣列總長 = 36%
# 同日一致率
完全一致的 endpoint / 可比的 endpoint = 1/4 = 25%
# API 覆蓋率
GOD endpoint / 實站 API = 6/92 = 6.5%
```

比對腳本為一次性分析，未寫入專案。原始資料未修改。
