import Link from 'next/link';
import { Fragment } from 'react';
import {
  isInternalLegalHref,
  resolveLegalHref,
  type LegalBlock,
  type LegalPageData,
  type LegalRun,
} from '@/lib/legalPages';
import styles from './LegalPage.module.css';

/**
 * LegalPage — 博主 /privacy.html 與 /terms.html 的複刻渲染器（Server Component）。
 * ----------------------------------------------------------------------------
 * 內容 100% 來自 src/data/legal-pages.json（由博主原始 HTML 抽取），
 * 版面逐條對照博主該頁的 inline <style>（見 LegalPage.module.css）。
 *
 * 為什麼維持 Server Component：全部是純標籤（h1/h2/h3/p/ul/li/hr/a），
 * 不需要任何 state 或 effect，故不加 'use client'，維持 SSR。
 *
 * 為何根容器是 <div> 而非 <main>：
 *   博主原頁的白色卡片本身是 <main>；但峰子的根 layout（src/app/layout.tsx）
 *   已用 <main className="w-full">{children}</main> 包住所有頁面，
 *   若此處再輸出 <main> 會形成 <main> 巢狀（不合法的語意標記）。
 *   為避免不合法巢狀、且外觀完全一致，這裡以 <div> 承接同一份卡片樣式。
 *
 * 淺色硬寫死：
 *   博主這兩頁無視全站主題、一律淺色（color-scheme:light / #fafafa / #fff /
 *   #1a1a1a / #0b5fff）。此處刻意照抄，不套用峰子的明暗主題變數。
 */

/** 渲染一段 inline run 陣列（text / strong / em / a）。 */
function Runs({ runs }: { runs: LegalRun[] }) {
  return (
    <>
      {runs.map((run, index) => {
        switch (run.t) {
          case 'strong':
            return (
              <strong key={index} className={styles.strong}>
                {run.v}
              </strong>
            );
          case 'em':
            return (
              <em key={index} className={styles.em}>
                {run.v}
              </em>
            );
          case 'a': {
            const href = resolveLegalHref(run.href ?? '');
            // 站內（含被轉為 /privacy、/terms 的博主連結）走 Next <Link>；
            // 外部（mailto / https）用原生 <a>，且忠於博主原頁不加 target。
            return isInternalLegalHref(href) ? (
              <Link key={index} href={href} className={styles.link}>
                {run.v}
              </Link>
            ) : (
              <a key={index} href={href} className={styles.link}>
                {run.v}
              </a>
            );
          }
          default:
            return <Fragment key={index}>{run.v}</Fragment>;
        }
      })}
    </>
  );
}

/** 渲染單一內容區塊。 */
function BlockView({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 className={styles.h2}>
          <Runs runs={block.runs} />
        </h2>
      );

    case 'h3':
      return (
        <h3 className={styles.h3}>
          <Runs runs={block.runs} />
        </h3>
      );

    case 'blockquote':
      return (
        <blockquote className={styles.blockquote}>
          <Runs runs={block.runs} />
        </blockquote>
      );

    case 'ul':
      return (
        <ul className={styles.ul}>
          {block.items.map((item, index) => (
            <li key={index} className={styles.li}>
              <Runs runs={item.runs} />
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol className={styles.ol}>
          {block.items.map((item, index) => (
            <li key={index} className={styles.li}>
              <Runs runs={item.runs} />
            </li>
          ))}
        </ol>
      );

    case 'hr':
      return <hr className={styles.hr} />;

    case 'p':
      return (
        <p className={styles.p}>
          <Runs runs={block.runs} />
        </p>
      );

    default:
      return null;
  }
}

/** 主元件。 */
export default function LegalPage({ page }: { page: LegalPageData }) {
  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {/*
          跨頁連結列：博主原頁即為純 <a href>（無 framework 包裝）。
          此處刻意用原生 <a> 而非 next/link，原因有二：
            1. 忠實複刻博主標記（原頁就是 <a>）。
            2. next/link 會依 next.config 的 trailingSlash=false 把
               `/legal/` 正規化為 `/legal`，導致 href 與博主原文不一致；
               原生 <a> 能逐字保留 `/legal/`（點擊時 Next 會自動 308 導向 /legal）。
        */}
        <nav className={styles.nav} aria-label="相關連結">
          {page.nav.map((item, index) => (
            <a key={`${item.href}-${index}`} href={resolveLegalHref(item.href)} className={styles.navLink}>
              {item.label}
            </a>
          ))}
        </nav>
        <h1 className={styles.h1}>{page.title}</h1>
        {page.meta.map((item, index) => (
          <p key={`${item.label}-${index}`} className={styles.p}>
            <Runs runs={item.runs} />
          </p>
        ))}
        {page.blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </div>
  );
}
