# 給 GOD 辦公室（華爾街峰子）的推送交接包

> 產出：峰子 App 工程團隊｜日期：2026-09-28｜狀態：App 側已上線並通過生產驗證
> 完整規格書（細節都在這）：`/Users/sheng-feng/Project/skynet/skynet-dashboard/.workbuddy-ai/specs/god-office-interface-spec.md`

---

## 一、五個必給的資訊

### 1. 權杖（機密，請用環境變數持有）

```
GOD_INGEST_TOKEN=9fe701be005bd187af265cf6ffdb6585297f7da1aef5e104f25803f0c78e1c9e
```

- 這是**專用**權杖：**只能寫 `god-ingest` 一個端點**，寫不進 App 的其他任何端點（已實測）。
- **不要寫進版控、不要寫死在腳本裡。** 用 `export GOD_INGEST_TOKEN=...` 或你們的 secret 管理。
- 若日後外洩，App 側可單獨輪替這一支，不影響其他系統。

### 2. 推送端點

```
POST https://skynet-dashboard.xpornky1122.workers.dev/api/skynet/god/ingest
Authorization: Bearer <GOD_INGEST_TOKEN>
Content-Type: application/json
```

（備用標頭：`x-skynet-api-token: <token>`，與 `Authorization` 等效。兩者擇一，不可都不帶。）

### 3. 推送腳本（我方已寫好，零依賴，建議直接複製）

```
來源：/Users/sheng-feng/Project/skynet/skynet-dashboard/scripts/god-push.mjs
建議複製到：/Users/sheng-feng/Antigravity-Rule/FengTeam/scripts/god-push.mjs
```

腳本特性：由檔名推斷 endpoint、逐檔 POST、**單檔失敗不中斷其他檔**、最後印總結並以非 0 退出碼表示有失敗（方便排程偵測）。

### 4. 你們的資料目錄

```
/Users/sheng-feng/Antigravity-Rule/FengTeam/data/api/app/*.json
```

（已確認 6 份都在：`latest-date.json`、`dashboard.json`、`radar.json`、`sector-sniper.json`、`daily-highlights.json`、`warroom-boards.json`）

### 5. 六個 endpoint 白名單

`latest-date`、`dashboard`、`radar`、`sector-sniper`、`daily-highlights`、`warroom-boards`

---

## 二、一行指令

```bash
export GOD_INGEST_TOKEN='<向 BOSS 索取>'

node /Users/sheng-feng/Antigravity-Rule/FengTeam/scripts/god-push.mjs \
  --dir /Users/sheng-feng/Antigravity-Rule/FengTeam/data/api/app \
  --url https://skynet-dashboard.xpornky1122.workers.dev \
  --token "$GOD_INGEST_TOKEN"
```

---

## 三、⚠️ 三個一定要先講的地雷

### 地雷 1：`endpoint` 要用白名單值，不要抄你們檔案裡的欄位

你們 `data/api/app/*.json` 內的 `"endpoint"` 欄位是**路徑式**的，例如：

```json
{ "endpoint": "/api/dashboard", ... }
```

App 側**只接受白名單值**（`dashboard`），`"/api/dashboard"` 會被回 **400 `unknown_endpoint`**。

**用我方提供的 `god-push.mjs` 不會踩到**——它是**由檔名推斷** endpoint（`dashboard.json` → `dashboard`），並忽略檔案內的 `endpoint` 欄位。
但**如果你們自己手寫 POST，就必須把 `endpoint` 改成白名單值**。

### 地雷 2：`payload` 上限 256KB

超過會回 **413 `payload_too_large`**（`limit: 262144`）。你們現有 payload 都是 KB 級，不會撞到。

### 地雷 3：推完**不要立刻**用 GET 驗證

Cloudflare KV 是**最終一致性**：寫入／刪除最多需 **60 秒**傳播（實測約 30 秒）。
推完立刻讀可能看到舊值，那是正常的，**請間隔 60 秒再讀**，不要誤判成失敗。

---

## 四、怎麼確認推成功了

### 推送當下的回應

| 情境 | HTTP | 回應 |
|---|---|---|
| 成功 | 200 | `{ ok:true, endpoint, key:"god:<endpoint>", bytes, storedAt, expiresAt }` |
| 權杖錯／沒帶 | 403 | `{ error:"forbidden_mutation", ... }` |
| endpoint 不在白名單 | 400 | `{ ok:false, error:"unknown_endpoint", allowed:[6 項] }` |
| payload 過大 | 413 | `{ ok:false, error:"payload_too_large", limit:262144 }` |

### 讀回確認（等 60 秒後）

```bash
curl https://skynet-dashboard.xpornky1122.workers.dev/api/skynet/god/dashboard
```

- 有資料：`{ ok:true, ready:true, payload:{...}, generated_at, received_at, age_ms, stale }`
- 還沒推：`{ ok:true, ready:false, message:"GOD 辦公室資料尚未產出" }`

> 注意：`ready:false` 回 **200 而非 404**，這是刻意設計——讓前端能分辨「還沒產出」與「端點壞掉」。**看到 200 + ready:false 不是錯誤。**

---

## 五、排程建議

在你們**每次產出 `data/api/app/*.json` 之後**呼叫一次即可（收盤後批次）。KV TTL 是 **7 天**（涵蓋週末與連假），所以偶爾漏推一天不會立刻變空。

---

## 六、App 側目前的狀態（供你們參考）

- 已接頁面：`/radar/`（用 `radar`）、`/today/`（用 `dashboard`）
- 待接頁面：`/picks/`（將用 `sector-sniper`）
- 其餘 4 個端點（`latest-date`、`daily-highlights`、`warroom-boards`、`sector-sniper`）**已可接收與讀取，只是尚未接上頁面**——你們可以先推，不會壞掉。

### 資料誠實原則（App 側的硬規則）

App 側**絕不顯示假數字**。沒有資料時顯示「GOD 辦公室資料尚未產出」，**不會顯示 0**。
所以你們的 payload 若尚未有真實資料，**照實寫 `ready: false` 或空陣列就好**，不要為了讓畫面有東西而填佔位數字——那會直接違反本專案的最高原則。
