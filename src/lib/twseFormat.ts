/**
 * src/lib/twseFormat.ts
 * ────────────────────────────────────────────────────────────────────────────
 * 證交所（TWSE）免費資料的共用格式轉換工具。
 *
 * 為何需要本檔：
 *   這些函式原本內嵌在「即時計算」的 route 內（margin-maint / chips）。
 *   當端點遷移到「離線預算 ＋ 邊緣零解析直送」架構後，route 的即時計算被拆到
 *   獨立的 `*-data.ts` 模組（供 scripts/precompute-scan.mjs 以 esbuild bundle），
 *   但這些純函式並未一併抽出 → 造成 `import from '.../route'` 的懸空依賴
 *   （route 不再 export，esbuild 直接 build failed）。
 *
 *   ⇒ 統一收在此共用層，讓 etf-active / margin-maint / chips 等 data 模組
 *     不再反向依賴 route。
 */

/** 解析數字字串（去除千分位逗號）；空值 / '-' / 非數字 → null（絕不當 0）。 */
export function parseNumeric(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '---' || s.toUpperCase() === 'NULL' || s.toUpperCase() === 'NAN') {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 證交所日期 → 西元 ISO（YYYY-MM-DD）。
 * 支援西元 "20260924"（rwd MI_MARGN date 欄）與民國 "1150924"（openapi）。
 */
export function twseDateToIso(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/^\d{8}$/.test(s)) {
    // 西元 YYYYMMDD
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const roc = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (roc) {
    const y = Number(roc[1]) + 1911;
    return `${y}-${roc[2]}-${roc[3]}`;
  }
  return '';
}