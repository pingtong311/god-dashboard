/**
 * /market 大盤與國際（會員四頁之一，底部列「市場」分頁的總覽頁籤）
 * ----------------------------------------------------------------------------
 * 100% 忠實複刻 captured/login-capture/html/tab-market.html 的
 * <main id="main-content"> 內容（SPEC 會員四頁 §2，M0–M14 共 15 區塊）。
 *
 * 外殼（<main>、header、底部列、頁尾）由全域 layout.tsx 提供，本頁只輸出
 * <main> 內的內容：M0 次導覽 + <div class="page-enter"> 內的 M1–M14。
 *
 * 資料策略（誠實標示，不造假）：
 *   - 真實來源：M6 台指期（/api/skynet/futures）、M6/M12 加權與廣度
 *     （/api/skynet/market-overview）、M2 跑馬燈與 M10 期權由共用元件自載
 *   - 無對接來源：M7 近 10 日迷你圖、M8 產業成交額熱力、M9 成交動能 →
 *     保留 capture 外殼與文案，圖表以 animate-pulse 骨架 + role="status" 呈現
 *   - 快照常數（與 IndexMarquee／FuturesOptionsPanel 同策略）：M3 外圍漲跌明細、
 *     M12 上櫃（櫃買）廣度
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import IndexMarquee from '@/components/IndexMarquee';
import MarketCatNav from '@/components/MarketCatNav';
import MarketHero from './MarketHero';
import MarketPageCaveat from './MarketPageCaveat';
import MarketSummaryPanel from './MarketSummaryPanel';
import MarketTabs from './MarketTabs';
import TaiwanMarketTab from './TaiwanMarketTab';
import './market.css';

export const metadata: Metadata = {
  title: '大盤與國際 | 股市大佬 TradeBoss',
  description:
    '台指期 × 加權指數、產業成交額熱力、成交動能、大盤期權與上市上櫃市場廣度；已發生的公開統計，非買賣建議。',
};

export default function MarketPage(): ReactElement {
  return (
    <>
      {/* M0 市場分類次導覽（在 main 內，「總覽」active） */}
      <MarketCatNav />
      <div className="page-enter">
        {/* M1 頁首 hero（大盤與國際） */}
        <MarketHero />
        {/* M2 指數行情跑馬燈（共用元件，資料口徑見 @/components/IndexMarquee） */}
        <IndexMarquee />
        {/* M3 客觀漲跌摘要（規則加總） */}
        <MarketSummaryPanel />
        {/* M4 大盤分頁 sticky nav（client），台灣市場內容 M5–M13 由 server 組好傳入 */}
        <MarketTabs>
          <TaiwanMarketTab />
        </MarketTabs>
        {/* M14 頁尾資料口徑（資料日取最新交易日，上游失敗標「尚未入庫」） */}
        <MarketPageCaveat />
      </div>
    </>
  );
}
