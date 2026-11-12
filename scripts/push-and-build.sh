#!/usr/bin/env bash
# 把当前源码推到 GitHub，触发 Actions 构建并下载未签名 IPA。
# 用法：GH_TOKEN=ghp_xxx ./scripts/push-and-build.sh [仓库名]
# 需要的 token 权限：repo（classic PAT: repo + workflow）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="${1:-jkmusic-ios-build}"
: "${GH_TOKEN:?请先设置 GH_TOKEN，例如 GH_TOKEN=ghp_xxx ./scripts/push-and-build.sh}"

cd "$ROOT"

echo "== 1/5 校验 token =="
LOGIN=$(curl -s -H "Authorization: token $GH_TOKEN" https://api.github.com/user | python3 -c "import sys,json;print(json.load(sys.stdin).get('login',''))")
[ -n "$LOGIN" ] || { echo "token 无效" >&2; exit 1; }
REPO="$LOGIN/$REPO_NAME"
echo "   账号: $LOGIN  仓库: $REPO"

echo "== 2/5 确保仓库存在 =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO")
if [ "$CODE" = "404" ]; then
  curl -s -X POST -H "Authorization: token $GH_TOKEN" https://api.github.com/user/repos \
    -d "{\"name\":\"$REPO_NAME\",\"private\":true}" >/dev/null
  echo "   已创建私有仓库"
else
  echo "   仓库已存在"
fi

echo "== 3/5 上传源码 =="
REPO="$REPO" GH_TOKEN="$GH_TOKEN" python3 - <<'PY'
import base64, json, os, subprocess, time, urllib.request, urllib.error
REPO = os.environ['REPO']; TOKEN = os.environ['GH_TOKEN']
def api(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f'https://api.github.com{path}', data=data, method=method)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    if data: req.add_header('Content-Type', 'application/json')
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode() or '{}')
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            if e.code in (502,503,504) and attempt < 3: time.sleep(3); continue
            raise SystemExit(f'{method} {path} -> {e.code} {body}')
        except Exception:
            if attempt < 3: time.sleep(3); continue
            raise
files = [f for f in subprocess.check_output(['git','ls-files'], text=True).split('\n') if f.strip()]
print(f'   {len(files)} 个文件')
entries = []
for i, path in enumerate(files):
    content = open(path,'rb').read()
    blob = api('POST', f'/repos/{REPO}/git/blobs', {'content': base64.b64encode(content).decode(), 'encoding':'base64'})
    entries.append({'path': path, 'mode': '100755' if os.access(path, os.X_OK) else '100644', 'type':'blob', 'sha': blob['sha']})
    if (i+1) % 100 == 0: print(f'   ...{i+1}')
tree = api('POST', f'/repos/{REPO}/git/trees', {'tree': entries})
commit = api('POST', f'/repos/{REPO}/git/commits', {'message':'JKMUSIC iOS port', 'tree': tree['sha']})
try:
    api('POST', f'/repos/{REPO}/git/refs', {'ref':'refs/heads/main','sha':commit['sha']})
except SystemExit:
    api('PATCH', f'/repos/{REPO}/git/refs/heads/main', {'sha':commit['sha'],'force':True})
print('   commit', commit['sha'][:10])
PY

echo "== 4/5 触发工作流 =="
WF=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/workflows" \
  | python3 -c "import sys,json;ws=json.load(sys.stdin).get('workflows',[]);print(next((w['id'] for w in ws if 'jkmusic' in w['path'].lower()), ws[0]['id'] if ws else ''))")
[ -n "$WF" ] || { echo "未找到工作流" >&2; exit 1; }
curl -s -X POST -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WF/dispatches" -d '{"ref":"main"}' >/dev/null
echo "   已触发 workflow $WF"

echo "== 5/5 等待构建并下载 =="
RUN_ID=""
for i in $(seq 1 60); do
  sleep 20
  RUN_ID=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/runs?per_page=1" \
    | python3 -c "import sys,json;rs=json.load(sys.stdin).get('workflow_runs',[]);print(rs[0]['id'] if rs else '')")
  [ -n "$RUN_ID" ] || continue
  STATUS=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status'),d.get('conclusion') or '')")
  echo "   [$i] $STATUS"
  case "$STATUS" in
    completed\ success) break ;;
    completed\ *) echo "构建失败，请查看 https://github.com/$REPO/actions/runs/$RUN_ID" >&2; exit 1 ;;
  esac
done

mkdir -p artifacts
ART=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID/artifacts" \
  | python3 -c "import sys,json;a=json.load(sys.stdin).get('artifacts',[]);print(a[0]['id'] if a else '')")
[ -n "$ART" ] || { echo "没有 artifact" >&2; exit 1; }
curl -sL -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/artifacts/$ART/zip" -o artifacts/ipa.zip
rm -rf artifacts/ipa && mkdir -p artifacts/ipa && unzip -q artifacts/ipa.zip -d artifacts/ipa
find artifacts/ipa -name "*.ipa" -exec cp {} artifacts/ipa/JKMUSIC-ios-unsigned.ipa \;
ls -lh artifacts/ipa/JKMUSIC-ios-unsigned.ipa
echo "完成：$ROOT/artifacts/ipa/JKMUSIC-ios-unsigned.ipa"
