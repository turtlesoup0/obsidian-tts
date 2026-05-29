#!/bin/bash
#
# 일 1회 vault 스캔 + 새 토큰만 LLM 분류 + 사전 갱신 (증분).
# launchd (com.turtlesoup0.mlx-tts-rebuild-dict) 가 매일 04:00 호출.
# 사용자 직접 실행도 OK: ./scripts/rebuild-dict.sh
#
# 흐름:
#   1. mlx_lm.server 8091 임시 기동 (이미 떠있으면 건너뜀)
#   2. health 폴링 (모델 로딩 대기, 최대 5분)
#   3. build-acronym-dict.py 실행 (증분: 새 토큰만 LLM 질의)
#   4. --audit (영어 단어 사전 자동 정정)
#   5. mlx_lm.server 종료 (trap 으로 보장)
#   6. obsidian-tts 컨테이너 가벼운 restart (사전 reload)
#
# 안전 정책:
# - 8091 이 이미 사용 중이면 (다른 작업 중) 우리 작업 skip.
# - mlx_lm.server 시작 실패해도 기존 사전 보존 (건드리지 않음).
# - 모든 출력은 /tmp/mlx-tts-rebuild-dict/<timestamp>.log 에 누적.

set -euo pipefail

LOG_DIR="/tmp/mlx-tts-rebuild-dict"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S).log"
exec >> "$LOG" 2>&1

echo "[$(date)] === rebuild-dict start ==="

VENV_PY="/Users/turtlesoup0-macmini/Projects/itpe-topic-splitter/venv/bin/python"
PROJECT="/Users/turtlesoup0-macmini/Projects/obsidian-tts"
MODEL="mlx-community/gemma-4-e4b-it-4bit"
PORT=8091

if ! [ -x "$VENV_PY" ]; then
    echo "[error] python venv not found: $VENV_PY"
    exit 1
fi

# 8091 이 이미 사용 중이면 skip (다른 사용자 작업 중일 수 있음).
if lsof -nP -i:$PORT 2>/dev/null | grep -q LISTEN; then
    echo "[warn] port $PORT already in use; skipping this run"
    exit 0
fi

# mlx_lm.server 백그라운드 기동
"$VENV_PY" -m mlx_lm server \
    --model "$MODEL" \
    --host 127.0.0.1 --port $PORT \
    --prompt-cache-size 2 --prompt-cache-bytes 200000000 \
    > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!

# 종료 보장 (성공/실패 막론)
trap "echo '[trap] killing mlx_lm.server PID=$SERVER_PID'; kill $SERVER_PID 2>/dev/null || true; wait 2>/dev/null || true" EXIT

# health 폴링 (최대 5분)
READY=0
for i in $(seq 1 60); do
    if curl -sf -m 2 "http://127.0.0.1:$PORT/v1/models" 2>/dev/null | grep -q "gemma-4-e4b"; then
        echo "[$(date)] mlx_lm.server ready ($((i*5))s)"
        READY=1
        break
    fi
    sleep 5
done

if [ "$READY" -ne 1 ]; then
    echo "[error] mlx_lm.server failed to ready within 5min"
    exit 1
fi

# 빌드 (증분: 기존 사전에 없는 토큰만 LLM 질의)
echo "[$(date)] running build-acronym-dict.py (incremental)..."
"$VENV_PY" "$PROJECT/scripts/build-acronym-dict.py"

# audit (영어 단어 사전 자동 정정 — LLM 호출 없음, 빠름)
echo "[$(date)] running build-acronym-dict.py --audit..."
"$VENV_PY" "$PROJECT/scripts/build-acronym-dict.py" --audit

# 컨테이너 가벼운 restart 로 새 사전 즉시 반영
# (04:00 시각 가정 — 사용자가 듣고 있을 가능성 매우 낮음)
echo "[$(date)] reloading tts-proxy container..."
docker compose -f "$PROJECT/docker/tts-proxy/docker-compose.yml" restart tts-proxy 2>&1 || \
    echo "[warn] container restart failed (normalizer 는 다음 재시작 시 새 사전 로드)"

echo "[$(date)] === rebuild-dict done ==="
