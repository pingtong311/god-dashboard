/**
 * aiQuestionCards.test.ts — 模式 chips 過濾 + 快速提問卡分組單測。
 *
 * 規格：ai.md §3.3（chips，中信心）與 §3.4（類別分組，各卡文字 [無法辨識]）。
 * 驗證重點：
 *   1. filterCardGroups：null 回全組、指定 chip 只回對應組（純函數）。
 *   2. QUESTION_CARD_GROUPS 骨架：三類 籌碼/走勢/量價，卡文字未補腦（空陣列）。
 *   3. countCards：僅計有卡的組。
 */

import {
  CHIP_ALL_LABEL,
  QUESTION_CHIPS,
  QUESTION_CARD_GROUPS,
  filterCardGroups,
  countCards,
  type QuestionCardGroup,
} from '@/app/ai/aiQuestionCards';

describe('QUESTION_CHIPS（ai.md §3.3，中信心）', () => {
  it('依 spec 逐字 5 顆 chip', () => {
    expect(QUESTION_CHIPS).toEqual(['問股', '問盤', '問籌碼', '問題材', '問教學']);
  });

  it('「全部」快選標籤逐字自 spec（低信心）', () => {
    expect(CHIP_ALL_LABEL).toBe('全部');
  });
});

describe('filterCardGroups', () => {
  const groups: readonly QuestionCardGroup[] = [
    { category: '籌碼', chip: '問籌碼', cards: ['q1', 'q2'] },
    { category: '走勢', chip: '問盤', cards: ['q3'] },
    { category: '量價', chip: null, cards: ['q4'] },
  ];

  it('null（全部）回傳全部分組的淺拷貝', () => {
    const all = filterCardGroups(groups, null);
    expect(all).toHaveLength(3);
    expect(all).not.toBe(groups);
  });

  it('指定 chip 只回對應分組', () => {
    expect(filterCardGroups(groups, '問籌碼').map((g) => g.category)).toEqual(['籌碼']);
    expect(filterCardGroups(groups, '問盤').map((g) => g.category)).toEqual(['走勢']);
  });

  it('無對應分組的 chip 回空陣列', () => {
    expect(filterCardGroups(groups, '問教學')).toEqual([]);
  });
});

describe('QUESTION_CARD_GROUPS 骨架（ai.md §3.4）', () => {
  it('三類 籌碼/走勢/量價 依 spec 逐字', () => {
    expect(QUESTION_CARD_GROUPS.map((g) => g.category)).toEqual(['籌碼', '走勢', '量價']);
  });

  it('卡文字 [無法辨識] 不補腦：全部預設空陣列', () => {
    for (const group of QUESTION_CARD_GROUPS) {
      expect(group.cards).toEqual([]);
    }
  });
});

describe('countCards', () => {
  it('只累計有卡的分組', () => {
    expect(
      countCards([
        { category: '籌碼', chip: '問籌碼', cards: ['a', 'b'] },
        { category: '走勢', chip: '問盤', cards: [] },
      ])
    ).toBe(2);
  });

  it('現況骨架（無卡）回 0 → UI 顯示占位提示', () => {
    expect(countCards(QUESTION_CARD_GROUPS)).toBe(0);
  });
});
