/**
 * /strategy 歷史條件篩選庫 — 複刻「股市大佬 TradeBoss」實站 https://blackstockai.com/strategy/。
 * ----------------------------------------------------------------------------
 * 【取得方式與忠實度聲明（重要，勿刪）】
 * 1. 實站 /strategy/ 的 HTML 可取得：以 curl + 真實 Chrome UA 請求回
 *    HTTP 200、約 60 KB（見報告）。但該頁 <main> 內容為「登入後才載入的
 *    Client Component」——SSR HTML 的 <main id="main-content"> 內只有空殼
 *    （內容是 lazy 元件 $L26），且 /api/strategies 未登入即回
 *    401 {ok:false,error:"請先登入會員"}。因此「逐字複刻版面」無法直接取自
 *    HTML，改由實站該頁的 client chunk（/_next/static/chunks/156wpwo2lfu2e.js）
 *    還原其真實 JSX 結構與文案，逐字採用。
 * 2. 版面外框（MarketCatNav + FeatureSubNav）由實站 RSC flight 的元件對照表確認：
 *    <main> 子節點 = PremiumPageMark / SponsorGate / MarketCatNav / FeatureSubNav / page。
 *    （PremiumPageMark、SponsorGate 為實站會員標記元件，本複刻站無此機制，略過。）
 *
 * 【資料策略（誠實，不造假）】
 * - 策略目錄 19 筆：資料（key/name/category/desc）逐字取自實站 API 快照
 *   captured/login-capture/api/blackstockai.com_api_strategies_.json，以靜態呈現。
 *   註（命名勘誤，已更正）：原推論把 key=short_inc 記成「融資大增」，是**語意相反**的
 *   錯誤（融資＝看多、融券＝看空），會讓條件選股結果反向。**已更正**：實站 API 快照中
 *   short_inc 的 name 為「融券大增」、desc 為「融券餘額較前一資料日增加 ≥ 5%。」，
 *   與 key（short＝融券）一致。更正依據＝實站 API 快照的 key
 *   （captured/login-capture/api/blackstockai.com_api_strategies_.json）。
 *   同理，news 第二筆的 key 為 bad_news_hold（非 bad_news_vol）。請勿再依舊 spec 改回。
 * - 實站本頁另含兩區塊「融資／大戶／量價條件交集」與「估值條件篩選」，其資料來自
 *   會員 API（/api/smart-accumulation、/api/value-screen）。本複刻站未接此資料源，
 *   故以「本站無法提供」的靜態說明呈現——不用 0 代替、不捏造、不以載入中骨架佯裝。
 *   該兩區塊的「本站無法提供此清單」文字為**本站自撰政策文字（實站無此段）**，
 *   不列入「逐字對齊 capture」；僅區塊標題與 hint 逐字取自實站。
 *
 * 【導覽入口（已查證）】
 * 實站 /strategy/ 不是孤兒：實站 /research/ 的「切換研究視角」卡（客觀條件目錄／
 * 「策略條件庫」）以 <a href="/strategy/"> 連入。本站 src/app/research/page.tsx:61
 * 已一致複刻該連結，故 /strategy 於本站同樣可從 /research 進入。
 *
 * 為 Server Component：資料為靜態，無需 client state。
 */
import type { Metadata } from 'next';

import MarketCatNav from '@/components/MarketCatNav';
import FeatureSubNav from '@/components/FeatureSubNav';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '歷史條件篩選庫 | 股市大佬 TradeBoss',
  description:
    '點一組公式，列出資料日符合明列門檻的股票；全部為盤後歷史資料的確定性條件篩選，不提供未來方向、機率或平台產生價位。',
};

/** 策略分類（實站僅三值 technical / chip / news）。 */
type StrategyCategory = 'technical' | 'chip' | 'news';

/** 單一策略條件（key/name/category/desc 逐字取自實站 API 快照）。 */
interface Strategy {
  readonly key: string;
  readonly name: string;
  readonly category: StrategyCategory;
  readonly desc: string;
}

/** 19 筆策略條件（逐字取自實站 /api/strategies 快照，順序照快照）。 */
const STRATEGIES: readonly Strategy[] = [
  { key: 'break20', name: '收盤高於前 20 日最高價且量增', category: 'technical', desc: '資料日收盤高於前 20 日最高價，且成交量為 20 日均量 1.5 倍以上。' },
  { key: 'ma_bull', name: '收盤／5 日／20 日均線排列', category: 'technical', desc: '資料日收盤 > MA5 > MA20。' },
  { key: 'vol_red', name: '單日漲幅與量比條件', category: 'technical', desc: '資料日漲幅逾 3.5%、量比達 2 倍且收盤高於開盤。' },
  { key: 'reclaim_ma20', name: '收盤由 MA20 下方轉為上方', category: 'technical', desc: '前一資料日收盤不高於 MA20，本資料日收盤高於 MA20。' },
  { key: 'strong_up', name: '單日漲幅與成交額門檻', category: 'technical', desc: '資料日漲幅 ≥ 5% 且成交金額 ≥ 3 億元。' },
  { key: 'gap_up', name: '向上跳空未回補', category: 'technical', desc: '開盤高於參考價 1.5% 以上，且當日最低仍高於參考價。' },
  { key: 'gap_down', name: '向下跳空未回補', category: 'technical', desc: '開盤低於參考價 1.5% 以上，且當日最高仍低於參考價。' },
  { key: 'bb_upper', name: '布林通道上軌', category: 'technical', desc: '資料日收盤觸及或高於 20 日均線＋2 倍標準差；只描述目前區間位置。' },
  { key: 'bb_middle', name: '布林通道中軌附近', category: 'technical', desc: '資料日收盤位於 20 日均線上下 1% 內。' },
  { key: 'bb_lower', name: '布林通道下軌', category: 'technical', desc: '資料日收盤觸及或低於 20 日均線－2 倍標準差；只描述目前區間位置。' },
  { key: 'foreign_buy3', name: '外資連買 3 日', category: 'chip', desc: '外資連續 3 個交易日買超。' },
  { key: 'trust_buy3', name: '投信連買 3 日', category: 'chip', desc: '投信連續 3 個交易日買超。' },
  { key: 'both_buy', name: '外資與投信當日同買超', category: 'chip', desc: '資料日外資與投信買賣超皆為正值。' },
  { key: 'concentrate', name: '前 15 分點淨買占比', category: 'chip', desc: '前 15 分點淨買占成交量 ≥ 15%，且收盤高於開盤。' },
  { key: 'margin_inc', name: '融資大增', category: 'chip', desc: '融資餘額較前一資料日增加 ≥ 3%。' },
  { key: 'margin_dec', name: '融資大減', category: 'chip', desc: '融資餘額較前一資料日減少 ≥ 3%。' },
  { key: 'short_inc', name: '融券大增', category: 'chip', desc: '融券餘額較前一資料日增加 ≥ 5%。' },
  { key: 'good_news_vol', name: '正面敘事與量價條件', category: 'news', desc: '新聞標題規則分類為正面，資料日漲幅逾 2% 且量比達 1.5。' },
  { key: 'bad_news_hold', name: '負面敘事與跌幅條件', category: 'news', desc: '新聞標題規則分類為負面，資料日跌幅小於 1%。' },
];

/**
 * 分類標籤（逐字取自實站元件 r = {technical:"日 K 條件", chip:"公開籌碼條件", news:"新聞敘事條件"}）。
 * 註：task 交辦用語為「技術面／籌碼面／新聞面」，與實站標籤不同，本頁以實站原文為準。
 */
const CATEGORY_META: readonly { readonly id: StrategyCategory; readonly label: string }[] = [
  { id: 'technical', label: '日 K 條件' },
  { id: 'chip', label: '公開籌碼條件' },
  { id: 'news', label: '新聞敘事條件' },
];

/** 誠實的「無法提供」區塊（非載入中骨架；明確說明原因，不用 0 代替、不捏造）。 */
function UnavailableBlock({ reason }: { readonly reason: string }) {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5 mt-3">
      <p className="text-[14.5px] font-bold text-ink">本站無法提供此清單</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{reason}</p>
    </div>
  );
}

export default function StrategyPage() {
  return (
    <>
      <MarketCatNav />
      <FeatureSubNav />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">歷史條件篩選庫</h1>
        <p className="mt-1 text-[13.5px] text-muted">點一組公式，列出資料日符合明列門檻的股票。</p>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">每張卡片是一組可重算的日 K、法人、融資券或新聞標題分類條件。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">點卡片查看資料日符合條件的資料列，再進個股頁核對原始數值與日期。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">符合條件只描述已發生資料，不代表後續方向或機率。</dd>
            </div>
          </dl>
        </details>

        {/* 區塊一：融資／大戶／量價條件交集（實站資料源為會員 API，本複刻站未接） */}
        <h2 className="mt-6 text-lg font-black text-ink">融資／大戶／量價條件交集</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">同時比對區間振幅、資料日量比、融資餘額增減與千張以上持股級距增減。</p>
        <UnavailableBlock reason="實站此區塊需「盤後融資券餘額＋千張以上持股級距＋全市場量價」的交叉掃描資料源（會員 API /api/smart-accumulation）。本複刻站未接此資料源，故無法產出此清單，也不以 0 或空清單佯裝。" />

        {/* 區塊二：估值條件篩選（實站資料源為會員 API，本複刻站未接） */}
        <h2 className="mt-6 text-lg font-black text-ink">估值條件篩選</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">本益比 5~15 倍、股價淨值比 &lt; 2、殖利率 ≥ 4%。點欄位標題可排序，再點一次切換升／降冪。</p>
        <UnavailableBlock reason="實站此區塊需「全市場本益比／股價淨值比／殖利率」的盤後快照資料源（會員 API /api/value-screen）。本複刻站未接此資料源，故無法產出此清單，也不以 0 或空清單佯裝。" />

        {/* 區塊三：策略目錄（依 category 分三組，逐字取自實站 API 快照） */}
        {CATEGORY_META.map((meta) => {
          const items = STRATEGIES.filter((item) => item.category === meta.id);
          return (
            <section key={meta.id}>
              <h2 className="mt-6 text-lg font-black text-ink">
                {meta.label}（{items.length}）
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <div key={item.key} className="data-panel hud-panel glass rounded-2xl p-5">
                    <p className="text-lg font-black text-accent">{item.name}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <p className="mt-6 text-sm text-muted">全部為盤後歷史資料的確定性條件篩選，不提供未來方向、機率或平台產生價位。</p>
      </div>
    </>
  );
}
