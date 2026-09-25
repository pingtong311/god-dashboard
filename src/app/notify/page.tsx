import type { Metadata } from 'next';
import MineSubNav from '../alerts/MineSubNav';

/**
 * /notify/「通知中心」（戰情室警報）。
 *
 * 逐字照抄 captured/login-capture/html/notify.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 此頁為設定頁的**全關閉狀態**：通知總開關與所有主題開關皆 off（實站未開啟時即如此），
 * 送出頻率維持「3 分鐘摘要」。沒有推播主題、沒有登記手機、沒有收件匣內容，
 * 皆照抄實站的空狀態文案，不捏造假通知。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description: '通知中心：盤中盯價量，通知照你的條件來。',
};

/** Phosphor Bell（21px）——通知總開關標題圖示，d 值逐字取自 notify.html。 */
const BELL_PATH =
  'M168,224a8,8,0,0,1-8,8H96a8,8,0,1,1,0-16h64A8,8,0,0,1,168,224Zm53.85-32A15.8,15.8,0,0,1,208,200H48a16,16,0,0,1-13.8-24.06C39.75,166.38,48,139.34,48,104a80,80,0,1,1,160,0c0,35.33,8.26,62.38,13.81,71.94A15.89,15.89,0,0,1,221.84,192ZM208,184c-7.73-13.27-16-43.95-16-80a64,64,0,1,0-128,0c0,36.06-8.28,66.74-16,80Z';

/** Phosphor Info（20px）——裝置狀態圖示。 */
const INFO_PATH =
  'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z';

/** Phosphor BellRinging（16px）——發送測試通知按鈕圖示。 */
const BELL_RINGING_PATH =
  'M225.81,74.65A11.86,11.86,0,0,1,220.3,76a12,12,0,0,1-10.67-6.47,90.1,90.1,0,0,0-32-35.38,12,12,0,1,1,12.8-20.29,115.25,115.25,0,0,1,40.54,44.62A12,12,0,0,1,225.81,74.65ZM46.37,69.53a90.1,90.1,0,0,1,32-35.38A12,12,0,1,0,65.6,13.86,115.25,115.25,0,0,0,25.06,58.48a12,12,0,0,0,5.13,16.17A11.86,11.86,0,0,0,35.7,76,12,12,0,0,0,46.37,69.53Zm173.51,98.35A20,20,0,0,1,204,200H171.81a44,44,0,0,1-87.62,0H52a20,20,0,0,1-15.91-32.12c7.17-9.33,15.73-26.62,15.88-55.94A76,76,0,0,1,204,112C204.15,141.26,212.71,158.55,219.88,167.88ZM147.6,200H108.4a20,20,0,0,0,39.2,0Zm48.74-24c-8.16-13-16.19-33.57-16.34-63.94A52,52,0,1,0,76,112c-.15,30.42-8.18,51-16.34,64Z';

/** Phosphor BellSimple（24px）——App／電腦推播主題卡片圖示。 */
const BELL_SIMPLE_PATH =
  'M208,192H48a8,8,0,0,1-6.88-12C47.71,168.6,56,147.81,56,112a72,72,0,0,1,144,0c0,35.82,8.3,56.6,14.9,68A8,8,0,0,1,208,192Z';

/** Phosphor SlidersHorizontal（24px）——個股條件提醒卡片圖示。 */
const SLIDERS_PATH =
  'M128,80a24,24,0,1,1-24-24A24,24,0,0,1,128,80Zm40,72a24,24,0,1,0,24,24A24,24,0,0,0,168,152Z';

/** Phosphor Calendar（24px）——持股事件日曆卡片圖示。 */
const CALENDAR_PATH =
  'M216,48V88H40V48a8,8,0,0,1,8-8H208A8,8,0,0,1,216,48Z';

/** 推播主題區塊（標題＋條列＋每列的開關）。 */
type TopicGroup = {
  title: string;
  /** 條件說明（選用，部分區塊有）。 */
  note?: { summary: string; body: string };
  rows: string[];
};

/** 五個推播主題區塊，逐字照抄 notify.html 的開關列表。 */
const TOPIC_GROUPS: readonly TopicGroup[] = [
  {
    title: '個股急動',
    rows: ['突然急拉', '今日漲幅已達 8%', '股價觸及漲停價', '突然急跌', '今日跌幅已達 8%', '股價觸及跌停價'],
  },
  {
    title: '盤中爆量',
    rows: ['盤中爆量（成交量突然放大）'],
  },
  {
    title: '盤中資金與交叉',
    note: {
      summary: '條件說明',
      body: '預設關閉；每檔每類每日最多一次。資金是價量估算，不是分點或法人真實進出；交叉只描述既有事件同時出現，不是進場訊號。沿用價量、自選、靜音設定。',
    },
    rows: ['價量估算值變化（非實際資金流）', '同一股票出現多項資料變化'],
  },
  {
    title: '族群',
    note: {
      summary: '條件說明',
      body: '同產業多檔走強且量能夠大時推一次（同族群同日最多一次）。預設關閉；打開才收，避免無腦狂推。',
    },
    rows: ['同產業多檔成交加快、價格上漲'],
  },
  {
    title: '大盤與盤後',
    rows: ['大盤／櫃買劇烈波動', '台指期夜盤大波動', '盤後名單摘要'],
  },
  {
    title: '國際政策',
    rows: ['川普／關稅重要稿'],
  },
];

/** 暫停提醒三按鈕。 */
const QUIET_HOURS: readonly string[] = ['安靜 1 小時', '今晚不打擾', '安靜 24 小時'];

/** 關閉態開關（aria-pressed=false、軌道 bg-line）。 */
function ToggleOff({ label, size = 'sm' }: { label: string; size?: 'sm' | 'lg' }) {
  const track =
    size === 'lg'
      ? 'relative h-8 w-14 shrink-0 rounded-full transition active:scale-95 disabled:opacity-40 bg-line'
      : 'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 bg-line';
  const knob =
    size === 'lg'
      ? 'absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all left-1'
      : 'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all left-0.5';
  return (
    <button type="button" className={track} aria-pressed="false" aria-label={label}>
      <span className={knob} />
    </button>
  );
}

export default function NotifyPage() {
  return (
    <>
      <MineSubNav active="推播" />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">通知中心</h1>
        <p className="mt-1 text-[13.5px] text-muted">盤中盯價量，通知照你的條件來。</p>
        <nav aria-label="通知中心分區" className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" aria-pressed="true" className="min-h-11 rounded-xl px-2 text-sm font-bold bg-accent text-bg">盤中設定</button>
          <button type="button" aria-pressed="false" className="min-h-11 rounded-xl px-2 text-sm font-bold bg-surface-2 text-ink">收件匣</button>
          <button type="button" aria-pressed="false" className="min-h-11 rounded-xl px-2 text-sm font-bold bg-surface-2 text-ink">公告投票</button>
        </nav>
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 [&>*]:min-w-0 [overflow-wrap:anywhere]">
          <div id="push-topics" className="scroll-mt-24">
            <div className="grid min-w-0 grid-cols-1 gap-4 [&>*]:min-w-0 [overflow-wrap:anywhere]">
              <div className="data-panel hud-panel glass rounded-2xl p-5  border-accent/40">
                <p className="mb-2 text-sm leading-relaxed text-muted">行情通知是在告訴你「剛剛發生什麼」，不是預測接下來會怎樣。漲幅達 8% 不代表會漲停。</p>
                <a href="/live/" className="mb-3 inline-flex min-h-11 items-center text-sm font-bold text-accent">同頁看五檔、成交與通知：盤中工作區 →</a>
                <h2 className="font-black">盤中通知怎麼送？</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed="false" className="min-h-11 rounded-xl px-2 text-sm font-bold disabled:opacity-50 bg-surface-2 text-ink">逐則即時</button>
                  <button type="button" aria-pressed="true" className="min-h-11 rounded-xl px-2 text-sm font-bold disabled:opacity-50 bg-accent text-bg">3 分鐘摘要</button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">即時不等摘要；3 分鐘合併一般行情。行情與手機系統仍可能有延遲。</p>
                <details className="mt-1 text-xs leading-relaxed text-muted">
                  <summary className="min-h-10 cursor-pointer py-2">切換後怎麼算？</summary>只影響新事件；已排入的摘要依原時間送出，不補送舊通知。個人到價提醒與重大市場通知不等待一般行情摘要。</details>
              </div>
              <nav aria-label="推播設定分類" className="grid grid-cols-3 gap-2">
                <button type="button" aria-pressed="true" className="min-h-11 rounded-xl px-1 text-xs font-bold bg-accent-soft text-accent">通知主題</button>
                <button type="button" aria-pressed="false" className="min-h-11 rounded-xl px-1 text-xs font-bold bg-surface-2 text-muted">價量篩選</button>
                <button type="button" aria-pressed="false" className="min-h-11 rounded-xl px-1 text-xs font-bold bg-surface-2 text-muted">裝置／測試</button>
              </nav>
              <div className="data-panel hud-panel glass rounded-2xl p-5  border-accent/40 bg-accent-soft/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-black text-ink">
                      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                        <path d={BELL_PATH} />
                      </svg>通知總開關</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">關掉後，急拉急跌、爆量、大盤、盤後摘要等主題都不會再推。 自選股與尾盤時段是過濾偏好，會保留你的設定。</p>
                  </div>
                  <ToggleOff label="通知總開關" size="lg" />
                </div>
                <p className="mt-3 rounded-xl px-3 py-2 text-[12.5px] font-bold bg-surface-2 text-muted">目前沒有任何推播主題開啟。先打開總開關，再勾主題。</p>
              </div>
              <div>
                <div className="mb-2">
                  <h2 className="text-[18px] font-black text-ink">選擇要收的主題</h2>
                  <p className="mt-0.5 text-[12.5px] text-muted">開啟的主題會送到已允許的電腦與 App；完整內容都會留在收件匣。</p>
                </div>
                <div className="grid gap-4">
                  {TOPIC_GROUPS.map((group) => (
                    <div key={group.title} className="data-panel hud-panel glass rounded-2xl p-5  ">
                      <b className="text-[13.5px]">{group.title}</b>
                      {group.note ? (
                        <details className="mt-1.5 text-xs leading-relaxed text-muted">
                          <summary className="min-h-10 cursor-pointer py-2">{group.note.summary}</summary>
                          <p>{group.note.body}</p>
                        </details>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        {group.rows.map((row) => (
                          <div
                            key={row}
                            className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5 transition opacity-45"
                          >
                            <span className="min-w-0">
                              <span className="block text-[12.5px] text-ink">{row}</span>
                            </span>
                            <ToggleOff label={row} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1.5 px-1 text-[12px] font-black tracking-wide text-muted">暫停提醒</p>
            <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {QUIET_HOURS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="min-h-11 rounded-xl border border-line bg-surface-2 px-2 text-[12.5px] font-black text-ink transition active:scale-95 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">臨時安靜市場類推播，不會改掉主題設定；你自設的到價提醒照送。</p>
            </div>
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 font-bold">這台裝置的通知狀態</summary>
            <section className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-up/10 text-up">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                    <path d={INFO_PATH} opacity="0.2" />
                    <path d={INFO_PATH} />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[14px] text-ink">通知裝置狀態</b>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">這個帳號目前沒有登記任何手機，App 通知不會跳出來。</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="tap-ignore inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3 text-[12.5px] font-black text-accent transition active:scale-95 disabled:opacity-50">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                    <path d={BELL_RINGING_PATH} />
                  </svg>發送測試通知</button>
                <button type="button" className="tap-ignore inline-flex min-h-10 items-center rounded-xl border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-muted transition active:scale-95">收不到通知？</button>
              </div>
            </section>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" className="flex min-h-24 items-start gap-3 rounded-2xl border border-accent/45 bg-accent-soft p-4 text-left transition hover:border-accent active:scale-[0.99]">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256" className="shrink-0 text-accent" aria-hidden="true">
                <path d={BELL_SIMPLE_PATH} opacity="0.2" />
                <path d={BELL_SIMPLE_PATH} />
              </svg>
              <span>
                <b className="block text-[13.5px] text-ink">App／電腦推播主題</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">急動、大盤與盤後摘要，不增加預設推播量。</span>
              </span>
            </button>
            <a className="flex min-h-24 items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent active:scale-[0.99]" href="/alerts/">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256" className="shrink-0 text-accent" aria-hidden="true">
                <path d={SLIDERS_PATH} opacity="0.2" />
                <path d={SLIDERS_PATH} />
              </svg>
              <span>
                <b className="block text-[13.5px] text-ink">個股條件提醒</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">目前 0 則監看中</span>
              </span>
            </a>
            <a className="flex min-h-24 items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent active:scale-[0.99]" href="/market-center/?section=events&scope=mine">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256" className="shrink-0 text-accent" aria-hidden="true">
                <path d={CALENDAR_PATH} opacity="0.2" />
                <path d={CALENDAR_PATH} />
              </svg>
              <span>
                <b className="block text-[13.5px] text-ink">持股事件日曆</b>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">自選與持股的已公告除權息日期。</span>
              </span>
            </a>
          </div>
          <div>
            <section className="mb-4 rounded-xl border border-line bg-surface p-4">
              <h2 className="font-black text-ink">盤中戰情室推播</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">急拉、急跌、漲跌停與爆量提醒，統一在下方開關及設定門檻。成交量以當日累計張數判斷，不是近幾分鐘的新增量；設了門檻但資料不齊時不推送。</p>
              <a className="mt-2 inline-flex min-h-11 items-center font-bold text-accent" href="/live/">查看盤中戰情 →</a>
            </section>
          </div>
        </div>
        <p className="mt-6 text-[12.5px] text-muted">帳號、回饋、對帳單仍在 <a className="font-bold text-accent underline" href="/member/">會員中心</a>。</p>
      </div>
    </>
  );
}
