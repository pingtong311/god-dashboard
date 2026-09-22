'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ChatStreamEvent } from '@/lib/aiChat';
import { AVAILABLE_MODELS, type AvailableModelId, NVIDIA_MODEL } from '@/lib/aiChat';
import { describeAiChatError, type AiChatErrorBody } from '@/lib/aiChatErrors';
import { markdownToReactNodes } from '@/app/ai/aiMarkdown';
import {
  CHIP_ALL_LABEL,
  QUESTION_CHIPS,
  QUESTION_CARD_GROUPS,
  filterCardGroups,
  countCards,
  type ChipFilter,
  type QuestionChip,
} from '@/app/ai/aiQuestionCards';

/* ── SpeechRecognition 環境型別（Web Speech API 標準）────────────── */
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}
import {
  MessageSquare,
  X,
  Loader2,
  Send,
  Trash2,
  Edit3,
  Plus,
  ChevronLeft,
  ChevronRight,
  History,
  Tag,
  Sparkles,
  Minimize,
  Maximize2,
  Mic,
  MicOff,
  Image,
  Camera,
  Cpu,
} from 'lucide-react';
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

/**
 * 空狀態的快速提問卡已改為「依類別分組 + 模式 chips 過濾」：
 * 類別骨架與 chip 定義見 `@/app/ai/aiQuestionCards`（逐字自 ai.md §3.3/§3.4，
 * 各卡提問句 spec 標 [無法辨識]，不補腦）。
 */

const LOG_REFRESH_MS = 30_000;

/* ── 對話歷史相關 ───────────────────────────────────────── */

const HISTORY_STORAGE_KEY = 'ai_chat_history';
const MAX_HISTORY_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  ticker?: string; // 個股語境
};

let messageSeq = 0;
function createMessageId(): string {
  messageSeq += 1;
  return `msg-${Date.now()}-${messageSeq}`;
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 副標的「盤後收盤」日期（ai.md §3.1）：不硬編碼樣本日期，
 * 動態取當前日期 `YYYY-MM-DD`。
 */
function formatPostMarketDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadHistory(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(sessions: ChatSession[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_HISTORY_SESSIONS)));
  } catch {
    // Ignore quota exceeded
  }
}

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().slice(0, 30);
  return trimmed || '新對話';
}

function AIPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);

  /* ── 個股語境標籤（來自 ?ticker= 參數）──────────────────── */
  const paramTicker = searchParams?.get('ticker')?.toUpperCase() || '';
  const [tickerContext, setTickerContext] = useState<string>(paramTicker);

  /* ── 模式 chip 過濾（ai.md §3.3，純前端過濾快速提問卡分組）── */
  const [activeChip, setActiveChip] = useState<ChipFilter>(null);

  /* ── 模型選擇 ───────────────────────────────────────────── */
  const [selectedModel, setSelectedModel] = useState<AvailableModelId>(NVIDIA_MODEL);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  /* ── 語音輸入 ───────────────────────────────────────────── */
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  /* ── 圖片上傳 ───────────────────────────────────────────── */
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── 對話歷史狀態 ──────────────────────────────────────── */
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  /* ── AI 問答狀態 ─────────────────────────────────────── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* ── 感知日誌狀態（保留原功能）──────────────────────── */
  const [logs, setLogs] = useState<InsightLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // 語音識別初始化
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-TW';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setInput(prev => prev + transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setVoiceSupported(true);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current || !voiceSupported) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening, voiceSupported]);

  // 圖片上傳處理
  const handleImageUpload = useCallback(async (file: File) => {
    setUploadingImage(true);
    try {
      // 轉為 base64 供預覽
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImagePreview(base64);
      // 將圖片資訊加入輸入框（稍後送出時處理）
      // 這裡先預覽，實際送出時會一併發送
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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

  // 初始化：載入歷史紀錄
  useEffect(() => {
    setMounted(true);
    const loaded = loadHistory();
    setSessions(loaded);
    if (loaded.length > 0) {
      const latest = loaded[0];
      setActiveSessionId(latest.id);
      setMessages(latest.messages);
      if (latest.ticker) setTickerContext(latest.ticker);
    }
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

  /* ── 對話歷史持久化：active session 的 messages / ticker 變更時存檔 ────────── */
  useEffect(() => {
    if (!activeSessionId) return;
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === activeSessionId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        messages: messages.slice(0, MAX_MESSAGES_PER_SESSION),
        ticker: tickerContext || undefined,
        updatedAt: Date.now(),
      };
      saveHistory(updated);
      return updated;
    });
  }, [messages, tickerContext, activeSessionId]);

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

      // 如果沒有 active session，建立一個新的
      if (!activeSessionId) {
        const newId = createSessionId();
        const newSession: ChatSession = {
          id: newId,
          title: generateTitle(text),
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ticker: tickerContext || undefined,
        };
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newId);
      }

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
      setImagePreview(null); // 清除圖片預覽
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsStreaming(true);

      // 若是第一條 user 訊息，更新 session 標題
      if (activeSessionId && messages.length === 0) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId ? { ...s, title: generateTitle(text) } : s
          )
        );
      }

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
          body: JSON.stringify({ messages: payloadMessages, model: selectedModel }),
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
    [input, isStreaming, messages, applyEvent, updateAssistant, selectedModel]
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

  /* ── 歷史/Session 管理 ──────────────────────────────────── */
  const newSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setMessages([]);
    setInput('');
    setIsStreaming(false);
    setActiveSessionId(null);
    setHistoryOpen(false);
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setMessages(session.messages);
      setActiveSessionId(session.id);
      if (session.ticker) setTickerContext(session.ticker);
    }
    setHistoryOpen(false);
  }, [sessions]);

  const deleteSession = useCallback((sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      saveHistory(filtered);
      return filtered;
    });
    if (activeSessionId === sessionId) {
      setMessages([]);
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((prev) => !prev);
  }, []);

  const clearTickerContext = useCallback(() => {
    setTickerContext('');
  }, []);

  if (!mounted) return null;

  return (
    <div className={styles.aiRoot}>
      <div className={styles.shell}>
        {/* ── 個股語境標籤 ── */}
        {tickerContext && (
          <div className={styles.tickerContextBar}>
            <Tag className={styles.tickerTagIcon} size={14} />
            <span className={styles.tickerTagText}>個股語境：{tickerContext}</span>
            <button
              type="button"
              className={styles.tickerTagClose}
              onClick={clearTickerContext}
              aria-label="清除個股語境"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <header className={styles.topBar}>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}>AI</span>
            <div>
              {/* ai.md §3.1：標題 `問大佬AI` → 品牌化為 `問峰子AI`；副標兩行，
                  日期不硬編碼（動態當前日期 + 盤後收盤表述）。 */}
              <h1 className={styles.brandTitle}>問峰子AI</h1>
              <p className={styles.brandSub}>
                根據你的目標與經驗，提供可直接採用的研究視角；所有數據依{' '}
                {formatPostMarketDate(new Date())} 盤後收盤，結論附依據與風險提醒。
              </p>
            </div>
          </div>

          {/* 模式 chips 列（ai.md §3.3）：5 顆類別 chip + 最右「全部」快選。
              純前端過濾：點選只影響下方快速提問卡的分組顯示。 */}
          <div className={styles.chipRow} role="group" aria-label="快速提問分類">
            {QUESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`${styles.chipBtn} ${activeChip === chip ? styles.chipBtnActive : ''}`}
                onClick={() => setActiveChip(activeChip === chip ? null : chip)}
                aria-pressed={activeChip === chip}
              >
                {chip}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chipAllBtn} ${activeChip === null ? styles.chipAllBtnActive : ''}`}
              onClick={() => setActiveChip(null)}
              aria-pressed={activeChip === null}
            >
              {CHIP_ALL_LABEL}
            </button>
          </div>

          <div className={styles.topBarActions}>
            <button
              type="button"
              className={`${styles.iconBtn} ${historyOpen ? styles.iconBtnActive : ''}`}
              onClick={toggleHistory}
              aria-label={historyOpen ? '關閉歷史' : '開啟歷史'}
              aria-expanded={historyOpen}
            >
              <History size={20} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={newSession}
              aria-label="新對話"
            >
              <Plus size={20} />
            </button>
            {/* ── 模型選擇 ───────────────────────────────────────────── */}
            <div className={styles.modelPicker}>
              <button
                type="button"
                className={styles.modelBtn}
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                aria-label="選擇模型"
                aria-expanded={modelMenuOpen}
                aria-haspopup="listbox"
              >
                <Cpu size={18} />
                <span className={styles.modelBtnLabel}>
                  {AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel}
                </span>
              </button>
              {modelMenuOpen && (
                <ul className={styles.modelMenu} role="listbox" aria-label="可用模型">
                  {AVAILABLE_MODELS.map((m) => (
                    <li key={m.id} role="option" aria-selected={selectedModel === m.id}>
                      <button
                        type="button"
                        className={`${styles.modelOption} ${selectedModel === m.id ? styles.modelOptionActive : ''}`}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelMenuOpen(false);
                        }}
                      >
                        {m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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

        {/* ── 歷史側邊欄 ── */}
        {historyOpen && (
          <aside className={styles.historyPanel} aria-label="對話歷史">
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>對話歷史</h2>
            </div>
            <div className={styles.historyList}>
              {sessions.length === 0 ? (
                <p className={styles.historyEmpty}>尚無對話紀錄</p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`${styles.historyItem} ${activeSessionId === session.id ? styles.historyItemActive : ''}`}
                    onClick={() => switchSession(session.id)}
                  >
                    <div className={styles.historyItemMain}>
                      <span className={styles.historyItemTitle}>{session.title}</span>
                      {session.ticker && (
                        <span className={styles.historyItemTicker}>{session.ticker}</span>
                      )}
                    </div>
                    <span className={styles.historyItemTime}>
                      {new Date(session.updatedAt).toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      className={styles.historyItemDelete}
                      onClick={(e) => deleteSession(session.id, e)}
                      aria-label="刪除此對話"
                    >
                      <Trash2 size={14} />
                    </button>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

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
                  {/* 快速提問卡：依類別分組 + 模式 chips 過濾（ai.md §3.3/§3.4）。
                      各卡提問句 spec 標 [無法辨識] 不補腦：分組預設無卡時顯示占位提示。 */}
                  {(() => {
                    const visibleGroups = filterCardGroups(QUESTION_CARD_GROUPS, activeChip);
                    const totalCards = countCards(visibleGroups);
                    if (totalCards === 0) {
                      return (
                        <div className={styles.questionCardGroups}>
                          <p className={styles.questionCardPlaceholder}>
                            快速提問卡整理中，可直接輸入你的台股問題。
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className={styles.questionCardGroups}>
                        {visibleGroups.map((group) => (
                          <section key={group.category} className={styles.questionCardGroup}>
                            <h3 className={styles.questionCardGroupTitle}>{group.category}</h3>
                            <div className={styles.questionCardList}>
                              {group.cards.map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  className={styles.questionCard}
                                  onClick={() => void handleSend(question)}
                                >
                                  {question}
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
            </div>

            <div className={styles.composer}>
              {/* ── 圖片預覽條 ───────────────────────────────────── */}
              {imagePreview && (
                <div className={styles.imagePreviewStrip}>
                  <img
                    src={imagePreview}
                    alt="上傳預覽"
                    className={styles.imagePreviewThumb}
                  />
                  <button
                    type="button"
                    className={styles.imagePreviewRemove}
                    onClick={removeImage}
                    aria-label="移除圖片"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
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
              {/* 隱藏檔案輸入 */}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                }}
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
                  {/* 語音輸入按鈕 */}
                  <button
                    type="button"
                    className={`${styles.composerVoiceBtn} ${isListening ? styles.composerVoiceBtnActive : ''}`}
                    onClick={toggleListening}
                    disabled={!voiceSupported}
                    aria-label={isListening ? '停止語音輸入' : '語音輸入'}
                    aria-pressed={isListening}
                    title={voiceSupported ? (isListening ? '停止語音輸入' : '語音輸入') : '瀏覽器不支援語音辨識'}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  {/* 圖片上傳按鈕 */}
                  <button
                    type="button"
                    className={styles.composerImageBtn}
                    onClick={triggerFileInput}
                    aria-label="上傳圖片"
                    title="上傳圖片"
                  >
                    <Image size={18} />
                  </button>
                  {isStreaming ? (
                    <button type="button" className={styles.stopBtn} onClick={handleStop}>
                      停止
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.sendBtn}
                      onClick={() => void handleSend()}
                      disabled={input.trim().length === 0 && !imagePreview}
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

function AIPageWrapper() {
  return (
    <Suspense fallback={null}>
      <AIPage />
    </Suspense>
  );
}

export default AIPageWrapper;

/* ── 子元件 ────────────────────────────────────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const hasReasoning = message.reasoning.trim().length > 0;
  const isWaiting = !isUser && !hasReasoning && !message.content && !message.isError;

  const rowClass = isUser ? styles.bubbleRowUser : styles.bubbleRowAi;
  const bubbleClass = isUser ? styles.bubbleUser : styles.bubbleAi;

  /**
   * AI 答覆支援結論/重點/風險提醒三段式答覆中的 Markdown 子集
   *（**粗體**、*斜體*、`行內程式碼`、標題、列表、表格）。
   * 使用者氣泡與思考過程維持純文字 pre-wrap。 */
  const aiContentNodes = message.content
    ? markdownToReactNodes(message.content, {
        bold: styles.mdBold,
        italic: styles.mdItalic,
        code: styles.mdCode,
        list: styles.mdList,
        tableWrap: styles.mdTableWrap,
        table: styles.mdTable,
      })
    : [];

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
          isUser ? (
            <p className={styles.bubbleText}>{message.content}</p>
          ) : (
            <div className={styles.mdContent}>{aiContentNodes}</div>
          )
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
