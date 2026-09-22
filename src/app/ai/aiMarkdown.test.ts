/**
 * aiMarkdown.test.ts — AI 氣泡 Markdown 渲染函數單測。
 *
 * 驗證重點（ai.md §8「答覆渲染：結論/重點/風險三段式、可能含表格/條目」）：
 *   1. 行內樣式：粗體 / 斜體 / 行內程式碼，未配對標記當字面量。
 *   2. 區塊：標題、無序/有序列表、表格（含串流中欄數未齊全時的補空字行為）。
 *   3. markdownToReactNodes：節點類型 / keys / 文字不丟失，不拋錯。
 *
 * 註：React element 以「類型 + className + 文字內容」斷言，不用 toEqual
 * 對元素陣列做引用比較（Jest 30 對 element 的 toEqual 走引用相等）。
 */

import { parseInline, parseBlocks, markdownToReactNodes } from '@/app/ai/aiMarkdown';
import { isValidElement, type ReactNode } from 'react';

/**
 * 遞迴抽出一棵節點樹中的所有文字（斷言用）。
 * 同時涵蓋兩種節點型別：
 *   - React element（type + props.children）
 *   - parseInline 回傳的純資料物件 { kind, text }（讀 .text）
 * 任一型別皆可無縫取文字，避免「對純 object 回空字」造成「文字不丟」斷言假陽性失敗。
 */
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  const el = node as { kind?: unknown; text?: unknown; type?: unknown; props?: { children?: unknown } };
  if (typeof el.text === 'string') return el.text; // InlineNode { kind, text }
  if (typeof el.type === 'string' && el.props?.children !== undefined) {
    return textOf(el.props.children); // React element
  }
  return '';
};

/**
 * 取節點的「tag 字串」（'h2'/'div'/'strong' 等）；純文字回 '#text'，null/undefined 回字串。
 * 接受 unknown 以容納 markdownToReactNodes 回傳的 ReactNode[] 中可能混入的
 * 純 object / 文字 / null——isValidElement 會把非 element 過濾掉。
 */
const typeOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return '#text';
  if (node === null || node === undefined) return String(node);
  return isValidElement(node as ReactNode) ? String((node as { type: unknown }).type) : String(typeof node);
};

describe('parseInline', () => {
  it('粗體 **text** → bold 節點，文字不丟', () => {
    const nodes = parseInline('重點：**外資買超** 持續');
    const kinds = nodes.map((n) => n.kind);
    expect(kinds).toContain('bold');
    expect(textOf(nodes as unknown as ReactNode[])).toBe('重點：外資買超 持續');
  });

  it('斜體 *text* → italic 節點', () => {
    const nodes = parseInline('（*估計*）');
    expect(nodes.map((n) => n.kind)).toContain('italic');
  });

  it('行內程式碼 `text` → code 節點', () => {
    const nodes = parseInline('代號 `2330` 上證');
    expect(nodes.map((n) => n.kind)).toContain('code');
    expect(textOf(nodes as unknown as ReactNode[])).toBe('代號 2330 上證');
  });

  it('未配對 ** 標記當純文字（串流安全，不丟字）', () => {
    const nodes = parseInline('未完 **');
    expect(textOf(nodes as unknown as ReactNode[])).toBe('未完 **');
  });

  it('配對與未配對混排：配對的樣式化、未配對標記當純文字（不拋錯、不丟內容）', () => {
    const nodes = parseInline('a **粗** b *斜*');
    const kinds = nodes.map((n) => n.kind);
    expect(kinds).toContain('bold');
    expect(kinds).toContain('italic');
    // 行內文字不丟失（粗體/斜體的標記字面消失屬正常，標記本身不算內容）
    expect(textOf(nodes as unknown as ReactNode[])).toBe('a 粗 b 斜');
  });

  it('空字串 → 單個文字節點', () => {
    expect(parseInline('')).toEqual([{ kind: 'text', text: '' }]);
  });
});

describe('parseBlocks', () => {
  it('標題 # / ## / ### 各自對應 level', () => {
    const blocks = parseBlocks('# 結論\n## 重點\n### 風險提醒');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: '結論' },
      { kind: 'heading', level: 2, text: '重點' },
      { kind: 'heading', level: 3, text: '風險提醒' },
    ]);
  });

  it('無序列表（- 開頭多行）', () => {
    const blocks = parseBlocks('- 外資買超\n- 籌碼穩定');
    expect(blocks).toEqual([
      { kind: 'list', ordered: false, items: ['外資買超', '籌碼穩定'] },
    ]);
  });

  it('有序列表（1. 開頭）', () => {
    const blocks = parseBlocks('1. 先看結論\n2. 再看風險');
    expect(blocks).toEqual([
      { kind: 'list', ordered: true, items: ['先看結論', '再看風險'] },
    ]);
  });

  it('表格：表頭 + 分隔列 + 多列資料', () => {
    const md = [
      '| 代號 | 買超量 |',
      '|------|--------|',
      '| 2330 | 1.2億 |',
      '| 2454 | 0.8億 |',
    ].join('\n');
    const blocks = parseBlocks(md);
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: ['代號', '買超量'],
        rows: [
          ['2330', '1.2億'],
          ['2454', '0.8億'],
        ],
      },
    ]);
  });

  it('表格列欄數未齊全時補空字（串流中間狀態安全）', () => {
    const md = '| a | b |\n|---|---|\n| 1 |';
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ kind: 'table', header: ['a', 'b'], rows: [['1', '']] });
  });

  it('段落內換行保留為多列', () => {
    const blocks = parseBlocks('第一句\n第二句');
    expect(blocks).toEqual([{ kind: 'paragraph', lines: ['第一句', '第二句'] }]);
  });

  it('空行分段：兩段各自成 paragraph', () => {
    const blocks = parseBlocks('段落一\n\n段落二');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['段落一'] },
      { kind: 'paragraph', lines: ['段落二'] },
    ]);
  });
});

describe('markdownToReactNodes', () => {
  it('結論/重點/風險三段式全文可解析不拋錯', () => {
    const md = [
      '## 結論',
      '**外資連續三日買超**，籌碼面偏多。',
      '',
      '## 重點',
      '- 融資餘額上升',
      '- 均線多頭排列',
      '',
      '## 風險提醒',
      '| 風險 | 說明 |',
      '|------|------|',
      '| 套牢區 | 4200 點壓力 |',
    ].join('\n');
    expect(() => markdownToReactNodes(md)).not.toThrow();
  });

  it('提供 CSS 類名時，粗體輸出 <strong class=mdBold>', () => {
    // 段落會被 <p><span> 包裹，<strong> 落在 span 子層（非 top-level）；
    // 因此在展開後的子層中搜尋 strong。
    const nodes = markdownToReactNodes('**結論**', { bold: 'mdBold' });
    // 展開 top-level 陣列與 React 元素的 children，蒐集所有 strong 節點
    const collectStrong = (n: unknown): { props?: { className?: string } }[] => {
      if (n == null) return [];
      if (Array.isArray(n)) return n.flatMap(collectStrong);
      const el = n as { type?: unknown; props?: { children?: unknown; className?: string } };
      if (typeof el.type === 'string') {
        const self = el.type === 'strong' ? [el] : [];
        return [...self, ...collectStrong(el.props?.children)];
      }
      return [];
    };
    const strongs = collectStrong(nodes);
    expect(strongs.length).toBe(1);
    expect(strongs[0].props?.className).toBe('mdBold');
    expect(textOf(nodes)).toContain('結論');
  });

  it('表格輸出包 <div class=tableWrap> 內含 <table>', () => {
    const md = '| a |\n|---|\n| 1 |';
    const nodes = markdownToReactNodes(md, { tableWrap: 'w', table: 't' });
    const wrapper = nodes[0] as { type: string; props: { className?: string } };
    expect(typeOf(wrapper)).toBe('div');
    expect(wrapper.props.className).toBe('w');
    expect(textOf(nodes)).toContain('a');
  });

  it('標題 ## 輸出 <h3>（level 1→h2 / 2→h3 / 3→h4）', () => {
    expect(typeOf(markdownToReactNodes('# A')[0])).toBe('h2');
    expect(typeOf(markdownToReactNodes('## B')[0])).toBe('h3');
    expect(typeOf(markdownToReactNodes('### C')[0])).toBe('h4');
  });

  it('列表依 ordered 輸出 <ul> / <ol> 且帶 list class', () => {
    const ul = markdownToReactNodes('- a', { list: 'L' })[0] as { type: string; props: { className?: string } };
    expect(typeOf(ul)).toBe('ul');
    expect(ul.props.className).toBe('L');
    const ol = markdownToReactNodes('1. a', { list: 'L' })[0] as { type: string; props: { className?: string } };
    expect(typeOf(ol)).toBe('ol');
  });

  it('空字串回傳空陣列（讓呼叫端顯示「思考中」）', () => {
    expect(markdownToReactNodes('')).toEqual([]);
    expect(markdownToReactNodes('\n\n')).toEqual([]);
  });

  it('未配對標記不丟失內容（字面量保留）', () => {
    const nodes = markdownToReactNodes('a ** b');
    expect(textOf(nodes)).toBe('a ** b');
  });
});
