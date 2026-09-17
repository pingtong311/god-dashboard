/**
 * AI 問答（`/api/skynet/ai-chat`）共用的常數、型別與純函式。
 *
 * 這些內容刻意放在 `lib/` 而非 `route.ts`：
 * Next.js App Router 的 route 檔僅允許匯出 HTTP 方法與特定設定值（runtime / dynamic 等），
 * 任何額外的具名匯出都會被自動生成的 `.next/types` 型別檢查判為錯誤。
 */

/** NVIDIA NIM 上游設定。金鑰一律由環境變數提供，絕不硬編碼。 */
export const NVIDIA_CHAT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NVIDIA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

/**
 * 輸入防護上限，避免端點被濫用。
 *
 * - `MAX_MESSAGES` / `MAX_TOTAL_CHARS`：屬於「上下文太多」，採滑動視窗丟棄最舊的對話輪次。
 * - `MAX_CONTENT_CHARS`：屬於「使用者這次的輸入被吃掉」，**不截斷**，直接回報錯誤。
 */
export const MAX_MESSAGES = 24;
export const MAX_CONTENT_CHARS = 4000;
export const MAX_TOTAL_CHARS = 20000;

/** 伺服器端固定注入的系統提示，前端無法覆寫。 */
export const SYSTEM_PROMPT = [
  '你是「股市大佬」的 AI 投資研究助手，專門服務台灣股市（台股）投資人。',
  '請務必遵守以下原則：',
  '1. 一律使用繁體中文（台灣用語）回答。',
  '2. 聚焦台股籌碼面（三大法人買賣超、融資融券、外資持股、集保戶數）與技術面（均線、量能、K 線型態、指標背離）。',
  '3. 回答時先給結論，再列重點依據，最後補充風險提醒。',
  '4. 數字與單位要清楚（例如「買超 22,870 張」「漲幅 +10%」）。',
  '5. 涉及個股時，提醒使用者需自行查證即時報價。',
  '6. 不得提供保證獲利或代客操作的承諾。',
  '7. 當資訊不足時，明確說明還需要哪些資料，不要憑空編造。',
].join('\n');

/** 前端可傳入的對話訊息（僅允許 user / assistant）。 */
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** 下送給前端的 SSE 事件格式。 */
export type ChatStreamEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'content'; text: string }
  | { type: 'error'; text: string }
  | { type: 'done' };

/** `normalizeMessages` 的結果：成功帶訊息，失敗帶錯誤碼。 */
export type NormalizeMessagesResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: 'invalid_messages' }
  | { ok: false; error: 'message_too_long'; limit: number };

/**
 * 清理並驗證前端傳入的 messages。
 *
 * 三種超量情境刻意採用不同處理：
 *
 * 1. **則數超過 `MAX_MESSAGES`**：滑動視窗，只保留最近 24 則（丟棄最舊的對話輪次）。
 *    這是「上下文太多」，丟掉最舊的是標準做法，使用者不會覺得內容被吃掉。
 * 2. **總長度超過 `MAX_TOTAL_CHARS`**：滑動視窗，從最舊的開始丟棄直到符合預算。
 *    同上，屬於上下文取捨；**永遠保留最新一則**，確保使用者這次的提問不會被丟掉。
 * 3. **單則使用者訊息超過 `MAX_CONTENT_CHARS`**：**不截斷**，回報 `message_too_long`。
 *    這是「使用者這次的輸入被吃掉」，必須明確告知，不能讓他拿到答非所問的回覆卻不知原因。
 *
 * 註：助理訊息（`assistant`）是模型輸出、屬於歷史上下文，不受第 3 點限制。
 * 模型在 `max_tokens: 16384` 下產生的回覆很容易超過 4000 字，若一律視為錯誤，
 * 使用者只要問過一次就會永遠無法繼續該對話；這類訊息不截斷、由總長度預算統一控管。
 *
 * 另外只保留 user / assistant 角色，忽略 system 等其他角色（避免覆寫伺服器端提示），
 * 並丟棄空白訊息。
 *
 * @param raw 前端傳入的未信任資料。
 * @returns 驗證結果；失敗時附帶對應的錯誤碼。
 */
export function normalizeMessages(raw: unknown): NormalizeMessagesResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'invalid_messages' };
  }

  // 1) 則數滑動視窗：只考慮最近 MAX_MESSAGES 則。
  const recent = raw.slice(-MAX_MESSAGES);

  // 2) 逐則清理；使用者訊息過長時直接報錯，不做截斷。
  const cleaned: ChatMessage[] = [];
  for (const item of recent) {
    if (!item || typeof item !== 'object') continue;

    const record = item as { role?: unknown; content?: unknown };
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    if (typeof record.content !== 'string') continue;

    const text = record.content.trim();
    if (!text) continue;

    if (record.role === 'user' && text.length > MAX_CONTENT_CHARS) {
      return { ok: false, error: 'message_too_long', limit: MAX_CONTENT_CHARS };
    }

    cleaned.push({ role: record.role, content: text });
  }

  if (cleaned.length === 0) {
    return { ok: false, error: 'invalid_messages' };
  }

  // 3) 總長度滑動視窗：由最新往回累加，超過預算就丟棄更舊的（最新一則永遠保留）。
  const kept: ChatMessage[] = [];
  let totalChars = 0;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const message = cleaned[i];
    if (kept.length > 0 && totalChars + message.content.length > MAX_TOTAL_CHARS) break;
    kept.unshift(message);
    totalChars += message.content.length;
  }

  return { ok: true, messages: kept };
}

/** 將單一事件編碼為 SSE 格式的位元組。 */
export function encodeChatEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * 從上游 SSE 的 `data:` 內容解析出 reasoning / content 兩路文字。
 *
 * NVIDIA NIM 的推理模型會在 `choices[0].delta` 分別帶出
 * `reasoning_content`（思考過程）與 `content`（正式回答）。
 *
 * @param dataPayload 已去掉 `data:` 前綴的字串。
 * @returns 解析結果；無法解析時回傳 null。
 */
export function parseUpstreamDelta(dataPayload: string): { reasoning: string; content: string } | null {
  let chunk: unknown;
  try {
    chunk = JSON.parse(dataPayload);
  } catch {
    return null;
  }

  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const delta = (choices[0] as { delta?: unknown } | undefined)?.delta;
  if (!delta || typeof delta !== 'object') return null;

  const record = delta as { reasoning_content?: unknown; content?: unknown };
  const reasoning = typeof record.reasoning_content === 'string' ? record.reasoning_content : '';
  const content = typeof record.content === 'string' ? record.content : '';

  if (!reasoning && !content) return null;
  return { reasoning, content };
}
