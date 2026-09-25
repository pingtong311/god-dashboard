/**
 * 分點驗證回測的交易明細（29 筆）——逐字取自
 * captured/login-capture/html/backtest.html 的「交易明細」<ul>（2330 台積電／元大）。
 * 為 capture 快照資料（歷史統計教學用途），非即時計算結果。
 */

/** 單筆回測交易（對應實站 <li> 的四欄）。 */
export interface BacktestTrade {
  /** 進場日（MM-DD） */
  date: string;
  /** 進場價 */
  entry: string;
  /** 出場價 */
  exit: string;
  /** 損益（含正負號） */
  pnl: string;
  /** 損益色類別：紅漲綠跌（text-up / text-down） */
  pnlClass: string;
}

export const BACKTEST_TRADES: BacktestTrade[] = [
  { date: '09-08', entry: '2465', exit: '2410', pnl: '-2.62%', pnlClass: 'text-down' },
  { date: '08-03', entry: '2390', exit: '2365', pnl: '-1.44%', pnlClass: 'text-down' },
  { date: '07-30', entry: '2205', exit: '2320', pnl: '+4.83%', pnlClass: 'text-up' },
  { date: '07-29', entry: '2260', exit: '2370', pnl: '+4.48%', pnlClass: 'text-up' },
  { date: '07-28', entry: '2270', exit: '2425', pnl: '+6.44%', pnlClass: 'text-up' },
  { date: '07-22', entry: '2440', exit: '2350', pnl: '-4.08%', pnlClass: 'text-down' },
  { date: '07-21', entry: '2350', exit: '2350', pnl: '-0.39%', pnlClass: 'text-down' },
  { date: '07-16', entry: '2430', exit: '2410', pnl: '-1.21%', pnlClass: 'text-down' },
  { date: '07-15', entry: '2425', exit: '2320', pnl: '-4.72%', pnlClass: 'text-down' },
  { date: '07-01', entry: '2495', exit: '2460', pnl: '-1.79%', pnlClass: 'text-down' },
  { date: '06-30', entry: '2440', exit: '2445', pnl: '-0.19%', pnlClass: 'text-down' },
  { date: '06-24', entry: '2435', exit: '2370', pnl: '-3.06%', pnlClass: 'text-down' },
  { date: '06-23', entry: '2510', exit: '2340', pnl: '-7.16%', pnlClass: 'text-down' },
  { date: '06-22', entry: '2455', exit: '2390', pnl: '-3.04%', pnlClass: 'text-down' },
  { date: '06-18', entry: '2395', exit: '2390', pnl: '-0.6%', pnlClass: 'text-down' },
  { date: '06-17', entry: '2355', exit: '2490', pnl: '+5.34%', pnlClass: 'text-up' },
  { date: '06-16', entry: '2375', exit: '2510', pnl: '+5.29%', pnlClass: 'text-up' },
  { date: '06-12', entry: '2325', exit: '2385', pnl: '+2.19%', pnlClass: 'text-up' },
  { date: '06-02', entry: '2390', exit: '2365', pnl: '-1.44%', pnlClass: 'text-down' },
  { date: '06-01', entry: '2355', exit: '2385', pnl: '+0.88%', pnlClass: 'text-up' },
  { date: '05-26', entry: '2320', exit: '2355', pnl: '+1.12%', pnlClass: 'text-up' },
  { date: '05-19', entry: '2220', exit: '2255', pnl: '+1.19%', pnlClass: 'text-up' },
  { date: '05-13', entry: '2205', exit: '2240', pnl: '+1.2%', pnlClass: 'text-up' },
  { date: '05-08', entry: '2300', exit: '2220', pnl: '-3.87%', pnlClass: 'text-down' },
  { date: '05-07', entry: '2335', exit: '2255', pnl: '-3.82%', pnlClass: 'text-down' },
  { date: '04-28', entry: '2245', exit: '2275', pnl: '+0.95%', pnlClass: 'text-up' },
  { date: '04-21', entry: '2050', exit: '2185', pnl: '+6.2%', pnlClass: 'text-up' },
  { date: '04-16', entry: '2080', exit: '2050', pnl: '-1.83%', pnlClass: 'text-down' },
  { date: '04-09', entry: '1945', exit: '2055', pnl: '+5.27%', pnlClass: 'text-up' },
];
