/**
 * aiQuestionCards.ts — AI 頁「模式 chips 列」與「快速提問卡（依類別分組）」資料。
 *
 * 規格：ai.md §3.3（模式 chips）與 §3.4（快速提問卡類別標題與卡片）。
 *
 * ── 信心標註（施工複核清單）──────────────────────────────────
 * 1. chip 名稱依幀像素判讀，個別字可能誤讀（如「問題材」）——**中信心**，
 *    施工後需與業主複核。
 * 2. 最右標籤 `全部`——**低信心**（spec 記「看更多/全部（讀作 全部，不確）」）。
 * 3. 類別標題 `籌碼` `走勢` 中信心；`量價` 為「讀作，不確」——低信心。
 * 4. 各卡片提問句在 spec 批幀中**均無法逐字讀清**（ai.md §3.4 / §9-1），
 *    依規則**不補腦**：各分組以 `/* [無法辨識] *&#47;` 標記，只實現能確認的
 *    類別骨架（組標題 + 卡片置位）；後續抽到清晰幀再逐字補入。
 * ────────────────────────────────────────────────────────────
 */

/** 模式 chip 類別（ai.md §3.3，中信心，施工後需與業主複核）。 */
export type QuestionChip =
  | '問股'
  | '問盤'
  | '問籌碼'
  | '問題材'
  | '問教學';

/** 快選：`null` 代表「全部」（未選任何 chip，顯示所有分組）。 */
export type ChipFilter = QuestionChip | null;

/** 最右 `全部` 標籤——低信心（spec：「看更多/全部（讀作 全部，不確）」）。 */
export const CHIP_ALL_LABEL = '全部';

/** 依序 5 顆 chip（最右另有 `全部` 快選標籤，見 CHIP_ALL_LABEL）。 */
export const QUESTION_CHIPS: readonly QuestionChip[] = [
  '問股', // spec §3.3 中信心，施工後需與業主複核
  '問盤', // spec §3.3 中信心，施工後需與業主複核
  '問籌碼', // spec §3.3 中信心，施工後需與業主複核
  '問題材', // spec §3.3 中信心，施工後需與業主複核
  '問教學', // spec §3.3 中信心，施工後需與業主複核
];

/** 快速提問卡的類別（ai.md §3.4：類別標題 籌碼/走勢/量價；各卡文字 [無法辨識]）。 */
export type QuestionCategory = '籌碼' | '走勢' | '量價';

/** 單一類別的快速提問卡分組。 */
export interface QuestionCardGroup {
  /** 類別標題（逐字自 ai.md §3.4）。 */
  category: QuestionCategory;
  /** 該類別對應的 chip 過濾值（`null`＝不分 chip，恒顯示）。 */
  chip: QuestionChip | null;
  /**
   * 卡片提問句。ai.md §3.4 / §9-1：各卡文字在幀中均無法逐字讀清，
   * **不補腦** → 全部類別預設空陣列 `[]`；抽到清晰幀後逐字補入（2～4 張）。
   * 施工後需與業主複核。
   */
  cards: readonly string[];
}

export const QUESTION_CARD_GROUPS: readonly QuestionCardGroup[] = [
  {
    category: '籌碼', // spec §3.4 類別標題 1，中信心
    chip: '問籌碼',
    // [無法辨識] ai.md §9-1：卡片提問句字級小、多列排摺疊，全部無法逐字讀清，不補腦
    cards: [],
  },
  {
    category: '走勢', // spec §3.4 類別標題 2，中信心
    chip: '問盤',
    // [無法辨識] 同上
    cards: [],
  },
  {
    category: '量價', // spec §3.4 類別標題 3「（讀作，不確）」，低信心，施工後需與業主複核
    chip: null,
    // [無法辨識] 同上
    cards: [],
  },
];

/**
 * 依 chip 過濾快速提問卡分組：
 * - filter === null（`全部`/未選）→ 回傳全部分組；
 * - 否則回傳 `chip === filter` 的分組。
 * 純函數，供單測。
 */
export function filterCardGroups(
  groups: readonly QuestionCardGroup[],
  filter: ChipFilter
): QuestionCardGroup[] {
  if (filter === null) return [...groups];
  return groups.filter((g) => g.chip === filter);
}

/**
 * 依 chip 過濾卡片數量統計（含卡片數為 0 的組不計），供 UI 決定隱藏空組。
 * 純函數，供單測。
 */
export function countCards(groups: readonly QuestionCardGroup[]): number {
  return groups.reduce((sum, g) => sum + g.cards.length, 0);
}
