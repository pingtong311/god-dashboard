/** @jest-environment jsdom */

/**
 * GodPanel —— GOD 辦公室分析面板測試。
 * ----------------------------------------------------------------------------
 * 本專案的 `@testing-library/dom` 是壞掉的 symlink，故**不使用 testing-library**；
 * 改以：
 *   - `react-dom/server` 的 renderToStaticMarkup 驗證載入骨架結構（不執行 effect）
 *   - `react-dom/client` 的 createRoot + `react` 的 act 驗證 mount 後的真實狀態
 *   - mock `global.fetch` 驅動各狀態
 * （做法對齊 src/__tests__/school-page.test.tsx 與 today-group.test.tsx）
 *
 * 最高原則：資料誠實。ready:false 時畫面**不得出現任何數字**（連 0 都不行）。
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import GodPanel from '@/components/GodPanel';

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 已掛的 root，afterEach 統一 unmount。 */
const roots: Root[] = [];

/** 最小 Response mock（jsdom 無全域 Response）。 */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

/** 同步 render 後再 flush 多次 microtask，讓 useEffect 觸發的 fetch 結算。 */
async function renderAtAsync(element: ReactElement): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(element);
  });
  for (let tick = 0; tick < 10; tick += 1) {
    // eslint-disable-next-line no-await-in-loop -- 逐 tick 讓 fetch promise 鏈推進
    await act(async () => {
      await Promise.resolve();
    });
  }
  return container;
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount();
    });
  }
  roots.length = 0;
  delete (globalThis as unknown as Record<string, unknown>).fetch;
});

/* -------------------------------------------------------------------------- */
/* 1. 載入骨架（SSR 靜態渲染，不執行 effect）                                 */
/* -------------------------------------------------------------------------- */

describe('GodPanel — 載入骨架（SSR）', () => {
  it('renderToStaticMarkup 呈現 role=status 骨架 + sr-only 提示 + 標題', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<GodPanel endpoint="radar" />);

    const status = host.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(host.textContent).toContain('正在讀取 GOD 辦公室資料…');
    expect(host.querySelector('.animate-pulse')).not.toBeNull();
    expect(host.querySelector('h2')?.textContent).toContain('GOD 辦公室分析');
    // 未載入完成前不得出現任何數字
    expect(/[0-9]/.test(host.textContent ?? '')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 未產出（ready:false）—— 資料誠實                                        */
/* -------------------------------------------------------------------------- */

describe('GodPanel — 未產出（ready:false）', () => {
  it('顯示「GOD 辦公室資料尚未產出」，且畫面不出現任何數字', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        endpoint: 'radar',
        ready: false,
        message: 'GOD 辦公室資料尚未產出',
      }),
    ) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    const text = container.textContent ?? '';

    expect(text).toContain('GOD 辦公室資料尚未產出');
    expect(text).toContain('GOD 辦公室在交易日收盤後產出');
    // ★ 資料誠實：未產出時不得以 0 或任何數字冒充
    expect(/[0-9]/.test(text)).toBe(false);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 有資料（ready:true）                                                    */
/* -------------------------------------------------------------------------- */

const READY_BODY = {
  ok: true,
  endpoint: 'radar',
  ready: true,
  schema_version: '1.0.0',
  generated_at: '2026-09-26 16:08:04',
  provenance: { source: 'fengteam-sync', produced_by: 'sync-app-data' },
  received_at: '2026-09-27 15:21:46',
  age_ms: 1234,
  stale: false,
  payload: {
    is_open: false,
    trade_date: '2026-09-26',
    movers_scope: '盤中即時',
    note: '只列已入庫的公開統計與排序位置，不是進出建議。',
    movers: [
      { stock_id: '3021', label: '3021 鴻名', change_pct: 9.8 },
      { stock_id: '2330', label: '2330 台積電', change_pct: -1.2 },
    ],
  },
};

describe('GodPanel — 有資料（ready:true）', () => {
  it('頁尾顯示出處與產出時間，並以正確 URL 呼叫端點', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(READY_BODY));
    global.fetch = fetchMock as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    const text = container.textContent ?? '';

    expect(text).toContain('資料來源：GOD 辦公室');
    expect(text).toContain('產出時間');
    expect(text).toContain('2026-09-26 16:08:04');
    expect(fetchMock).toHaveBeenCalledWith('/api/skynet/god/radar', { cache: 'no-store' });
  });

  it('防禦性呈現已知重點（交易日／異動標的），且紅漲綠跌', async () => {
    global.fetch = jest.fn(async () => jsonResponse(READY_BODY)) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    expect(container.textContent).toContain('交易日');
    expect(container.textContent).toContain('2026-09-26');
    expect(container.textContent).toContain('異動標的');
    expect(container.textContent).toContain('3021 鴻名');

    const up = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === '+9.80%',
    );
    expect(up?.className).toContain('text-up');
    const down = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === '-1.20%',
    );
    expect(down?.className).toContain('text-down');
  });

  it('payload 無已知欄位時，誠實標示僅顯示出處與時間，不硬解未知欄位', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        endpoint: 'radar',
        ready: true,
        generated_at: '2026-09-26 16:08:04',
        payload: { foo: 'bar', baz: [1, 2, 3] },
      }),
    ) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    const text = container.textContent ?? '';
    expect(text).toContain('資料來源：GOD 辦公室');
    expect(text).toContain('未含可摘要欄位');
    // 未知欄位的內容（bar / 1 / 2 / 3）不得被硬解呈現
    expect(text).not.toContain('bar');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. stale                                                                   */
/* -------------------------------------------------------------------------- */

describe('GodPanel — 資料過期（stale:true）', () => {
  it('額外標示「資料已超過 6 小時」', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        endpoint: 'dashboard',
        ready: true,
        generated_at: '2026-09-20 08:00:00',
        stale: true,
        payload: { date: '2026-09-20' },
      }),
    ) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="dashboard" />);
    expect(container.textContent).toContain('資料已超過 6 小時');
  });
});

/* -------------------------------------------------------------------------- */
/* 5. 取得失敗                                                                */
/* -------------------------------------------------------------------------- */

describe('GodPanel — 取得失敗', () => {
  it('fetch reject 時顯示可理解的錯誤狀態，不白屏', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    const text = container.textContent ?? '';

    expect(text).toContain('GOD 辦公室資料暫時無法取得');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    // 標題仍在（非白屏）
    expect(container.querySelector('h2')?.textContent).toContain('GOD 辦公室分析');
  });

  it('回應非 ok 時亦走錯誤狀態，不崩潰', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ error: 'boom' }, false)) as unknown as typeof fetch;

    const container = await renderAtAsync(<GodPanel endpoint="radar" />);
    expect(container.textContent).toContain('GOD 辦公室資料暫時無法取得');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
