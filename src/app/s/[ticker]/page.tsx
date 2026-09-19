'use client';

/**
 * 個股盤後研究頁 /s/[ticker]
 * 複刻：https://blackstockai.com/s/2330/
 *
 * BlackScore v1.0 公開層計分邏輯（博主 /methodology/ 公開）：
 * - 分點資金 25% → 無資料源 →「未入庫」
 * - 買方集中 15% → 無資料源 →「未入庫」
 * - 法人動向 20% → /api/skynet/twse (T86) 可算
 * - 技術結構 15% → /api/skynet/kline (日K) 可算：20MA、位階
 * - 量能動能 15% → /api/skynet/kline (日K) 可算：當日量/20日均量
 * - 波動風險 10% → /api/skynet/kline (日K) 可算：20日平均振幅
 * 計分規則：缺資料分項不計分，總分按其餘分項重新換算成 100 分制，標示「未入庫」。
 */

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './stock.module.css';

// ── 型別定義 ────────────────────────────────────────────

interface TWSEItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  timestamp: string;
  tradeDate?: string;
  source?: string;
}

interface TWSEResponse {
  items: TWSEItem[];
  fetchedAt: string;
}

interface KLineCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KLineResponse {
  candles: KLineCandle[];
}

interface T86Row {
  symbol: string;
  name: string;
  netLots: number;
}

// ── 工具函式 ────────────────────────────────────────────

function formatDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-TW');
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatChange(n: number): string {
  if (!Number.isFinite(n)) return '--';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

function toneClass(change: number): string {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return '';
}

// ── BlackScore 計分邏輯 ────────────────────────────────

interface FactorResult {
  key: string;
  label: string;
  weight: number;
  fact: string;
  score: number | null; // null = 未入庫
  color: 'green' | 'red' | 'purple' | 'blue';
}

function computeBlackScore(
  twseData: TWSEItem | null,
  candles: KLineCandle[],
  t86Data: T86Row[]
): { total: number; factors: FactorResult[] } {
  const weights = {
    'branchCapital': 25,      // 分點資金
    'buyConcentration': 15,   // 買方集中
    'institutional': 20,      // 法人動向
    'technical': 15,          // 技術結構
    'volumeMomentum': 15,     // 量能動能
    'volatilityRisk': 10,     // 波動風險
  };

  const factors: FactorResult[] = [];

  // 1. 分點資金 — 無資料源
  factors.push({
    key: 'branchCapital',
    label: '分點資金',
    weight: weights.branchCapital,
    fact: '無分點明細資料源，暫不計分',
    score: null,
    color: 'blue',
  });

  // 2. 買方集中 — 無資料源
  factors.push({
    key: 'buyConcentration',
    label: '買方集中',
    weight: weights.buyConcentration,
    fact: '無分點集中度資料源，暫不計分',
    score: null,
    color: 'purple',
  });

  // 3. 法人動向 — 可算（T86 三大法人）
  let institutionalFact = '無三大法人資料';
  let institutionalScore: number | null = null;
  if (t86Data.length > 0) {
    const target = t86Data.find(r => r.symbol === twseData?.symbol);
    if (target && Number.isFinite(target.netLots)) {
      const lots = target.netLots;
      institutionalFact = `三大法人近 5 日淨買超 ${lots >= 0 ? '+' : ''}${lots} 張`;
      // 簡單評分：買超 > 0 給高分，賣超給低分
      institutionalScore = lots > 100 ? 85 : lots > 0 ? 65 : lots > -100 ? 35 : 15;
    } else {
      institutionalFact = '三大法人近 5 日淨買賣持平';
      institutionalScore = 50;
    }
  }
  factors.push({
    key: 'institutional',
    label: '法人動向',
    weight: weights.institutional,
    fact: institutionalFact,
    score: institutionalScore,
    color: 'green',
  });

  // 4. 技術結構 — 可算（日K：20MA、位階）
  let technicalFact = '無 K 線資料';
  let technicalScore: number | null = null;
  if (candles.length >= 20) {
    const latest = candles[candles.length - 1];
    const ma20 = candles.slice(-20).reduce((sum, c) => sum + c.close, 0) / 20;
    const position = ((latest.close - ma20) / ma20) * 100;
    const aboveMA = latest.close > ma20;
    technicalFact = aboveMA
      ? `收盤在 20 日均線上、20 日位階 ${position.toFixed(1)}%`
      : `收盤在 20 日均線下、20 日位階 ${Math.abs(position).toFixed(1)}%`;
    // 位階越高分越高，但限制在合理區間
    technicalScore = Math.max(0, Math.min(100, 50 + position * 2));
  } else if (candles.length > 0) {
    technicalFact = `K 線資料不足 ${candles.length}/20 日，無法計算 20MA`;
    technicalScore = 50;
  }
  factors.push({
    key: 'technical',
    label: '技術結構',
    weight: weights.technical,
    fact: technicalFact,
    score: technicalScore,
    color: 'red',
  });

  // 5. 量能動能 — 可算（日K：當日量/20日均量）
  let volumeFact = '無 K 線資料';
  let volumeScore: number | null = null;
  if (candles.length >= 20) {
    const latest = candles[candles.length - 1];
    const avgVol20 = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const ratio = avgVol20 > 0 ? latest.volume / avgVol20 : 1;
    volumeFact = `量能為 20 日均量 ${ratio.toFixed(1)} 倍`;
    // 1.0 倍為基準
    volumeScore = Math.max(0, Math.min(100, 50 + (ratio - 1) * 25));
  } else if (candles.length > 0) {
    volumeFact = `K 線資料不足 ${candles.length}/20 日，無法計算均量`;
    volumeScore = 50;
  }
  factors.push({
    key: 'volumeMomentum',
    label: '量能動能',
    weight: weights.volumeMomentum,
    fact: volumeFact,
    score: volumeScore,
    color: 'green',
  });

  // 6. 波動風險 — 可算（日K：20日平均振幅）
  let volatilityFact = '無 K 線資料';
  let volatilityScore: number | null = null;
  if (candles.length >= 20) {
    const avgAmplitude = candles.slice(-20).reduce((sum, c) => {
      const amp = c.high > 0 && c.low > 0 ? ((c.high - c.low) / c.low) * 100 : 0;
      return sum + amp;
    }, 0) / 20;
    volatilityFact = `20 日平均振幅 ${avgAmplitude.toFixed(1)}%`;
    // 振幅越小風險越低分越高
    volatilityScore = Math.max(0, Math.min(100, 100 - avgAmplitude * 10));
  } else if (candles.length > 0) {
    volatilityFact = `K 線資料不足 ${candles.length}/20 日，無法計算振幅`;
    volatilityScore = 50;
  }
  factors.push({
    key: 'volatilityRisk',
    label: '波動風險',
    weight: weights.volatilityRisk,
    fact: volatilityFact,
    score: volatilityScore,
    color: 'purple',
  });

  // 計算總分：只算有分數的分項，按權重加權平均，再換算成 100 分制
  const validFactors = factors.filter(f => f.score !== null);
  const totalWeight = validFactors.reduce((sum, f) => sum + f.weight, 0);
  const weightedSum = validFactors.reduce((sum, f) => sum + (f.score as number) * f.weight, 0);
  const total = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { total, factors };
}

// ── 內部 Client Component ──────────────────────────────

interface StockPageContentProps {
  ticker: string;
}

function StockPageContent({ ticker }: StockPageContentProps) {
  const [twseData, setTwseData] = useState<TWSEItem | null>(null);
  const [candles, setCandles] = useState<KLineCandle[]>([]);
  const [t86Data, setT86Data] = useState<T86Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      try {
        // 並行抓取三個資料源
        const [twseRes, klineRes, t86Res] = await Promise.allSettled([
          fetch(`/api/skynet/twse?tickers=${ticker}`).then(r => r.json()),
          fetch(`/api/skynet/kline?type=daily&ticker=${ticker}`).then(r => r.json()),
          // T86 資料從 market-overview 取得（已包含 institutionalBuy）
          fetch('/api/skynet/market-overview').then(r => r.json()),
        ]);

        if (cancelled) return;

        // TWSE 報價
        if (twseRes.status === 'fulfilled' && twseRes.value.ok && twseRes.value.items?.length > 0) {
          setTwseData(twseRes.value.items[0]);
        }

        // K 線
        if (klineRes.status === 'fulfilled' && klineRes.value.candles?.length > 0) {
          // 確保按日期排序
          const sorted = [...klineRes.value.candles].sort((a, b) => a.date.localeCompare(b.date));
          setCandles(sorted);
        }

        // T86 法人買超（從 market-overview 的 institutionalBuy 取得）
        if (t86Res.status === 'fulfilled' && t86Res.value.ok && t86Res.value.data?.institutionalBuy?.length > 0) {
          const mapped = t86Res.value.data.institutionalBuy.map((item: { symbol: string; name: string; netLots: number }) => ({
            symbol: item.symbol,
            name: item.name,
            netLots: item.netLots,
          }));
          setT86Data(mapped);
        }

        if (cancelled) return;
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError('資料載入失敗，請稍後再試');
        setLoading(false);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span className={styles.errorDesc}>載入盤後研究資料中…</span>
      </div>
    );
  }

  if (error || !twseData) {
    return (
      <div className={styles.error}>
        <div className={styles.errorTitle}>無法載入個股資料</div>
        <div className={styles.errorDesc}>{error || '查無此代號或資料暫時不可用'}</div>
        <button className={styles.retryButton} onClick={() => window.location.reload()}>
          重試
        </button>
      </div>
    );
  }

  const { total: score, factors } = computeBlackScore(twseData, candles, t86Data);
  const tradeDate = twseData.tradeDate ? formatDate(twseData.tradeDate) : '最新交易日';

  return (
    <div className={styles.page}>
      {/* 頂部導航區 */}
      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="麵包屑">
          <Link href="/">股市大佬 TradeBoss</Link>
          <span>›</span>
          <span>個股盤後研究</span>
        </nav>
        <div className={styles.titleRow}>
          <span className={styles.stockName}>{twseData.name}</span>
          <span className={styles.stockCode}>{ticker.toUpperCase()}</span>
          <span className={styles.sectorTag}>{twseData.name.includes('台積電') ? '半導體' : '（模糊，待確認）'}</span>
        </div>
        <div className={styles.metaRow}>
          <span>資料日 {tradeDate}（盤後統計）</span>
          <span className={styles.disclaimer}>｜本頁為公開資料整理，非投資建議</span>
        </div>
      </header>

      {/* 三欄指標 */}
      <div className={styles.metrics} role="region" aria-label="關鍵指標">
        <div className={styles.metric}>
          <span className={styles.metricLabel}>收盤價</span>
          <span className={`${styles.metricValue} ${toneClass(twseData.change)}`}>
            {formatNumber(twseData.price)}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>漲跌幅</span>
          <span className={`${styles.metricValue} ${toneClass(twseData.changePercent)}`}>
            {formatChange(twseData.change)} ({formatPercent(twseData.changePercent)})
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>成交量</span>
          <span className={styles.metricValue}>
            {formatInteger(twseData.volume)} 張
          </span>
        </div>
      </div>

      {/* BlackScore 研究熱度分數 */}
      <section className={styles.scoreSection} aria-labelledby="score-title">
        <div className={styles.scoreHeader}>
          <h2 id="score-title" className={styles.scoreTitle}>研究熱度分數（BlackScore v1.0）</h2>
          <div>
            <span className={styles.scoreValue}>{score}</span>
            <span className={styles.scoreTotal}> /100</span>
          </div>
        </div>
        <p className={styles.scoreDesc}>
          BlackScore 為股市大佬自研指標，綜合六大面向評估個股盤後吸引度。缺資料分項不計分，總分按其餘分項重新換算成 100 分制，並標示「未入庫」。
        </p>
        <div className={styles.factors} role="list" aria-label="六大分項明細">
          {factors.map((f) => (
            <div key={f.key} className={`${styles.factor} ${styles[`factorColor${f.color.charAt(0).toUpperCase() + f.color.slice(1)}`]}`} role="listitem">
              <div className={styles.factorInfo}>
                <div className={styles.factorLabel}>
                  {f.label}
                  <span className="weight"> 權重 {f.weight}%</span>
                </div>
                <div className={styles.factorFact}>{f.fact}</div>
              </div>
              <div className={`${styles.factorScore} ${f.score === null ? styles.missing : ''}`}>
                {f.score !== null ? f.score : '未入庫'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 三大法人近 5 日淨買賣 */}
      <section className={styles.institutionalSection} aria-labelledby="inst-title">
        <h2 id="inst-title" className={styles.sectionTitle}>三大法人近 5 日淨買賣</h2>
        {t86Data.length > 0 ? (
          <table className={styles.institutionalTable}>
            <thead>
              <tr>
                <th>身份別</th>
                <th>名稱</th>
                <th style={{ textAlign: 'right' }}>淨買超（張）</th>
              </tr>
            </thead>
            <tbody>
              {t86Data.map((row) => (
                <tr key={row.symbol}>
                  <td className={styles.name}>{row.symbol}</td>
                  <td>{row.name}</td>
                  <td style={{ textAlign: 'right' }} className={`${styles.netLots} ${toneClass(row.netLots)}`}>
                    {row.netLots >= 0 ? '+' : ''}{formatInteger(row.netLots)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>暫無法人資料</div>
            <div className={styles.emptyDesc}>T86 三大法人資料尚未更新或查無此代號</div>
          </div>
        )}
      </section>

      {/* CTA 區 */}
      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <div className={styles.ctaCard}>
          <div className={styles.ctaText}>
            <div className={styles.ctaTitle}>想看完整互動研究？</div>
            <div className={styles.ctaDesc}>
              即時走勢、日 K 技術結構、分點明細、集保級距與 AI 白話解讀在 App 內（免費註冊）。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/chips/${ticker}`} className={styles.ctaButton}>
              籌碼研究 →
            </Link>
            <Link href={`/chart?ticker=${ticker}`} className={styles.ctaButton}>
              開啟 {twseData.name} 完整研究頁 →
            </Link>
            <Link href={`/ai?ticker=${ticker}`} className={styles.ctaButton} style={{ background: 'var(--violet)' }}>
              問 AI 解讀 →
            </Link>
          </div>
        </div>
      </section>

      {/* 名詞白話 */}
      <section className={styles.glossarySection} aria-labelledby="glossary-title">
        <h2 id="glossary-title" className={styles.sectionTitle}>名詞白話</h2>
        <div className={styles.glossaryItem}>
          <div className={styles.glossaryTerm}>分點買賣超</div>
          <div className={styles.glossaryDef}>
            券商分點（營業部）的買進與賣出張數差。正數代表該分點淨買超，負數代表淨賣超。
            <Link href="/school/broker-branch" className={styles.glossaryLink}> 詳細教學 ›</Link>
          </div>
        </div>
        <div className={styles.glossaryItem}>
          <div className={styles.glossaryTerm}>集中度</div>
          <div className={styles.glossaryDef}>
            前三大買超分點佔全部淨買超的比例。愈高代表籌碼集中於少數分點，可能為特定主力操作。
            <Link href="/school/concentration" className={styles.glossaryLink}> 詳細教學 ›</Link>
          </div>
        </div>
        <div className={styles.glossaryItem}>
          <div className={styles.glossaryTerm}>法人定義</div>
          <div className={styles.glossaryDef}>
            外資自營商、外資投信、投信、自營商、自營商避險。五大法人身份別對應不同資金屬性與操作風格。
            <Link href="/school/institutional" className={styles.glossaryLink}> 詳細教學 ›</Link>
          </div>
        </div>
      </section>

      {/* 頁尾免責聲明 */}
      <footer className={styles.footer}>
        <p>本頁資料來源：證交所 MI_INDEX / T86 公開資訊、Fugle MarketData API、Yahoo Finance 備援。</p>
        <p>資料僅供參考，不構成任何投資建議。投資人應自行判斷，風險自負。</p>
        <p>
          <Link href="/legal/disclaimer">免責聲明</Link> ｜
          <Link href="/legal/privacy">隱私權政策</Link> ｜
          <Link href="/about">關於股市大佬</Link>
        </p>
      </footer>

      {/*
        底部功能列不在本頁渲染 —— src/app/layout.tsx:51 已全域掛載唯一一份 <AppTabBar />。
        個股頁屬細節頁，目前不在 AppTabBar 的顯示白名單內（會回傳 null），
        保留此註解說明為何沒有自行渲染，避免日後誤加而產生兩條重疊的底部列。
      */}
    </div>
  );
}

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