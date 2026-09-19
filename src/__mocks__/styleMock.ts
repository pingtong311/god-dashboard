/**
 * CSS / CSS Module 在 Jest 下的替身。
 * ----------------------------------------------------------------------------
 * 元件測試不需要真實樣式，只需讓 `import styles from '*.module.css'` 可解析。
 * 以 Proxy 讓 `styles.anyKey` 回傳 `'anyKey'`，方便測試以 class 名稱定位元素。
 */
const handler: ProxyHandler<Record<string, string>> = {
  get: (_target, key: string) => key,
};

export default new Proxy({} as Record<string, string>, handler);
