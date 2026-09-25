/**
 * 波段條件「大戶持股比例增加」符合清單（40 檔卡片）——逐字取自
 * captured/login-capture/html/swing.html 的卡片 grid（集保資料週期 2026-09-18）。
 * 為 capture 快照資料，非即時篩選結果。
 */

/** 單一「大戶持股比例增加」卡片（對應實站一張 data-panel 卡）。 */
export interface SwingCard {
  /** 股票代號 */
  code: string;
  /** 股票名稱 */
  name: string;
  /** 產業別 */
  industry: string;
  /** 卡片右上角「4 週報酬」文字 */
  weekReturn: string;
  /** 4 週報酬色類別（text-up / text-down） */
  weekReturnClass: string;
  /** 大戶持股比例 */
  holder: string;
  /** 本週增減（含正負號） */
  weekChange: string;
  /** 本週增減色類別（text-up / text-down） */
  weekChangeClass: string;
  /** 連續週數 */
  streak: string;
}

export const BIG_HOLDER_CARDS: SwingCard[] = [
  { code: '2520', name: '冠德', industry: '建材營造', weekReturn: '4週 +1.09%', weekReturnClass: 'text-up', holder: '74.97%', weekChange: '+0.41%', weekChangeClass: 'text-up', streak: '12 週' },
  { code: '3714', name: '富采', industry: '光電', weekReturn: '4週 +0.99%', weekReturnClass: 'text-up', holder: '43.9%', weekChange: '+0.1%', weekChangeClass: 'text-up', streak: '11 週' },
  { code: '3356', name: '奇偶', industry: '光電', weekReturn: '4週 +2.17%', weekReturnClass: 'text-up', holder: '35.17%', weekChange: '+1.26%', weekChangeClass: 'text-up', streak: '10 週' },
  { code: '2611', name: '志信', industry: '航運', weekReturn: '4週 +1.15%', weekReturnClass: 'text-up', holder: '48.86%', weekChange: '+0.88%', weekChangeClass: 'text-up', streak: '10 週' },
  { code: '2867', name: '三商壽', industry: '金融保險', weekReturn: '4週 +1.14%', weekReturnClass: 'text-up', holder: '86.49%', weekChange: '+0.31%', weekChangeClass: 'text-up', streak: '9 週' },
  { code: '2030', name: '彰源', industry: '鋼鐵工', weekReturn: '4週 +1.83%', weekReturnClass: 'text-up', holder: '54%', weekChange: '+0.04%', weekChangeClass: 'text-up', streak: '8 週' },
  { code: '2887', name: '台新新光金', industry: '金融保險', weekReturn: '4週 +0.48%', weekReturnClass: 'text-up', holder: '75.71%', weekChange: '+0.12%', weekChangeClass: 'text-up', streak: '8 週' },
  { code: '3406', name: '玉晶光', industry: '光電', weekReturn: '4週 +6.52%', weekReturnClass: 'text-up', holder: '61.84%', weekChange: '+0.21%', weekChangeClass: 'text-up', streak: '7 週' },
  { code: '5009', name: '榮剛', industry: '鋼鐵工', weekReturn: '4週 +1.18%', weekReturnClass: 'text-up', holder: '49.76%', weekChange: '+0.45%', weekChangeClass: 'text-up', streak: '7 週' },
  { code: '2101', name: '南港', industry: '橡膠工', weekReturn: '4週 +0.61%', weekReturnClass: 'text-up', holder: '65.97%', weekChange: '+0.01%', weekChangeClass: 'text-up', streak: '7 週' },
  { code: '6214', name: '精誠', industry: '資訊服務', weekReturn: '4週 +4.02%', weekReturnClass: 'text-up', holder: '66.83%', weekChange: '+0.02%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '2474', name: '可成', industry: '其他電子', weekReturn: '4週 +2.43%', weekReturnClass: 'text-up', holder: '72.12%', weekChange: '+0.48%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '2033', name: '佳大', industry: '鋼鐵工', weekReturn: '4週 +1.72%', weekReturnClass: 'text-up', holder: '78.33%', weekChange: '+0.14%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '2362', name: '藍天', industry: '電腦及週邊設備', weekReturn: '4週 +1.35%', weekReturnClass: 'text-up', holder: '80.78%', weekChange: '+0.09%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '3630', name: '新鉅科', industry: '光電', weekReturn: '4週 +0.45%', weekReturnClass: 'text-up', holder: '54.44%', weekChange: '+0.14%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '2206', name: '三陽工業', industry: '汽車工', weekReturn: '4週 +0.37%', weekReturnClass: 'text-up', holder: '85.53%', weekChange: '+0.09%', weekChangeClass: 'text-up', streak: '6 週' },
  { code: '2351', name: '順德', industry: '半導體', weekReturn: '4週 +5.67%', weekReturnClass: 'text-up', holder: '77.6%', weekChange: '+0.27%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '3402', name: '漢科', industry: '其他電子類', weekReturn: '4週 +3.29%', weekReturnClass: 'text-up', holder: '32.12%', weekChange: '+0.47%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '4927', name: '泰鼎-KY', industry: '電子零組件', weekReturn: '4週 +2.94%', weekReturnClass: 'text-up', holder: '27.81%', weekChange: '+0.44%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '1314', name: '中石化', industry: '塑膠工', weekReturn: '4週 +2.55%', weekReturnClass: 'text-up', holder: '42.83%', weekChange: '+1.71%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '5284', name: 'jpp-KY', industry: '其他', weekReturn: '4週 +1.71%', weekReturnClass: 'text-up', holder: '57.76%', weekChange: '+0.59%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '4976', name: '佳凌', industry: '光電', weekReturn: '4週 +1.7%', weekReturnClass: 'text-up', holder: '30.87%', weekChange: '+0.14%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '2884', name: '玉山金', industry: '金融保險', weekReturn: '4週 +1.08%', weekReturnClass: 'text-up', holder: '74.54%', weekChange: '+0.1%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '5880', name: '合庫金', industry: '金融保險', weekReturn: '4週 +0.77%', weekReturnClass: 'text-up', holder: '75.36%', weekChange: '+0.19%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '7827', name: '漢康-KY', industry: '生技醫療', weekReturn: '4週 +0.76%', weekReturnClass: 'text-up', holder: '77.37%', weekChange: '+0.14%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '3045', name: '台灣大', industry: '通信網路', weekReturn: '4週 +0.69%', weekReturnClass: 'text-up', holder: '92.96%', weekChange: '+0.17%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '2480', name: '敦陽科', industry: '資訊服務', weekReturn: '4週 +0.63%', weekReturnClass: 'text-up', holder: '31.06%', weekChange: '+0.2%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '1102', name: '亞泥', industry: '水泥工', weekReturn: '4週 +0.45%', weekReturnClass: 'text-up', holder: '81.85%', weekChange: '+0.06%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '2880', name: '華南金', industry: '金融保險', weekReturn: '4週 +0.39%', weekReturnClass: 'text-up', holder: '82.15%', weekChange: '+0.1%', weekChangeClass: 'text-up', streak: '5 週' },
  { code: '3324', name: '雙鴻', industry: '其他電子類', weekReturn: '4週 +13.07%', weekReturnClass: 'text-up', holder: '59.78%', weekChange: '+0.16%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '6179', name: '亞通', industry: '其他', weekReturn: '4週 +9.23%', weekReturnClass: 'text-up', holder: '50.22%', weekChange: '+1.89%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '3094', name: '聯傑', industry: '半導體', weekReturn: '4週 +8.21%', weekReturnClass: 'text-up', holder: '22.92%', weekChange: '+2.01%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '6944', name: '兆聯實業', industry: '綠能環保', weekReturn: '4週 +4.5%', weekReturnClass: 'text-up', holder: '55.28%', weekChange: '+0.63%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '6782', name: '視陽', industry: '化學生技醫療', weekReturn: '4週 +3.96%', weekReturnClass: 'text-up', holder: '50.05%', weekChange: '+1.7%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '6290', name: '良維', industry: '電子零組件', weekReturn: '4週 +3.48%', weekReturnClass: 'text-up', holder: '39.76%', weekChange: '+0.37%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '5392', name: '能率', industry: '光電', weekReturn: '4週 +3.39%', weekReturnClass: 'text-up', holder: '38.12%', weekChange: '+1.9%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '3003', name: '健和興', industry: '電子零組件', weekReturn: '4週 +3.2%', weekReturnClass: 'text-up', holder: '60.67%', weekChange: '+0.39%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '2636', name: '台驊控股', industry: '航運', weekReturn: '4週 +2.76%', weekReturnClass: 'text-up', holder: '43.17%', weekChange: '+0.82%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '4303', name: '信立', industry: '塑膠工', weekReturn: '4週 +2.54%', weekReturnClass: 'text-up', holder: '21.67%', weekChange: '+1.27%', weekChangeClass: 'text-up', streak: '4 週' },
  { code: '2354', name: '鴻準', industry: '其他電子', weekReturn: '4週 +2.18%', weekReturnClass: 'text-up', holder: '49.99%', weekChange: '+0.64%', weekChangeClass: 'text-up', streak: '4 週' },
];
