/**
 * 看盤日記（大盤總覽）— 共用型別定義
 *
 * 資料來源：
 * - TWSE rwd MI_INDEX（tables[0] 指數收盤與各類股指數、tables[6] 大盤統計、tables[7] 漲跌證券數、tables[8] 每日收盤行情）
 * - TWSE rwd T86（三大法人買賣超）
 * - TWSE MIS（盤中即時指數，經既有 /api/skynet/twse 取得）
 */

/** 大盤指數報價（加權指數或櫃買指數）。 */
export type MarketIndexQuote = {
  /** 來源代號：加權 'tse_t00.tw'、櫃買 'otc_o00.tw'。 */
  symbol: string;
  /** 顯示名稱：'加權指數' | '櫃買指數'。 */
  name: string;
  /** 指數點數。 */
  price: number;
  /** 漲跌點數（帶正負）。 */
  change: number;
  /** 漲跌百分比（帶正負）。 */
  changePercent: number;
  source: 'twse-mis-live' | 'twse-mi-index-close' | 'taifex-openapi-close';
};

/** TAIFEX 期貨收盤報價（台指期 TX 近月，EOD 來源）。
 *  盤中（08:45–13:45）顯示前一日收盤價，因 TAIFEX OpenAPI 為 EOD 來源；
 *  即時行情需 Shioaji VPS（未啟用）或 Fugle 期權方案（現 403）。 */
export type TaifexFuturesQuote = {
  /** 顯示名稱：'台股期近月'。 */
  name: string;
  /** 收盤價（EOD）。route 端空值（'-'/'NULL'/''）轉 null，前端以 lastPrice > 0 保護。 */
  lastPrice: number;
  /** 漲跌點數（帶正負）；route 端空值轉 null 時前端顯示 '--'。 */
  change: number;
  /** 漲跌百分比（帶正負）；route 端空值轉 null 時前端顯示 '--'。 */
  changePercent: number;
  /** '收盤 MM/DD'——EOD 來源連日期一起顯示，避免誤以為即時。 */
  sourceLabel: string;
  source: 'taifex-openapi-close';
  /** 交易日 'YYYY-MM-DD'。 */
  date: string;
  /** 近月合約月，形如 'YYYY-MM'。 */
  contract: string;
};

/** 漲跌家數（取「股票」欄，非「整體市場」欄）。 */
export type MarketBreadth = {
  /** 上漲家數。 */
  up: number;
  /** 下跌家數。 */
  down: number;
  /** 持平家數。 */
  flat: number;
  /** 未成交家數。 */
  noTrade: number;
  /** 漲停家數。 */
  upLimit: number;
  /** 跌停家數。 */
  downLimit: number;
  /** 上漲佔比（0..1）= up / (up + down + flat)。 */
  upRatio: number;
};

/** 單一成交類別（單位：元）。 */
export type TurnoverCategory = { label: string; amount: number };

/** 個股漲跌快照。 */
export type MarketMover = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

/** 法人買超（netLots 單位：張 = 股 / 1000）。 */
export type InstitutionalBuy = { symbol: string; name: string; netLots: number };

/** 產業焦點：單一類股指數的當日表現。 */
export interface SectorFocus {
  /** 類股名稱（已去掉「類指數」後綴），例如「半導體」。 */
  name: string;
  /** 收盤指數。 */
  index: number;
  /** 漲跌點數（帶正負號）。 */
  change: number;
  /** 漲跌百分比（帶正負號）。 */
  changePercent: number;
}

/** 大盤總覽（看盤日記首頁主資料）。 */
export type MarketOverview = {
  /** 資料日期 'YYYY-MM-DD'。 */
  date: string;
  /** 加權指數收盤（櫃買即時失敗時的 fallback）。 */
  indexClose: MarketIndexQuote;
  /** 漲跌家數。 */
  breadth: MarketBreadth;
  /** 全市場成交金額。 */
  turnover: { total: number; categories: TurnoverCategory[] };
  /** 今日強股（最多 5）。 */
  topGainers: MarketMover[];
  /** 法人買超（最多 5）。 */
  institutionalBuy: InstitutionalBuy[];
  /** 產業焦點：各類股指數（依漲幅由大到小，最多 5）。 */
  sectorFocus: SectorFocus[];
};

/** 族群熱圖：單一產業群組彙總資料。 */
export interface TreemapSector {
  sector: string;
  totalMarketCap: number;
  totalVolume: number;
  count: number;
  items: TreemapStock[];
  changePercent: number;
}

/** 族群熱圖：單一個股資料。 */
export interface TreemapStock {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

/** 族群熱圖完整資料（含分群與市場別群組）。 */
export interface TreemapData {
  sectors: TreemapSector[];
  marketGroups: {
    上市: TreemapSector[];
    上櫃: TreemapSector[];
    ETF: TreemapSector[];
    其他: TreemapSector[];
  };
  totalStocks: number;
  date: string;
}
