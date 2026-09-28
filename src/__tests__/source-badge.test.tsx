/** @jest-environment jsdom */

/**
 * SourceBadge 元件測試：四種來源分類各渲染對應文案。
 * 純靜態 Server Component，以 createRoot + act 同步渲染（比照 screener-pages.test.tsx）。
 */

import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import SourceBadge from '@/components/SourceBadge';
import type { Provenance } from '@/lib/provenance';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
}

describe('SourceBadge', () => {
  it('self-produced → 「資料來源：本站自產（可讀上游名稱）」', () => {
    const p: Provenance = {
      source: 'self-produced',
      upstream: 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX',
    };
    const c = render(<SourceBadge provenance={p} />);
    expect(c.textContent).toContain('資料來源：');
    expect(c.textContent).toContain('本站自產');
    expect(c.textContent).toContain('臺灣證券交易所');
    expect(c.querySelector('[data-source="self-produced"]')).not.toBeNull();
  });

  it('site-mirror → 「實站快照（基準日 …，非即時）」+ note', () => {
    const p: Provenance = {
      source: 'site-mirror',
      upstream: 'https://blackstockai.com/api/broker-backtest/2330?mode=auto',
      snapshot_date: '2026-09-24',
      captured_at: '2026-09-24T15:39:29.000Z',
    };
    const c = render(<SourceBadge provenance={p} note="本站無法重算" />);
    expect(c.textContent).toContain('實站快照');
    expect(c.textContent).toContain('2026-09-24');
    expect(c.textContent).toContain('非即時');
    expect(c.textContent).toContain('本站無法重算');
    expect(c.querySelector('[data-source="site-mirror"]')).not.toBeNull();
  });

  it('site-unreliable → 「本站不提供此欄位」+ omitted_reason', () => {
    const p: Provenance = {
      source: 'site-unreliable',
      upstream: '',
      omitted_reason: '實站標記內部矛盾（一致率 85.0% 僅等於全部判中性）。',
    };
    const c = render(<SourceBadge provenance={p} />);
    expect(c.textContent).toContain('本站不提供此欄位');
    expect(c.textContent).toContain('內部矛盾');
    expect(c.querySelector('[data-source="site-unreliable"]')).not.toBeNull();
  });

  it('absent → 「資料未入庫」', () => {
    const p: Provenance = { source: 'absent', upstream: '' };
    const c = render(<SourceBadge provenance={p} />);
    expect(c.textContent).toContain('資料未入庫');
    expect(c.querySelector('[data-source="absent"]')).not.toBeNull();
  });

  it('具 role="note" 與裝飾圖示 aria-hidden', () => {
    const p: Provenance = { source: 'absent', upstream: '' };
    const c = render(<SourceBadge provenance={p} />);
    expect(c.querySelector('[role="note"]')).not.toBeNull();
    expect(c.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
