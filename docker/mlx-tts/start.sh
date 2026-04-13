#!/bin/bash
# MLX TTS 서버 시작 스크립트
# Qwen3-TTS 0.6B 모델을 OpenAI 호환 API로 서빙합니다.
#
# 사용법:
#   ./start.sh                  # 기본 (포트 8000)
#   MLX_TTS_PORT=9000 ./start.sh  # 포트 변경
#
# 종료:
#   pkill -f "mlx_audio.server"

VENV_DIR="${MLX_TTS_VENV:-$HOME/mlx-tts-venv}"
PORT="${MLX_TTS_PORT:-8000}"
HOST="${MLX_TTS_HOST:-0.0.0.0}"

if [ ! -d "$VENV_DIR" ]; then
    echo "Error: venv not found at $VENV_DIR"
    echo "Run: python3.13 -m venv $VENV_DIR && $VENV_DIR/bin/pip install 'mlx-audio[server]' setuptools webrtcvad"
    exit 1
fi

source "$VENV_DIR/bin/activate"
exec python3 -m mlx_audio.server --host "$HOST" --port "$PORT" --workers 1
