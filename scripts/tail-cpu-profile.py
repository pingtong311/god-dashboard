#!/usr/bin/env python3
"""
scripts/tail-cpu-profile.py
────────────────────────────────────────────────────────────────────────────
【運維工具】解析 `wrangler tail --format=json` 的輸出，印出每個請求的
CPU / wall time 剖面，用來診斷 Cloudflare Workers 的 **1102（超出 CPU 上限）**。

為什麼需要這支工具：
  Cloudflare **Free plan 的 Worker CPU 上限是 10ms**。實測本專案光是
  OpenNext 執行期初始化 ＋ 讀一個 KV key ＋ 回小 JSON，`cpuTime` 地板值就有 **7ms**。
  因此任何「在請求時解析大 JSON」的端點必然 1102（503 error code: 1102）。
  HTTP 狀態碼只能告訴你「壞了」，`cpuTime` 才能告訴你「離上限還有多遠」。

用法：
  # 1) 開一個視窗開始蒐集（必須卸載 proxy 環境變數，否則 fetch failed）
  cd /Users/sheng-feng/Project/GOD-Platform
  export PATH=/Users/sheng-feng/.workbuddy-ai/binaries/node/versions/22.22.2-3/bin:$PATH
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \\
    npx wrangler tail god-dashboard --format=json > /tmp/tail.log 2>&1 &

  # 2) 另一個視窗打端點（同樣要卸載 proxy）
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \\
    curl -s -o /dev/null -w '%{http_code}\\n' \\
    https://god-dashboard.xpornky1122.workers.dev/api/skynet/cb

  # 3) 解析
  python3 scripts/tail-cpu-profile.py /tmp/tail.log --only=/api/skynet/cb

🔴 量測方法本身會污染量測結果（2026-10-04 實測，務必遵守）：
  **不要用「連打」的方式量 CPU。** 短時間內對同一端點連續送 20–30 個請求，
  會讓 Cloudflare 頻繁建立／輪替 isolate，每個新 isolate 的**模組實例化成本
  會被算進該請求的 `cpuTime`** → 讀數出現 100–270ms 的假尖峰。

  實測對照（同一端點、同一輪部署）：
    連打 20 次（無間隔）→ min/p25/median/p75/max = 4/7/9/9/**269** ms，≤10ms 45%
    節奏 20 次（間隔 0.8s）→ min/p25/median/p75/max = 4/7/9/9/**13**  ms，≤10ms 79%
  ⇒ **尖峰是量測造成的，不是端點變慢。**
  ⇒ 而且尖峰**所有端點都會出現**（同輪交錯量測：swing-hub 130ms、trump-radar 139ms），
     所以它不能拿來區分端點好壞。

  正確做法：
    1. 先暖機（8–10 次），把 isolate 建立起來。
    2. 量測時**每次間隔 0.5–1 秒**。
    3. 要比較多個端點時，**用同一種量法**（同一節奏、同樣暖機次數）。

⚠ 已知限制：
  1. 被 CPU 上限**強制終止**的請求不會產生完成事件 → `tail` 抓不到。
     那類端點要用 HTTP 狀態碼（503 + `error code: 1102`）判定。
  2. `tail` 的 JSON 是**縮排格式**，巢狀物件也以 `}` 結尾。
     → 判斷「物件結束」必須用「行首無縮排的 `}`」，不可用 `line.strip() == '}'`
       （後者會把巢狀 `}` 誤判為結尾，導致解析回 0 筆）。
  3. `wrangler tail` 會持續輸出，記得在解析前把背景程序 kill 掉。
"""

import json
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tail.log'
# 只統計特定路徑（例：只量 /api/skynet/dividend-calendar），其餘請求略過。
only = None
for a in sys.argv[2:]:
    if a.startswith('--only='):
        only = a.split('=', 1)[1]
rows = []
buf = ''
with open(path) as fh:
    for line in fh:
        buf += line
        # 只認「行首無縮排的 }」＝頂層物件結尾（巢狀物件是縮排過的）
        if line.rstrip('\n') == '}':
            try:
                obj = json.loads(buf)
            except Exception:
                buf = ''
                continue
            if isinstance(obj, dict) and 'cpuTime' in obj:
                event = obj.get('event') or {}
                req = event.get('request') or {}
                resp = event.get('response') or {}
                rows.append({
                    'cpu': obj.get('cpuTime'),
                    'wall': obj.get('wallTime'),
                    'outcome': obj.get('outcome'),
                    'url': re.sub(r'^https?://[^/]+', '', req.get('url', '') or ''),
                    'status': resp.get('status'),
                    'exceptions': len(obj.get('exceptions') or []),
                    'logs': len(obj.get('logs') or []),
                })
            buf = ''

if only:
    # ⚠ 用「子字串包含」而不是 `startswith`：
    #   `r['url']` 是**去頭路徑**（例：`/api/skynet/trump-radar`）。
    #   實務上很容易只記得端點名（`--only=trump-radar`）→ startswith 會**靜默回 0 筆**，
    #   印出「沒有解析到任何請求事件」，看起來像 tail 沒收到，其實只是過濾條件寫錯。
    #   （2026-10-04 實際踩到，白跑一輪 50 秒的量測。）
    rows = [r for r in rows if only in r['url']]

if not rows:
    print('（沒有解析到任何請求事件——請確認 tail 有收到請求，且格式為 --format=json）')
    sys.exit(1)

# 依 CPU 由高到低排序，最危險的排最前面
for r in sorted(rows, key=lambda x: -(x['cpu'] or 0)):
    flag = '🔴' if (r['cpu'] or 0) >= 10 else ('🟠' if (r['cpu'] or 0) >= 8 else '  ')
    print('  %s cpu=%5sms  wall=%6sms  %-10s status=%s  %s'
          % (flag, r['cpu'], r['wall'], r['outcome'], r['status'], r['url'][:64]))

print('  共 %d 筆' % len(rows))
print('  ⚠ Free plan 上限 = 10ms（本專案地板值實測 7ms）')


def percentile(sorted_vals, q):
    """最近排名法（nearest-rank）：回第 q 百分位的值。"""
    if not sorted_vals:
        return None
    idx = max(0, min(len(sorted_vals) - 1, int(round(q / 100 * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


# ── 分佈統計 ──
# ⚠ 為什麼一定要給分佈而不是單一數字：
#   「中位數 8ms」與「87% ≤10ms」是兩種不同的誠實程度，前者會掩蓋離群值。
#   冷啟動（isolate 初始化）會讓「其實很輕」的端點單筆噴到 15–27ms，
#   只看平均值／中位數會誤判，只看最大值又會誤判為超標。
vals = sorted(r['cpu'] for r in rows if r['cpu'] is not None)
if vals:
    over = [v for v in vals if v >= 10]
    print('')
    print('  ── 分佈（n=%d）──' % len(vals))
    print('    min / p25 / median / p75 / max = %s / %s / %s / %s / %s ms'
          % (vals[0], percentile(vals, 25), percentile(vals, 50),
             percentile(vals, 75), vals[-1]))
    print('    ≤10ms 比例 = %d/%d = %.0f%%'
          % (len(vals) - len(over), len(vals), 100.0 * (len(vals) - len(over)) / len(vals)))
    if over:
        print('    超限值：%s ms' % ', '.join(str(v) for v in over))
    # 平均數容易被離群值拉高，僅作參考
    print('    平均 = %.1f ms（易被離群值拉高，僅供參考）' % (sum(vals) / len(vals)))
