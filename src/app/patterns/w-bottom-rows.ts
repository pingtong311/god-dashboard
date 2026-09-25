/**
 * K 線型態掃描「W底（雙重底）」符合清單（38 檔）——逐字取自
 * captured/login-capture/html/patterns.html 的「符合的股票（38）」<ul>。
 * 為 capture 快照資料（資料日 2026-09-24 盤後日 K），非即時掃描結果。
 */

/** 單一符合型態的股票列（欄位對應實站 <li> 內的三欄）。 */
export interface PatternRow {
  /** 股票代號 */
  code: string;
  /** 股票名稱 */
  name: string;
  /** 產業別（實站 <span class="text-xs text-muted">） */
  industry: string;
  /** 成交量小：實站在產業後加 <span class="ml-1 text-amber-300">⚠量小</span> */
  thinVolume: boolean;
  /** 成交量（張） */
  volume: string;
  /** 資料日收盤價 */
  close: string;
  /** 漲跌幅（含正負號） */
  change: string;
  /** 漲跌色類別：紅漲綠跌（text-up / text-down） */
  changeClass: string;
}

export const W_BOTTOM_ROWS: PatternRow[] = [
  { code: '6116', name: '彩晶', industry: '光電', thinVolume: false, volume: '41,846', close: '14.9', change: '-0.67%', changeClass: 'text-down' },
  { code: '2481', name: '強茂', industry: '半導體', thinVolume: false, volume: '35,754', close: '174.5', change: '+0.87%', changeClass: 'text-up' },
  { code: '3264', name: '欣銓', industry: '半導體', thinVolume: false, volume: '18,332', close: '246', change: '-2.38%', changeClass: 'text-down' },
  { code: '2330', name: '台積電', industry: '半導體', thinVolume: false, volume: '14,557', close: '2475', change: '-1%', changeClass: 'text-down' },
  { code: '6456', name: 'GIS-KY', industry: '光電', thinVolume: false, volume: '14,497', close: '81.3', change: '+3.44%', changeClass: 'text-up' },
  { code: '2609', name: '陽明', industry: '航運', thinVolume: false, volume: '12,099', close: '59.6', change: '-0.5%', changeClass: 'text-down' },
  { code: '6207', name: '雷科', industry: '電子零組件', thinVolume: false, volume: '12,093', close: '125', change: '+9.65%', changeClass: 'text-up' },
  { code: '6257', name: '矽格', industry: '半導體', thinVolume: false, volume: '11,563', close: '243', change: '-1.62%', changeClass: 'text-down' },
  { code: '6205', name: '詮欣', industry: '電子零組件', thinVolume: false, volume: '11,480', close: '73.6', change: '+2.22%', changeClass: 'text-up' },
  { code: '3711', name: '日月光投控', industry: '半導體', thinVolume: false, volume: '10,964', close: '699', change: '+0.87%', changeClass: 'text-up' },
  { code: '3714', name: '富采', industry: '光電', thinVolume: false, volume: '8,698', close: '67.6', change: '+0.15%', changeClass: 'text-up' },
  { code: '2034', name: '允強', industry: '鋼鐵工', thinVolume: false, volume: '8,643', close: '22.8', change: '+3.64%', changeClass: 'text-up' },
  { code: '2436', name: '偉詮電', industry: '半導體', thinVolume: false, volume: '8,606', close: '72.4', change: '+4.02%', changeClass: 'text-up' },
  { code: '6693', name: '廣閎科', industry: '半導體', thinVolume: false, volume: '7,653', close: '209.5', change: '+6.35%', changeClass: 'text-up' },
  { code: '2363', name: '矽統', industry: '半導體', thinVolume: false, volume: '7,602', close: '58.7', change: '-0.84%', changeClass: 'text-down' },
  { code: '2615', name: '萬海', industry: '航運', thinVolume: false, volume: '6,307', close: '115.5', change: '+1.76%', changeClass: 'text-up' },
  { code: '2603', name: '長榮', industry: '航運', thinVolume: false, volume: '4,944', close: '243', change: '+0%', changeClass: 'text-up' },
  { code: '2376', name: '技嘉', industry: '電腦及週邊設備', thinVolume: false, volume: '3,778', close: '361.5', change: '-0.96%', changeClass: 'text-down' },
  { code: '6155', name: '鈞寶', industry: '電子零組件', thinVolume: false, volume: '3,762', close: '60.2', change: '+7.12%', changeClass: 'text-up' },
  { code: '6139', name: '亞翔', industry: '其他電子', thinVolume: false, volume: '3,399', close: '753', change: '+2.31%', changeClass: 'text-up' },
  { code: '1710', name: '東聯', industry: '化學工', thinVolume: false, volume: '3,365', close: '16.4', change: '-1.8%', changeClass: 'text-down' },
  { code: '4923', name: '力士', industry: '半導體', thinVolume: false, volume: '3,081', close: '64', change: '-4.05%', changeClass: 'text-down' },
  { code: '4960', name: '誠美材', industry: '光電', thinVolume: true, volume: '2,974', close: '22.45', change: '-1.32%', changeClass: 'text-down' },
  { code: '3149', name: '正達', industry: '光電', thinVolume: true, volume: '2,594', close: '63.3', change: '+0.16%', changeClass: 'text-up' },
  { code: '6133', name: '金橋', industry: '電子零組件', thinVolume: true, volume: '2,307', close: '25.95', change: '-0.38%', changeClass: 'text-down' },
  { code: '2352', name: '佳世達', industry: '電腦及週邊設備', thinVolume: true, volume: '2,247', close: '29', change: '+0%', changeClass: 'text-up' },
  { code: '6112', name: '邁達特', industry: '資訊服務', thinVolume: true, volume: '2,136', close: '47.7', change: '-1.04%', changeClass: 'text-down' },
  { code: '3693', name: '營邦', industry: '電腦及週邊設備', thinVolume: true, volume: '1,968', close: '729', change: '-0.41%', changeClass: 'text-down' },
  { code: '1609', name: '大亞', industry: '電器電纜', thinVolume: true, volume: '1,730', close: '37.85', change: '+0%', changeClass: 'text-up' },
  { code: '2455', name: '全新', industry: '通信網路', thinVolume: true, volume: '1,640', close: '554', change: '+0.36%', changeClass: 'text-up' },
  { code: '3265', name: '台星科', industry: '半導體', thinVolume: true, volume: '1,086', close: '183', change: '+1.67%', changeClass: 'text-up' },
  { code: '8162', name: '微矽電子-創', industry: '創新版股票', thinVolume: true, volume: '1,079', close: '65.1', change: '+3.33%', changeClass: 'text-up' },
  { code: '2636', name: '台驊控股', industry: '航運', thinVolume: true, volume: '1,009', close: '71.9', change: '+1.55%', changeClass: 'text-up' },
  { code: '5536', name: '聖暉*', industry: '其他電子類', thinVolume: true, volume: '749', close: '902', change: '+1.01%', changeClass: 'text-up' },
  { code: '6691', name: '洋基工程', industry: '其他電子', thinVolume: true, volume: '736', close: '667', change: '+3.25%', changeClass: 'text-up' },
  { code: '3088', name: '艾訊', industry: '電腦及週邊設備', thinVolume: true, volume: '451', close: '129.5', change: '+1.97%', changeClass: 'text-up' },
  { code: '6811', name: '宏碁資訊', industry: '資訊服務', thinVolume: true, volume: '286', close: '244.5', change: '-1.61%', changeClass: 'text-down' },
  { code: '6491', name: '晶碩', industry: '生技醫療', thinVolume: true, volume: '177', close: '402', change: '-1.35%', changeClass: 'text-down' },
];
