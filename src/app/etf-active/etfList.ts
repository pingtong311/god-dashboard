/**
 * 主動式 ETF 清單（逐字取自 captured/login-capture/html/etf-active.html）
 * ----------------------------------------------------------------------------
 * 40 檔「主動式 ETF」代號與名稱；`holdings` 為實站標示的持股檔數（實站未標示者為 null）。
 * 這是官方公開的掛牌清單（參考用中繼資料），非行情資料；頁面展開後的「持股明細」
 * 與「當日買／賣股數」本站無資料源，展開時誠實呈現「資料尚未入庫」。
 */
export interface ActiveEtf {
  code: string;
  name: string;
  holdings: number | null;
}

export const ACTIVE_ETFS: readonly ActiveEtf[] = [
  { code: '00400A', name: '主動國泰動能高息', holdings: 30 },
  { code: '00401A', name: '主動摩根台灣鑫收', holdings: 30 },
  { code: '00402A', name: '主動安聯美國科技', holdings: null },
  { code: '00403A', name: '主動統一升級50', holdings: null },
  { code: '00404A', name: '主動聯博動能50', holdings: 30 },
  { code: '00405A', name: '主動富邦台灣龍耀', holdings: 30 },
  { code: '00406A', name: '主動中信台灣收益', holdings: null },
  { code: '00407A', name: '主動凱基台灣', holdings: 30 },
  { code: '00408A', name: '主動第一金優股息', holdings: null },
  { code: '00409A', name: '主動復華全球50', holdings: null },
  { code: '00410A', name: '主動永豐科技趨勢', holdings: null },
  { code: '00411A', name: '主動統一前沿科技', holdings: null },
  { code: '00980A', name: '主動野村臺灣優選', holdings: null },
  { code: '00980D', name: '主動聯博投等入息', holdings: null },
  { code: '00981A', name: '主動統一台股增長', holdings: null },
  { code: '00981D', name: '主動中信非投等債', holdings: null },
  { code: '00982A', name: '主動群益台灣強棒', holdings: null },
  { code: '00982D', name: '主動富邦動態入息', holdings: null },
  { code: '00983A', name: '主動中信ARK創新', holdings: null },
  { code: '00983D', name: '主動富邦複合收益', holdings: null },
  { code: '00984A', name: '主動安聯台灣高息', holdings: 30 },
  { code: '00984D', name: '主動聯博全球非投', holdings: null },
  { code: '00985A', name: '主動野村台灣50', holdings: null },
  { code: '00985D', name: '主動貝萊德優投等', holdings: null },
  { code: '00986A', name: '主動台新龍頭成長', holdings: 30 },
  { code: '00986D', name: '主動復華金融債息', holdings: null },
  { code: '00987A', name: '主動台新優勢成長', holdings: 28 },
  { code: '00987D', name: '主動統一美債量化', holdings: null },
  { code: '00988A', name: '主動統一全球創新', holdings: null },
  { code: '00989A', name: '主動摩根美國科技', holdings: null },
  { code: '00990A', name: '主動元大AI新經濟', holdings: null },
  { code: '00991A', name: '主動復華未來50', holdings: 30 },
  { code: '00992A', name: '主動群益科技創新', holdings: null },
  { code: '00993A', name: '主動安聯台灣', holdings: 30 },
  { code: '00994A', name: '主動第一金台股優', holdings: null },
  { code: '00995A', name: '主動中信台灣卓越', holdings: null },
  { code: '00996A', name: '主動兆豐台灣豐收', holdings: null },
  { code: '00997A', name: '主動群益美國增長', holdings: null },
  { code: '00998A', name: '主動復華金融股息', holdings: null },
  { code: '00999A', name: '主動野村臺灣高息', holdings: null },
];
