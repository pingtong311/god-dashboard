/**
 * /signal 技術分析（個股維度，?id= 預設 2330）
 * ----------------------------------------------------------------------------
 * 逐字複刻 captured/login-capture/html/signal-2330.html 的 <main> 結構；
 * 指標數字由 /api/skynet/kline 真實日 K 計算（client fetch），不造假資料。
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import SignalClient from './SignalClient';
import './page.css';

export const metadata: Metadata = {
  title: '技術分析｜股市大佬 TradeBoss',
  description:
    '個股技術分析：均線、MACD、RSI、支撐壓力、POC 與斐波那契回撤。全部描述已發生的結構位置，不是進出訊號。',
};

export default function SignalPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="page-enter">
          <section className="px-1 py-2">
            <h1 className="text-2xl font-black md:text-3xl">技術分析</h1>
          </section>
          <div className="grid gap-2" role="status" aria-live="polite">
            <span className="sr-only">正在整理技術分析頁…</span>
            <div aria-hidden="true" className="animate-pulse h-12 rounded-xl border border-line/70 bg-surface" />
            <div aria-hidden="true" className="animate-pulse h-72 rounded-xl border border-line/70 bg-surface" />
          </div>
        </div>
      }
    >
      <SignalClient />
    </Suspense>
  );
}
