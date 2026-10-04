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
 * ## 順帶修掉的兩個既有缺陷
 *
 *   1. **週末／休市日一律 502**：route 原本預設查「台北今天」，週末抓 MI_INDEX 會拿到
 *      `stat !== 'OK'`（TWSE 回「沒有符合條件的資料」）→ 直接 502。
 *      首頁與 `/sector` 都是無參數呼叫，等於整個週末都是壞的。
 *      → 現在未指定日期時改用 `resolveLatestTradingDate()`（只需 47KB 的 openapi 探測，
 *        遠比 4.8MB 的 MI_INDEX 便宜）取得最近交易日。
 *
 *   2. **`marketGroups.其他` 的分類邏輯**原本用「代號字首」猜市場別，但代號字首
 *      與上市／上櫃無關（上櫃是 4 碼、上市也是 4 碼），實際上幾乎永遠是空集合。
 *      → **刻意保留原行為**（改動會影響前端呈現且非本次目標），但在此註明語意可疑，
 *        留待後續以正式資料源（TWSE/TPEX 市場別對照表）取代。
 *
 *   3. ⚠ **`volume` 取的是「成交筆數」而不是「成交量」**（見下方 TODO）。
 *      同樣刻意保留原行為，但這是**數值正確性**問題，需 BOSS 決定是否修正。
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

/** 產業關鍵字對照表（依股票名稱匹配；簡化版，正式版應以類股對照表取代）。 */
const SECTOR_KEYWORDS: Record<string, string[]> = {
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
  鋼鋼鐵: ['鋼鐵'],
  橡膠: ['橡膠', '輪胎', '膠管', '膠帶'],
  汽車工業: ['汽車'],
  電器電纜: ['電纜', '電線', '配線', '開關', '插座'],
  電子零組件業: ['電子零組件'],
  通訊網路業: ['通訊網路'],
  電腦及週邊設備業: ['電腦週邊'],
  光電業: ['光電'],
  資訊服務業: ['資訊服務'],
  其他電子業: ['其他電子'],
  鋼鐵業: ['鋼鐵'],
  機械業: ['機械'],
  電機機械業: ['電機機電'],
  汽車工業業: ['汽車'],
  化學工業業: ['化學工業'],
  生技醫療業: ['生技醫療'],
  玻璃陶瓷業: ['玻璃陶瓷'],
  造紙印刷業: ['造紙印刷'],
  橡膠業: ['橡膠'],
  電器電纜業: ['電器電纜'],
};

/** 依股票名稱關鍵字做產業分類；無命中回 `'其他'`。 */
export function classifySector(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
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
  /** 估算市值 = 收盤價 × 成交量（⚠ 這是**代理值**，非真實發行張數）。 */
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
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
 * 由 MI_INDEX 的原始 JSON 組出 treemap payload。
 *
 * @param json      MI_INDEX 回應（需 `stat === 'OK'` 且含 `tables`）
 * @param queryDate 查詢日期 `'YYYYMMDD'`（原樣放進回應的 `date`）
 * @param fetchedAt 產出時間（ISO 字串）；省略時用現在時間
 * @returns 組好的 payload；`stat` 非 OK／`tables` 缺失時回 `null`（**絕不捏造**）
 */
export function buildTreemapFromMiIndex(
  json: { stat?: string; tables?: unknown[] } | null | undefined,
  queryDate: string,
  fetchedAt?: string,
): TreemapPayload | null {
  if (!json || json.stat !== 'OK' || !json.tables) return null;

  const tables = json.tables;
  const rows = rowsOf(tables[DAILY_QUOTE_TABLE_INDEX] as string[][]);

  const items: TreemapItem[] = [];
  for (const row of rows) {
    const symbol = String(row?.[0] ?? '').trim();
    // 只處理 4 碼普通股
    if (!/^\d{4}$/.test(symbol)) continue;

    const name = String(row?.[1] ?? '').trim();
    const price = parseTwseNumber(row[8]); // 收盤價
    const sign = parseTwseSign(row[9]); // 漲跌符號
    const rawChange = parseTwseNumber(row[10]); // 漲跌點數（無號）
    // ⚠⚠ 這裡取的是 `row[3]`，而 TWSE MI_INDEX「每日收盤行情」的欄位順序是：
    //      0 證券代號 / 1 證券名稱 / 2 成交股數 / 3 **成交筆數** / 4 成交金額 /
    //      5 開盤價 / 6 最高價 / 7 最低價 / 8 收盤價 / 9 漲跌(+/-) / 10 漲跌價差 …
    //   ⇒ `row[3]` 是「成交筆數」，**不是成交量**。因此 `volume` 欄位與下游的
    //     `marketCap = price × volume`、`totalVolume`、前端「成交 N 張」標示
    //     **語意都不正確**（2026-10-04 於離線預算產出時發現：1,094 檔中 1,073 檔
    //     被歸為「其他」產業，同時檢視欄位對位時一併確認此問題）。
    //
    //   **刻意不在此修正**：改 `row[3]` → `row[2] / 1000`（成交股數換算張數）會改變
    //   前端顯示的數字與熱圖面積，屬行為變更，依專案慣例需先經 BOSS 查核。
    //   → 已列入待決事項，見 Back-end 的 P1 報告。
    const volume = parseTwseNumber(row[3]); // TODO(資料正確性)：應為 row[2]（成交股數）÷1000

    if (!Number.isFinite(price) || price <= 0) continue;
    if (!Number.isFinite(rawChange)) continue;

    const change = rawChange * sign;
    const prevClose = price - change;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    if (!Number.isFinite(changePercent)) continue;

    items.push({
      symbol,
      name,
      sector: classifySector(name),
      marketCap: price * (volume || 1), // 簡易估算：價格 × 成交量
      price,
      change,
      changePercent,
      volume: volume || 0,
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
 * 抓取 MI_INDEX 並組出 treemap payload。
 *
 * @param dateYmd  `'YYYYMMDD'`；省略時自動解析**最近交易日**
 *                 （避免週末／休市日抓 MI_INDEX 拿到 `stat !== 'OK'` 而 502）
 * @throws Error 上游非 2xx，或無法取得任何可用交易日
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

  const res = await doFetch(rwdMiIndexUrl(queryDate), {
    headers: TWSE_UA_HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('upstream_error');

  const json = (await res.json()) as { stat?: string; tables?: unknown[] };
  const payload = buildTreemapFromMiIndex(json, queryDate);
  if (!payload) throw new Error('upstream_error');
  return payload;
}
