/**
 * /cb 可轉債
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/cb.html 的 <main> 內容。
 *
 * 資料誠實原則：可轉債（CB）的轉換溢價率排序、賣回權時程與發行／掛牌行事曆
 * 本站無資料源（無 CB 行情／公告 API），一律以 `role="status"` 載入骨架 +
 * 「資料尚未入庫」誠實呈現，絕不寫死 capture 截圖裡的數字。
 * 頁面文字（公式說明、外部官方查詢入口、口徑提醒）為靜態說明，逐字照抄。
 */

import type { Metadata } from 'next';
import CbClient from './CbClient';
import './page.css';

export const metadata: Metadata = {
  title: '可轉債｜股市大佬 TradeBoss',
  description:
    '可轉債（CB）＝可以「換成股票」的公司債。當它的市價比「立刻換成股票的價值」高或低時，轉換溢價率會呈現正值或負值。這裡只列公式差異與原始欄位。',
};

export default function CbPage(): React.ReactElement {
  return (
    <div className="page-enter">
      <section className="hero-hud px-5 py-6">
        <h1 className="text-2xl font-black md:text-3xl">可轉債</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          可轉債（CB）＝可以「換成股票」的公司債。當它的市價比「立刻換成股票的價值」
          高或低時，轉換溢價率會呈現正值或負值。這裡只列公式差異與原始欄位。
        </p>
        <p className="mt-2 text-sm text-muted">
          盤後資料日：<b className="text-ink">尚未入庫</b>｜下一交易日盤後更新
        </p>
      </section>
      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-black">找競拍定價或議價成交？</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          轉換價格、債券成交價、最低投標價與得標均價是不同欄位。先核對公司及債券代號、公告日期，再比較；價格變動不代表已證實會帶動現股。
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5">
          <a
            className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
            href="https://www.twse.com.tw/zh/announcement/auction.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            證交所競價拍賣公告 ↗
          </a>
          <a
            className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
            href="https://www.tpex.org.tw/zh-tw/bond/info/market/ebts-cb/trade.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            櫃買債券議價行情 ↗
          </a>
          <a
            className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
            href="https://mops.twse.com.tw/"
            target="_blank"
            rel="noopener noreferrer"
          >
            公開資訊觀測站 ↗
          </a>
        </div>
        <p className="mt-1 text-xs text-muted">
          以上為官方外部查詢入口，並非本 App 已整合即時競拍或異常議價偵測。
        </p>
      </section>
      <CbClient />
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-black text-muted">
          <span>第一次用這頁？點開 30 秒說明</span>
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              可轉債（CB）可以在條件內換成股票。轉換溢價率＝CB 盤後參考價相對「立刻換成股票的價值」差多少。正值表示 CB 比現股貴，負值表示比較便宜。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">誰會需要</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              想比較可轉債跟現股哪個划算、或追蹤賣回日的人。當沖看量價與分點會比較直接。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼看</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              依轉換溢價率由低到高排。同時看轉換價、標的股收盤、CB 參考價與到期日，不要只看一個百分比。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">什麼時候別用它</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              負溢價不是保證可套利。還沒計入流動性、轉換期、借券、稅費與成交限制，不代表可以立刻換成現股賺錢。
            </dd>
          </div>
        </dl>
      </details>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              轉換溢價率排序（低→高）
            </h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="table-scroll overflow-x-auto">
          <div className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_88px_88px_72px] gap-2 rounded-t-2xl border-b border-line/60 bg-surface px-4 py-2.5 text-sm font-bold text-muted backdrop-blur">
            <span>可轉債</span>
            <span className="text-right">CB市價</span>
            <span className="text-right">轉換價值</span>
            <span className="text-right">溢價率</span>
          </div>
          <div className="px-4 py-4" role="status" aria-live="polite">
            <span className="sr-only">正在整理可轉債轉換溢價率排序…</span>
            <div aria-hidden="true" className="grid gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface"
                />
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              可轉債盤後行情與轉換價值<b className="text-ink">資料尚未入庫</b>
              ；本站目前無 CB 行情／公告資料源，待入庫後以此排序即時呈現，不預先寫死截圖數字。
            </p>
          </div>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        轉換溢價率＝可轉債市價相對轉換價值的差異。負值只表示公式差異，尚未計入流動性、借券、閉鎖期、稅費與成交限制，不代表存在可執行交易。賣回時程為公開時程表。
      </p>
      <div className="mb-3 mt-9 scroll-mt-28">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="section-mark" />
            <h2 className="text-lg font-bold tracking-tight md:text-xl">賣回權時程</h2>
          </div>
        </div>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl   p-0">
        <div className="p-4" role="status" aria-live="polite">
          <span className="sr-only">正在整理可轉債賣回權時程…</span>
          <div aria-hidden="true" className="grid gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-11 rounded-xl border border-line/70 bg-surface"
              />
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            賣回權時程<b className="text-ink">資料尚未入庫</b>；可至公開資訊觀測站或櫃買中心查詢各 CB 公開發行／賣回公告。
          </p>
        </div>
      </div>
    </div>
  );
}
