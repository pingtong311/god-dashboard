# 峰子 App ↔ FengTeam（華爾街峰子 God 辦公室）協同計畫書

> 版本：v1.0（2026-09-27）
> 撰寫：峰子 App 工程團隊（team-lead 彙整）
> 狀態：**待 BOSS 查核確認後才執行系統變更**（依既有作業慣例）
> 依據：`/Users/sheng-feng/Antigravity-Rule/FengTeam/華爾街峰子_完整部署計劃報告書_替換天網系統_20260918_v3.md`（v6.0）、`FENGTEAM_三組交叉比對報告書_20260926.md`

---

## 一、結論摘要（先看這段）

1. **兩邊的設計意圖本來就是對接的**。FengTeam 報告原文（`v3.md:688`）：
   > 「**儀表板不自建** — 輸出標準化 JSON 供外部團隊複刻 App 消費。」

   所以「峰子 App 是 FengTeam 的指定消費端」不是新提案，是 FengTeam 既定的架構決策。本計畫只是把它接通。

2. **唯一的硬障礙是網路位置**：FengTeam 的 6 個端點在 `http://127.0.0.1:4010`（本機），峰子 App 在 Cloudflare Workers（公網）。**兩者現在無法互通**。這是本計畫要解決的核心問題（見 §四）。

3. **FengTeam 目前覆蓋率低，主因不是拿不到資料**。45 項功能中：✅ 4、🟡 9、**🔧 工程缺口 17**、⛔ 物理缺口 7、⚪ 非職責 8。也就是**卡點在「有源但還沒做成端點」，不是資料源買不到**（`三組交叉比對:198-200`）。

4. **現在是對接的最佳時機**：9/26、9/27 為非交易日，多數 payload 是空的（`dashboard.json` `ready:false`、`radar.json` `movers:[]`、`warroom-boards.json` `available:false`）。**週二 2026-09-29 開盤**才會有第一批真實資料——在那之前把管道鋪好，開盤當天即可端到端驗證。

---

## 二、現況盤點

### 2.1 FengTeam 側（God 辦公室）

| 項目 | 狀態 | 出處 |
|---|---|---|
| god-loop 排程 | **已載入並實際在跑**，每 5 分鐘 tick，最後 tick 2026-09-27 22:41 | `logs/god-loop-20260927.log` |
| app-server / litellm-proxy | **state=running** | `launchctl print` |
| 6 個 App 消費端點 | **實測全數 HTTP 200**（`http://127.0.0.1:4010/api/*`） | 實測 |
| LaunchAgents 數量 | 24 個 `com.fengteam.*` plist（報告寫 23，實際 24） | `launchctl list` |
| 名冊 | v1.0 情報鏈路七人（v5.0 四池已廢止） | `v3.md:30,288-292` |

**6 個端點與實際產出檔案**（`data/api/app/`）：

| 端點 | 檔案 | 現況 |
|---|---|---|
| `/api/latest-date` | `latest-date.json` | 可用 |
| `/api/dashboard` | `dashboard.json` | `ready:false`（待開盤） |
| `/api/warroom-boards` | `warroom-boards.json` | `available:false`（待開盤） |
| `/api/radar` | `radar.json` | `movers:[]`（待開盤） |
| `/api/daily-highlights` | `daily-highlights.json` | `honest_gap:true` |
| `/api/sector-sniper` | `sector-sniper.json` | `black_score` 降權 45/100（分點缺口） |

**統一信封格式**（`contracts/schema-v1/`）：
```json
{ "schema_version": "...", "endpoint": "...", "generated_at": "...", "provenance": {...}, "payload": {...} }
```
`radar` payload 欄位：`is_open, snapshot_ok, snapshot_fresh, trade_date, ref_close_count, ex_ref_count, movers_scope, movers[], locked_yesterday[], disposition_unlock, news_movers, block_trades, options_pcr, note`
範例：`{"stock_id":"3021","label":"鴻名","price":26.95,"change_pct":10.0,"volume_lots":1665,...}`

### 2.2 峰子 App 側

- 44 個功能頁已上線：`https://skynet-dashboard.xpornky1122.workers.dev`
- 已有 **33 條 `/api/skynet/*` route**，資料源為 TWSE / TPEX / Fugle / TAIFEX 直連
- **已有 KV binding `SKYNET_CACHE`**，且在 `src/app/api/skynet/futures/route.ts` 有實證用法（跨 isolate 冷啟動快取）——這是接 FengTeam 資料的現成通道

**關鍵：兩邊的資料是「同一份市場的兩種算法」，不是上下游關係。** 峰子 App 自己會算，FengTeam 也自己算。所以要接的不是「原始資料」，而是 **FengTeam 的「分析結論」**（狙擊名單、雷達事件、戰情看板），這才是 God 辦公室的價值。

---

## 三、覆蓋率對照（45 項，取自 `三組交叉比對報告書:106-196`）

| 群組 | 項數 | FengTeam ✅ | 🟡 | 🔧 工程缺口 | ⛔ 物理缺口 | ⚪ 非職責 |
|---|---|---|---|---|---|---|
| 今天 | 9 | 2 | 1 | 5 | 1 | 0 |
| 股票 | 6 | 0 | 2 | 1 | 3 | 0 |
| 選股 | 13 | 1 | 4 | 7 | 1 | 0 |
| 我的 | 9 | 0 | 0 | 2 | 2 | 5 |
| 教學＋更多 | 8 | 1 | 2 | 2 | 0 | 3 |
| **合計** | **45** | **4** | **9** | **17** | **7** | **8** |

**可立即對接的 4 項（✅）**：
| 峰子路由 | FengTeam 端點 |
|---|---|
| `/today/` 今日戰情 | `/api/dashboard` |
| `/radar/` 事件雷達 | `/api/radar`（四排序） |
| `/picks/` 量價觀察 | 狙擊 Top10（`/api/sector-sniper`） |
| `/ask/` 問大佬AI | NVIDIA NIM（**峰子已完成**，優於原版 5 次／日限制） |

---

## 四、核心問題與三個方案（**這一節是需要 BOSS 決定的**）

### 問題
FengTeam 端點綁在 `127.0.0.1:4010`，峰子 App 跑在 Cloudflare 邊緣（公網）。**手機上的 App 打不到 BOSS 的筆電。**

### 方案 A：Cloudflare Tunnel（把本機服務暴露到公網）
- 用 `cloudflared` 把 `127.0.0.1:4010` 映射成一個 `*.trycloudflare.com` 或自有子網域
- 峰子 App 直接 `fetch` 該網址；FengTeam 側**零改動**（完全符合其原設計）
- ✅ 最符合原架構、改動最小
- ⚠️ 筆電關機／休眠即斷線；需處理 tunnel 的開機自啟與認證

### 方案 B：FengTeam 主動推送進 Cloudflare KV（**建議**）
- FengTeam 在每次產出 JSON 後，多跑一步把 payload 寫進峰子 App 既有的 KV namespace（`SKYNET_CACHE`，已存在且有實證用法）
- 峰子 App 新增薄 route（如 `/api/skynet/god/{endpoint}`）讀 KV 回傳
- ✅ **不需要 inbound tunnel、不需要筆電隨時在線**（寫入是一次性動作）
- ✅ 複用峰子既有 KV 基礎設施，App 端改動極小
- ✅ 天然就是「離線快取」——筆電沒開時 App 仍讀得到最後一次快照
- ⚠️ FengTeam 側要多一支推送腳本（`wrangler kv key put` 或 Cloudflare API）

### 方案 C：FengTeam 產生靜態 JSON，納入峰子 repo 部署
- 每次開盤後把 JSON commit 進峰子 repo，隨部署上線
- ✅ 最簡單、零維運
- ⚠️ 資料新鮮度受限於部署頻率（不適合盤中即時）；會讓 repo 充滿資料檔

**建議：方案 B 為主、方案 A 為輔。** B 解決「穩定供應」，A 保留「需要即時查詢時」的彈性。

---

## 五、分工建議

### FengTeam 側（由 God 辦公室的團隊處理）
1. 確認 6 端點在**交易日**能產出非空 payload（週二 9/29 開盤為第一次實測）
2. 決定並實作推送機制（方案 B 的推送腳本，或方案 A 的 tunnel）
3. **清 God inbox 積壓**（Action Item 13，實測仍有積壓）——積壓會讓派工延遲
4. **決議 Action Item 28**：6 個指向已廢棄 `bus.jsonl` 的遺留排程是否退役（`v3.md:660`）
5. 排程 `Item 15`：God session restart 以啟用 nemotron-ultra

### 峰子 App 側（本團隊）
1. 新增讀取層：`/api/skynet/god/{dashboard|radar|sector-sniper|daily-highlights|latest-date|warroom-boards}`（依方案而定）
2. 在對應頁面接上：`/today/`、`/radar/`、`/picks/`
3. **維持資料誠實原則**：FengTeam 回空／未就緒時，頁面顯示「God 辦公室資料尚未產出」的骨架，**絕不填假數字**（與現有 44 頁一致的做法）
4. 標示資料出處（`provenance` 欄位）與產生時間，讓 BOSS 能分辨「App 自算」與「God 分析」

### 需要 BOSS 決定的三件事
1. **選方案 A 還是 B**（建議 B）
2. **FengTeam 與峰子 App 的資料優先序**：當兩邊數字不一致時，哪邊為準？（建議：分析結論用 FengTeam，原始行情用峰子直連）
3. **是否授權 FengTeam 團隊直接改峰子 App 的讀取層**，或一律經本團隊（建議後者，維持單一改動窗口，避免並行衝突）

---

## 六、時程

| 時間 | 事項 |
|---|---|
| 現在～週一 | 峰子 App 讀取層先建好並以 mock payload 驗證（不依賴 FengTeam 在線） |
| 週一 | 與 FengTeam 敲定方案與推送機制 |
| **週二 9/29 開盤** | 第一次端到端實測：God 產出 → 管道 → 峰子 App 顯示 |
| 開盤後 | 逐頁比對兩邊數字，校正落差 |

---

## 七、尚未解決／需注意

- **峰子 App 的 44 頁「能不能正常運作」仍是前提**。BOSS 明言「在股市峰子 app 可以正常運作之後」才做資料輸出。目前 44 頁已上線、瀏覽器上下頁崩潰已修（commit `3435f3d`）、測試登入已建（`admin`/`1234`，commit `d856a41`）。**待部署後即可由 BOSS 實測。**
- **NVIDIA NIM**：金鑰已實測有效並設為 Worker secret；程式碼內 3 個已下架的模型 id 已校正（commit `e02f68c`）。
- FengTeam 的 `data/api/app/` payload 目前多為空——**這不是故障，是還沒開盤**。不要把它當成資料源壞掉。
- `FENGTEAM_APP_RESPONSIBILITY_MAPPING.md` 開頭自標 **HISTORICAL**（v3.0 四池已廢止），引用時需注意。
