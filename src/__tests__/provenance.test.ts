/** @jest-environment node */

/**
 * src/lib/provenance.ts 純函式單元測試。
 *
 * 重點：
 *   - 四種來源分類的覆蓋率統計。
 *   - ★self_produced_ratio 在 site_unreliable 存在時「不列入分子也不列入分母」。
 *   - 分母為 0 時回 0（不回 NaN）。
 *   - readableUpstreamName / hasData / SOURCE_LABELS。
 */

import {
  SOURCE_LABELS,
  computeCoverage,
  computeCoverageFromFields,
  computeSelfProducedRatio,
  hasData,
  readableUpstreamName,
  type ProvenanceSource,
} from '@/lib/provenance';

describe('computeSelfProducedRatio', () => {
  it('一般情形：selfProduced / (selfProduced + siteMirror + absent)', () => {
    expect(computeSelfProducedRatio(3, 1, 0)).toBeCloseTo(0.75, 10);
    expect(computeSelfProducedRatio(1, 1, 1)).toBeCloseTo(1 / 3, 10);
    expect(computeSelfProducedRatio(0, 4, 0)).toBe(0);
  });

  it('分母為 0 時回 0（不回 NaN）', () => {
    expect(computeSelfProducedRatio(0, 0, 0)).toBe(0);
    expect(Number.isNaN(computeSelfProducedRatio(0, 0, 0))).toBe(false);
  });
});

describe('computeCoverage', () => {
  it('統計各分類欄位數', () => {
    const sources: ProvenanceSource[] = [
      'self-produced',
      'self-produced',
      'site-mirror',
      'site-unreliable',
      'absent',
    ];
    expect(computeCoverage(sources)).toEqual({
      self_produced: 2,
      site_mirror: 1,
      site_unreliable: 1,
      absent: 1,
      // 2 / (2 + 1 + 1) = 0.5；site_unreliable 不入分子也不入分母
      self_produced_ratio: 0.5,
    });
  });

  it('★site_unreliable 不列入分子也不列入分母（加入後自產率不變）', () => {
    const withoutUnreliable: ProvenanceSource[] = ['self-produced', 'site-mirror', 'absent'];
    const withUnreliable: ProvenanceSource[] = [
      'self-produced',
      'site-mirror',
      'absent',
      'site-unreliable',
      'site-unreliable',
      'site-unreliable',
    ];

    const a = computeCoverage(withoutUnreliable);
    const b = computeCoverage(withUnreliable);

    // 自產率完全相同（刻意不借不影響自產率）
    expect(a.self_produced_ratio).toBeCloseTo(1 / 3, 10);
    expect(b.self_produced_ratio).toBeCloseTo(1 / 3, 10);
    expect(b.self_produced_ratio).toBe(a.self_produced_ratio);

    // 但 site_unreliable 仍必須單獨列出，不可被吞掉
    expect(b.site_unreliable).toBe(3);
    expect(a.site_unreliable).toBe(0);
    expect(a.self_produced).toBe(b.self_produced);
    expect(a.site_mirror).toBe(b.site_mirror);
    expect(a.absent).toBe(b.absent);
  });

  it('空清單 → 全 0、ratio 0', () => {
    expect(computeCoverage([])).toEqual({
      self_produced: 0,
      site_mirror: 0,
      site_unreliable: 0,
      absent: 0,
      self_produced_ratio: 0,
    });
  });
});

describe('computeCoverageFromFields', () => {
  it('由逐欄來源物件計算（等同 computeCoverage(values)）', () => {
    const cov = computeCoverageFromFields({
      a: 'self-produced',
      b: 'self-produced',
      c: 'site-mirror',
      d: 'site-unreliable',
      e: 'absent',
    });
    expect(cov.self_produced).toBe(2);
    expect(cov.site_mirror).toBe(1);
    expect(cov.site_unreliable).toBe(1);
    expect(cov.absent).toBe(1);
    expect(cov.self_produced_ratio).toBeCloseTo(0.5, 10);
  });
});

describe('hasData', () => {
  it('self-produced / site-mirror 視為有資料；site-unreliable / absent 視為無資料', () => {
    expect(hasData('self-produced')).toBe(true);
    expect(hasData('site-mirror')).toBe(true);
    expect(hasData('site-unreliable')).toBe(false);
    expect(hasData('absent')).toBe(false);
  });
});

describe('readableUpstreamName', () => {
  it('已知上游 → 可讀名稱', () => {
    expect(readableUpstreamName('https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX')).toBe(
      '臺灣證券交易所',
    );
    expect(readableUpstreamName('https://www.tpex.org.tw/www/zh-tw/afterTrading/otc')).toBe(
      '證券櫃檯買賣中心',
    );
    expect(readableUpstreamName('https://blackstockai.com/api/broker-backtest/2330')).toBe(
      '實站（blackstockai.com）',
    );
  });

  it('未知但合法的 URL → 取 hostname', () => {
    expect(readableUpstreamName('https://example.com/foo')).toBe('example.com');
  });

  it('空字串 / 非 URL → 誠實回傳，不捏造', () => {
    expect(readableUpstreamName('')).toBe('未標示來源');
    expect(readableUpstreamName('not-a-url')).toBe('not-a-url');
  });
});

describe('SOURCE_LABELS', () => {
  it('四種來源都有中文短標籤', () => {
    expect(SOURCE_LABELS['self-produced']).toBe('本站自產');
    expect(SOURCE_LABELS['site-mirror']).toBe('實站快照');
    expect(SOURCE_LABELS['site-unreliable']).toBe('本站刻意不提供');
    expect(SOURCE_LABELS['absent']).toBe('資料未入庫');
  });
});
