/**
 * AI 問答的「錯誤碼 → 繁體中文文案」映射。
 *
 * 為什麼獨立成一個檔案，而不是放進 `@/lib/aiChat`：
 * `aiChat.ts` 內含 `SYSTEM_PROMPT`，該內容刻意只留在伺服器端（前端無法覆寫）。
 * `page.tsx` 是 client component，一旦從 `aiChat.ts` 匯入，
 * 整個 system prompt 就會被打包進瀏覽器 bundle。
 * 本檔只放映射表與純函式，**不含任何伺服器機密**，可安全被前端匯入。
 *
 * 使用時機：`/api/skynet/ai-chat` 回非 2xx 時，把回應 body 交給
 * `describeAiChatError`，得到可直接顯示給使用者的中文訊息。
 */

/** 本端點所有可能的錯誤碼。 */
export type AiChatErrorCode =
  | 'missing_api_key'
  | 'invalid_json'
  | 'invalid_messages'
  | 'message_too_long'
  | 'rate_limited'
  | 'forbidden_mutation'
  | 'upstream_error';

/** 錯誤回應的可能欄位（全部視為未信任資料）。 */
export type AiChatErrorBody = {
  error?: unknown;
  message?: unknown;
  /** `message_too_long` 會帶上單則字數上限。 */
  limit?: unknown;
  /** `rate_limited` 會帶上距離可再請求的毫秒數。 */
  retryAfterMs?: unknown;
  /** `upstream_error` 會帶上上游狀態碼。 */
  status?: unknown;
};

/** 無法辨識錯誤碼時的最終文案。 */
const FALLBACK_TEXT = 'AI 服務暫時無法回應，請稍後再試。';

/** 不含動態數值的固定文案。 */
const STATIC_TEXT: Record<
  Exclude<AiChatErrorCode, 'message_too_long' | 'rate_limited'>,
  string
> = {
  // 這個 dashboard 是自架自用，使用者本人就是管理員，因此文案要直接指向可執行的下一步。
  missing_api_key: '伺服器尚未設定 NVIDIA_NIM_API_KEY，請於 .env.local 補上後重新啟動。',
  invalid_json: '送出內容格式不正確，請重新輸入。',
  invalid_messages: '送出內容格式不正確，請重新輸入。',
  forbidden_mutation: '此操作僅限站內使用，請重新整理頁面後再試。',
  upstream_error: 'AI 服務暫時無法回應，請稍後再試。',
};

/** 由 body 的 `limit` 動態組出「訊息過長」文案。 */
function messageTooLongText(limit: unknown): string {
  const value = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
  return value === null
    ? '單則訊息過長，請縮短後再送出。'
    : `單則訊息超過 ${value} 字上限，請縮短後再送出。`;
}

/** 由 body 的 `retryAfterMs` 換算成秒（無條件進位）組出「請求過於頻繁」文案。 */
function rateLimitedText(retryAfterMs: unknown): string {
  const seconds =
    typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.ceil(retryAfterMs / 1000)
      : null;
  return seconds === null
    ? '請求過於頻繁，請稍後再試。'
    : `請求過於頻繁，請於 ${seconds} 秒後再試。`;
}

/**
 * 依錯誤碼產生給使用者看的繁體中文文案。
 *
 * 優先序（依需求刻意如此）：
 *   1. 已知錯誤碼的映射文案 —— 必須能蓋掉伺服器回的英文訊息
 *      （例如 `forbidden_mutation` 的原文是英文）。
 *   2. 伺服器提供的 `message` 欄位（僅在錯誤碼未知時才採用）。
 *   3. 通用文案（附上 HTTP 狀態碼方便除錯）。
 *
 * 任何情況下都不會把原始錯誤碼渲染給使用者。
 *
 * @param status HTTP 狀態碼，僅用於 fallback 的除錯提示。
 * @param body   回應 body（可能為 null 或非 JSON）。
 * @returns 可直接顯示的繁體中文訊息。
 */
export function describeAiChatError(status: number, body: AiChatErrorBody | null): string {
  const code = typeof body?.error === 'string' ? body.error : '';

  if (code === 'message_too_long') return messageTooLongText(body?.limit);
  if (code === 'rate_limited') return rateLimitedText(body?.retryAfterMs);

  if (Object.prototype.hasOwnProperty.call(STATIC_TEXT, code)) {
    return STATIC_TEXT[code as keyof typeof STATIC_TEXT];
  }

  const serverMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  if (serverMessage) return serverMessage;

  return `${FALLBACK_TEXT}（HTTP ${status}）`;
}
