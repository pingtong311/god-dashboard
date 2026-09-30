#!/usr/bin/env bash
#
# Plan A 部署腳本（Edge 預算化 · 峰子 App）
# 用途：將離線預算結果寫入線上 KV，並部署 Workers，讓
#       /api/skynet/{cb,pattern-screen,swing-hub} 三條 KV-only 路由正式上線。
#
# 前置條件（本機一次設定）：
#   1. 已 `npx wrangler login`（首次需瀏覽器授權；本腳本不會自動登入）
#   2. 已在專案根目錄安裝依賴（`npm install`）
#   3. wrangler.toml / CF 憑證已就位
#
# 用法：
#   bash scripts/deploy-plan-a.sh            # 全步驟
#   bash scripts/deploy-plan-a.sh --skip-backfill   # 跳過長視窗回填（KV 已有資料時）
#
set -euo pipefail

cd "$(dirname "$0")/.."   # 切到專案根目錄

SKIP_BACKFILL=0
for arg in "$@"; do
  case "$arg" in
    --skip-backfill) SKIP_BACKFILL=1 ;;
    *) echo "未知參數: $arg" >&2; exit 1 ;;
  esac
done

WORKERS_URL="https://skynet-dashboard.xpornky1122.workers.dev"

echo "========================================================"
echo " Plan A 部署：峰子 App Edge 預算化"
echo "========================================================"

# 0. 檢查 wrangler 登入狀態（避免跑到一半才爆）
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "⚠️  尚未登入 Cloudflare。請先執行： npx wrangler login"
  echo "    完成授權後再重跑本腳本。"
  exit 2
fi
echo "✓ wrangler 已登入"

# 1. 回填長視窗日 K（首次或 KV 清空後才需要）
if [ "$SKIP_BACKFILL" -eq 0 ]; then
  echo "[1/5] 回填 120 日市場 K 線（backfill）..."
  node scripts/backfill-market-bars.mjs --days=120
else
  echo "[1/5] 跳過 backfill（--skip-backfill）"
fi

# 2. 離線預算並寫入線上 KV（scan:cb / scan:pattern-screen / scan:swing-hub）
echo "[2/5] 預算掃描並寫入線上 KV..."
node scripts/precompute-scan.mjs --only=all

# 3. 建置
echo "[3/5] 建置 CF Workers（build:cf）..."
npm run build:cf

# 4. 部署
echo "[4/5] 部署（deploy:cf）..."
npm run deploy:cf

# 5. 線上複驗三端點
echo "[5/5] 線上複驗三端點（應回 200 + computedAt）..."
for ep in cb pattern-screen swing-hub; do
  echo "--- /api/skynet/$ep ---"
  curl -s --max-time 20 "$WORKERS_URL/api/skynet/$ep" | head -c 400
  echo
done

# 6. 安裝每日盤後排程（16:35 台北時間）
echo "安裝 launchd 每日 16:35 盤後排程..."
PLIST_SRC="scripts/com.skynet.precompute-scans.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.skynet.precompute-scans.plist"
cp "$PLIST_SRC" "$PLIST_DST"
if launchctl load "$PLIST_DST" 2>/dev/null; then
  echo "✓ launchctl load 成功"
else
  # macOS 13+ 改用 bootstrap
  launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null \
    && echo "✓ launchctl bootstrap 成功" \
    || echo "⚠️  排程載入失敗，請手動：launchctl load $PLIST_DST"
fi

echo "========================================================"
echo " 部署完成。請確認上方三端點皆回 200 且含 computedAt，"
echo " 不再出現 1102 / 502。無預算時則回 ready:false / not-ready。"
echo "========================================================"
