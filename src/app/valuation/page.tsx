/**
 * /valuation 估值河流（個股維度工具頁）
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/valuation-2330.html 的 <main> 內容。
 * 頁內可接受 ?id= 指定個股（預設 2330），僅用於「範例連結」指向個股頁。
 * 純計算工具：無外部資料源，輸入即時運算，不造假資料。
 */

import type { Metadata } from 'next';
import ValuationClient from './ValuationClient';
import './page.css';

export const metadata: Metadata = {
  title: '估值河流｜股市大佬 TradeBoss',
  description:
    '調整 EPS 與本益假設，得到研究用價格區間；平台不會把它設成提醒價，也不是買賣建議。',
};

export default function ValuationPage(): React.ReactElement {
  return <ValuationClient />;
}
