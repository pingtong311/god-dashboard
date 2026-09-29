# 峰子 App × GOD 分析辦公室：整合規劃藍圖 v1.0

- 日期：2026-09-28
- 撰寫：峰子 App 團隊（天網）
- 狀態：**待 BOSS 查核**
- 依據：四路獨立研究（狙擊 TG 根因、GOD 能力盤點、App 落差稽核、外部知識庫可行性）

---

## 零、執行摘要：三個必須先講清楚的判斷

### 判斷一：GOD 辦公室目前的「預判」沒有驗證，而且它看起來像有

BOSS 問「GOD 產生的數據能否達到預期的股市預判效果」。**誠實回答：現在不能。**

但比「不能」更嚴重的是**它偽裝成能**：

| 表面上 | 實際上 |
|---|---|
| `backtest_20260924.json` 有 `sample: 312`、`win_rate: 54.2%` | **這兩個數字是 LLM 自己填的**，沒有任何引擎算過，無交易級資料支撐 |
| `performance.json` 存在 | 內容**全為 0 與 `"—"`** |
| `calibrationEngine`／`researchOS`／`macdParameterLab`／`technicalForceEngine`／`chipCalculator` 都存在於 `src/` | **零呼叫**，是休眠庫 |
| 排程有「收盤後回測」任務 | 接單的是 LLM agent，不是計算引擎 |

**這比「沒有回測」危險**——因為看起來有，就會被當真。系統不會越用越準，因為它根本沒有在學。

### 判斷二：BOSS 的十個問題，其實是同一個病

| BOSS 的觀察 | 共同病灶 |
|---|---|
| 狙擊 TG 連發重複訊息 | 沒有「上次狀態」的記憶 |
| 推送每 5 分鐘重複寫 KV | 沒有「內容是否變化」的比對 |
| 無法證明選股勝率 | 沒有「事後對帳」的閉環 |
| 知識庫導入後無法提升 | 沒有「檢索→回饋」的累積 |
| 分點拿不到、原版有 40% 權重 | 沒有「資料源授權」的取得路徑 |

**一句話：系統有「當前狀態」，沒有「狀態變化」與「事後驗證」。**

### 判斷三：最大的低垂果實不是新功能，是把已存在卻沒被呼叫的引擎接上

`src/` 底下已有六個確定性引擎（`technicalForceEngine`、`marketStructureEngine`、`chipCalculator`、`macdParameterLab`、`calibrationEngine`、`researchOS`）**全部休眠**。目前 9 成的「分析」是 LLM 單次推理，1 成是極淺的固定算式（`intradayDecisionMath.js` 的目標價＝基準×1.01/1.02/1.03）。

**先喚醒這些引擎，比再導入十個新資料源有效。**

---

## 一、問題一：狙擊選股重複發 TG —— 方案 1 不能解決

### 根因（實測，非推測）

**兩個 repo 裡都沒有一條「偵測接近漲停就發 TG」的程式。** 偵測與發送是分離的：

| 環節 | 位置 | 性質 |
|---|---|---|
| 偵測（純函式，**不發送**） | `FengTeam/src/intradayDecisionMath.js:41` `distancePct <= 2 → 'NEAR_LIMIT_UP'` | 確定性，只 export |
| App 側同款文案 | `skynet-dashboard/src/lib/macd-chart.ts:136` | 純 K 線文案 |
| **真正發送** | `FengTeam/hive/agents/scribe-clerk/identity.md:15-17`「突破通知：現價 ≥ 觸發價×1.005 → 🎯 TG 通知，標記『已觸發』防重複」 | **LLM agent 驅動** |
| 投遞 | repo 外的 n8n webhook | 外部 |

### 為什麼方案 1（內容 hash）確定不可行

- LLM 每輪產出的文案**本來就不一樣**，hash 每次都變 → 照樣連發
- 更根本的：盤勢震盪時「接近漲停」是**同一個狀態反覆游走**，這本來就不該重發——與內容有沒有變無關

### 正解：持久化冪等鍵 + 邊緣觸發

```
觸發條件：prev_state !== 'TRIGGERED' && new_state === 'TRIGGERED'   ← 邊緣
冪等鍵：  (trade_date, ticker, condition_code)                       ← 每日每檔每條件一次
持久層： 需跨 tick、跨重啟存活（檔案／Sheets／KV）
冷卻期： 即使狀態翻轉，最短重發間隔（例如 30 分鐘）
```

### 現有去重機制為何全部失效

| 機制 | 位置 | 失效原因 |
|---|---|---|
| `publisher-dispatcher` | `index.js:71` `dedupCache = new Map()`、`:72` 30 分窗 | **僅記憶體，重啟即歸零**；key 不含條件／狀態 |
| `message-bus` | `index.js:33-34` 5 分窗 | **僅記憶體** |
| App 客戶端 | `property-13-sniper-notification.test.ts:57`、`review/page.tsx` 用 `useState` | 重載即失 |

### 最關鍵的發現：正確規則已經寫在峰子 App 裡了

峰子 App 自己就定義了原版 App 的通知規則：

- `src/app/notify/page.tsx:66,74`：**「每檔每類每日最多一次」「同族群同日最多一次」**
- `src/app/alerts/page.tsx:118`：**「命中後那一則會自動關掉」**

**規則不用重新發明。** 複刻版照抄了原版的通知規則，但上游 GOD 辦公室的實作沒有遵守它。要做的是把 App 已定義的規則**落實到上游**。

### 排程頻率現況（重複的放大器）

| 排程 | 頻率 |
|---|---|
| `beta-sniper-0830` / `1330` | 每日一次 |
| `beta-sniper-intraday` | 09:00–13:40 **每 20 分** |
| `god-loop`（驅動 hive-runner） | **每 5 分** |
| `scribe-patrol`（真正發 TG） | 09:00–13:45 **每 15 分** |

盤中每 15 分鐘有機會重發一次 → 一天最多 19 次同內容通知。

---

## 二、問題二：GOD 辦公室的預判能力 —— 誠實評估

### 現況性質

GOD 目前本質是**「盤後統計聚合 ＋ 單次 LLM 判讀」**，不是預測系統。

- 決策邏輯約 **9 成 LLM ＋ 1 成規則**
- `hive-runner.mjs` 把 `identity.md` + `memory.md` + 資料包組成 prompt，呼叫 LiteLLM（NVIDIA NIM），LLM 直接吐 JSON
- 規則僅用於資料聚合與契約驗證

### 七位分析師 agent（`hive/registry.json`）

| agent | 職責 | 核心產出 | LLM |
|---|---|---|---|
| `michael-god` 總管 | 調度、裁決、唯一寫 board.md | `board.md`、派工訊息 | 是 |
| `alpha-radar` 雷達 | 06:00 情報掃描 | `intel_*.md`、`radar_*.json`、`daily-highlights_*.json` | 是 |
| `beta-sniper` 狙擊 | 選股評分 | `candidates_*.json`、`sector-sniper.json` | 是 |
| `omni-analyst` 軍師 | 單檔深度分析 | `analysis_*.json`（action/confidence/target） | 是 |
| `scribe-clerk` 書記 | 記帳、巡邏、TG/LINE 通知 | tg/line 訊息、Google Sheets | 是 |
| `dashboard-feeder` 餵給 | 聚合輸出 | `fusion/warroom/performance.json`、`dashboard/latest-date/warroom-boards` | 是 |
| `research-archivist` 歸檔 | 回測、證據包、記憶 | `backtest_*.json`、`evidence_*.json` | 是 |

### 資料維度：已覆蓋 vs 缺失

| 已覆蓋 | 缺失（括號為對選股的影響） |
|---|---|
| 全市場日成交 OHLC／量／值 | **券商分點**（原版 BlackScore 佔 **40 分**） |
| 三大法人逐股（TWSE T86） | 買方集中度 |
| 融資融券 | 集保大戶（程式有、**缺源**） |
| PE/PB/殖利率 | 財報／月營收（MOPS 未接） |
| 大盤統計、當沖、重大訊息 | **新聞情緒**（GNews 已備**未接**） |
| TPEX 櫃買、MIS 即時報價 | 台指期夜盤／VIX／美股 |
| | 盤中五檔、K 線型態掃描、產業輪動 |

### 資料常態失效

**資料日期停在 2026-09-24（今日 09-28）。** `daily-highlights`／`radar` 標 `honest_gap`，`performance` 全零。

### 最弱三環（按嚴重度）

1. **閉環驗證缺失（最致命）**——無真實交易、勝率、事後驗證；唯一「回測」是 LLM 自填 JSON
2. **關鍵維度缺失 ＋ 資料常態失效**——分點（40% 權重）、新聞、財報、夜盤全缺；資料落後數日
3. **決策深度與記憶不足**——9 成單次 LLM 推理、確定性引擎休眠、無 RAG／向量記憶、無反面意見機制，輸出多為 `WAIT`／低信心

### 唯一的好消息

**管線通了。** 9/26 報告指出的「自動化空轉」（排程脫節、app 未運行）已於 9/28 修復——god-loop 實跑、6 端點推送全 200。但這只代表**管線通**，不代表**預判有效**。

---

## 三、問題十：峰子 App 有哪些 GOD 資料沒被套用

### 實測基準

- 峰子 App：**62 個 `page.tsx`**（含 3 動態路由）、`src/app/api/skynet` **34 支 `route.ts`**
- GOD 的 6 個 endpoint 與原版 App 的 **92 份 API 快照 1:1 對應**

### 6 支 endpoint 的實際消費狀況

| endpoint | 原版對應 | 峰子消費頁 | 狀態 |
|---|---|---|---|
| `dashboard` | `/api/dashboard` | `/today/` | ✅ 已用 |
| `radar` | `/api/radar` | `/radar/` | ✅ 已用 |
| `daily-highlights` | `/api/daily-highlights` | 無 | ⚠️ **有推沒人用** |
| `warroom-boards` | `/api/warroom-boards` | 無 | ⚠️ **有推沒人用** |
| `sector-sniper` | `/api/sector-sniper` | 無 | ⚠️ **有推沒人用** |
| `latest-date` | `/api/latest-date` | 無 | ⚠️ **有推沒人用** |

**全站只有 `GodPanel` 兩處引用。** 4 支資料每天被推送進 KV，然後無人聞問。

### 應加掛的頁面（不需要新增任何 endpoint）

| 頁面 | 建議接的既有 endpoint |
|---|---|
| `src/app/sector/page.tsx` | `sector-sniper`（原版 `/api/sector-sniper?limit=8` → `/sector/`） |
| `src/app/today/page.tsx` | 追加 `daily-highlights`、`warroom-boards`（原版同頁三支） |
| `src/app/live/page.tsx` | `dashboard`／`warroom-boards` |
| `src/app/reports/page.tsx` | `daily-highlights` |
| `src/app/market/page.tsx` | `dashboard` |
| `src/app/notify/page.tsx`、`src/app/alerts/page.tsx` | `warroom-boards` |
| layout 或 today（全域資料日） | `latest-date` |

**結論：缺口是「沒接」，不是「沒推」。現有 6 支就是原版全部所需。**

---

## 四、問題九：分點資料 —— 免費版這條路不存在

### 事實

原版股市大佬的**免費版公開層本身就不含分點明細**。依 `08-博主演算法與內容-實站抽取.md` 的分層模型：

- **公開層**：收盤／漲跌／量／BlackScore／法人近 5 日
- **註冊內需**：分點明細

來源是交易所授權服務（TWSE eshop／FinMind Sponsor 付費）。**免費公開層不含分點明細。**

### 峰子 App 現況

| route | 狀態 |
|---|---|
| `src/app/api/skynet/channel/route.ts` | **誠實骨架**，不打上游，恆回 `hasChannelData:false`（FinMind Sponsor 付費，B 路定案） |
| `src/app/api/skynet/channel-broker/route.ts` | TPEX `tpex_daily_broker1` 上櫃**分點營業金額彙總 top10**，**非逐股**，僅 `/chips/[ticker]` 用 |

### 務實路徑（方向要反過來）

**GOD 辦公室才是持有授權資料的那一端**，不是峰子 App。

```
GOD 辦公室（有授權）→ 新增推 broker-flow endpoint → KV
                     → 峰子 App 以 hasChannelData flag 消費
                     → 未取得前，/radar、/chips、/stock、/ranking 一律誠實標「未入庫」
```

**不造假是底線。** 原版 BlackScore 分點佔 40 分權重，缺了它就必須誠實標示，不能拿別的資料湊數。

---

## 五、問題三～七：知識庫與勝率最大化

### 問題三／四：如何佐證 GOD 的輸出？

目前**無法佐證**，因為沒有閉環。要做的是**建立對帳機制**：

1. 每次 GOD 產出「預測」時，寫入一筆 `prediction_ledger`（標的、方向、信心、目標價、時間戳）
2. T+1／T+3／T+5 自動回填實際報酬
3. 計算勝率、平均報酬、最大回撤，**標註樣本數**
4. 樣本 < 300 一律標「未校準」，不宣稱勝率

**這一步不做，後面所有「提高勝率」的努力都無法證明有效。**

### 問題五：分析師團隊下條件提升勝率

條件要能被**驗證**才有意義。建議流程：

```
假設（例如：分點集中度 > 12% 且法人連買 3 日 → T+3 勝率 > 60%）
  → 從 prediction_ledger 撈歷史樣本
  → 算條件勝率 + 樣本數 + 基準對照（同期大盤）
  → 勝過基準才納入正式條件
```

現有 `calibrationEngine.js`（`calibrateSignalScore`／`evaluateParameters`／`validateTrialForPromotion`）**就是為此而生，但零呼叫**。喚醒它。

### 問題六：YT／TikTok 外部知識庫

#### 現況：峰子 App 端知識庫幾乎為零

| 元件 | 實況 |
|---|---|
| `src/app/api/skynet/ai-chat/route.ts` | 純代理 NVIDIA NIM，system prompt 寫死 7 條原則（`src/lib/aiChat.ts:38`），**無任何檢索** |
| `src/app/api/flowise/route.ts:5` | 註解「Flowise 已停用」，改打 n8n webhook |
| 全站 grep Pinecone／embedding／vector／retrieval | App 端**無向量檢索** |

#### 真正的向量庫在上游 FengTeam，但疑似停更

- 本地 Qdrant 4 collections：`analysis_reports`／`decision_cases`／`news_events`／`opensource_docs`（各 2–4MB，**最後寫入 2026-09-20**）
- `scripts/batch/daily-vector-indexing.sh`：`gateway.search_news`（GNews）→ 向量化新聞
- **但 `DATA_SOURCES.md:110` 註明：Python gateway（PG+Qdrant+MinIO）已依 BOSS 指示停用**
- `munder_tools/knowledge-curator/index.js` 標頭寫「PDF／**影片**／文章／語音解析→摘要→規則抽取→向量化入庫」，依賴 `youtube-transcript`——**影音轉知識庫骨架已存在，但屬 legacy 已歸檔**

#### 影音導入技術路徑

| 路徑 | 成本／方式 | 合規 |
|---|---|---|
| YT 官方 API 字幕 | `captions.list` 50 units／次，預設 10,000 units／日 | **第三方影片 `captions.download` 直接 403，僅能下載自有頻道** → 對分析師影音**不可用** |
| `yt-dlp` + Whisper | 開源免費（本機／GPU） | 繞 API，需自評 ToS／著作權 |
| 第三方轉錄 API | Supadata／Apify／transcriptapi，訂閱制 | 重製風險 |
| TikTok | 官方**無**公開逐字稿 API，需 Research API 資格 | 高風險 |

### 問題七：抽牌機率知識庫

#### 落地設計

**事件表**（這是一張統計表，不是新模型）：

```
{symbol, industry, ts, event_type(news/chip/analyst), source,
 direction, magnitude, market_ctx(加權/櫃買/夜盤/美股/VIX),
 horizon(T+1/T+3/T+5), outcome_return, hit}
```

| 事件類型 | 來源 | 現況 |
|---|---|---|
| `chip` | 現有 T86／融資／量能 | ✅ 可自動生成 |
| `news` | GNews | ⚠️ 已備未接 |
| `analyst` | 影音轉錄抽取 | ❌ 未做（合規風險） |

查詢：`P(漲 | 條件)` + 樣本數，樣本 < 300 標「未校準」。

### 風險排序：**合規 > 時效 > 成本 > 雜訊**

**最致命是著作權。** 把分析師影音逐字稿重製進商業 App 並輸出，屬重製他人受保護內容。YouTube 官方對第三方字幕回 403 已印證平台立場。

### MVP（不要一次做大）

1. **先不碰影音**：用**已有**的 GNews + T86 建 `event_ledger` + 條件機率查詢，跑 3 個月回測，驗證勝率是否勝基準
2. **影音只做單頻道 PoC**：`yt-dlp` 抓字幕 → LLM 抽「標的／方向／時間」結構化欄位，**只存欄位不存逐字稿全文**
3. **向量庫沿用本地 Qdrant**，暫不導入 Pinecone，直到 PoC 證明有效

---

## 六、路線圖：建議的執行順序

### 第 0 階段（立即可做，零風險）

| 項目 | 內容 | 為什麼先做 |
|---|---|---|
| **P0-1** | 加掛 4 支未使用的 GOD 資料到既有頁面（sector／live／reports／market／notify／alerts） | 資料已在 KV，接線即可見效，**零新增成本** |
| **P0-2** | 推送加「內容變更偵測」 | 同時解決 KV 寫入超額與 `stale` 訊號失效（見 v1.0 頻率審查文件） |
| **P0-3** | 通知改「持久化冪等鍵 + 邊緣觸發」 | 直接消滅 BOSS 回報的 TG 重複問題 |

### 第 1 階段（打地基，最關鍵）

| 項目 | 內容 |
|---|---|
| **P1-1** | **建 `prediction_ledger`**：每次預測落帳，T+1／T+3／T+5 回填實際報酬 |
| **P1-2** | **喚醒休眠引擎**：`calibrationEngine`、`researchOS`、`technicalForceEngine`、`chipCalculator`、`macdParameterLab` 接進 `hive-runner` 流程 |
| **P1-3** | **修資料常態失效**：資料停在 09-24 的根因排查與修復 |
| **P1-4** | 接上 GNews 新聞情緒（已備未接） |

### 第 2 階段（擴充維度）

| 項目 | 內容 |
|---|---|
| **P2-1** | GOD 新增 `broker-flow` endpoint（需先確認授權資料來源） |
| **P2-2** | 建 `event_ledger`（chip + news），做條件機率查詢 |
| **P2-3** | 接 MOPS 財報／月營收 |
| **P2-4** | 台指期夜盤／VIX／美股連動 |

### 第 3 階段（知識庫）

| 項目 | 內容 |
|---|---|
| **P3-1** | 重啟 Qdrant（或替代方案）並接回檢索 |
| **P3-2** | 單頻道影音 PoC（只存結構化欄位） |
| **P3-3** | 條件勝率驗證通過後，才納入正式選股條件 |

---

## 七、待 BOSS 裁示事項

| # | 事項 | 我方建議 |
|---|---|---|
| 1 | 推送頻率（承接前次） | 改「變更偵測 + 收盤後觸發」，理由見 `god-push-frequency-review.md` |
| 2 | 是否核准 P0 三項立即執行 | 建議核准，P0 皆為低風險接線與去重 |
| 3 | 是否核准建 `prediction_ledger`（P1-1） | **強烈建議**——這是所有勝率宣稱的前提 |
| 4 | 分點授權資料是否已有取得路徑 | 若無，`broker-flow` 無法落地，須誠實標示缺失 |
| 5 | 影音知識庫合規風險的接受度 | 建議先做 P1/P2，影音留到第 3 階段並只存欄位 |
| 6 | Qdrant 是否重啟 | 需 BOSS 確認（先前停用為 BOSS 指示） |

---

## 附錄：本次研究的四份原始報告要點

| 研究 | 關鍵發現 |
|---|---|
| `sniper-tg-rootcause` | 無「接近漲停發 TG」程式；發送在 scribe-clerk（LLM）；去重全在記憶體；App 已定義正確規則 |
| `god-capability-audit` | 無有效驗證機制；`backtest` 數字為 LLM 自填；六引擎休眠；資料停在 09-24 |
| `app-god-gap-audit` | 62 頁／34 route；6 endpoint 中 4 支有推沒人用；分點無源，免費版不含明細 |
| `kb-external-research` | App 端知識庫為零；Qdrant 疑似停更；YT 第三方字幕 403；最致命風險為著作權 |
