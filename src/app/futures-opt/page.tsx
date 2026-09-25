/**
 * /futures-opt/ 期選盤後（today 群組）。
 *
 * 逐字複刻 captured/login-capture/html/futures-opt.html 的 <main> 結構與文案。
 * 殼由全域 layout.tsx 提供；實站此頁**沒有**「相關功能切換」pill 導覽。
 *
 * 資料：VIX／夜盤法人（期貨、選擇權）／選擇權大額未平倉目前**無對接來源**
 * （/api/skynet/futures 僅提供台指期近月收盤，與本頁欄位不同），
 * 故四個資料區一律以 role="status" 的載入骨架如實呈現，不造假數字；
 * 「資料日」取最新交易日（resolveLatestTradingDate），取不到就標示「整理中」。
 */
import type { Metadata } from 'next';
import { resolveLatestTradingDate, ymdToIso } from '@/lib/marketOverview';
import '../live/today-group.css';

export const metadata: Metadata = {
  title: '期選盤後 | 股市大佬 TradeBoss',
  description:
    '三個盤後公開數字：市場的恐慌程度（VIX）、大戶留了多少倉、以及法人在夜盤買賣了多少。用來看大盤的整體氣氛。',
};

/** 載入骨架（對齊實站「載入中」語彙：role="status" + animate-pulse + 正在整理…）。 */
function LoadingPanel({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex justify-between gap-3 border-b border-line/60 px-4 py-2 last:border-0"
        >
          <div className="h-3.5 w-16 rounded bg-line/60" />
          <div className="h-3.5 w-40 rounded bg-line/40" />
        </div>
      ))}
      <p className="px-4 text-[12px] leading-relaxed text-muted">正在整理…</p>
    </div>
  );
}

/** 章節標題（實站 section-mark 語彙，逐字照抄 class）。 */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-9 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="section-mark" />
          <h2 className="text-lg font-bold tracking-tight md:text-xl">{children}</h2>
        </div>
      </div>
    </div>
  );
}

export default async function FuturesOptPage() {
  let dataDate = '整理中';
  try {
    const ymd = await resolveLatestTradingDate();
    if (ymd) dataDate = ymdToIso(ymd);
  } catch {
    // 取不到最新交易日就維持「整理中」，不回填假日期。
  }

  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">期選盤後</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">三個盤後公開數字：市場的恐慌程度（VIX）、大戶留了多少倉、 以及法人在夜盤買賣了多少。用來看大盤的整體氣氛。</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          資料日 <b className="text-ink">{dataDate}</b>
          <span className="ml-2">下次更新 下一交易日 23:08</span>
        </p>
      </section>

      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
          <span>第一次用這頁？點開 30 秒說明</span>
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">期貨和選擇權是拿「大盤指數」來交易的商品，不是個股。大戶和法人常用它們來避險或押方向，所以觀察它們可以看出有錢的人對整個大盤在想什麼。這一頁收三個盤後公開數字：VIX（恐慌指數）、大額交易人的未平倉（大戶留了多少倉沒走）、夜盤法人買賣（台股收盤後的盤，法人動作會先在這裡出現）。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想先抓大盤氣氛再決定要不要做個股的人。也適合做台指期、或想知道「今天晚上外資在夜盤有沒有大動作」的人。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">VIX 越高代表市場越緊張，通常出現在大跌的時候，低的時候代表大家覺得沒事。未平倉看的是大戶「還留著多少沒平掉的倉」，留倉多代表他們還在場上。夜盤法人則是台股收盤後那一盤的買賣，可以當隔天開盤前的參考氣氛。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這些都是整體氣氛，不能直接推到某一檔個股。而且大戶留倉可能是避險（手上有股票所以放空期貨保護），不一定是看空，所以不要當成方向訊號。只想做個股的人，看「今日戰情」和「個股盯盤」會更實用。</dd>
          </div>
        </dl>
      </details>

      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <p className="text-sm text-muted">臺指 VIX</p>
        <div className="mt-2">
          <div role="status" aria-live="polite" className="animate-pulse space-y-2">
            <div className="h-9 w-28 rounded bg-line/50" />
            <p className="text-[12px] leading-relaxed text-muted">正在整理…</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          VIX 資料來源（TAIFEX 期選盤後）尚未接入，不預先填入固定數字。
        </p>
      </div>

      <SectionHeading>夜盤法人（期貨）</SectionHeading>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <LoadingPanel rows={3} />
      </div>

      <SectionHeading>夜盤法人（選擇權）</SectionHeading>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <LoadingPanel rows={3} />
      </div>

      <SectionHeading>選擇權大額未平倉</SectionHeading>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <LoadingPanel rows={6} />
      </div>
    </div>
  );
}
