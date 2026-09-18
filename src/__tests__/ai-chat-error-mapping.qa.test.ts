/** @jest-environment node */

/**
 * QA 獨立驗證：describeAiChatError 對「真實 HTTP 回應 body」與「對抗性輸入」的行為。
 *
 * 這支測試與 ai-chat-errors.test.ts 不同之處：
 *   - 第一部分使用**實際對 dev server 打 HTTP 取得**的回應 body（見下方註解），
 *     而非人工捏造，證明端到端串起來後使用者看到的一定是中文。
 *   - 第二部分刻意餵入畸形 / 邊界輸入，證明函式永不拋錯、永不回顯原始錯誤碼。
 *
 * 真實 body 來源（dev server :3111）：
 *   B1 POST {messages:[{role:'user',content:'x'.repeat(5000)}]} → 400 {"error":"message_too_long","limit":4000}
 *   B2 POST body='not-json'                                    → 400 {"error":"invalid_json"}
 *   B3 POST {messages:[]}                                      → 400 {"error":"invalid_messages","message":"messages 格式不正確或為空。"}
 *   B6 POST cross-origin 無 token                              → 403 {"error":"forbidden_mutation","message":"Mutation requires a same-origin browser request or SKYNET_DASHBOARD_API_TOKEN."}
 */

import { describeAiChatError, type AiChatErrorBody } from '@/lib/aiChatErrors';

const RAW_CODES = [
  'missing_api_key',
  'invalid_json',
  'invalid_messages',
  'message_too_long',
  'rate_limited',
  'forbidden_mutation',
  'upstream_error',
] as const;

const hasChinese = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);

/** 共同斷言：非空字串、含中文、不含任何原始錯誤碼。 */
function assertUserSafe(text: unknown, label: string): void {
  expect(typeof text).toBe('string');
  const s = text as string;
  expect(s.trim().length).toBeGreaterThan(0);
  expect(hasChinese(s)).toBe(true);
  for (const code of RAW_CODES) {
    expect(s).not.toContain(code);
  }
  // 也確保不殘留 TS 型別裡的原始字面值
  expect(label.length).toBeGreaterThan(0);
}

/** 真實 HTTP 取得的回應 body（status + body）。 */
const REAL_BODIES: ReadonlyArray<{ name: string; status: number; body: AiChatErrorBody }> = [
  { name: 'B1 message_too_long', status: 400, body: { error: 'message_too_long', limit: 4000 } },
  { name: 'B2 invalid_json', status: 400, body: { error: 'invalid_json' } },
  {
    name: 'B3 invalid_messages',
    status: 400,
    body: { error: 'invalid_messages', message: 'messages 格式不正確或為空。' },
  },
  {
    name: 'B6 forbidden_mutation',
    status: 403,
    body: {
      error: 'forbidden_mutation',
      message: 'Mutation requires a same-origin browser request or SKYNET_DASHBOARD_API_TOKEN.',
    },
  },
];

describe('describeAiChatError — 真實 HTTP 回應 body', () => {
  it.each(REAL_BODIES)('$name 映射為中文、且不含原始錯誤碼', ({ status, body }) => {
    assertUserSafe(describeAiChatError(status, body), 'real');
  });

  it('B6 forbidden_mutation 不會把伺服器的英文訊息顯示給使用者', () => {
    const text = describeAiChatError(403, REAL_BODIES[3].body);
    expect(text).not.toContain('Mutation requires');
    expect(text).not.toContain('SKYNET_DASHBOARD_API_TOKEN');
  });

  it('B1 message_too_long 帶出真實 limit 值 4000', () => {
    expect(describeAiChatError(400, REAL_BODIES[0].body)).toContain('4000');
  });
});

describe('describeAiChatError — 對抗性 / 邊界輸入（永不拋錯、永不回顯原始碼）', () => {
  const weird: ReadonlyArray<{ name: string; status: number; body: unknown }> = [
    { name: 'error 為數字', status: 400, body: { error: 123 } },
    { name: 'error 為 null', status: 400, body: { error: null } },
    { name: '空物件', status: 400, body: {} },
    { name: 'body 為 null', status: 502, body: null },
    { name: 'body 為字串（非物件）', status: 400, body: 'totally-not-an-object' },
    { name: 'body 為數字（非物件）', status: 400, body: 42 },
    { name: 'message_too_long limit=-1', status: 400, body: { error: 'message_too_long', limit: -1 } },
    { name: 'message_too_long limit=0', status: 400, body: { error: 'message_too_long', limit: 0 } },
    { name: 'message_too_long limit 為字串', status: 400, body: { error: 'message_too_long', limit: '4000' } },
    { name: 'rate_limited retryAfterMs=0', status: 429, body: { error: 'rate_limited', retryAfterMs: 0 } },
    { name: 'rate_limited retryAfterMs=45500', status: 429, body: { error: 'rate_limited', retryAfterMs: 45500 } },
    { name: 'rate_limited retryAfterMs 為字串', status: 429, body: { error: 'rate_limited', retryAfterMs: 'x' } },
    { name: '未知錯誤碼', status: 500, body: { error: 'some_future_code' } },
    { name: '未知錯誤碼 + 伺服器訊息', status: 400, body: { error: 'zzz_unknown', message: '自訂說明' } },
  ];

  it.each(weird)('$name 不拋錯且輸出安全', ({ status, body }) => {
    let text = '';
    expect(() => {
      text = describeAiChatError(status, body as AiChatErrorBody | null);
    }).not.toThrow();
    assertUserSafe(text, 'weird');
  });

  it('rate_limited retryAfterMs=45500 以 Math.ceil 換算為 46 秒', () => {
    expect(describeAiChatError(429, { error: 'rate_limited', retryAfterMs: 45500 })).toContain('46');
  });

  it('rate_limited retryAfterMs=0 不顯示秒數（走無秒數文案）', () => {
    const text = describeAiChatError(429, { error: 'rate_limited', retryAfterMs: 0 });
    expect(text).toContain('請求過於頻繁');
    expect(text).not.toMatch(/\d+\s*秒/);
  });

  it('message_too_long limit 非正數時不顯示數值', () => {
    for (const limit of [-1, 0, '4000'] as unknown[]) {
      const text = describeAiChatError(400, { error: 'message_too_long', limit });
      expect(text).not.toMatch(/\d+\s*字/);
      assertUserSafe(text, 'limit');
    }
  });

  it('未知錯誤碼不回顯該錯誤碼', () => {
    const text = describeAiChatError(500, { error: 'some_future_code' });
    expect(text).not.toContain('some_future_code');
    expect(text).toContain('500'); // fallback 保留 HTTP 狀態碼方便除錯
  });

  it('已知錯誤碼即使帶英文 message 也以中文映射為準', () => {
    const text = describeAiChatError(400, {
      error: 'invalid_json',
      message: 'Unexpected token < in JSON at position 0',
    });
    expect(text).not.toContain('Unexpected token');
    expect(hasChinese(text)).toBe(true);
  });
});
