/** @jest-environment node */

/**
 * GET /api/skynet/backtest 路由測試。
 *
 * 重點：
 *   - ticker=2330&mode=auto → 回快照（site-mirror）+ coverage + fetchedAt。
 *   - ★反向實驗：ticker=2317（非 2330）→ 回 mirror_only_2330（absent），
 *     **不可回 2330 的資料假裝成功**。
 *   - mode 非 auto → mirror_only_mode_auto（同樣無快照）。
 *   - 缺 ticker → 視為非 2330 → mirror_only_2330。
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/backtest/route';

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/skynet/backtest${query}`);
}

describe('GET /api/skynet/backtest', () => {
  it('ticker=2330&mode=auto → 回快照（29 筆 + provenance site-mirror + coverage）', async () => {
    const res = await GET(req('?ticker=2330&mode=auto'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      label: string;
      broker: string;
      n_trades: number;
      total_ret_pct: number;
      trades: unknown[];
      broker_options: unknown[];
      provenance: { source: string; snapshot_date?: string; upstream: string };
      coverage: {
        self_produced: number;
        site_mirror: number;
        site_unreliable: number;
        absent: number;
        self_produced_ratio: number;
      };
      fetchedAt: string;
    };

    expect(body.ok).toBe(true);
    expect(body.label).toBe('2330 台積電');
    expect(body.broker).toBe('元大');
    expect(body.n_trades).toBe(29);
    expect(body.trades).toHaveLength(29);
    expect(body.broker_options).toHaveLength(12);
    // 複利口徑（非 4.12）
    expect(body.total_ret_pct).toBe(2.28);

    expect(body.provenance.source).toBe('site-mirror');
    expect(body.provenance.snapshot_date).toBe('2026-09-24');
    expect(body.provenance.upstream).toContain('broker-backtest/2330');

    expect(body.coverage.site_mirror).toBe(16);
    expect(body.coverage.self_produced).toBe(0);
    expect(body.coverage.absent).toBe(0);
    expect(body.coverage.self_produced_ratio).toBe(0);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('mode 預設為 auto（未帶 mode 亦成功）', async () => {
    const res = await GET(req('?ticker=2330'));
    const body = (await res.json()) as { ok: boolean; trades: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.trades).toHaveLength(29);
  });

  it('★反向實驗：ticker=2317 → mirror_only_2330 + absent（不假裝成功）', async () => {
    const res = await GET(req('?ticker=2317&mode=auto'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      ticker: string;
      provenance: { source: string; upstream: string };
      trades?: unknown[];
      n_trades?: number;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('mirror_only_2330');
    expect(body.ticker).toBe('2317');
    expect(body.provenance.source).toBe('absent');
    // 絕不可夾帶 2330 的資料
    expect(body.trades).toBeUndefined();
    expect(body.n_trades).toBeUndefined();
  });

  it('缺 ticker → mirror_only_2330', async () => {
    const res = await GET(req(''));
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('mirror_only_2330');
  });

  it('ticker=2330&mode=short → mirror_only_mode_auto（該模式無快照）', async () => {
    const res = await GET(req('?ticker=2330&mode=short'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      mode: string;
      provenance: { source: string };
      trades?: unknown[];
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('mirror_only_mode_auto');
    expect(body.mode).toBe('short');
    expect(body.provenance.source).toBe('absent');
    expect(body.trades).toBeUndefined();
  });
});
