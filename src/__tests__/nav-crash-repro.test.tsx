/** @jest-environment jsdom */

/**
 * 回歸測試：瀏覽器「上一頁／下一頁」崩潰。
 * ----------------------------------------------------------------------------
 * 根因（本次修復）：
 *   App Router 的客戶端路由 —— 包含瀏覽器上一頁／下一頁與 next/link —— 會「就地」
 *   重新 render 目的路由的元件樹（不整頁重載）。若某元件在 render 期對 API 回傳的
 *   缺欄位資料呼叫方法（例如 undefined.replace / undefined.match），且整個 App
 *   缺少 error boundary，錯誤會一路上拋到 Next.js 內建預設邊界，整個 UI 被換成
 *   「Application error: a client-side exception has occurred」= BOSS 看到的崩潰。
 *
 * 本測試以 <Treemap /> 重現最小情境：API 回 { ok:true, sectors:[...] } 但**缺**
 *   `date` 與 `marketGroups`。修復前 `data.date.replace(...)` 會拋 TypeError
 *   （`data?.date` 只保護 data、沒保護 date），導致整頁崩潰。
 * 修復後應正常渲染、不拋錯。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Treemap from '@/components/Treemap';

// React 19 的 act 需要此旗標才不會警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('瀏覽器上下頁崩潰回歸 — 缺欄位的 API 回應不得讓頁面拋錯', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
    jest.restoreAllMocks();
  });

  it('<Treemap /> 收到 {ok:true, sectors:[...]}（缺 date / marketGroups）時 render 不拋錯', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        // 刻意缺 date 與 marketGroups：修復前 data.date.replace 與
        // data.marketGroups[label] 會拋 TypeError，導致整頁崩潰。
        sectors: [
          {
            sector: '半導體',
            totalMarketCap: 100,
            totalVolume: 1,
            count: 3,
            items: [],
            changePercent: 1.2,
          },
        ],
        totalStocks: 1,
      }),
    }) as unknown as typeof fetch;

    await act(async () => {
      root = createRoot(container);
      root.render(<Treemap />);
    });
    // flush 非同步 effect（fetch → setState）。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 修復前：這裡會因 render 期拋錯而使元件樹崩掉。
    expect(container.textContent).toContain('族群熱圖');
    expect(container.textContent).not.toContain('Application error');
  });
});
