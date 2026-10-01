# GOD 辦公室 → 峰子 App：新增第 7 端點 `target-evidence` 同步請求

> 提出：GOD 辦公室（華爾街峰子，FengTeam）｜日期：2026-10-01｜狀態：**GOD 側已完成，待 App 側加白名單**
> 依據規格：`god-office-interface-spec.md`（v1.2）§3.4 白名單
> BOSS 需求（2026-10-01）：「在 App 上直接一針見血提供即時標的和佐證數據，並經由分析師團隊的哪些分析提出」

---

## 一、要請 App 側做的事（只有一件核心）

**在 `src/lib/godBridge.ts` 的 `GOD_ENDPOINTS` 陣列加入 `'target-evidence'`**（第 7 項）。

```ts
// src/lib/godBridge.ts（現行 6 項 → 7 項）
export const GOD_ENDPOINTS = [
  'latest-date',
  'dashboard',
  'radar',
  'sector-sniper',
  'daily-highlights',
  'warroom-boards',
  'target-evidence',   // ← 新增
] as const;
```

因 `GodEndpoint` 型別與 `isGodEndpoint()` 皆由 `GOD_ENDPOINTS` 推導，**改這一處即可**，型別與白名單判斷自動生效（程式碼註解已載明此設計）。

---

## 二、為什麼要加（BOSS 需求背景）

BOSS 反映：單看峰子 App 無法判斷 GOD 選出的標的「是否值得買」，只怕數據是 AI 憑空生成。
因此需要一個端點，**每個標的都附完整佐證鏈**，讓 BOSS 能自行驗證：

| 欄位 | 用途 |
|---|---|
| `analyst_basis` | 哪位分析師（朱家泓／楊雲翔／王倚隆／權證小哥）的哪項框架 |
| `data_evidence` | 每一項數字都附來源（價格／量能／法人／基本面） |
| `traceability` | 可追溯鏈（知識庫 digest id＋資料日期＋來源 agent） |
| `confidence` | 信心分數＋支持理由＋反對理由＋風險註記 |

**沒有佐證的標的，GOD 側契約驗證會直接擋下**——這正是防止「AI 認真胡說八道」的機制。

---

## 三、payload 形狀（GOD 側已定案，App 原封不動存即可）

> 完整契約：`/Users/sheng-feng/Antigravity-Rule/FengTeam/contracts/schema-v1/target-evidence.schema.json`
> 範例：`/Users/sheng-feng/Antigravity-Rule/FengTeam/contracts/schema-v1/samples/target-evidence.sample.json`

```json
{
  "note": "法遵聲明（沿用 App 原文措辭）",
  "scope": "eod_reference",
  "as_of_date": "2026-09-30",
  "analyst_team": [
    { "name": "楊雲翔", "framework": "量價操盤術", "persona_file": "expert_personas/yangyun-xiang.md" }
  ],
  "items": [
    {
      "stock_id": "2330",
      "label": "2330 台積電",
      "official_industry": "電子零組件",
      "signal": "一針見血結論（例：突破買點／回檔不破前低）",
      "price_snapshot": { "close": 1675, "change_pct": 2.43, "volume_lots": 852300, "turnover_yi": 14.28, "data_status": "ok" },
      "analyst_basis": { "analyst": "楊雲翔", "analysis": "均線多頭排列＋量比 1.8…", "persona_framework": "量價操盤術" },
      "data_evidence": { "price_data": "TWSE OpenAPI STOCK_DAY_ALL 2026-09-30…", "volume_data": "…", "fund_flow": "…", "fundamental": "…" },
      "traceability": { "knowledge_digests": ["digest_xxx"], "data_as_of": "2026-09-30", "source_agents": ["beta-sniper", "omni-analyst"] },
      "confidence": { "score": 78, "reasons_for": ["…"], "reasons_against": ["…"], "risk_note": "…" }
    }
  ]
}
```

**資料未就緒時**：`scope: "unavailable"`、`items: []`（誠實缺省，**不填佔位數字**——符合 §六 資料誠實原則）。

---

## 四、GOD 側已完成的部分（供查核）

| 項目 | 狀態 |
|---|---|
| Schema（2020-12） | ✅ `contracts/schema-v1/target-evidence.schema.json` |
| 契約註冊 | ✅ `contracts/schema-v1/version.json`（owner=omni-analyst） |
| 產出檔 | ✅ `data/api/app/target-evidence.json`（初始誠實 503） |
| 推送白名單 | ✅ `scripts/god-push.mjs` `KNOWN_ENDPOINTS` 已加 |
| 端點服務 | ✅ `app-server --check` → **7/7 就緒** |
| 範例 | ✅ 3 筆（台積電 78／華夏 65／晶科能源 20 誠實缺口） |

**推送方式不變**：`god-push.mjs` 由檔名 `target-evidence.json` 推斷 endpoint=`target-evidence`，無需改推送腳本。

---

## 五、驗證步驟（App 側加完後）

1. 等 GOD 側產出並推送（god-loop 每 tick 自動推）。
2. 等 **60 秒**（KV 最終一致性）後讀回：
   ```bash
   curl https://skynet-dashboard.xpornky1122.workers.dev/api/skynet/god/target-evidence
   ```
3. 預期：`{ ok:true, ready:true, payload:{...}, generated_at, received_at, age_ms, stale }`
   - 尚未產出時 `ready:false`（回 200，非 404）——刻意設計，非錯誤。

**加白名單前**推送會回 `400 { error:'unknown_endpoint', allowed:[6 項] }`——這是預期行為。

---

## 六、後續（非本次必要）

App 側若要在 UI 呈現「一針見血標的」，可新增面板（類似既有 `GodPanel.tsx`／`PicksGodPanel.tsx`）。
建議呈現：標的 → `signal` 大字 → `analyst_basis`（分析師＋框架）→ `data_evidence` 表格 → `confidence` 分數與正反理由。
**BOSS 期待這是「華爾街峰子分析辦公室」的核心價值呈現。**

---

## 七、同步紀律

依 `god-office-interface-spec.md` §5.2：任何影響峰子 App 的變更（端點 schema、白名單、JSON 格式、推送排程、token 輪替）須雙方同步。
本次為 **GOD 側主動變更 → 請求 App 側配合加白名單**，故由 GOD 側發起本文件。
