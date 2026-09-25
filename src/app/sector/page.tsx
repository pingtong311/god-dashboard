/**
 * /sector/ 族群熱圖（today 群組）。
 *
 * 殼由全域 layout.tsx 提供；資料由 SectorHeatmap（client component）
 * 來自 /api/skynet/treemap（TWSE MI_INDEX 每日收盤行情代理）。
 */
import type { Metadata } from 'next';
import SectorHeatmap from './SectorHeatmap';

export const metadata: Metadata = {
  title: '族群熱圖 | 股市大佬 TradeBoss',
  description:
    '把全市場股票依產業分組，看今天錢往哪個產業跑：族群強弱排行、龍頭比較與成交熱度。族群強弱只是研究背景，不是買賣訊號。',
};

export default function SectorPage() {
  return <SectorHeatmap />;
}
