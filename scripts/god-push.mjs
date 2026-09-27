#!/usr/bin/env node
/**
 * scripts/god-push.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * 【給 GOD 辦公室（華爾街峰子）團隊使用的參考推送腳本】
 *
 * 用途
 *   把 GOD 辦公室在本機產出的標準化 JSON（例如 data/api/app/*.json）主動 POST
 *   推送到「峰子 App」的 ingest 端點；App 會存進 Cloudflare KV，供頁面讀取。
 *
 * 為什麼需要這支腳本？（方案 B）
 *   峰子 App 部署在 Cloudflare 邊緣（公網），GOD 辦公室在本機（127.0.0.1），
 *   兩者無法直接互通。方案 B：由 GOD 側「主動 POST 推」資料到 App。
 *   App 不把 Cloudflare KV 憑證交給 GOD 側，而是提供一個「帶 token 的 ingest 端點」；
 *   GOD 側只需一個 HTTP POST，完全不需要 Cloudflare 帳號權限。
 *
 * 用法
 *   node scripts/god-push.mjs --dir <GOD資料目錄> --url <App網址> --token <token>
 *
 * 範例（正式站）
 *   node scripts/god-push.mjs \
 *     --dir /path/to/FengTeam/data/api/app \
 *     --url https://skynet-dashboard.xpornky1122.workers.dev \
 *     --token "$SKYNET_DASHBOARD_API_TOKEN"
 *
 * 參數
 *   --dir    必填。GOD 辦公室產出 JSON 的目錄（例如 data/api/app）。
 *   --url    必填。峰子 App 的網址。
 *            正式站：https://skynet-dashboard.xpornky1122.workers.dev
 *   --token  必填。等同峰子 App 的環境變數 SKYNET_DASHBOARD_API_TOKEN。
 *            建議用環境變數傳入（--token "$SKYNET_DASHBOARD_API_TOKEN"），
 *            不要把 token 寫死在腳本或版控裡。
 *
 * endpoint 推斷規則（由檔名）
 *   dashboard.json                  → dashboard
 *   radar.json                      → radar
 *   latest-date.json                → latest-date
 *   sector-sniper.json              → sector-sniper
 *   daily-highlights_20260926.json  → daily-highlights
 *   warroom-boards.json             → warroom-boards
 *   （即：去掉 .json 副檔名後，取底線前的第一段）
 *
 * 行為
 *   - 逐檔 POST 到 `${url}/api/skynet/god/ingest`。
 *   - 每個檔案的成功／失敗都會印出；「單檔失敗不會中斷其他檔」。
 *   - 全部處理完後印出總結；若有任何失敗，以非 0 結束碼退出（方便 CI／排程偵測）。
 *
 * 依賴
 *   零依賴。需要 Node 18+（使用內建全域 fetch）。
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

/** 與 App 端 src/lib/godBridge.ts 的 GOD_ENDPOINTS 保持一致（單一真相來源仍以 App 為準）。 */
const KNOWN_ENDPOINTS = [
  'latest-date',
  'dashboard',
  'radar',
  'sector-sniper',
  'daily-highlights',
  'warroom-boards',
];

/**
 * 解析命令列參數。
 * @param {string[]} argv 參數陣列（不含 node 與腳本路徑）
 * @returns {{ dir: string, url: string, token: string }}
 */
function parseArgs(argv) {
  const args = { dir: '', url: '', token: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dir') args.dir = argv[i + 1] ?? '';
    else if (flag === '--url') args.url = argv[i + 1] ?? '';
    else if (flag === '--token') args.token = argv[i + 1] ?? '';
  }
  return args;
}

/**
 * 由檔名推斷 endpoint。
 * @param {string} filename 例如 'daily-highlights_20260926.json'
 * @returns {string} 例如 'daily-highlights'
 */
function endpointFromFilename(filename) {
  const withoutExt = basename(filename, extname(filename));
  return withoutExt.split('_')[0];
}

/**
 * 將單一檔案讀取、組裝成 ingest body 並 POST。
 * 任何錯誤都在此被捕捉（由呼叫端計數），確保不中斷其他檔案。
 * @param {string} dir 目錄
 * @param {string} file 檔名
 * @param {string} ingestUrl ingest 端點 URL
 * @param {string} token 寫入 token
 * @returns {Promise<boolean>} 是否成功
 */
async function pushOne(dir, file, ingestUrl, token) {
  const endpoint = endpointFromFilename(file);
  const fullPath = join(dir, file);

  try {
    if (!KNOWN_ENDPOINTS.includes(endpoint)) {
      throw new Error(`無法辨識 endpoint（檔名推斷為 "${endpoint}"，不在白名單）`);
    }

    const raw = await readFile(fullPath, 'utf8');
    const parsed = JSON.parse(raw);

    // GOD 辦公室產出即為信封格式；若已是信封則取 payload，否則整包當 payload。
    const body = {
      schema_version: typeof parsed.schema_version === 'string' ? parsed.schema_version : '1',
      endpoint,
      generated_at:
        typeof parsed.generated_at === 'string' ? parsed.generated_at : new Date().toISOString(),
      provenance: parsed.provenance,
      payload: parsed.payload !== undefined ? parsed.payload : parsed,
    };

    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (res.ok) {
      console.log(`✅ ${file} → ${endpoint}（${res.status}）`);
      return true;
    }
    console.error(`❌ ${file} → ${endpoint}（${res.status}）：${text.slice(0, 300)}`);
    return false;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`❌ ${file}：${message}`);
    return false;
  }
}

async function main() {
  const { dir, url, token } = parseArgs(process.argv.slice(2));

  if (!dir || !url || !token) {
    console.error(
      '用法：node scripts/god-push.mjs --dir <目錄> --url <App網址> --token <token>',
    );
    process.exit(2);
  }

  const base = url.replace(/\/+$/, '');
  const ingestUrl = `${base}/api/skynet/god/ingest`;

  let files;
  try {
    files = (await readdir(dir)).filter((f) => extname(f).toLowerCase() === '.json');
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`無法讀取目錄：${dir}（${message}）`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(`目錄中沒有 .json 檔：${dir}`);
    process.exit(0);
  }

  console.log(`推送 ${files.length} 個檔案到 ${ingestUrl}\n`);

  let okCount = 0;
  let failCount = 0;

  for (const file of files) {
    // 逐檔處理；pushOne 內部已捕捉所有錯誤，單檔失敗不影響後續檔案。
    // eslint-disable-next-line no-await-in-loop
    const ok = await pushOne(dir, file, ingestUrl, token);
    if (ok) okCount += 1;
    else failCount += 1;
  }

  console.log(`\n完成：成功 ${okCount}，失敗 ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
