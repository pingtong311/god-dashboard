/** @jest-environment node */

/**
 * GOD 辦公室資料橋接層測試
 *
 * 涵蓋：
 *   - godBridge 純函式：isGodEndpoint / godKvKey / parseIngestBody（合法、缺 endpoint、
 *     未知 endpoint、缺 payload、payload 過大、缺 generated_at、非物件 body）
 *   - ingest route：無 token → 403；帶正確 token + 合法 body → 200 且 KV 被寫入；
 *     未知 endpoint → 400；payload 過大 → 413；KV 不可用 → 503
 *   - [endpoint] GET route：有資料 → ready:true 且 age_ms 正確；KV 空 → ready:false
 *     且 message 為「GOD 辦公室資料尚未產出」；KV 不可用 → ready:false「KV 尚未綁定」；
 *     未知 endpoint → 400
 *
 * 測試風格對齊本專案：直接呼叫 route 的 POST/GET 函式並傳入 `new Request(...)`；
 * 不使用 @testing-library（本專案的 @testing-library/dom 為壞掉的 symlink）。
 * 假 KV 以 mock @opennextjs/cloudflare 的 getCloudflareContext 注入（env.SKYNET_CACHE），
 * 走與生產環境相同的取值路徑（不再用 globalThis.SKYNET_CACHE stub——該 stub 測不到真實路徑）。
 */

import { POST } from '@/app/api/skynet/god/ingest/route';
import { GET } from '@/app/api/skynet/god/[endpoint]/route';
import {
  GOD_ENDPOINTS,
  GOD_KV_PREFIX,
  GOD_KV_TTL_SECONDS,
  MAX_PAYLOAD_BYTES,
  godKvKey,
  isGodEndpoint,
  parseIngestBody,
} from '@/lib/godBridge';

// ⚠ @opennextjs/cloudflare 為 ESM-only 套件，Jest（CJS）無法直接載入；且正確的 KV 取得
// 路徑是 getCloudflareContext（而非 globalThis.SKYNET_CACHE）。以 mock 模組取代，讓測試
// 真正走新的取值路徑（有鑑別力：若 getKv 仍用 globalThis，此 mock 不會被呼叫）。
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { clearKvReadCache } from '@/lib/kvReadCache';

const ORIGINAL_TOKEN = process.env.SKYNET_DASHBOARD_API_TOKEN;
const ORIGINAL_ALT_TOKEN = process.env.SKYNET_API_WRITE_TOKEN;
const TOKEN = 'god-bridge-test-token';

/** 塞入假 KV 綁定；回傳 get / put 兩個 jest.fn 供斷言。 */
function installKv(stored: unknown, getThrows = false) {
  const put = jest.fn(
    async (
      _key: string,
      _value: string,
      _options?: { expirationTtl?: number },
    ): Promise<void> => undefined,
  );
  const get = jest.fn(async (_key: string, type?: string): Promise<unknown> => {
    if (getThrows) throw new Error('KV unavailable');
    if (stored === null || stored === undefined) return null;
    // ⚠ 忠實模擬 Cloudflare KV 的兩條呼叫路徑（2026-10-04 修正）：
    //    - `get(key)`（文字模式）→ 回**字串**
    //    - `get(key, 'json')`   → 回**已解析物件**
    //    原本的 mock 一律回物件，是為舊寫法 `get(key,'json')` 量身打造的；
    //    改用 kvReadCache（文字模式）後，回物件會讓 JSON.parse 收到 "[object Object]"
    //    而拋錯，造成「明明有資料卻 ready:false」的假失敗。
    return type === 'json' ? stored : JSON.stringify(stored);
  });
  (getCloudflareContext as jest.Mock).mockResolvedValue({ env: { SKYNET_CACHE: { get, put } } });
  return { get, put };
}

/** 模擬「KV 尚未綁定」：getCloudflareContext 回傳空 env（env.SKYNET_CACHE 缺席）。 */
function clearKv() {
  (getCloudflareContext as jest.Mock).mockResolvedValue({ env: {} });
}

/** 建立 ingest 請求；token 傳 null 代表不帶憑證。 */
function ingestRequest(body: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/skynet/god/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** 一份合法的 ingest body（可用 over 覆寫個別欄位）。 */
function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: '1',
    endpoint: 'dashboard',
    generated_at: '2026-09-26T01:00:00.000Z',
    provenance: { source: 'god-office' },
    payload: { hello: 'world' },
    ...over,
  };
}

/** 呼叫 GET route；params 為 Promise（對齊 Next 15 動態路由）。 */
async function getRoute(endpoint: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/skynet/god/${endpoint}`), {
    params: Promise.resolve({ endpoint }),
  });
}

/** 一份存在 KV 的信封（可用 over 覆寫 received_at 等欄位）。 */
function envelope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: '1',
    endpoint: 'dashboard',
    generated_at: '2026-09-26T01:00:00.000Z',
    payload: { a: 1 },
    received_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  process.env.SKYNET_DASHBOARD_API_TOKEN = TOKEN;
  delete process.env.SKYNET_API_WRITE_TOKEN;
  clearKv();
  // ⚠ 必清：kvReadCache 的 L1 是**模組層級變數**，會跨 `it()` 存活。
  //    不清的話，「有資料」測試塞進去的信封會被後面「無資料」測試讀到 → 假失敗。
  //    注意：這與上方 `clearKv()`（模擬「KV 尚未綁定」）是**兩件不同的事**。
  clearKvReadCache();
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.SKYNET_DASHBOARD_API_TOKEN;
  else process.env.SKYNET_DASHBOARD_API_TOKEN = ORIGINAL_TOKEN;

  if (ORIGINAL_ALT_TOKEN === undefined) delete process.env.SKYNET_API_WRITE_TOKEN;
  else process.env.SKYNET_API_WRITE_TOKEN = ORIGINAL_ALT_TOKEN;

  clearKv();
});

describe('isGodEndpoint（白名單邊界）', () => {
  it('白名單 7 個端點皆為 true，且數量為 7', () => {
    expect(GOD_ENDPOINTS).toHaveLength(7);
    for (const endpoint of GOD_ENDPOINTS) {
      expect(isGodEndpoint(endpoint)).toBe(true);
    }
  });

  it('第 7 端點 target-evidence 在白名單內（2026-10-01 新增）', () => {
    expect(isGodEndpoint('target-evidence')).toBe(true);
  });

  it('白名單外與非字串值皆為 false', () => {
    expect(isGodEndpoint('nope')).toBe(false);
    expect(isGodEndpoint('')).toBe(false);
    expect(isGodEndpoint('Dashboard')).toBe(false); // 大小寫敏感
    expect(isGodEndpoint(null)).toBe(false);
    expect(isGodEndpoint(undefined)).toBe(false);
    expect(isGodEndpoint(123)).toBe(false);
    expect(isGodEndpoint({ endpoint: 'dashboard' })).toBe(false);
  });
});

describe('godKvKey', () => {
  it('產生 god:<endpoint> 前綴正確', () => {
    expect(godKvKey('dashboard')).toBe('god:dashboard');
    expect(godKvKey('daily-highlights')).toBe(`${GOD_KV_PREFIX}daily-highlights`);
    expect(GOD_KV_PREFIX).toBe('god:');
  });

  it('KV TTL 為 7 天（604800 秒）', () => {
    expect(GOD_KV_TTL_SECONDS).toBe(604800);
  });
});

describe('parseIngestBody（純函式）', () => {
  it('合法 body → ok:true 且帶出 endpoint / payload / generated_at', () => {
    const result = parseIngestBody(validBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.endpoint).toBe('dashboard');
      expect(result.value.generated_at).toBe('2026-09-26T01:00:00.000Z');
      expect(result.value.payload).toEqual({ hello: 'world' });
    }
  });

  it('缺 endpoint → invalid_endpoint', () => {
    const result = parseIngestBody(validBody({ endpoint: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_endpoint');
  });

  it('未知 endpoint → unknown_endpoint', () => {
    const result = parseIngestBody(validBody({ endpoint: 'nope' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unknown_endpoint');
  });

  it('缺 payload → missing_payload', () => {
    const result = parseIngestBody({
      schema_version: '1',
      endpoint: 'dashboard',
      generated_at: '2026-09-26T01:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing_payload');
  });

  it('payload 過大 → payload_too_large', () => {
    const result = parseIngestBody(validBody({ payload: 'x'.repeat(MAX_PAYLOAD_BYTES + 10) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('payload_too_large');
  });

  it('缺 generated_at → invalid_generated_at', () => {
    const result = parseIngestBody({
      endpoint: 'dashboard',
      payload: { hello: 'world' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_generated_at');
  });

  it('非物件 body → invalid_body', () => {
    const result = parseIngestBody(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_body');
  });
});

describe('POST /api/skynet/god/ingest', () => {
  it('無 token → 403（不寫入 KV）', async () => {
    const { put } = installKv(null);
    const res = await POST(ingestRequest(validBody(), null));
    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it('帶正確 token + 合法 body → 200，且 KV 以 god:<endpoint> 寫入完整信封', async () => {
    const { put } = installKv(null);
    const res = await POST(ingestRequest(validBody()));

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      endpoint: string;
      key: string;
      bytes: number;
      storedAt: string;
      expiresAt: string;
    };
    expect(data.ok).toBe(true);
    expect(data.endpoint).toBe('dashboard');
    expect(data.key).toBe('god:dashboard');
    expect(typeof data.bytes).toBe('number');
    expect(data.bytes).toBeGreaterThan(0);
    expect(typeof data.storedAt).toBe('string');
    expect(typeof data.expiresAt).toBe('string');

    expect(put).toHaveBeenCalledTimes(1);
    const [key, value, options] = put.mock.calls[0] as [
      string,
      string,
      { expirationTtl: number },
    ];
    expect(key).toBe('god:dashboard');
    expect(options).toEqual({ expirationTtl: GOD_KV_TTL_SECONDS });

    const stored = JSON.parse(value) as {
      endpoint: string;
      generated_at: string;
      payload: unknown;
      received_at: string;
    };
    expect(stored.endpoint).toBe('dashboard');
    expect(stored.generated_at).toBe('2026-09-26T01:00:00.000Z');
    expect(stored.payload).toEqual({ hello: 'world' });
    expect(typeof stored.received_at).toBe('string');
  });

  it('未知 endpoint → 400 unknown_endpoint 並帶 allowed 白名單', async () => {
    installKv(null);
    const res = await POST(ingestRequest(validBody({ endpoint: 'nope' })));

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; allowed: string[] };
    expect(data.error).toBe('unknown_endpoint');
    expect(data.allowed).toEqual([...GOD_ENDPOINTS]);
  });

  it('payload 過大 → 413 payload_too_large', async () => {
    const { put } = installKv(null);
    const res = await POST(
      ingestRequest(validBody({ payload: 'x'.repeat(MAX_PAYLOAD_BYTES + 10) })),
    );

    expect(res.status).toBe(413);
    const data = (await res.json()) as { error: string; limit: number };
    expect(data.error).toBe('payload_too_large');
    expect(data.limit).toBe(MAX_PAYLOAD_BYTES);
    expect(put).not.toHaveBeenCalled();
  });

  it('KV 不可用 → 503 kv_unavailable', async () => {
    clearKv();
    const res = await POST(ingestRequest(validBody()));

    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('kv_unavailable');
  });
});

describe('GET /api/skynet/god/[endpoint]', () => {
  it('有資料 → ready:true，age_ms 反映 received_at 距今毫秒數', async () => {
    const receivedAt = new Date(Date.now() - 1000).toISOString();
    installKv(envelope({ received_at: receivedAt }));

    const res = await getRoute('dashboard');
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      endpoint: string;
      payload: unknown;
      age_ms: number;
      stale: boolean;
    };
    expect(data.ok).toBe(true);
    expect(data.ready).toBe(true);
    expect(data.endpoint).toBe('dashboard');
    expect(data.payload).toEqual({ a: 1 });
    expect(data.age_ms).toBeGreaterThanOrEqual(1000);
    expect(data.age_ms).toBeLessThan(5000);
    expect(data.stale).toBe(false);
  });

  it('資料超過 6 小時 → stale:true', async () => {
    installKv(envelope({ received_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }));

    const data = (await (await getRoute('dashboard')).json()) as { ready: boolean; stale: boolean };
    expect(data.ready).toBe(true);
    expect(data.stale).toBe(true);
  });

  it('KV 空 → 200 + ready:false，message 為「GOD 辦公室資料尚未產出」', async () => {
    installKv(null);

    const res = await getRoute('dashboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; ready: boolean; message: string };
    expect(data.ok).toBe(true);
    expect(data.ready).toBe(false);
    expect(data.message).toBe('GOD 辦公室資料尚未產出');
  });

  it('KV 不可用 → 200 + ready:false，message 為「KV 尚未綁定」', async () => {
    clearKv();

    const res = await getRoute('dashboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ready: boolean; message: string };
    expect(data.ready).toBe(false);
    expect(data.message).toBe('KV 尚未綁定');
  });

  it('KV 讀取拋錯 → 200 + ready:false（不讓前端誤判為故障）', async () => {
    installKv(null, true);

    const res = await getRoute('dashboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ready: boolean; message: string };
    expect(data.ready).toBe(false);
    expect(data.message).toBe('KV 尚未綁定');
  });

  it('getCloudflareContext reject（非 Workers 環境）→ 200 + ready:false，不阻塞', async () => {
    (getCloudflareContext as jest.Mock).mockRejectedValue(new Error('not in workers'));

    const res = await getRoute('dashboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; ready: boolean; message: string };
    expect(data.ok).toBe(true);
    expect(data.ready).toBe(false);
    expect(data.message).toBe('KV 尚未綁定');
  });

  it('未知 endpoint → 400 unknown_endpoint', async () => {
    installKv(null);

    const res = await getRoute('nope');
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; allowed: string[] };
    expect(data.error).toBe('unknown_endpoint');
    expect(data.allowed).toEqual([...GOD_ENDPOINTS]);
  });
});
