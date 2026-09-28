/**
 * /block-trades 鉅額交易 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/block-trades.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero-hud + 說明 details
 * + 「資料日 N 檔」金額排序清單）。
 *
 * 資料策略（已改為自產真實資料）：本頁資料改由本站自打證交所免費官方 API
 * （BFIAUU，經 /api/skynet/block-trades 彙總）產生，不再使用 capture 快照數字。
 * 版面文字仍逐字複刻；資料區交由 BlockTradesClient 取得真實資料，
 * 載入中顯示誠實骨架、失敗顯示誠實錯誤。
 *
 * 為 Server Component：僅提供 metadata 與靜態版面外框；資料區為 Client Component
 * （沿用本專案 /cb、/etf-active 的「Server 頁面 + Client 資料區」慣例）。
 */
import type { Metadata } from 'next';
import BlockTradesClient from './BlockTradesClient';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '鉅額交易 | 股市大佬 TradeBoss',
  description:
    '有人一次買賣很大一筆，數量大到不能丟進一般盤面，就會用「鉅額交易」這個管道成交。這裡列出當天發生的紀錄。',
};

export default function BlockTradesPage() {
  return <BlockTradesClient />;
}
