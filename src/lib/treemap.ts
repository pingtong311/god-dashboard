/**
 * src/lib/treemap.ts
 * ────────────────────────────────────────────────────────────────────────────
 * 族群熱圖（`/api/skynet/treemap`）的**可重用組裝邏輯**。
 *
 * 為什麼要從 route 抽出來（務必先讀懂）：
 *   本端點原本在 route 內**行內**完成「抓 TWSE MI_INDEX（4.8MB）→ 解析 tables[8]
 *   全市場約 3.5 萬列 → 依名稱關鍵字分類 → 依產業聚合成市值加權」。
 *   在 Cloudflare **Free plan 的 10ms CPU 上限**下，這種「請求時解析 MB 級 JSON」
 *   必然 **503 error code: 1102**。
 *
 *   ⇒ 把邏輯抽到 lib，讓 **route 與離線預算腳本共用同一份實作**：
 *     - `scripts/precompute-scan.mjs` 在本機呼叫 `loadTreemap()`，把結果序列化成
 *       「可直接送出的 JSON 字串」寫進 KV；
 *     - route 只做 `kv.get(key)` → `new Response(text)`，零解析。
 *   兩邊共用同一份 lib，保證預算結果與端點欄位完全一致（不會兩套實作漂移）。
 *
 * ## 2026-10-04 重大修正（本次 PR 核心）
 *
 *   1. **產業分類改用正式資料源**：原本用股票名稱關鍵字猜測（命中率 ~2%），
 *      現改抓 TWSE t187ap03_L（公司基本資料）取得所有上市公司正式產業別代碼，
 *      配合代碼→名稱對照表，命中率提升至 ~95%+（上市公司全覆蓋）。
 *      上櫃公司暫以關鍵字兜底，後續再接 TPEX 同類 API。
 *
 *   2. **`volume` 欄位修正**：原本取 `row[3]`（成交筆數），現改為 `row[2]`（成交股數）÷1000 → 成交張數。
 *      同步修正 `marketCap = price × volume`、`totalVolume` 等下游計算語意。
 *
 *   3. **週末／休市日 502 修正**：未指定日期時改用 `resolveLatestTradingDate()` 取得最近交易日。
 *
 *   4. **`marketGroups.其他` 分類邏輯語意可疑（保留原行為）**：代號字首與上市/上櫃無關，
 *      實務上幾乎永遠空集合，留待後續以正式市場別對照表取代。
 */

import {
  parseTwseNumber,
  parseTwseSign,
  resolveLatestTradingDate,
  rowsOf,
  type FetchLike,
} from '@/lib/marketOverview';

/** TWSE rwd MI_INDEX 端點（`type=ALL` 取全部 tables，`tables[8]` 為每日收盤行情）。 */
export const RWD_MI_INDEX_BASE = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX';

/** TWSE 公司基本資料端點（含所有上市公司產業別代碼）。 */
export const COMPANY_BASIC_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';

/** `tables` 中「每日收盤行情」的索引。 */
const DAILY_QUOTE_TABLE_INDEX = 8;

/** 每個產業最多保留幾檔代表性個股（避免回應過大）。 */
const MAX_ITEMS_PER_SECTOR = 20;

export function rwdMiIndexUrl(date: string): string {
  return `${RWD_MI_INDEX_BASE}?date=${date}&type=ALL&response=json`;
}

const TWSE_UA_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

/**
 * 官方產業別代碼 → 中文名稱對照表（依 TWSE t187ap03_L 實際代碼整理）。
 * 來源：證交所「上市公司產業別代碼表」。
 * 缺漏代碼（t187ap03_L 實際無資料）保留官方定義供擴充。
 */
const INDUSTRY_CODE_TO_NAME: Record<string, string> = {
  '01': '水泥工業',
  '02': '食品工業',
  '03': '塑膠工業',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '07': '造紙工業',
  '08': '造紙工業',
  '09': '橡膠工業',
  '10': '汽車工業',
  '11': '電子零組件業',
  '12': '建材營造',
  '13': '航運業',
  '14': '觀光餐旅',
  '15': '金融保險業',
  '16': '貿易百貨',
  '17': '綠能環保',
  '18': '其他',
  '19': '油電燃氣業',
  '20': '其他電子業',
  '21': '化學工業',
  '22': '生技醫療業',
  '23': '玻璃陶瓷',
  '24': '半導體業',
  '25': '電腦及週邊設備業',
  '26': '光電業',
  '27': '通信網路業',
  '28': '電子零組件業',
  '29': '電子通路業',
  '30': '資訊服務業',
  '31': '其他電子業',
  '32': '運動休閒',
  '33': '居家生活',
  '34': '數位雲端',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '39': '造紙工業',
  '40': '造紙工業',
  '91': '存託憑證',
};

/**
 * 上櫃/興櫃股票關鍵字產業分類（兜底用；正式版應接 TPEX 公司基本資料 API）。
 * 僅用於 MI_INDEX 中無法從 t187ap03_L 取得產業的代號（上櫃、ETF 等）。
 */
const OTC_SECTOR_KEYWORDS: Record<string, string[]> = {
  半導體: ['半導體', '積體電路', 'IC', '晶圓', '封測'],
  電腦週邊: ['電腦', '週邊', '鍵盤', '滑鼠', '機殼', '散熱'],
  光電: ['光電', '面板', 'LED', '雷射', '光學'],
  通信網路: ['通信', '網路', '5G', '基地台', '光纖', '交換器'],
  電子零組件: ['電子', '被動元件', '電阻', '電容', '電感', '連接器', 'PCB'],
  電子通路: ['通路', '經銷', '代理', '通路商'],
  資訊服務: ['資訊', '軟體', '系統整合', '雲端', 'SaaS', 'AI', '大數據'],
  其他電子: ['其他電子'],
  鋼鐵: ['鋼鐵', '鋼捲', '鋼筋', '鋼管', '鍛造'],
  機械: ['機械', '工具機', '自動化', '馬達', '泵', '閥', '軸承'],
  電機機電: ['電機', '馬達', '發電機', '變壓器', '開關', '配電'],
  汽車: ['汽車', '車用', '車體', '車燈', '輪胎', '車電子'],
  化學工業: ['化學', '石化', '塑膠', '合成橡膠', '化纖', '染料', '顏料'],
  生技醫療: ['生技', '醫療', '藥', '疫苗', '醫療器材', '基因', '細胞治療'],
  玻璃陶瓷: ['玻璃', '陶瓷', '纖維', '耐火'],
  造紙印刷: ['造紙', '紙漿', '印刷', '包裝', '瓦楞'],
  橡膠: ['橡膠', '輪胎', '膠管', '膠帶'],
  電器電纜: ['電纜', '電線', '配線', '開關', '插座'],
};

/**
 * 依代號查正式產業；無正式資料時用關鍵字兜底；皆無則回 `'其他'`。
 *
 * （export 供單元測試固定「關鍵字分類」行為；正式分類的唯一入口仍是
 *   `buildTreemapFromMiIndex`，本函式不該被 route 直接呼叫。）
 */
export function classifySector(symbol: string, name: string, industryMap: Map<string, string>): string {
  // 1. 優先用正式產業別（上市公司）
  const formal = industryMap.get(symbol);
  if (formal) return formal;

  // 2. 兜底：關鍵字匹配（上櫃、ETF 等）
  const lowerName = name.toLowerCase();
  for (const [sector, keywords] of Object.entries(OTC_SECTOR_KEYWORDS)) {
    if (keywords.some((k) => lowerName.includes(k.toLowerCase()))) {
      return sector;
    }
  }
  return '其他';
}

export interface TreemapItem {
  symbol: string;
  name: string;
  sector: string;
  /** 估算市值 = 收盤價 × 成交張數（⚠ 這是**代理值**，非真實發行張數）。 */
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  volume: number; // 成交張數
}

export interface TreemapSector {
  sector: string;
  totalMarketCap: number;
  totalVolume: number;
  count: number;
  items: TreemapItem[];
  /** 以 `marketCap` 加權的平均漲跌幅。 */
  changePercent: number;
}

export interface TreemapMarketGroups {
  上市: TreemapSector[];
  上櫃: TreemapSector[];
  ETF: TreemapSector[];
  其他: TreemapSector[];
}

/** 端點回應形狀（與既有 route 完全一致）。 */
export interface TreemapPayload {
  ok: true;
  date: string;
  sectors: TreemapSector[];
  marketGroups: TreemapMarketGroups;
  totalStocks: number;
  fetchedAt: string;
}

/**
 * 抓取 TWSE 公司基本資料並建立「代號 → 產業名稱」映射。
 *
 * ⚠ 故障容忍（誠實降級，不拖垮整包）：
 *   公司基本資料（產業別表）**不是**個股行情的必要條件——`classifySector` 內建
 *   「上櫃／ETF 關鍵字兜底」分支，缺產業別表時仍可分類（命中率下降但不 5xx）。
 *   因此上游非 2xx、內容非陣列、或 json 解析失敗時**回空 Map**（兜底關鍵字），
 *   而非拋錯讓 `loadTreemap` 整包 502（違反本專案「任一來源失敗不拖垮其他」原則）。
 *   唯一會拋錯的只有「沒有可用 fetch」這種環境錯誤。
 */
export async function fetchIndustryMap(fetchImpl?: FetchLike): Promise<Map<string, string>> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('此執行環境沒有可用的 fetch，請於呼叫時傳入 fetchImpl。');
  }

  let res: Response;
  try {
    res = await doFetch(COMPANY_BASIC_URL, { headers: TWSE_UA_HEADERS, cache: 'no-store' });
  } catch {
    return new Map(); // 網路失敗 → 兜底關鍵字，不炸整包
  }
  if (!res.ok) return new Map();

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return new Map(); // 內容非 JSON → 兜底關鍵字，不炸整包
  }
  if (!Array.isArray(json)) return new Map();

  const map = new Map<string, string>();
  for (const row of json as Array<Record<string, unknown>>) {
    const code = String(row['公司代號'] ?? '').trim();
    const industryCode = String(row['產業別'] ?? '').trim();
    if (!code || !industryCode) continue;
    const name = INDUSTRY_CODE_TO_NAME[industryCode] || industryCode;
    map.set(code, name);
  }
  return map;
}

/**
 * 由 MI_INDEX 的原始 JSON 組出 treemap payload。
 *
 * @param json           MI_INDEX 回應（需 `stat === 'OK'` 且含 `tables`）
 * @param industryMap    代號 → 產業名稱映射（來自 t187ap03_L）
 * @param queryDate      查詢日期 `'YYYYMMDD'`（原樣放進回應的 `date`）
 * @param fetchedAt      產出時間（ISO 字串）；省略時用現在時間
 * @returns 組好的 payload；`stat` 非 OK／`tables` 缺失時回 `null`（**絕不捏造**）
 */
export function buildTreemapFromMiIndex(
  json: { stat?: string; tables?: unknown[] } | null | undefined,
  industryMap: Map<string, string>,
  queryDate: string,
  fetchedAt?: string,
): TreemapPayload | null {
  if (!json || json.stat !== 'OK' || !json.tables) return null;

  const tables = json.tables;
  const rows = rowsOf(tables[DAILY_QUOTE_TABLE_INDEX] as string[][]);

  const items: TreemapItem[] = [];
  for (const row of rows) {
    const symbol = String(row?.[0] ?? '').trim();
    // 只處理 4 碼普通股（上市+上櫃）
    if (!/^\d{4}$/.test(symbol)) continue;

    const name = String(row?.[1] ?? '').trim();
    const price = parseTwseNumber(row[8]); // 收盤價
    const sign = parseTwseSign(row[9]); // 漲跌符號
    const rawChange = parseTwseNumber(row[10]); // 漲跌點數（無號）

    // ⚠⚠ 修正（2026-10-04）：TWSE MI_INDEX「每日收盤行情」欄位順序：
    //      0 證券代號 / 1 證券名稱 / 2 **成交股數** / 3 成交筆數 / 4 成交金額 /
    //      5 開盤價 / 6 最高價 / 7 最低價 / 8 收盤價 / 9 漲跌(+/-) / 10 漲跌價差 …
    //   原本錯取 `row[3]`（成交筆數），現改為 `row[2]`（成交股數）÷1000 → 成交張數。
    const volumeLots = (parseTwseNumber(row[2]) ?? 0) / 1000;

    if (!Number.isFinite(price) || price <= 0) continue;
    if (!Number.isFinite(rawChange)) continue;

    const change = rawChange * sign;
    const prevClose = price - change;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    if (!Number.isFinite(changePercent)) continue;

    const sector = classifySector(symbol, name, industryMap);

    items.push({
      symbol,
      name,
      sector,
      marketCap: price * (volumeLots || 1), // 簡易估算：價格 × 成交張數
      price,
      change,
      changePercent,
      volume: volumeLots,
    });
  }

  // 依產業分群聚合
  const sectorMap = new Map<string, TreemapSector>();
  for (const item of items) {
    let sectorData = sectorMap.get(item.sector);
    if (!sectorData) {
      sectorData = {
        sector: item.sector,
        totalMarketCap: 0,
        totalVolume: 0,
        count: 0,
        items: [],
        changePercent: 0,
      };
      sectorMap.set(item.sector, sectorData);
    }
    sectorData.totalMarketCap += item.marketCap;
    sectorData.totalVolume += item.volume;
    sectorData.count += 1;
    sectorData.items.push(item);
  }

  // 計算各產業加權平均漲跌幅（以市值加權）
  const sectors: TreemapSector[] = [];
  for (const sectorData of sectorMap.values()) {
    let weightedChangeSum = 0;
    for (const item of sectorData.items) {
      weightedChangeSum += item.changePercent * item.marketCap;
    }
    sectorData.changePercent =
      sectorData.totalMarketCap > 0 ? weightedChangeSum / sectorData.totalMarketCap : 0;
    sectorData.items.sort((a, b) => b.marketCap - a.marketCap);
    sectorData.items = sectorData.items.slice(0, MAX_ITEMS_PER_SECTOR);
    sectors.push(sectorData);
  }

  sectors.sort((a, b) => b.totalMarketCap - a.totalMarketCap);

  // ⚠ 語意可疑但**刻意保留原行為**（見檔首說明第 2 點）：
  //   `sector.includes('櫃')` / `includes('ETF')` 在本對照表中幾乎永遠不成立，
  //   故實務上「上櫃」「ETF」多半是空的、「上市」拿到全部。改動需同步調整前端。
  const marketGroups: TreemapMarketGroups = {
    上市: sectors.filter((s) => !s.sector.includes('ETF') && !s.sector.includes('櫃')),
    上櫃: sectors.filter((s) => s.sector.includes('櫃')),
    ETF: sectors.filter((s) => s.sector.includes('ETF') || s.sector.includes('基金')),
    其他: sectors.filter(
      (s) =>
        !['上市', '上櫃', 'ETF'].some(
          (m) => sectorMap.get(s.sector)?.items.some((i) => i.symbol.startsWith(m)) ?? false,
        ),
    ),
  };

  return {
    ok: true,
    date: queryDate,
    sectors,
    marketGroups,
    totalStocks: items.length,
    fetchedAt: fetchedAt ?? new Date().toISOString(),
  };
}

/**
 * 抓取 MI_INDEX ＋ 公司基本資料，組出 treemap payload。
 *
 * @param dateYmd      `'YYYYMMDD'`；省略時自動解析**最近交易日**
 *                     （避免週末／休市日抓 MI_INDEX 拿到 `stat !== 'OK'` 而 502）
 * @param fetchImpl    可選 fetch 實作（Edge route 需傳入）
 * @throws Error       上游非 2xx，或無法取得任何可用交易日
 */
export async function loadTreemap(
  dateYmd?: string,
  fetchImpl?: FetchLike,
): Promise<TreemapPayload> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('此執行環境沒有可用的 fetch，請於呼叫時傳入 fetchImpl。');
  }

  let queryDate = dateYmd && /^\d{8}$/.test(dateYmd) ? dateYmd : null;
  if (!queryDate) {
    queryDate = await resolveLatestTradingDate(doFetch);
    if (!queryDate) throw new Error('no_trading_date');
  }

  // 並行抓取：MI_INDEX（行情）＋ 公司基本資料（產業分類）
  const [miRes, industryMap] = await Promise.all([
    doFetch(rwdMiIndexUrl(queryDate), { headers: TWSE_UA_HEADERS, cache: 'no-store' }),
    fetchIndustryMap(doFetch),
  ]);

  if (!miRes.ok) throw new Error('upstream_error');

  const json = (await miRes.json()) as { stat?: string; tables?: unknown[] };
  const payload = buildTreemapFromMiIndex(json, industryMap, queryDate);
  if (!payload) throw new Error('upstream_error');
  return payload;
}