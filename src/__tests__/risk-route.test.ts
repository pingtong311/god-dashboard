/** @jest-environment node */

/**
 * /api/skynet/risk —— 單元測試（純函式 + 路由行為）。
 *
 * 重點：
 *   - 民國年 → 西元 ISO（TWSE "115/09/18" 與 TPEx "1150924" 兩種格式）
 *   - 處置期間字串 → { period, endDate }
 *   - TWSE punish 列映射（reason 併入處置措施，用「｜」）
 *   - TPEx 上櫃處置映射
 *   - 上市＋上櫃合併去重與排序
 *   - 路由：成功回真實名單、上游全掛 → 502、部分成功 → 200 並記 gap
 *
 * 全程 mock 上游 fetch，不打真實證交所／櫃買。
 */

import { NextRequest } from 'next/server';
import {
  GET,
  rocDateToIso,
  parsePeriodRange,
  periodStart,
  splitDispositionsByStart,
  mapTwsePunishRow,
  mapTpexDisposalRow,
  mergeDispositions,
  type DispositionItem,
} from '@/app/api/skynet/risk/route';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

function req(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/risk');
}

/** TWSE punish 資料列（10 欄）。 */
function punishRow(over: {
  code: string;
  name: string;
  condition: string;
  period: string;
  measure?: string;
  date?: string;
}): string[] {
  return [
    '1',
    over.date ?? '115/09/17',
    over.code,
    over.name,
    '1',
    over.condition,
    over.period,
    over.measure ?? '',
    '',
    '',
  ];
}

function okPunish(data: string[][]) {
  return { stat: 'OK', title: 't', fields: [], data };
}

function tpexRow(over: {
  code: string;
  name: string;
  period: string;
  reason: string;
}) {
  return {
    Date: '1150923',
    SecuritiesCompanyCode: over.code,
    CompanyName: over.name,
    DispositionPeriod: over.period,
    DispositionReasons: over.reason,
    DisposalCondition: '',
  };
}

function mockUpstream(opts: {
  punish?: unknown;
  tpex?: unknown;
  punishStatus?: number;
  tpexStatus?: number;
}): void {
  globalThis.fetch = jest.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/announcement/punish')) {
      return new Response(JSON.stringify(opts.punish ?? okPunish([])), {
        status: opts.punishStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('tpex_disposal_information')) {
      return new Response(JSON.stringify(opts.tpex ?? []), {
        status: opts.tpexStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('rocDateToIso', () => {
  it('解析 TWSE "115/09/18" → 2026-09-18（民國 + 1911）', () => {
    expect(rocDateToIso('115/09/18')).toBe('2026-09-18');
  });
  it('解析單月單日 "115/9/8" → 2026-09-08（補零）', () => {
    expect(rocDateToIso('115/9/8')).toBe('2026-09-08');
  });
  it('解析 TPEx "1150924" → 2026-09-24', () => {
    expect(rocDateToIso('1150924')).toBe('2026-09-24');
  });
  it('無法解析回空字串（不亂猜）', () => {
    expect(rocDateToIso('')).toBe('');
    expect(rocDateToIso('abc')).toBe('');
  });
});

describe('parsePeriodRange', () => {
  it('TWSE "115/09/18～115/09/30" → period 用 ~ 連接，startDate/endDate', () => {
    expect(parsePeriodRange('115/09/18～115/09/30')).toEqual({
      period: '2026-09-18~2026-09-30',
      startDate: '2026-09-18',
      endDate: '2026-09-30',
    });
  });
  it('TPEx "1150924~1151006" → 2026-09-24~2026-10-06', () => {
    expect(parsePeriodRange('1150924~1151006')).toEqual({
      period: '2026-09-24~2026-10-06',
      startDate: '2026-09-24',
      endDate: '2026-10-06',
    });
  });
});

describe('periodStart', () => {
  it('取 "YYYY-MM-DD~YYYY-MM-DD" 的起始日', () => {
    expect(periodStart('2026-09-24~2026-10-06')).toBe('2026-09-24');
  });
  it('無 ~ 或空字串 → 空字串', () => {
    expect(periodStart('')).toBe('');
    expect(periodStart('2026-09-24')).toBe('');
  });
});

describe('splitDispositionsByStart', () => {
  const mk = (id: string, period: string): DispositionItem => ({
    stock_id: id,
    stock_name: id,
    label: id,
    reason: '',
    period,
    interval: '',
    end_date: period.includes('~') ? period.split('~')[1] : '',
  });

  it('起始日 > 資料日 → 即將；否則 → 處置中', () => {
    const items = [
      mk('A', '2026-09-18~2026-09-30'), // 已開始
      mk('B', '2026-09-24~2026-10-06'), // 當日開始
      mk('C', '2026-09-29~2026-10-06'), // 尚未開始（資料日 09-24）
    ];
    const { current, upcoming } = splitDispositionsByStart(items, '2026-09-24');
    expect(current.map((x) => x.stock_id)).toEqual(['A', 'B']);
    expect(upcoming.map((x) => x.stock_id)).toEqual(['C']);
  });
});

describe('mapTwsePunishRow', () => {
  it('reason 併入處置措施（全形｜），label 為 "代號 名稱"', () => {
    const item = mapTwsePunishRow(
      punishRow({
        code: '2305',
        name: '全友',
        condition: '連續五次及當日沖銷標準',
        period: '115/09/18～115/09/30',
        measure: '第一次處置',
      }),
    );
    expect(item).not.toBeNull();
    expect(item!.label).toBe('2305 全友');
    expect(item!.reason).toBe('連續五次及當日沖銷標準｜第一次處置');
    expect(item!.period).toBe('2026-09-18~2026-09-30');
    expect(item!.end_date).toBe('2026-09-30');
    expect(item!.interval).toBe('');
  });

  it('無處置措施時 reason 不加「｜」', () => {
    const item = mapTwsePunishRow(
      punishRow({ code: '1234', name: '測試', condition: '連續5個營業日', period: '115/09/18～115/09/30' }),
    );
    expect(item!.reason).toBe('連續5個營業日');
  });

  it('欄位不足或無代號 → null', () => {
    expect(mapTwsePunishRow(['1', '2'])).toBeNull();
    expect(mapTwsePunishRow(punishRow({ code: '', name: 'x', condition: 'c', period: '115/09/18～115/09/30' }))).toBeNull();
  });
});

describe('mapTpexDisposalRow', () => {
  it('上櫃處置映射（reason=DispositionReasons）', () => {
    const item = mapTpexDisposalRow(
      tpexRow({ code: '2221', name: '大甲', period: '1150924~1151006', reason: '連續3個營業日及沖銷標準' }),
    );
    expect(item!.label).toBe('2221 大甲');
    expect(item!.reason).toBe('連續3個營業日及沖銷標準');
    expect(item!.period).toBe('2026-09-24~2026-10-06');
    expect(item!.end_date).toBe('2026-10-06');
  });
});

describe('mergeDispositions', () => {
  const mk = (id: string, end: string): DispositionItem => ({
    stock_id: id,
    stock_name: id,
    label: id,
    reason: '',
    period: '',
    interval: '',
    end_date: end,
  });

  it('上市優先去重、依 end_date 由近到遠排序', () => {
    const listed = [mk('2305', '2026-09-30'), mk('2455', '2026-10-05')];
    const otc = [mk('2221', '2026-10-06'), mk('2305', '2026-12-31')]; // 2305 重複，上市優先
    const merged = mergeDispositions(listed, otc);
    expect(merged.map((x) => x.stock_id)).toEqual(['2305', '2455', '2221']);
    expect(merged.find((x) => x.stock_id === '2305')!.end_date).toBe('2026-09-30');
  });
});

describe('GET /api/skynet/risk', () => {
  it('成功：合併上市＋上櫃處置、帶 attention_note 與 provenance', async () => {
    mockUpstream({
      punish: okPunish([
        punishRow({
          code: '2305',
          name: '全友',
          condition: '連續五次及當日沖銷標準',
          period: '115/09/18～115/09/30',
          measure: '第一次處置',
          date: '115/09/24',
        }),
      ]),
      tpex: [tpexRow({ code: '2221', name: '大甲', period: '1150924~1151006', reason: '連續3個營業日及沖銷標準' })],
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    const body = (await res.json()) as {
      ok: boolean;
      date: string;
      disposition: DispositionItem[];
      attention_available: boolean;
      attention_note: string;
      provenance: { source: string };
    };
    expect(body.ok).toBe(true);
    expect(body.date).toBe('2026-09-24');
    expect(body.disposition.map((x) => x.stock_id)).toEqual(['2305', '2221']);
    expect(body.attention_available).toBe(false);
    expect(body.attention_note).toBe('注意股名單本站暫不列示，請以交易所最新公告為準。');
    expect(body.provenance.source).toBe('self-produced');
  });

  it('上游全掛（TWSE 與 TPEx 皆失敗）→ 502 risk_upstream_error', async () => {
    mockUpstream({ punish: {}, tpex: [], punishStatus: 500, tpexStatus: 500 });

    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'risk_upstream_error' });
  });

  it('部分成功（僅 TPEx 可用）→ 200 並在 gaps 記錄 TWSE 失敗', async () => {
    mockUpstream({
      punish: {},
      punishStatus: 500,
      tpex: [tpexRow({ code: '2221', name: '大甲', period: '1150924~1151006', reason: '連續3個營業日及沖銷標準' })],
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { disposition: DispositionItem[]; gaps: string[] };
    expect(body.disposition.map((x) => x.stock_id)).toEqual(['2221']);
    expect(body.gaps.some((g) => g.includes('上市處置'))).toBe(true);
  });
});
