/** @jest-environment jsdom */

/**
 * 四頁共用元件測試（SPEC 會員四頁 §0-1 ~ §0-4）
 * ----------------------------------------------------------------------------
 * IndexMarqueeView / FuturesOptionsPanelView / ArrowRightLink / DataCaveatDetails
 *
 * 非同步資料載入（loadMarqueeItems / loadFuturesOptions）另外以注入 fetch 的
 * 方式在 marketOverview 既有測試覆蓋；本檔只驗證呈現層結構與 className。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import IndexMarquee, { IndexMarqueeView, type MarqueeItem } from '@/components/IndexMarquee';
import FuturesOptionsPanel, {
  FuturesOptionsPanelView,
  type FuturesOptionsData,
} from '@/components/FuturesOptionsPanel';
import ArrowRightLink from '@/components/ArrowRightLink';
import DataCaveatDetails from '@/components/DataCaveatDetails';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(node);
  });
  return container;
}

const ITEMS: readonly MarqueeItem[] = [
  { name: '加權', price: '48,024.6', changePercent: -0.27 },
  { name: '櫃買', price: '412.99', changePercent: -0.18 },
  { name: '台指期', price: '48,123', changePercent: -0.44 },
  { name: '費半', price: '12,305.82', changePercent: -1.82 },
  { name: '那斯達克', price: '26,725.8', changePercent: 0.78 },
];

const FO_DATA: FuturesOptionsData = {
  date: '2026-09-24',
  vix: '21.81',
  pcr: '1.42',
  rows: [
    { label: 'CD all', value: '買5 176／賣5 0' },
    { label: 'CD 202610', value: '買5 0／賣5 3' },
    { label: 'CF 202610', value: '買5 125／賣5 0' },
  ],
};

describe('§0-1 指數行情跑馬燈', () => {
  it('容器 aria-label 與 className 逐字對齊', () => {
    const container = render(<IndexMarqueeView items={ITEMS} />);
    const nav = container.querySelector('nav[aria-label="指數行情"]');
    expect(nav?.className).toBe(
      'silk-row silk-row-fade silk-marquee-host -mx-4 mb-3 min-w-0 px-4 lg:mx-0 lg:px-0',
    );
    expect(nav?.querySelector('.silk-marquee-track')).not.toBeNull();
  });

  it('5 檔內容貼兩份（第二份 aria-hidden）', () => {
    const container = render(<IndexMarqueeView items={ITEMS} />);
    const groups = Array.from(
      container.querySelectorAll('.silk-marquee-track > span.inline-flex'),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute('aria-hidden')).toBe('false');
    expect(groups[1]?.getAttribute('aria-hidden')).toBe('true');
    // 每份 5 檔
    expect(groups[0]?.querySelectorAll('.shrink-0.items-baseline').length).toBe(5);
  });

  it('跌為 text-down、漲為 text-up，漲跌%帶正負號', () => {
    const container = render(<IndexMarqueeView items={ITEMS} />);
    const rows = Array.from(
      container.querySelectorAll('.silk-marquee-track > span > span.shrink-0'),
    );
    // 第一檔加權 -0.27 → 現值與漲跌%皆 text-down
    const weighted = rows[0]?.querySelectorAll('.num');
    expect(weighted?.[0]?.className).toContain('text-down');
    expect(weighted?.[1]?.textContent).toBe('-0.27%');
    // 那斯達克 +0.78 → text-up
    const nasdaq = rows.find((r) => r.textContent?.includes('那斯達克'));
    expect(nasdaq?.querySelector('.num')?.className).toContain('text-up');
    expect(nasdaq?.textContent).toContain('+0.78%');
    expect(nasdaq?.textContent?.includes('-0.78%')).toBe(false);
  });
});

describe('§0-2 大盤期權區塊', () => {
  it('標題、日期與「期選盤後」連結', () => {
    const container = render(<FuturesOptionsPanelView data={FO_DATA} />);
    expect(container.querySelector('h2')?.textContent).toBe('大盤期權');
    expect(container.querySelector('p.text-\\[12px\\]')?.textContent).toContain('2026-09-24');
    const link = container.querySelector('a[href="/futures-opt/"]');
    expect(link?.textContent).toBe('期選盤後');
    expect(link?.className).toBe('text-[12px] font-black text-accent');
  });

  it('面板 className 含結尾兩個空格（data-panel hud-panel glass）', () => {
    const container = render(<FuturesOptionsPanelView data={FO_DATA} />);
    const panel = container.querySelector('.data-panel.hud-panel.glass');
    expect(panel?.className).toBe('data-panel hud-panel glass rounded-2xl p-5  ');
  });

  it('4 格小卡：VIX／PCR／價平附近（非數字）／資料', () => {
    const container = render(<FuturesOptionsPanelView data={FO_DATA} />);
    const cards = Array.from(container.querySelectorAll('.grid > div'));
    expect(cards).toHaveLength(4);
    expect(cards[0]?.querySelector('p.mt-0\\.5')?.textContent).toBe('21.81');
    expect(cards[1]?.querySelector('p.mt-0\\.5')?.textContent).toBe('1.42');
    // 第 3 格「價平附近」的值不是數字，而是 text-muted 的「快照無履約價」
    expect(cards[2]?.querySelector('p.mt-0\\.5')?.className).toContain('text-muted');
    expect(cards[2]?.querySelector('p.mt-0\\.5')?.textContent).toBe('快照無履約價');
    expect(cards[3]?.querySelector('p.mt-0\\.5')?.textContent).toBe('盤後');
  });

  it('3 列買賣明細', () => {
    const container = render(<FuturesOptionsPanelView data={FO_DATA} />);
    const rows = Array.from(container.querySelectorAll('ul > li'));
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector('.text-ink')?.textContent).toBe('CD all');
    expect(rows[0]?.querySelector('.text-muted')?.textContent).toBe('買5 176／賣5 0');
  });
});

describe('§0-4 ArrowRightLink', () => {
  it('className 與 Phosphor ArrowRight path', () => {
    const container = render(<ArrowRightLink href="/market/">市場</ArrowRightLink>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/market/');
    expect(link?.className).toBe('inline-flex items-center gap-1 text-[12.5px] font-black text-accent');
    expect(link?.textContent).toContain('市場');
    const path = link?.querySelector('path');
    expect(path?.getAttribute('d')).toMatch(/^M224\.49,136\.49/);
  });
});

describe('§0-3 DataCaveatDetails', () => {
  it('外殼 className 與 summary 文案', () => {
    const container = render(
      <DataCaveatDetails>
        <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
      </DataCaveatDetails>,
    );
    const details = container.querySelector('details');
    expect(details?.className).toBe('mt-6 rounded-2xl border border-line/70 bg-surface px-4 py-3');
    expect(details?.querySelector('summary')?.textContent).toBe('資料日期與口徑');
    expect(details?.querySelector('div')?.className).toBe(
      'mt-2 space-y-1 text-[12px] leading-relaxed text-muted',
    );
  });
});

describe('資料載入函式', () => {
  it('loadMarqueeItems 上游失敗時退回 5 檔快照', async () => {
    const items = await import('@/components/IndexMarquee').then((m) =>
      m.loadMarqueeItems(),
    );
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.name)).toEqual([
      '加權',
      '櫃買',
      '台指期',
      '費半',
      '那斯達克',
    ]);
  });

  it('loadFuturesOptions 回傳日期與快照值', async () => {
    const data = await import('@/components/FuturesOptionsPanel').then((m) =>
      m.loadFuturesOptions(),
    );
    expect(data.rows).toHaveLength(3);
    expect(['21.81', '1.42']).toContain(data.vix);
  });
});

// 讓未使用 import 在 type-only 情境下不報錯
void IndexMarquee;
void FuturesOptionsPanel;
