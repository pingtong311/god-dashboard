'use client';

/**
 * /school 台股學堂 — 62 篇名詞教學（7 分類）
 * ============================================================================
 * 版面逐項對照博主原始 HTML（IOS_design/extracted/site/school.html，唯一權威）。
 * 內文 100% 來自 src/data/school-articles.json（不自行改寫文案）；
 * 文章內文圖示來自 src/data/school-figures.ts（博主原文 SVG markup）。
 *
 * 需要 'use client'：搜尋框 + 分類 chip 皆為前端狀態（query / selected）。
 *
 * 忠實度說明：
 *   - 博主每篇 CTA 的 href 指向博主自己的路由（如 /today/），在峰子會 404，
 *     故一律經 resolveLegacyHref() 轉為峰子路由；**CTA 顯示文字保持 JSON 原文**。
 *   - 頁首 h1／說明／分享鈕／頁面層級切換膠囊／頁尾校閱備註，博主原檔有、
 *     但 JSON 未收錄，故於本檔以原文常數補上（見 PAGE_CHROME）。
 *   - 全站 site-footer 屬共用外框（非本頁內容），不在本頁渲染。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rawData from '@/data/school-articles.json';
import { getSchoolFigure } from '@/data/school-figures';
import { resolveLegacyHref } from '@/lib/legacyRoutes';
import styles from './school.module.css';
import {
  ALL_ID,
  buildChips,
  selectVisibleCategories,
  type SchoolArticle,
  type SchoolBlock,
  type SchoolData,
} from './schoolSelect';

/** JSON 匯入（欄位已於 schoolSelect.ts 定義型別，此處僅做形狀斷言）。 */
const data = rawData as unknown as SchoolData;

/* -------------------------------------------------------------------------- */
/* 博主原檔有、但 JSON 未收錄的頁面外框文字（逐字取自 school.html，不可改寫）   */
/* -------------------------------------------------------------------------- */

const PAGE_CHROME = {
  /** <h1> 下的說明段（school.html：page-enter 內）。 */
  lead:
    '把日報和網站用到的名詞，一篇一篇講清楚。每篇都有「是什麼、為什麼重要、怎麼用」， 底部連結直接跳到對應功能。看不懂就來查，不用一次看完。',
  /** 分享鈕文字。 */
  shareLabel: '分享',
  /** 複製連結後的回饋文字（前端行為，非博主靜態文字）。 */
  shareCopied: '已複製連結',
  /** 頁面層級切換膠囊（school.html：<nav aria-label="相關功能切換">）。 */
  subNav: [
    { href: '/learn/', label: '文章' },
    { href: '/school/', label: '學堂' },
    { href: '/dojo/', label: '練功房' },
    { href: '/guess/', label: '猜K線' },
    { href: '/guide/', label: '新手' },
    { href: '/manual/', label: '手冊' },
  ],
  /** 目前頁（用於膠囊選中態）。 */
  activeHref: '/school/',
  /** 頁尾校閱備註（school.html：page-enter 內最後一段）。 */
  note:
    '內容校閱：2026-08-03。動態數字請以各功能顯示的資料日為準；交易制度與門檻以交易所及券商最新公告為準。 以上為歷史統計與研究教學，非投資建議。',
} as const;

/** 分享鈕圖示（school.html 原文 svg path）。 */
const SHARE_ICON_PATH =
  'M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z';

/* -------------------------------------------------------------------------- */
/* 子元件                                                                     */
/* -------------------------------------------------------------------------- */

/** 頁面層級切換膠囊列。 */
function SubNav() {
  return (
    <nav aria-label="相關功能切換" className={styles.subNav}>
      <div className={styles.subNavTrack}>
        {PAGE_CHROME.subNav.map((item) => {
          const active = item.href === PAGE_CHROME.activeHref;
          return (
            <Link
              key={item.href}
              href={resolveLegacyHref(item.href)}
              aria-current={active ? 'page' : undefined}
              className={`${styles.subNavPill} ${active ? styles.subNavPillActive : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
        <span aria-hidden="true" className={styles.subNavSpacer} />
      </div>
    </nav>
  );
}

/** 單一內文區塊（def / warn）。 */
function BlockView({ block }: { block: SchoolBlock }) {
  if (block.kind === 'warn') {
    return <div className={styles.warn}>{block.text}</div>;
  }
  return (
    <div className={styles.def}>
      {/* label 為空時不產生空的 <b>（對照博主：無 label 的 def 直接輸出 text）。 */}
      {block.label ? <b className={styles.defLabel}>{block.label}</b> : null}
      {block.text}
    </div>
  );
}

/** 單篇文章（<details>）。 */
function ArticleView({ article }: { article: SchoolArticle }) {
  const figure = getSchoolFigure(article.id);
  return (
    <details id={article.id} className={styles.article}>
      <summary className={styles.summary}>
        <div className={styles.summaryHead}>
          <b className={styles.summaryTitle}>{article.title}</b>
          <span aria-hidden="true" className={styles.summaryArrow}>
            ▸
          </span>
        </div>
        <p className={styles.summarySub}>{article.subtitle}</p>
      </summary>
      <div className={styles.body}>
        {figure ? (
          <div
            className={styles.figure}
            // 博主原文 SVG markup；來源為本地抽取檔，非使用者輸入。
            dangerouslySetInnerHTML={{ __html: figure }}
          />
        ) : null}
        {article.blocks.map((block, index) => (
          <BlockView key={`${article.id}-b${index}`} block={block} />
        ))}
        {article.cta ? (
          <Link href={resolveLegacyHref(article.cta.href)} className={styles.cta}>
            {article.cta.label}
          </Link>
        ) : null}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* 主頁面                                                                     */
/* -------------------------------------------------------------------------- */

export default function SchoolPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(ALL_ID);
  const [shareNote, setShareNote] = useState('');
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 元件卸載時清掉分享回饋的計時器。
  useEffect(() => {
    return () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, []);

  /** 搜尋 + chip 篩選可疊加後的各分類文章。 */
  const visibleCategories = useMemo(
    () => selectVisibleCategories(data, query, selected),
    [query, selected],
  );

  /** chip 清單：全部 + 7 分類，數字皆動態計算。 */
  const chips = useMemo(() => buildChips(data), []);

  const hasResults = visibleCategories.length > 0;

  /** 分享：優先 Web Share API，其次複製連結。 */
  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: data.pageTitle, url });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareNote(PAGE_CHROME.shareCopied);
        if (shareTimer.current) clearTimeout(shareTimer.current);
        shareTimer.current = setTimeout(() => setShareNote(''), 2000);
      }
    } catch {
      /* 使用者取消分享或環境不支援 → 靜默處理。 */
    }
  }, []);

  return (
    <div className={styles.shell}>
      <SubNav />
      <div className={styles.enter}>
        <h1 className={styles.title}>{data.pageTitle}</h1>
        <p className={styles.lead}>{PAGE_CHROME.lead}</p>
        <div className={styles.shareRow}>
          <button type="button" className={styles.shareBtn} onClick={handleShare}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              fill="currentColor"
              viewBox="0 0 256 256"
              aria-hidden="true"
            >
              <path d={SHARE_ICON_PATH} />
            </svg>
            {shareNote || PAGE_CHROME.shareLabel}
          </button>
        </div>

        {/* 頁首引導卡 */}
        <div className={styles.intro}>
          <p className={styles.introTitle}>{data.intro.title}</p>
          <p className={styles.introDesc}>{data.intro.desc}</p>
          <ol className={styles.introSteps}>
            {data.intro.steps.map((step, index) => (
              <li key={`intro-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>

        {/* 搜尋框 */}
        <input
          type="text"
          className={styles.search}
          placeholder={data.placeholder}
          aria-label="搜尋名詞"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* 分類 chips */}
        <div className={styles.chips}>
          {chips.map((chip) => {
            const active = chip.id === selected;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                onClick={() => setSelected(chip.id)}
              >
                {chip.text}
              </button>
            );
          })}
        </div>

        {/* 分類 section */}
        {hasResults ? (
          <div className={styles.sections}>
            {visibleCategories.map((category) => (
              <section key={category.id} id={category.id} className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>
                    {category.emoji} {category.name}
                  </h2>
                  <span className={styles.sectionCount}>{category.articles.length} 篇</span>
                </div>
                <p className={styles.sectionDesc}>{category.desc}</p>
                <div className={styles.articles}>
                  {category.articles.map((article) => (
                    <ArticleView key={article.id} article={article} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={styles.empty} role="status">
            <p className={styles.emptyEmoji} aria-hidden="true">
              🔍
            </p>
            <p className={styles.emptyTitle}>找不到「{query.trim()}」相關的名詞</p>
            <p className={styles.emptyHint}>
              換個關鍵字試試，或點上方「全部」看完整 {data.total} 篇清單。
            </p>
          </div>
        )}

        {/* 頁尾校閱備註 */}
        <p className={styles.note}>{PAGE_CHROME.note}</p>
      </div>
    </div>
  );
}
