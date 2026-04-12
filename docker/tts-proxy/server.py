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
import json
import time
import queue
import logging
import requests
from pathlib import Path

from flask import Flask, request, jsonify, Response
from flask_cors import CORS

from sse_manager import SSEManager, RedisSSEManager
from vad_processor import trim_silence, VAD_ENABLED, is_loaded as vad_is_loaded
from cache_manager import CacheManager

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
REDIS_ENABLED = os.environ.get('REDIS_ENABLED', 'false').lower() == 'true'
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))

# TTS 백엔드 설정
TTS_BACKEND_URL = os.environ.get('TTS_BACKEND_URL', 'http://localhost:5050')
TTS_TIMEOUT = int(os.environ.get('TTS_TIMEOUT', '30'))
TTS_MODEL = os.environ.get('TTS_MODEL', '')  # 빈 값이면 클라이언트 요청 그대로 전달

# 데이터 디렉토리 생성
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 파일 경로
PLAYBACK_POSITION_FILE = DATA_DIR / 'playback-position.json'
SCROLL_POSITION_FILE = DATA_DIR / 'scroll-position.json'

# 캐시 매니저 초기화
cache_mgr = CacheManager(DATA_DIR)

# SSE 매니저 초기화
if REDIS_ENABLED:
    logger.info(f"Initializing Redis SSE Manager (redis://{REDIS_HOST}:{REDIS_PORT})")
    sse_manager = RedisSSEManager(redis_host=REDIS_HOST, redis_port=REDIS_PORT)
else:
    logger.info("Initializing in-memory SSE Manager")
    sse_manager = SSEManager()


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
        'redis_enabled': REDIS_ENABLED,
        'tts_backend': TTS_BACKEND_URL,
        'vad_enabled': VAD_ENABLED,
        'vad_loaded': vad_is_loaded()
    })


# =============================================================================
# TTS 공통 핸들러
# =============================================================================

def _handle_tts_request(text: str, voice: str, model: str = 'tts-1',
                        rate: str = None, use_cache: bool = True) -> Response:
    """
    모든 TTS 엔드포인트의 공통 로직.

    1. 캐시 확인 → 2. 백엔드 요청 → 3. VAD 트리밍 → 4. 캐시 저장 → 5. 응답
    """
    # TTS_MODEL 환경변수가 설정되면 모델명 오버라이드 (MLX 등 로컬 백엔드용)
    effective_model = TTS_MODEL if TTS_MODEL else model

    cache_key = cache_mgr.generate_cache_key(text, voice, rate)
    cache_file = cache_mgr.cache_path(cache_key)

    # 캐시 히트
    if use_cache and cache_file.exists():
        logger.info(f"Cache HIT: {cache_key[:16]}...")
        cache_mgr.update_stats(cache_hit=True)
        audio_data = cache_file.read_bytes()
        return Response(audio_data, mimetype='audio/mpeg', headers={
            'Content-Length': str(len(audio_data)),
            'X-Cache': 'HIT',
            'Access-Control-Allow-Origin': '*'
        })

    # 캐시 미스 → 백엔드 요청
    logger.info(f"Cache MISS: {cache_key[:16]}..., requesting backend...")
    cache_mgr.update_stats(cache_hit=False, backend_request=True)
    cache_mgr.update_usage(text)

    try:
        response = requests.post(
            f"{TTS_BACKEND_URL}/v1/audio/speech",
            json={'model': effective_model, 'input': text, 'voice': voice},
            timeout=TTS_TIMEOUT,
            stream=True
        )
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"TTS backend request failed: {e}")
        cache_mgr.update_stats(error=True)
        return jsonify({'error': f'TTS backend error: {str(e)}'}), 502

    # VAD 트리밍 + 캐시 저장
    audio_data = trim_silence(response.content)
    if use_cache:
        cache_file.write_bytes(audio_data)
        logger.info(f"Saved to cache: {cache_key[:16]}...")

    return Response(audio_data, mimetype='audio/mpeg', headers={
        'Content-Length': str(len(audio_data)),
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*'
    })


# =============================================================================
# TTS 엔드포인트 (프록시 to openai-edge-tts)
# =============================================================================

@app.route('/api/tts', methods=['GET'])
def tts_hybrid_get():
    """TTS 생성 (GET 요청 - audio.src 지원)"""
    try:
        text = request.args.get('text', '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400
        voice = request.args.get('voice', 'alloy')
        return _handle_tts_request(text, voice)
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        cache_mgr.update_stats(error=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts', methods=['POST'])
def tts_hybrid():
    """TTS 생성 (하이브리드 프록시 — rate, useCache 지원)"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400
        text = body.get('text', '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400
        voice = body.get('voice', 'alloy')
        rate = body.get('rate')
        use_cache = body.get('useCache', True)
        return _handle_tts_request(text, voice, rate=rate, use_cache=use_cache)
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        cache_mgr.update_stats(error=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts-stream', methods=['POST'])
def tts_azure_compatible():
    """TTS 생성 (Azure TTS API 호환)"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400
        text = body.get('text', '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400
        voice = body.get('voice', 'alloy')
        return _handle_tts_request(text, voice)
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        cache_mgr.update_stats(error=True)
        return jsonify({'error': str(e)}), 500


@app.route('/v1/audio/speech', methods=['POST'])
def tts_openai_compatible():
    """TTS 생성 (OpenAI Audio Speech API 호환)"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'No data provided'}), 400
        model = body.get('model', 'tts-1')
        text = body.get('input', '').strip()
        voice = body.get('voice', 'alloy')
        if not text:
            return jsonify({'error': 'input is required'}), 400
        return _handle_tts_request(text, voice, model=model)
    except Exception as e:
        logger.error(f"TTS request error: {e}")
        cache_mgr.update_stats(error=True)
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
        cache_file = cache_mgr.cache_dir / f"{key}.mp3"

        if not cache_file.exists():
            # 축약형 키로 검색
            for f in cache_mgr.cache_dir.glob("*.mp3"):
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
        cache_file = cache_mgr.cache_dir / f"{key}.mp3"
        audio_data = request.get_data()

        if not audio_data:
            return jsonify({'error': 'No data provided'}), 400

        cache_file.write_bytes(audio_data)
        logger.info(f"Cache saved: {key[:16]}...")

        return jsonify({'success': True, 'key': key})

    except Exception as e:
        logger.error(f"Cache put error: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# 통계 및 사용량 엔드포인트
# =============================================================================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """통계 조회"""
    return jsonify(cache_mgr.get_stats_summary())


@app.route('/api/usage', methods=['GET'])
def get_usage():
    """사용량 조회"""
    with cache_mgr._usage_lock:
        usage = cache_mgr.usage.copy()
    return jsonify(usage)


@app.route('/api/cache-stats', methods=['GET'])
def get_cache_stats():
    """캐시 통계 조회 (레거시 호환용 — /api/stats 동일)"""
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
    def generate():
        client_queue = queue.Queue(maxsize=100)
        sse_manager.add_client(client_queue)

        try:
            # 연결 즉시 현재 상태 전송
            if PLAYBACK_POSITION_FILE.exists():
                current_data = PLAYBACK_POSITION_FILE.read_text(encoding='utf-8')
                # JSON 여러 줄 제거 (SSE 호환성을 위해 한 줄로)
                import json
                try:
                    parsed = json.loads(current_data)
                    current_data = json.dumps(parsed, ensure_ascii=False, separators=(',', ':'))
                except:
                    pass  # 이미 문자열이면 그대로 사용
                yield f"event: playback\ndata: {current_data}\n\n"
                logger.info("Sent current playback position to new client")

            # 메인 SSE 루프
            while True:
                try:
                    # 클라이언트 큐에서 메시지 대기 (타임아웃으로 keep-alive 전송)
                    data = client_queue.get(timeout=sse_manager.keep_alive_interval)
                    yield f"event: playback\ndata: {data}\n\n"
                    logger.debug(f"Sent playback update: {data[:50]}...")
                except queue.Empty:
                    # keep-alive 전송 (연결 유지)
                    yield ": keep-alive\n\n"
        except GeneratorExit:
            logger.info("Client disconnected gracefully")
        except Exception as e:
            logger.error(f"SSE generator error: {e}")
        finally:
            sse_manager.remove_client(client_queue)
            logger.info("SSE connection cleaned up")

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


@app.route('/api/events/scroll', methods=['GET'])
def sse_scroll():
    """
    SSE 엔드포인트 - 스크롤 위치 실시간 스트림

    Returns:
        text/event-stream 응답
    """
    def generate():
        client_queue = queue.Queue(maxsize=100)
        sse_manager.add_client(client_queue)

        try:
            # 연결 즉시 현재 상태 전송
            if SCROLL_POSITION_FILE.exists():
                current_data = SCROLL_POSITION_FILE.read_text(encoding='utf-8')
                yield f"event: scroll\ndata: {current_data}\n\n"
                logger.info("Sent current scroll position to new client")

            # 메인 SSE 루프
            while True:
                try:
                    data = client_queue.get(timeout=sse_manager.keep_alive_interval)
                    yield f"event: scroll\ndata: {data}\n\n"
                    logger.debug(f"Sent scroll update: {data[:50]}...")
                except queue.Empty:
                    yield ": keep-alive\n\n"
        except GeneratorExit:
            logger.info("Client disconnected gracefully")
        except Exception as e:
            logger.error(f"SSE generator error: {e}")
        finally:
            sse_manager.remove_client(client_queue)
            logger.info("SSE connection cleaned up")

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

        # 파일에 저장
        json_data = json.dumps(position_data, ensure_ascii=False, indent=2)
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

        # 파일에 저장
        json_data = json.dumps(scroll_data, ensure_ascii=False, indent=2)
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
    logger.info(f"캐시 디렉토리: {cache_mgr.cache_dir.absolute()}")
    logger.info(f"TTS 백엔드: {TTS_BACKEND_URL}")
    logger.info(f"Redis 활성화: {REDIS_ENABLED}")
    logger.info("")
    logger.info("TTS 엔드포인트:")
    logger.info(f"  - POST /api/tts")
    logger.info(f"  - POST /api/tts-stream")
    logger.info(f"  - POST /v1/audio/speech")
    logger.info(f"  - GET/PUT /api/cache/<key>")
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
