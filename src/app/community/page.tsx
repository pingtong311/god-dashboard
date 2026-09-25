import type { Metadata } from 'next';
import Link from 'next/link';
import MineSubNav from '../alerts/MineSubNav';
import { COMMUNITY_POSTS } from './communityPosts';

/**
 * /community/「社群基地」。
 *
 * 逐字照抄 captured/login-capture/html/community.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 頁面結構：入口三格 → 今天的話題（3 則）→ 分頁按鈕（討論／聊天／戰績榜／回饋牆）
 * → 發文框 → 60 篇討論流水。貼文內容逐字照抄實站（含錯字與語氣），
 * 資料集中在 ./communityPosts.ts；分頁與留言展開為實站的靜態狀態，不造假互動。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '社群基地：理性討論、互相尊重，不報明牌、不喊單。從「今天的話題」接一句就好。',
};

/** 「今天的話題」三則，逐字照抄 community.html。 */
const TOPICS: readonly { bold: string; body: string; link: { label: string; href: string } }[] = [
  {
    bold: '今天買最多的券商分點是「凱基台北」（這是券商的分公司，不是股票），全市場合計買超 3.6 萬張。',
    body: '有人跟到嗎？你在自選股裡看到它動哪一檔？',
    link: { label: '看這個分點買了什麼', href: '/ranking/' },
  },
  {
    bold: '今天盤中震盪最大的是 7942 東佑達，最高到最低差了 23.4%。',
    body: '這種一天上上下下的，你會怎麼處理？',
    link: { label: '看它的日 K', href: '/stock/?id=7942' },
  },
  {
    bold: '今天有 8 檔收在漲停附近。',
    body: '有人抱到的嗎？當時是看到什麼才進的？',
    link: { label: '看今天發生什麼事', href: '/radar/' },
  },
];

/** 入口三格（討論為當前頁）。 */
const ENTRY_CARDS: readonly { label: string; sub: string; href?: string }[] = [
  { label: '討論', sub: '就在這頁' },
  { label: '文章', sub: '盤後解讀', href: '/learn/' },
  { label: '新聞', sub: '消息聲量', href: '/radar/#news' },
];

/** 分頁按鈕（討論為當前頁）。 */
const FEED_TABS: readonly { label: string; active: boolean }[] = [
  { label: '📣 討論', active: true },
  { label: '💬 聊天', active: false },
  { label: '🏆 戰績榜', active: false },
  { label: '🌟 回饋牆', active: false },
];

export default function CommunityPage() {
  return (
    <>
      <MineSubNav active="社群" />
      <div className="page-enter">
        <h1 className="text-2xl font-black md:text-3xl">社群基地</h1>
        <p className="mt-1.5 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">不知道要說什麼的話，從下面「今天的話題」接一句就好。 理性討論、互相尊重，不報明牌、不喊單。</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ENTRY_CARDS.map((card) => {
            const inner = (
              <>
                <span className="text-[12.5px] font-black text-ink">{card.label}</span>
                <span className="mt-0.5 text-[11px] font-bold text-muted">{card.sub}</span>
              </>
            );
            if (!card.href) {
              return (
                <span
                  key={card.label}
                  className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-accent/45 bg-accent-soft px-2 py-2 text-center"
                >
                  <span className="text-[12.5px] font-black text-accent">{card.label}</span>
                  <span className="mt-0.5 text-[11px] font-bold text-muted">{card.sub}</span>
                </span>
              );
            }
            return (
              <Link
                key={card.label}
                href={card.href}
                className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-line bg-surface px-2 py-2 text-center transition active:scale-[0.98]"
              >
                {inner}
              </Link>
            );
          })}
        </div>
        <div className="hud-panel glass mt-4 rounded-2xl px-4 py-4 md:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[12.5px] font-black tracking-wide text-accent">今天的話題</p>
            <p className="num text-[12px] text-muted">2026-09-24 盤後</p>
          </div>
          <ul className="mt-2.5 grid gap-2.5">
            {TOPICS.map((topic) => (
              <li key={topic.bold} className="rounded-xl bg-surface-2/70 px-3.5 py-3">
                <p className="text-[14.5px] font-bold leading-relaxed text-ink">{topic.bold}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{topic.body}</p>
                <Link href={topic.link.href} className="mt-1.5 inline-block text-[12px] font-bold text-accent hover:underline">
                  {topic.link.label} <span className="mi mi-nudge inline-block">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex min-w-0 gap-1.5 sm:gap-2">
          {FEED_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`min-w-0 flex-1 truncate rounded-xl px-1 py-2.5 text-[12.5px] font-black transition sm:px-2 sm:text-[13.5px] ${
                tab.active ? 'bg-accent text-bg' : 'bg-surface-2 text-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-4 min-w-0 overflow-x-hidden">
          <div className="grid min-w-0 gap-3">
            <div className="data-panel hud-panel glass rounded-2xl p-5  flex min-w-0 flex-col gap-2 overflow-hidden !p-4 sm:!p-5">
              <textarea
                rows={2}
                maxLength={1000}
                placeholder="發一篇文…聊盤感、心得、吐槽（不報明牌、不喊單）"
                className="w-full min-w-0 rounded-xl border-2 border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
              />
              <div className="flex justify-end">
                <button type="button" className="rounded-xl bg-accent px-5 py-2 font-black text-bg disabled:opacity-50">發文</button>
              </div>
            </div>
            {COMMUNITY_POSTS.map((post) => (
              <div
                key={`${post.author}-${post.time}-${post.body.slice(0, 12)}`}
                className="hud-panel relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5"
              >
                <div className="block w-full min-w-0 text-left active:scale-[0.99] ">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[13.5px] font-black text-accent">{post.author}</span>
                    <span className="shrink-0 text-[12px] text-muted">{post.time}</span>
                  </div>
                  <p className="mt-2 min-w-0 break-words whitespace-pre-wrap text-[14.5px] leading-[1.85] [overflow-wrap:anywhere]">{post.body}</p>
                </div>
                {post.chips.length > 0 ? (
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    {post.chips.map((chip) =>
                      chip.external ? (
                        <a
                          key={chip.href + chip.label}
                          href={chip.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={chip.className}
                        >
                          {chip.label}
                        </a>
                      ) : (
                        <Link key={chip.href + chip.label} href={chip.href} className={chip.className}>
                          {chip.label}
                        </Link>
                      ),
                    )}
                  </div>
                ) : null}
                <div className="mt-3 block w-full min-w-0 space-y-2 overflow-hidden rounded-xl bg-bg/60 p-3 text-left active:scale-[0.99]">
                  {post.comments.map((comment) => (
                    <p
                      key={comment.author + comment.text.slice(0, 12)}
                      className="min-w-0 break-words text-[13px] leading-relaxed text-muted [overflow-wrap:anywhere]"
                    >
                      <span className="font-bold text-ink">{comment.author}</span>
                      {comment.text}
                    </p>
                  ))}
                  <span className="text-[12.5px] font-bold text-accent">查看全部 5 則留言 →</span>
                </div>
                <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-[13.5px] font-bold text-accent active:scale-[0.98]">💬 留言（5）</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
