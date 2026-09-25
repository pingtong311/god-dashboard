/**
 * 鉅額交易「資料日 24 檔」清單——逐字取自
 * captured/login-capture/html/block-trades.html 的 <ul>（資料日 2026-09-24）。
 * 為 capture 快照資料（盤後公開），非即時成交紀錄。
 */

/** 單一鉅額交易統計列（對應實站 <li>）。 */
export interface BlockTradeRow {
  /** 股票代號 */
  code: string;
  /** 股票名稱 */
  name: string;
  /** 成交筆數（「1 筆」等） */
  trades: string;
  /** 成交金額（「15.19 億」等） */
  amount: string;
}

export const BLOCK_TRADE_ROWS: BlockTradeRow[] = [
  { code: '6669', name: '緯穎', trades: '1 筆', amount: '15.19 億' },
  { code: '3189', name: '景碩', trades: '5 筆', amount: '13.68 億' },
  { code: '3231', name: '緯創', trades: '1 筆', amount: '6.49 億' },
  { code: '2330', name: '台積電', trades: '6 筆', amount: '5.89 億' },
  { code: '1590', name: '亞德客-KY', trades: '1 筆', amount: '3.91 億' },
  { code: '3036', name: '文曄', trades: '2 筆', amount: '3.69 億' },
  { code: '2382', name: '廣達', trades: '1 筆', amount: '3.59 億' },
  { code: '3443', name: '創意', trades: '2 筆', amount: '3.21 億' },
  { code: '2454', name: '聯發科', trades: '3 筆', amount: '2.58 億' },
  { code: '2308', name: '台達電', trades: '2 筆', amount: '2.41 億' },
  { code: '2376', name: '技嘉', trades: '1 筆', amount: '1.09 億' },
  { code: '3665', name: '貿聯-KY', trades: '1 筆', amount: '1.08 億' },
  { code: '5347', name: '世界', trades: '3 筆', amount: '0.87 億' },
  { code: '7769', name: '鴻勁', trades: '2 筆', amount: '0.85 億' },
  { code: '2345', name: '智邦', trades: '1 筆', amount: '0.83 億' },
  { code: '2885', name: '元大金', trades: '2 筆', amount: '0.77 億' },
  { code: '2317', name: '鴻海', trades: '1 筆', amount: '0.43 億' },
  { code: '5871', name: '中租-KY', trades: '2 筆', amount: '0.43 億' },
  { code: '5274', name: '信驊', trades: '2 筆', amount: '0.4 億' },
  { code: '2360', name: '致茂', trades: '1 筆', amount: '0.3 億' },
  { code: '6187', name: '萬潤', trades: '1 筆', amount: '0.29 億' },
  { code: '3008', name: '大立光', trades: '1 筆', amount: '0.19 億' },
  { code: '2303', name: '聯電', trades: '1 筆', amount: '0.18 億' },
  { code: '1402', name: '遠東新', trades: '1 筆', amount: '0.18 億' },
];
