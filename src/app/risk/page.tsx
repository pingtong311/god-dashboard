/**
 * /risk 注意與處置
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/risk.html 的 <main> 內容。
 * 含「市場分類」（MarketCatNav）與「相關功能切換」（FeatureSubNav）次導覽。
 *
 * 資料：由 <RiskClient /> 向本站代理 `GET /api/skynet/risk` 取真實資料
 * （TWSE announcement/punish + TPEx tpex_disposal_information 自產）。
 * 缺來源的子清單誠實留空（見 API 的 gaps），絕不寫死 capture 截圖名單。
 */

import type { Metadata } from 'next';
import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';
import RiskClient from './RiskClient';
import './page.css';

export const metadata: Metadata = {
  title: '注意與處置｜股市大佬 TradeBoss',
  description: '交易所公開的處置中、即將分盤與相關制度名單。',
};

export default function RiskPage(): React.ReactElement {
  return (
    <>
      <MarketCatNav />
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">注意與處置</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            交易所公開的處置中、即將分盤與相關制度名單。
          </p>
        </section>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                三類公開制度資料：處置中、處置候選與融券回補期間。處置措施可能改變撮合頻率、當沖資格與流動性，實際措施以交易所公告為準。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                先核對公告期間、處置原因與交易限制；候選名單只是依公開條件整理，不代表一定會被處置。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                要查即將恢復普通交易的日期，請到「事件雷達」頁的「處置解禁」區。
              </dd>
            </div>
          </dl>
        </details>
        <RiskClient />
      </div>
    </>
  );
}
