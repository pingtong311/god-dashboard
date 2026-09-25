/**
 * RankingClient —— /ranking 頁的互動區塊（client island）。
 * ----------------------------------------------------------------------------
 * 對應 captured/login-capture/html/ranking.html 的：
 *   1. 買超排行／賣超排行 tab
 *   2. 區間選擇 <details>
 *   3. 左右雙欄：左 30 大分點列表、右「點左邊任一家分點」
 *   4. 台灣分點燈火圖（twmap）＋右側文案
 *
 * 資料誠實原則：全市場逐股分點買賣超為付費資料（TWSE eshop／FinMind Sponsor），
 * 本站無對應資料源，故分點列表以 `role="status"` 載入骨架誠實呈現，絕不寫死
 * 截圖裡的 30 家分點與張數；燈火圖保留台灣輪廓，但不畫任何光點，並以
 * .twmap__pending 標示資料待入庫。tab 與燈火圖切換真實切換 aria-pressed 與標題。
 */

'use client';

import { useState } from 'react';
import { TAIWAN_OUTLINE_D } from './twmapOutline';
import { TermTip } from './widgets';

/** 買超／賣超色調，tab 與燈火圖共用。 */
type Tone = 'buy' | 'sell';

/** 分點列表骨架列數（取代實站 30 筆寫死資料）。 */
const SKELETON_ROWS = 12;

const TAB_ON =
  'min-h-11 flex-1 rounded-xl border-2 text-[13.5px] font-black transition border-accent bg-accent text-bg';
const TAB_OFF =
  'min-h-11 flex-1 rounded-xl border-2 text-[13.5px] font-black transition border-line bg-surface text-muted';

const DATE_INPUT_CLASS =
  'num min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 font-bold outline-none focus:border-accent';

export default function RankingClient(): React.ReactElement {
  const [tone, setTone] = useState<Tone>('buy');
  const toneLabel = tone === 'buy' ? '買超' : '賣超';

  return (
    <>
      {/* 買超／賣超 tab + 區間選擇 */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-1 gap-1.5" role="group" aria-label="買超或賣超排行">
          <button
            type="button"
            aria-pressed={tone === 'buy'}
            onClick={() => setTone('buy')}
            className={tone === 'buy' ? TAB_ON : TAB_OFF}
          >
            買超排行
          </button>
          <button
            type="button"
            aria-pressed={tone === 'sell'}
            onClick={() => setTone('sell')}
            className={tone === 'sell' ? TAB_ON : TAB_OFF}
          >
            賣超排行
          </button>
        </div>
        <details className="w-full sm:w-auto">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-surface px-3.5 text-[12.5px] font-bold text-muted">
            區間　資料尚未入庫
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3">
            <label className="text-[12.5px]">
              <span className="mb-1 block font-bold">開始日期</span>
              <input type="date" className={DATE_INPUT_CLASS} />
            </label>
            <label className="text-[12.5px]">
              <span className="mb-1 block font-bold">結束日期</span>
              <input type="date" className={DATE_INPUT_CLASS} />
            </label>
            <p className="col-span-2 text-[11.5px] leading-relaxed text-muted">
              全市場逐股分點買賣超為付費資料，本站尚未入庫；區間重查會在入庫後生效。
            </p>
            <button
              type="button"
              className="col-span-2 min-h-11 rounded-xl bg-accent text-[13.5px] font-black text-bg active:scale-[0.98]"
            >
              用這個區間重查
            </button>
          </div>
        </details>
      </div>

      {/* 分點列表 + 分點個股動向 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="min-w-0">
          <p className="mb-1.5 px-1 text-[12px] font-black tracking-wide text-muted">
            {toneLabel}最多的分點・資料尚未入庫
          </p>
          <div className="data-panel hud-panel glass rounded-2xl   max-h-[32rem] overflow-y-auto p-0">
            <div role="status" aria-live="polite">
              <span className="sr-only">正在整理分點{toneLabel}排行…</span>
              <ul aria-hidden="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <li
                    key={i}
                    className="flex animate-pulse items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                  >
                    <span className="h-5 w-6 shrink-0 rounded bg-surface-2" />
                    <span className="h-5 flex-1 rounded bg-surface-2" />
                    <span className="h-5 w-20 shrink-0 rounded bg-surface-2" />
                  </li>
                ))}
              </ul>
              <p className="px-4 py-3 text-[12.5px] leading-relaxed text-muted">
                分點{toneLabel}排行<b className="text-ink">資料尚未入庫</b>
                ；全市場逐股分點買賣超為付費資料（TWSE eshop／FinMind Sponsor），
                待入庫後即時呈現，不預先寫死截圖數字。
              </p>
            </div>
          </div>
        </div>
        <div id="broker-moves" className="min-w-0 scroll-mt-24">
          <div className="data-panel hud-panel glass rounded-2xl p-5  grid min-h-[12rem] place-items-center text-center">
            <div>
              <p className="text-[13.5px] font-black text-ink">點左邊任一家分點</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                這裡會顯示它在這段期間買最多、賣最多的個股。
                <br />
                重點不是金額大小，而是有沒有集中在少數幾檔。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 台灣分點燈火圖 */}
      <div className="mt-8 grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
        <figure className="m-0 ">
          <p className="sr-only">
            台灣分點燈火圖：分點資料尚未入庫，圖上暫無光點。完整名次見下方清單。
          </p>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="twmap__toggle" role="group" aria-label="切換買超或賣超">
              <button
                type="button"
                aria-pressed={tone === 'buy'}
                onClick={() => setTone('buy')}
                className="twmap__toggle-btn"
                data-tone="buy"
              >
                買超
              </button>
              <button
                type="button"
                aria-pressed={tone === 'sell'}
                onClick={() => setTone('sell')}
                className="twmap__toggle-btn"
                data-tone="sell"
              >
                賣超
              </button>
            </div>
            <p className="num shrink-0 text-[12px] leading-tight text-muted">資料尚未入庫</p>
          </div>
          <div className="twmap relative mx-auto w-[min(54vw,214px)] md:w-full md:max-w-[404px]">
            <svg
              className="twmap__svg"
              viewBox="0 0 725 1000"
              role="presentation"
              focusable="false"
            >
              <path className="twmap__haze" d={TAIWAN_OUTLINE_D} />
              <path className="twmap__coast" d={TAIWAN_OUTLINE_D} />
              <path className="twmap__land" d={TAIWAN_OUTLINE_D} />
              <path className="twmap__border" d={TAIWAN_OUTLINE_D} />
            </svg>
            <div aria-hidden="true" className="twmap__pending" />
          </div>
          <figcaption className="twmap__cap mx-auto mt-3 max-w-[420px] md:max-w-none">
            <p className="text-[12px] leading-relaxed text-muted">
              一個光點＝一家券商分點，光越大代表今天買超越多，位置依分點名稱所在地標示。
              分點資料尚未入庫，入庫後每個光點會對應一家分點。
            </p>
          </figcaption>
        </figure>
        <div>
          <h2 className="display text-[20px] font-black md:text-[24px]">
            主力的錢，今天落在台灣哪裡
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            一個光點是一家券商分點，光越大代表今天買超越多，位置依分點名稱所在地標示。
            會長得像夜裡從飛機上看台灣，是因為分點本來就幾乎全集中在西部走廊，
            中央山脈一家都沒有。這不是美術效果。
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            滑過光點可以看那家分點的名字與買超張數。買超集中在少數幾家時，
            可以再看
            <TermTip term="集中度">
              前幾大分點的買超金額，佔該檔總成交量的比例。比例越高，代表籌碼越集中在少數分點。
            </TermTip>
            和
            <TermTip term="隔日沖">
              今天大買的籌碼，明天是否被同一批人賣出。分點買超高度集中時，隔日賣壓也值得留意。
            </TermTip>
            判斷這批貨明天會不會回頭賣。
          </p>
        </div>
      </div>
    </>
  );
}
