#!/usr/bin/env bash
# 同步版本号：改 app.json + pbxproj，并生成 src/constants/buildInfo.ts
#
# 用法：
#   ./scripts/sync-version.sh 1.4.5 29
#   ./scripts/sync-version.sh            # 只按现有 app.json / pbxproj 重新生成 buildInfo.ts
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PBX="ios/JKMUSIC.xcodeproj/project.pbxproj"

if [ $# -ge 1 ]; then
  VER="$1"
  BUILD="${2:-}"
  python3 - "$VER" "$BUILD" <<'PY'
import json, re, sys
ver, build = sys.argv[1], sys.argv[2]

p = 'app.json'
d = json.load(open(p, encoding='utf-8'))
d['expo']['version'] = ver
if build:
    d['expo'].setdefault('ios', {})['buildNumber'] = build
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(p, 'a', encoding='utf-8').write('\n')

if build:
    p = 'ios/JKMUSIC.xcodeproj/project.pbxproj'
    s = open(p, encoding='utf-8').read()
    s = re.sub(r'MARKETING_VERSION = [^;]+;', f'MARKETING_VERSION = {ver};', s)
    s = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', s)
    open(p, 'w', encoding='utf-8').write(s)
PY
fi

# 以 pbxproj 为构建号真源，app.json 为版本号真源
VER=$(python3 -c "import json;print(json.load(open('app.json',encoding='utf-8'))['expo']['version'])")
BUILD=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBX" | grep -oE '[0-9]+')

cat > src/constants/buildInfo.ts <<EOF
/**
 * 构建信息（设置 → 其他 → App Version 显示）。
 *
 * 本文件由 scripts/sync-version.sh 生成，不要手改。
 */
export const BUILD_INFO = {
	version: '$VER',
	build: '$BUILD',
} as const

export default BUILD_INFO
EOF

echo "版本已同步：$VER / build $BUILD"
echo "  app.json version      = $VER"
echo "  pbxproj MARKETING     = $(grep -m1 -oE 'MARKETING_VERSION = [^;]+;' "$PBX")"
echo "  buildInfo.ts          = 已生成"
