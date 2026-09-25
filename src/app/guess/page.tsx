import type { Metadata } from 'next';
import Link from 'next/link';
import {
  GUESS_CANDLES,
  GUESS_LEADERBOARD,
  GUESS_MYSTERY,
  GUESS_REF_LABEL,
  GUESS_REF_LINE,
  GUESS_VOLUME_BARS,
} from './guessChart';

/**
 * /guess/「猜下一根」。
 *
 * 逐字照抄 captured/login-capture/html/guess.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 頁面結構：教學系列子導覽（文章／學堂／練功房／猜K線／新手／手冊）
 * → 說明 <details> → 四格戰績（未作答：0／0／-／0）→ 題目日 K 圖（40 根，
 * 最後一根以「?」蓋住）→ 兩個作答鈕 → 勝率榜 30 名。圖表座標與榜單逐字取自
 * 實站（見 ./guessChart.ts）；未作答狀態照抄，不預先填入作答結果。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '猜下一根：真實的歷史日 K，蓋住最後一根。判斷收盤價會在前一日收盤價的上方還是下方。練的是看圖的手感，一題三秒。',
};

/** 教學系列六 pill（順序、名稱、路徑照抄 guess.html 的「相關功能切換」）。 */
const LEARN_PILLS: readonly { label: string; href: string }[] = [
  { label: '文章', href: '/learn/' },
  { label: '學堂', href: '/school/' },
  { label: '練功房', href: '/dojo/' },
  { label: '猜K線', href: '/guess/' },
  { label: '新手', href: '/guide/' },
  { label: '手冊', href: '/manual/' },
];

export default function GuessPage() {
  return (
    <>
      <nav
        aria-label="相關功能切換"
        className="scrollbar-none -mx-1 mb-1 w-full min-w-0 max-w-full"
      >
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto py-1 pl-1 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LEARN_PILLS.map((pill) => {
            const isActive = pill.href === '/guess/';
            return (
              <Link
                key={pill.href}
                href={pill.href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center whitespace-nowrap min-h-11 rounded-full px-3.5 py-1.5 text-[12.5px] font-black transition active:scale-95 ${
                  isActive
                    ? 'bg-accent text-bg'
                    : 'border border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {pill.label}
              </Link>
            );
          })}
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>
      </nav>
      <div className="page-enter">
        <div>
          <h1 className="text-2xl font-black md:text-3xl">猜下一根</h1>
          <p className="mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">真實的歷史日 K，蓋住最後一根。判斷收盤價會在前一日收盤價的上方還是下方。 練的是看圖的手感，一題三秒。</p>
          <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
            <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
              <span>這頁怎麼看？（點開，30 秒讀完）</span>
              <span className="text-muted transition group-open:rotate-180">▾</span>
            </summary>
            <dl className="mt-3 grid gap-2">
              <div>
                <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">從全市場成交量夠大的股票裡隨機抽一段真實日 K，標的與日期都不給你，所以只能看圖。</dd>
              </div>
              <div>
                <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">看完 40 根後，判斷最後一根收盤是否高於或等於圖上的前收虛線。答完會立刻揭曉。</dd>
              </div>
              <div>
                <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">想練真正的進出點，去「練功房」拿同一段歷史盤下模擬單，不花真錢。</dd>
              </div>
            </dl>
          </details>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line/70 md:grid-cols-4">
            <div className="bg-surface/85 px-4 py-3.5 text-center">
              <div className="num text-[24px] font-black leading-none text-ink">0</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted">目前連勝</div>
            </div>
            <div className="bg-surface/85 px-4 py-3.5 text-center">
              <div className="num text-[24px] font-black leading-none text-accent">0</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted">最佳連勝</div>
            </div>
            <div className="bg-surface/85 px-4 py-3.5 text-center">
              <div className="num text-[24px] font-black leading-none text-ink">-</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted">答對率</div>
            </div>
            <div className="bg-surface/85 px-4 py-3.5 text-center">
              <div className="num text-[24px] font-black leading-none text-ink">0</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted">已作答</div>
            </div>
          </div>
          <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4">
            <div>
              <p className="mb-2 text-xs text-muted">下方為成交量（張）；下一根的量會在作答後揭曉。</p>
              <svg viewBox="0 0 720 394" className="block w-full" role="img" aria-label="歷史日 K 40 根，最後一根尚未揭曉">
                {GUESS_VOLUME_BARS.map((bar) => (
                  <rect
                    key={`vol-${bar.x}`}
                    data-testid="guess-volume-bar"
                    x={bar.x}
                    y={bar.y}
                    width={bar.w}
                    height={bar.h}
                    fill={bar.up ? 'var(--up)' : 'var(--down)'}
                    opacity="0.65"
                  >
                    <title>{bar.title}</title>
                  </rect>
                ))}
                <line
                  x1="0"
                  x2="720"
                  y1={GUESS_REF_LINE.y1}
                  y2={GUESS_REF_LINE.y2}
                  stroke="var(--line)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={GUESS_REF_LABEL.x}
                  y={GUESS_REF_LABEL.y}
                  textAnchor="end"
                  className="num"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {GUESS_REF_LABEL.text}
                </text>
                {GUESS_CANDLES.map((candle) => (
                  <g key={`candle-${candle.rx}`} opacity="0.92">
                    <line
                      x1={candle.x1}
                      x2={candle.x1}
                      y1={candle.y1}
                      y2={candle.y2}
                      stroke={candle.up ? 'var(--up)' : 'var(--down)'}
                      strokeWidth="1"
                    />
                    <rect
                      x={candle.rx}
                      y={candle.ry}
                      width={candle.rw}
                      height={candle.rh}
                      fill={candle.up ? 'var(--up)' : 'var(--down)'}
                      stroke="none"
                      strokeWidth="0"
                    />
                  </g>
                ))}
                <g>
                  <rect
                    x={GUESS_MYSTERY.x}
                    y={GUESS_MYSTERY.y}
                    width={GUESS_MYSTERY.w}
                    height={GUESS_MYSTERY.h}
                    fill="var(--accent-soft)"
                    stroke="var(--accent)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    rx="2"
                  />
                  <text
                    x={GUESS_MYSTERY.tx}
                    y={GUESS_MYSTERY.ty}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="900"
                    fill="var(--accent)"
                  >
                    ?
                  </text>
                </g>
              </svg>
            </div>
            <div className="mt-3 min-h-[104px]">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="min-h-[64px] rounded-xl border-2 border-up/60 bg-up/10 text-[18px] font-black text-up transition active:scale-[0.98] disabled:opacity-40">不低於前收</button>
                <button type="button" className="min-h-[64px] rounded-xl border-2 border-down/60 bg-down/10 text-[18px] font-black text-down transition active:scale-[0.98] disabled:opacity-40">低於前收</button>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">題目是已經發生的歷史日 K，標的與日期匿名。這是看圖練習，不是對任何個股的預測， 也不代表未來會怎麼走。</p>
          </div>
        </div>
        <div className="mb-3 mt-9 scroll-mt-28">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="section-mark" />
              <h2 className="text-lg font-bold tracking-tight md:text-xl">勝率榜</h2>
            </div>
          </div>
        </div>
        <p className="mb-2 text-[12.5px] leading-relaxed text-muted">預測遊戲，不是投資建議。不會把猜過的標的釘在個股頁。</p>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line/60">
          {GUESS_LEADERBOARD.map((row) => (
            <li key={row.rank} className="flex items-baseline gap-3 px-4 py-3 bg-surface/85">
              <span className="num w-7 shrink-0 text-[13.5px] font-black text-muted">{row.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-ink">{row.name}</span>
              <span className="num shrink-0 text-[14px] font-black text-accent">{row.rate}</span>
              <span className="num shrink-0 text-[12px] text-muted">{row.games}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">練到手感穩定之後，去<a href="/dojo/" className="mx-1 font-bold text-accent hover:underline">練功房</a>拿同一批歷史盤下模擬單，會有 AI 教練逐筆檢討你的進出與紀律。</p>
      </div>
    </>
  );
}
