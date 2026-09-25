import type { Metadata } from 'next';
import MineSubNav from './MineSubNav';

/**
 * /alerts/「到價提醒」。
 *
 * 逐字照抄 captured/login-capture/html/alerts.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 此頁為設定頁的**空狀態**：會員還沒有任何提醒規則（實站未登入／未設定時即如此），
 * 表單與條件說明為靜態結構，送出後才寫入後端；不預先捏造任何提醒資料。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '到價提醒：通知研究條件，不是進出建議。命中會推到既有通道（App／Web／Telegram）。',
};

/** Phosphor Database（30px）——空狀態圖示，d 值逐字取自 alerts.html。 */
const DATABASE_PATH =
  'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z';

/** 十一種提醒條件的說明（標題／是什麼／拿來幹嘛），逐字照抄 alerts.html。 */
const CONDITION_GUIDES: readonly { title: string; what: string; why: string }[] = [
  {
    title: '到價（漲到／跌到某個價）',
    what: '股價碰到你填的價格就通知你。',
    why: '最基本的一種。想在某個價位知道一聲，又不想整天盯著螢幕，就用這個。',
  },
  {
    title: '今天量爆掉',
    what: '「量比」＝今天的成交量 ÷ 前 20 天的平均量。填 2 就是今天量變成平常的兩倍才通知。',
    why: '提醒成交量相對基準量的變化；不能據此辨識參與者或預測後續漲跌。',
  },
  {
    title: '接近支撐（最近的低點）',
    what: '股價快要碰到最近一段時間的低點（也就是一般說的支撐）就通知。填 1＝距離 1% 以內。',
    why: '這是歷史價格位置提醒，不代表會有人接手或價格會反彈。條件由你自行設定。',
  },
  {
    title: '接近壓力（最近的高點）',
    what: '股價快要碰到最近一段時間的高點（也就是一般說的壓力）就通知。',
    why: '這是歷史價格位置提醒，不判斷持有人成本，也不代表價格會在此停止上漲。',
  },
  {
    title: '站上／跌破均線',
    what: '均線＝過去 N 天收盤價的平均，可以想成「這段時間買的人的平均成本」。收盤站上或跌破你選的那條線就通知。',
    why: '站上代表最近買的人多半還在賺，跌破代表多半在賠，市場氣氛容易跟著轉。5 日線看的是這一週，月線季線看的是趨勢。',
  },
  {
    title: '悶很久之後突然放量',
    what: '先是波動縮得很小（大家都在觀望、K棒變短），然後量突然衝出來。兩件事都發生才通知。',
    why: '股價悶久了通常會選一個方向動，這個條件在抓「開始動了」的那一刻。注意它不分方向，往上往下都算，只是告訴你不再是悶著。',
  },
  {
    title: '今天震得比平常兇',
    what: 'ATR 是「這檔平常一天大概上下動多少錢」。填 2 就是今天動的幅度變成平常的兩倍才通知。',
    why: '同一檔股票平常一天動 1 塊，今天動 3 塊，代表有消息或有大單進來。最大的用途是提醒你「這檔今天變兇了」，不要再用平常的部位和心態去做它。',
  },
  {
    title: '當沖紅綠燈轉折',
    what: '紅綠燈是用 5 分 K 的短線轉折加上資金動能算出來的訊號，轉強或轉弱時通知。',
    why: '盤中短線用。需要當天有逐筆資料才會動。',
  },
  {
    title: '處置／即將分盤',
    what: '這檔出現在處置中或即將分盤名單就通知你。',
    why: '用來盯制度限制有沒有進來，不是進出建議。',
  },
  {
    title: '分點集中度跳升',
    what: '前 15 大買超分點佔成交量的比例，比前一交易日多出你填的百分點就通知。',
    why: '只描述分點集中度的變化，不是叫你跟單。',
  },
];

/** 新增警報表單的條件下拉選項，逐字照抄 alerts.html。 */
const CONDITION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'price', label: '到價（漲到／跌到某個價）' },
  { value: 'vol', label: '今天量爆掉' },
  { value: 'struct_low', label: '接近支撐（最近的低點）' },
  { value: 'struct_high', label: '接近壓力（最近的高點）' },
  { value: 'ma_cross', label: '站上／跌破均線' },
  { value: 'squeeze_fire', label: '悶很久之後突然放量' },
  { value: 'atr_spike', label: '今天震得比平常兇' },
  { value: 'light_turn', label: '當沖紅綠燈轉折' },
  { value: 'attention', label: '處置／即將分盤' },
  { value: 'broker_conc', label: '分點集中度跳升' },
  { value: 'instant_spike', label: '瞬間拉抬（盤中急拉）' },
  { value: 'limit_lock', label: '漲跌停鎖住' },
  { value: 'daily_summary', label: '每日盤後摘要（定時）' },
];

export default function AlertsPage() {
  return (
    <>
      <MineSubNav active="到價提醒" />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">到價提醒</h1>
        <p className="mt-1 text-[13.5px] text-muted">通知研究條件，不是進出建議。命中會推到既有通道（App／Web／Telegram）。</p>
        <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
            <span>這頁怎麼看？（點開，30 秒讀完）</span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">幫你盯著自選股，符合你設的條件就推到手機。八種條件：到價、量爆掉、接近支撐、接近壓力、站上跌破均線、悶完放量、震得比平常兇、當沖紅綠燈轉折。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">選一個條件 → 填代號 → 門檻照著提示填就好。每個條件下面都有白話說明，看不懂先展開讀。</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">命中後那一則會自動關掉，要繼續盯就再開一次。通知研究條件，不是進出建議。</dd>
            </div>
          </dl>
        </details>
        <details className="mt-3 rounded-2xl border border-line/80 bg-surface/70 p-4">
          <summary className="cursor-pointer text-[13.5px] font-black text-accent">這些條件分別是什麼意思、什麼時候用？（第一次用先看這裡）</summary>
          <ul className="mt-3 grid gap-3">
            {CONDITION_GUIDES.map((guide) => (
              <li key={guide.title} className="rounded-xl bg-surface-2/60 p-3">
                <p className="text-[13.5px] font-black text-ink">{guide.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  <span className="font-bold text-ink">是什麼：</span>{guide.what}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  <span className="font-bold text-ink">拿來幹嘛：</span>{guide.why}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">原本有一個「外資連買」條件已經停用：三大法人買賣是收盤後才公布的， 盤中沒有當天的數字，做成即時提醒會誤導。要看法人請到個股頁的籌碼區。 盤中急拉急跌的收訊範圍（股價上限、價位帶、成交量門檻）請到<a href="/notify/" className="font-bold text-accent hover:underline">戰情室警報</a>設定，跟這一頁的到價提醒是兩套。</p>
        </details>
        <form className="mt-4">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0 [&>*]:max-w-full [&>input]:w-full [&>select]:w-full [&>select]:py-2">
            <select className="min-h-12 rounded-xl border-2 border-line bg-surface px-3 text-sm font-bold">
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="relative min-w-0">
              <input aria-label="提醒股票代號或名稱" autoComplete="off" placeholder="代號或名稱，如 2330、台積電" className="num w-full min-h-12 rounded-xl border-2 border-line bg-surface px-4 text-base font-bold outline-none focus:border-accent" value="" readOnly />
            </div>
            <select className="min-h-12 rounded-xl border-2 border-line bg-surface px-3 text-sm font-bold">
              <option value="gte">上穿／漲到</option>
              <option value="lte">下破／跌到</option>
            </select>
            <input inputMode="decimal" placeholder="填你想被通知的價格，例 46.5" className="num min-h-12 rounded-xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent" value="" readOnly />
            <input placeholder="備註（可空）" className="min-h-12 rounded-xl border-2 border-line bg-surface px-4 text-sm outline-none focus:border-accent" value="" readOnly />
          </div>
          <div className="mt-2 flex gap-2">
            <button type="submit" className="mi-glare relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 text-lg font-black transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] select-none touch-manipulation motion-reduce:transition-none motion-reduce:active:scale-100 bg-accent text-bg shadow-[0_8px_22px_rgba(5,48,78,0.22)] hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0  min-h-12 flex-1">新增警報</button>
          </div>
        </form>
        <div className="data-panel hud-panel glass rounded-2xl p-5  mt-3 border-l-2 border-l-accent">
          <p className="text-sm font-black">股價碰到你填的價格就通知你。</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">最基本的一種。想在某個價位知道一聲，又不想整天盯著螢幕，就用這個。</p>
        </div>
        <p className="mt-2 text-[12px] text-muted">填你想被通知的價格，例 46.5</p>
        <div className="mt-4">
          <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center">
            <div className="max-w-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" viewBox="0 0 256 256" className="mx-auto text-muted" aria-hidden="true">
                <path d={DATABASE_PATH} opacity="0.2" />
                <path d={DATABASE_PATH} />
              </svg>
              <p className="mt-3 font-black text-ink">目前沒有資料</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">還沒有提醒。也可從個股頁或自選股快速設定。</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
