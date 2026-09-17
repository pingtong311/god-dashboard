/** @jest-environment node */

/**
 * AI 問答錯誤碼 → 繁體中文文案映射測試。
 *
 * 驗證重點：
 *   1. 7 個錯誤碼都能產生非空中文文案，且絕不外洩原始錯誤碼。
 *   2. 動態數值（limit / retryAfterMs）確實由 body 帶入，不是寫死。
 *   3. 映射文案優先於伺服器的 message（可蓋掉英文訊息）。
 *   4. 未知錯誤碼回通用文案，且不回顯該錯誤碼。
 */

import { describeAiChatError, type AiChatErrorCode } from '@/lib/aiChatErrors';

const ALL_CODES: readonly AiChatErrorCode[] = [
  'missing_api_key',
  'invalid_json',
  'invalid_messages',
  'message_too_long',
  'rate_limited',
  'forbidden_mutation',
  'upstream_error',
];

/** 是否含有中日韓漢字。 */
const hasChinese = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);

describe('describeAiChatError', () => {
  it('7 個錯誤碼都能產生非空中文文案，且不包含原始錯誤碼', () => {
    for (const code of ALL_CODES) {
      const text = describeAiChatError(400, { error: code });

      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
      expect(hasChinese(text)).toBe(true);
      // 不得把原始錯誤碼渲染給使用者
      expect(text).not.toContain(code);
    }
  });

  it('missing_api_key 的文案可行動（指出環境變數與設定檔），且不依賴伺服器的 message', () => {
    // 自架自用情境：使用者本人就是管理員，文案必須指出下一步。
    // 即使伺服器沒有帶 message，映射表也要能獨立產出可行動的說明。
    const text = describeAiChatError(503, { error: 'missing_api_key' });

    expect(text).toContain('NVIDIA_NIM_API_KEY');
    expect(text).toContain('.env.local');
    expect(text).not.toContain('missing_api_key');
  });

  it('message_too_long 的 limit 由 body 動態帶入，不是寫死', () => {
    expect(describeAiChatError(400, { error: 'message_too_long', limit: 4000 })).toContain('4000');
    expect(describeAiChatError(400, { error: 'message_too_long', limit: 8000 })).toContain('8000');
  });

  it('message_too_long 缺少 limit 時仍給出中文文案且不崩潰', () => {
    const text = describeAiChatError(400, { error: 'message_too_long' });

    expect(hasChinese(text)).toBe(true);
    expect(text).not.toContain('message_too_long');
  });

  it('rate_limited 的 retryAfterMs 會換算成秒並無條件進位', () => {
    expect(describeAiChatError(429, { error: 'rate_limited', retryAfterMs: 45000 })).toContain('45');
    // 45500ms → 46 秒
    expect(describeAiChatError(429, { error: 'rate_limited', retryAfterMs: 45500 })).toContain('46');
  });

  it('rate_limited 缺少 retryAfterMs 時仍給出中文文案', () => {
    const text = describeAiChatError(429, { error: 'rate_limited' });

    expect(hasChinese(text)).toBe(true);
    expect(text).not.toContain('rate_limited');
  });

  it('forbidden_mutation 以映射文案蓋掉伺服器回的英文訊息', () => {
    const text = describeAiChatError(403, {
      error: 'forbidden_mutation',
      message: 'Mutation requires a same-origin browser request or SKYNET_DASHBOARD_API_TOKEN.',
    });

    expect(text).not.toContain('Mutation requires');
    expect(text).not.toContain('forbidden_mutation');
    expect(hasChinese(text)).toBe(true);
  });

  it('已知錯誤碼即使伺服器帶了英文 message，仍以中文映射為準', () => {
    const text = describeAiChatError(400, {
      error: 'invalid_json',
      message: 'Unexpected token < in JSON at position 0',
    });

    expect(text).not.toContain('Unexpected token');
    expect(hasChinese(text)).toBe(true);
  });

  it('未知錯誤碼回通用文案，且不回顯該錯誤碼', () => {
    const text = describeAiChatError(500, { error: 'some_future_code' });

    expect(text).not.toContain('some_future_code');
    expect(hasChinese(text)).toBe(true);
    // 保留 HTTP 狀態碼方便除錯
    expect(text).toContain('500');
  });

  it('body 為 null（非 JSON 回應）時回通用文案並附上 HTTP 狀態碼', () => {
    const text = describeAiChatError(502, null);

    expect(hasChinese(text)).toBe(true);
    expect(text).toContain('502');
  });

  it('錯誤碼未知但伺服器有提供 message 時，才採用伺服器訊息', () => {
    const text = describeAiChatError(400, { error: 'some_future_code', message: '自訂說明訊息' });

    expect(text).toBe('自訂說明訊息');
  });
});
