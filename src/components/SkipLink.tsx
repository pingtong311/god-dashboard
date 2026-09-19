/**
 * SkipLink — 「跳到主要內容」無障礙連結（複刻「股市大佬」未登入態外殼）。
 *
 * 逐字照抄博主每個外殼頁 <body> 內的第一個元素：
 *   <a href="#main-content" class="skip-link fixed left-3 top-3 z-[80]
 *      -translate-y-24 rounded-xl bg-accent px-4 py-2 font-black text-bg
 *      shadow-lg transition focus:translate-y-0">跳到主要內容</a>
 * 平時以 -translate-y-24 移出畫面，鍵盤聚焦（:focus）時滑入。
 * 目標 `#main-content` 由 layout.tsx 的內容容器提供。
 *
 * 純展示元件（無狀態、無需 pathname），故於所有版面皆渲染。
 */
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-link fixed left-3 top-3 z-[80] -translate-y-24 rounded-xl bg-accent px-4 py-2 font-black text-bg shadow-lg transition focus:translate-y-0"
    >
      跳到主要內容
    </a>
  );
}
