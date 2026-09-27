# 峰子 App ← GOD 辦公室 資料推送介面規格（v1.1）

> 撰寫：峰子 App 工程團隊（team-lead）
> 日期：2026-09-27
> 狀態：**App 側已實作、已上線、寫入→讀取迴路已端到端驗證通過**（見 §十），等待 GOD 辦公室側接上
> 架構決策：**方案 B（GOD 主動推送）為主、方案 A（tunnel）為輔** — BOSS 2026-09-27 確認

**v1.1 變更**：新增 §3.5 備用標頭、§3.6 token 安全要點、§十 端到端驗證紀錄、§十一 本機驗證方法。

---

## 一、分工定位（BOSS 定案）

| 團隊 | 定位 |
|---|---|
| **峰子 App 團隊（本團隊）** | 搭建股市峰子 App。**前端**：執行股市分析、判斷數據、接收新聞面／技術面／知識庫／工具庫等**調用和評估的窗口**；呈現查詢數據 |
| **GOD 辦公室（華爾街峰子）** | `GOD-Office`：金融股市分析辦公室。**後端**：主維運、整理規劃數據 |

一句話：**GOD 整理與規劃數據，峰子 App 呈現與查詢數據。**

> 命名說明：BOSS 表示之後會再決定改成「華爾街峰子 App」或「峰子 App」，**都只是自用**，等複製版能正常運行後再處理。本文件一律稱「峰子 App」。

---

## 二、為什麼不能直接連（問題本質）

| | 位置 | 結果 |
|---|---|---|
| GOD 辦公室 | `http://127.0.0.1:4010/api/*`（本機） | 只有 BOSS 的電腦連得到 |
| 峰子 App | `https://skynet-dashboard.xpornky1122.workers.dev`（Cloudflare 邊緣） | 全世界連得到，但連不到 127.0.0.1 |

**所以方向反過來：由 GOD 側主動 POST 推給 App。** 這就是方案 B。

**為什麼不直接把 Cloudflare KV 的寫入憑證給 GOD 側？**
因為那等於把 BOSS 的 Cloudflare 帳號權限交出去。改由 App 提供一個**帶 token 的 ingest 端點**——GOD 側只要一個 HTTP POST，**完全不需要 Cloudflare 帳號權限**。

---

## 三、GOD 辦公室要做的唯一一件事：POST 推資料

### 3.1 端點

```
POST https://skynet-dashboard.xpornky1122.workers.dev/api/skynet/god/ingest
Authorization: Bearer <SKYNET_DASHBOARD_API_TOKEN>
Content-Type: application/json
```

### 3.2 請求 body

```json
{
  "schema_version": "1",
  "endpoint": "radar",
  "generated_at": "2026-09-29T06:30:00.000Z",
  "provenance": { "agent": "alpha-radar", "source": "..." },
  "payload": { "...": "GOD 原本的 payload，原封不動放進來" }
}
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| `endpoint` | ✅ | 只能是 6 個白名單值之一（見 §3.4） |
| `payload` | ✅ | GOD 原本的 payload 物件，**原封不動**放進來，App 不解析、不改寫 |
| `generated_at` | ✅ | ISO 8601 字串 |
| `schema_version` | 建議 | 字串 |
| `provenance` | 建議 | 任意物件，App 會顯示在面板頁尾供追溯 |

**payload 上限 256KB**（`MAX_PAYLOAD_BYTES = 262144`）。GOD 現有 payload 都是 KB 級，不會撞到。

### 3.3 回應

| 情境 | HTTP | body |
|---|---|---|
| 成功 | 200 | `{ ok:true, endpoint, key, bytes, storedAt, expiresAt }` |
| 未帶／帶錯 token | 403 | `{ error:'forbidden_mutation', message:'Missing or invalid dashboard write token.' }` |
| 未知 endpoint | 400 | `{ ok:false, error:'unknown_endpoint', allowed:[...] }` |
| body 不合法 | 400 | `{ ok:false, error, message }` |
| payload 過大 | 413 | `{ ok:false, error:'payload_too_large', limit:262144 }` |
| KV 不可用 | 503 | `{ ok:false, error:'kv_unavailable', message }` |

### 3.4 六個 endpoint 白名單

`latest-date`、`dashboard`、`radar`、`sector-sniper`、`daily-highlights`、`warroom-boards`

（對應 GOD 辦公室 `data/api/app/` 下的 6 份 JSON）

### 3.5 備用標頭（已驗證可用）

除了 `Authorization: Bearer <token>`，也支援：

```
x-skynet-api-token: <token>
```

兩者等效（`src/lib/apiGuard.ts:35-39` 的 `extractToken()`）。若 GOD 側的 HTTP 客戶端不方便設定 `Authorization`，可改用此標頭。**但請勿兩者都不帶。**

### 3.6 ⚠️ token 安全要點（請 BOSS 決策）

`SKYNET_DASHBOARD_API_TOKEN` **不是 god-ingest 專用 token，而是全站共用的寫入權杖**。目前以下 10 個端點都靠它放行（`guardMutation` 讀的是同一個環境變數）：

`webhook`、`flowise`、`terminal`、`skynet:monitoring`、`skynet:n8n-proxy`、`skynet:day-trade-webhook`、`skynet:analyze`、`skynet:watch`、`skynet:ai-chat`、`god-ingest`

**意涵**：把這個值交給 GOD 側，等同把上述所有端點的寫入能力一併交出去。雖然是自用系統、風險可控，但若要做到「GOD 只能寫 6 個 GOD 資料端點」，建議改為**簽發一個 god-ingest 專用 token**。

**建議做法**（改動小、可選）：在 `GuardOptions` 增加選填的 `extraTokens?: string[]`，`god-ingest` 傳入 `[process.env.GOD_INGEST_TOKEN]`；`apiGuard` 先比對專用 token，再落回既有邏輯。對其他 9 個端點**零行為改變**。等 BOSS 決定後再實作。

---

## 四、現成的推送腳本（GOD 側直接可用）

App 側已附一支**零依賴**的參考腳本：

```bash
node scripts/god-push.mjs \
  --dir /Users/sheng-feng/Antigravity-Rule/FengTeam/data/api/app \
  --url https://skynet-dashboard.xpornky1122.workers.dev \
  --token "$SKYNET_DASHBOARD_API_TOKEN"
```

- 自動由檔名推斷 endpoint：`dashboard.json` → `dashboard`、`daily-highlights_20260926.json` → `daily-highlights`
- 逐檔 POST，**單檔失敗不中斷其他檔**，最後印出總結並以非 0 退出碼表示有失敗
- 建議由 GOD 辦公室的排程在每次產出 JSON 後呼叫

> ⚠️ **需要 BOSS 提供 `SKYNET_DASHBOARD_API_TOKEN` 的值給 GOD 辦公室側。** 該 token 已是峰子 App 的 Cloudflare secret；GOD 側只要以環境變數持有即可，**不要寫進版控**。

---

## 五、App 側讀取端點（前端用，GOD 側不需理會）

```
GET /api/skynet/god/{endpoint}
```

| 情境 | HTTP | body |
|---|---|---|
| 有資料 | 200 | `{ ok:true, endpoint, ready:true, schema_version, generated_at, provenance, payload, received_at, age_ms, stale }` |
| 尚未產出 | 200 | `{ ok:true, endpoint, ready:false, message:'GOD 辦公室資料尚未產出' }` |
| 未知 endpoint | 400 | `{ ok:false, error:'unknown_endpoint', allowed:[...] }` |

**設計要點**：未產出時回 **200 而非 404**——讓前端能區分「還沒產出」與「端點壞掉」。`stale` = 資料超過 6 小時。

KV key 為 `god:<endpoint>`，**TTL 7 天**（涵蓋週末與連假，避免資料過期變空）。

---

## 六、目前接到哪些頁面

| 峰子路由 | endpoint | 狀態 |
|---|---|---|
| `/radar/` 事件雷達 | `radar` | ✅ 已接 |
| `/today/` 今日戰情 | `dashboard` | ✅ 已接 |
| `/picks/` 量價觀察 | `sector-sniper` | ⏳ 待接（該端點 `black_score` 降權 45/100，等 GOD 側改善後再接） |

**資料誠實原則（全站 44 頁一致，違反即為錯誤）**：
`ready:false` 時面板顯示「GOD 辦公室資料尚未產出」＋一行說明，**絕不顯示 0 或任何假數字**。有資料時，頁尾**必定**顯示出處與產出時間，`stale` 時額外標示已過期。

---

## 七、GOD 辦公室側的待辦

1. **取得 token**（向 BOSS 索取 `SKYNET_DASHBOARD_API_TOKEN`）
   - 已確認：該 secret **確實存在於生產 Worker**（`npx wrangler secret list` 可見 `SKYNET_DASHBOARD_API_TOKEN`，type `secret_text`）
   - 但 secret 是 **write-only**，值無法從 Cloudflare 讀回 → **必須由 BOSS 從當初設定處取出並轉交**
   - 若 BOSS 已無留存：可用 `npx wrangler secret put SKYNET_DASHBOARD_API_TOKEN` 輪替為新值再轉交（會一併影響 §3.6 列出的其餘 9 個端點）
2. **試推一次**（用 §四 的腳本）確認 200
3. **接進排程**：每次產出 `data/api/app/*.json` 後自動推送
4. 下列項目會直接影響「週二開盤」的推送品質（取自 GOD 辦公室報告）：
   - **清 God inbox 積壓**（Action Item 13）— 積壓會讓派工延遲，payload 可能來不及產出
   - **決議 6 個指向已廢棄 `bus.jsonl` 的遺留排程**（Action Item 28）
   - **God session restart** 以啟用 nemotron-ultra（Item 15）

---

## 八、時程

| 時間 | 事項 |
|---|---|
| 現在 | App 側已完成並上線；**等 BOSS 把 token 給 GOD 側** |
| 週一 | GOD 側試推一次，確認端到端通 |
| **週二 2026-09-29 開盤** | 第一次真實資料端到端驗證（`/radar/`、`/today/` 面板出現 GOD 資料） |

> ⚠️ **注意**：GOD 辦公室目前 `data/api/app/` 的 payload 多為空（`dashboard.json` `ready:false`、`radar.json` `movers:[]`）。**這不是故障，是因為 9/26、9/27 沒有開盤。** 週二開盤才會有第一批真實資料。

---

## 九、後續（BOSS 已預告會再調適優化）

- 命名：之後決定「華爾街峰子 App」或「峰子 App」
- 方案 A（cloudflared tunnel）作為輔助：需要「即時查詢」而非「定時推送」時使用
- `/picks/` 接上 `sector-sniper`
- 其餘 41 頁是否要接 GOD 資料，依 GOD 側端點覆蓋率推進（目前 45 項中 ✅4 / 🟡9 / 🔧工程缺口 17 / ⛔物理缺口 7）

---

## 十、App 側端到端驗證紀錄（2026-09-27，已通過）

驗證方式：本機 `opennextjs-cloudflare preview --port 8788`（真實 Workers runtime + 本機模擬 KV），
以 `.dev.vars` 提供 `SKYNET_DASHBOARD_API_TOKEN=local-verify-token-abc123`。

### 10.1 寫入 → 讀取迴路（正向）

| 步驟 | 請求 | 實測回應 |
|---|---|---|
| 0 | `GET /api/skynet/god/radar`（寫入前） | `200 { ok:true, ready:false, message:"GOD 辦公室資料尚未產出" }` |
| 1 | `POST /api/skynet/god/ingest`（帶 token，endpoint=radar） | `200 { ok:true, endpoint:"radar", key:"god:radar", bytes:75, storedAt:"…T15:57:47.354Z", expiresAt:"…T15:57:47.367Z" }` |
| 2 | `GET /api/skynet/god/radar`（寫入後） | `200 { ok:true, ready:true, payload:{…}, age_ms:33, stale:false }` |

- TTL 驗證：`storedAt` 09-27 → `expiresAt` 10-04，**正好 7 天** ✅
- payload 完整性：寫入的 `trade_date` 與 `movers` 讀回後一字不差 ✅

### 10.2 守衛與錯誤路徑（反向實驗，全部符合設計）

| 情境 | 實測結果 |
|---|---|
| 無 token | `403 { error:"forbidden_mutation", message:"Missing or invalid dashboard write token." }` |
| 錯誤 token | `403` 同上 |
| `x-skynet-api-token` 帶正確 token | `200 ok:true`（備用標頭確認可用） |
| 未知 endpoint（POST） | `400 { ok:false, error:"unknown_endpoint", allowed:[6 項白名單] }` |
| 未知 endpoint（GET） | `400` 同上 |
| 非法 JSON | `400 { ok:false, error:"invalid_json" }` |
| 300KB payload | `413 { ok:false, error:"payload_too_large", limit:262144 }` |

> **反向實驗的價值**：`.dev.vars` 生效前，無 token 的錯誤訊息是
> 「requires a same-origin browser request or SKYNET_DASHBOARD_API_TOKEN.」；
> 生效後變成「Missing or invalid dashboard write token.」。
> 訊息分支的改變，正是「`configuredToken` 真的由空變有值」的直接證據 ——
> 若只看到 403 就宣稱通過，會漏掉「其實是走同源分支」的假通過。

### 10.3 `scripts/god-push.mjs` 端到端（模擬 GOD 側實際操作）

以 5 個 JSON 檔（含信封格式、裸 payload、帶日期檔名、白名單外檔名）與 1 個 `.txt` 測試：

```
推送 5 個檔案到 http://127.0.0.1:8788/api/skynet/god/ingest

✅ daily-highlights_20260929.json → daily-highlights（200）
✅ dashboard.json → dashboard（200）
✅ radar.json → radar（200）
❌ unknown-thing.json：無法辨識 endpoint（檔名推斷為 "unknown-thing"，不在白名單）
✅ warroom-boards.json → warroom-boards（200）

完成：成功 4，失敗 1
```

退出碼 `1`（正確，供排程偵測）✅　`.txt` 被正確過濾 ✅

讀回確認**檔名推斷與信封處理皆正確**：

| endpoint | 讀回結果 |
|---|---|
| `dashboard` | `ready:true`，`provenance` 完整保留 ✅ |
| `radar`（裸 payload） | `ready:true`，裸 JSON 被正確包成 payload，`generated_at` 自動補為當下時間 ✅ |
| `daily-highlights`（檔名 `daily-highlights_20260929`） | `ready:true`，**底線前綴推斷正確** ✅ |
| `warroom-boards` | `ready:true` ✅ |
| `latest-date`、`sector-sniper` | `ready:false`（未推送，正確）✅ |

### 10.4 其他基線

- `npx jest`：**59 套件 / 936 測試全綠**
- `npx tsc --noEmit`：**零錯誤**
- GodPanel 前端狀態（骨架／未產出／有資料／未知欄位／過期／錯誤×2）已有 `god-panel.test.tsx` 覆蓋，
  並含「未產出時畫面**不得出現任何數字**」的資料誠實斷言

### 10.5 尚未驗證的一項（誠實標註）

**生產環境的寫入路徑**未以真實 token 打過。原因：token 為 write-only，本機取不到值。
本機驗證證明的是「程式邏輯與 KV 迴路正確」；生產端僅差「真實 token 值」這一個變數。
待 BOSS 轉交 token 後，GOD 側第一次試推即為生產端驗證。

---

## 十一、本機複驗方法（給未來的人）

```bash
cd /Users/sheng-feng/Project/skynet/skynet-dashboard

# 1) 建立本機變數檔（此檔已在 .gitignore，勿提交）
echo 'SKYNET_DASHBOARD_API_TOKEN=local-verify-token-abc123' > .dev.vars

# 2) 啟動本機 Workers runtime（會讀 .dev.vars）
npx opennextjs-cloudflare preview --port 8788

# 3) 另開終端驗證
curl -X POST http://127.0.0.1:8788/api/skynet/god/ingest \
  -H "Authorization: Bearer local-verify-token-abc123" \
  -H "Content-Type: application/json" \
  -d '{"schema_version":"1","endpoint":"radar","generated_at":"2026-09-29T06:30:00.000Z","payload":{"trade_date":"2026-09-29","movers":[]}}'

curl http://127.0.0.1:8788/api/skynet/god/radar
```

**注意**：`preview` 的 KV 狀態存在 `.wrangler/state/v3/kv`（已 gitignore）。
驗證完請 `rm -rf .wrangler/state/v3/kv`，否則下次本機預覽會看到上次的測試假資料。

**踩過的坑**：`SKYNET_DASHBOARD_API_TOKEN=xxx npx opennextjs-cloudflare preview` 這種
**shell 前置環境變數不會傳進 worker**（worker env 來自 `.dev.vars` / wrangler 設定）。
一開始用這個寫法，POST 一直回 403，誤以為是 token 比對邏輯有 bug。
