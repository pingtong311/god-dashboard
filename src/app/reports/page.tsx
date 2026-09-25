/**
 * /reports/ 台股日報（today 群組）。
 *
 * 殼由全域 layout.tsx 提供；列表與「重新整理日報」互動在 ReportsList（client component），
 * 資料來自 /api/skynet/daily-reports，不造假瀏覽／留言數。
 */
import type { Metadata } from 'next';
import ReportsList from './ReportsList';

export const metadata: Metadata = {
  title: '台股日報 | 股市大佬 TradeBoss',
  description:
    '每個交易日盤後整理已發生的市場資料：成交量與買超集中度、股價與融資變化、分點歷史買賣、同產業漲跌比較。顏色只用來分組，不是買賣燈號。',
};

export default function ReportsPage() {
  return <ReportsList />;
}
