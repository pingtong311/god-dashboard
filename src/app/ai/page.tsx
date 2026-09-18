'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatStreamEvent } from '@/lib/aiChat';
import { describeAiChatError, type AiChatErrorBody } from '@/lib/aiChatErrors';
import styles from './ai.module.css';

/* ── 型別定義 ──────────────────────────────────────────── */

/** 感知日誌（原「情報感知矩陣」）的日誌項目。 */
type InsightLog = {
  time: string;
  type: string;
  msg: string;
  isAlert?: boolean;
};

type ChatRole = 'user' | 'assistant';

/** 前端對話訊息。 */
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  reasoning: string;
  isError?: boolean;
};

type TabKey = 'chat' | 'logs';

/** 空狀態的範例問題（點擊即可送出）。 */
const EXAMPLE_QUESTIONS: readonly string[] = [
  '幫我解讀今天台股大盤的籌碼變化',
  '外資連續買超的個股要怎麼篩選？',
  '融資維持率下降對股價有什麼影響？',
  '如何用均線判斷台積電目前的趨勢？',
];

const LOG_REFRESH_MS = 30_000;

let messageSeq = 0;
function createMessageId(): string {
  messageSeq += 1;
  return `msg-${Date.now()}-${messageSeq}`;
}

export default function AIPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');

  /* ── AI 問答狀態 ─────────────────────────────────────── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* ── 感知日誌狀態（保留原功能）──────────────────────── */
  const [logs, setLogs] = useState<InsightLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/skynet/insights');
      const data: unknown = await res.json();
      setLogs(Array.isArray(data) ? (data as InsightLog[]) : []);
    } catch (error) {
      console.error('Failed to fetch logs', error);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 感知日誌：每 30 秒輪詢一次（與原實作行為一致）。
  useEffect(() => {
    void fetchLogs();
    const interval = setInterval(() => {
      void fetchLogs();
    }, LOG_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // 自動滾動到最新訊息。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ── 對話串流邏輯 ────────────────────────────────────── */

  const updateAssistant = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const appendToAssistant = useCallback((id: string, field: 'content' | 'reasoning', text: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: m[field] + text } : m))
    );
  }, []);

  const applyEvent = useCallback(
    (id: string, event: ChatStreamEvent) => {
      if (event.type === 'reasoning' && event.text) {
        appendToAssistant(id, 'reasoning', event.text);
      } else if (event.type === 'content' && event.text) {
        appendToAssistant(id, 'content', event.text);
      } else if (event.type === 'error') {
        updateAssistant(id, {
          content: event.text || 'AI 服務暫時無法回應，請稍後再試。',
          isError: true,
        });
      }
    },
    [appendToAssistant, updateAssistant]
  );

  const handleSend = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!text || isStreaming) return;

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        content: text,
        reasoning: '',
      };
      const assistantId = createMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        reasoning: '',
      };

      const history = [...messages, userMessage];
      setMessages([...history, assistantMessage]);
      setInput('');
      setIsStreaming(true);

      // 只送出有效的 user / assistant 內容；system prompt 由伺服器端注入。
      const payloadMessages = history
        .filter((m) => !m.isError && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/skynet/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payloadMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // 錯誤碼一律映射成中文文案，絕不把原始錯誤碼或英文訊息顯示給使用者。
          let errorBody: AiChatErrorBody | null = null;
          try {
            errorBody = (await res.json()) as AiChatErrorBody;
          } catch {
            // 忽略非 JSON 的錯誤回應，交由 describeAiChatError 走通用文案
          }
          updateAssistant(assistantId, {
            content: describeAiChatError(res.status, errorBody),
            isError: true,
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;

            const payload = line.slice(5).trim();
            if (!payload) continue;

            let event: ChatStreamEvent;
            try {
              event = JSON.parse(payload) as ChatStreamEvent;
            } catch {
              continue;
            }
            applyEvent(assistantId, event);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // 使用者主動停止：若尚無任何輸出，補上提示。
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content && !m.reasoning
                ? { ...m, content: '（已停止回應）' }
                : m
            )
          );
        } else {
          updateAssistant(assistantId, {
            content: '連線失敗，請確認網路連線後再試一次。',
            isError: true,
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [input, isStreaming, messages, applyEvent, updateAssistant]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleClear = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  if (!mounted) return null;

  return (
    <div className={styles.aiRoot}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}>AI</span>
            <div>
              <h1 className={styles.brandTitle}>股市大佬 · AI 問答</h1>
              <p className={styles.brandSub}>台股籌碼與技術面即時對話助手</p>
            </div>
          </div>

          <div className={styles.tabBar} role="tablist" aria-label="AI 頁面分頁">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={`${styles.tabBtn} ${activeTab === 'chat' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              AI 問答
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'logs'}
              className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              感知日誌
            </button>
          </div>
        </header>

        {activeTab === 'chat' ? (
          <section className={styles.chatPanel} aria-label="AI 問答">
            <div className={styles.chatList} ref={listRef}>
              {messages.length === 0 ? (
                <div className={styles.chatEmpty}>
                  <span className={styles.emptyIcon}>✦</span>
                  <p className={styles.emptyTitle}>開始你的台股對話</p>
                  <p className={styles.emptyDesc}>
                    我可以協助你解讀籌碼、技術面與盤勢。直接輸入問題，或從下方範例開始。
                  </p>
                  <div className={styles.exampleList}>
                    {EXAMPLE_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        className={styles.exampleBtn}
                        onClick={() => void handleSend(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
            </div>

            <div className={styles.composer}>
              <textarea
                className={styles.composerTextarea}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入你的台股問題…（Enter 送出、Shift+Enter 換行）"
                rows={2}
                disabled={isStreaming}
                aria-label="輸入問題"
              />
              <div className={styles.composerActions}>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={handleClear}
                  disabled={messages.length === 0 && !isStreaming}
                >
                  清除對話
                </button>
                <div className={styles.composerRight}>
                  {isStreaming ? (
                    <button type="button" className={styles.stopBtn} onClick={handleStop}>
                      停止
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.sendBtn}
                      onClick={() => void handleSend()}
                      disabled={input.trim().length === 0}
                    >
                      送出
                    </button>
                  )}
                </div>
              </div>
              {isStreaming && <p className={styles.streamingHint}>AI 正在回覆中…</p>}
            </div>
          </section>
        ) : (
          <div className={styles.logsWrap}>
            {/* ── 感知日誌：完整保留原「情報感知矩陣」日誌流 ── */}
            <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(31,102,209,0.08),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_48%,_#eef2f7_100%)] px-4 py-10 text-slate-900">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
                <header className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <p className="text-[10px] font-black tracking-[0.3em] text-[var(--accent)] uppercase">
                    AI INSIGHT STREAM
                  </p>
                  <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h1 className="text-3xl font-black tracking-tight text-slate-950">情報感知矩陣</h1>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                        這裡顯示天網對市場訊號的即時觀測日誌。介面已改成和戰情中心一致的白底工作區，方便你在同一套視覺下切換。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-black tracking-[0.14em] uppercase">
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                        LIVE FEED
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                        30s REFRESH
                      </span>
                    </div>
                  </div>
                </header>

                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" />
                      <span className="text-[10px] font-black tracking-[0.22em] text-slate-500 uppercase">
                        AI Neural Processing Feed
                      </span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-slate-500">
                      SYNCED WITH LOCAL_STORAGE
                    </span>
                  </div>

                  <div className="h-[620px] overflow-y-auto px-6 py-6">
                    {isLoadingLogs ? (
                      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-slate-500">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                        <p className="text-[10px] font-black tracking-[0.3em] uppercase">
                          Connecting to Skynet Neural Link...
                        </p>
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="flex h-full min-h-[320px] items-center justify-center text-[10px] font-black tracking-[0.22em] uppercase text-slate-500">
                        No real-time insights available for current session.
                      </div>
                    ) : (
                      <div className="space-y-4 font-mono">
                        {logs.map((log, index) => (
                          <article
                            key={`${log.time}-${index}`}
                            className={`rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 ${
                              log.isAlert ? 'border-[var(--accent)]/20 bg-[var(--accent)]/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <span className="shrink-0 pt-0.5 text-[10px] font-bold text-slate-400">
                                {log.time}
                              </span>
                              <div className="min-w-0">
                                <span
                                  className={`text-[10px] font-black tracking-[0.22em] uppercase ${
                                    log.type === 'ALERT'
                                      ? 'text-rose-600'
                                      : log.type === 'THOUGHT'
                                        ? 'text-violet-600'
                                        : log.type === 'SCAN'
                                          ? 'text-cyan-600'
                                          : 'text-emerald-600'
                                  }`}
                                >
                                  [{log.type}]
                                </span>
                                <p
                                  className={`mt-1 text-sm leading-7 ${
                                    log.isAlert ? 'text-slate-900' : 'text-slate-600'
                                  }`}
                                >
                                  {log.msg}
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <StatMini label="情緒指數量測" value="78 / 100" sub="市場偏向樂觀" />
                  <StatMini label="異常量掃描" value="12 檔個股" sub="盤中集中在 AI 族群" />
                  <StatMini label="平均延遲" value="14ms" sub="核心同步效率優化中" />
                </section>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 子元件 ────────────────────────────────────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const hasReasoning = message.reasoning.trim().length > 0;
  const isWaiting = !isUser && !hasReasoning && !message.content && !message.isError;

  const rowClass = isUser ? styles.bubbleRowUser : styles.bubbleRowAi;
  const bubbleClass = isUser ? styles.bubbleUser : styles.bubbleAi;

  return (
    <div className={`${styles.bubbleRow} ${rowClass}`}>
      <div
        className={`${styles.bubble} ${bubbleClass} ${message.isError ? styles.bubbleError : ''}`}
      >
        <span className={styles.bubbleRole}>{isUser ? '你' : 'AI 助手'}</span>

        {hasReasoning && (
          <details className={styles.reasoningBox}>
            <summary className={styles.reasoningSummary}>思考過程</summary>
            <p className={styles.reasoningText}>{message.reasoning}</p>
          </details>
        )}

        {message.content ? (
          <p className={styles.bubbleText}>{message.content}</p>
        ) : isWaiting ? (
          <p className={`${styles.bubbleText} ${styles.thinkingText}`}>正在思考…</p>
        ) : null}
      </div>
    </div>
  );
}

function StatMini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="text-xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-[10px] italic text-slate-500">{sub}</p>
    </div>
  );
}
