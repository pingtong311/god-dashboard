#!/usr/bin/env node
/**
 * scripts/precompute-scan.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * 【本機盤後預算工具】把「全市場掃描」的重計算搬到本機，結果寫進 Cloudflare KV，
 * 讓 Edge（Cloudflare Workers）只做「讀一個 key、回傳」。
 *
 * 為什麼需要這支腳本（務必先讀懂）：
 *   `/api/skynet/pattern-screen` 與 `/api/skynet/swing-hub` 原本在**單次請求內**
 *   讀 KV 裡 70 個交易日的全市場日 K（每日約 2.5MB）、展開約 2,000 檔 × 70 根
 *   ≈ 14 萬根 K 棒，再跑 7 種型態幾何辨識／16 個條件運算——數百毫秒量級。
 *   而 Cloudflare **Free plan 的 Worker CPU 上限是 10ms**，實測線上直接
 *   **503 error code: 1102**（超出資源限制）。本機 `npx jest` 全綠，證明不是邏輯錯，
 *   是 Edge 的資源天花板。業主裁示：改為「離線預算 + 寫入 KV」。
 *
 * 產出（寫入 KV 的 key）：
 *   scan:pattern-screen   ← 7 種型態的掃描結果（src/lib/scanPayload.ts 組裝）
 *   scan:swing-hub        ← 16 個波段條件頁籤結果（同上）
 *   scan:cb               ← 可轉債轉換溢價率（src/lib/cbPremium.ts 組裝）
 *   scan:market-overview  ← 大盤總覽（最近交易日，sectorLimit 預設 32）
 *   scan:market-overview:sl5        ← 同上但 sectorLimit=5（market-center 使用）
 *   scan:market-overview:d<YYYYMMDD> ← 指定交易日的歷史回看（最近 N 日）
 *   scan:trading-dates    ← 近期交易日母清單（最多 60 筆，由新到舊）
 *   scan:treemap          ← 族群熱圖（最近交易日）
 *   scan:treemap:d<YYYYMMDD> ← 指定交易日的族群熱圖
 *   scan:dividend-calendar ← 除權息行事曆（未來 30 天內，無查詢參數）
 *   scan:block-trades     ← 鉅額交易（TWSE 上市 ＋ TPEX 上櫃合併，無查詢參數）
 *   這些 route 只讀對應的 key；KV 無值時 route 回 200 + ready:false +
 *   誠實文案（不偽裝成「載入中」、不回 5xx）。
 *   ⚠ 例外：dividend-calendar 與 block-trades 走「寬鬆模式」——KV 未命中時
 *     **降級回即時計算**而不是回 ready:false，因為 /dividend 與 /block-trades 頁
 *     都要求 `available===true` 且 `items` 為陣列
 *     （回 ready:false 會讓一個原本可用的頁面變成錯誤狀態）。
 *
 * ⚠ market-overview 為什麼也要預算（2026-10-04 新增）
 *   該端點原本在請求時並行抓 TWSE MI_INDEX（4.8MB）＋ T86（2.17MB）並解析約 7MB JSON，
 *   在 Free plan 的 10ms CPU 上限下必然 503 error code: 1102。
 *   本工具把抓取與解析搬到本機，KV 只存**可直接送出的 JSON 字串**，
 *   邊緣端 `new Response(text)` 直送（不解析、不序列化）。
 *
 * ⚠ trading-dates 為什麼也要預算（2026-10-04 新增）
 *   該端點原本在請求時 `resolveLatestTradingDate()` ＋ 為湊滿 count 個交易日逐日
 *   `loadMarketOverview()` 探測，最多 **61 次上游抓取**、實測 **12.9 秒**，
 *   且在 10ms CPU 上限下**間歇性** 1102（isolate 冷啟動爆表、暖機僥倖通過）。
 *   首頁與 /market-center 每次載入都打這支 → 影響最大。
 *   交易日清單一天最多變一次，且**純日曆計算即可得出**（與 mkt:bars 回填、
 *   pattern-screen 用同一份 isTradingDay），故本工具**零上游成本**就能產出。
 *
 * ⚠ treemap 為什麼也要預算（2026-10-04 新增）
 *   該端點原本在請求時抓 MI_INDEX（4.8MB）並解析 tables[8] 全市場 3.5 萬列後聚合，
 *   同樣必然 1102；且**未指定日期時查「台北今天」，週末／休市日會拿到
 *   `stat !== 'OK'` → 直接 502**（首頁與 /sector 都是無參數呼叫，整個週末都是壞的）。
 *   本工具在**真實交易日**產出，天然避開該缺陷。
 *   ⚠ treemap 同時是 stock-research 的內部相依 → 修好它等於一併修好 stock-research。
 *
 * ⚠ dividend-calendar 為什麼也要預算（2026-10-04 新增）
 *   該端點原本在請求時**並行抓 3 個上游、共約 3.9MB** 並解析：
 *     TWT48U（除權除息預告表，16.6KB）
 *     STOCK_DAY_AVG_ALL（上市個股日收盤價，2.60MB）← 只為了拿 5 檔的收盤價算殖利率
 *     t187ap03_L（上市公司基本資料，1.33MB）     ← 只為了拿產業別
 *   2026-10-04 以 `wrangler tail` 實測 **cpuTime 51～143ms（中位數 76ms）**，
 *   是 Free plan 上限（10ms）的 **5～14 倍**（同一量測下地板值為 7ms）。
 *   目前仍回 200（超限不一定當下就被砍），但已長期處於危險區。
 *
 *   ⚠ 本端點的**回應形狀是「攤平」的**（`{...data, provenance, fetchedAt}`），
 *     不是 `{ ok, data }` 包裝 —— 預算時務必逐字對齊，否則前端 `available`
 *     讀不到（見 src/app/dividend/DividendClient.tsx）。
 *   ⚠ 本端點**沒有查詢參數** → 不需要 variant，只寫一個 base key。
 *
 * ⚠ block-trades 為什麼也要預算（2026-10-04 新增）
 *   該端點原本在請求時並行抓 TWSE `BFIAUU` 與 TPEX `tpex_daily_qutoes_block`，
 *   且 TWSE 側**未指定日期時會逐日往回探測**（LOOKBACK_DAYS = 10，每個交易日一次 fetch）。
 *   實測 `cpuTime` **min/p25/median/p75/max = 13/15/18/20/286 ms**（≤10ms = 0/13）。
 *   屬「暖機後仍穩定超限」型（中位 18ms ≈ 上限 1.8 倍），非單純冷啟動問題。
 *
 *   🔴 **本端點有嚴重的時點敏感性，務必理解**：
 *     TWSE 鉅額交易**含「盤後」時段**（交易至 17:00），且本頁自述更新時間為
 *     「下一交易日 23:08」。⇒ 在**每日 16:35** 的盤後場跑預算，TWSE 當日資料
 *     **尚未定稿（可能為空、也可能只有部分）**，寫進 KV 後會被凍結到隔天 16:35。
 *     → 因此本端點除了 16:35 的 `--only=all` 之外，**另需一個深夜場（23:30）**
 *       單獨重跑 `--only=block-trades`，把當日最終版覆寫進去。
 *       見 `scripts/com.god.precompute-scans.plist`（兩個 StartCalendarInterval）。
 *     → 兩場合起來的效果：隔一交易日 09:00 看到的是「前一日已定稿」的完整資料。
 *
 *   ⚠ 回應形狀是**攤平**的（`{...data, provenance, fetchedAt}`），
 *     且 `provenance.upstream` 是**物件** `{ twse, tpex }`（不是字串）——
 *     與 dividend-calendar 不同，預算時務必逐字對齊。
 *
 * 重用既有邏輯（不重寫，避免兩套實作漂移）
 *   scanPayload.ts / marketBars.ts / marketOverview.ts / cbPremium.ts /
 *   tradingDates.ts / treemap.ts（皆在 src/lib）與
 *   app/dividend/dividend-data.ts、app/block-trades/block-trades-data.ts
 *   都是 TypeScript（含 `@/` 路徑別名），無法被純 Node
 *   直接 import。本工具用專案既有的 esbuild（devDependency）把這些模組即時 bundle
 *   成暫存 .mjs 再動態 import —— 組裝／幾何辨識／條件運算／日期工具全部沿用同一份實作，
 *   與 route 共用，保證預算結果與線上端點的欄位完全一致。
 *
 * ⚠ 上游日 K 的來源
 *   本工具**不重抓**上游日 K，而是讀 KV 已回填的 `mkt:bars:<date>`
 *   （由 scripts/backfill-market-bars.mjs 回填）。若 KV 裡的交易日不足
 *   MIN_BARS_FOR_SCAN（40 天），本工具**直接停手並回報**，絕不寫入「假裝掃過」的結果。
 *
 * ⚠ KV namespace 識別（寫錯就白做，與 backfill 工具相同）
 *     - 043f75b7beb64c8b94bafcacee2c5ee6  標題 god-dashboard-cache  ← 線上在用（唯一）
 *   2026-10-02：標題由 skynet-dashboard-skynet-cache 更名為 god-dashboard-cache；
 *   空的誘餌 namespace（3bfcd44d…，標題 SKYNET_CACHE）已刪除。
 *   可用 --namespace-id= 或環境變數 SKYNET_KV_NAMESPACE_ID 覆寫。
 *
 * ⚠ 所有 wrangler KV 指令都必須帶 --remote
 *   wrangler 4.107 的 `kv key list/put/get` 預設對「本機」儲存操作。
 *
 * 用法
 *   node scripts/precompute-scan.mjs [選項]
 *
 * 選項
 *   --days=N            型態掃描回看的交易日數（預設 70＝scanPayload.SCAN_WINDOW_TRADING_DAYS）
 *   --to=YYYY-MM-DD     視窗結束日（預設今天，台北時區）
 *   --only=all|pattern-screen|swing-hub|cb|market-overview|trading-dates|treemap|dividend-calendar|block-trades
 *                       只算其中一項（預設 all）
 *   --overview-dates=N  大盤總覽另外預算最近 N 個交易日的歷史回看（預設 5；0 = 不做）
 *   --treemap-dates=N   族群熱圖另外預算最近 N 個交易日的歷史回看（預設 1＝只做最近一日）
 *   --dry-run           只計算不寫 KV（同時把 JSON 存到 --out-dir）
 *   --out-dir=<dir>     dry-run 的輸出目錄（預設 .scan-cache）
 *   --verify            寫入後以 `kv key get` 讀回並比對位元組數
 *   --min-gap-ms=N      上游請求最小間隔毫秒（預設 400；公家機關請勿爆打）
 *   --namespace-id=<id> 覆寫 KV namespace id
 *   --help
 *
 * 依賴：esbuild（專案 devDependency）+ wrangler（專案 devDependency）。
 */

import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler');

/** 線上實際綁定的 namespace id（見檔首「KV namespace 識別」）。 */
const DEFAULT_NAMESPACE_ID = '043f75b7beb64c8b94bafcacee2c5ee6';

/** 日 K 的 KV key 前綴（與 src/lib/marketBars.ts 的 MARKET_BARS_KV_PREFIX 一致）。 */
const BARS_PREFIX = 'mkt:bars:';

/** 預算結果的 TTL：7 天（涵蓋週末與連假；過期即誠實顯示「尚未預算」）。 */
const SCAN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Cloudflare KV 單一值上限：25 MiB。超過即拒絕寫入（寫了也讀不到）。 */
const KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;

/** 命令緩衝上限：單日 payload ~2.5MB、預算結果可能數 MB。 */
const MAX_BUFFER = 256 * 1024 * 1024;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`用法：node scripts/precompute-scan.mjs [選項]

  --days=N            型態掃描回看的交易日數（預設 70）
  --to=YYYY-MM-DD     視窗結束日（預設今天，台北時區）
  --only=all|pattern-screen|swing-hub|cb|market-overview|trading-dates|treemap|dividend-calendar|block-trades|trump-radar
                      只算其中一項（預設 all）
  --overview-dates=N  大盤總覽另外預算最近 N 個交易日的歷史回看（預設 5；0 = 不做）
  --treemap-dates=N   族群熱圖另外預算最近 N 個交易日的歷史回看（預設 1）
  --dry-run           只計算不寫 KV（同時把 JSON 存到 --out-dir）
  --out-dir=<dir>     dry-run 的輸出目錄（預設 .scan-cache）
  --verify            寫入後讀回並比對位元組數
  --min-gap-ms=N      上游請求最小間隔毫秒（預設 400）
  --namespace-id=<id> 覆寫 KV namespace id`);
}

/** `--only` 的合法值。 */
const ONLY_VALUES = [
  'all',
  'pattern-screen',
  'swing-hub',
  'cb',
  'market-overview',
  'trading-dates',
  'treemap',
  'dividend-calendar',
  'block-trades',
  'trump-radar',
];

function parseArgs(argv) {
  const args = {
    // 0 = 採用 scanPayload.SCAN_WINDOW_TRADING_DAYS（載入 lib 後才知道）。
    days: 0,
    to: '',
    only: 'all',
    dryRun: false,
    outDir: '.scan-cache',
    verify: false,
    minGapMs: 400,
    namespaceId: '',
    /** 大盤總覽另外預算最近 N 個交易日的歷史回看（0 = 只做最近一日）。 */
    overviewDates: 5,
    /** 族群熱圖另外預算最近 N 個交易日的歷史回看（預設 1 = 只做最近一日）。 */
    treemapDates: 1,
  };
  const readValue = (raw, i) => {
    const eq = raw.indexOf('=');
    if (eq >= 0) return { value: raw.slice(eq + 1), next: i };
    return { value: argv[i + 1] ?? '', next: i + 1 };
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const name = raw.includes('=') ? raw.slice(0, raw.indexOf('=')) : raw;
    if (name === '--days') {
      const { value, next } = readValue(raw, i);
      args.days = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--to') {
      const { value, next } = readValue(raw, i);
      args.to = value;
      i = next;
    } else if (name === '--only') {
      const { value, next } = readValue(raw, i);
      args.only = value;
      i = next;
    } else if (name === '--out-dir') {
      const { value, next } = readValue(raw, i);
      args.outDir = value;
      i = next;
    } else if (name === '--min-gap-ms') {
      const { value, next } = readValue(raw, i);
      args.minGapMs = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--namespace-id') {
      const { value, next } = readValue(raw, i);
      args.namespaceId = value;
      i = next;
    } else if (name === '--overview-dates') {
      const { value, next } = readValue(raw, i);
      args.overviewDates = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--treemap-dates') {
      const { value, next } = readValue(raw, i);
      args.treemapDates = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--dry-run') args.dryRun = true;
    else if (name === '--verify') args.verify = true;
    else if (name === '--help' || name === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.days) || args.days <= 0) args.days = 0;
  if (!Number.isFinite(args.minGapMs) || args.minGapMs < 0) args.minGapMs = 400;
  if (!Number.isFinite(args.overviewDates) || args.overviewDates < 0) args.overviewDates = 5;
  if (!Number.isFinite(args.treemapDates) || args.treemapDates < 1) args.treemapDates = 1;
  if (!ONLY_VALUES.includes(args.only)) {
    args.only = 'all';
  }
  return args;
}

/** 執行 wrangler 子命令（統一路徑與 cwd）。 */
async function wrangler(subArgs) {
  const { stdout, stderr } = await execFileAsync(WRANGLER_BIN, subArgs, {
    cwd: ROOT,
    maxBuffer: MAX_BUFFER,
  });
  return { stdout, stderr };
}

/** 前置檢查：wrangler 是否已登入。 */
async function assertLoggedIn() {
  const { stdout, stderr } = await wrangler(['whoami']);
  const out = `${stdout}${stderr}`;
  if (!/You are logged in/i.test(out)) {
    throw new Error(
      'wrangler 未登入。請先執行 `npx wrangler login`（或設定 CLOUDFLARE_API_TOKEN）後再跑本工具。',
    );
  }
  return /associated with the email (\S+)/i.exec(out)?.[1] ?? '(未知)';
}

/**
 * 解析 wrangler 輸出中的 JSON 陣列。
 * ⚠ 不能只取「第一個 [」：wrangler 的警告訊息含 `[WARNING]`，會被誤判為陣列開頭。
 */
function parseJsonArray(output) {
  const end = output.lastIndexOf(']');
  if (end < 0) return [];
  for (let i = 0; i < output.length; i += 1) {
    if (output[i] !== '[') continue;
    if (i !== 0 && output[i - 1] !== '\n') continue;
    try {
      return JSON.parse(output.slice(i, end + 1));
    } catch {
      // 這個候選不是合法 JSON（例如警告訊息），換下一個。
    }
  }
  return [];
}

/** 列出 KV 中已存在的 mkt:bars: 日期（Set）。 */
async function listExistingDates(nsId) {
  const { stdout } = await wrangler(['kv', 'key', 'list', '--namespace-id', nsId, '--remote']);
  const keys = parseJsonArray(stdout);
  const dates = new Set();
  for (const k of keys) {
    if (k && typeof k.name === 'string' && k.name.startsWith(BARS_PREFIX)) {
      dates.add(k.name.slice(BARS_PREFIX.length));
    }
  }
  return dates;
}

/** 讀回單一 key（--remote）。⚠ 只取 stdout（值在 stdout，警告在 stderr）。 */
async function getKey(nsId, key) {
  const { stdout } = await wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']);
  return stdout;
}

/** 寫入單一 key（值從暫存檔讀取）。 */
async function putKey(nsId, key, valuePath) {
  await wrangler([
    'kv',
    'key',
    'put',
    key,
    '--path',
    valuePath,
    '--namespace-id',
    nsId,
    '--remote',
    '--ttl',
    String(SCAN_TTL_SECONDS),
  ]);
}

/**
 * 用 esbuild 即時 bundle 一支 TS 檔成暫存 .mjs 並 import。
 * 這樣就能直接重用既有實作（組裝／幾何辨識／條件運算／日期工具），不重寫一份。
 *
 * ⚠ 路徑解析規則（2026-10-04 泛化，務必先讀懂）：
 *   原本硬編碼 `join(ROOT,'src','lib', entryRelPath)`，導致**無法 bundle
 *   `src/app/**` 的資料層**——例如除權息行事曆的邏輯住在
 *   `src/app/dividend/dividend-data.ts`（而非 src/lib），要重用就得先泛化。
 *
 *   現在的規則（兩種寫法都支援，向後相容）：
 *     - **含 `/`** → 視為**相對 `src/`**。例：`'app/dividend/dividend-data.ts'`
 *       → `<ROOT>/src/app/dividend/dividend-data.ts`
 *     - **純檔名** → 視為**相對 `src/lib/`**（既有呼叫端全部沿用）。
 *       例：`'treemap.ts'` → `<ROOT>/src/lib/treemap.ts`
 *
 * ⚠ 另加了「進入點不存在」的明確錯誤：esbuild 找不到檔案時的錯誤訊息只會說
 *   「Could not resolve …」，不會告訴你是**哪個呼叫端**傳錯路徑 → 這裡先 `access` 檢查。
 */
async function bundleAndImport(entryRelPath) {
  const rel = entryRelPath.includes('/') ? entryRelPath : join('lib', entryRelPath);
  const entryAbs = join(ROOT, 'src', rel);
  try {
    await access(entryAbs);
  } catch {
    throw new Error(`找不到要 bundle 的進入點：${entryAbs}（呼叫端傳入：${entryRelPath}）`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'scan-precompute-'));
  const outfile = join(dir, `${entryRelPath.replace(/[^\w]/g, '_')}.bundle.mjs`);
  await build({
    entryPoints: [entryAbs],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    tsconfig: join(ROOT, 'tsconfig.json'),
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  return { mod, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nsId = args.namespaceId || process.env.SKYNET_KV_NAMESPACE_ID || DEFAULT_NAMESPACE_ID;
  const wantPattern = args.only === 'all' || args.only === 'pattern-screen';
  const wantSwing = args.only === 'all' || args.only === 'swing-hub';
  const wantCb = args.only === 'all' || args.only === 'cb';
  const wantOverview = args.only === 'all' || args.only === 'market-overview';
  const wantTradingDates = args.only === 'all' || args.only === 'trading-dates';
  const wantTreemap = args.only === 'all' || args.only === 'treemap';
  const wantDividend = args.only === 'all' || args.only === 'dividend-calendar';
  const wantBlockTrades = args.only === 'all' || args.only === 'block-trades';
  const wantTrumpRadar = args.only === 'all' || args.only === 'trump-radar';
  /** 是否需要讀 KV 裡已回填的日 K（只有 pattern/swing 需要）。 */
  const needBars = wantPattern || wantSwing;

  console.log('=== 全市場掃描「離線預算」工具 ===');
  console.log(`KV namespace id : ${nsId}`);
  console.log(
    `寫入 key        : ${wantPattern ? 'scan:pattern-screen ' : ''}${wantSwing ? 'scan:swing-hub ' : ''}` +
      `${wantCb ? 'scan:cb ' : ''}${wantOverview ? `scan:market-overview（+ ${args.overviewDates} 日歷史）` : ''}` +
      `${wantTradingDates ? 'scan:trading-dates ' : ''}` +
      `${wantTreemap ? `scan:treemap（+ ${args.treemapDates} 日歷史）` : ''}` +
      `${wantDividend ? 'scan:dividend-calendar ' : ''}` +
      `${wantBlockTrades ? 'scan:block-trades ' : ''}` +
      `${wantTrumpRadar ? 'scan:trump-radar ' : ''}`,
  );
  console.log(`TTL             : ${SCAN_TTL_SECONDS}s（7 天）`);
  console.log(`模式            : ${args.dryRun ? `DRY-RUN（不寫入，輸出至 ${args.outDir}）` : '寫入 KV'}`);
  console.log('');

  // 1. 前置檢查（dry-run 不需要 wrangler 寫入，但仍檢查登入以免白跑）
  let email = '(略過)';
  if (!args.dryRun) {
    try {
      email = await assertLoggedIn();
    } catch (err) {
      console.error(`✘ 前置檢查失敗：${err.message}`);
      process.exit(2);
    }
  }
  console.log(`✔ wrangler 狀態：${email}`);

  // 2. 載入既有實作（esbuild bundle）
  const scan = await bundleAndImport('scanPayload.ts');
  const bars = await bundleAndImport('marketBars.ts');
  console.log('✔ 已載入 src/lib/scanPayload.ts + src/lib/marketBars.ts（esbuild bundle）');
  let cb = null;
  if (wantCb) {
    cb = await bundleAndImport('cbPremium.ts');
    console.log('✔ 已載入 src/lib/cbPremium.ts（esbuild bundle）');
  }
  let overview = null;
  if (wantOverview) {
    overview = await bundleAndImport('marketOverview.ts');
    console.log('✔ 已載入 src/lib/marketOverview.ts（esbuild bundle）');
  }
  let tradingDates = null;
  if (wantTradingDates) {
    tradingDates = await bundleAndImport('tradingDates.ts');
    console.log('✔ 已載入 src/lib/tradingDates.ts（esbuild bundle）');
  }
  let treemap = null;
  if (wantTreemap) {
    treemap = await bundleAndImport('treemap.ts');
    console.log('✔ 已載入 src/lib/treemap.ts（esbuild bundle）');
  }
  let dividend = null;
  if (wantDividend) {
    // ⚠ 這一支不在 src/lib → 必須用「含 / 的路徑」寫法（見 bundleAndImport 說明）。
    dividend = await bundleAndImport('app/dividend/dividend-data.ts');
    console.log('✔ 已載入 src/app/dividend/dividend-data.ts（esbuild bundle）');
  }
  let blockTrades = null;
  if (wantBlockTrades) {
    blockTrades = await bundleAndImport('app/block-trades/block-trades-data.ts');
    console.log('✔ 已載入 src/app/block-trades/block-trades-data.ts（esbuild bundle）');
  }
  let trumpRadar = null;
  if (wantTrumpRadar) {
    // ⚠ 這一支也不在 src/lib → 同樣用「含 / 的路徑」寫法。
    //   抓取層刻意抽成純 TS 模組（不可 import next/server），就是為了能在這裡 bundle。
    trumpRadar = await bundleAndImport('app/trump/trump-data.ts');
    console.log('✔ 已載入 src/app/trump/trump-data.ts（esbuild bundle）');
  }
  console.log('');

  /**
   * 統一的暫存清理。
   * ⚠ 原本每個離開路徑各自手寫 `scan.cleanup(); bars.cleanup();`，
   *   新增模組時很容易漏掉（`overview` 就一直沒被清到）→ 統一走這支。
   */
  const loadedModules = [
    scan,
    bars,
    cb,
    overview,
    tradingDates,
    treemap,
    dividend,
    blockTrades,
    trumpRadar,
  ].filter(Boolean);
  const cleanupAll = async () => {
    for (const m of loadedModules) {
      try {
        await m.cleanup();
      } catch {
        /* 暫存清理失敗不影響已完成的結果 */
      }
    }
  };

  const {
    SCAN_KV_KEY_PATTERN_SCREEN,
    SCAN_KV_KEY_SWING_HUB,
    SCAN_WINDOW_TRADING_DAYS,
    SWING_BARS_TRADING_DAYS,
    buildPatternScreenPayload,
    buildSwingHubPayload,
    fetchNameMap,
    fetchSwingUpstreams,
  } = scan.mod;
  const { buildTradingDayWindow, marketBarKey, parseYmdToDate, todayTaipeiYmd } = bars.mod;
  const MIN_BARS_FOR_SCAN = scan.mod.MIN_BARS_FOR_SCAN ?? 40;

  // 3. 決定視窗（取兩個端點需要的最大天數）
  const patternWindowDays = args.days > 0 ? args.days : SCAN_WINDOW_TRADING_DAYS;
  const endDate = args.to ? parseYmdToDate(args.to) : parseYmdToDate(todayTaipeiYmd());
  if (!endDate) {
    console.error(`✘ --to 格式錯誤：${args.to}`);
    await cleanupAll();
    process.exit(2);
  }
  const needDays = Math.max(
    // ⚠ 至少 1 天：否則 `--only=trading-dates` / `dividend-calendar` / `block-trades`
    //   / `trump-radar`（四者皆不依賴日 K）會讓視窗為空而直接停手。
    1,
    wantPattern ? Math.max(patternWindowDays, MIN_BARS_FOR_SCAN) : 0,
    wantSwing ? SWING_BARS_TRADING_DAYS : 0,
    // market-overview 的歷史回看需要「最近 N 個交易日」的日期清單。
    wantOverview ? args.overviewDates : 0,
    // treemap 的歷史回看同理。
    wantTreemap ? args.treemapDates : 0,
  );
  const window = buildTradingDayWindow(endDate, needDays);
  if (window.length === 0) {
    console.error('✘ 視窗為空，無交易日可預算。');
    await cleanupAll();
    process.exit(2);
  }
  console.log(`視窗：${window[0]} ~ ${window[window.length - 1]}（${window.length} 個交易日）\n`);

  // 4. 列出已回填的日期；只讀已存在的 key（避免讀空氣）
  //
  // ⚠ 只有 pattern-screen / swing-hub 需要日 K。market-overview 不需要日 K，
  //   若只跑 market-overview 就整個跳過（省下大量 KV 讀取與時間——
  //   這也直接服務「免費方案 KV 每日讀取量」的節省目標）。
  let existing = new Set();
  const missing = [];
  const days = [];
  let lastReqAt = 0;
  const throttle = async () => {
    const wait = Math.max(0, args.minGapMs - (Date.now() - lastReqAt));
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
  };

  if (needBars) {
    try {
      existing = await listExistingDates(nsId);
      console.log(`KV 既有日 K ${existing.size} 個日期。\n`);
    } catch (err) {
      console.warn(`⚠ 無法列出既有 key（將逐日嘗試讀取）：${err.message}\n`);
    }

    for (const ymd of window) {
      if (existing.size > 0 && !existing.has(ymd)) {
        missing.push(ymd);
        continue;
      }
      await throttle();
      let raw = '';
      try {
        raw = (await getKey(nsId, marketBarKey(ymd))).trim();
      } catch {
        raw = '';
      }
      if (!raw) {
        missing.push(ymd);
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.twse) || !Array.isArray(parsed.tpex)) {
          missing.push(ymd);
          continue;
        }
        days.push({ date: parsed.date ?? ymd, twse: parsed.twse, tpex: parsed.tpex });
        process.stdout.write(`✔ ${ymd}  已讀取（${(Buffer.byteLength(raw, 'utf8') / 1024).toFixed(0)} KB）\n`);
      } catch {
        // 內容損壞：誠實列為缺漏，不硬湊。
        missing.push(ymd);
        process.stdout.write(`⚠ ${ymd}  內容無法解析，列為缺漏\n`);
      }
    }

    console.log(`\n已讀取 ${days.length} 天；缺漏 ${missing.length} 天${missing.length ? `（${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}）` : ''}`);
  }

  // 5. 誠實底線：日數不足一律停手，絕不寫入「假裝掃過」的結果
  //    （僅影響 pattern-screen / swing-hub；cb 不依賴日 K，不受此限）
  if (wantPattern || wantSwing) {
    if (days.length < MIN_BARS_FOR_SCAN) {
      console.error(
        `✘ 日 K 僅 ${days.length} 天，不足 ${MIN_BARS_FOR_SCAN} 天，停止預算（不寫入 KV）。\n` +
          '  請先執行：node scripts/backfill-market-bars.mjs --days=120',
      );
      await cleanupAll();
      process.exit(2);
    }
  }

  // 6. 組裝並寫入
  const tmpDir = await mkdtemp(join(tmpdir(), 'scan-precompute-val-'));
  const results = [];

  if (wantPattern) {
    const patternDays = days.slice(-Math.max(patternWindowDays, MIN_BARS_FOR_SCAN));
    console.log(`\n— pattern-screen：取最近 ${patternDays.length} 天，抓取名稱對照…`);
    await throttle();
    const nameMap = await fetchNameMap();
    console.log(`  名稱對照 ${nameMap.size} 筆（抓不到時名稱留空，不捏造）`);

    const payload = buildPatternScreenPayload({
      days: patternDays,
      nameMap,
      missing,
      windowDays: patternDays.length + missing.length,
    });
    results.push({ key: SCAN_KV_KEY_PATTERN_SCREEN, payload, label: 'pattern-screen' });
    const counts = Object.entries(payload.patterns ?? {}).map(([id, p]) => `${id}=${p.count}`);
    console.log(`  掃描 ${payload.scannedStocks} 檔，命中：${counts.join(' ')}`);
  }

  if (wantSwing) {
    const swingDays = days.slice(-SWING_BARS_TRADING_DAYS);
    console.log(`\n— swing-hub：取最近 ${swingDays.length} 天，抓取上游（TDCC/T86/MI_MARGN/月營收/除權息）…`);
    await throttle();
    const upstreams = await fetchSwingUpstreams();
    console.log(
      `  上游：T86 ${upstreams.t86Days.length} 日、TDCC ${upstreams.tdcc.size} 檔、` +
        `月營收 ${upstreams.revenueRows.length} 列、除權息 ${upstreams.exRightRows.length} 列、` +
        `融資 ${upstreams.marginToday ? 'ok' : '缺'}/${upstreams.marginBaseline ? 'ok' : '缺'}`,
    );
    const payload = buildSwingHubPayload({ days: swingDays, upstreams });
    results.push({ key: SCAN_KV_KEY_SWING_HUB, payload, label: 'swing-hub' });
    const tabSummary = (payload.tabs ?? []).map((t) => `${t.id}=${t.items.length}`).join(' ');
    console.log(`  16 頁籤命中：${tabSummary}`);
  }

  // 6b. 可轉債（cb）：獨立抓取 TPEX 發行資料與日行情檔，不依賴日 K
  if (wantCb && cb) {
    console.log(`\n— cb（可轉債轉換溢價率）：抓取 TPEX 發行資料與日行情檔…`);
    await throttle();
    const { CB_KV_KEY, buildCbPayload } = cb.mod;
    let built = null;
    try {
      built = await buildCbPayload();
    } catch (err) {
      console.error(`✘ cb 預算拋錯（上游異常）：${err?.message ?? err}`);
      built = null;
    }
    if (!built || built.ok !== true) {
      console.error('✘ cb 預算失敗（上游無法取得），本次不寫入 scan:cb。');
    } else {
      const computedAt = new Date().toISOString();
      const envelope = { computedAt, payload: built.payload };
      results.push({ key: CB_KV_KEY, payload: envelope, label: 'cb' });
      const bytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
      console.log(`  cb payload：${(bytes / 1024).toFixed(1)} KB（available=${built.payload.available}）`);
    }
  }

  // 6c. 大盤總覽（market-overview）
  //
  // 抓 TWSE MI_INDEX（4.8MB）＋ T86（2.17MB），解析約 7MB JSON 並彙整全市場 3.5 萬列，
  // 最後**直接序列化成「可送出的回應字串」**存進 KV（邊緣端 `new Response(text)` 零解析）。
  //
  // ⚠ 兩個必須注意的坑（皆已實測確認）：
  //   1. `loadMarketOverview(date)` 只認 **8 碼 `YYYYMMDD`**；傳破折號格式
  //      （`window` 的元素是 `2026-10-02`）會**靜默退回「解析最新交易日」**，
  //      導致寫入的內容與 key 標示的日期不符。→ 必須 `replace(/-/g,'')`。
  //   2. `loadMarketOverview` 的 in-memory 快取**只用日期當 key、沒納入 sectorLimit**
  //      → 不同 sectorLimit 之間會互相污染。→ 每次呼叫前必須 `clearMarketOverviewCache()`。
  if (wantOverview && overview) {
    const { loadMarketOverview, clearMarketOverviewCache } = overview.mod;

    /** 實站使用的變體（2026-10-04 掃描 src/ 確認：只有「無參數/32」與「5」兩種）。 */
    const VARIANTS = [
      { suffix: '', sectorLimit: undefined, label: '預設(32)' },
      { suffix: 'sl5', sectorLimit: 5, label: 'sectorLimit=5' },
    ];

    const overviewDays = args.overviewDates > 0 ? window.slice(-args.overviewDates) : [];
    const latestYmd = overviewDays.length > 0 ? overviewDays[overviewDays.length - 1] : null;

    console.log(
      `\n— market-overview：預算 ${overviewDays.length} 個交易日 × ${VARIANTS.length} 個變體…`,
    );
    if (latestYmd) {
      console.log(`  最近交易日 ${latestYmd}（另寫入不帶日期的 base key：前端最常用）`);
    }

    for (const ymd of overviewDays) {
      const ymd8 = ymd.replace(/-/g, '');
      for (const v of VARIANTS) {
        clearMarketOverviewCache();
        await throttle();
        let data = null;
        try {
          data = await loadMarketOverview(ymd8, undefined, v.sectorLimit);
        } catch (err) {
          console.error(`  ✘ ${ymd8} ${v.label} 失敗：${err?.message ?? err}`);
          continue;
        }
        if (!data) {
          console.error(`  ✘ ${ymd8} ${v.label} 回空值`);
          continue;
        }

        // ⚠ 回應字串必須與 route 的形狀**完全一致**：{ ok:true, data }
        const body = JSON.stringify({ ok: true, data });
        const suffix = [v.suffix].filter(Boolean).join('_');

        // ⚠ 最近交易日的**每個變體**都要額外寫入「不帶日期」的 key。
        //   前端最常用的正是這種（無參數 / sectorLimit=5），若不寫，
        //   route 會找不到 key 而回 ready:false（實測踩到：只補了預設變體，
        //   `?sectorLimit=5` 因此回 not-ready）。
        if (ymd === latestYmd) {
          const bareKey = suffix ? `scan:market-overview:${suffix}` : 'scan:market-overview';
          results.push({
            key: bareKey,
            payload: body,
            label: `market-overview base ${v.label}（${ymd8}）`,
            raw: true,
          });
        }

        const dateSuffix = `d${ymd8}`;
        const variant = suffix ? `${dateSuffix}_${suffix}` : dateSuffix;
        results.push({
          key: `scan:market-overview:${variant}`,
          payload: body,
          label: `market-overview ${ymd8} ${v.label}`,
          raw: true,
        });
        console.log(`  ✔ ${ymd8} ${v.label} → ${(Buffer.byteLength(body, 'utf8') / 1024).toFixed(1)} KB`);
      }
    }
  }

  // 6d. 近期交易日母清單（trading-dates）
  //
  // 純日曆計算（與 mkt:bars 回填、pattern-screen 掃描用的是同一份 `isTradingDay`）
  // → **零上游成本**即可產出。母清單只有幾百 bytes，route 依 count 切片後回傳。
  //
  // ⚠ 為什麼「與 mkt:bars 同一份日曆」很重要：前端下拉選單選到的日期必須**真的有資料**，
  //   否則使用者會選到空頁。兩者共用同一份日曆，天然保證一致。
  if (wantTradingDates && tradingDates) {
    const { buildTradingDatesList, MAX_TRADING_DATES, TRADING_DATES_KV_KEY } = tradingDates.mod;
    const endYmd = args.to ? String(args.to).replace(/-/g, '') : undefined;
    const dates = buildTradingDatesList(endYmd, MAX_TRADING_DATES);

    if (dates.length === 0) {
      console.error('✘ trading-dates：母清單為空（日曆計算異常），本次不寫入 scan:trading-dates。');
    } else {
      results.push({
        key: TRADING_DATES_KV_KEY,
        payload: { ok: true, dates },
        label: 'trading-dates',
      });
      console.log(
        `\n— trading-dates：${dates.length} 個交易日（${dates[0]} 為最新，往回至 ${dates[dates.length - 1]}）`,
      );
    }
  }

  // 6e. 族群熱圖（treemap）
  //
  // 每個交易日抓一次 MI_INDEX（4.8MB）並解析 tables[8] 全市場約 3.5 萬列後聚合。
  //
  // ⚠ 一定要傳**真實交易日**（8 碼 YYYYMMDD）：
  //   1. `loadTreemap(date)` 只認 8 碼；傳破折號格式會走「自動解析最近交易日」分支，
  //      等於多打一次上游探測。
  //   2. 週末／休市日抓 MI_INDEX 會拿到 `stat !== 'OK'`（TWSE 回「沒有符合條件的資料」）
  //      → 直接拋錯。這正是原端點「整個週末都 502」的成因。
  //   本工具的 `window` 全部是真實交易日，天然避開。
  //
  // ⚠ treemap 同時是 `/api/skynet/stock-research` 的內部相依 → 修好它等於一併修好它。
  if (wantTreemap && treemap) {
    const { loadTreemap } = treemap.mod;
    const treemapDays = window.slice(-Math.max(1, args.treemapDates));
    const latestYmd = treemapDays.length > 0 ? treemapDays[treemapDays.length - 1] : null;

    console.log(`\n— treemap：預算 ${treemapDays.length} 個交易日…`);
    if (latestYmd) {
      console.log(`  最近交易日 ${latestYmd}（另寫入不帶日期的 base key：前端最常用）`);
    }

    for (const ymd of treemapDays) {
      const ymd8 = ymd.replace(/-/g, '');
      await throttle();
      let payload = null;
      try {
        payload = await loadTreemap(ymd8);
      } catch (err) {
        console.error(`  ✘ ${ymd8} 失敗：${err?.message ?? err}`);
        continue;
      }
      if (!payload) {
        console.error(`  ✘ ${ymd8} 回空值`);
        continue;
      }

      // ⚠ 回應字串必須與 route 的形狀**完全一致**（route 直送這個字串，不再加工）。
      const body = JSON.stringify(payload);
      if (ymd === latestYmd) {
        results.push({
          key: 'scan:treemap',
          payload: body,
          label: `treemap base（${ymd8}）`,
          raw: true,
        });
      }
      results.push({
        key: `scan:treemap:d${ymd8}`,
        payload: body,
        label: `treemap ${ymd8}`,
        raw: true,
      });
      console.log(
        `  ✔ ${ymd8} → ${(Buffer.byteLength(body, 'utf8') / 1024).toFixed(1)} KB（${payload.totalStocks} 檔、${payload.sectors.length} 產業）`,
      );
    }
  }

  // 6f. 除權息行事曆（dividend-calendar）
  //
  // 一次請求並行抓 3 個上游、共約 3.9MB（TWT48U 16.6KB ＋ STOCK_DAY_AVG_ALL 2.60MB
  // ＋ t187ap03_L 1.33MB）並解析 —— 這是本端點 cpuTime 中位數 76ms 的成因。
  // 搬到本機後，邊緣端只讀一個 KV key、零解析直送。
  //
  // ⚠ 回應形狀必須與 route **逐字一致**（`{...data, provenance, fetchedAt}`，**攤平**，
  //   不是 `{ ok, data }` 包裝）：`/dividend` 頁的 DividendClient 直接讀 `available`
  //   與 `items`，形狀錯了就整頁進錯誤狀態。
  //
  // ⚠ 沒有查詢參數 → 不需要 variant，只寫 base key `scan:dividend-calendar`。
  //
  // ⚠ days_left 是「預算當下」算的（每日 16:35，台北時區）。本機時區即台北，
  //   比原本在 Workers（UTC）算的更準；但隔天到下次預算前會多 1 天 ——
  //   TTL 7 天到期或排程失效時 route 會自動降級回即時計算，不會卡住。
  if (wantDividend && dividend) {
    const { getDividendCalendar } = dividend.mod;
    console.log(
      '\n— dividend-calendar：抓取 TWT48U ＋ STOCK_DAY_AVG_ALL（約 2.6MB）＋ t187ap03_L（約 1.3MB）…',
    );
    await throttle();

    let result = null;
    try {
      result = await getDividendCalendar();
    } catch (err) {
      console.error(`  ✘ 預算拋錯（上游異常）：${err?.message ?? err}`);
      result = null;
    }

    if (!result) {
      // 誠實底線：主要上游（TWT48U）失敗就**不寫**，絕不寫入空殼假裝成功。
      console.error(
        '✘ dividend-calendar：主要上游（TWT48U）失敗或無資料，本次不寫入 scan:dividend-calendar。',
      );
    } else {
      const body = JSON.stringify({
        ...result.data,
        provenance: { source: 'self-produced', upstream: result.upstream },
        fetchedAt: new Date().toISOString(),
      });
      results.push({
        // 與 src/lib/precomputed.ts 的 precomputedKvKey('dividend-calendar') 一致。
        key: 'scan:dividend-calendar',
        payload: body,
        label: 'dividend-calendar',
        raw: true,
      });
      console.log(
        `  ✔ ${result.data.items.length} 列（未來 30 天內；available=${result.data.available}）`,
      );
    }
  }

  // 6g. 鉅額交易（block-trades）
  //
  // 抓 TWSE BFIAUU（未指定日期時逐日往回探測，最多 10 天）＋ TPEX
  // tpex_daily_qutoes_block，合併上市／上櫃後依成交金額降冪排序。
  //
  // 🔴 **時點敏感性**（見檔首說明）：TWSE 鉅額交易含盤後時段（至 17:00），
  //   16:35 的盤後場抓到的當日資料**尚未定稿**。故本端點另需 23:30 的深夜場
  //   （`--only=block-trades`）覆寫為最終版。兩場皆跑 `--only=all` 時也涵蓋本節。
  //
  // ⚠ 回應形狀必須與 route **逐字一致**（攤平 `{...data, provenance, fetchedAt}`）；
  //   且 `provenance.upstream` 是**物件** `{ twse, tpex }`（不是字串）。
  //
  // ⚠ 沒有查詢參數 → 不需要 variant，只寫 base key `scan:block-trades`。
  if (wantBlockTrades && blockTrades) {
    const { getBlockTrades } = blockTrades.mod;
    console.log('\n— block-trades：抓取 TWSE BFIAUU（逐日回推）＋ TPEX 上櫃鉅額交易…');
    await throttle();

    let result = null;
    try {
      result = await getBlockTrades();
    } catch (err) {
      console.error(`  ✘ 預算拋錯（上游異常）：${err?.message ?? err}`);
      result = null;
    }

    if (!result) {
      // 誠實底線：證交所上游全數失敗就**不寫**，絕不寫入空殼假裝成功。
      console.error('✘ block-trades：TWSE 上游全數失敗或無資料，本次不寫入 scan:block-trades。');
    } else {
      const body = JSON.stringify({
        ...result.data,
        provenance: { source: 'self-produced', upstream: result.upstream },
        fetchedAt: new Date().toISOString(),
      });
      results.push({
        // 與 src/lib/precomputed.ts 的 precomputedKvKey('block-trades') 一致。
        key: 'scan:block-trades',
        payload: body,
        label: 'block-trades',
        raw: true,
      });
      const gapNote = result.data.gaps.length > 0 ? `、gaps ${result.data.gaps.length} 筆` : '';
      console.log(
        `  ✔ 資料日 ${result.data.date}、${result.data.items.length} 檔` +
          `（TPEX ${result.upstream.tpex ? '已併入' : '未取得'}${gapNote}）`,
      );
    }
  }

  // 6h. 川普政策雷達（trump-radar）
  //
  // 抓三條公開 RSS：英文 Google News（約 69KB）＋ 白宮官方 feed（約 480KB）
  // ＋ 繁中 Google News（約 116KB），解析後依關鍵字規則分類主題。
  //
  // 🔴 **本端點在邊緣端是「完全拿不到資料」，不是「慢」**：
  //   2026-10-04 實測線上回應 `{"ok":false,"error":"upstream_error"}`、耗時 8.48s
  //   （＝三條並行各撞滿 8 秒逾時）；同一時間**本機三條全數 HTTP 200**。
  //   ⇒ 與 block-trades 的 TPEX 同一類：上游可達性因執行位置而異。
  //   ⇒ 預算的目的首先是「讓它真的有資料」。
  //
  // ⚠ 時效性：RSS 是滾動新聞，預算產出的是**產出當下的快照**。
  //   因此本節除了 16:35 的盤後場（`--only=all`）外，也掛在 23:30 的深夜場
  //   （plist 中以 `--only=trump-radar` 再跑一次），把最大延遲從約 24 小時壓到約 7 小時。
  //   scan: 系列 TTL 為 7 天 → 排程若中斷，最壞情況仍可撐 7 天後才降級為 ready:false。
  //
  // ⚠ 回應形狀必須與 route **逐字一致**（攤平 `{...payload, provenance, fetchedAt}`）；
  //   且 `provenance.upstream` 是**字串陣列**（3 條 URL），**不是**物件。
  //   這裡刻意呼叫 route 共用的 `buildTrumpRadarResponse()` 單一出口組裝，
  //   從根本上排除形狀漂移。
  //
  // ⚠ 沒有 variant：頁面只用 `days=45`（＝DEFAULT_DAYS），其餘天數走即時計算。
  if (wantTrumpRadar && trumpRadar) {
    const { getTrumpRadar, buildTrumpRadarResponse, DEFAULT_DAYS } = trumpRadar.mod;
    console.log('\n— trump-radar：抓取英文 Google News ＋ 白宮官方 ＋ 繁中 Google News…');
    await throttle();

    let result = null;
    try {
      result = await getTrumpRadar({ days: DEFAULT_DAYS });
    } catch (err) {
      console.error(`  ✘ 預算拋錯（上游異常）：${err?.message ?? err}`);
      result = null;
    }

    if (!result) {
      // 誠實底線：主要上游（英文 Google News）失敗就**不寫**，
      // 絕不用空殼覆蓋掉既有（可能還新鮮的）預算結果。
      console.error(
        '✘ trump-radar：主要上游（英文 Google News）失敗，本次不寫入 scan:trump-radar。',
      );
    } else {
      if (result.gaps.length > 0) {
        // 誠實出聲：輔助上游失敗不阻塞，但必須讓人看見（block-trades 的教訓）。
        console.warn(`  ⚠ 輔助上游缺漏：${result.gaps.join('；')}`);
      }
      const body = JSON.stringify(buildTrumpRadarResponse(result, new Date().toISOString()));
      results.push({
        // 與 src/lib/precomputed.ts 的 precomputedKvKey('trump-radar') 一致。
        key: 'scan:trump-radar',
        payload: body,
        label: 'trump-radar',
        raw: true,
      });
      const themeNote = result.payload.themes
        .slice(0, 3)
        .map((t) => `${t.theme}=${t.count}`)
        .join(' / ');
      console.log(
        `  ✔ 美國原文 ${result.payload.items.length} 則、台媒 ${result.payload.tw_items.length} 則` +
          `（days=${DEFAULT_DAYS}；主題聲量 ${themeNote}）`,
      );
    }
  }

  // 7. 寫入（或 dry-run 存檔）
  for (const { key, payload, label, raw } of results) {
    // ⚠ raw=true 的 payload 已經是「可直接送出的 JSON 字串」，**不可**再二次序列化
    //   （否則會多一層引號跳脫，邊緣端直送時前端解析不到）。
    const json = raw ? String(payload) : JSON.stringify(payload);
    const bytes = Buffer.byteLength(json, 'utf8');
    console.log(`\n${label} payload：${(bytes / 1024).toFixed(1)} KB`);
    if (bytes > KV_MAX_VALUE_BYTES) {
      console.error(`✘ ${label} 超過 Cloudflare KV 單值上限 25MiB，拒絕寫入（請縮小視窗或瘦身欄位）。`);
      continue;
    }

    if (args.dryRun) {
      await mkdir(resolve(ROOT, args.outDir), { recursive: true });
      const outPath = join(resolve(ROOT, args.outDir), `${key.replace(':', '-')}.json`);
      await writeFile(outPath, json, 'utf8');
      console.log(`○ DRY-RUN：已輸出 ${outPath}`);
      continue;
    }

    const valuePath = join(tmpDir, `${key.replace(':', '-')}.json`);
    await writeFile(valuePath, json, 'utf8');
    await putKey(nsId, key, valuePath);
    console.log(`✔ 已寫入 KV：${key}`);

    if (args.verify) {
      const readBack = (await getKey(nsId, key)).trim();
      const same = Buffer.byteLength(readBack, 'utf8') === bytes;
      console.log(same ? '✔ 讀回比對一致' : '⚠ 讀回位元組數不一致（請檢查）');
    }
  }

  await rm(tmpDir, { recursive: true, force: true });
  await cleanupAll();
  console.log('\n=== 完成 ===');
}

main().catch(async (err) => {
  console.error(`✘ 預算失敗：${err?.stack ?? err}`);
  process.exit(1);
});
