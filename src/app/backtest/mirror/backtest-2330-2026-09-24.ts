/**
 * /backtest 分點驗證 — 實站歷史快照（site-mirror）
 * ============================================================================
 * 快照來源：
 *   captured/login-capture/api/blackstockai.com_api_broker-backtest_2330_mode_auto.json
 *   實站 API：https://blackstockai.com/api/broker-backtest/2330?mode=auto（HTTP 200）
 *   快照基準日：2026-09-24
 *   抓取時間：2026-09-24T23:39:29+0800（= 2026-09-24T15:39:29Z）
 *     └ 該快照 JSON 本身無時間戳欄位（僅 url / status / body），故此值取自
 *       快照檔案的檔案系統 mtime（`stat`），非任意編造。
 *
 * ⚠ 本檔為**實站快照**（site-mirror），非本站自產，也**非即時**：
 *   只涵蓋「2330 台積電 × 元大（trader_id 9800）」這一組（mode=auto），
 *   signal_date 範圍 2026-04-08 ~ 2026-09-07，共 29 筆。
 *   其他股票代號本站沒有快照，**不可假裝能算**（見 /api/skynet/backtest route）。
 *
 * ★★ 為什麼是 site-mirror 而不是 self-produced ★★
 *   分點（券商分點逐筆／日匯總）是 **FinMind Sponsor-only 付費資料**；本專案免費層
 *   只有券商主檔（TaiwanSecuritiesTraderInfo），無分點逐筆（見
 *   src/app/api/skynet/channel/route.ts 的說明，`hasChannelData` 恆為 false）。
 *   因此**本站無法自行重算這 29 筆**——我們既沒有分點淨買原始資料，也沒有足夠的
 *   盤中／盤後價量組合去重建跟單模擬。既然無法重算驗證，就只能單方面信任實站快照，
 *   故誠實標記為 site-mirror（並附基準日與抓取時間）。
 *
 * ★★ 最關鍵的坑：total_ret_pct 是「複利」口徑，不是簡單加總 ★★
 *   實站 `total_ret_pct: 2.28` 不是 29 筆 ret_pct 的簡單加總。
 *     簡單加總 Σ(ret_pct)              = 4.12%      ← 錯的口徑
 *     複利 Π(1 + ret_pct/100) - 1      = 2.2764%    ← 四捨五入 = 2.28% ✅ 與實站一致
 *   本檔直接沿用快照的 `total_ret_pct`（= 2.28），**不自行重算**。
 *   若日後有人需要重算，**必須用複利公式**，否則會得到 4.12 而與實站不符。
 *   頁面上若顯示「累積報酬」，數字必須是 2.28 而不是 4.12。
 *
 * 紅漲綠跌：本檔只做資料，不涉顏色（顏色由頁面依 ret_pct 正負決定）。
 */

import type { FieldSources, Provenance } from '@/lib/provenance';

/** 單筆回測交易（對應實站 trades[] 的一筆）。 */
export interface BacktestTrade {
  /** 訊號日（分點大買當日）'YYYY-MM-DD'。 */
  signal_date: string;
  /** 進場日 'YYYY-MM-DD'。 */
  entry_date: string;
  /** 進場價。 */
  entry: number;
  /** 出場日 'YYYY-MM-DD'。 */
  exit_date: string;
  /** 出場價。 */
  exit: number;
  /** 扣成本後報酬率（%）。 */
  ret_pct: number;
  /** 該訊號日分點淨買張數。 */
  broker_net_lots: number;
  /** 未扣成本（毛）報酬率（%）。 */
  gross_ret_pct: number;
}

/** 回測對象下拉的單一分點選項（對應實站 broker_options[]）。 */
export interface BrokerOption {
  /** 分點代號（如 '9800'）。 */
  trader_id: string;
  /** 分點名稱（如 '元大'）。 */
  trader_name: string;
  /** 近半年淨買張數。 */
  net_lots: number;
}

/** 實站 /api/broker-backtest 回傳 body（快照完整內容）。 */
export interface BacktestMirrorBody {
  ok: true;
  /** 標的標籤（如 '2330 台積電'）。 */
  label: string;
  /** 主力分點名稱（如 '元大'）。 */
  broker: string;
  /** 主力分點代號（如 '9800'）。 */
  trader_id: string;
  /** 可選分點清單（12 筆）。 */
  broker_options: BrokerOption[];
  /** 是否由使用者指定分點（此快照為 false，代表採「主導分點」）。 */
  broker_picked: boolean;
  /** 策略代碼（'follow'）。 */
  play: string;
  /** 策略中文名（'跟主力做多（follow）'）。 */
  play_zh: string;
  /** 策略說明。 */
  play_desc: string;
  /** 樣本筆數。 */
  n_trades: number;
  /** 勝率（0~1；此快照 0.448）。 */
  win_rate: number;
  /** 平均每筆報酬率（%）。 */
  avg_ret_pct: number;
  /** 累積報酬率（%）——★複利口徑（見檔頭）。 */
  total_ret_pct: number;
  /** 最好的一筆。 */
  best: BacktestTrade;
  /** 最差的一筆。 */
  worst: BacktestTrade;
  /** 29 筆交易明細（依實站順序，最新在前）。 */
  trades: BacktestTrade[];
  /** 來回成本（手續費 + 證交稅 + 滑價，%）。 */
  cost_pct: number;
  /** 實站頁尾口徑註記。 */
  note: string;
}

/**
 * 快照完整 body（逐值取自快照 JSON，順序與實站一致）。
 * ⚠ 此為實站歷史快照，非即時、非本站自產。
 */
export const BACKTEST_MIRROR: BacktestMirrorBody = {
  ok: true,
  label: '2330 台積電',
  broker: '元大',
  trader_id: '9800',
  broker_options: [
    { trader_id: '9800', trader_name: '元大', net_lots: 86009 },
    { trader_id: '9A00', trader_name: '永豐金', net_lots: 35671 },
    { trader_id: '9100', trader_name: '群益', net_lots: 30436 },
    { trader_id: '9200', trader_name: '凱基', net_lots: 21884 },
    { trader_id: '5850', trader_name: '統一', net_lots: 19803 },
    { trader_id: '6160', trader_name: '中國信託', net_lots: 12175 },
    { trader_id: '8888', trader_name: '國泰敦南', net_lots: 9769 },
    { trader_id: '8880', trader_name: '國泰綜合', net_lots: 7864 },
    { trader_id: '8840', trader_name: '玉山', net_lots: 4372 },
    { trader_id: '9600', trader_name: '富邦', net_lots: 4206 },
    { trader_id: '1260', trader_name: '宏遠', net_lots: 3579 },
    { trader_id: '5380', trader_name: '第一金證', net_lots: 3218 },
  ],
  broker_picked: false,
  play: 'follow',
  play_zh: '跟主力做多（follow）',
  play_desc: '每次這個分點『大買』後，隔天開盤跟著做多、最多抱 3 天——賭它波段布局帶動續漲。',
  n_trades: 29,
  win_rate: 0.448,
  avg_ret_pct: 0.14,
  total_ret_pct: 2.28,
  best: {
    signal_date: '2026-07-27',
    entry_date: '2026-07-28',
    entry: 2270,
    exit_date: '2026-07-31',
    exit: 2425,
    ret_pct: 6.44,
    broker_net_lots: 1768,
    gross_ret_pct: 6.83,
  },
  worst: {
    signal_date: '2026-06-22',
    entry_date: '2026-06-23',
    entry: 2510,
    exit_date: '2026-06-26',
    exit: 2340,
    ret_pct: -7.16,
    broker_net_lots: 5891,
    gross_ret_pct: -6.77,
  },
  trades: [
    { signal_date: '2026-09-07', entry_date: '2026-09-08', entry: 2465, exit_date: '2026-09-11', exit: 2410, ret_pct: -2.62, broker_net_lots: 2221, gross_ret_pct: -2.23 },
    { signal_date: '2026-07-31', entry_date: '2026-08-03', entry: 2390, exit_date: '2026-08-06', exit: 2365, ret_pct: -1.44, broker_net_lots: 5261, gross_ret_pct: -1.05 },
    { signal_date: '2026-07-29', entry_date: '2026-07-30', entry: 2205, exit_date: '2026-08-04', exit: 2320, ret_pct: 4.83, broker_net_lots: 5028, gross_ret_pct: 5.22 },
    { signal_date: '2026-07-28', entry_date: '2026-07-29', entry: 2260, exit_date: '2026-08-03', exit: 2370, ret_pct: 4.48, broker_net_lots: 2546, gross_ret_pct: 4.87 },
    { signal_date: '2026-07-27', entry_date: '2026-07-28', entry: 2270, exit_date: '2026-07-31', exit: 2425, ret_pct: 6.44, broker_net_lots: 1768, gross_ret_pct: 6.83 },
    { signal_date: '2026-07-21', entry_date: '2026-07-22', entry: 2440, exit_date: '2026-07-27', exit: 2350, ret_pct: -4.08, broker_net_lots: 1931, gross_ret_pct: -3.69 },
    { signal_date: '2026-07-20', entry_date: '2026-07-21', entry: 2350, exit_date: '2026-07-24', exit: 2350, ret_pct: -0.39, broker_net_lots: 4759, gross_ret_pct: 0 },
    { signal_date: '2026-07-15', entry_date: '2026-07-16', entry: 2430, exit_date: '2026-07-21', exit: 2410, ret_pct: -1.21, broker_net_lots: 1603, gross_ret_pct: -0.82 },
    { signal_date: '2026-07-14', entry_date: '2026-07-15', entry: 2425, exit_date: '2026-07-20', exit: 2320, ret_pct: -4.72, broker_net_lots: 1812, gross_ret_pct: -4.33 },
    { signal_date: '2026-06-30', entry_date: '2026-07-01', entry: 2495, exit_date: '2026-07-06', exit: 2460, ret_pct: -1.79, broker_net_lots: 3730, gross_ret_pct: -1.4 },
    { signal_date: '2026-06-29', entry_date: '2026-06-30', entry: 2440, exit_date: '2026-07-03', exit: 2445, ret_pct: -0.19, broker_net_lots: 2828, gross_ret_pct: 0.2 },
    { signal_date: '2026-06-23', entry_date: '2026-06-24', entry: 2435, exit_date: '2026-06-29', exit: 2370, ret_pct: -3.06, broker_net_lots: 4238, gross_ret_pct: -2.67 },
    { signal_date: '2026-06-22', entry_date: '2026-06-23', entry: 2510, exit_date: '2026-06-26', exit: 2340, ret_pct: -7.16, broker_net_lots: 5891, gross_ret_pct: -6.77 },
    { signal_date: '2026-06-18', entry_date: '2026-06-22', entry: 2455, exit_date: '2026-06-25', exit: 2390, ret_pct: -3.04, broker_net_lots: 4087, gross_ret_pct: -2.65 },
    { signal_date: '2026-06-17', entry_date: '2026-06-18', entry: 2395, exit_date: '2026-06-24', exit: 2390, ret_pct: -0.6, broker_net_lots: 2109, gross_ret_pct: -0.21 },
    { signal_date: '2026-06-16', entry_date: '2026-06-17', entry: 2355, exit_date: '2026-06-23', exit: 2490, ret_pct: 5.34, broker_net_lots: 1606, gross_ret_pct: 5.73 },
    { signal_date: '2026-06-15', entry_date: '2026-06-16', entry: 2375, exit_date: '2026-06-22', exit: 2510, ret_pct: 5.29, broker_net_lots: 2414, gross_ret_pct: 5.68 },
    { signal_date: '2026-06-11', entry_date: '2026-06-12', entry: 2325, exit_date: '2026-06-17', exit: 2385, ret_pct: 2.19, broker_net_lots: 3760, gross_ret_pct: 2.58 },
    { signal_date: '2026-06-01', entry_date: '2026-06-02', entry: 2390, exit_date: '2026-06-05', exit: 2365, ret_pct: -1.44, broker_net_lots: 2955, gross_ret_pct: -1.05 },
    { signal_date: '2026-05-29', entry_date: '2026-06-01', entry: 2355, exit_date: '2026-06-04', exit: 2385, ret_pct: 0.88, broker_net_lots: 6890, gross_ret_pct: 1.27 },
    { signal_date: '2026-05-25', entry_date: '2026-05-26', entry: 2320, exit_date: '2026-05-29', exit: 2355, ret_pct: 1.12, broker_net_lots: 1745, gross_ret_pct: 1.51 },
    { signal_date: '2026-05-18', entry_date: '2026-05-19', entry: 2220, exit_date: '2026-05-22', exit: 2255, ret_pct: 1.19, broker_net_lots: 1785, gross_ret_pct: 1.58 },
    { signal_date: '2026-05-12', entry_date: '2026-05-13', entry: 2205, exit_date: '2026-05-18', exit: 2240, ret_pct: 1.2, broker_net_lots: 1664, gross_ret_pct: 1.59 },
    { signal_date: '2026-05-07', entry_date: '2026-05-08', entry: 2300, exit_date: '2026-05-13', exit: 2220, ret_pct: -3.87, broker_net_lots: 2304, gross_ret_pct: -3.48 },
    { signal_date: '2026-05-06', entry_date: '2026-05-07', entry: 2335, exit_date: '2026-05-12', exit: 2255, ret_pct: -3.82, broker_net_lots: 2196, gross_ret_pct: -3.43 },
    { signal_date: '2026-04-27', entry_date: '2026-04-28', entry: 2245, exit_date: '2026-05-04', exit: 2275, ret_pct: 0.95, broker_net_lots: 1819, gross_ret_pct: 1.34 },
    { signal_date: '2026-04-20', entry_date: '2026-04-21', entry: 2050, exit_date: '2026-04-24', exit: 2185, ret_pct: 6.2, broker_net_lots: 2397, gross_ret_pct: 6.59 },
    { signal_date: '2026-04-15', entry_date: '2026-04-16', entry: 2080, exit_date: '2026-04-21', exit: 2050, ret_pct: -1.83, broker_net_lots: 3927, gross_ret_pct: -1.44 },
    { signal_date: '2026-04-08', entry_date: '2026-04-09', entry: 1945, exit_date: '2026-04-14', exit: 2055, ret_pct: 5.27, broker_net_lots: 4422, gross_ret_pct: 5.66 },
  ],
  cost_pct: 0.389,
  note: '已扣手續費 1 折、證交稅與滑價約 0.39%（留倉來回），並假設都能以開盤／收盤價成交，實務會有落差。為歷史統計教學，非投資建議。',
};

/**
 * 來源標記（site-mirror）。
 * - upstream：實站 API URL。
 * - snapshot_date：資料基準日（快照當日）。
 * - captured_at：快照抓取 ISO 時間（取自快照檔 mtime，見檔頭說明）。
 */
export const MIRROR_META: Provenance = {
  source: 'site-mirror',
  upstream: 'https://blackstockai.com/api/broker-backtest/2330?mode=auto',
  snapshot_date: '2026-09-24',
  captured_at: '2026-09-24T15:39:29.000Z',
};

/**
 * 本頁逐欄來源（供 Coverage 計算）。
 * ⚠ 這些欄位全部來自實站快照（site-mirror）——本站無法重算分點跟單模擬
 *   （分點為 FinMind Sponsor-only 付費資料），只能單方面信任實站快照。
 *   故覆蓋率為 self_produced: 0 / site_mirror: N / absent: 0。
 */
export const MIRROR_FIELD_SOURCES: FieldSources = {
  label: 'site-mirror',
  broker: 'site-mirror',
  trader_id: 'site-mirror',
  broker_options: 'site-mirror',
  play: 'site-mirror',
  play_zh: 'site-mirror',
  play_desc: 'site-mirror',
  n_trades: 'site-mirror',
  win_rate: 'site-mirror',
  avg_ret_pct: 'site-mirror',
  total_ret_pct: 'site-mirror',
  best: 'site-mirror',
  worst: 'site-mirror',
  trades: 'site-mirror',
  cost_pct: 'site-mirror',
  note: 'site-mirror',
};
