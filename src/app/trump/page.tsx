/**
 * /trump/ 美國政策題材（today 群組）。
 *
 * 逐字複刻 captured/login-capture/html/trump.html 的 <main> 結構與文案。
 * 殼由全域 layout.tsx 提供；本頁只輸出 <main> 內的內容（實站此頁**沒有**
 * 「相關功能切換」pill 導覽，直接由 page-enter 開始）。
 *
 * 資料：美國政策 RSS 原文報導目前**無對接來源**（現有 API 皆非此用途），
 * 故摘要儀表、報導列表、主題聲量、台媒轉述一律以 role="status" 的
 * 載入骨架如實呈現，不造假標題、不造假分數；靜態文案（英雄區、四問答、
 * 「資料怎麼來？」）照抄實站。
 */
import type { Metadata } from 'next';
import ShareButton from './ShareButton';
import '../live/today-group.css';

export const metadata: Metadata = {
  title: '美國政策題材 | 股市大佬 TradeBoss',
  description:
    '直接連到美國媒體／白宮等原文，看關稅、晶片管制、Fed 利率與地緣政治的標題敘事分類。只是新聞標題分類，不預測任何股票或指數會漲會跌。',
};

/** 載入骨架（對齊實站「載入中」語彙：role="status" + animate-pulse + 正在整理…）。 */
function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border border-line bg-surface p-3">
          <div className="h-3.5 w-3/4 rounded bg-line/60" />
          <div className="mt-2 h-3 w-1/2 rounded bg-line/40" />
        </div>
      ))}
      <p className="text-[12.5px] leading-relaxed text-muted">正在整理…</p>
    </div>
  );
}

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
                ；標題有繁中翻譯方便掃，點進去讀完整報導。
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
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看正面／負面新聞各幾則，感受風向；想深入就點「讀美國原文」核對來源，台媒轉述放最下面只供對照。</dd>
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

        <div className="mt-4 rounded-2xl border p-5 border-line bg-surface">
          <div className="text-[12.5px] font-bold text-muted">近期待觀察 · 美國政策標題敘事摘要</div>
          <div className="mt-4">
            <LoadingBlock rows={2} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            美國政策 RSS 原文來源尚未接入，摘要分數與正負面則數會在接入後由資料算出，不預先填入固定數字。
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <div className="text-[12.5px] text-muted">相關報導熱度</div>
            <div className="mt-2">
              <LoadingBlock rows={1} />
            </div>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl p-5  ">
            <div className="text-[12.5px] text-muted">資料怎麼來？</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink">主資料：美國媒體／白宮等公開 RSS 原文連結；標題可翻成繁中方便閱讀，點進去仍是英文原文。台媒僅作輔助參考。正負面敘事＝標題關鍵字規則分類。</p>
          </div>
        </div>

        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">美國原文報導</h2>
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <LoadingBlock rows={5} />
        </div>

        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">政策主題聲量</h2>
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <LoadingBlock rows={2} />
        </div>

        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">台媒轉述（輔助）</h2>
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <LoadingBlock rows={3} />
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">以美國原文報導為主的政策敘事整理，不代表股價方向；請點「讀美國原文」自行核對完整內容。</p>
      </div>
    </div>
  );
}
