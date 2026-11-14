#!/usr/bin/env bash
# JKMUSIC 本机 iOS 模拟器构建 / 验收回路（唯一入口）
#
# 增量成本（决定你该用哪条命令）：
#   只改 src/ 下 TS/TSX/JS        → ./scripts/dev-sim.sh                  （只重跑 bundle，1-3 分钟）
#   只重装验证、不改代码          → ./scripts/dev-sim.sh --verify          （秒级）
#   改 Podfile / 加 pod           → ./scripts/dev-sim.sh --clean --arch x86_64 （全量重编，砍半后 15-30 分钟）
#   改 expo-modules-jsi 补丁      → 同上，并重新 npx patch-package
#   出 IPA（P6 才做）             → xcodebuild -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO
#
# 架构：默认只编 x86_64（本机 Intel，iOS 模拟器不跑 arm64 切片），要通用包用 --all-arch。
# 注意：已有双架构产物时，切到 x86_64-only 增量不会整体重编，只会补 x86_64 缺失部分。
#
# 为什么默认 Release：Debug 的 bundle 阶段强制 SKIP_BUNDLING=1，JS 只能走 Metro
# 深链；Release 才把 JS 打进 main.jsbundle，可直接 simctl 启动验收。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p .build docs/screenshots

CONFIG="Release"
DEVICE="iPhone 17 Pro"
DO_BUILD=1
DO_INSTALL=1
CLEAN=0
ARCH_FLAGS=(ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES)  # 本机 Intel，模拟器只跑 x86_64
ALL_ARCH=0
STATUS_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --debug)   CONFIG="Debug"; shift ;;
    --release) CONFIG="Release"; shift ;;
    --device)  DEVICE="$2"; shift 2 ;;
    --arch)    ARCH_FLAGS=(ARCHS="$2" ONLY_ACTIVE_ARCH=YES); ALL_ARCH=1; shift 2 ;;
    --all-arch) ARCH_FLAGS=(); ALL_ARCH=1; shift ;;
    --verify)  DO_BUILD=0; shift ;;
    --status)  STATUS_ONLY=1; shift ;;
    --clean)   CLEAN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

P=.build/progress.log
LOG=.build/devsim-xcodebuild.log
APP=".build/DerivedData/Build/Products/${CONFIG}-iphonesimulator/JKMUSIC.app"
BUNDLE_ID="com.jkmusic.ios"

mark() { echo "[$(date +%H:%M:%S)][$1][$2] $3" >> "$P"; }

# 真错误判据：编译器诊断行形如 path.swift:12:34: error: ...；
# 不能用 grep "error:"——AVPlayerEngine.swift 的警告正文里含 error: 字样会误判
real_errors() {
  grep -E "^[^ ]+\.(swift|m|mm|c|cc|cpp|h|hpp):[0-9]+:[0-9]+: error: " "$1" 2>/dev/null | grep -v "warning:" || true
  grep -E "^(error: |ld: |Undefined symbols|\*\* BUILD FAILED)" "$1" 2>/dev/null | grep -v "warning:" || true
}

if [ "$STATUS_ONLY" -eq 1 ]; then
  # 只读文件尾部若干 KB，避免大日志拖慢（要求 < 1s）
  tail -c 4000 "$P" 2>/dev/null | tail -n 10 || echo "还没有进度记录"
  echo "--- 构建日志尾部 ---"
  tail -c 600 "$LOG" 2>/dev/null | tail -n 3 || true
  if pgrep -f "xcodebuild -workspace ios/JKMUSIC" >/dev/null; then echo "状态: 构建进行中"; else echo "状态: 无构建进程"; fi
  exit 0
fi

T0=$(date +%s)
: > "$P" 2>/dev/null || true

if [ "$DO_BUILD" -eq 1 ] && ! pgrep -x caffeinate >/dev/null; then
  echo "[提示] 未检测到常驻 caffeinate，长构建可能进睡眠（脚本内部已用 caffeinate -dimsu 包裹 xcodebuild）"
fi

if [ "$DO_BUILD" -eq 1 ]; then
  # [1/6] 环境检查
  xcodebuild -showsdks 2>/dev/null | grep -q iphonesimulator || { mark 1/6 FAIL "无 iphonesimulator SDK"; echo "[FAIL] 无模拟器 SDK"; exit 1; }
  xcrun simctl list devices available | grep -q "$DEVICE (" || { mark 1/6 FAIL "设备不存在: $DEVICE"; echo "[FAIL] 无设备"; exit 1; }
  [ -f ios/Pods/Manifest.lock ] || { mark 1/6 FAIL "Pods 未安装"; echo "[FAIL] 缺 Pods"; exit 1; }
  mark 1/6 OK "环境检查 config=$CONFIG device=$DEVICE"

  # [2/6] 可选清包级缓存
  if [ "$CLEAN" -eq 1 ]; then
    mark 2/6 RUN "清理 expo-modules-jsi 包级缓存"
    rm -rf node_modules/expo-modules-jsi/apple/.DerivedData node_modules/expo-modules-jsi/apple/.swiftpm
    mark 2/6 OK "包级缓存已清（Pods / DerivedData 保留）"
  else
    mark 2/6 OK "跳过缓存清理"
  fi

  # [3/6] xcodebuild
  mark 3/6 RUN "xcodebuild $CONFIG iphonesimulator ${ARCH_FLAGS[*]:-}"
  B0=$(date +%s)
  set -o pipefail
  caffeinate -dimsu xcodebuild -workspace ios/JKMUSIC.xcworkspace -scheme JKMUSIC \
    -configuration "$CONFIG" -sdk iphonesimulator \
    -destination "platform=iOS Simulator,name=$DEVICE" \
    -derivedDataPath .build/DerivedData \
    "${ARCH_FLAGS[@]}" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -quiet 2>&1 \
    | tee "$LOG" \
    | grep --line-buffered -E "^[^ ]+\.(swift|m|mm|c|cc|cpp|h|hpp):[0-9]+:[0-9]+: error: |^(error: |ld: |\*\* BUILD)" \
    | while read -r line; do echo "[$(date +%H:%M:%S)][3/6][RUN] ${line:0:100}" >> "$P"; done
  rc=${PIPESTATUS[0]}
  BUILD_DUR=$(( $(date +%s) - B0 ))
  ERR=$(real_errors "$LOG" | wc -l | tr -d ' ')
  if [ "$rc" -ne 0 ] || [ "$ERR" -gt 0 ]; then
    mark 3/6 FAIL "xcodebuild rc=$rc realErrors=$ERR (${BUILD_DUR}s)"
    echo "[FAIL] 构建失败 rc=$rc realErrors=$ERR"
    real_errors "$LOG" | head -10
    exit 1
  fi
  mark 3/6 OK "xcodebuild (${BUILD_DUR}s)"
else
  mark 1/6 OK "--verify 模式，跳过构建"
  mark 2/6 OK "跳过缓存清理"
  mark 3/6 OK "跳过 xcodebuild"
fi

# [4/6] 产物校验
[ -d "$APP" ] || { mark 4/6 FAIL "缺少 $APP"; echo "[FAIL] 无产物 $APP"; exit 1; }
BIN_SIZE=$(stat -f%z "$APP/JKMUSIC" 2>/dev/null || echo 0)
if [ -f "$APP/main.jsbundle" ]; then JS_SIZE=$(stat -f%z "$APP/main.jsbundle"); else JS_SIZE=0; fi
if [ "$CONFIG" = "Release" ] && [ "$JS_SIZE" -lt 102400 ]; then
  mark 4/6 FAIL "main.jsbundle 缺失或过小 ($JS_SIZE bytes)"
  echo "[FAIL] main.jsbundle 缺失/过小"
  exit 1
fi

# 音源运行时脚本：缺失会导致任何 lx 音源都加载失败（原生 Bundle.main.url(forResource: "user-api-preload")）
PRELOAD="$APP/user-api-preload.js"
if [ ! -s "$PRELOAD" ]; then
  mark 4/6 FAIL "包里缺 user-api-preload.js"
  echo "[FAIL] 包里缺 user-api-preload.js（检查 Xcode 的 Copy user-api-preload.js 阶段）"
  exit 1
fi
if ! grep -q "globalThis.lxu" "$PRELOAD"; then
  mark 4/6 FAIL "user-api-preload.js 内容异常"
  echo "[FAIL] user-api-preload.js 内容异常（缺 globalThis.lxu）"
  exit 1
fi
PRELOAD_SIZE=$(stat -f%z "$PRELOAD")
mark 4/6 OK "产物 bin=$((BIN_SIZE/1024/1024))MB jsbundle=$((JS_SIZE/1024))KB preload=$((PRELOAD_SIZE/1024))KB"

# [5/6] boot + install
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus booted -b 2>/dev/null || sleep 5
xcrun simctl uninstall booted "$BUNDLE_ID" 2>/dev/null || true
if ! xcrun simctl install booted "$APP" 2>/dev/null; then
  mark 5/6 FAIL "simctl install 失败"; echo "[FAIL] install"; exit 1
fi
mark 5/6 OK "install"

# [6/6] launch + 验收
LAUNCH=$(xcrun simctl launch booted "$BUNDLE_ID" 2>&1) || { mark 6/6 FAIL "launch 失败: $LAUNCH"; echo "[FAIL] launch"; exit 1; }
PID=$(echo "$LAUNCH" | awk -F': ' '{print $2}' | tr -d ' ')
sleep 40
SHOT="docs/screenshots/local-sim-$(echo "$CONFIG" | tr 'A-Z' 'a-z').png"
xcrun simctl io booted screenshot "$SHOT" >/dev/null 2>&1 || true
FATAL=$(xcrun simctl spawn booted log show --last 60s --predicate 'process == "JKMUSIC"' 2>/dev/null | grep -c JKMUSIC_FATAL || true)
ALIVE=$(xcrun simctl spawn booted launchctl list 2>/dev/null | grep -c jkmusic || true)
DUR=$(( $(date +%s) - T0 ))

if [ "$FATAL" -gt 0 ] || [ "$ALIVE" -lt 1 ]; then
  mark 6/6 FAIL "pid=$PID fatal=$FATAL alive=$ALIVE"
  echo "[FAIL] fatal=$FATAL alive=$ALIVE（截图 $SHOT）"
  exit 1
fi
mark 6/6 OK "launch pid=$PID fatal=$FATAL alive=$ALIVE"
echo "[DONE] pid=$PID fatal=$FATAL screenshot=$SHOT dur=${DUR}s"
