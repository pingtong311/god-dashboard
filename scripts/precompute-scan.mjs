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
 * 產出（寫入 KV 的三個 key）：
 *   scan:pattern-screen   ← 7 種型態的掃描結果（src/lib/scanPayload.ts 組裝）
 *   scan:swing-hub        ← 16 個波段條件頁籤結果（同上）
 *   scan:cb               ← 可轉債轉換溢價率（src/lib/cbPremium.ts 組裝）
 *   三個 route 只讀這三個 key；KV 無值時 route 回 200 + ready:false / not-ready +
 *   誠實文案（不偽裝成「載入中」）。
 *
 * 重用既有邏輯（不重寫，避免兩套實作漂移）
 *   scanPayload.ts / marketBars.ts 是 TypeScript（含 `@/` 路徑別名），無法被純 Node
 *   直接 import。本工具用專案既有的 esbuild（devDependency）把兩支 lib 即時 bundle
 *   成暫存 .mjs 再動態 import —— 組裝／幾何辨識／條件運算全部沿用同一份實作，
 *   與 route 共用，保證預算結果與線上端點的欄位完全一致。
 *
 * ⚠ 上游日 K 的來源
 *   本工具**不重抓**上游日 K，而是讀 KV 已回填的 `mkt:bars:<date>`
 *   （由 scripts/backfill-market-bars.mjs 回填）。若 KV 裡的交易日不足
 *   MIN_BARS_FOR_SCAN（40 天），本工具**直接停手並回報**，絕不寫入「假裝掃過」的結果。
 *
 * ⚠ KV namespace 識別（寫錯就白做，與 backfill 工具相同）
 *     - 043f75b7beb64c8b94bafcacee2c5ee6  標題 skynet-dashboard-skynet-cache  ← 線上在用
 *     - 3bfcd44de280449e9bfee6b07d07f980  標題 SKYNET_CACHE                    ← 誘餌，非綁定
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
 *   --only=all|pattern-screen|swing-hub|cb   只算其中一項（預設 all）
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
import { writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
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
  --only=all|pattern-screen|swing-hub|cb   只算其中一項（預設 all）
  --dry-run           只計算不寫 KV（同時把 JSON 存到 --out-dir）
  --out-dir=<dir>     dry-run 的輸出目錄（預設 .scan-cache）
  --verify            寫入後讀回並比對位元組數
  --min-gap-ms=N      上游請求最小間隔毫秒（預設 400）
  --namespace-id=<id> 覆寫 KV namespace id`);
}

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
    } else if (name === '--dry-run') args.dryRun = true;
    else if (name === '--verify') args.verify = true;
    else if (name === '--help' || name === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.days) || args.days <= 0) args.days = 0;
  if (!Number.isFinite(args.minGapMs) || args.minGapMs < 0) args.minGapMs = 400;
  if (!['all', 'pattern-screen', 'swing-hub', 'cb'].includes(args.only)) args.only = 'all';
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
 * 用 esbuild 即時 bundle 一支 TS lib 成暫存 .mjs 並 import。
 * 這樣就能直接重用既有實作（組裝／幾何辨識／條件運算／日期工具），不重寫一份。
 */
async function bundleAndImport(entryRelPath) {
  const dir = await mkdtemp(join(tmpdir(), 'scan-precompute-'));
  const outfile = join(dir, `${entryRelPath.replace(/[^\w]/g, '_')}.bundle.mjs`);
  await build({
    entryPoints: [join(ROOT, 'src', 'lib', entryRelPath)],
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

  console.log('=== 全市場掃描「離線預算」工具 ===');
  console.log(`KV namespace id : ${nsId}`);
  console.log(`寫入 key        : ${wantPattern ? 'scan:pattern-screen ' : ''}${wantSwing ? 'scan:swing-hub ' : ''}${wantCb ? 'scan:cb' : ''}`);
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
  console.log('');

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
    await scan.cleanup();
    await bars.cleanup();
    process.exit(2);
  }
  const needDays = Math.max(
    wantPattern ? Math.max(patternWindowDays, MIN_BARS_FOR_SCAN) : 0,
    wantSwing ? SWING_BARS_TRADING_DAYS : 0,
  );
  const window = buildTradingDayWindow(endDate, needDays);
  if (window.length === 0) {
    console.error('✘ 視窗為空，無交易日可預算。');
    await scan.cleanup();
    await bars.cleanup();
    process.exit(2);
  }
  console.log(`視窗：${window[0]} ~ ${window[window.length - 1]}（${window.length} 個交易日）\n`);

  // 4. 列出已回填的日期；只讀已存在的 key（避免讀空氣）
  let existing = new Set();
  try {
    existing = await listExistingDates(nsId);
    console.log(`KV 既有日 K ${existing.size} 個日期。\n`);
  } catch (err) {
    console.warn(`⚠ 無法列出既有 key（將逐日嘗試讀取）：${err.message}\n`);
  }

  const missing = [];
  const days = [];
  let lastReqAt = 0;
  const throttle = async () => {
    const wait = Math.max(0, args.minGapMs - (Date.now() - lastReqAt));
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
  };

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

  // 5. 誠實底線：日數不足一律停手，絕不寫入「假裝掃過」的結果
  //    （僅影響 pattern-screen / swing-hub；cb 不依賴日 K，不受此限）
  if (wantPattern || wantSwing) {
    if (days.length < MIN_BARS_FOR_SCAN) {
      console.error(
        `✘ 日 K 僅 ${days.length} 天，不足 ${MIN_BARS_FOR_SCAN} 天，停止預算（不寫入 KV）。\n` +
          '  請先執行：node scripts/backfill-market-bars.mjs --days=120',
      );
      if (cb) await cb.cleanup();
      await scan.cleanup();
      await bars.cleanup();
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

  // 7. 寫入（或 dry-run 存檔）
  for (const { key, payload, label } of results) {
    const json = JSON.stringify(payload);
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
  if (cb) await cb.cleanup();
  await scan.cleanup();
  await bars.cleanup();
  console.log('\n=== 完成 ===');
}

main().catch(async (err) => {
  console.error(`✘ 預算失敗：${err?.stack ?? err}`);
  process.exit(1);
});
