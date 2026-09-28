/**
 * /margin-maint 融資維持率
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/margin-maint.html 的 <main> 內容。
 *
 * 資料：由 <MarginMaintClient /> 向本站代理 `GET /api/skynet/margin-maint` 取真實資料。
 *   - 大盤維持率＝本站自算（公式見 API 中文註解），真實顯示。
 *   - 個股維持率＝交易所未公開可算欄位，誠實留空（不以 0 代替）。
 * 頁面文字（怎麼看、怎麼用、口徑說明）為靜態說明，逐字照抄。
 */

import type { Metadata } from 'next';
import MarginMaintClient from './MarginMaintClient';
import './page.css';

export const metadata: Metadata = {
  title: '融資維持率｜股市大佬 TradeBoss',
  description: '看「借錢買股票的人被逼到什麼程度」。這是盤後公開數字，不是斷頭預測。',
};

export default function MarginMaintPage(): React.ReactElement {
  return <MarginMaintClient />;
}
