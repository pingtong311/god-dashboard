/**
 * /ranking 分點排行
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/ranking.html 的 <main> 內容：
 *   市場分類（MarketCatNav）→ 分點排行 hero → 買超/賣超 tab 與區間選擇
 *   → 左右雙欄（30 大分點／分點個股動向）→ 台灣分點燈火圖 → 第一次看分點說明
 *   → 其他戰情榜（11 榜 + 注意股）→ 資料日期與口徑（DataCaveatDetails）。
 *
 * 資料誠實原則：分點逐股買賣超與各戰情榜排序本站無對應資料源（分點為付費資料），
 * 一律以 `role="status"` 載入骨架誠實呈現，絕不寫死截圖名單與數字；
 * 「注意股」沿用實站空狀態文案；靜態文案、className 逐字照抄。
 */

import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import MarketCatNav from '@/components/MarketCatNav';
import DataCaveatDetails from '@/components/DataCaveatDetails';
import RankingClient from './RankingClient';
import { ShareButton, TermTip } from './widgets';
import './page.css';

export const metadata: Metadata = {
  title: '分點排行｜股市大佬 TradeBoss',
  description: '全市場券商分點的淨買賣超。點一列看它這段期間買賣了哪些股票。',
};

/** 戰情榜定義（id、標題、註腳、看完整連結照抄 ranking.html）。 */
interface Board {
  id: string;
  title: string;
  note: string;
  href: string;
}

const BOARDS: readonly Board[] = [
  { id: 'change_up', title: '漲幅', note: '漲跌幅', href: '/ranking/?board=change_up' },
  { id: 'change_down', title: '跌幅', note: '漲跌幅', href: '/ranking/?board=change_down' },
  { id: 'turnover', title: '成交額', note: '成交金額', href: '/ranking/?board=turnover' },
  { id: 'daytrade', title: '當沖比', note: '當日沖銷量／成交量', href: '/ranking/?board=daytrade' },
  { id: 'foreign_buy', title: '外資買超', note: '淨買超', href: '/ranking/?board=foreign_buy' },
  { id: 'foreign_sell', title: '外資賣超', note: '淨賣超', href: '/ranking/?board=foreign_sell' },
  { id: 'trust_buy', title: '投信買超', note: '淨買超', href: '/ranking/?board=trust_buy' },
  { id: 'broker_conc', title: '分點集中', note: '前 15 大買超／成交量', href: '/ranking/?board=broker_conc' },
  { id: 'margin_increase', title: '融資增加', note: '融資餘額較前日', href: '/ranking/?board=margin_increase' },
  { id: 'disposition', title: '處置', note: '制度限制', href: '/risk/' },
  { id: 'shareholding_week', title: '本週級距變化', note: '400 張以上持股比例一週變化', href: '/ranking/?board=shareholding_week' },
];

/** 戰情榜骨架（逐字沿用 capture 的 li 結構，內容以 pulse 骨架替代寫死資料）。 */
function BoardSkeleton({ board }: { board: Board }): React.ReactElement {
  return (
    <div id={`board-${board.id}`}>
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-black text-ink">{board.title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
              尚未入庫
            </span>
            <Link href={board.href} className="text-[12px] font-black text-accent">
              看完整
            </Link>
          </div>
        </div>
        <div role="status" aria-live="polite">
          <span className="sr-only">正在整理{board.title}排行…</span>
          <ol aria-hidden="true" className="mt-2 animate-pulse space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <div className="grid min-h-[3.2rem] grid-cols-[1.4rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-1 py-1">
                  <span className="h-4 w-3.5 rounded bg-surface-2" />
                  <span className="h-5 rounded bg-surface-2" />
                  <span className="h-5 w-16 rounded bg-surface-2" />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {board.title}排行<b className="text-ink">資料尚未入庫</b>；為盤後公開排序，待入庫後即時呈現。
          </p>
        </div>
        <p className="mt-2 text-[11px] text-muted">{board.note}</p>
      </div>
    </div>
  );
}

/** 注意股榜：沿用實站空狀態文案（名單暫不列示），逐字照抄 ranking.html。 */
function AttentionBoard(): React.ReactElement {
  return (
    <div id="board-attention">
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-black text-ink">注意股</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
              尚未入庫
            </span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          注意股名單本站暫不列示，請以交易所最新公告為準。
        </p>
      </div>
    </div>
  );
}

export default function RankingPage(): React.ReactElement {
  return (
    <>
      <MarketCatNav />
      <div className="page-enter">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-black md:text-3xl">分點排行</h1>
            <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              全市場券商
              <TermTip term="分點">
                券商的分公司，例如「國泰敦南」是國泰證券敦南分公司——它是一個下單的地方，不是一檔股票。
              </TermTip>
              的淨買賣超。點一列看它這段期間買賣了哪些股票。
            </p>
          </div>
          <ShareButton />
        </div>

        <RankingClient />

        <details className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-black text-muted">
            第一次看分點？點開看「這是什麼、怎麼讀、什麼時候不能用」
          </summary>
          <div className="mt-2">
            <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
              <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
                <span>第一次用這頁？點開 30 秒說明</span>
                <span className="transition group-open:rotate-180">▾</span>
              </summary>
              <dl className="mt-3 grid gap-2">
                <div>
                  <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    「分點」是券商的分公司，例如「國泰敦南」是國泰證券敦南分公司——它是一個下單的地方，不是一檔股票。台股會公布每個分點每天買賣了多少，這頁就是把它們加總排名。
                  </dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    想知道「今天是誰在買」的人。大戶下單通常固定走同幾家分點，所以某個分點突然大買一檔，常被當成有人在收貨的線索。
                  </dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    先看買超最多的前幾名，點進去看它今天買了哪些股票。重點不是金額大小，而是「有沒有集中在少數幾檔」——一家分點把錢全押一檔，比分散買 50 檔更值得注意。
                  </dd>
                </div>
                <div>
                  <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    分點只告訴你「這個地方成交了多少」，不會告訴你是誰、為什麼買。同一個分點可能有幾百個客戶，大戶買超也可能只是幫客戶執行。另外這是盤後資料，最快也要收盤後才有，不能用來盤中跟單。
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        </details>

        <div className="mt-8">
          <h2 className="text-xl font-black md:text-2xl">其他戰情榜</h2>
          <p className="mt-1 text-[12.5px] text-muted">公開排序，看完整可進對應頁。</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {BOARDS.map((board) => (
              <Fragment key={board.id}>
                <BoardSkeleton board={board} />
                {board.id === 'disposition' ? <AttentionBoard /> : null}
              </Fragment>
            ))}
          </div>
        </div>

        <DataCaveatDetails>
          <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
          <p>時點：盤中為即時快照、法人／分點／資券為盤後</p>
          <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
          <p>戰情榜為盤後排序位置；分點約 21:00 入庫。注意股以交易所為準。</p>
          <p>以上是已發生的公開統計，不是進出建議。</p>
        </DataCaveatDetails>
      </div>
    </>
  );
}
