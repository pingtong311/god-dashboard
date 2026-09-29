# P0-2：Edge 預算化方案（為何 /patterns、/swing、/cb 上線後是壞的）

> 狀態：**待 BOSS 查核裁示**
> 產出時間：2026-09-29 14:45
> 觸發：BOSS 本機 `npm run build:cf && npm run deploy:cf` 成功後，線上驗證發現三個端點壞掉

---

## 1. 線上實測證據（本次部署後，全部實測）

Worker：`https://skynet-dashboard.xpornky1122.workers.dev`（Version `56fdac15`）

| 端點 | 線上結果 | 判定 |
|---|---|---|
| `/api/skynet/market-overview` | **200** ✅ | 輕量，正常 |
| `/api/skynet/futures` | **200** ✅ | 有 KV 精簡快取，正常 |
| `/api/skynet/risk` | **200** ✅ | 單次小 fetch，正常 |
| `/api/skynet/pattern-screen` | **503 `error code: 1102`** ❌ | Cloudflare 資源超限 |
| `/api/skynet/swing-hub` | **503 `error code: 1102`** ❌ | Cloudflare 資源超限 |
| `/api/skynet/cb` | **502 `cb_upstream_error`** ❌ | 上游超時（見 §2.2） |

本機對照：`npx jest` 77 suites / 1203 tests 全綠、`tsc --noEmit` exit 0。
→ **不是程式邏輯錯，是 Edge runtime 的資源天花板。**

---

## 2. 根因

### 2.1 `1102` = Workers 超出資源限制（Free plan CPU 上限 10ms）

`pattern-screen` 在單次請求內做的事（`src/app/api/skynet/pattern-screen/route.ts`）：

1. `listStoredDates()` 列出 KV 裡所有日 K 日期
2. 取最近 **70 個交易日**，分批 `loadRange()` 讀出（每日約 2.5MB）
3. `expandBars()` 展開、`isScannableCode()` 過濾 → 約 **2,000 檔 × 70 根 ≈ 14 萬根 K 棒**
4. `scanSeriesList()` 對每檔跑 **7 種型態幾何辨識**
5. 再 fetch 兩份名稱對照表（TWSE BWIBBU_ALL + TPEX 收盤行情）

這是「數百毫秒等級」的計算量。Workers **Free plan 的 CPU 上限是 10ms**，
超出就由 Cloudflare 直接回 503 / 1102，**連我們的錯誤處理都來不及跑**。
`swing-hub` 同理（16 個條件 tab，同量級掃描）。

> 註：就算把 CPU 拉到 Paid 的 50ms 也遠遠不夠；要撐住得開到秒級，那已不是「即時運算」的合理設計。

### 2.2 `/cb` 的 502 是上游超時，而且撐過超時也一樣會爆

- 實測直接打 TPEX `bond_ISSBD5_data`：**HTTP 200、261,756 bytes、耗時 25 秒**（沙箱出口）
- route 的 upstream timeout 只有 **8 秒** → 逾時 → `502 cb_upstream_error`
- 就算把 timeout 拉到 30 秒讓它回來，**在 Workers 裡 `JSON.parse` 261KB / 上千筆物件同樣會越過 10ms CPU** → 變成下一個 1102

→ `/cb` 的溢價率排序一樣**不能在 Edge 上即時算**。

---

## 3. 三個方案

### 方案 A：離線預算 + 寫入 KV（推薦）

把「重計算」從 Worker 搬到**本機／排程腳本**（沒有 CPU 限制），
Worker 只做「讀 KV 的精簡結果 → 回傳」。

```
[本機或每日排程]                          [Worker（極輕量）]
  TWSE/TPEX 抓日 K                         讀 KV key（幾十 KB）
  → 算型態 / 算波段 / 算 CB 排序     ⇒      → JSON.parse 小物件
  → 精簡結果 JSON 寫進 KV                   → 回傳（CPU < 1ms）
```

- ✅ **Free plan 完全可行**，回應秒開，CPU 幾乎為零
- ✅ 與既有 `scripts/backfill-market-bars.mjs` 同一條路（已會寫 KV、`--remote`）
- ✅ 定位本來就是「盤後資料」，每天盤後算一次即符合需求
- ⚠️ 資料是「上次預算時間點」→ 必須在回應裡誠實帶 `computedAt`／資料日
- ⚠️ 需要一支新腳本 + 三個 route 改寫成「讀 KV 為主」

### 方案 B：升級 Workers Paid（$5/月）並開到秒級 CPU

- ✅ 可保留即時運算
- ❌ 要錢、要改帳單；且 70 天 × 全市場的即時掃描冷啟動仍會數秒，體驗差
- ❌ 沒有解決「每次請求都重算同一份盤後結果」的浪費

### 方案 C：縮小掃描宇宙（只掃熱門 N 檔）

- ❌ 10ms 內要掃完仍極勉強，風險高
- ❌ 犧牲完整性，與「對齊實站全市場掃描」的目標衝突
- 不推薦

---

## 4. 方案 A 的施工步驟（裁示後執行）

1. **KV key 規劃**（沿用既有 namespace `SKYNET_CACHE`）
   - `scan:pattern-screen` → 型態掃描結果（7 型態 + items）
   - `scan:swing-hub` → 16 tab 結果
   - `scan:cb` → 溢價率排序 30 列 + put_schedule + calendar
   - 每份都要含 `computedAt`、`dataDate`、`provenance`

2. **新增 `scripts/precompute-scans.mjs`**（比照 `backfill-market-bars.mjs`）
   - 本機 Node 跑（無 CPU 限制），讀 KV 日 K → 算 → 寫回 KV
   - `--remote` 才真寫；冪等；支援 `--only=patterns|swing|cb`

3. **三個 route 改寫**：優先讀 KV 預算結果
   - 有 → 直接回（帶 `computedAt`，標示資料時間）
   - 無 → **誠實回 not-ready**（`ready:false` + 原因 + 「尚未預算」），
     **絕不回空陣列假裝掃過**、絕不再於 Edge 上重算

4. **`npm test` + `tsc`**，補測試：KV 有／無、stale 標示、不重算

5. **BOSS 本機**：跑一次預算腳本（寫進線上 KV）→ `deploy:cf` → 線上複驗

---

## 5. 驗證標準（方案 A 完成後，線上要看到）

- `/api/skynet/pattern-screen` → 200、`provenance.source === "self-produced"`、`patterns` 有 7 型態
- `/api/skynet/swing-hub` → 200、16 tab、whale 含 `delta_4w` / `up_weeks`
- `/api/skynet/cb` → 200、`items.length === 30`、第 1 筆折價率最負
- 三個都要有 `computedAt`，且**不再出現 1102 / 502**

---

## 6. 附帶發現（不影響本次決策，先記）

- TPEX 出口很慢（25s / 261KB）。若日後有其他 route 要打 TPEX 大檔，一樣要預算化，不能即時打。
- 建置失敗殘留 `.open-next.bak-1790647838/`（94MB）已加進 `.gitignore`，BOSS 可本機自行刪除。
