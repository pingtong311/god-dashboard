import type { Metadata } from 'next';
import HubTools from './HubTools';

/**
 * /hub/「全部工具」頁。
 *
 * 這一頁是全站導覽的**權威索引**：6 個分組、44 張工具卡，逐字照抄實站
 * `https://blackstockai.com/hub/`（captured/login-capture/html/hub.html）。
 *
 * 頁面本身的 <main> 外框由根 layout.tsx 統一渲染（與實站同殼），
 * 本檔只輸出 `<main>` 內的內容；頂部 header、底部列、頁尾皆與實站一致。
 *
 * <title> 與 meta description 取自實站 hub.html 的 <head>（實站此頁用全站預設標題）。
 */
export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '股市大佬 TradeBoss 是台灣股票市場的公開籌碼與量價研究站。即時行情、主力分點、技術結構與 AI 白話解讀。公開教學免登入；會員區提供客觀資料工具。非投資建議。',
};

export default function HubPage() {
  return <HubTools />;
}
