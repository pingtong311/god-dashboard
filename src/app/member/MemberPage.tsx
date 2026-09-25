'use client';

/**
 * 大佬席位頁（會員帳號中心）內容元件。
 *
 * 逐字照抄 captured/login-capture/html/member.html 的 `<main>` 內容：
 * 位置、文案、顏色、className、圖示、屬性順序、全形／半形標點與空白都對齊。
 * （簡體字照抄不轉繁；capture 全文為繁體。）
 *
 * 登入狀態以 `useIsLoggedIn` 讀取（client-only，初始 false，mount 後才讀 localStorage），
 * 故 SSR 與首屏固定呈現「未登入」貌，避免 hydration 不一致。
 *
 * 資料誠實：`src/app/api/skynet/` 查無會員資料 API，故帳號資料（暱稱、Email、
 * 推薦碼、新手任務進度、加入時間……）**不造假**——未登入時顯示空狀態、
 * 已登入時顯示 capture 風格的載入骨架；靜態導覽與說明區塊照原樣渲染。
 */
import Link from 'next/link';
import { useIsLoggedIn } from '@/lib/authState';
import DataCaveatDetails from '@/components/DataCaveatDetails';

/* ── Phosphor 圖示：d 值逐字取自 member.html ─────────────────────────── */

/** 齒輪（20px）——右上「設定」連結。 */
const GEAR_PATH =
  'M128,76a52,52,0,1,0,52,52A52.06,52.06,0,0,0,128,76Zm0,80a28,28,0,1,1,28-28A28,28,0,0,1,128,156Zm113.86-49.57A12,12,0,0,0,236,98.34L208.21,82.49l-.11-31.31a12,12,0,0,0-4.25-9.12,116,116,0,0,0-38-21.41,12,12,0,0,0-9.68.89L128,37.27,99.83,21.53a12,12,0,0,0-9.7-.9,116.06,116.06,0,0,0-38,21.47,12,12,0,0,0-4.24,9.1l-.14,31.34L20,98.35a12,12,0,0,0-5.85,8.11,110.7,110.7,0,0,0,0,43.11A12,12,0,0,0,20,157.66l27.82,15.85.11,31.31a12,12,0,0,0,4.25,9.12,116,116,0,0,0,38,21.41,12,12,0,0,0,9.68-.89L128,218.73l28.14,15.74a12,12,0,0,0,9.7.9,116.06,116.06,0,0,0,38-21.47,12,12,0,0,0,4.24-9.1l.14-31.34,27.81-15.81a12,12,0,0,0,5.85-8.11A110.7,110.7,0,0,0,241.86,106.43Zm-22.63,33.18-26.88,15.28a11.94,11.94,0,0,0-4.55,4.59c-.54,1-1.11,1.93-1.7,2.88a12,12,0,0,0-1.83,6.31L184.13,199a91.83,91.83,0,0,1-21.07,11.87l-27.15-15.19a12,12,0,0,0-5.86-1.53h-.29c-1.14,0-2.3,0-3.44,0a12.08,12.08,0,0,0-6.14,1.51L93,210.82A92.27,92.27,0,0,1,71.88,199l-.11-30.24a12,12,0,0,0-1.83-6.32c-.58-.94-1.16-1.91-1.7-2.88A11.92,11.92,0,0,0,63.7,155L36.8,139.63a86.53,86.53,0,0,1,0-23.24l26.88-15.28a12,12,0,0,0,4.55-4.58c.54-1,1.11-1.94,1.7-2.89a12,12,0,0,0,1.83-6.31L71.87,57A91.83,91.83,0,0,1,92.94,45.17l27.15,15.19a11.92,11.92,0,0,0,6.15,1.52c1.14,0,2.3,0,3.44,0a12.08,12.08,0,0,0,6.14-1.51L163,45.18A92.27,92.27,0,0,1,184.12,57l.11,30.24a12,12,0,0,0,1.83,6.32c.58.94,1.16,1.91,1.7,2.88A11.92,11.92,0,0,0,192.3,101l26.9,15.33A86.53,86.53,0,0,1,219.23,139.61Z';

/** ChatTeardropText（18px）——AI 對話。 */
const CHAT_PATH =
  'M172,108a12,12,0,0,1-12,12H96a12,12,0,0,1,0-24h64A12,12,0,0,1,172,108Zm-12,28H96a12,12,0,0,0,0,24h64a12,12,0,0,0,0-24Zm76-8A108,108,0,0,1,78.77,224.15L46.34,235A20,20,0,0,1,21,209.66l10.81-32.43A108,108,0,1,1,236,128Zm-24,0A84,84,0,1,0,55.27,170.06a12,12,0,0,1,1,9.81l-9.93,29.79,29.79-9.93a12.1,12.1,0,0,1,3.8-.62,12,12,0,0,1,6,1.62A84,84,0,0,0,212,128Z';

/** ArchiveTray（18px）——通知中心。 */
const ARCHIVE_PATH =
  'M208,28H48A20,20,0,0,0,28,48V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V48A20,20,0,0,0,208,28Zm-4,24v92H179.31a19.86,19.86,0,0,0-14.14,5.86L147,168H109L90.83,149.86A19.86,19.86,0,0,0,76.69,144H52V52ZM52,204V168H75l18.14,18.14A19.86,19.86,0,0,0,107.31,192h41.38a19.86,19.86,0,0,0,14.14-5.86L181,168h23v36Z';

/** Star（18px）——自選股。 */
const STAR_PATH =
  'M243,96a20.33,20.33,0,0,0-17.74-14l-56.59-4.57L146.83,24.62a20.36,20.36,0,0,0-37.66,0L87.35,77.44,30.76,82A20.45,20.45,0,0,0,19.1,117.88l43.18,37.24-13.2,55.7A20.37,20.37,0,0,0,79.57,233L128,203.19,176.43,233a20.39,20.39,0,0,0,30.49-22.15l-13.2-55.7,43.18-37.24A20.43,20.43,0,0,0,243,96ZM172.53,141.7a12,12,0,0,0-3.84,11.86L181.58,208l-47.29-29.08a12,12,0,0,0-12.58,0L74.42,208l12.89-54.4a12,12,0,0,0-3.84-11.86L41.2,105.24l55.4-4.47a12,12,0,0,0,10.13-7.38L128,41.89l21.27,51.5a12,12,0,0,0,10.13,7.38l55.4,4.47Z';

/** Wallet（18px）——我的持股。 */
const WALLET_PATH =
  'M196,136a16,16,0,1,1-16-16A16,16,0,0,1,196,136Zm40-36v80a32,32,0,0,1-32,32H60a32,32,0,0,1-32-32V60.92A32,32,0,0,1,60,28H192a12,12,0,0,1,0,24H60a8,8,0,0,0-8,8.26v.08A8.32,8.32,0,0,0,60.48,68H204A32,32,0,0,1,236,100Zm-24,0a8,8,0,0,0-8-8H60.48A33.72,33.72,0,0,1,52,90.92V180a8,8,0,0,0,8,8H204a8,8,0,0,0,8-8Z';

/** Bell（18px）——我的警報。 */
const BELL_PATH =
  'M225.81,74.65A11.86,11.86,0,0,1,220.3,76a12,12,0,0,1-10.67-6.47,90.1,90.1,0,0,0-32-35.38,12,12,0,1,1,12.8-20.29,115.25,115.25,0,0,1,40.54,44.62A12,12,0,0,1,225.81,74.65ZM46.37,69.53a90.1,90.1,0,0,1,32-35.38A12,12,0,1,0,65.6,13.86,115.25,115.25,0,0,0,25.06,58.48a12,12,0,0,0,5.13,16.17A11.86,11.86,0,0,0,35.7,76,12,12,0,0,0,46.37,69.53Zm173.51,98.35A20,20,0,0,1,204,200H171.81a44,44,0,0,1-87.62,0H52a20,20,0,0,1-15.91-32.12c7.17-9.33,15.73-26.62,15.88-55.94A76,76,0,0,1,204,112C204.15,141.26,212.71,158.55,219.88,167.88ZM147.6,200H108.4a20,20,0,0,0,39.2,0Zm48.74-24c-8.16-13-16.19-33.57-16.34-63.94A52,52,0,1,0,76,112c-.15,30.42-8.18,51-16.34,64Z';

/** BellRinging（18px）——推播主題與暫停提醒。 */
const BELL_RINGING_PATH =
  'M225.29,165.93C216.61,151,212,129.57,212,104a84,84,0,0,0-168,0c0,25.58-4.59,47-13.27,61.93A20.08,20.08,0,0,0,30.66,186,19.77,19.77,0,0,0,48,196H84.18a44,44,0,0,0,87.64,0H208a19.77,19.77,0,0,0,17.31-10A20.08,20.08,0,0,0,225.29,165.93ZM128,212a20,20,0,0,1-19.6-16h39.2A20,20,0,0,1,128,212ZM54.66,172C63.51,154,68,131.14,68,104a60,60,0,0,1,120,0c0,27.13,4.48,50,13.33,68Z';

/** BookOpenText（18px）——台股學堂。 */
const BOOK_PATH =
  'M235.57,193.73,202.38,35.93a20,20,0,0,0-23.76-15.48L131.81,30.51a19.82,19.82,0,0,0-11,6.65A20,20,0,0,0,104,28H56A20,20,0,0,0,36,48V208a20,20,0,0,0,20,20h48a20,20,0,0,0,20-20V90.25l25.62,121.82A20,20,0,0,0,169.15,228a20.27,20.27,0,0,0,4.23-.45l46.81-10.06A20.1,20.1,0,0,0,235.57,193.73ZM148.19,88.65l39-8.38,2.53,12-39,8.38Zm7.46,35.5,39-8.38,9.16,43.58-39,8.38Zm24.06-79.39,2.53,12-39,8.38-2.53-12ZM60,88h40v80H60Zm40-36V64H60V52ZM60,204V192h40v12Zm112.29-.76-2.53-12,39-8.38,2.53,12Z';

/** ChatCircleDots（18px）——社群基地。 */
const CHAT_CIRCLE_PATH =
  'M216,76H188V48a20,20,0,0,0-20-20H40A20,20,0,0,0,20,48V176a12,12,0,0,0,19.54,9.33l28.46-23V184a20,20,0,0,0,20,20h92.17l36.29,29.33A12,12,0,0,0,236,224V96A20,20,0,0,0,216,76ZM44,150.87V52H164v80H71.58A12,12,0,0,0,64,134.67Zm168,48-20-16.2a12,12,0,0,0-7.54-2.67H92V156h76a20,20,0,0,0,20-20V100h24Z';

/** Apple logo（viewBox 0 0 24 24）——綁定 Apple 登入按鈕。 */
const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

/* ── 靜態導覽列：快捷功能／提醒管理／學習與社群（連結，無帳號資料） ──── */

type NavRow = {
  readonly href: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
};

/** 「快捷功能」四列（順序、文案、href 逐字對齊 capture）。 */
const QUICK_LINKS: readonly NavRow[] = [
  { href: '/ask/', title: 'AI 對話', subtitle: '用講話查籌碼與大盤數字', icon: CHAT_PATH },
  { href: '/notify/?inbox=1', title: '通知中心', subtitle: '推播全文與系統消息', icon: ARCHIVE_PATH },
  { href: '/watchlist/', title: '自選股', subtitle: '追蹤股票清單', icon: STAR_PATH },
  { href: '/portfolio/', title: '我的持股', subtitle: '成本、配置與大致損益', icon: WALLET_PATH },
];

/** 「提醒管理」二列。 */
const ALERT_LINKS: readonly NavRow[] = [
  { href: '/alerts/', title: '我的警報', subtitle: '到價、量比與法人條件提醒', icon: BELL_PATH },
  { href: '/notify/', title: '推播主題與暫停提醒', subtitle: '要收什麼、安靜多久', icon: BELL_RINGING_PATH },
];

/** 「學習與社群」二列。 */
const LEARN_LINKS: readonly NavRow[] = [
  { href: '/school/', title: '台股學堂', subtitle: '名詞白話與功能圖解', icon: BOOK_PATH },
  { href: '/community/', title: '社群基地', subtitle: '討論、聊天與戰績榜', icon: CHAT_CIRCLE_PATH },
];

/** 「記住偏好」標籤（未選擇態；選擇狀態存在會員帳號，無 API 來源故不預設選中）。 */
const PREF_TAGS: readonly string[] = ['當沖', '隔日沖', '波段', '存股/長線', '都看', '還在摸索'];

/** 列表列（圖示＋標題＋副標＋›）。 */
function ListRow({ href, title, subtitle, icon }: NavRow) {
  return (
    <Link className="flex w-full items-center gap-3 border-b border-line/60 px-3.5 py-3 text-left transition last:border-0 active:bg-surface-2" href={href}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-black text-ink">{title}</span>
        <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{subtitle}</span>
      </span>
      <span className="shrink-0 text-[12.5px] text-muted">›</span>
    </Link>
  );
}

/** 列表外框（圓角卡片＋分隔線）。 */
function ListCard({ rows }: { rows: readonly NavRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((row) => (
        <ListRow key={row.href} {...row} />
      ))}
    </div>
  );
}

/** 已登入：會員資料區尚無 API 來源——如實呈現 capture 風格的載入骨架（不造假）。 */
function ProfileSkeleton() {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5  min-w-0 max-w-full overflow-hidden">
      <div className="grid gap-3" role="status" aria-live="polite">
        <span className="sr-only">正在整理你的會員資料…</span>
        <div aria-hidden="true" className="animate-pulse rounded-xl bg-surface-2/70 h-16" />
        <div aria-hidden="true" className="animate-pulse rounded-xl bg-surface-2/70 h-16" />
        <p className="text-center text-sm text-muted">正在整理你的會員資料…</p>
      </div>
    </div>
  );
}

/** 未登入：誠實空狀態（不渲染任何帳號資料）。 */
function NotLoggedIn() {
  return (
    <div className="data-panel hud-panel glass rounded-2xl p-5  min-w-0 max-w-full overflow-hidden">
      <p className="text-[14.5px] font-bold text-ink">還沒登入</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">登入後查看你的帳戶、回饋、邀請碼與專屬設定。</p>
      <Link href="/login/" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-[13px] font-black text-bg transition active:scale-[0.97]">
        登入
      </Link>
    </div>
  );
}

/** 行內骨架（裝飾；帳號資料欄位無 API 來源時佔位）。 */
function Bar({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block animate-pulse rounded bg-surface-2/70 ${className}`} />;
}

export default function MemberPage() {
  const isLoggedIn = useIsLoggedIn();

  return (
    <div className="page-enter">
      <div className="min-w-0 w-full max-w-full">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-black md:text-3xl">大佬席位</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {isLoggedIn ? (
                <>
                  歡迎回來，
                  <Bar className="ml-1 h-3.5 w-12 align-middle" />
                  。
                </>
              ) : (
                '登入後查看你的帳戶、回饋與邀請碼。'
              )}
            </p>
          </div>
          <Link aria-label="設定" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-accent hover:text-accent active:scale-95" href="/settings/">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
              <path d={GEAR_PATH} />
            </svg>
          </Link>
        </div>
        <a className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/35 bg-accent/10 px-4 py-3.5" href="/community/">
          <span>
            <span className="block text-[14px] font-black text-ink">社群聊天</span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">跟其他會員討論、看戰績榜。功能在這裡比較好找。</span>
          </span>
          <span className="shrink-0 text-[12.5px] font-black text-accent">進去 →</span>
        </a>
        <div className="mt-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-black leading-tight transition bg-accent text-bg">
            我的檔案
          </button>
          <button type="button" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-black leading-tight transition bg-surface-2 text-muted">
            通知設定
          </button>
          <button type="button" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-black leading-tight transition bg-surface-2 text-muted">
            使用回饋
          </button>
          <button type="button" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-black leading-tight transition bg-surface-2 text-muted">
            對帳單
          </button>
        </div>
        <div className="mt-4 min-w-0">
          <div data-member-profile="true" className="grid grid-cols-1 min-w-0 w-full max-w-full gap-3 [&>*]:min-w-0 [overflow-wrap:anywhere]">
            {isLoggedIn ? <ProfileSkeleton /> : <NotLoggedIn />}

            <section className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="text-[12px] font-black tracking-wide text-muted">快捷功能</p>
                <a className="text-[12px] font-black text-accent" href="/hub/">
                  自訂入口
                </a>
              </div>
              <ListCard rows={QUICK_LINKS} />
            </section>

            <div>
              <p className="mb-1.5 px-1 text-[12px] font-black tracking-wide text-muted">提醒管理</p>
              <ListCard rows={ALERT_LINKS} />
            </div>

            <div>
              <p className="mb-1.5 px-1 text-[12px] font-black tracking-wide text-muted">學習與社群</p>
              <ListCard rows={LEARN_LINKS} />
            </div>

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  min-w-0 max-w-full overflow-hidden">
                <div>
                  <p className="text-[12.5px] font-bold text-muted">記住偏好（會排首頁格子）</p>
                  <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                    {PREF_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="min-h-10 shrink-0 rounded-xl border px-2.5 text-[12px] font-bold sm:min-h-11 sm:px-3 sm:text-[12.5px] border-line text-muted"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <button className="min-h-11 rounded-xl border border-line px-4 text-sm">AI 資料設定</button>
                </div>
                <p className="mt-3 rounded-xl bg-accent-soft p-3 text-[12.5px] leading-relaxed text-ink">
                  目前一般會員功能免費，沒有試用倒數，不需要購買外部訂閱。 AI 每日次數另有上限；內部研究工具不包含在一般會員服務內。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                  <Bar className="h-3.5 w-36" />
                  <button
                    type="button"
                    className="ml-auto min-h-11 rounded-xl border border-line px-4 text-[12.5px] font-bold text-muted transition hover:border-down hover:text-down active:scale-[0.98]"
                  >
                    登出
                  </button>
                </div>
              </div>
            ) : null}

            <div className="data-panel hud-panel glass rounded-2xl p-5  border-l-2 border-l-accent">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13.5px] font-black text-ink">安裝股市大佬 App</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                    iPhone 用公開 TestFlight，不需要邀請碼。Android 是直裝測試檔， 下載不了就用「加入主畫面」，資料一模一樣。
                  </p>
                </div>
                <a className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-accent px-4 font-black text-bg transition active:scale-[0.98]" href="/app/">
                  查看安裝方式
                </a>
              </div>
            </div>

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  ">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px] font-black text-ink">我的推薦碼</p>
                  <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-[12.5px] font-black text-accent">
                    <Bar className="h-3.5 w-24" />
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">朋友註冊時填這組碼，帳號就會<strong className="text-ink">自動啟用</strong>，身分為<strong className="text-ink">體驗用戶</strong>（不會因為你是海盜船就跟著變海盜船）。你的帳號為<strong className="text-ink">無限次使用</strong>，可一直分享同一組碼。 分享給朋友即可記錄邀請來源。</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="num rounded-xl border-2 border-accent/40 bg-accent-soft px-4 py-2 text-xl font-black tracking-widest text-accent">
                    <Bar className="h-5 w-28" />
                  </span>
                  <button className="min-h-11 rounded-xl border-2 border-line px-4 text-sm font-bold text-muted active:scale-95">
                    <span className="grid place-items-center ">
                      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
                        已複製 ✓
                      </span>
                      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
                        複製碼
                      </span>
                      <span className="col-start-1 row-start-1 whitespace-nowrap">複製碼</span>
                    </span>
                  </button>
                  <button className="min-h-11 rounded-xl bg-accent px-4 text-sm font-black text-bg active:scale-95">
                    複製邀請連結
                  </button>
                </div>
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  ">
                <p className="text-[13.5px] leading-relaxed text-muted">
                  <b className="text-ink">帳號</b>：
                  <Bar className="h-3.5 w-44" />
                  <br />
                  <b className="text-ink">狀態</b>：
                  <Bar className="ml-1 h-3.5 w-16" />
                </p>
                <div className="mt-3 rounded-xl border border-line bg-surface-2/60 p-3">
                  <p className="text-[12.5px] font-bold text-muted">Line 社群暱稱（聊天室／留言顯示用）</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      maxLength={40}
                      className="min-h-11 min-w-[12rem] flex-1 rounded-xl border-2 border-line bg-surface px-3 text-[13.5px] outline-none focus:border-accent"
                      placeholder="你的顯示名字"
                    />
                    <button type="button" className="min-h-11 rounded-xl bg-accent px-4 font-black text-bg disabled:opacity-50">
                      儲存暱稱
                    </button>
                  </div>
                </div>
                <a className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-accent/40 bg-accent-soft px-3 text-[12.5px] font-black text-accent active:scale-95" href="/school/">
                  名詞看不懂？打開台股學堂
                </a>
              </div>
            ) : null}

            <div className="data-panel hud-panel glass rounded-2xl p-5  ">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13.5px] font-black text-ink">研究條件通知</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">尚未設定。通知研究條件，不是進出建議。</p>
                </div>
                <a href="/alerts/" className="min-h-11 rounded-xl bg-accent px-4 text-[12.5px] font-black text-bg">
                  打開
                </a>
              </div>
            </div>

            <div className="data-panel hud-panel glass rounded-2xl p-5  ">
              <p className="text-[13.5px] font-black text-ink">加到手機主畫面</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">加完後可從桌面快速開站，但這仍是網站捷徑，不等同 App。 通知請使用股市大佬 App，並到「通知中心」選擇主題、允許手機通知。 iPhone 請用 Safari。</p>
              <button type="button" className="mt-3 min-h-11 rounded-xl bg-accent px-4 text-sm font-black text-bg active:scale-95">
                看 iPhone 安裝步驟
              </button>
            </div>

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  ">
                <p className="text-[13.5px] font-black text-ink">綁定 Apple／Google 登入</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  綁定後可以直接用手機上的 Apple 或 Google 帳號登入，不用再記密碼。 原本的 Email 密碼登入不受影響，兩種都能用。
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-bold">
                  <span className="text-muted">
                    Apple：
                    <Bar className="ml-1 h-3 w-16" />
                  </span>
                  <span className="text-accent">
                    Google：
                    <Bar className="ml-1 h-3 w-14" />
                  </span>
                </div>
                <div className="grid min-w-0 gap-2 overflow-hidden mt-3">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-[13.5px] font-bold transition active:scale-[0.99] bg-black text-white border-black"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor">
                      <path d={APPLE_PATH} />
                    </svg>
                    <span className="grid place-items-center ">
                      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
                        處理中…
                      </span>
                      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
                        使用 Apple 登入
                      </span>
                      <span className="col-start-1 row-start-1 whitespace-nowrap">使用 Apple 登入</span>
                    </span>
                  </button>
                  {/* Google 按鈕為實站嵌入的第三方 GSI iframe（id 與憑證每次造訪都不同，
                      屬於外部登入服務，無法也不應複刻）；以骨架佔位，不造假綁定狀態。 */}
                  <div className="flex min-h-11 w-full min-w-0 max-w-full justify-center overflow-hidden">
                    <Bar className="h-11 w-full max-w-full" />
                  </div>
                </div>
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  ">
                <p className="text-[13.5px] font-black text-ink">Passkey 快速登入（選用）</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">用手機指紋、Face ID 或電腦的裝置解鎖登入，不用再記密碼。 需要這台裝置先設好生物辨識（Windows Hello／Touch ID／指紋）， 沒設的話按了會直接跳掉。原本的 Email、Google 與 Apple 登入不受影響。</p>
                <div className="mt-3">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-line bg-surface-2 px-4 font-bold text-ink transition active:scale-[0.99] disabled:opacity-50"
                  >
                    新增 Passkey
                  </button>
                </div>
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="data-panel hud-panel glass rounded-2xl p-5  ">
                <p className="text-[13.5px] font-black text-ink">刪除帳號</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  永久刪除你的帳號與個人資料（自選股、到價提醒、練功房存檔、回饋、 對帳單、社群發言與 Telegram 訂閱），刪除後<b className="text-ink">無法復原</b>， 也無法用同一個 Email 找回舊資料。隱私與資料說明見<a href="/privacy.html" className="mx-1 font-bold text-accent" target="_blank" rel="noreferrer">隱私權政策</a>。
                </p>
                <button type="button" className="mt-3 min-h-11 rounded-xl border border-down/50 px-4 text-[12.5px] font-bold text-down">
                  我要刪除帳號
                </button>
              </div>
            ) : null}

            {isLoggedIn ? (
              <div className="pb-1 pt-2 text-center text-[11.5px] leading-relaxed text-muted/70">
                <p>
                  加入時間：
                  <Bar className="ml-1 h-3 w-28" />
                </p>
                <p>
                  最後登入：
                  <Bar className="ml-1 h-3 w-28" />
                </p>
              </div>
            ) : null}

            <DataCaveatDetails>
              <p>來源：本站行情管線（盤中）、交易所公開資料（盤後統計）</p>
              <p>時點：盤中為即時快照、法人／分點／資券為盤後</p>
              <p>標「估」的欄位是由已公布數字推算，不是交易所原欄。</p>
              <p>通知設定只存在會員帳號。</p>
              <p>以上是已發生的公開統計，不是進出建議。</p>
            </DataCaveatDetails>

            <div className="h-8 lg:hidden" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
