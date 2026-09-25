/**
 * /brokers 分點名冊 — 複刻「股市大佬 TradeBoss」實站
 * captured/login-capture/html/brokers.html（與同目錄 tab-brokers.html 內容完全相同）。
 * ----------------------------------------------------------------------------
 * 版面逐字照抄實站 <main id="main-content"> 內容：
 *   MarketCatNav（市場分類，籌碼 tab 為當前頁；無相關功能切換）
 *   + hero-hud（h1「分點名冊」＋地區分點查詢＋近 90 日說明）
 *   + 「第一次用這頁？點開 30 秒說明」details（4 則 Q&A）
 *   + 載入面板（data-panel hud-panel glass，骨架 3 條）
 *   + 「資料日期與口徑」details（DataCaveatDetails）。
 *
 * 資料策略（誠實骨架，不造假）：
 *   實站 capture 本頁停在「正在整理分點名冊」的載入態；本頁名冊的資料來源是
 *   「近 90 日活躍分點的買賣超樣本」，而分點逐筆／日匯總為付費資料（見
 *   src/app/api/skynet/channel/route.ts：hasChannelData 恆為 false），
 *   地區分點查詢（官方登記地址）亦無對應 API。故 SSR 如實呈現 capture 的
 *   載入骨架與查詢表單入口，不填假資料、不造假分點統計。
 *
 * 為 Server Component：不需要 client state，保持 SSR。
 */
import type { Metadata } from 'next';

import MarketCatNav from '@/components/MarketCatNav';
import DataCaveatDetails from '@/components/DataCaveatDetails';

export const metadata: Metadata = {
  title: '分點名冊 | 股市大佬 TradeBoss',
  description:
    '近 90 日活躍分點的買賣超樣本、次日反向賣超符合率、隔日收漲歷史樣本符合率與平均單筆張數；歷史統計，非買賣建議。',
};

export default function BrokersPage() {
  return (
    <>
      <MarketCatNav />
      <div className="page-enter">
        <section className="hero-hud px-5 py-6">
          <h1 className="text-2xl font-black md:text-3xl">分點名冊</h1>
          <section className="my-4 min-w-0 rounded-2xl border border-line bg-surface p-4">
            <button
              aria-expanded="false"
              className="min-h-11 text-left text-base font-bold text-accent"
            >
              地區分點查詢（官方登記地址） ＋
            </button>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              以名稱、代號或縣市查分公司登記地址；不是客戶所在地、主力身分或地緣關係判定。
            </p>
          </section>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            近 90 日活躍分點的買賣超樣本、次日反向賣超符合率、 隔日收漲歷史樣本符合率與平均單筆張數。不推論分點身分或下一步行為。
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
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                近 90 日全市場活躍分點的歷史樣本：買過幾次、次日反向賣超符合率、隔日收漲樣本符合率、平均單筆張數。這是已經發生的統計。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                想先認識「哪些分點常出手、出手後隔天常怎麼走」的人。第一次來可以先看「分點排行」當天誰在買。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                用上面的分類頁籤縮小範圍。樣本少於 20 次的卡片參考價值低。點股票進「個股盯盤」核對完整籌碼。
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                歷史符合率會因人員異動、資金規模改變而失效。這裡不推論分點身分，也不構成跟單指令。
              </dd>
            </div>
          </dl>
        </details>
        <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4">
          <p className="text-[14.5px] font-bold text-ink">正在整理分點名冊</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            主力名冊正在整理或暫時無法更新，請稍後再試；其他功能可正常使用。這頁會自己更新，不用重新整理。
          </p>
          <div className="mt-3 grid gap-2" aria-hidden="true">
            <div className="h-16 animate-pulse rounded-xl bg-surface-2/70"></div>
            <div className="h-16 animate-pulse rounded-xl bg-surface-2/70"></div>
            <div className="h-16 animate-pulse rounded-xl bg-surface-2/70"></div>
          </div>
        </div>
        <DataCaveatDetails>
          <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
          <p>時點：盤中為即時快照、法人／分點／資券為盤後</p>
          <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
          <p>分點為盤後結算。點進明細只看已公布買賣超。</p>
          <p>以上是已發生的公開統計，不是進出建議。</p>
        </DataCaveatDetails>
      </div>
    </>
  );
}
