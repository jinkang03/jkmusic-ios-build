#!/usr/bin/env bash
# 客观度量空闲态：平均/最大 CPU、累计下行字节（Release 包不转发 console.log，只能测资源）
# 用法：./scripts/idle-check.sh 180
set -euo pipefail

DURATION="${1:-180}"
INTERVAL=30
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PID=$(pgrep -f "JKMUSIC.app/JKMUSIC" | head -1 || true)
[ -n "$PID" ] || { echo "[FAIL] JKMUSIC 未运行，先用 ./scripts/dev-sim.sh 启动" >&2; exit 1; }

SAMPLES=$(( DURATION / INTERVAL ))
[ "$SAMPLES" -ge 2 ] || SAMPLES=2

sum=0; max=0; n=0
net_before=$(nettop -P -L 1 -J bytes_in -p "$PID" 2>/dev/null | awk -F, 'NR>1 {gsub(/[^0-9]/,"",$2); s+=$2} END {print s+0}')
for i in $(seq 1 "$SAMPLES"); do
  sleep "$INTERVAL"
  cpu=$(ps -o %cpu= -p "$PID" 2>/dev/null | tr -d ' ' || echo 0)
  [ -n "$cpu" ] || cpu=0
  echo "  [$(date +%H:%M:%S)] cpu=${cpu}%"
  sum=$(echo "$sum + $cpu" | bc -l 2>/dev/null || echo "$sum")
  awk -v a="$max" -v b="$cpu" 'BEGIN{exit !(b>a)}' && max=$cpu
  n=$((n+1))
done

net_after=$(nettop -P -L 1 -J bytes_in -p "$PID" 2>/dev/null | awk -F, 'NR>1 {gsub(/[^0-9]/,"",$2); s+=$2} END {print s+0}')
avg=$(echo "scale=1; $sum / $n" | bc -l 2>/dev/null || echo "?")
delta=$(( ${net_after:-0} - ${net_before:-0} ))

echo "-------------------------------------------"
echo "采样: ${n} 次 × ${INTERVAL}s（共 ${DURATION}s）"
echo "平均 CPU: ${avg}%   最大 CPU: ${max}%"
echo "下行字节增量: ${delta} bytes ($(( delta / 1024 )) KB)"
awk -v a="$avg" 'BEGIN{ if (a+0 < 10) print "判定: CPU 正常 (<10%)"; else print "判定: CPU 偏高 (>=10%)" }'
awk -v d="$delta" 'BEGIN{ if (d+0 < 2097152) print "判定: 网络空闲 (<2MB)"; else print "判定: 仍有持续流量 (>=2MB)" }'
