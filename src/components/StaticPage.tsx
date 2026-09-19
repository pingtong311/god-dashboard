import Link from 'next/link';
import type { Metadata } from 'next';
import {
  buildAnchorMap,
  isExternalHref,
  resolveStaticHref,
  type StaticBlock,
  type StaticCta,
  type StaticNavItem,
  type StaticPageData,
  type StaticSection,
} from '@/lib/staticPages';
import styles from './StaticPage.module.css';

/**
 * StaticPage — 8 個靜態單頁的共用渲染器（Server Component）。
 * ----------------------------------------------------------------------------
 * 版面逐項對照博主原始 HTML（guide/manual/about/pricing/methodology/legal/
 * login/app）。內容 100% 來自 src/data/static-pages.json，不自行改寫文案。
 *
 * 為什麼維持 Server Component：
 *   所有 block（含 details）都能以純標籤渲染（details 用原生 <details>），
 *   不需要 useState/useEffect，故不需要 'use client'，可維持 SSR。
 *
 * hero 有三種版面（依博主原始 HTML 觀察）：
 *   - hud      ：hero-hud 面板（guide/manual/legal/app/pricing）
 *   - centered ：置中 + logo（about/login）
 *   - plain    ：僅 h1 + 說明（methodology）
 * 因 JSON 未帶版面資訊，故以 slug 對照表決定（見 HERO_CONFIG）。
 */
interface HeroConfig {
  layout: 'hud' | 'centered' | 'plain';
  /** 是否顯示 /brand/tradeboss-logo.png（about/login）。 */
  logo?: boolean;
  /** eyebrow 是否用膠囊樣式（博主 legal 用膠囊、guide/manual 用純文字）。 */
  eyebrowPill?: boolean;
  /**
   * pricing 的 JSON 把原本位於 h1「上方」的 eyebrow「收費說明」放進了 lead，
   * 故此頁把 lead 上移為 eyebrow 渲染，以貼近原版面。
   */
  leadAsEyebrow?: boolean;
}

const HERO_CONFIG: Record<string, HeroConfig> = {
  guide: { layout: 'hud' },
  manual: { layout: 'hud' },
  legal: { layout: 'hud', eyebrowPill: true },
  app: { layout: 'hud' },
  pricing: { layout: 'hud', leadAsEyebrow: true },
  about: { layout: 'centered', logo: true },
  login: { layout: 'centered', logo: true },
  methodology: { layout: 'plain' },
};

const LOGO_SRC = '/brand/tradeboss-logo.png';

/** 外部連結一律另開新視窗（對應博主 target="_blank" rel="noopener noreferrer"）。 */
function externalProps(href: string) {
  return isExternalHref(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

/** 拆分有序清單項目的前綴編號（JSON 內為 "1準備…" 形式）。 */
function splitOrderedItem(item: string, index: number): { num: string; text: string } {
  const match = /^(\d+)\s*([\s\S]*)$/.exec(item);
  if (match && match[2].trim().length > 0) {
    return { num: match[1], text: match[2] };
  }
  return { num: String(index + 1), text: item };
}

/** CTA 按鈕（hero 用 primary/secondary；卡片用 accent-soft）。 */
function CtaLink({
  cta,
  className,
}: {
  cta: StaticCta;
  className: string;
}) {
  return (
    <Link href={resolveStaticHref(cta.href)} className={className} {...externalProps(cta.href)}>
      {cta.label}
    </Link>
  );
}

/** 頂部「相關功能切換」膠囊列。 */
function TopNav({ items }: { items: StaticNavItem[] }) {
  return (
    <nav aria-label="相關功能切換" className={styles.subNav}>
      <div className={styles.subNavTrack}>
        {items.map((item, index) => (
          <Link
            key={`${item.href}-${index}`}
            href={resolveStaticHref(item.href)}
            className={`${styles.pill} ${item.active ? styles.pillActive : ''}`}
            aria-current={item.active ? 'page' : undefined}
            {...externalProps(item.href)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** 章節索引膠囊（#anchor，原樣保留、不轉換）。 */
function HeroNav({ items }: { items: StaticNavItem[] }) {
  return (
    <nav className={styles.heroNav}>
      {items.map((item, index) => (
        <Link key={`${item.href}-${index}`} href={item.href} className={styles.heroNavLink}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** hero-hud 版面。 */
function HudHero({
  page,
  config,
  nav,
}: {
  page: StaticPageData;
  config: HeroConfig;
  nav: StaticNavItem[];
}) {
  // pricing：lead 其實是 eyebrow，上移渲染。
  const eyebrow = config.leadAsEyebrow ? page.lead : page.eyebrow;
  const lead = config.leadAsEyebrow ? '' : page.lead;

  return (
    <section className={styles.hero}>
      {eyebrow ? (
        config.eyebrowPill ? (
          <p className={styles.heroEyebrowPill}>{eyebrow}</p>
        ) : (
          <p className={styles.heroEyebrow}>{eyebrow}</p>
        )
      ) : null}
      <h1 className={styles.heroTitle}>{page.title}</h1>
      {lead ? <p className={styles.heroLead}>{lead}</p> : null}
      {page.heroCtas.length > 0 ? (
        <div className={styles.heroCtas}>
          {page.heroCtas.map((cta, index) => (
            <CtaLink
              key={`${cta.href}-${index}`}
              cta={cta}
              className={cta.variant === 'secondary' ? styles.ctaSecondary : styles.ctaPrimary}
            />
          ))}
        </div>
      ) : null}
      {nav.length > 0 ? <HeroNav items={nav} /> : null}
    </section>
  );
}

/** 置中 hero（logo + h1 + 金色副標）。 */
function CenteredHero({ page, config }: { page: StaticPageData; config: HeroConfig }) {
  return (
    <section className={styles.heroCentered}>
      <div className={styles.heroCenteredInner}>
        {config.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={LOGO_SRC} alt="股市大佬 TradeBoss" className={styles.logo} />
        ) : null}
        <h1 className={styles.heroTitleCentered}>{page.title}</h1>
        {page.lead ? <p className={styles.heroLeadAccent}>{page.lead}</p> : null}
      </div>
    </section>
  );
}

/** 素面 hero（僅 h1 + 說明）。 */
function PlainHero({ page }: { page: StaticPageData }) {
  return (
    <section className={styles.heroPlain}>
      <h1 className={styles.heroPlainTitle}>{page.title}</h1>
      {page.lead ? <p className={styles.heroLead}>{page.lead}</p> : null}
    </section>
  );
}

/** 卡片 / 文章面板。 */
function PanelView({ block }: { block: Extract<StaticBlock, { type: 'card' | 'article' }> }) {
  const isArticle = block.type === 'article';
  const hasEyebrow = Boolean(block.eyebrow);
  const hasTitle = Boolean(block.title);
  const hasBody = Boolean(block.body);
  const hasItems = Boolean(block.items && block.items.length > 0);
  const hasCta = Boolean(block.cta);

  // 博主部分卡片帶金色左緣（border-l-2 border-l-accent）。
  // JSON 未帶此旗標，故以「有 eyebrow 的卡片」近似（= guide 三步卡）。
  const accent = !isArticle && hasEyebrow;

  const className = isArticle
    ? styles.article
    : `${styles.card} ${accent ? styles.cardAccent : ''}`.trim();

  return (
    <div className={className}>
      {hasEyebrow ? <p className={styles.cardEyebrow}>{block.eyebrow}</p> : null}
      {hasTitle ? <p className={styles.cardTitle}>{block.title}</p> : null}
      {hasBody ? <p className={styles.cardBody}>{block.body}</p> : null}
      {hasCta && block.cta ? (
        <CtaLink cta={block.cta} className={styles.cardCta} />
      ) : null}
      {hasItems && block.items ? (
        <ul className={styles.cardItems}>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 單一 block 渲染。 */
function BlockView({ block }: { block: StaticBlock }) {
  switch (block.type) {
    case 'card':
    case 'article':
      return <PanelView block={block} />;

    case 'p': {
      const className =
        block.role === 'eyebrow'
          ? styles.pEyebrow
          : block.role === 'title'
            ? styles.pTitle
            : styles.pBody;
      return <p className={className}>{block.text}</p>;
    }

    case 'list': {
      if (block.ordered) {
        return (
          <ol className={styles.listOrdered}>
            {block.items.map((item, index) => {
              const { num, text } = splitOrderedItem(item, index);
              return (
                <li key={index} className={styles.listItem}>
                  <span className={styles.numBadge}>{num}</span>
                  <span className={styles.listText}>{text}</span>
                </li>
              );
            })}
          </ol>
        );
      }
      return (
        <ul className={styles.listPlain}>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    case 'link':
      return (
        <Link
          href={resolveStaticHref(block.href)}
          className={styles.link}
          {...externalProps(block.href)}
        >
          {block.label}
          {block.desc ? <span className={styles.linkDesc}>{block.desc}</span> : null}
        </Link>
      );

    case 'h3':
      return <h3 className={styles.h3}>{block.text}</h3>;

    case 'details':
      return (
        <details className={styles.details}>
          <summary className={styles.summary}>{block.summary}</summary>
          <div className={styles.detailsBody}>
            {block.blocks.map((child, index) => (
              <BlockView key={index} block={child} />
            ))}
          </div>
        </details>
      );

    default:
      return null;
  }
}

/** 單一章節（heading 為空字串時不渲染標題列，對應博主 pricing / legal 首段）。 */
function SectionView({ section, anchor }: { section: StaticSection; anchor?: string }) {
  return (
    <section id={anchor} className={styles.section}>
      {section.heading ? (
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeaderLeft}>
              <span aria-hidden="true" className={styles.sectionMark} />
              <h2 className={styles.sectionHeading}>{section.heading}</h2>
            </div>
          </div>
        </div>
      ) : null}
      <div className={styles.sectionBody}>
        {section.blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </section>
  );
}

/** 主元件。 */
export default function StaticPage({ page }: { page: StaticPageData }) {
  const config: HeroConfig = HERO_CONFIG[page.slug] ?? { layout: 'hud' };

  // 頂部頁面層級切換：僅在「非純 #anchor」時渲染（legal 的 subNav 等同 sectionNav，避免重複）。
  const subNavIsAnchorsOnly =
    page.subNav.length > 0 && page.subNav.every((item) => item.href.startsWith('#'));
  const showSubNav = page.subNav.length > 0 && !subNavIsAnchorsOnly;

  // 章節索引膠囊：優先用 sectionNav；若無則沿用「純 #anchor 的 subNav」。
  const heroNav =
    page.sectionNav.length > 0 ? page.sectionNav : subNavIsAnchorsOnly ? page.subNav : [];

  const anchors = buildAnchorMap(page);

  return (
    <div className={styles.page}>
      {showSubNav ? <TopNav items={page.subNav} /> : null}
      <div className={styles.enter}>
        {config.layout === 'hud' ? (
          <HudHero page={page} config={config} nav={heroNav} />
        ) : config.layout === 'centered' ? (
          <CenteredHero page={page} config={config} />
        ) : (
          <PlainHero page={page} />
        )}
        {page.sections.map((section, index) => (
          <SectionView key={index} section={section} anchor={anchors[index]} />
        ))}
      </div>
    </div>
  );
}

/** 供路由檔產生 metadata。 */
export function buildStaticPageMetadata(page: StaticPageData): Metadata {
  return {
    title: `${page.title} | 股市大佬 TradeBoss`,
    description: page.lead,
  };
}
