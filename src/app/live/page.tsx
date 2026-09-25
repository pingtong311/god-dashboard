/**
 * /live/ 盤中戰情（today 群組）。
 *
 * 殼（header／底部列／頁尾）由全域 layout.tsx 提供，本頁只輸出 <main> 內的內容。
 * 互動（模式／工具切換／代號查詢）在 LiveWorkspace（client component）。
 */
import type { Metadata } from 'next';
import LiveWorkspace from './LiveWorkspace';

export const metadata: Metadata = {
  title: '盤中戰情 | 股市大佬 TradeBoss',
  description:
    '盤中工作區：輸入股票代號看盤口現價、逐筆成交與通知記錄。收盤後原地保留最後資料，不用切換頁面。',
};

export default function LivePage() {
  return <LiveWorkspace />;
}
