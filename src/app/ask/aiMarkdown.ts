/**
 * aiMarkdown.ts — AI 氣泡的輕量 Markdown 渲染（純函數，無外部依賴）。
 *
 * 對齊 ai.md §8「答覆渲染」：支援結論/重點/風險提醒三段式答覆中常見的基本
 * Markdown 子集：
 *   - 段落（換行保留，由 CSS pre-wrap 呈現）
 *   - 行內：**粗體**、*斜體*、`行內程式碼`（未配對標記一律當字面量，安全於串流）
 *   - 標題：# / ## / ###
 *   - 無序列表：- / * / •；有序列表：1. / 2. …
 *   - 表格：| a | b | 表頭 + |---| 分隔列；串流中欄數未齊全時缺欄補空字，
 *     資料補全後自動呈現完整表格（不產生錯誤畫面）
 *
 * 設計原則：純函數、輸入只讀、輸出 React 節點（用 createElement，避免 JSX
 * 以便維持 .ts 純型別檔案）；任何無法辨識的語法都退化成純文字，絕不拋錯。
 */
import { createElement, type ReactNode } from 'react';

/* ── 型別 ─────────────────────────────────────────────────── */

/** 行內節點：文字 / 粗體 / 斜體 / 行內程式碼。 */
type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

/** 區塊節點：段落（含行內樣式）/ 標題 / 列表 / 表格。 */
type MdBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

/* ── 行內解析（只認完整配對 token；未配對標記保留為純文字）── */

// 行內 token：粗體 **text** / 行內程式碼 `code` / 斜體 *text*。
// 關鍵：斜體 `\*[^*\n]+\*` 用「*不含* *」的 `[^*\n]`——避免貪婪吃掉「粗+斜」
// 連寫（**粗*斜*）或把未配對 `**` 的尾端 ** 吃進 token 導致斷字。
const INLINE_TOKEN_RE = /(\*\*[^*\n]*?\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;

/**
 * 解析單行行內 Markdown，回傳行內節點清單。
 * 策略：regex 只認「完整配對」的 token（**粗體** / `code` / *斜體*），
 * 兩 token 之間的任何字元（含未配對的 * 與 **）全數保留為純文字，
 * 對串流打字中間狀態安全、不丟字。
 */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // 模組層級常數 regex，先重設 lastIndex 避免跨呼叫污染
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    const token = match[1];
    if (match.index > cursor) {
      nodes.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    if (token.startsWith('**')) {
      nodes.push({ kind: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      nodes.push({ kind: 'code', text: token.slice(1, -1) });
    } else {
      nodes.push({ kind: 'italic', text: token.slice(1, -1) });
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push({ kind: 'text', text: text.slice(cursor) });
  }
  return nodes.length > 0 ? nodes : [{ kind: 'text', text }];
}

/* ── 區塊解析 ─────────────────────────────────────────────── */

function isHeadingLine(line: string): boolean {
  return /^#{1,3}\s+/.test(line);
}

function isListLine(line: string): boolean {
  return /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
}

function stripListMarker(line: string): string {
  return line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
}

function splitTableRow(line: string): string[] {
  let cells = line.trim();
  if (cells.startsWith('|')) cells = cells.slice(1);
  if (cells.endsWith('|')) cells = cells.slice(0, -1);
  return cells.split('|').map((c) => c.trim());
}

/** 區塊解析：回傳依序排列的區塊清單。 */
export function parseBlocks(markdown: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 空行 → 跳過
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // 標題
    if (isHeadingLine(line)) {
      // level = 「# 的數量」（1 / 2 / 3，#### 起視同 3）；
      // 下游 markdownToReactNodes 依此映射 h2(h1) / h3(h2) / h4(h3)。
      // 注意：.match() 回傳的是「配對結果陣列」，其 .length 是「群組數」（常為 1），
      // 不是 # 字元數；要取 # 數量需讀回傳陣列的 [0]（整串配對字串）的 length。
      const level = Math.min(3, line.match(/^#+/)![0].length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: line.replace(/^#+\s*/, '') });
      i += 1;
      continue;
    }

    // 表格：目前列含 | 且下一列是分隔列 → 視為表格
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      // 串流中的不完整表格（欄數不齊）照樣呈現，缺欄補空字
      const normalized = rows.map((r) => {
        const out = r.slice(0, header.length);
        while (out.length < header.length) out.push('');
        return out;
      });
      blocks.push({ kind: 'table', header, rows: normalized });
      continue;
    }

    // 列表
    if (isListLine(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i])) {
        items.push(stripListMarker(lines[i]));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // 段落：吃到空行或下一個結構行為止
    const paragraphLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isHeadingLine(lines[i]) &&
      !isListLine(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

/* ── React 輸出 ───────────────────────────────────────────── */

/** 行內節點 → React 節點；缺類名時退回純文字（不丟失內容）。 */
export function renderInlineNodes(
  nodes: InlineNode[],
  classNames: readonly (string | null | undefined)[]
): ReactNode[] {
  const out: ReactNode[] = [];
  const [boldCls, italicCls, codeCls] = classNames;
  nodes.forEach((node, idx) => {
    if (node.kind === 'bold') {
      out.push(
        boldCls
          ? createElement('strong', { key: `b${idx}`, className: boldCls }, node.text)
          : node.text
      );
    } else if (node.kind === 'italic') {
      out.push(
        italicCls
          ? createElement('em', { key: `i${idx}`, className: italicCls }, node.text)
          : node.text
      );
    } else if (node.kind === 'code') {
      out.push(
        codeCls
          ? createElement('code', { key: `c${idx}`, className: codeCls }, node.text)
          : node.text
      );
    } else {
      out.push(node.text);
    }
  });
  return out;
}

/**
 * 主入口：把 Markdown 字串轉為 React 節點清單。
 * 空文字回傳空陣列（由呼叫端決定是否顯示「思考中」）。
 */
export function markdownToReactNodes(
  markdown: string,
  classNames?: {
    bold?: string;
    italic?: string;
    code?: string;
    list?: string;
    tableWrap?: string;
    table?: string;
  }
): ReactNode[] {
  const blocks = parseBlocks(markdown);
  const nodes: ReactNode[] = [];
  const inlineClassNames = [classNames?.bold, classNames?.italic, classNames?.code];

  blocks.forEach((block, bi) => {
    switch (block.kind) {
      case 'heading': {
        nodes.push(
          createElement(
            // 結論/重點/風險三段式 → h2/h3/h4（# 降一階，避免與頁面 <h1> 衝突）
            block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4',
            { key: `h${bi}` },
            ...renderInlineNodes(parseInline(block.text), inlineClassNames)
          )
        );
        break;
      }
      case 'paragraph': {
        nodes.push(
          createElement(
            'p',
            { key: `p${bi}` },
            block.lines.map((ln, li) =>
              createElement(
                'span',
                { key: li },
                li > 0 ? '\n' : null,
                ...renderInlineNodes(parseInline(ln), inlineClassNames)
              )
            )
          )
        );
        break;
      }
      case 'list': {
        const items = block.items.map((item, ii) =>
          createElement(
            'li',
            { key: ii },
            ...renderInlineNodes(parseInline(item), inlineClassNames)
          )
        );
        nodes.push(
          createElement(block.ordered ? 'ol' : 'ul', { key: `l${bi}`, className: classNames?.list },
            items)
        );
        break;
      }
      case 'table': {
        const table = createElement(
          'table',
          { key: `t${bi}`, className: classNames?.table },
          createElement(
            'thead',
            null,
            createElement(
              'tr',
              null,
              block.header.map((cell, ci) =>
                createElement('th', { key: ci }, cell)
              )
            )
          ),
          createElement(
            'tbody',
            null,
            block.rows.map((row, ri) =>
              createElement(
                'tr',
                { key: ri },
                row.map((cell, ci) => createElement('td', { key: ci }, cell))
              )
            )
          )
        );
        nodes.push(
          classNames?.tableWrap
            ? createElement('div', { key: `tw${bi}`, className: classNames.tableWrap }, table)
            : table
        );
        break;
      }
      default:
        break;
    }
  });

  return nodes;
}
