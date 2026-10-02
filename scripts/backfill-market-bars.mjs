#!/usr/bin/env node
/**
 * scripts/backfill-market-bars.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * 【本機一次性回填工具】把最近 N 個交易日的「全市場日 K」灌進 Cloudflare KV。
 *
 * 背景
 *   /patterns（7 種型態掃描，需 60–120 天）與 /swing（波段條件，需 20–60 天）
 *   都依賴 KV 中的全市場歷史日 K（key `mkt:bars:<YYYY-MM-DD>`）。KV 初始為空，
 *   本工具負責把它填滿。
 *
 * 為什麼用 `wrangler kv key put` 而不打 ingest route？
 *   ingest route（GET /api/skynet/market-bars?action=ingest）有權杖保護，本機無
 *   token；且免費方案每 request 上限 50 subrequests，一次只能抓 ~15 交易日。
 *   本工具直接以 wrangler 寫 KV，繞過兩者，並在本地端控制對上游的節流。
 *
 * 重用既有邏輯（不重寫，避免兩套實作漂移）
 *   marketBars.ts 是 TypeScript（含 `@/` 路徑別名），無法被純 Node 直接 import。
 *   本工具用專案既有的 esbuild（devDependency）把 src/lib/marketBars.ts 即時 bundle
 *   成暫存 .mjs 再動態 import —— 抓取／正規化／壓縮／日期工具全部沿用同一份實作。
 *
 * ⚠ KV namespace 識別（極重要，寫錯就白做）
 *   本帳號下只有「一個」namespace：
 *     - 043f75b7beb64c8b94bafcacee2c5ee6  標題 god-dashboard-cache  ← 線上在用
 *   2026-10-02：標題由 skynet-dashboard-skynet-cache 更名；空的誘餌 3bfcd44d…（SKYNET_CACHE）已刪除。
 *   ⚠ wrangler.toml 必須寫死 `id`（**不是** `namespace_id`），否則 wrangler 會自動新建一個
 *   空 namespace，服務便讀不到資料（2026-10-02 實際踩到）。已用線上 /api/skynet/god/latest-date
 *   讀到 `god:latest-date` 反證：線上是 043f75b7…。故本工具預設寫入 043f75b7…。
 *   可用 --namespace-id= 或環境變數 SKYNET_KV_NAMESPACE_ID 覆寫。
 *
 * ⚠ 所有 wrangler KV 指令都必須帶 --remote
 *   wrangler 4.107 的 `kv key list/put/get` 預設對「本機」儲存操作（曾實測
 *   `kv key list` 回 [] 但線上其實有 key）。本工具一律加 --remote。
 *
 * 用法
 *   node scripts/backfill-market-bars.mjs [--days=120] [--to=YYYYMMDD] [--force]
 *                                         [--verify] [--dry-run] [--min-gap-ms=400]
 *                                         [--namespace-id=<id>]
 *
 * 參數
 *   --days=N        回填最近 N 個交易日（預設 120）。
 *   --to=YYYYMMDD   視窗結束日（預設今天，台北時區；非交易日會自動往前找）。
 *   --force         已存在的 key 也覆寫（預設跳過，避免浪費 KV 寫入額度）。
 *   --verify        每次寫入後以 `kv key get` 讀回並比對（試跑時建議開啟）。
 *   --dry-run       只抓取與組裝，不寫 KV（驗證抓取流程）。
 *   --min-gap-ms=N  兩次上游請求的最小間隔毫秒（預設 400，公家機關請勿爆打）。
 *   --namespace-id  覆寫 KV namespace id。
 *
 * 行為
 *   - 序列執行（單一併發），每次上游請求間隔 ≥ --min-gap-ms。
 *   - 每日印一行（日期 + TWSE 筆數 + TPEX 筆數 + 狀態），最後彙總。
 *   - 非交易日 / 上游無資料 → 標記跳過（不假裝成功）。
 *   - 未登入 wrangler / 找不到 namespace → 立即停手並回報，不瞎試。
 *
 * 依賴：esbuild（專案 devDependency）+ wrangler（專案 devDependency）。
 */

import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler');

/** KV TTL：180 天（與 src/lib/marketBars.ts 的 MARKET_BARS_KV_TTL_SECONDS 一致）。 */
const KV_TTL_SECONDS = 180 * 24 * 60 * 60;
/** KV key 前綴（與 src/lib/marketBars.ts 的 MARKET_BARS_KV_PREFIX 一致）。 */
const KEY_PREFIX = 'mkt:bars:';

/** 線上實際綁定的 namespace id（見檔首「KV namespace 識別」）。 */
const DEFAULT_NAMESPACE_ID = '043f75b7beb64c8b94bafcacee2c5ee6';

/** 命令緩衝上限：單日 payload ~600KB，讀回驗證要留足空間。 */
const MAX_BUFFER = 128 * 1024 * 1024;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`用法：node scripts/backfill-market-bars.mjs [選項]

  --days=N        回填最近 N 個交易日（預設 120）
  --to=YYYYMMDD   視窗結束日（預設今天，台北時區）
  --force         已存在的 key 也覆寫（預設跳過）
  --verify        每次寫入後讀回比對
  --dry-run       只抓取組裝，不寫 KV
  --min-gap-ms=N  上游請求最小間隔毫秒（預設 400）
  --retries=N     單邊無資料時的重試次數（預設 2；用於對抗上游間歇性限流）
  --namespace-id  覆寫 KV namespace id`);
}

function parseArgs(argv) {
  const args = {
    days: 120,
    to: '',
    force: false,
    verify: false,
    dryRun: false,
    minGapMs: 400,
    retries: 2,
    namespaceId: '',
  };
  // 同時支援 `--flag=value` 與 `--flag value` 兩種寫法（用法說明用等號形式，
  // 若只認空白形式會靜默忽略 --days=3 而誤跑預設 120 天）。
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
    } else if (name === '--min-gap-ms') {
      const { value, next } = readValue(raw, i);
      args.minGapMs = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--retries') {
      const { value, next } = readValue(raw, i);
      args.retries = Number.parseInt(value, 10);
      i = next;
    } else if (name === '--namespace-id') {
      const { value, next } = readValue(raw, i);
      args.namespaceId = value;
      i = next;
    } else if (name === '--force') args.force = true;
    else if (name === '--verify') args.verify = true;
    else if (name === '--dry-run') args.dryRun = true;
    else if (name === '--help' || name === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.days) || args.days <= 0) args.days = 120;
  if (!Number.isFinite(args.minGapMs) || args.minGapMs < 0) args.minGapMs = 400;
  if (!Number.isFinite(args.retries) || args.retries < 0) args.retries = 2;
  return args;
}

/** 執行 wrangler 子命令（統一路徑與 cwd）。回傳 { stdout, stderr }（分開，避免污染值）。 */
async function wrangler(subArgs) {
  const { stdout, stderr } = await execFileAsync(WRANGLER_BIN, subArgs, {
    cwd: ROOT,
    maxBuffer: MAX_BUFFER,
  });
  return { stdout, stderr };
}

/** 前置檢查：wrangler 是否已登入。未登入直接拋錯（呼叫端停手回報）。 */
async function assertLoggedIn() {
  const { stdout, stderr } = await wrangler(['whoami']);
  const out = `${stdout}${stderr}`;
  if (!/You are logged in/i.test(out)) {
    throw new Error(
      'wrangler 未登入。請先執行 `npx wrangler login`（或設定 CLOUDFLARE_API_TOKEN）後再跑本工具。',
    );
  }
  const email = /associated with the email (\S+)/i.exec(out)?.[1] ?? '(未知)';
  return email;
}

/**
 * 解析 wrangler 輸出中的 JSON 陣列。
 * ⚠ 不能只取「第一個 [」：wrangler 的警告訊息含 `[WARNING]`，會被誤判為陣列開頭。
 * 故改為掃描每個「行首的 [」，取第一個能成功 JSON.parse 到結尾 ] 的候選。
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
    if (k && typeof k.name === 'string' && k.name.startsWith(KEY_PREFIX)) {
      dates.add(k.name.slice(KEY_PREFIX.length));
    }
  }
  return dates;
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
    String(KV_TTL_SECONDS),
  ]);
}

/** 讀回單一 key（--remote）。⚠ 只取 stdout（值在 stdout，警告在 stderr）。 */
async function getKey(nsId, key) {
  const { stdout } = await wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']);
  return stdout;
}

/**
 * 用 esbuild 把 src/lib/marketBars.ts 即時 bundle 成暫存 .mjs 並 import。
 * 這樣就能直接重用既有實作（抓取／正規化／壓縮／日期工具），不重寫一份。
 */
async function loadMarketBarsLib() {
  const dir = await mkdtemp(join(tmpdir(), 'mkt-bars-'));
  const outfile = join(dir, 'marketBars.bundle.mjs');
  await build({
    entryPoints: [join(ROOT, 'src', 'lib', 'marketBars.ts')],
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

  console.log('=== 全市場日 K 回填工具 ===');
  console.log(`KV namespace id : ${nsId}`);
  console.log(`KV key 前綴      : ${KEY_PREFIX}`);
  console.log(`TTL             : ${KV_TTL_SECONDS}s（180 天）`);
  console.log(`目標交易日數     : ${args.days}${args.to ? `（至 ${args.to}）` : ''}`);
  console.log(`模式            : ${args.dryRun ? 'DRY-RUN（不寫入）' : args.force ? '覆寫' : '跳過已存在'}`);
  console.log('');

  // 1. 前置檢查：登入
  let email;
  try {
    email = await assertLoggedIn();
  } catch (err) {
    console.error(`✘ 前置檢查失敗：${err.message}`);
    process.exit(2);
  }
  console.log(`✔ wrangler 已登入：${email}`);

  // 2. 載入既有實作（esbuild bundle）
  const { mod: lib, cleanup } = await loadMarketBarsLib();
  console.log('✔ 已載入 src/lib/marketBars.ts（esbuild bundle）\n');

  const {
    buildStoredDay,
    buildTradingDayWindow,
    fetchTpexDay,
    fetchTwseDay,
    isTradingDay,
    marketBarKey,
    parseYmdToDate,
    todayTaipeiYmd,
  } = lib;

  // 3. 決定視窗
  const endDate = args.to ? parseYmdToDate(args.to) : parseYmdToDate(todayTaipeiYmd());
  if (!endDate) {
    console.error(`✘ --to 格式錯誤：${args.to}`);
    await cleanup();
    process.exit(2);
  }
  const window = buildTradingDayWindow(endDate, args.days);
  if (window.length === 0) {
    console.error('✘ 視窗為空，無交易日可回填。');
    await cleanup();
    process.exit(2);
  }
  console.log(`視窗：${window[0]} ~ ${window[window.length - 1]}（${window.length} 個交易日）\n`);

  // 4. 列出已存在日期（跳過用）
  let existing = new Set();
  if (!args.dryRun) {
    try {
      existing = await listExistingDates(nsId);
      console.log(`KV 既有 ${existing.size} 個日期。\n`);
    } catch (err) {
      console.warn(`⚠ 無法列出既有 key（將不跳過）：${err.message}\n`);
    }
  }

  // 5. 逐日處理（序列 + 節流）
  const tmpDir = await mkdtemp(join(tmpdir(), 'mkt-bars-val-'));
  let lastReqAt = 0;
  const throttle = async () => {
    const wait = Math.max(0, args.minGapMs - (Date.now() - lastReqAt));
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
  };

  const summary = { stored: 0, skipped: 0, noData: 0, partial: 0, failed: 0 };
  const startedAt = Date.now();

  for (const ymd of window) {
    const key = marketBarKey(ymd);

    if (!args.force && existing.has(ymd)) {
      console.log(`↷ ${ymd}  跳過（已存在）`);
      summary.skipped += 1;
      continue;
    }

    const date = parseYmdToDate(ymd);
    if (!date || !isTradingDay(date)) {
      console.log(`↷ ${ymd}  跳過（非交易日）`);
      summary.skipped += 1;
      continue;
    }

    // 抓取 TWSE + TPEX；若只有一邊成功（另一邊疑似被上游間歇性限流），
    // 針對失敗那側重試（--retries 次），避免把「被限流的空資料」誤存成真資料。
    // 兩邊都空 → 很可能是真休市日，不重試（省上游請求）。
    const fetchSide = async (fn) => {
      try {
        await throttle();
        return await fn(date);
      } catch {
        return null;
      }
    };
    let twse = await fetchSide(fetchTwseDay);
    let tpex = await fetchSide(fetchTpexDay);
    // 只要不是「兩邊都拿到」就重試（涵蓋單邊限流與雙邊同時被限流）；
    // 真休市日會在重試耗盡後被判為 noData（多花幾次請求，換取不因限流漏資料）。
    for (let r = 0; r < args.retries && !(twse && tpex); r += 1) {
      await sleep(1500);
      if (!twse) twse = await fetchSide(fetchTwseDay);
      if (!tpex) tpex = await fetchSide(fetchTpexDay);
    }

    if (!twse && !tpex) {
      console.log(`⚠ ${ymd}  上游無資料（可能為未收錄之休市日）`);
      summary.noData += 1;
      continue;
    }
    if (!twse || !tpex) {
      // 重試後仍單邊無資料：仍寫入（有資料那側是真的），但明確標記，不假裝完整。
      console.log(
        `⚠ ${ymd}  單邊無資料（TWSE=${twse ? 'ok' : '空'}、TPEX=${tpex ? 'ok' : '空'}）——重試 ${args.retries} 次後仍缺`,
      );
      summary.partial += 1;
    }

    const tradeDate = twse?.tradeDate ?? tpex?.tradeDate ?? ymd;
    const payload = buildStoredDay(tradeDate, twse?.bars ?? [], tpex?.bars ?? [], {
      twse: twse?.rawCount ?? 0,
      tpex: tpex?.rawCount ?? 0,
    });
    const json = JSON.stringify(payload);
    const bytes = Buffer.byteLength(json, 'utf8');
    const countLabel = `TWSE ${payload.counts.twse} 筆 + TPEX ${payload.counts.tpex} 筆（${(bytes / 1024).toFixed(0)} KB）`;

    if (args.dryRun) {
      console.log(`○ ${tradeDate}  DRY-RUN ${countLabel}`);
      summary.stored += 1;
      continue;
    }

    const valuePath = join(tmpDir, `${tradeDate}.json`);
    try {
      await writeFile(valuePath, json, 'utf8');
      await putKey(nsId, key, valuePath);

      let verifyNote = '';
      if (args.verify) {
        const readBack = (await getKey(nsId, key)).trim();
        const sameBytes = Buffer.byteLength(readBack, 'utf8') === bytes;
        const parsed = JSON.parse(readBack);
        const sameCounts =
          parsed.counts?.twse === payload.counts.twse && parsed.counts?.tpex === payload.counts.tpex;
        verifyNote = sameBytes && sameCounts ? '｜讀回驗證 ✔' : `｜讀回驗證 ✘（bytes=${sameBytes} counts=${sameCounts}）`;
        if (!sameBytes || !sameCounts) {
          console.log(`✘ ${tradeDate}  寫入後讀回不一致${verifyNote}`);
          summary.failed += 1;
          continue;
        }
      }

      console.log(`✔ ${tradeDate}  ${countLabel}${verifyNote}`);
      summary.stored += 1;
      existing.add(tradeDate);
    } catch (err) {
      console.log(`✘ ${tradeDate}  寫入失敗：${err.message}`);
      summary.failed += 1;
    }
  }

  await cleanup();
  await rm(tmpDir, { recursive: true, force: true });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const perDay = (Number(elapsed) / window.length).toFixed(2);
  console.log('\n=== 彙總 ===');
  console.log(`成功寫入：${summary.stored}`);
  console.log(`跳過    ：${summary.skipped}（已存在或非交易日）`);
  console.log(`無資料  ：${summary.noData}`);
  console.log(`單邊缺  ：${summary.partial}（重試後仍只有 TWSE 或 TPEX 一邊有資料）`);
  console.log(`失敗    ：${summary.failed}`);
  console.log(`耗時    ：${elapsed}s（平均 ${perDay}s/日）`);

  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
