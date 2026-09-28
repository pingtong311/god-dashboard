/**
 * /dividend 除權息行事曆 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/dividend.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero-hud + 說明 details
 * + 「即將除權息（30 天內）」表格 + 口徑註記）。
 *
 * 資料策略（已改為自產真實資料）：本頁資料改由本站自打證交所免費官方 API
 * （TWT48U 除權除息預告表 + STOCK_DAY_AVG_ALL 收盤價，經
 * /api/skynet/dividend-calendar 篩選未來 30 天並自算現金殖利率）產生，
 * 不再使用 capture 快照數字。版面文字仍逐字複刻；資料區交由 DividendClient
 * 取得真實資料，載入中顯示誠實骨架、失敗顯示誠實錯誤。
 *
 * 為 Server Component：僅提供 metadata 與靜態版面外框；資料區為 Client Component
 * （沿用本專案 /cb、/etf-active 的「Server 頁面 + Client 資料區」慣例）。
 */
import type { Metadata } from 'next';
import DividendClient from './DividendClient';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '除權息行事曆 | 股市大佬 TradeBoss',
  description:
    '未來 30 天要「發股利」的股票都在這，附現金殖利率。存股族排除息、參與填息行情的必備工具。客觀資料、非投資建議。',
};

export default function DividendPage() {
  return <DividendClient />;
}
