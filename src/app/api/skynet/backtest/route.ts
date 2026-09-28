/**
 * 分點驗證回測 — GET /api/skynet/backtest?ticker=2330&mode=auto
 * ============================================================================
 * 職責：回傳實站 /api/broker-backtest 的**歷史快照**（site-mirror）。
 *
 * ⚠ 只有「2330 台積電 × 元大 × mode=auto」這一組快照：
 *   - ticker !== '2330' → 一律回 { ok:false, error:'mirror_only_2330' }，
 *     **絕不假裝能算**（本站無分點付費資料，無法重算；見
 *     src/app/api/skynet/channel/route.ts 說明）。
 *   - mode !== 'auto' → 回 { ok:false, error:'mirror_only_mode_auto' }（同樣無快照）。
 *
 * 成功回：{ ...mirrorBody, provenance: MIRROR_META, coverage, fetchedAt }
 *   - provenance：site-mirror（含基準日 2026-09-24、抓取時間）。
 *   - coverage：本頁逐欄來源覆蓋率（全為 site-mirror）。
 *   - fetchedAt：本 route 回應產生的 ISO 時間（≠ 快照基準日）。
 *
 * 依專案慣例：唯讀 GET route 不加 guardMutation、不 5xx（以 error 欄位誠實表達）。
 * 依專案慣例：不自行重算 total_ret_pct（複利口徑的坑見 mirror 模組檔頭）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeCoverageFromFields, type Provenance } from '@/lib/provenance';
import {
  BACKTEST_MIRROR,
  MIRROR_FIELD_SOURCES,
  MIRROR_META,
} from '@/app/backtest/mirror/backtest-2330-2026-09-24';

/** 唯一有快照的標的。 */
export const SUPPORTED_TICKER = '2330';

/** 唯一有快照的策略模式。 */
export const SUPPORTED_MODE = 'auto';

/** 缺資料時的來源標記（未入庫）。 */
const ABSENT_META: Provenance = { source: 'absent', upstream: '' };

/**
 * GET /api/skynet/backtest?ticker=2330&mode=auto
 *
 * @param req Next.js 請求（query：ticker、mode）
 * @returns 200 + 快照 body（成功）或 200 + 誠實錯誤（未入庫）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ticker = (req.nextUrl.searchParams.get('ticker') ?? '').trim();
  const mode = (req.nextUrl.searchParams.get('mode') ?? SUPPORTED_MODE).trim();

  // 只有 2330 這一組快照；其他標的一律誠實回「未入庫」，不假裝成功。
  if (ticker !== SUPPORTED_TICKER) {
    return NextResponse.json(
      {
        ok: false,
        error: 'mirror_only_2330',
        ticker,
        message: `本站目前只有 2330 台積電的回測快照；其他標的無資料可回，故不提供。`,
        provenance: ABSENT_META,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // 快照僅涵蓋 mode=auto；其他模式（如只測放空／只測做多）無快照。
  if (mode !== SUPPORTED_MODE) {
    return NextResponse.json(
      {
        ok: false,
        error: 'mirror_only_mode_auto',
        ticker,
        mode,
        message: `本站快照僅涵蓋 mode=auto；其他回測模式無資料可回，故不提供。`,
        provenance: ABSENT_META,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const coverage = computeCoverageFromFields(MIRROR_FIELD_SOURCES);

  return NextResponse.json(
    {
      ...BACKTEST_MIRROR,
      provenance: MIRROR_META,
      coverage,
      fetchedAt: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
