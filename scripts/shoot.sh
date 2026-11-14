#!/usr/bin/env bash
# 一屏截图：替代手工点击（依赖 app 注册的 jkmusic:// scheme）
# 用法：./scripts/shoot.sh songlist [输出名]
set -euo pipefail

ROUTE="${1:-}"
NAME="${2:-$ROUTE}"
[ -n "$ROUTE" ] || { echo "用法: ./scripts/shoot.sh <songlist|leaderboard|search|favorites|player|songs> [输出名]" >&2; exit 2; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p docs/screenshots

if ! xcrun simctl list devices booted 2>/dev/null | grep -q "iPhone"; then
  echo "[FAIL] 没有已启动的模拟器设备" >&2
  exit 1
fi

# route 可带 query（如 "songlist?source=wy"）；中文等需要编码，但 ? & = 必须保留
ENCODED_ROUTE=$(python3 -c "import sys,urllib.parse; u=sys.argv[1]; parts=u.split('?',1); print(parts[0] + ('?' + urllib.parse.quote(parts[1], safe='=&') if len(parts)>1 else ''))" "$ROUTE")
if ! xcrun simctl openurl booted "jkmusic://$ENCODED_ROUTE"; then
  echo "[FAIL] openurl jkmusic://$ENCODED_ROUTE 失败" >&2
  exit 1
fi
sleep 5

OUT="docs/screenshots/$NAME.png"
rm -f "$OUT"
xcrun simctl io booted screenshot "$OUT" >/dev/null
[ -s "$OUT" ] || { echo "[FAIL] 截图未生成 $OUT" >&2; exit 1; }
echo "[OK] $OUT ($(stat -f%z "$OUT") bytes)"
