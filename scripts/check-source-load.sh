#!/usr/bin/env bash
# 在真实 JSC 运行时里加载一个 lx 音源脚本，打印 init 结果与能力。
# 用法：./scripts/check-source-load.sh <source.js> [source] [songmid] [name] [singer] [quality]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SRC_JS="${1:-}"
[ -n "$SRC_JS" ] || { echo "用法: ./scripts/check-source-load.sh <source.js> [source] [songmid] [name] [singer] [quality]" >&2; exit 2; }
[ -f "$SRC_JS" ] || { echo "[FAIL] 找不到脚本: $SRC_JS" >&2; exit 1; }

PRELOAD="src/helpers/userApi/user-api-preload.js"
RUNTIME_M="modules/cymusic-native/ios/CyMusicUserApiRuntime.m"
RUNTIME_H_DIR="modules/cymusic-native/ios"
PROBE_M="scripts/check-source-load.m"
BIN_DIR=".build/bin"
BIN="$BIN_DIR/check-source-load"
STAMP="$BIN_DIR/check-source-load.stamp"

mkdir -p "$BIN_DIR"

need_build=0
if [ ! -x "$BIN" ]; then
  need_build=1
else
  # 运行时或探针改动 → 重编
  current_stamp=$(cat "$RUNTIME_M" "$PROBE_M" 2>/dev/null | shasum | awk '{print $1}')
  [ "$(cat "$STAMP" 2>/dev/null)" = "$current_stamp" ] || need_build=1
fi

if [ "$need_build" -eq 1 ]; then
  SDK=$(xcrun --sdk macosx --show-sdk-path)
  echo "[build] 编译 check-source-load …"
  xcrun clang -fobjc-arc -O1 \
    -isysroot "$SDK" \
    -I"$RUNTIME_H_DIR" \
    "$PROBE_M" "$RUNTIME_M" \
    -framework Foundation -framework JavaScriptCore -framework Security \
    -o "$BIN" || { echo "[FAIL] 编译失败" >&2; exit 1; }
  cat "$RUNTIME_M" "$PROBE_M" | shasum | awk '{print $1}' > "$STAMP"
fi

"$BIN" "$PRELOAD" "$SRC_JS" "${TIMEOUT:-15}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}" \
  | grep -E "^(EVENT init|INIT_ERROR|RESULT)" 
rc=${PIPESTATUS[0]}
exit $rc
