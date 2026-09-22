import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import styles from './stock.module.css';
import { StockPageContent } from './content';

// ── 頁面入口（Server Component）─────────────────────────

export const metadata = {
  title: '個股盤後研究｜股市大佬 TradeBoss',
  description: '台股個股盤後籌碼研究：法人動向、技術結構、量能動能、BlackScore 研究熱度分數',
};

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: PageProps) {
  const { ticker } = await params;

  // 基本驗證：4 碼數字或 t99
  if (!/^(\d{4}|t99)$/i.test(ticker)) {
    notFound();
  }

  return (
    <Suspense fallback={
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span className={styles.errorDesc}>載入中…</span>
      </div>
    }>
      <StockPageContent ticker={ticker.toUpperCase()} />
    </Suspense>
  );
}
