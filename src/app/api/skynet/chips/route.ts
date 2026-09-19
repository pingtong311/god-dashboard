/**
 * 籌碼研究資料代理
 * GET /api/skynet/chips?ticker=2330&days=60
 *
 * 複刻「股市大佬 TradeBoss」的籌碼研究資料層，僅使用**公開資料源**：
 * 1. 三大法人歷史  → TWSE rwd T86（逐交易日）
 * 2. 融資融券歷史  → TWSE rwd MI_MARGN（逐交易日）
 * 3. 集保戶股權分散 → TDCC opendata getOD.ashx?id=1-5（CSV）
 *
 * 設計原則：
 * - 抓不到的日期**直接跳過**，不補 0（避免產生假資料）。
 * - 分點明細與關鍵大股東**無公開資料源**，本 route 不提供、也不捏造。
 * - 併發上限 4、單次 fetch 逾時 8 秒、整支 API 總預算 25 秒；逾時回已抓到的部分。
 */

import { NextRequest, NextResponse } from 'next/server';

// ── 常數 ────────────────────────────────────────────────

const TWSE_BASE = 'https://www.twse.com.tw/rwd/zh';
const TDCC_ENDPOINT = 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-5';

/** 單次 fetch 逾時（毫秒）。 */
const FETCH_TIMEOUT_MS = 8_000;
/** 整支 API 總預算（毫秒）；超過就回已抓到的部分。 */
const TOTAL_BUDGET_MS = 25_000;
/** 對外請求併發上限。 */
const CONCURRENCY = 4;
/** days 參數允許範圍。 */
const MIN_DAYS = 5;
const MAX_DAYS = 240;

/**
 * TWSE rwd 端點需要「像瀏覽器」的請求標頭；缺少 Referer／標準 UA 時，
 * 連續請求會被回 428（Precondition Required，實測為限流保護）。
 */
const TWSE_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.twse.com.tw/zh/trading/foreign/t86.html',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

/** TDCC 端點請求標頭。 */
const TDCC_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

/** 限流退避延遲（毫秒）。 */
const RETRY_BACKOFF_MS = 900;
/** 最多重試次數（含首次）。 */
const MAX_ATTEMPTS = 3;

/** 非同步延遲。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 型別 ────────────────────────────────────────────────

/** 三大法人單日淨買賣超（單位：張）。 */
export interface ChipsInstitutionalRow {
  date: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
}

/** 融資融券單日餘額（單位：張；資券比為倍數）。 */
export interface ChipsMarginRow {
  date: string;
  marginBalance: number;
  shortBalance: number;
  marginRatio: number | null;
}

/** 集保級距（已合併為 5 個區間）。 */
export interface ChipsTdccRow {
  level: string;
  holders: number;
  lots: number;
  pct: number;
}

/** /api/skynet/chips 回應。 */
export interface ChipsResponse {
  ticker: string;
  name: string;
  tradeDate: string;
  institutionalHistory: ChipsInstitutionalRow[];
  marginHistory: ChipsMarginRow[];
  tdcc: ChipsTdccRow[] | null;
  concentration: number | null;
  fetchedAt: string;
}

// ── 小工具 ──────────────────────────────────────────────

/** 併發限制器：確保同時最多 `limit` 個任務在跑。 */
function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => queue.push(resolve));
  };

  const release = (): void => {
    const next = queue.shift();
    if (next) next(); // 直接交棒，active 不變
    else active -= 1;
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** 數字解析：容忍千分位逗號、空白、'-'。 */
function parseNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/,/g, '').replace(/\s/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Date → TWSE 日期格式 YYYYMMDD。 */
function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** TWSE 日期格式 YYYYMMDD → ISO YYYY-MM-DD。 */
function twseDateToIso(twseDate: string): string {
  if (!/^\d{8}$/.test(twseDate)) return twseDate;
  return `${twseDate.slice(0, 4)}-${twseDate.slice(4, 6)}-${twseDate.slice(6, 8)}`;
}

/** 產生最近 `count` 個「可能的」交易日（跳過週六日，由新到舊）。 */
function candidateTradingDates(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (dates.length < count && guard < count * 3 + 30) {
    guard += 1;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dates.push(formatTwseDate(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

// ── GET Handler ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawTicker = (searchParams.get('ticker') || '').trim().toUpperCase();
  const daysParam = Number(searchParams.get('days') || '60');
  const days = Number.isFinite(daysParam)
    ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(daysParam)))
    : 60;

  // 驗證：台股 4~6 位數字（可帶一個字母後綴，如 00632R）
  if (!/^\d{4,6}[A-Z]?$/.test(rawTicker)) {
    return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  }

  const ticker = rawTicker;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const limiter = createLimiter(CONCURRENCY);

  /** 是否仍有時間預算。 */
  const hasBudget = (reserveMs = 0): boolean => Date.now() + reserveMs < deadline;

  /**
   * 全域冷卻閘門：TWSE 連續請求會被限流（HTTP 428）。
   * 一旦遇到限流，就讓「所有」後續請求一起等待，避免退避期間仍持續打上游。
   */
  let cooldownUntil = 0;
  async function respectCooldown(): Promise<void> {
    const wait = cooldownUntil - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 2_000));
  }

  /** 具併發限制與逾時的 JSON 抓取；失敗一律回 null。遇限流（428/429/5xx）冷卻後重試。 */
  async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
    if (!hasBudget()) return null;
    return limiter(async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (!hasBudget()) return null;
        await respectCooldown();
        if (!hasBudget()) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: TWSE_HEADERS,
          });
          if (res.ok) {
            return (await res.json()) as Record<string, unknown>;
          }
          const retriable = res.status === 428 || res.status === 429 || res.status >= 500;
          if (retriable && attempt < MAX_ATTEMPTS - 1) {
            cooldownUntil = Math.max(cooldownUntil, Date.now() + RETRY_BACKOFF_MS);
            continue;
          }
          return null;
        } catch {
          return null;
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    });
  }

  /** 具逾時的純文字抓取（TDCC 用；不佔 TWSE 併發額度）。 */
  async function fetchTdccText(ymd: string): Promise<string | null> {
    if (!hasBudget(1_500)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(TDCC_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        headers: TDCC_HEADERS,
        body: `date=${ymd}`,
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text && text.trim().length > 0 ? text : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // 名稱（從 T86 / MI_MARGN 回傳列順手取得；取不到就留空由前端補）
  let resolvedName = '';

  /** 單日 T86 三大法人（股 → 張）。 */
  async function fetchInstitutionalDay(ymd: string): Promise<ChipsInstitutionalRow | null> {
    const data = await fetchJson(
      `${TWSE_BASE}/fund/T86?response=json&date=${ymd}&selectType=ALLBUT0999`
    );
    if (!data || data.stat !== 'OK' || !Array.isArray(data.data)) return null;
    const rows = data.data as string[][];
    const row = rows.find((r) => String(r[0] ?? '').trim() === ticker);
    if (!row) return null;
    if (!resolvedName) {
      const nm = String(row[1] ?? '').trim();
      if (nm) resolvedName = nm;
    }
    const toLots = (value: unknown): number => Math.round(parseNum(value) / 1000);
    return {
      date: twseDateToIso(ymd),
      foreignNet: toLots(row[4]), // 外陸資買賣超股數
      trustNet: toLots(row[10]), // 投信買賣超股數
      dealerNet: toLots(row[14]), // 自營商買賣超股數（自行買賣）
      totalNet: toLots(row[18]), // 三大法人買賣超股數合計
    };
  }

  /** 單日 MI_MARGN 融資融券餘額（張）。 */
  async function fetchMarginDay(ymd: string): Promise<ChipsMarginRow | null> {
    const data = await fetchJson(
      `${TWSE_BASE}/marginTrading/MI_MARGN?response=json&date=${ymd}&selectType=STOCK`
    );
    if (!data || data.stat !== 'OK' || !Array.isArray(data.tables)) return null;
    const tables = data.tables as Array<{ fields?: string[]; data?: string[][] }>;

    for (const table of tables) {
      const fields = Array.isArray(table.fields) ? table.fields : [];
      const codeIdx = fields.findIndex((f) => String(f).includes('代號'));
      if (codeIdx < 0) continue;
      const rows = Array.isArray(table.data) ? table.data : [];
      const row = rows.find((r) => String(r[codeIdx] ?? '').trim() === ticker);
      if (!row) continue;

      if (!resolvedName) {
        const nameIdx = fields.findIndex((f) => String(f).includes('名稱'));
        const nm = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
        if (nm) resolvedName = nm;
      }

      // 「今日餘額」會出現兩次：先融資、後融券。
      const todayIdx = fields
        .map((f, i) => (String(f).includes('今日餘額') ? i : -1))
        .filter((i) => i >= 0);
      const marginIdx = todayIdx.length >= 1 ? todayIdx[0] : 6;
      const shortIdx = todayIdx.length >= 2 ? todayIdx[1] : 12;

      const marginBalance = parseNum(row[marginIdx]);
      const shortBalance = parseNum(row[shortIdx]);
      return {
        date: twseDateToIso(ymd),
        marginBalance,
        shortBalance,
        marginRatio: shortBalance > 0 ? Number((marginBalance / shortBalance).toFixed(2)) : null,
      };
    }
    return null;
  }

  // ── 集保級距（TDCC） ──────────────────────────────────

  /** TDCC CSV → 合併為 5 個級距；查無資料回 null。 */
  function parseTdccCsv(text: string): { rows: ChipsTdccRow[]; concentration: number } | null {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    if (lines.length < 2) return null;

    let start = 0;
    if (/^sep=/i.test(lines[0])) start = 1;
    const header = lines[start].split(',').map((h) => h.trim());

    const idxCode = header.findIndex((h) => h.includes('證券代號'));
    const idxLevel = header.findIndex((h) => h.includes('持股分級'));
    const idxHolders = header.findIndex((h) => h.includes('人數'));
    const idxShares = header.findIndex((h) => h.includes('股數'));
    const idxPct = header.findIndex((h) => h.includes('比例'));
    if ([idxCode, idxLevel, idxHolders, idxShares, idxPct].some((i) => i < 0)) return null;

    const byLevel = new Map<number, { holders: number; shares: number; pct: number }>();
    let found = false;

    for (let i = start + 1; i < lines.length; i += 1) {
      const cols = lines[i].split(',');
      if (String(cols[idxCode] ?? '').trim() !== ticker) continue;
      found = true;
      const level = parseInt(String(cols[idxLevel] ?? '').trim(), 10);
      if (!Number.isFinite(level)) continue;
      const current = byLevel.get(level) ?? { holders: 0, shares: 0, pct: 0 };
      current.holders += parseNum(cols[idxHolders]);
      current.shares += parseNum(cols[idxShares]);
      current.pct += parseNum(cols[idxPct]);
      byLevel.set(level, current);
    }

    if (!found) return null;

    // TDCC 15 級 → 合併為博主文案的 5 個區間（1 張 = 1000 股）
    const buckets: Array<{ label: string; levels: number[] }> = [
      { label: '1張以下', levels: [1] },
      { label: '1-10張', levels: [2, 3] },
      { label: '10-100張', levels: [4, 5, 6, 7, 8, 9] },
      { label: '100-1000張', levels: [10, 11, 12, 13, 14] },
      { label: '1000張以上', levels: [15] },
    ];

    const rows: ChipsTdccRow[] = buckets.map((bucket) => {
      let holders = 0;
      let shares = 0;
      let pct = 0;
      for (const level of bucket.levels) {
        const item = byLevel.get(level);
        if (!item) continue;
        holders += item.holders;
        shares += item.shares;
        pct += item.pct;
      }
      return {
        level: bucket.label,
        holders,
        lots: Math.round(shares / 1000),
        pct: Number(pct.toFixed(2)),
      };
    });

    const thousandPlus = rows.find((r) => r.level === '1000張以上');
    const concentration = thousandPlus ? Number((thousandPlus.pct / 100).toFixed(4)) : null;

    return { rows, concentration: concentration ?? 0 };
  }

  async function fetchTdcc(): Promise<{ rows: ChipsTdccRow[]; concentration: number } | null> {
    for (let offset = 0; offset < 10; offset += 1) {
      if (!hasBudget(1_500)) break;
      const ymd = formatTwseDate(new Date(Date.now() - offset * 24 * 60 * 60 * 1000));
      const text = await fetchTdccText(ymd);
      if (!text) continue;
      const parsed = parseTdccCsv(text);
      if (parsed) return parsed;
    }
    return null;
  }

  // ── 主流程 ────────────────────────────────────────────

  try {
    const candidateDates = candidateTradingDates(days); // 新 → 舊

    const [institutionalSettled, marginSettled, tdccSettled] = await Promise.allSettled([
      Promise.all(candidateDates.map((ymd) => fetchInstitutionalDay(ymd))),
      Promise.all(candidateDates.map((ymd) => fetchMarginDay(ymd))),
      fetchTdcc(),
    ]);

    const institutionalHistory: ChipsInstitutionalRow[] =
      institutionalSettled.status === 'fulfilled'
        ? institutionalSettled.value.filter((row): row is ChipsInstitutionalRow => row !== null)
        : [];

    const marginHistory: ChipsMarginRow[] =
      marginSettled.status === 'fulfilled'
        ? marginSettled.value.filter((row): row is ChipsMarginRow => row !== null)
        : [];

    const tdccResult = tdccSettled.status === 'fulfilled' ? tdccSettled.value : null;

    // 舊 → 新（圖表左到右）
    institutionalHistory.sort((a, b) => a.date.localeCompare(b.date));
    marginHistory.sort((a, b) => a.date.localeCompare(b.date));

    const tradeDate =
      institutionalHistory[institutionalHistory.length - 1]?.date ||
      marginHistory[marginHistory.length - 1]?.date ||
      '';

    // 三個資料源全失敗才視為上游錯誤
    if (
      institutionalHistory.length === 0 &&
      marginHistory.length === 0 &&
      tdccResult === null
    ) {
      return NextResponse.json({ error: 'chips_upstream_error' }, { status: 502 });
    }

    const payload: ChipsResponse = {
      ticker,
      name: resolvedName,
      tradeDate,
      institutionalHistory,
      marginHistory,
      tdcc: tdccResult ? tdccResult.rows : null,
      concentration: tdccResult ? tdccResult.concentration : null,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=600' },
    });
  } catch {
    return NextResponse.json({ error: 'chips_fetch_error' }, { status: 500 });
  }
}
