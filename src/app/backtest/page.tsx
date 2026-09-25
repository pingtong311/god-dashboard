/**
 * /backtest 分點驗證 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/backtest.html。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容（hero-hud + 說明 details
 * + 回測表單 + 方向切換 + 分點下拉 + 規則面板 + 4 張統計卡 + 摘要面板
 * + 交易明細 29 筆 + 口徑註記）。
 *
 * 資料策略：capture 本頁為 2330 台積電／元大分點的回測結果快照（29 筆），
 * 逐字取自 capture，為「過去發生過的事」的歷史統計教學，非即時計算結果。
 * 注意：capture 本頁沒有「市場分類」與「相關功能切換」次導覽，故不加。
 *
 * 為 Server Component：表單控制項如實呈現 capture 的初始值，不需要 client state。
 */
import type { Metadata } from 'next';
import { BACKTEST_TRADES } from './backtest-trades';
import '../picks/screener.css';

export const metadata: Metadata = {
  title: '分點驗證 | 股市大佬 TradeBoss',
  description:
    '輸入一檔股票，系統找出最常操作它的券商分點，然後把「跟著這個分點做」這件事套回過去半年一筆一筆算一次，看歷史上會是什麼結果。為歷史統計教學，非投資建議。',
};

/** 回測對象下拉選項（分點與近半年淨買張數逐字取自 capture）。 */
const BROKER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: '主導分點（淨買最大）' },
  { value: '9800', label: '元大｜近半年淨買 86,009 張' },
  { value: '9A00', label: '永豐金｜近半年淨買 35,671 張' },
  { value: '9100', label: '群益｜近半年淨買 30,436 張' },
  { value: '9200', label: '凱基｜近半年淨買 21,884 張' },
  { value: '5850', label: '統一｜近半年淨買 19,803 張' },
  { value: '6160', label: '中國信託｜近半年淨買 12,175 張' },
  { value: '8888', label: '國泰敦南｜近半年淨買 9,769 張' },
  { value: '8880', label: '國泰綜合｜近半年淨買 7,864 張' },
  { value: '8840', label: '玉山｜近半年淨買 4,372 張' },
  { value: '9600', label: '富邦｜近半年淨買 4,206 張' },
  { value: '1260', label: '宏遠｜近半年淨買 3,579 張' },
  { value: '5380', label: '第一金證｜近半年淨買 3,218 張' },
];

export default function BacktestPage() {
  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">分點驗證</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">輸入一檔股票，系統找出最常操作它的券商分點，然後把 「跟著這個分點做」這件事套回過去半年<b className="text-ink">一筆一筆算一次</b>，看歷史上會是什麼結果。</p>
      </section>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
          <span>第一次用這頁？點開 30 秒說明</span>
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">這頁在回答一個很具體的問題：如果過去半年，每次某個分點大買這檔股票你就跟著做，最後會賺還是賠？系統把規則套回歷史資料，一筆一筆列出來，並算進手續費與交易稅。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">已經在看分點資料、想知道「這個分點值不值得跟」的人。如果你還不知道分點是什麼，先去「分點排行」那頁看一下比較好。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">先看樣本筆數：少於 20 筆的統計基本上沒有意義，運氣成分太大。再看符合率和累積報酬，兩個要一起看——符合率高但累積是負的，代表贏的時候賺一點、輸的時候賠很多。</dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">最重要的一件事：這是「過去發生過的事」，分點的操作習慣會變，人員異動、資金規模改變都會讓歷史失效，所以歷史好不代表接下來也好。另外它是用收盤價模擬的，實際上你不一定買得到那個價。只想找股票的話這頁幫助不大，去「選股」那一區更直接。</dd>
          </div>
        </dl>
      </details>
      <form className="mt-4 flex flex-wrap gap-2">
        <input inputMode="numeric" placeholder="例如 2330" className="num min-h-12 flex-1 rounded-xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent" defaultValue="2330" />
        <button type="submit" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  shrink-0 px-6">回測</button>
      </form>
      <div className="mt-2 flex gap-2">
        <button className="min-h-10 flex-1 rounded-xl border-2 text-[13.5px] font-bold transition active:scale-95 border-accent bg-accent text-bg">自動判斷</button>
        <button className="min-h-10 flex-1 rounded-xl border-2 text-[13.5px] font-bold transition active:scale-95 border-line bg-surface text-muted">只測放空</button>
        <button className="min-h-10 flex-1 rounded-xl border-2 text-[13.5px] font-bold transition active:scale-95 border-line bg-surface text-muted">只測做多</button>
      </div>
      <div className="mt-2">
        <label className="text-sm font-bold text-muted">回測對象（近半年在這檔淨買較多的分點）</label>
        <select className="mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-[13.5px] font-bold outline-none focus:border-accent" defaultValue="">
          {BROKER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 border-l-accent">
        <p className="text-lg font-black">2330 台積電｜主力：元大</p>
        <p className="mt-0.5 text-sm font-bold text-accent">跟主力做多（follow）</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">每次這個分點『大買』後，隔天開盤跟著做多、最多抱 3 天——賭它波段布局帶動續漲。</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 ">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12.5px] font-bold leading-snug text-muted">歷史樣本符合率</div>
          </div>
          <div className="num mt-1.5 text-2xl font-black leading-none md:text-3xl text-down">45%</div>
        </div>
        <div className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 ">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12.5px] font-bold leading-snug text-muted">平均每筆</div>
          </div>
          <div className="num mt-1.5 text-2xl font-black leading-none md:text-3xl text-up">+0.14%</div>
        </div>
        <div className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 ">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12.5px] font-bold leading-snug text-muted">累積報酬</div>
          </div>
          <div className="num mt-1.5 text-2xl font-black leading-none md:text-3xl text-up">+2.28%</div>
        </div>
        <div className="data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 ">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12.5px] font-bold leading-snug text-muted">交易筆數</div>
          </div>
          <div className="num mt-1.5 text-2xl font-black leading-none md:text-3xl text-ink">{BACKTEST_TRADES.length}</div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-3">
        <p className="text-[13.5px] leading-relaxed">過去半年，將 <b>元大</b> 在 <b>2330 台積電</b> 的歷史規則 套用於「多側」研究， 一共有 <b className="num">29</b> 筆樣本， 歷史符合 <b className="num text-up">45%</b>， 全部加起來 <b className="num text-up">+2.28%</b>。最好的一筆 <span className="num text-up">+6.44%</span>（2026-07-28）、最差 <span className="num text-down">-7.16%</span>（2026-06-23）。</p>
      </div>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark">
            </span>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">交易明細</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="table-scroll overflow-x-auto">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-line/60 px-4 py-2.5 text-sm font-bold text-muted">
            <span>進場日</span>
            <span className="text-right">進場價</span>
            <span className="text-right">出場價</span>
            <span className="text-right">損益</span>
          </div>
          <ul>
            {BACKTEST_TRADES.map((trade) => (
              <li
                key={`${trade.date}-${trade.entry}`}
                className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-line/60 px-4 py-2.5 text-[13.5px] last:border-0"
              >
                <span className="num">{trade.date}</span>
                <span className="num text-right">{trade.entry}</span>
                <span className="num text-right">{trade.exit}</span>
                <span className={`num text-right font-black ${trade.pnlClass}`}>{trade.pnl}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">已扣手續費 1 折、證交稅與滑價約 0.39%（留倉來回），並假設都能以開盤／收盤價成交，實務會有落差。為歷史統計教學，非投資建議。</p>
    </div>
  );
}
