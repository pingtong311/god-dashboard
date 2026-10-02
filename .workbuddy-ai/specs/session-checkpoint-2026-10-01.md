# 進度存檔 / 重啟後接續點（2026-10-01 03:46 GMT+8）

> BOSS 因本機負載過重，先存檔、系統重啟後再續。本檔為唯一接續依據。

---

## 0. 最重要的三行（先看這裡）

1. **專案真實路徑**：`/Users/sheng-feng/Project/skynet/skynet-dashboard`
   （自有 git repo，branch `main`）。**不在** `/Users/sheng-feng/Antigravity-Rule/` 底下——
   本輪曾因此在錯目錄搜尋、誤判「原始碼消失」，浪費不少時間。
2. **目前 git 狀態**：`main` @ `b6462db`，**working tree 乾淨**（無未提交修改）。
3. **程式碼層面已完成**，剩下的是**只能由 BOSS 在本機終端機執行的部署**
   （沙箱無 wrangler/CF 憑證、無 TPEX 網路，我無法代跑）。

---

## 1. 本輪（2026-10-01）完成項目

| 項目 | 狀態 | 說明 |
|------|------|------|
| **cb 預算收尾修復** | ✅ 已提交 `b6462db` | `scripts/precompute-scan.mjs` 結尾 cleanup 補 `if (cb) await cb.cleanup();` |
| Plan A 三端點離線預算+讀 KV | ✅ 已提交 `86737b7` | pattern-screen / swing-hub / cb 改 KV-only |
| C 擴充點：`/picks/` 接 GOD sector-sniper | ✅ 已提交 `b665014` | `PicksGodPanel.tsx` + `src/app/picks/page.tsx` 改寫 |
| Plan A 一鍵部署腳本 | ✅ 已提交 `b665014` | `scripts/deploy-plan-a.sh` |
| A 審計（P0-1 十三頁缺口複檢） | ✅ 結論已收口 | 見 `site-benchmark-alignment-plan.md` §七 |
| B（FengTeam 定期同步） | ✅ 規格就緒 | 見 `fengteam-integration-plan.md` §八 |

### cb 修復詳情（本輪唯一程式碼改動）
- **根因**：`cb/route.ts` 早被改成 KV-only（只讀 `scan:cb`），但 `precompute-scan.mjs`
  原本只寫 `scan:pattern-screen` + `scan:swing-hub`，**從未寫 `scan:cb`** → cb 永遠 not-ready。
- **修法**：補 cb 預算區塊——bundle `cbPremium.ts` → `buildCbPayload()` → 推 `{computedAt, payload}`
  信封 → 寫 `scan:cb`；並調整 MIN_BARS 檢查（cb 不依賴日 K）、`--only` 選項（新增 `cb`）、
  結尾 cleanup（補 `if (cb) await cb.cleanup();`）。
- **驗證**：`node --check scripts/precompute-scan.mjs` → SYNTAX_OK。

---

## 2. 重啟後第一步（BOSS 本機執行）

```bash
cd /Users/sheng-feng/Project/skynet/skynet-dashboard
npx wrangler login                      # 首次才需要
bash scripts/deploy-plan-a.sh           # 一鍵：backfill → precompute → build:cf → deploy:cf → 複驗 → 裝 launchd
#   （若 KV 已有日K資料，可加 --skip-backfill；只想重寫 cb：node scripts/precompute-scan.mjs --only=cb）
```

**複驗期望結果**（三端點都應 200 且帶 `computedAt`）：
- `/api/skynet/cb` → `available:true` + `computedAt`（**不再是** `available:false / items:[] / date:""`）
- `/api/skynet/pattern-screen` → `ready:true`（上次已成功，回真實資料如台泥 1101 W底）
- `/api/skynet/swing-hub` → `ready:true`（**待確認**，見下）

---

## 3. 待澄清 / 待確認

1. **swing-hub 結果未知**：BOSS 上次貼的部署輸出被截斷，未顯示 swing-hub 複驗結果。
   重啟後請確認它是否同 pattern-screen 一併 `ready:true`——這決定 Plan A 是上線 2/3 還是 3/3。
2. **launchd 排程（尚未安裝·且腳本並不含此步驟）**：
   ⚠ 2026-10-01 複驗證實：`scripts/deploy-plan-a.sh` **完全沒有 launchd 段落**（grep 零匹配），
   所以不是「安裝失敗」，是腳本從未做這一步（本檔早先記載有誤，已修正）。
   plist 檔案本身存在且內容正確：`scripts/com.skynet.precompute-scans.plist`（每日 16:35 盤後，
   backfill --days=3 --force → precompute-scan --only=all，路徑已指向正確專案目錄）。
   **未安裝的後果**：KV 資料不會每日自動更新，會一直停在最後一次手動寫入的日期。
   安裝指令（BOSS 本機終端機）：
   ```bash
   cp /Users/sheng-feng/Project/skynet/skynet-dashboard/scripts/com.skynet.precompute-scans.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.skynet.precompute-scans.plist
   launchctl start com.skynet.precompute-scans   # 立即試跑一次（可選）
   launchctl list | grep skynet                 # 確認
   ```
3. **`/picks/` 頁面**：程式碼已接 sector-sniper，需等 God 推送真實資料後才看得到產業對比與 BlackScore。

---

## 6. 2026-10-01 11:59 部署複驗結果（BOSS 執行後，已由助理線上實測）

**Plan A 三端點 3/3 全數上線成功：**

| 端點 | 結果 | 關鍵欄位 |
|------|------|---------|
| `/api/skynet/cb` | ✅ 修復成功 | `available:true`、`date:2026-09-30`、`precomputed:true`、`computedAt:2026-10-01T03:56:59.691Z`、**30 筆真實資料**（良維十 629010 溢價率 -10.98% 等） |
| `/api/skynet/pattern-screen` | ✅ | `ok:true, ready:true`，台泥 1101 W底等真實資料 |
| `/api/skynet/swing-hub` | ✅（先前待確認，現已確認） | `ok:true, ready:true`、`data_date:2026-09-30`，tabs 含「大戶持股比例增加」（大東 1441 等） |

- `computedAt: 2026-10-01T03:56:59Z` 正是 BOSS 本次執行部署的時間，證明 `scan:cb` 確實是新寫入，
  而非舊資料殘留 → cb 預算遺漏修復（`b6462db`）驗證通過。
- **認知修正**：本專案沙箱**可以**直接 `curl` 線上端點做複驗（先前「沙箱無網路」的認知過度悲觀）。
  僅 wrangler 部署 / KV 寫入 / 上游抓取需 BOSS 本機。

---

## 4. 相關檔案索引

**程式碼**（均在 `/Users/sheng-feng/Project/skynet/skynet-dashboard/`）
- `scripts/precompute-scan.mjs` — 預算寫入 KV（本輪修改處）
- `scripts/deploy-plan-a.sh` — 一鍵部署
- `scripts/backfill-market-bars.mjs` — 日 K 回填
- `scripts/com.skynet.precompute-scans.plist` — launchd 排程
- `src/lib/cbPremium.ts` — cb 組裝（`CB_KV_KEY='scan:cb'`、`buildCbPayload()`）
- `src/app/api/skynet/cb/route.ts` — cb 路由（KV-only）
- `src/components/PicksGodPanel.tsx`、`src/app/picks/page.tsx` — C 擴充點

**規格**（同目錄 `.workbuddy-ai/specs/`）
- `site-benchmark-alignment-plan.md` §七 — A 審計複檢
- `fengteam-integration-plan.md` §八 — B 同步步驟
- `p02-edge-precompute-plan.md` — Plan A 原始計畫
- `god-office-interface-spec.md`、`god-ingest-handoff.md` — God 介接契約

**工作記憶**：`/Users/sheng-feng/Antigravity-Rule/IOS_design/.workbuddy-ai/memory/2026-10-01.md`

---

## 5. 注意事項（前人的坑）

- `npx tsc` / `npx jest` 在錯誤 cwd 會互動式問是否安裝套件而卡死；
  須 `cd` 進專案並用 `./node_modules/.bin/tsc` / `./node_modules/.bin/jest`。
- `next.config.ts` 設 `ignoreBuildErrors:true`；既有 3 個 `.next/types` 錯誤
  （backtest / margin-maint / risk）與本次無關，不擋建置。
- `build:cf` 在沙箱會因 node-brokered-fs-shim 失敗，必須本機終端機跑。
