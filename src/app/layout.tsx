import type { Metadata } from "next";
import { Noto_Sans_TC, Rajdhani } from "next/font/google";
import "./globals.css";
import SkipLink from "@/components/SkipLink";
import ComplianceBar from "@/components/ComplianceBar";
import Navigation from "@/components/Navigation";
import SiteFooter from "@/components/SiteFooter";
import BottomTabBar from "@/components/BottomTabBar";
import { buildDisplayPreferencesInitScript } from "@/lib/displayPreferences";

/**
 * 「股市大佬 TradeBoss」字型語彙：
 *  - 正文：Noto Sans TC（400/500/700/900）
 *  - 數字／代號／指數／價格／漲跌幅：Rajdhani（500/600/700，科技感）
 *
 * 以 CSS 變數掛在 <html>，交由 src/styles/theme.css 的
 * --font-noto / --font-tech 取用（見該檔第 1 節「字型」）。
 */
const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-src",
  display: "swap",
  fallback: ["Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "sans-serif"],
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-tech-src",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "God-數據分析研究室",
  description: "God-數據分析研究室｜全能極速量化交易引擎 V10 戰情室",
};

/**
 * 全站顯示偏好初始化腳本（阻塞式，於 <body> 首次繪製前同步執行，避免 FOUC）。
 *
 * 逐字複刻博主在每個頁面 <head> 內嵌的 4 段 inline script：
 *   - obsidian-theme        → data-theme + style.colorScheme（預設 light，對齊實站）
 *   - obsidian-comfort-read → class="comfort-read"
 *   - obsidian-updown       → data-updown="us"（僅美股慣例才設）
 *   - bs-preferences-v1     → data-font-size / data-density
 *
 * 注意：<html> 的 data-theme 不再寫死，交由腳本決定；為避免 hydration mismatch，
 * 於 <html> 標記 suppressHydrationWarning，且腳本僅在 head 執行（React 不接管這些屬性）。
 */
const displayPreferencesInitScript = buildDisplayPreferencesInitScript();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      suppressHydrationWarning
      data-density="comfortable"
      data-font-size="standard"
      className={`${notoSansTC.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <head>
        <script
          // 阻塞式、於繪製前還原主題（對齊博主 <head> 內嵌腳本）
          dangerouslySetInnerHTML={{ __html: displayPreferencesInitScript }}
        />
      </head>
      {/* 外殼依實站 <body> 文件順序渲染（登入前後一致）：
          skip-link → compliance-bar → site-header → 內容 → site-footer → mobile-taskbar。
          實測：登入後的頁面（/today/ /market/ …）**同樣**有 site-header 與 site-footer，
          差別只在底部列換成會員態（見 src/lib/shellRoutes.ts）。
          各元件皆自行以 @/lib/shellRoutes 判定是否屬於有外殼的頁面，
          'none' 路由（/learn/<slug>、/s/<ticker>、/privacy、/terms）一律回傳 null。
          body 加 pb-40 lg:pb-16，避免固定底欄遮住行動版頁尾（博主 body 同此）。 */}
      <body className="min-h-screen bg-background text-foreground selection:bg-cyan/30 review-mode pb-40 lg:pb-16" data-review-theme="dark">
        <SkipLink />
        <ComplianceBar />
        <Navigation />
        <main
          id="main-content"
          tabIndex={-1}
          className="shell-main mx-auto w-full max-w-[1360px] px-4 pt-5 outline-none md:px-6 lg:pt-7"
        >
          {children}
        </main>
        <SiteFooter />
        <BottomTabBar />
      </body>
    </html>
  );
}
