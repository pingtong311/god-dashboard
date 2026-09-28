/**
 * /swing 波段條件 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/swing.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（FeatureSubNav + hero-hud
 * + 說明 details + 資料週期列 + 維度切換 + 16 個條件頁籤 + 條件卡片清單
 * + 口徑註記）。
 *
 * 資料策略（P0-1：接上真實資料）：
 *   16 個條件頁籤的標籤、計數與清單皆改為真實資料——由本站**自產**（免費官方
 *   資料自算），非代理實站（實站 /api/swing-hub 已封鎖，實測 HTTP 403）。
 *   資料由 <SwingClient /> 於客戶端向 GET /api/skynet/swing-hub 取得。
 *   資料未入庫時誠實顯示「累積中／尚無資料源」，絕不以 0 或假資料填充。
 *
 * 為 Server Component：僅外框與說明文字為靜態，互動清單交客戶端元件。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureSubNav from '@/components/FeatureSubNav';
import SourceBadge from '@/components/SourceBadge';
import { WHALE_MIRROR_META } from './mirror/whale-weekly-2026-09-18';
import SwingClient from './SwingClient';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '波段條件 | 股市大佬 TradeBoss',
  description:
    '把集保持股級距、均線排列、法人買賣超、營收與區間報酬拆成可核對的歷史條件。不提供未來方向、機率或平台產生價位。',
};

export default function SwingPage() {
  return (
    <>
      <FeatureSubNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">波段條件</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">把集保持股級距、均線排列、法人買賣超、營收與區間報酬拆成可核對的歷史條件。 不提供未來方向、機率或平台產生價位。</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">這頁偏<b className="text-ink">波段</b>（抱幾天到幾週）。 想當沖看 <Link href="/picks/" className="text-accent underline-offset-4 hover:underline">量價觀察</Link>； 想觀察隔日沖出貨看 <Link href="/fade/" className="text-accent underline-offset-4 hover:underline">隔日沖分點股</Link>。</p>
        </section>
        {/*
          資料缺口揭露（放在頁首區，不塞進卡片區以免偽造實站 DOM）：
          大戶持股的「週增減／連續週數」需 TDCC 集保歷史週序列，本站目前只累積 1 週、
          無法自算 → 暫借實站 2026-09-18 快照（site-mirror），故標明來源與基準日。
        */}
        <SourceBadge
          provenance={WHALE_MIRROR_META}
          note="僅限大戶持股的週增減／連續週數欄位；其餘條件為本站自產"
          className="mt-4 max-w-2xl"
        />
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
            <span>第一次用這頁？點開 30 秒說明</span>
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">每個頁籤是一組「講清楚門檻」的選股條件（例如站上季線、帶量突破…），列出目前符合的股票，給你做波段功課的名單。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">不想每天盯盤、想找「抱幾天到幾週」波段機會的人。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">切換上面的頁籤看不同條件；點任一張卡片到個股頁，核對資料日期與原始數字再決定。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這是「符合歷史條件」的清單，不是保證會漲。同時符合多個條件也只是資料交集，別當成訊號無腦買。</dd>
            </div>
          </dl>
        </details>
        <SwingClient />
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">全部為歷史公開資料的條件篩選；不提供未來方向、機率或平台產生價位。</p>
      </div>
    </>
  );
}
