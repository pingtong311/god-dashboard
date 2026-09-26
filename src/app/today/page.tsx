/**
 * /today 今日戰情（會員登入後的首頁，底部列「戰情」分頁）
 * ----------------------------------------------------------------------------
 * 100% 忠實複刻 captured/login-capture/html/today.html 的 <main> 內容
 * （tab-today.html 為底部列「今天」tab 的抓取，main 內容與 today.html 僅差
 * 排行頭像的漸層／ favicon 呈現，本頁採漸層首字版本）。
 *
 * 外殼（<main>、header、底部列、頁尾）由全域 layout.tsx 提供，本頁只輸出
 * <main> 內的內容：頁首 → 指數行情跑馬燈 → 常用工具 → 今日一句／指數與家數 →
 * 大盤期權 → 注意與處置 → 法人買超 Top3 → 日報／自選／盤感 → 口徑。
 *
 * ⚠ today.html 的 <main> 內**沒有**「市場分類」（MarketCatNav）與
 *   「相關功能切換」（FeatureSubNav）次導覽，本頁也不渲染它們。
 *
 * 資料策略（誠實標示，不造假）：
 *   - 真實來源：指數行情跑馬燈（@/components/IndexMarquee，server 自載）、
 *     今日一句／指數與家數（client fetch /api/skynet/market-overview）、
 *     台指期近月（client fetch /api/skynet/futures）、
 *     大盤期權（共用 server 元件 FuturesOptionsPanel）、
 *     法人買超 Top3（client fetch /api/skynet/t86）
 *   - 無對接來源：加權「近 10 日」與個股迷你走勢圖、處置名單 →
 *     保留 capture 外殼與文案，圖面／名單以 animate-pulse 骨架 + role="status"
 *     呈現，不嵌入快照路徑或截圖名單冒充當日資料
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import IndexMarquee from '@/components/IndexMarquee';
import FuturesOptionsPanel from '@/components/FuturesOptionsPanel';
import ArrowRightLink from '@/components/ArrowRightLink';
import TodayDataBadge from './TodayDataBadge';
import TodayMarketBrief from './TodayMarketBrief';
import InstitutionalTop3 from './InstitutionalTop3';
import RiskBrief from './RiskBrief';
import TodayCaveat from './TodayCaveat';
import {
  ICON_ARTICLE,
  ICON_DUMBBELL,
  ICON_GRID,
  ICON_PULSE,
  ICON_SEARCH,
  ICON_STAR,
} from './today-data';

export const metadata: Metadata = {
  title: '今日市場 | 股市大佬 TradeBoss',
  description:
    '先看市場概況，再查你關心的股票。加權、台指期、漲跌家數、成交金額、大盤期權與法人買超；已發生的公開統計，非買賣建議。',
};

/** 常用工具四格（today.html 逐字：連結、圖示、文案）。 */
const TOOLS: ReadonlyArray<{ href: string; label: string; icon: string }> = [
  { href: '/stock/', label: '查個股', icon: ICON_SEARCH },
  { href: '/reports/', label: '看日報', icon: ICON_ARTICLE },
  { href: '/watchlist/', label: '自選股', icon: ICON_STAR },
  { href: '/dojo/', label: '練功房', icon: ICON_DUMBBELL },
];

/** Phosphor 圖示（fill="currentColor"，寬高由 size 指定）。 */
function ToolIcon({ d, size }: { d: string; size: number }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export default function TodayPage(): ReactElement {
  return (
    <div className="page-enter">
      <div className="overflow-x-clip">
        <header className="mb-4 border-b border-line pb-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-ink md:text-3xl">今日市場</h1>
            <button
              type="button"
              aria-expanded="false"
              className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm font-bold text-muted hover:bg-surface-2"
            >
              調整首頁
            </button>
          </div>
          <p className="mb-3 mt-1 text-sm leading-relaxed text-muted">
            先看市場概況，再查你關心的股票。
          </p>
          <TodayDataBadge />
        </header>

        {/* 指數行情跑馬燈（共用元件，資料口徑見 @/components/IndexMarquee） */}
        <IndexMarquee />

        {/* 常用工具 */}
        <nav aria-label="常用工具" className="mb-4 min-w-0">
          <div className="grid grid-cols-4 gap-2">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-line/70 bg-surface px-1 py-3 text-center transition hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent active:scale-95"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <ToolIcon d={tool.icon} size={20} />
                </span>
                <span className="text-sm font-bold leading-tight text-ink">{tool.label}</span>
              </Link>
            ))}
          </div>
          <Link
            href="/hub/"
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent"
          >
            <ToolIcon d={ICON_GRID} size={18} />
            全部工具
          </Link>
        </nav>

        <div className="mt-4 space-y-4">
          {/* 今日一句 + 指數與家數（client，market-overview + futures） */}
          <TodayMarketBrief />

          {/* 大盤期權（共用 server 元件） */}
          <div>
            <FuturesOptionsPanel />
          </div>

          {/* 注意與處置（無資料源：骨架） */}
          <RiskBrief />

          {/* 法人買超 Top3（client，t86） */}
          <InstitutionalTop3 />

          {/* 日報／自選／盤感三小卡（靜態文案，逐字） */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="data-panel hud-panel glass rounded-2xl p-5  ">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[13.5px] font-black">
                  <ToolIcon d={ICON_ARTICLE} size={17} />
                  日報
                </h2>
                <ArrowRightLink href="/reports/">打開</ArrowRightLink>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                盤後一篇整理公開數字。約 22:01 後可讀。
              </p>
            </div>
            <div className="data-panel hud-panel glass rounded-2xl p-5  ">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[13.5px] font-black">
                  <ToolIcon d={ICON_STAR} size={17} />
                  自選
                </h2>
                <ArrowRightLink href="/watchlist/">名單</ArrowRightLink>
              </div>
              <div className="mt-2">
                <p className="text-[12.5px] leading-relaxed text-muted">
                  加第一檔。盤中看分點，收盤看集中度。
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-3 text-[12.5px] font-black text-bg"
                >
                  搜尋股票
                </button>
              </div>
            </div>
            <div className="data-panel hud-panel glass rounded-2xl p-5  ">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[13.5px] font-black">
                  <ToolIcon d={ICON_PULSE} size={17} />
                  盤感
                </h2>
                <ArrowRightLink href="/guess/">去練習</ArrowRightLink>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                匿名歷史 K 棒練習，不涉及個股買賣。
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
          新聞與社群不放第一屏。要查功能用頂欄搜尋；要看指數細節到
          <Link href="/market/" className="mx-1 font-bold text-accent">
            市場
          </Link>
          。
        </p>

        <TodayCaveat />
      </div>
    </div>
  );
}
