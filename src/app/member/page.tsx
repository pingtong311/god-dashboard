import type { Metadata } from 'next';
import MemberPage from './MemberPage';

/**
 * /member/「大佬席位」頁——會員帳號中心（帳戶、回饋、邀請碼與專屬設定）。
 *
 * 逐字照抄 captured/login-capture/html/member.html 的 `<main id="main-content">`
 * （外殼由根 layout.tsx 統一渲染，本檔只輸出 `<main>` 內的內容；
 *  capture 的 `<main>` 開頭沒有任何次導覽，故本頁不掛 MarketCatNav／FeatureSubNav
 *  等共用導覽列——只渲染 capture 真實出現的內容）。
 *
 * 資料策略（誠實，不造假）：
 *   capture 是已登入狀態的完整頁面（含真實帳號資料：暱稱、Email、推薦碼、
 *   加入時間……），但本站 `src/app/api/skynet/` 目前**沒有任何會員資料 API**
 *   （查無 member／profile／invite 相關 route）。為了不憑空生出「某個人的帳號資料」：
 *     - 未登入：profile 區呈現「還沒登入」空狀態（附 /login/ 連結），
 *       屬於帳號的 panel（推薦碼／帳號／綁定／Passkey／刪除帳號……）不渲染。
 *     - 已登入：帳號資料區如實呈現 capture 風格的載入骨架
 *      （`role="status"` + `animate-pulse` + 「正在整理…」），不填假資料；
 *       純導覽／說明用的靜態區塊（快捷功能、提醒管理、學習與社群、
 *       安裝 App、加到主畫面、研究條件通知、資料日期與口徑）照抄。
 *
 * 頁面本身需讀登入狀態（useIsLoggedIn 為 client-only），故拆成 client 子元件；
 * SSR 首屏固定是「未登入」貌，mount 後才讀 localStorage（與 Navigation.tsx 同模式）。
 */

export const metadata: Metadata = {
  title: '股市大佬 TradeBoss｜台股籌碼與當沖研究',
  description:
    '股市大佬 TradeBoss 是台灣股票市場的公開籌碼與量價研究站。即時行情、主力分點、技術結構與 AI 白話解讀。公開教學免登入；會員區提供客觀資料工具。非投資建議。',
};

export default function Page() {
  return <MemberPage />;
}
