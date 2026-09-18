import type { Metadata } from "next";
import { Noto_Sans_TC, Rajdhani } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import AppTabBar from "@/components/AppTabBar";

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
  title: "SKYNET OS | 戰略控制中心",
  description: "天網系統全能極速量化交易引擎 V10 戰情室",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      data-theme="dark"
      data-density="comfortable"
      data-font-size="standard"
      className={`${notoSansTC.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground selection:bg-cyan/30 review-mode" data-review-theme="dark">
        <Navigation />
        <AppTabBar />
        <main className="w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
