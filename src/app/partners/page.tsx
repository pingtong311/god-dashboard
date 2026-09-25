import type { Metadata } from 'next';

/**
 * /partners/「品牌合作」。
 *
 * 逐字照抄 captured/login-capture/html/partners.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 渲染，本檔只輸出 `<main>` 內的內容）。
 *
 * 實站此頁 main 僅 649 bytes：目前沒有刊登中的合作內容（空狀態），
 * 照抄即可，不捏造任何合作廠商或活動。
 */

export const metadata: Metadata = {
  title: '品牌合作｜股市大佬 TradeBoss｜股市大佬',
  description:
    '瀏覽合作品牌的服務與活動。以下內容為廣告或業配，與本站市場資訊分開呈現。',
};

export default function PartnersPage() {
  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl pb-8 text-ink">
        <header className="max-w-2xl py-5 sm:py-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">品牌合作</h1>
          <p className="mt-3 text-sm leading-7 text-muted">瀏覽合作品牌的服務與活動。以下內容為廣告或業配，與本站市場資訊分開呈現。</p>
        </header>
        <section className="rounded-xl border border-line p-8">
          <h2 className="text-lg font-bold">目前沒有刊登中的合作內容</h2>
          <p className="mt-2 text-sm text-muted">有新合作時會在這裡展示，不影響你使用其他功能。</p>
          <a className="mt-4 inline-flex min-h-11 items-center font-bold text-accent" href="/today/">回今日戰情</a>
        </section>
        <p className="mt-7 text-xs leading-6 text-muted">點選連結後將離開本站。商品、服務、交易與個資處理由廠商依其條款提供；合作展示不代表本站保證成效或投資收益。</p>
      </div>
    </div>
  );
}
