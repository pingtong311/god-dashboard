'use client';

import { useEffect } from 'react';

/**
 * 全域錯誤邊界（App Router 最外層，掛在 `src/app/global-error.tsx`）。
 *
 * 與 `src/app/error.tsx` 的差別：`error.tsx` 只接住「根 layout 之下」的錯誤；
 * 若錯誤發生在**根 layout 本身**（例如 layout 內的外殼元件 Navigation /
 * BottomTabBar / SiteFooter / ComplianceBar 於 client 導覽時拋錯），必須由本檔接住。
 *
 * ⚠ Next.js 規定：global-error 會**取代整個根 layout**，因此：
 *   1. 必須自行渲染 <html> 與 <body>；
 *   2. globals.css 不會被載入 → 不可依賴 Tailwind class，改用 inline style
 *      （自帶一套最小、獨立的深色樣式），確保錯誤頁在無樣式表時仍可讀。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/global-error.tsx]', error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0f14',
          color: '#e6edf3',
          fontFamily:
            'system-ui, -apple-system, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560, textAlign: 'center' }}>
          <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden="true">
            ⚠️
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: '16px 0 8px' }}>
            系統暫時無法顯示此頁
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#9aa7b2', margin: '0 0 20px' }}>
            應用程式發生未預期的錯誤。你可以重試，或回到首頁。
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#f0b90b',
                color: '#0b0f14',
                border: 'none',
                borderRadius: 12,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              重試
            </button>
            <a
              href="/"
              style={{
                border: '1px solid #2a3441',
                color: '#e6edf3',
                borderRadius: 12,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 900,
                textDecoration: 'none',
              }}
            >
              回首頁
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
