"""
tts-proxy 통합 Flask 서버

TTS 하이브리드 프록시 서버로 다음 기능을 제공합니다:
1. TTS 생성 (openai-edge-tts 프록시)
2. 로컬 캐시 관리
3. SSE(Server-Sent Events)를 통한 실시간 위치 동기화

포트: 5051
TTS 백엔드: http://localhost:5050 (openai-edge-tts)
"""
import os
import sys
import json
import time
import queue
import logging
import hashlib
import threading
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

# SSE 매니저 임포트
from sse_manager import SSEManager

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask 앱 초기화
app = Flask(__name__)
CORS(app)

# 설정
PORT = int(os.environ.get('TTS_PROXY_PORT', 5051))
DATA_DIR = Path(os.environ.get('TTS_DATA_DIR', './data/tts-cache'))
# TTS 백엔드 설정
TTS_BACKEND_URL = os.environ.get('TTS_BACKEND_URL', 'http://localhost:5050')
TTS_TIMEOUT = int(os.environ.get('TTS_TIMEOUT', '30'))

# 데이터 디렉토리 생성
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR = DATA_DIR / 'tts-cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# 파일 경로
PLAYBACK_POSITION_FILE = DATA_DIR / 'playback-position.json'
SCROLL_POSITION_FILE = DATA_DIR / 'scroll-position.json'
STATS_FILE = DATA_DIR / 'stats.json'
USAGE_FILE = DATA_DIR / 'usage.json'

# 위치 파일 쓰기 Lock (동시 PUT 요청 시 race condition 방지)
position_lock = threading.Lock()

# 통계 초기화
stats_lock = threading.Lock()
stats_data = {
    'totalRequests': 0,
    'cacheHits': 0,
    'cacheMisses': 0,
    'backendRequests': 0,
    'errors': 0,
    'startTime': int(time.time())
}

# 사용량 추적 초기화
usage_lock = threading.Lock()
usage_data = {
    'totalCharacters': 0,
    'totalRequests': 0,
    'dailyUsage': {}
}

# 통계 로드
if STATS_FILE.exists():
    try:
        stats_data.update(json.loads(STATS_FILE.read_text(encoding='utf-8')))
    except Exception as e:
        logger.warning(f"Failed to load stats: {e}")

# 사용량 로드
if USAGE_FILE.exists():
    try:
        usage_data.update(json.loads(USAGE_FILE.read_text(encoding='utf-8')))
    except Exception as e:
        logger.warning(f"Failed to load usage: {e}")

# SSE 매니저 초기화
logger.info("Initializing in-memory SSE Manager")
sse_manager = SSEManager()


# =============================================================================
# 유틸리티 함수
# =============================================================================

def generate_cache_key(text: str, voice: str, rate: str = None) -> str:
    """캐시 키 생성 (SHA256 해시)"""
    key_data = f"{text}|{voice}|{rate or ''}"
    return hashlib.sha256(key_data.encode('utf-8')).hexdigest()

def _flush_stats():
    """통계를 파일에 저장 (lock 안에서 호출)"""
    try:
        STATS_FILE.write_text(json.dumps(stats_data, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as e:
        logger.error(f"Failed to save stats: {e}")

def _flush_usage():
    """사용량을 파일에 저장 (lock 안에서 호출)"""
    try:
        USAGE_FILE.write_text(json.dumps(usage_data, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as e:
        logger.error(f"Failed to save usage: {e}")

# 배치 저장: N회 업데이트마다 파일에 flush (매 요청 I/O 방지)
_STATS_FLUSH_INTERVAL = 10
_stats_update_count = 0

def update_stats(cache_hit: bool = False, backend_request: bool = False, error: bool = False):
    """통계 업데이트 (N회마다 배치 저장)"""
    global _stats_update_count
    with stats_lock:
        stats_data['totalRequests'] += 1
        if cache_hit:
            stats_data['cacheHits'] += 1
        else:
            stats_data['cacheMisses'] += 1
        if backend_request:
            stats_data['backendRequests'] += 1
        if error:
            stats_data['errors'] += 1
        _stats_update_count += 1
        if _stats_update_count >= _STATS_FLUSH_INTERVAL:
            _stats_update_count = 0
            _flush_stats()

def update_usage(text: str):
    """사용량 업데이트 (배치 저장)"""
    global _stats_update_count
    with usage_lock:
        usage_data['totalCharacters'] += len(text)
        usage_data['totalRequests'] += 1

        today = datetime.now().strftime('%Y-%m-%d')
        if today not in usage_data['dailyUsage']:
            usage_data['dailyUsage'][today] = {'characters': 0, 'requests': 0}
        usage_data['dailyUsage'][today]['characters'] += len(text)
        usage_data['dailyUsage'][today]['requests'] += 1
        _flush_usage()


# =============================================================================
# 헬스 체크
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'timestamp': int(time.time() * 1000),
        'sse_clients': sse_manager.get_client_count(),
        'tts_backend': TTS_BACKEND_URL
    })


# =============================================================================
# TTS 엔드포인트 (프록시 to openai-edge-tts)
# =============================================================================

def _tts_generate(text: str, voice: str, model: str = 'tts-1',
                  rate: str = None, use_cache: bool = True):
    """
    TTS 생성 핵심 로직 (캐시 확인 → 백엔드 요청 → 캐시 저장)

    모든 TTS 엔드포인트가 공유하는 단일 함수.
    """
    cache_key = generate_cache_key(text, voice, rate)
    cache_file = CACHE_DIR / f"{cache_key}.mp3"

    # 캐시 확인
    if use_cache and cache_file.exists():
        logger.info(f"Cache HIT: {cache_key[:16]}...")
        update_stats(cache_hit=True)
        audio_data = cache_file.read_bytes()
        return Response(audio_data, mimetype='audio/mpeg', headers={
            'Content-Length': str(len(audio_data)),
            'X-Cache': 'HIT',
            'Access-Control-Allow-Origin': '*'
        })

    # 캐시 미스 → 백엔드 요청
    logger.info(f"Cache MISS: {cache_key[:16]}...")
    update_stats(cache_hit=False, backend_request=True)
    update_usage(text)

    try:
        response = requests.post(
            f"{TTS_BACKEND_URL}/v1/audio/speech",
            json={'model': model, 'input': text, 'voice': voice},
            timeout=TTS_TIMEOUT,
            stream=True
        )
        response.raise_for_status()
        audio_data = response.content

        if use_cache:
            cache_file.write_bytes(audio_data)

        return Response(audio_data, mimetype='audio/mpeg', headers={
            'Content-Length': str(len(audio_data)),
            'X-Cache': 'MISS',
            'Access-Control-Allow-Origin': '*'
        })

    except requests.RequestException as e:
        logger.error(f"TTS backend error: {e}")
        update_stats(error=True)
        return jsonify({'error': f'TTS backend error: {str(e)}'}), 502


@app.route('/api/tts', methods=['POST'])
def tts_hybrid():
    """TTS 생성 (하이브리드 프록시) — text, voice, rate, useCache 지원"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400

        text = body.get('text', '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400

        return _tts_generate(
            text=text,
            voice=body.get('voice', 'alloy'),
            rate=body.get('rate'),
            use_cache=body.get('useCache', True)
        )
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        update_stats(error=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts-stream', methods=['POST'])
def tts_azure_compatible():
    """TTS 생성 (Azure 호환) — text, voice 지원"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400

        text = body.get('text', '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400

        return _tts_generate(text=text, voice=body.get('voice', 'alloy'))
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        update_stats(error=True)
        return jsonify({'error': str(e)}), 500


@app.route('/v1/audio/speech', methods=['POST'])
def tts_openai_compatible():
    """TTS 생성 (OpenAI API 호환) — model, input, voice 지원"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400

        text = body.get('input', '').strip()
        if not text:
            return jsonify({'error': 'input is required'}), 400

        return _tts_generate(
            text=text,
            voice=body.get('voice', 'alloy'),
            model=body.get('model', 'tts-1')
        )
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        update_stats(error=True)
        return jsonify({'error': str(e)}), 500


# =============================================================================
# 캐시 관리 엔드포인트
# =============================================================================

@app.route('/api/cache/<key>', methods=['GET'])
def get_cache(key: str):
    """
    캐시 조회

    Args:
        key: 캐시 키 (SHA256 해시 또는 축약형)

    Returns:
        캐시된 오디오 또는 404
    """
    try:
        # 전체 키 또는 축약형 키 검색
        cache_file = CACHE_DIR / f"{key}.mp3"

        if not cache_file.exists():
            # 축약형 키로 검색
            for f in CACHE_DIR.glob("*.mp3"):
                if f.name.startswith(key):
                    cache_file = f
                    break

        if not cache_file.exists():
            return jsonify({'error': 'Cache not found'}), 404

        with open(cache_file, 'rb') as f:
            audio_data = f.read()

        return Response(
            audio_data,
            mimetype='audio/mpeg',
            headers={
                'Content-Length': str(len(audio_data)),
                'Access-Control-Allow-Origin': '*'
            }
        )

    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/cache/<key>', methods=['PUT'])
def put_cache(key: str):
    """
    캐시 저장

    Args:
        key: 캐시 키

    Request Body:
        binary audio data
    """
    try:
        cache_file = CACHE_DIR / f"{key}.mp3"
        audio_data = request.get_data()

        if not audio_data:
            return jsonify({'error': 'No data provided'}), 400

        cache_file.write_bytes(audio_data)
        logger.info(f"Cache saved: {key[:16]}...")

        return jsonify({'success': True, 'key': key})

    except Exception as e:
        logger.error(f"Cache put error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/cache-clear', methods=['DELETE'])
def clear_cache():
    """
    전체 캐시 삭제

    서버에 저장된 모든 TTS 캐시 파일(.mp3)을 삭제합니다.

    Returns:
        {
            "success": boolean,
            "deletedCount": int
        }
    """
    try:
        deleted = 0
        errors = 0
        for f in CACHE_DIR.glob("*.mp3"):
            try:
                f.unlink()
                deleted += 1
            except FileNotFoundError:
                # 동시 요청으로 이미 삭제된 경우
                pass
            except Exception as e:
                logger.warning(f"Failed to delete cache file {f.name}: {e}")
                errors += 1

        logger.info(f"Cache cleared: {deleted} files deleted, {errors} errors")

        # 통계 초기화
        with stats_lock:
            stats_data['cacheHits'] = 0
            stats_data['cacheMisses'] = 0
        save_stats()

        return jsonify({'success': True, 'deletedCount': deleted})

    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# 통계 및 사용량 엔드포인트
# =============================================================================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """
    통계 조회

    Returns:
        {
            "totalRequests": int,
            "cacheHits": int,
            "cacheMisses": int,
            "backendRequests": int,
            "errors": int,
            "startTime": int (timestamp),
            "uptime": int (seconds),
            "cacheHitRate": float (percentage)
        }
    """
    with stats_lock:
        stats = stats_data.copy()

    stats['uptime'] = int(time.time()) - stats['startTime']

    total = stats['cacheHits'] + stats['cacheMisses']
    if total > 0:
        stats['cacheHitRate'] = round((stats['cacheHits'] / total) * 100, 2)
    else:
        stats['cacheHitRate'] = 0.0

    return jsonify(stats)


@app.route('/api/usage', methods=['GET'])
def get_usage():
    """
    사용량 조회

    Returns:
        {
            "totalCharacters": int,
            "totalRequests": int,
            "dailyUsage": {
                "YYYY-MM-DD": {
                    "characters": int,
                    "requests": int
                }
            }
        }
    """
    with usage_lock:
        usage = usage_data.copy()

    return jsonify(usage)


@app.route('/api/cache-stats', methods=['GET'])
def get_cache_stats():
    """
    캐시 통계 조회 (레거시 호환 — /api/stats 위임)
    """
    return get_stats()


# =============================================================================
# SSE 엔드포인트
# =============================================================================

@app.route('/api/events/playback', methods=['GET'])
def sse_playback():
    """
    SSE 엔드포인트 - 재생 위치 실시간 스트림

    Returns:
        text/event-stream 응답
    """
    return _sse_stream('playback', PLAYBACK_POSITION_FILE)


@app.route('/api/events/scroll', methods=['GET'])
def sse_scroll():
    """SSE 엔드포인트 - 스크롤 위치 실시간 스트림"""
    return _sse_stream('scroll', SCROLL_POSITION_FILE)


def _sse_stream(channel: str, initial_data_file: Path):
    """SSE 스트림 공통 로직 (채널별 클라이언트 분리)"""
    def generate():
        client_queue = queue.Queue(maxsize=100)
        sse_manager.add_client(client_queue, channel)

        try:
            # 연결 즉시 현재 상태 전송 (SSE data는 반드시 한 줄 JSON이어야 함)
            if initial_data_file.exists():
                with position_lock:
                    raw = initial_data_file.read_text(encoding='utf-8')
                current_data = json.dumps(
                    json.loads(raw),
                    ensure_ascii=False
                )
                yield f"event: {channel}\ndata: {current_data}\n\n"
                logger.info(f"[{channel}] Sent initial state to new client")

            while True:
                try:
                    data = client_queue.get(timeout=sse_manager.keep_alive_interval)
                    yield f"event: {channel}\ndata: {data}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        except GeneratorExit:
            logger.info(f"[{channel}] Client disconnected")
        except Exception as e:
            logger.error(f"[{channel}] SSE error: {e}")
        finally:
            sse_manager.remove_client(client_queue, channel)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )


# =============================================================================
# 재생 위치 API
# =============================================================================

@app.route('/api/playback-position', methods=['GET'])
def get_playback_position():
    """
    재생 위치 조회 (기존 호환성 유지)

    Returns:
        JSON 형식의 재생 위치 데이터
    """
    try:
        if not PLAYBACK_POSITION_FILE.exists():
            return jsonify({
                'lastPlayedIndex': -1,
                'notePath': '',
                'noteTitle': '',
                'timestamp': 0,
                'deviceId': ''
            })

        with position_lock:
            data = json.loads(PLAYBACK_POSITION_FILE.read_text(encoding='utf-8'))
        logger.info(f"GET playback position: index={data.get('lastPlayedIndex', -1)}")
        return jsonify(data)

    except Exception as e:
        logger.error(f"Error getting playback position: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/playback-position', methods=['PUT'])
def save_playback_position():
    """
    재생 위치 저장 + SSE 브로드캐스트

    Request Body:
        {
            "lastPlayedIndex": int,
            "notePath": string,
            "noteTitle": string,
            "deviceId": string
        }

    Returns:
        저장된 재생 위치 데이터
    """
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400

        last_played_index = body.get('lastPlayedIndex')
        note_path = body.get('notePath', '')
        note_title = body.get('noteTitle', '')
        device_id = body.get('deviceId', 'unknown')

        # 입력 검증
        if not isinstance(last_played_index, int):
            return jsonify({'error': 'lastPlayedIndex must be an integer'}), 400

        # 타임스탬프 생성
        timestamp = int(time.time() * 1000)

        # 데이터 구성
        position_data = {
            'lastPlayedIndex': last_played_index,
            'notePath': note_path,
            'noteTitle': note_title,
            'timestamp': timestamp,
            'deviceId': device_id
        }

        # 파일에 저장 (동시 PUT 보호)
        json_data = json.dumps(position_data, ensure_ascii=False, indent=2)
        with position_lock:
            PLAYBACK_POSITION_FILE.write_text(json_data, encoding='utf-8')

        # SSE 브로드캐스트
        broadcast_count = sse_manager.broadcast_playback_position(position_data)

        logger.info(
            f"PUT playback position: index={last_played_index}, "
            f"note={note_title}, device={device_id}, "
            f"broadcast to {broadcast_count} clients"
        )

        return jsonify({
            'success': True,
            'timestamp': timestamp,
            'broadcastCount': broadcast_count
        })

    except Exception as e:
        logger.error(f"Error saving playback position: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# 스크롤 위치 API
# =============================================================================

@app.route('/api/scroll-position', methods=['GET'])
def get_scroll_position():
    """
    스크롤 위치 조회 (기존 호환성 유지)

    Returns:
        JSON 형식의 스크롤 위치 데이터
    """
    try:
        if not SCROLL_POSITION_FILE.exists():
            return jsonify({
                'scrollTop': 0,
                'notePath': '',
                'timestamp': 0,
                'deviceId': ''
            })

        with position_lock:
            data = json.loads(SCROLL_POSITION_FILE.read_text(encoding='utf-8'))
        logger.info(f"GET scroll position: scrollTop={data.get('scrollTop', 0)}")
        return jsonify(data)

    except Exception as e:
        logger.error(f"Error getting scroll position: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/scroll-position', methods=['PUT'])
def save_scroll_position():
    """
    스크롤 위치 저장 + SSE 브로드캐스트

    Request Body:
        {
            "scrollTop": int,
            "notePath": string,
            "deviceId": string
        }

    Returns:
        저장된 스크롤 위치 데이터
    """
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400

        scroll_top = body.get('scrollTop', 0)
        note_path = body.get('notePath', '')
        device_id = body.get('deviceId', 'unknown')

        # 입력 검증
        if not isinstance(scroll_top, (int, float)):
            return jsonify({'error': 'scrollTop must be a number'}), 400

        # 타임스탬프 생성
        timestamp = int(time.time() * 1000)

        # 데이터 구성
        scroll_data = {
            'scrollTop': int(scroll_top),
            'notePath': note_path,
            'timestamp': timestamp,
            'deviceId': device_id
        }

        # 파일에 저장 (동시 PUT 보호)
        json_data = json.dumps(scroll_data, ensure_ascii=False, indent=2)
        with position_lock:
            SCROLL_POSITION_FILE.write_text(json_data, encoding='utf-8')

        # SSE 브로드캐스트
        broadcast_count = sse_manager.broadcast_scroll_position(scroll_data)

        logger.info(
            f"PUT scroll position: scrollTop={scroll_top}, "
            f"note={note_path}, device={device_id}, "
            f"broadcast to {broadcast_count} clients"
        )

        return jsonify({
            'success': True,
            'timestamp': timestamp,
            'broadcastCount': broadcast_count
        })

    except Exception as e:
        logger.error(f"Error saving scroll position: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# 메인 실행
# =============================================================================

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("tts-proxy 통합 서버 시작")
    logger.info("=" * 60)
    logger.info(f"포트: {PORT}")
    logger.info(f"데이터 디렉토리: {DATA_DIR.absolute()}")
    logger.info(f"캐시 디렉토리: {CACHE_DIR.absolute()}")
    logger.info(f"TTS 백엔드: {TTS_BACKEND_URL}")
    logger.info(f"SSE 매니저: in-memory")
    logger.info("")
    logger.info("TTS 엔드포인트:")
    logger.info(f"  - POST /api/tts")
    logger.info(f"  - POST /api/tts-stream")
    logger.info(f"  - POST /v1/audio/speech")
    logger.info(f"  - GET/PUT /api/cache/<key>")
    logger.info(f"  - DELETE /api/cache-clear")
    logger.info(f"  - GET /api/stats")
    logger.info(f"  - GET /api/usage")
    logger.info("")
    logger.info("SSE 엔드포인트:")
    logger.info(f"  - GET /api/events/playback")
    logger.info(f"  - GET /api/events/scroll")
    logger.info("")
    logger.info("위치 동기화 엔드포인트:")
    logger.info(f"  - GET/PUT /api/playback-position")
    logger.info(f"  - GET/PUT /api/scroll-position")
    logger.info("")
    logger.info("헬스 체크:")
    logger.info(f"  - GET /health")
    logger.info("=" * 60)

    # 개발 서버 실행 (프로덕션에서는 gunicorn 등 사용 권장)
    app.run(host='0.0.0.0', port=PORT, threaded=True, debug=False)
