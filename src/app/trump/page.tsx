/**
 * /trump/ 美國政策題材（today 群組）。
 *
 * 逐字複刻 captured/login-capture/html/trump.html 的 <main> 結構與文案。
 * 殼由全域 layout.tsx 提供；本頁只輸出 <main> 內的內容（實站此頁**沒有**
 * 「相關功能切換」pill 導覽，直接由 page-enter 開始）。
 *
 * 資料（P0-1：接上真實資料）：美國政策 RSS 原文報導改由**自產** route
 * （GET /api/skynet/trump-radar；Google News RSS 英文＋白宮官方＋Google News
 * RSS 繁中）提供，資料區塊抽到 <TrumpData /> 客戶端元件。
 *
 * 兩項誠實降級（業主明示，非缺陷；違反「不造假」原則等於任務失敗）：
 *   1. **不翻譯**：本站無翻譯資源，直接顯示英文原文標題，UI 明確標示「未經翻譯」。
 *      → 故 hero 副標與「怎麼看」問答中「標題有繁中翻譯」的字樣移除（避免不實宣稱）。
 *   2. **不提供情緒分類**：實站的標題情緒標記內部矛盾，本站留白，並在「資料怎麼來？」
 *      與摘要區塊誠實說明（詳見 TrumpData 的 SENTIMENT_DISCLOSURE）。
 *
 * 靜態文案（英雄區川普 SVG、「為什麼要盯這個人？」、兩個 <details>、歷史樣本警語）
 * 照抄實站，僅調整上述兩處不實宣稱。
 */
import type { Metadata } from 'next';
import ShareButton from './ShareButton';
import TrumpData from './TrumpData';
import '../live/today-group.css';

export const metadata: Metadata = {
  title: '美國政策題材 | 股市大佬 TradeBoss',
  description:
    '直接連到美國媒體／白宮等原文，看關稅、晶片管制、Fed 利率與地緣政治的標題主題分類（英文原文，未經翻譯）。只是新聞標題分類，不預測任何股票或指數會漲會跌。',
};

export default function TrumpPage() {
  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl">
        <section className="hero-hud rounded-2xl px-5 py-6">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 md:h-14 md:w-14"
            >
              <svg viewBox="0 0 64 64" className="h-full w-full">
                <path d="M10 64c2-11 9-16 22-16s20 5 22 16z" fill="#1e2a3a" />
                <path d="M26 47l6 7 6-7 4 2-10 15-10-15z" fill="#eef3f9" />
                <path d="M32 54l-3 4 3 12 3-12z" fill="#d33a3a" />
                <ellipse cx="32" cy="30" rx="14" ry="16" fill="#f0bf95" />
                <path
                  d="M17 24c0-10 7-15 15-15s15 4 15 13c0 3-1 5-2 5-1-4-4-6-8-6-6 0-9 3-13 3-3 0-5 1-7 4-.4-1.3-.6-2.6 0-4z"
                  fill="#e8c35a"
                />
                <path d="M18 22c4-3 9-4 14-3 5 1 9 3 11 6-3-2-7-3-12-3s-9 .5-13 3z" fill="#f2d98a" />
                <ellipse cx="26" cy="30" rx="1.6" ry="1.9" fill="#2b3646" />
                <ellipse cx="38" cy="30" rx="1.6" ry="1.9" fill="#2b3646" />
                <path
                  d="M27 39q5 3 10 0"
                  stroke="#b5714f"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-accent">美國原文 · 政策風向研究</p>
              <h1 className="mt-1 text-2xl font-black md:text-3xl">美國政策題材</h1>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
                直接連到
                <strong className="text-ink">美國媒體／白宮等原文</strong>
                ；標題為英文原文（未經翻譯），點進去讀完整報導。
              </p>
            </div>
            <ShareButton />
          </div>
          <div className="mt-4 rounded-xl border border-accent/25 bg-accent-soft/40 p-4">
            <p className="text-[13.5px] font-black text-ink">為什麼要盯這個人？</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              台股有六成市值靠電子出口，客戶大多在美國。他一句關稅、一紙晶片管制， 隔天台積電、鴻海、封測、被動元件就會先反應——不是因為公司變好變壞， 是因為
              <strong className="text-ink">遊戲規則被改了</strong>。 很多人早上看到跳空缺口卻不知道發生什麼事，答案通常在這裡， 而且台媒轉述往往慢半天又走味，所以我們直接接美國原文。
            </p>
          </div>
        </section>

        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
            <span>第一次用這頁？點開 30 秒說明</span>
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">把跟川普、關稅、晶片管制、Fed 利率、地緣政治有關的美國新聞自動分類整理，讓你一眼看到「最近國際上在吵什麼」。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想知道大盤為什麼忽然大漲大跌、背後有沒有國際消息在推的人。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看各政策主題的聲量分布，感受最近國際上在吵哪些題材；想深入就點「讀美國原文」核對來源，台媒轉述放最下面只供對照。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這只是新聞標題分類，不預測任何股票或指數會漲會跌。消息常常「利多出盡」，別看到利多就急著進場。</dd>
            </div>
          </dl>
        </details>

        <details className="group mt-3">
          <summary className="cursor-pointer text-[12px] leading-relaxed text-muted/75">
            歷史樣本整理，非買賣建議
            <span className="transition group-open:rotate-180"> ▾</span>
          </summary>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">本頁只整理已發生的量價、籌碼與歷史樣本，不代表未來。 請自行核對資料日、樣本數、流動性與風險界線，並自行承擔決策結果。</p>
        </details>

        <TrumpData />
      </div>
    </div>
  );
}
