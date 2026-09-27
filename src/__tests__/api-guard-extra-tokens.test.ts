/** @jest-environment node */

/**
 * guardMutation 端點專用權杖（extraTokens）測試
 *
 * 背景：GOD 辦公室的 ingest 端點原本要求全站共用的寫入權杖
 * SKYNET_DASHBOARD_API_TOKEN；該 token 同時能寫入另外 9 個端點。為了不必把全站
 * 寫入能力交出去，guardMutation 新增 extraTokens：只對呼叫端點有效的專用權杖。
 *
 * 本檔只驗證 guardMutation 的權杖比對語意與「零行為改變」：
 *   1. extraTokens 清單中的 token → 放行
 *   2. 全域 SKYNET_DASHBOARD_API_TOKEN 仍能放行（既有行為不變）
 *   3. 不在任何清單中的 token → 403
 *   4. 空字串邊界：extraTokens: [''] 且請求未帶任何 token → 403（不得誤放行）
 *   5. 未設定邊界：GOD_INGEST_TOKEN 為 undefined（route 傳入 ['']）時不誤放行
 *   6. 零行為改變：不傳 extraTokens、configuredToken 有值、allowSameOrigin:false、
 *      帶同源 Origin 與 Referer → 仍須 403
 *
 * 另含「allowSameOrigin 三態語義」suite：修正無權杖環境下同源分支 fail-open 的既存缺陷
 * （無權杖時 !configuredToken 為 true → 架空 allowSameOrigin:false），驗證三態語義
 * （true / false / undefined）與修正點。
 *
 * 測試風格對齊本專案：直接呼叫 guardMutation 並傳入原生 `new Request(...)`；
 * 不使用 @testing-library（本專案的 @testing-library/dom 為壞掉的 symlink）。
 *
 * guardMutation 於呼叫當下讀取 process.env，故於 module scope 保存原值、afterEach 還原
 * （比照 src/__tests__/god-bridge.test.ts 的既有寫法）。
 */

import { guardMutation } from '@/lib/apiGuard';

// ── 環境變數保存與還原（module scope 保存原值）─────────────────────────────────
const ORIGINAL_DASHBOARD_TOKEN = process.env.SKYNET_DASHBOARD_API_TOKEN;
const ORIGINAL_WRITE_TOKEN = process.env.SKYNET_API_WRITE_TOKEN;
const ORIGINAL_GOD_INGEST_TOKEN = process.env.GOD_INGEST_TOKEN;

/** 還原單一環境變數：原值為 undefined 時刪除該鍵。 */
function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const GLOBAL_TOKEN = 'global-dashboard-token';
const INGEST_TOKEN = 'god-ingest-dedicated-token';

beforeEach(() => {
  // 乾淨基線：全域權杖有值、替代權杖與 GOD 專用權杖不存在。
  process.env.SKYNET_DASHBOARD_API_TOKEN = GLOBAL_TOKEN;
  delete process.env.SKYNET_API_WRITE_TOKEN;
  delete process.env.GOD_INGEST_TOKEN;
});

afterEach(() => {
  restoreEnv('SKYNET_DASHBOARD_API_TOKEN', ORIGINAL_DASHBOARD_TOKEN);
  restoreEnv('SKYNET_API_WRITE_TOKEN', ORIGINAL_WRITE_TOKEN);
  restoreEnv('GOD_INGEST_TOKEN', ORIGINAL_GOD_INGEST_TOKEN);
});

// ── 請求建構子 ────────────────────────────────────────────────────────────────
/** 建立帶 Bearer token 的 POST 請求；token 為 null 代表不帶任何憑證。 */
function postRequest(token: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/skynet/god/ingest', { method: 'POST', headers });
}

/** 建立同源請求：帶 Origin / Referer 與代理主機標頭（x-skynet-proxied-from）。 */
function sameOriginRequest(token: string | null): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-skynet-proxied-from': 'localhost',
    Origin: 'http://localhost',
    Referer: 'http://localhost/api/skynet/god/ingest',
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/skynet/god/ingest', { method: 'POST', headers });
}

/** 斷言回傳為 403 的 NextResponse（而非 null）。 */
function expectForbidden(result: ReturnType<typeof guardMutation>): void {
  expect(result).not.toBeNull();
  expect(result?.status).toBe(403);
}

describe('guardMutation extraTokens（端點專用權杖）', () => {
  it('案例 1：extraTokens 清單中的 token → 放行（回 null）', () => {
    const result = guardMutation(postRequest(INGEST_TOKEN), {
      endpoint: 'god-ingest',
      allowSameOrigin: false,
      extraTokens: [INGEST_TOKEN],
    });
    expect(result).toBeNull();
  });

  it('案例 2：全域 SKYNET_DASHBOARD_API_TOKEN 仍能放行（既有行為不變）', () => {
    const result = guardMutation(postRequest(GLOBAL_TOKEN), {
      endpoint: 'god-ingest-global',
      allowSameOrigin: false,
      extraTokens: [INGEST_TOKEN],
    });
    expect(result).toBeNull();
  });

  it('案例 3：不在任何清單中的 token → 403', () => {
    const result = guardMutation(postRequest('random-attacker-token'), {
      endpoint: 'god-ingest-unknown',
      allowSameOrigin: false,
      extraTokens: [INGEST_TOKEN],
    });
    expectForbidden(result);
  });

  it('案例 4：extraTokens 為 [""] 且請求未帶任何 token → 403（空字串不得誤放行）', () => {
    const result = guardMutation(postRequest(null), {
      endpoint: 'god-ingest-empty',
      allowSameOrigin: false,
      extraTokens: [''],
    });
    expectForbidden(result);
  });

  it('案例 5：GOD_INGEST_TOKEN 未設定（route 傳入 [""]）時不誤放行', () => {
    // 模擬 route.ts：extraTokens: [process.env.GOD_INGEST_TOKEN ?? '']，而 env 未設定。
    delete process.env.GOD_INGEST_TOKEN;
    const extraTokens = [process.env.GOD_INGEST_TOKEN ?? ''];

    // 5a. 未帶任何 token → 403
    expectForbidden(
      guardMutation(postRequest(null), {
        endpoint: 'god-ingest-unset',
        allowSameOrigin: false,
        extraTokens,
      }),
    );

    // 5b. 帶任意非全域 token → 403
    expectForbidden(
      guardMutation(postRequest('attacker-token'), {
        endpoint: 'god-ingest-unset',
        allowSameOrigin: false,
        extraTokens,
      }),
    );

    // 5c. 全域權杖仍可放行（即使專用權杖未設定）
    expect(
      guardMutation(postRequest(GLOBAL_TOKEN), {
        endpoint: 'god-ingest-unset',
        allowSameOrigin: false,
        extraTokens,
      }),
    ).toBeNull();
  });

  it('案例 6：不傳 extraTokens + allowSameOrigin:false + 同源 Origin/Referer → 仍 403（零行為改變）', () => {
    const result = guardMutation(sameOriginRequest(null), {
      endpoint: 'god-ingest-sameorigin',
      allowSameOrigin: false,
    });
    expectForbidden(result);
  });
});

describe('guardMutation allowSameOrigin 三態語義（無權杖環境 fail-open 修正）', () => {
  /**
   * 清空所有權杖，模擬「尚未設定任何權杖」的環境（configuredToken === ''）。
   * 修正前此環境下同源分支為 fail-open（!configuredToken 為 true → 放行），
   * 會架空 allowSameOrigin:false；修正後 allowSameOrigin:false 一律擋下同源。
   */
  function clearAllTokens(): void {
    delete process.env.SKYNET_DASHBOARD_API_TOKEN;
    delete process.env.SKYNET_API_WRITE_TOKEN;
  }

  it('新案例 1（修正點）：allowSameOrigin:false + 無任何權杖 + 同源 → 必須 403', () => {
    clearAllTokens();
    const result = guardMutation(sameOriginRequest(null), {
      endpoint: 'god-ingest-no-token-sameorigin-false',
      allowSameOrigin: false,
    });
    // 修正前：!configuredToken === true → 同源被放行（回 null）；修正後必須 403。
    expectForbidden(result);
  });

  it('新案例 2：allowSameOrigin:true + 無權杖 + 同源 → 放行（行為不變；亦證明同源構造有效）', () => {
    clearAllTokens();
    const result = guardMutation(sameOriginRequest(null), {
      endpoint: 'god-ingest-no-token-sameorigin-true',
      allowSameOrigin: true,
    });
    // 若同源構造無效（sameOrigin 為 false），此案例會回 403 而失敗——
    // 故此案例通過即證明 sameOriginRequest 確實產生同源請求。
    expect(result).toBeNull();
  });

  it('新案例 3：allowSameOrigin 未傳 + 無權杖 + 同源 → 放行（舊行為必須保留，供本機開發）', () => {
    clearAllTokens();
    const result = guardMutation(sameOriginRequest(null), {
      endpoint: 'god-ingest-no-token-sameorigin-undefined',
    });
    expect(result).toBeNull();
  });

  it('新案例 4：allowSameOrigin 未傳 + 有權杖 + 同源 + 未帶 token → 403（行為不變）', () => {
    // beforeEach 已設 SKYNET_DASHBOARD_API_TOKEN = GLOBAL_TOKEN。
    const result = guardMutation(sameOriginRequest(null), {
      endpoint: 'god-ingest-token-sameorigin-undefined',
    });
    expectForbidden(result);
  });
});
