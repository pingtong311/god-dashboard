#!/bin/bash
# God 平台 · 每日盤後預算排程安裝腳本
#
# 為什麼需要這支腳本：
#   launchd 的使用者層級註冊（launchctl bootstrap/load）在「AI 助理的內建終端」
#   會因權限不足回傳 `Bootstrap failed: 5: Input/output error`（EIO）。
#   這是「發出指令的行程無權註冊」的權限問題，**不是 plist 壞掉**。
#   plist 本身已通過 `plutil -lint`，且已複製到 ~/Library/LaunchAgents/。
#   → 所以請在 **Terminal.app（原生終端機）** 執行本腳本。
#
# 用法：
#   bash scripts/install-launchd.sh          # 安裝並驗證
#   bash scripts/install-launchd.sh diag     # 只做環境診斷（安裝失敗時先跑這個）
#   bash scripts/install-launchd.sh status   # 只查目前是否已載入

set -uo pipefail

LABEL="com.god.precompute-scans"
PROJECT_ROOT="/Users/sheng-feng/Project/GOD-Platform"
PLIST_SRC="${PROJECT_ROOT}/scripts/${LABEL}.plist"
LA_DIR="${HOME}/Library/LaunchAgents"
PLIST="${LA_DIR}/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

# ---------- 環境診斷（不吞 stderr，錯誤全文要保留）----------
diag() {
  echo "========== 環境診斷 =========="
  echo "TERM_PROGRAM       = ${TERM_PROGRAM:-（未設定）}"
  echo "SECURITYSESSIONID  = ${SECURITYSESSIONID:-（未設定）}"
  echo "domain             = ${DOMAIN}"
  echo "launchctl managername = $(launchctl managername 2>&1)"
  echo

  # 網域可讀取嗎？（可讀 ≠ 可寫入，但能排除 domain 不存在）
  if launchctl print "${DOMAIN}" >/dev/null 2>&1; then
    echo "✓ 網域可讀取"
  else
    echo "✗ 網域不可讀取"
  fi
  echo

  echo "--- 原始錯誤（不要吞）---"
  launchctl bootstrap "${DOMAIN}" "${PLIST}"; echo "  bootstrap exit=$?"
  launchctl load "${PLIST}";                  echo "  load exit=$?"
  echo

  echo "--- 判定 ---"
  case "${TERM_PROGRAM:-}" in
    Apple_Terminal|iTerm.app|WarpTerminal)
      echo "· 原生終端機，但仍失敗 → 請把上方原始錯誤整段回報" ;;
    *)
      echo "✗ 非原生終端機（很可能是 AI 助理內建終端）"
      echo "  → 請改用 Terminal.app 執行：bash ${PROJECT_ROOT}/scripts/install-launchd.sh" ;;
  esac
}

# ---------- 狀態查詢（用 print，不用 list；list 會查錯 domain）----------
status() {
  echo "========== 狀態 =========="
  if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    echo "✓ 已載入"
    launchctl print "${DOMAIN}/${LABEL}" | grep -E "state = |pid = |last exit code|runs = " || true
  else
    echo "✗ 未載入"
  fi
}

# ---------- 安裝：依序試三種載入法，保留原始錯誤 ----------
try_load() {
  local err

  # 殘留的 disabled 覆寫會讓 bootstrap 直接失敗，先清掉
  launchctl enable "${DOMAIN}/${LABEL}" 2>/dev/null

  err="$(launchctl bootstrap "${DOMAIN}" "${PLIST}" 2>&1)"
  [ -z "$err" ] && { echo "  ✓ bootstrap 成功"; return 0; }
  echo "  · bootstrap 失敗：${err}"

  err="$(launchctl load "${PLIST}" 2>&1)"
  [ -z "$err" ] && { echo "  ✓ load 成功"; return 0; }
  echo "  · load 失敗：${err}"

  err="$(launchctl load -w "${PLIST}" 2>&1)"
  [ -z "$err" ] && { echo "  ✓ load -w 成功"; return 0; }
  echo "  · load -w 失敗：${err}"

  return 1
}

install() {
  echo "========== 安裝 ${LABEL} =========="

  # 1) plist 合法性
  plutil -lint "${PLIST_SRC}" || { echo "✗ plist 不合法，中止"; exit 1; }

  # 2) 複製到 LaunchAgents
  mkdir -p "${LA_DIR}"
  cp "${PLIST_SRC}" "${PLIST}" && echo "  ✓ plist 已就位：${PLIST}"

  # 3) 先卸載舊的（冪等，失敗無妨）
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null

  # 4) 載入
  if try_load "${LABEL}" "${PLIST}"; then
    echo
    echo "  ✓ 安裝完成。每日兩個時點（台北時間）自動執行："
    echo "      16:35 盤後場 → backfill-market-bars --days=3 --force"
    echo "                      → precompute-scan --only=all"
    echo "      23:30 深夜場 → precompute-scan --only=block-trades"
    echo "                      → precompute-scan --only=trump-radar"
    echo "        （block-trades：TWSE 鉅額交易含盤後時段至 17:00、約 23:08 才定稿，需深夜覆寫）"
    echo "        （trump-radar ：滾動新聞 RSS，加跑一次把最大延遲從約 24h 壓到約 7h）"
    echo
    echo "  立即試跑一次（可選）："
    echo "      launchctl start ${LABEL}"
    echo "  查狀態："
    echo "      bash ${PROJECT_ROOT}/scripts/install-launchd.sh status"
    echo "  看日誌："
    echo "      tail -f /tmp/god-precompute.log"
    echo
    status
  else
    echo
    echo "[失敗] 三種載入法都失敗。請先跑診斷："
    echo "      bash ${PROJECT_ROOT}/scripts/install-launchd.sh diag"
    exit 1
  fi
}

case "${1:-install}" in
  diag)   diag ;;
  status) status ;;
  *)      install ;;
esac
