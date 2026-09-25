'use client';

/**
 * 估值河流 — 客戶端互動部分
 * ----------------------------------------------------------------------------
 * 對齊 valuation-2330.html：<main> 內的五欄輸入（預估 EPS／低／中／高本益／現價）
 * 與「研究用區間」結果面板。輸入即時重算，公式：參考價 ＝ 假設 EPS × 假設本益。
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/** 把數字格式化為「最多兩位小數、去尾零」的字串（例：240 / 318.5 / 33.33）。 */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** 解析輸入字串為正有限數；空字串或非法值回 null。 */
function parseNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ValuationClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const ticker = searchParams.get('id') || '2330';

  const [epsRaw, setEpsRaw] = useState('20');
  const [lowRaw, setLowRaw] = useState('12');
  const [midRaw, setMidRaw] = useState('16');
  const [highRaw, setHighRaw] = useState('22');
  const [priceRaw, setPriceRaw] = useState('');

  const eps = parseNum(epsRaw);
  const low = parseNum(lowRaw);
  const mid = parseNum(midRaw);
  const high = parseNum(highRaw);
  const price = parseNum(priceRaw);

  const bands = useMemo(() => {
    const at = (multiple: number | null): string => {
      if (eps === null || multiple === null) return '—';
      return fmt(eps * multiple);
    };
    return { low: at(low), mid: at(mid), high: at(high) };
  }, [eps, low, mid, high]);

  /** 現價若已填，標出它落在哪一段（偏低／中性／偏高之上），照實呈現、不預測。 */
  const position = useMemo(() => {
    if (price === null || eps === null) return null;
    const lo = low === null ? null : eps * low;
    const hi = high === null ? null : eps * high;
    if (lo !== null && hi !== null) {
      if (price < lo) return '低於偏低假設';
      if (price > hi) return '高於偏高假設';
    }
    return '落於研究用區間內';
  }, [price, eps, low, high]);

  return (
    <div className="page-enter">
      <h1 className="text-2xl font-black md:text-3xl">估值河流</h1>
      <p className="mt-1 text-[13.5px] text-muted">
        調整 EPS 與本益假設，得到研究用價格區間；平台不會把它設成提醒價，也不是買賣建議。
      </p>
      <details className="group mt-4 rounded-2xl border border-line/80 bg-surface/70 p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[13.5px] font-black text-accent">
          <span>這頁怎麼看？（點開，30 秒讀完）</span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="text-[12.5px] font-black text-ink">這是什麼</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              把「我假設明年賺多少、市場願意給幾倍」換成三個參考價。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">怎麼用</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              填預估 EPS、低／中／高本益倍數；可選填現價看落在哪一段。
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-black text-ink">然後呢</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              區間會隨假設改變。獲利下修或循環股請自行重設假設。歷史統計，非投資建議。
            </dd>
          </div>
        </dl>
      </details>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-bold text-muted">
          預估 EPS（元）
          <input
            inputMode="decimal"
            className="num mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg font-bold text-ink outline-none focus:border-accent"
            value={epsRaw}
            onChange={(e) => setEpsRaw(e.target.value)}
            aria-label="預估 EPS（元）"
          />
        </label>
        <label className="text-xs font-bold text-muted">
          低本益
          <input
            inputMode="decimal"
            className="num mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg font-bold text-ink outline-none focus:border-accent"
            value={lowRaw}
            onChange={(e) => setLowRaw(e.target.value)}
            aria-label="低本益"
          />
        </label>
        <label className="text-xs font-bold text-muted">
          中本益
          <input
            inputMode="decimal"
            className="num mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg font-bold text-ink outline-none focus:border-accent"
            value={midRaw}
            onChange={(e) => setMidRaw(e.target.value)}
            aria-label="中本益"
          />
        </label>
        <label className="text-xs font-bold text-muted">
          高本益
          <input
            inputMode="decimal"
            className="num mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg font-bold text-ink outline-none focus:border-accent"
            value={highRaw}
            onChange={(e) => setHighRaw(e.target.value)}
            aria-label="高本益"
          />
        </label>
        <label className="text-xs font-bold text-muted">
          現價（可空）
          <input
            inputMode="decimal"
            className="num mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg font-bold text-ink outline-none focus:border-accent"
            value={priceRaw}
            onChange={(e) => setPriceRaw(e.target.value)}
            aria-label="現價（可空）"
          />
        </label>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 border-l-accent">
        <p className="text-lg font-black">研究用區間</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-center">
            <div className="text-xs text-muted">偏低假設</div>
            <div className="num text-xl font-black">{bands.low}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-center">
            <div className="text-xs text-muted">中性假設</div>
            <div className="num text-xl font-black text-accent">{bands.mid}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-center">
            <div className="text-xs text-muted">偏高假設</div>
            <div className="num text-xl font-black">{bands.high}</div>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          公式：參考價 ＝ 假設 EPS × 假設本益。公式本身不含籌碼、景氣循環與流動性風險。
        </p>
        {position !== null && (
          <p className="mt-2 text-[12.5px] font-bold text-ink">
            填入現價 {fmt(price ?? NaN)} 元：{position}（研究用，非買賣建議）。
          </p>
        )}
      </div>
      <p className="mt-4 text-sm text-muted">
        也可到個股頁看「本益比河流」對照歷史倍數位置。{' '}
        <Link
          href={`/stock/?id=${encodeURIComponent(ticker)}`}
          className="font-bold text-accent"
        >
          範例：{ticker} →
        </Link>
      </p>
    </div>
  );
}
