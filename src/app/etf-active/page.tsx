/**
 * /etf-active 主動式ETF
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/etf-active.html 的 <main> 內容。
 * 含「市場分類」次導覽（MarketCatNav，實站此頁有）。
 * 掛牌清單為公開中繼資料；展開後的持股明細／當日買賣股數本站無資料源，
 * 展開時誠實呈現「資料尚未入庫」骨架，不造假。
 */

import type { Metadata } from 'next';
import MarketCatNav from '@/components/MarketCatNav';
import EtfActiveClient from './EtfActiveClient';
import './page.css';

export const metadata: Metadata = {
  title: '主動式ETF｜股市大佬 TradeBoss',
  description: '盤後持股明細與異動張數。只陳述已公布的持有與買賣股數，不推論下一步。',
};

export default function EtfActivePage(): React.ReactElement {
  return (
    <>
      <MarketCatNav />
      <EtfActiveClient />
    </>
  );
}
