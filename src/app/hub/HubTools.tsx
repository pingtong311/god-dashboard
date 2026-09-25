'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HUB_SECTIONS,
  HUB_SHORTCUT_LIMIT,
  HUB_TOOLS,
  type HubTool,
} from '@/lib/hubTools';
import styles from './hub.module.css';

/**
 * /hub/「全部工具」頁的互動內容（client island）。
 *
 * 靜態結構逐字照抄 captured/login-capture/html/hub.html 的 `<main>`：
 *
 *   <div class="page-enter">
 *     <div class="mx-auto max-w-4xl pb-10">
 *       <h1>全部工具</h1>
 *       <p>一頁看完全站功能。<b>長按卡片（或按星星）加入捷徑</b>， 右上抽屜隨時叫得出來。</p>
 *       <section> 我的捷徑（0/8）… </section>
 *       <section> 今天  ×9 </section>
 *       <section> 股票  ×6 </section>
 *       <section> 選股  ×13 </section>
 *       <section> 我的  ×8 </section>
 *       <section> 教學  ×7 </section>
 *       <section> 更多  ×1 </section>
 *
 * 互動：每張卡片右上角的星星鈕切換「我的捷徑」（上限 8），存於 localStorage。
 * SSR 首屏固定呈現空狀態（與實站未設定捷徑時一致），mount 後才讀取本地記錄，
 * 避免 SSR/CSR 不一致（與 Navigation/BottomTabBar 同模式的 hydration 安全策略）。
 */

/** 捷徑儲存鍵。實站用 bs-preferences-v1 學顯示偏好；捷徑獨立存放。 */
const SHORTCUT_KEY = 'bs-hub-shortcuts';

/** Phosphor Star（17px）——實站卡片右上「加入捷徑」鈕的圖示，d 值逐字取自 hub.html。 */
const STAR_PATH =
  'M243,96a20.33,20.33,0,0,0-17.74-14l-56.59-4.57L146.83,24.62a20.36,20.36,0,0,0-37.66,0L87.35,77.44,30.76,82A20.45,20.45,0,0,0,19.1,117.88l43.18,37.24-13.2,55.7A20.37,20.37,0,0,0,79.57,233L128,203.19,176.43,233a20.39,20.39,0,0,0,30.49-22.15l-13.2-55.7,43.18-37.24A20.43,20.43,0,0,0,243,96ZM172.53,141.7a12,12,0,0,0-3.84,11.86L181.58,208l-47.29-29.08a12,12,0,0,0-12.58,0L74.42,208l12.89-54.4a12,12,0,0,0-3.84-11.86L41.2,105.24l55.4-4.47a12,12,0,0,0,10.13-7.38L128,41.89l21.27,51.5a12,12,0,0,0,10.13,7.38l55.4,4.47Z';

/** Phosphor X（13px）——捷徑 chip 的移除鈕。 */
const X_PATH =
  'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z';

/** 依 href 查工具標題（捷徑 chip 顯示用）。 */
function titleOf(href: string): string {
  return HUB_TOOLS.find((tool) => tool.href === href)?.title ?? href;
}

export default function HubTools() {
  /** 已加入捷徑的 href 清單（順序即加入順序）。 */
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  /** mount 後才讀 localStorage，確保首屏 SSR 與 client 首次 render 一致。 */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(SHORTCUT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setShortcuts(
            parsed.filter((item): item is string => typeof item === 'string').slice(0, HUB_SHORTCUT_LIMIT),
          );
        }
      }
    } catch {
      /* localStorage 不可用或內容毀損時忽略，維持空捷徑。 */
    }
  }, []);

  /** 切換某工具的捷徑狀態並持久化。 */
  const toggleShortcut = useCallback((href: string) => {
    setShortcuts((prev) => {
      const next = prev.includes(href) ? prev.filter((item) => item !== href) : [...prev, href].slice(0, HUB_SHORTCUT_LIMIT);
      try {
        localStorage.setItem(SHORTCUT_KEY, JSON.stringify(next));
      } catch {
        /* localStorage 不可用時只改本次 session。 */
      }
      return next;
    });
  }, []);

  const count = shortcuts.length;

  return (
    <div className={styles.enter}>
      <div className="mx-auto max-w-4xl pb-10">
        <h1 className="text-2xl font-black md:text-3xl">全部工具</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          一頁看完全站功能。<b className="text-ink">長按卡片（或按星星）加入捷徑</b>， 右上抽屜隨時叫得出來。
        </p>

        <section className="mt-4 rounded-2xl border border-[color:var(--gold-line,rgba(197,160,89,0.35))] bg-surface px-4 py-3.5">
          <p className="text-[12.5px] font-black text-accent">
            我的捷徑（{count}/{HUB_SHORTCUT_LIMIT}）
          </p>
          {count === 0 ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              還沒有捷徑。長按下面任何一張卡片就能加入。
            </p>
          ) : (
            <div className={`${styles.chips} mt-1.5`}>
              {shortcuts.map((href) => (
                <span key={href} className={styles.chip}>
                  <Link href={href} className="min-w-0 truncate">
                    {titleOf(href)}
                  </Link>
                  <button
                    type="button"
                    aria-label={`移除捷徑 ${titleOf(href)}`}
                    onClick={() => toggleShortcut(href)}
                    className={styles.chipRemove}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      fill="currentColor"
                      viewBox="0 0 256 256"
                      aria-hidden="true"
                    >
                      <path d={X_PATH} />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {HUB_SECTIONS.map((section) => (
          <section key={section.heading} className="mt-6">
            <h2 className="text-[15px] font-black text-ink">{section.heading}</h2>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {section.tools.map((tool: HubTool) => {
                const active = mounted && shortcuts.includes(tool.href);
                return (
                  <div key={tool.href} className="relative">
                    <Link
                      draggable={false}
                      href={tool.href}
                      className="flex min-h-[5.4rem] select-none flex-col rounded-2xl border border-line bg-surface px-3 py-2.5 pr-9 transition active:scale-[0.98]"
                    >
                      <span className="text-[13px] font-black leading-snug text-ink">{tool.title}</span>
                      <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted">{tool.desc}</span>
                    </Link>
                    <button
                      type="button"
                      aria-label="加入捷徑"
                      aria-pressed={active}
                      onClick={() => toggleShortcut(tool.href)}
                      className={`absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-xl transition active:scale-90 ${
                        active ? 'text-accent' : 'text-muted/60 hover:text-ink'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        fill="currentColor"
                        viewBox="0 0 256 256"
                      >
                        <path d={STAR_PATH} />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
