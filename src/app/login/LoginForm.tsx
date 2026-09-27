'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LOGIN_TOKEN_KEY } from '@/lib/authState';
import { LOGIN_REDIRECT_PATH, TEST_LOGIN_TOKEN, verifyCredentials } from './loginFlow';
import styles from './LoginForm.module.css';

/**
 * LoginForm — /login 的「可用測試登入」表單（client component）。
 * ----------------------------------------------------------------------------
 * 設計取捨（複刻忠實度 vs 可運行）：
 *   - 博主原始登入頁的表單是純客戶端渲染，SSR 只吐 hero（logo + h1 + 金色副標）。
 *     本元件**不修改 hero**，僅在 hero「之下」追加一個與該頁語彙一致的表單
 *     （深藍 #0a1128 底 + 古銅金 #c5a059 強調，皆取自 theme.css 的 CSS 變數）。
 *   - hydration 安全：不在 render 期間讀 localStorage；只有在「送出事件」
 *     （必定發生於 client）中才寫入 warroom_token，故 SSR 與 CSR 首屏一致。
 *
 * 帳密：admin / 1234（見 loginFlow.ts）。成功 → 寫入 warroom_token → 導向 /today/。
 * 失敗 → 顯示明確錯誤訊息（不洩漏正確帳密）。
 */

/** 表單狀態：僅追蹤輸入值與錯誤訊息，不觸及任何儲存體。 */
interface FormState {
  username: string;
  password: string;
  error: string;
}

const INITIAL_STATE: FormState = { username: '', password: '', error: '' };

export default function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);

  /** 更新單一欄位並清除先前的錯誤訊息。 */
  function handleChange(field: 'username' | 'password') {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value, error: '' }));
    };
  }

  /** 送出：驗證帳密 → 寫入 token → 導向；失敗則顯示錯誤。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!verifyCredentials(form.username, form.password)) {
      setForm((prev) => ({ ...prev, error: '帳號或密碼錯誤，請確認後再試。' }));
      return;
    }

    try {
      window.localStorage.setItem(LOGIN_TOKEN_KEY, TEST_LOGIN_TOKEN);
    } catch {
      // localStorage 不可用（隱私模式、被停用）時明確告知，不誤導為登入成功。
      setForm((prev) => ({ ...prev, error: '目前無法儲存登入狀態，請確認瀏覽器設定。' }));
      return;
    }

    router.push(LOGIN_REDIRECT_PATH);
  }

  return (
    <section className={styles.wrap} aria-label="會員登入">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>帳號</span>
          <input
            className={styles.input}
            type="text"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={handleChange('username')}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>密碼</span>
          <input
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange('password')}
          />
        </label>

        {form.error ? (
          <p className={styles.error} role="alert">
            {form.error}
          </p>
        ) : null}

        <button className={styles.submit} type="submit">
          登入
        </button>
      </form>
    </section>
  );
}
