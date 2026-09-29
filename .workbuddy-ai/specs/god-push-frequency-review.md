# 峰子 App × GOD 辦公室：推送頻率審查與 ①②③ 驗證報告

- 文件版本：v1.0
- 日期：2026-09-28
- 撰寫：峰子 App 團隊（天網）
- 狀態：**待 BOSS 查核**（涉及 FengTeam 排程行為變更，依「重大方案先產出文件待查核」原則，未經確認不動手）
- 對應 FengTeam 文件：`FENGTEAM_峰子App對接確認_20260928.md`（待決策第 3 項）

---

## 一、①②③ 驗證結果：全數通過

### ① `launchd_god_loop.sh` 末端掛 `god-push.mjs` — ✅ 通過

| 檢查項 | 結果 | 證據 |
|---|---|---|
| shell 語法 | ✅ | `bash -n` 通過 |
| token 守衛 | ✅ | `if [ -n "${GOD_INGEST_TOKEN:-}" ]`，`set -u` 下安全；缺失時印訊息並跳過 |
| 失敗不中斷主循環 | ✅ | `set -uo pipefail`（**無 `-e`**）；且推送區塊本就在主循環之後 |
| 退出碼捕獲 | ✅ | `node ... ; echo "god-push exit=$?"` 取值正確 |
| 旗標對應 | ✅ | `--dir` / `--url` / `--token` 與 `god-push.mjs` 的 `parseArgs` 三者完全對應 |
| log 重導 | ✅ | `>> "$LOG_FILE" 2>&1`，與主循環同檔 `logs/god-loop-YYYYMMDD.log` |
| launchd 綁定 | ✅ | plist 指向 `/bin/bash .../scripts/launchd_god_loop.sh`，`StartInterval=300` |

> 小瑕疵（不影響功能）：`echo "god-push exit=$? ..."` 輸出到 **stdout**（launchd 的 `com.fengteam.god-loop.log`），未寫入 `$LOG_FILE`，日誌分散兩處。

### ② `GOD_INGEST_TOKEN` 加入 `~/.fengteam/.env` — ✅ 通過

| 檢查項 | 結果 |
|---|---|
| 值與我方簽發一致 | ✅ **逐字元完全一致**（64 字元，`9fe701be…c78e1c9e`） |
| 檔案權限 | ✅ `-rw-------`（600） |
| `fengteam-env.sh` 載入機制 | ✅ `set -o allexport` → `source ~/.fengteam/.env` → `set +o allexport` |
| **模擬 launchd 乾淨環境實測** | ✅ `env -i HOME=... /bin/bash -c 'source fengteam-env.sh; …'` → token 長度 64、前綴 `9fe701be`、`cwd` 正確、`node` 可尋 |
| token 未進版控 | ✅ 只存在 `~/.fengteam/.env`，`fengteam-env.sh` 僅 `source` 不寫死 |

### ③ 端到端推送 — ✅ 通過（雙重證據）

**證據 A — launchd 排程已實際執行過一次（真實生產）**

`logs/god-loop-20260928.log` 末端：

```
=== God Loop tick done @ Mon Sep 28 01:46:35 CST 2026 ===
=== God Push (峰子 App) @ Mon Sep 28 01:46:35 CST 2026 ===
推送 6 個檔案到 https://skynet-dashboard.xpornky1122.workers.dev/api/skynet/god/ingest
✅ daily-highlights.json → daily-highlights（200）
✅ dashboard.json → dashboard（200）
✅ latest-date.json → latest-date（200）
✅ radar.json → radar（200）
✅ sector-sniper.json → sector-sniper（200）
✅ warroom-boards.json → warroom-boards（200）
完成：成功 6，失敗 0
```

**證據 B — 我方以相同指令手動複測**：6/6 成功（200），退出碼 0。

**證據 C — App 讀取端閉環**（6/6 `ready:true`，KV 傳播 15–19 秒）

| endpoint | ready | age_ms | stale | generated_at |
|---|---|---|---|---|
| latest-date | true | 16733 | false | 2026-09-27 17:46:35 |
| dashboard | true | 17693 | false | 2026-09-27 17:46:35 |
| radar | true | 16277 | false | 2026-09-27 17:46:35 |
| sector-sniper | true | 15676 | false | **2026-09-25 06:00:00** |
| daily-highlights | true | 18967 | false | **2026-09-26 15:45:19** |
| warroom-boards | true | 15427 | false | 2026-09-27 17:46:35 |

> 相容性附註：6 份 JSON 皆為標準信封（`schema_version` / `endpoint` / `generated_at` / `provenance` / `payload`）。其中 `endpoint` 欄位是**路徑式**（`/api/dashboard`），非白名單值；`god-push.mjs` 由檔名推斷並覆蓋，故無事。6 個檔名全在 `KNOWN_ENDPOINTS` 白名單內。

---

## 二、⚠️ 問題 1：每 5 分鐘無條件推送，有三個副作用

`god-push.mjs` 每次都把目錄內**所有** `.json` 全量 POST，**沒有任何變更偵測**；App 端 ingest 路由（`src/app/api/skynet/god/ingest/route.ts:113`）也是**無條件** `kv.put()`，無去重。

### 副作用 A：KV 寫入量超過 Cloudflare 免費額度

```
每天 24×60÷5 = 288 次 tick
288 × 6 檔 = 1,728 次 KV 寫入／天
Cloudflare KV 免費額度：1,000 寫入／天
```

→ **超出免費額度 72%**。（若帳號在 Workers Paid 方案則只是浪費，不中斷。）

### 副作用 B：絕大多數是無意義寫入

實際資料更新頻率（檔案 mtime）：

| 檔案 | 最後更新 |
|---|---|
| dashboard / latest-date / radar / warroom-boards | 2026-09-28 01:46 |
| daily-highlights | **2026-09-26 23:45（約 2 天前）** |
| sector-sniper | **2026-09-25 16:26（約 3 天前）** |

一天實際變更約 2–4 次，卻推 288 次。

### 副作用 C（最嚴重）：`stale` 訊號被架空，違背「資料誠實原則」

- ingest 每次 POST 都重設 `received_at = now`（`route.ts:98,109`）
- 讀取端 `age_ms = now − received_at`（`[endpoint]/route.ts:78-80`）
- 門檻 `GOD_STALE_THRESHOLD_MS = 6 小時`（`godBridge.ts:64`）

**每 5 分鐘刷新一次 → `age_ms` 永遠 < 5 分鐘 → `stale` 永遠 `false`。**

實證：`daily-highlights` 的 `generated_at` 是 `2026-09-26 15:45:19`（約 34 小時前），App 卻回報 `stale: false`。`godBridge.ts` 註解明寫「資料誠實原則」——目前這個訊號對前端完全失效，頁面無法區分「剛更新的資料」與「兩天前的舊資料」。

---

## 三、⚠️ 問題 2：推送區塊無交易日守衛

主循環刻意不套交易日 guard（因週六 `weekly-review`、凌晨 `knowledge-sync` 也需執行），但**推送區塊**同樣無 guard → 週六日／休市日也每 5 分鐘推一次舊資料。主循環「空跑成本為零」的理由（inbox 為空、不呼叫 LLM）**不適用於推送**——推送是真的打公網、真的寫 KV。

---

## 四、建議方案（待 BOSS 裁示）

| 方案 | 做法 | 效果 | 代價 |
|---|---|---|---|
| **1（推薦）** | `god-push.mjs` 加**內容變更偵測**：本地狀態檔記錄各檔 hash，未變更則跳過 | 寫入量降至實際變更次數（約 6–24／天）；`received_at` 只在真更新時刷新 → **`stale` 恢復語意** | 需改腳本（我方參考版 + FengTeam 版）並重新交接 |
| 2 | App 端改以 `generated_at` 計算 `stale` | 不動 FengTeam | `generated_at` 格式 `YYYY-MM-DD HH:mm:ss` 無時區，`Date.parse` 非標準，有解析風險；且舊資料仍會被每 5 分鐘重寫 KV |
| 3 | 降為「僅收盤後推一次」（15:30 warroom-postmarket 後） | 寫入量 6／天 | 盤中資料無法即時更新；仍無變更偵測 |

**我方立場**：建議採 **方案 1**（可與方案 3 併用：變更偵測 + 收盤後觸發）。理由：方案 1 同時解決三個副作用，且是唯一能讓 `stale` 訊號恢復正確的選項。

---

## 五、對 FengTeam 三項待確認事項的回覆

### 1. `/picks/` 接線時程
我方 App 端 `GOD_ENDPOINTS` 白名單已含 `sector-sniper`，讀取路由 `GET /api/skynet/god/sector-sniper` 已通、資料已 `ready:true`。**App 端無阻塞**；GodPanel 前端頁面接線排入我方待辦。FengTeam 端不需等待，持續推送即可。

### 2. token 輪替通知機制
**建議流程**（雙方各一動作，缺一不可）：
1. 我方輪替 `GOD_INGEST_TOKEN` 時 → 更新 Cloudflare Worker secret → **立即通知 FengTeam**
2. FengTeam 更新 `~/.fengteam/.env` → 下一個 launchd tick 自動重讀（`fengteam-env.sh` 每次 tick 都 `source`）→ **不需重啟** `com.fengteam.god-loop`

> 注意：舊 token 一旦輪替即失效，FengTeam 若未同步會開始收到 403（`god-push.mjs` 會印 ❌ 並以退出碼 1 結束，但**不中斷** god-loop 主循環）。建議輪替後雙方各跑一次 `god-push.mjs` 確認 200。

### 3. 推送頻率確認
**我方認為每 5 分鐘過頻**，理由見第二節（寫入量超額、無意義寫入、`stale` 訊號失效）。建議改為**方案 1**（變更偵測），或至少改為**僅收盤後推送**。

---

## 六、附註：本次未改動任何程式碼

本文件僅為驗證報告與建議。**未修改 FengTeam 任何檔案**（`launchd_god_loop.sh`、`~/.fengteam/.env`、`god-push.mjs` 皆為 FengTeam 產出，保持原狀）。方案 1 若獲核准，將先產出 `god-push.mjs` 參考版修訂，經 BOSS 查核後再交付 FengTeam。
