This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 環境變數

複製或編輯專案根目錄的 `.env.local`（此檔已被 `.gitignore` 的 `.env*` 規則排除，不會進版本控制）：

```bash
# NVIDIA NIM（AI 問答 /ai 使用）
NVIDIA_NIM_API_KEY=你的_NVIDIA_NIM_金鑰
```

| 變數 | 用途 | 必要性 |
|------|------|--------|
| `NVIDIA_NIM_API_KEY` | `/api/skynet/ai-chat` 代理至 NVIDIA NIM 的 API 金鑰 | AI 問答功能必要 |

取得方式：登入 [NVIDIA NIM](https://build.nvidia.com/) 後於帳號頁面產生 API Key（`nvapi-...`）。

設定後：

- 本機開發：`npm run dev`，開啟 `/ai` 即可使用「AI 問答」分頁。
- Cloudflare Workers 部署：`npx wrangler secret put NVIDIA_NIM_API_KEY`，或在 Cloudflare Dashboard 的 Worker 設定中加入同名環境變數。
- 若未設定，`/api/skynet/ai-chat` 會回傳 `503 { error: "missing_api_key" }`，前端會顯示明確提示，不會崩潰。

> 安全性：金鑰僅在伺服器端（Route Handler）讀取，不會出現在任何前端 bundle 中，也不會寫入可被 commit 的檔案。

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
