/**
 * 除權息行事曆「即將除權息（30 天內）」清單（22 檔）——逐字取自
 * captured/login-capture/html/dividend.html 的 <ul>（資料基準日 2026-09-24）。
 * 為 capture 快照資料，非即時行程。
 */

/** 單一除權息列（對應實站 <li> 的四欄）。 */
export interface DividendRow {
  /** 除息日（MM-DD） */
  date: string;
  /** 距資料日天數（「0 天」等） */
  days: string;
  /** 股票代號 */
  code: string;
  /** 股票名稱 */
  name: string;
  /** 附註（「含配股 X 元」，無則空字串） */
  note: string;
  /** 現金股利（元） */
  cash: string;
  /** 現金殖利率（無資料時為「—」） */
  yield: string;
  /** 殖利率色類別：高殖利率標 text-up，否則空字串 */
  yieldClass: string;
}

export const DIVIDEND_ROWS: DividendRow[] = [
  { date: '09-24', days: '0 天', code: '1235', name: '興泰', note: '含配股 0.5 元', cash: '0.5', yield: '1.41%', yieldClass: '' },
  { date: '09-29', days: '5 天', code: '2109', name: '華豐', note: '', cash: '0.5', yield: '3.33%', yieldClass: '' },
  { date: '09-30', days: '6 天', code: '8440', name: '綠電', note: '', cash: '0.35', yield: '1.73%', yieldClass: '' },
  { date: '10-01', days: '7 天', code: '1784', name: '訊聯', note: '', cash: '0.88', yield: '1.44%', yieldClass: '' },
  { date: '10-01', days: '7 天', code: '2323', name: '中環', note: '', cash: '0.2', yield: '1.85%', yieldClass: '' },
  { date: '10-01', days: '7 天', code: '6523', name: '達爾膚', note: '', cash: '2', yield: '2.23%', yieldClass: '' },
  { date: '10-01', days: '7 天', code: '9927', name: '泰銘', note: '', cash: '5', yield: '7.12%', yieldClass: 'text-up' },
  { date: '10-02', days: '8 天', code: '6171', name: '大城地產', note: '', cash: '2', yield: '7.58%', yieldClass: 'text-up' },
  { date: '10-02', days: '8 天', code: '6834', name: '天二科技', note: '', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-05', days: '11 天', code: '5512', name: '力麒', note: '', cash: '0.1', yield: '1.3%', yieldClass: '' },
  { date: '10-06', days: '12 天', code: '2614', name: '東森', note: '含配股 0.8 元', cash: '0.4', yield: '2.19%', yieldClass: '' },
  { date: '10-06', days: '12 天', code: '8021', name: '尖點', note: '', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-07', days: '13 天', code: '2890', name: '永豐金', note: '', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-07', days: '13 天', code: '2947', name: '振宇五金', note: '', cash: '1', yield: '—', yieldClass: '' },
  { date: '10-07', days: '13 天', code: '6108', name: '競國', note: '', cash: '1', yield: '4.1%', yieldClass: '' },
  { date: '10-07', days: '13 天', code: '6129', name: '普誠', note: '', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-12', days: '18 天', code: '1449', name: '佳和', note: '含配股 0.1 元', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-12', days: '18 天', code: '1565', name: '精華', note: '', cash: '5.8', yield: '6.07%', yieldClass: 'text-up' },
  { date: '10-13', days: '19 天', code: '1727', name: '中華化', note: '', cash: '0', yield: '—', yieldClass: '' },
  { date: '10-14', days: '20 天', code: '4903', name: '聯光通', note: '', cash: '0.3', yield: '0.7%', yieldClass: '' },
  { date: '10-15', days: '21 天', code: '1463', name: '強盛新', note: '', cash: '0.13', yield: '0.72%', yieldClass: '' },
  { date: '10-22', days: '28 天', code: '8936', name: '國統', note: '', cash: '3', yield: '5.76%', yieldClass: 'text-up' },
];
