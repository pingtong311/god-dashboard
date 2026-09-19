/**
 * 教學專欄文章內容渲染器（/learn/[slug]）
 * ----------------------------------------------------------------------------
 * 同步、無狀態、無 'use client' → 由 Server Component（page.tsx）直接渲染，
 * 因此 3.8 MiB 的 learn-articles.json 不會進入瀏覽器 bundle。
 *
 * 內容以 learn-articles.json 為權威；版面逐項對照博主原始 HTML
 * （extracted/site/learn/<slug>.html）：
 *   seo-meta（分類膠囊 + 閱讀時間）→ h1 → 本文目錄 → 內文
 *   內文：hd-intro → hd-viz 圖卡 → 「本文重點」→ 各章節（h2 + blocks）
 *   block：p / list（num / check）/ table / figure / faq
 *   章節收尾：hd-faq（FAQ）/ hd-sum（總結）/ hd-more（延伸閱讀）
 *
 * 站內連結一律經 resolveLearnHref() 轉換；`#` 頁內錨點原樣保留。
 */

import { Fragment } from 'react';
import Link from 'next/link';
import {
  resolveLearnHref,
  formatReadMinutes,
  type InlineSegment,
  type LearnArticle,
  type LearnBlock,
} from '@/lib/learn';
import styles from './LearnArticle.module.css';

/** 渲染行內片段：純文字或站內連結（href 經轉換）。 */
function Segments({ segs }: { segs: InlineSegment[] }) {
  return (
    <>
      {segs.map((seg, index) => {
        const key = `${index}-${seg.t.slice(0, 8)}`;
        return seg.href ? (
          <Link key={key} href={resolveLearnHref(seg.href)} className={styles.link}>
            {seg.t}
          </Link>
        ) : (
          <Fragment key={key}>{seg.t}</Fragment>
        );
      })}
    </>
  );
}

/** 單一 block 渲染。 */
function Block({ block }: { block: LearnBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p className={styles.p}>
          {block.segments ? <Segments segs={block.segments} /> : block.text}
        </p>
      );

    case 'list': {
      const listClassName = block.variant === 'check' ? styles.listCheck : styles.list;
      const items = block.items.map((item, index) => (
        <li key={index}>
          {block.itemSegments?.[index] ? <Segments segs={block.itemSegments[index]} /> : item}
        </li>
      ));
      return block.ordered ? (
        <ol className={styles.listNum}>{items}</ol>
      ) : (
        <ul className={listClassName}>{items}</ul>
      );
    }

    case 'table':
      return (
        <div className={styles.tblScroll}>
          <table className={styles.tbl}>
            {block.head.length > 0 ? (
              <thead>
                <tr>
                  {block.head.map((cell, index) => (
                    <th key={index}>{cell}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'figure':
      return (
        <figure className={styles.fig}>
          {block.frame ? <div className={styles.figFrame}>{block.frame}</div> : null}
          {block.caption ? <figcaption className={styles.figCap}>{block.caption}</figcaption> : null}
        </figure>
      );

    case 'faq':
      return (
        <div className={styles.faq}>
          {block.items.map((item, index) => (
            <details key={index} className={styles.faqItem}>
              <summary>{item.q}</summary>
              <p className={styles.faqA}>
                {item.aSegments ? <Segments segs={item.aSegments} /> : item.a}
              </p>
            </details>
          ))}
        </div>
      );

    default:
      return null;
  }
}

export default function LearnArticle({ article }: { article: LearnArticle }) {
  const {
    title,
    category,
    categoryKey,
    readMinutes,
    intro,
    introSegments,
    figures,
    highlights,
    highlightSegments,
    sections,
    related,
  } = article;

  const readLabel = formatReadMinutes(readMinutes);

  return (
    <div className={styles.wrap}>
      <article className={styles.article}>
        <p className={styles.meta}>
          <Link className={styles.cat} href={`/learn?c=${encodeURIComponent(categoryKey)}`}>
            {category}
          </Link>
          {readLabel ? <span className={styles.read}>{readLabel}</span> : null}
        </p>

        <h1 className={styles.title}>{title}</h1>

        {sections.length >= 3 ? (
          <details className={styles.toc}>
            <summary className={styles.tocSummary}>本文目錄</summary>
            <ol className={styles.tocList}>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <div className={styles.body}>
          {intro ? (
            <p className={styles.intro}>
              {introSegments ? <Segments segs={introSegments} /> : intro}
            </p>
          ) : null}

          {figures.map((figure, index) => (
            <Block key={`figure-${index}`} block={{ type: 'figure', ...figure }} />
          ))}

          {highlights.length > 0 ? (
            <div className={styles.tldr}>
              <b className={styles.tldrTitle}>本文重點</b>
              <ul className={styles.tldrList}>
                {highlights.map((item, index) => (
                  <li key={index}>
                    {highlightSegments?.[index] ? (
                      <Segments segs={highlightSegments[index]} />
                    ) : (
                      item
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2 className={styles.h2}>{section.heading}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </section>
          ))}

          {related.length > 0 ? (
            <div className={styles.related}>
              <p className={styles.relatedTitle}>相關文章</p>
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={resolveLearnHref(`/learn/${item.slug}/`)}
                  className={styles.relatedLink}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}
