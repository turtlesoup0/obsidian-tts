---
spec_id: SPEC-PERF-001
title: TTS 위치 추적을 위한 폴링 대체 동기화 방식 검토
status: Planned
priority: High
created: 2026-02-05
tags: performance, synchronization, websocket, sse, event-driven
related_specs: []
---

# 구현 계획 (Implementation Plan)

## 개요

이 문서는 SPEC-PERF-001의 구현 계획을 정의한다. 현재 폴링 기반 TTS 위치 동기화 시스템의 문제를 분석하고, 더 효율적인 대안을 검토하여 최적의 솔루션을 도출한다.

---

## 마일스톤 (Milestones)

### 1차 마일스톤: 현재 시스템 분석 (최우선)

**목표**: 현재 폴링 방식의 성능 특성과 문제점을 정량적으로 파악

**작업 항목**:
- [ ] 현재 구현 코드 분석
  - [ ] `playbackPositionManager` 전체 흐름 파악
  - [ ] `ServerScrollPositionManager` 전체 흐름 파악
  - [ ] 폴링 간격 확인 (하드코딩 또는 설정값)
- [ ] 성능 지표 측정
  - [ ] 현재 요청 빈도 (요청/분)
  - [ ] 평균 응답 시간
  - [ ] 데이터 전송량/요청
- [ ] 문제점 문서화
  - [ ] `startPolling`/`stopPolling` 에러 원인 규명
  - [ ] 배터리 소모 측정 (모바일)
  - [ ] 불필요한 요청 비율 분석

**성공 기준**:
- 현재 시스템의 성능 특성이 수치화됨
- 개선이 필요한 영역이 명확히 식별됨

**의존성**: 없음

---

### 2차 마일스톤: 기술적 타당성 평가 (1차 마일스톤 완료 후)

**목표**: 각 대안 기술이 Obsidian 환경에서 구현 가능한지 평가

**작업 항목**:
- [ ] Obsidian DataviewJS API 확인
  - [ ] WebSocket API 지원 여부 테스트
  - [ ] EventSource API 지원 여부 테스트
  - [ ] Page Visibility API 지원 여부 테스트
- [ ] Azure 서비스 통합 테스트
  - [ ] Azure Functions + SignalR binding 테스트
  - [ ] Azure Functions + Event Grid 테스트
  - [ ] Blob Storage Events 테스트
- [ ] 모바일 환경 테스트
  - [ ] iOS Obsidian 앱에서 테스트
  - [ ] Android Obsidian 앱에서 테스트
  - [ ] 백그라운드 탭에서 연결 유지 테스트

**성공 기준**:
- 각 대안의 기술적 타당성이 명확히 평가됨
- 구현 불가능한 옵션이 제외됨

**의존성**: 1차 마일스톤 완료

---

### 3차 마일스톤: tts-proxy SSE 구현 (최우선) ⭐

**목표**: tts-proxy Flask 서버에 SSE 기반 실시간 동기화 구현

**작업 항목**:
- [ ] 백엔드 구현 (tts-proxy Flask)
  - [ ] SSE 클라이언트 관리자 클래스 구현
  - [ ] `/api/events/playback` SSE 엔드포인트 구현
  - [ ] `/api/events/scroll` SSE 엔드포인트 구현
  - [ ] 기존 PUT 핸들러 수정하여 SSE 브로드캐스트 추가
  - [ ] keep-alive heartbeat 메시지 구현
  - [ ] 연결 종료 처리 및 리소스 정리

- [ ] Redis Pub/Sub 통합 (선택)
  - [ ] Redis Pub/Sub 브로드캐스트 구현
  - [ ] 다중 프로세스/서버 지원
  - [ ] 폴백: 인메모리 큐 (Redis 불가 시)

- [ ] 클라이언트 구현 (Obsidian 템플릿)
  - [ ] EventSource 연결 매니저 구현
  - [ ] Page Visibility API 통합
  - [ ] SSE 이벤트 핸들러 구현
  - [ ] 자동 재연결 로직 구현
  - [ ] 폴백: Azure Functions 폴링 (SSE 불가 시)

- [ ] 테스트
  - [ ] 단위 테스트: SSE 매니저, 브로드캐스트
  - [ ] 통합 테스트: 클라이언트-서버 SSE 연결
  - [ ] 다중 디바이스 테스트
  - [ ] 배터리 소모 측정

**성공 기준**:
- SSE 연결이 정상적으로 established
- 위치 변경 시 < 100ms 내에 다른 클라이언트에 반영
- 배터리 소모 50% 이상 개선
- Azure Functions 호출 90% 이상 감소

**의존성**: 2차 마일스톤 완료 (EventSource 지원 확인)

---

### 4차 마일스톤: 폴백 전략 및 폴링 최적화 (3차와 병행)

**목표**: SSE 실패 시에도 기본 동기화 기능 유지

**작업 항목**:
- [ ] 폴백 메커니즘 구현
  - [ ] 엣지서버 연결 감지
  - [ ] SSE 연결 실패 시 Azure Functions 폴링 자동 전환
  - [ ] 네트워크 복구 시 SSE 모드 자동 복귀
  - [ ] 오프라인 모드 지원

- [ ] Page Visibility API 통합
  - [ ] 백그라운드 진입 시 SSE 연결 해제
  - [ ] 포그라운드 복귀 시 SSE 연결 재수립
  - [ ] 백그라운드에서 폴링 완전 중지

- [ ] 동기화 상태 인디케이터
  - [ ] 연결 상태 UI (SSE/폴링/오프라인)
  - [ ] 실시간 동기화 표시기

**성공 기준**:
- 엣지서버 다운 시에도 동기화 계속 작동
- 백그라운드에서 배터리 소모 최소화
- 사용자가 현재 동기화 모드를 명확히 인지

**의존성**: 3차 마일스톤과 병행 가능

---

### 5차 마일스톤: 배포 및 문서화

**목표**: 프로덕션 배포 및 사용자 가이드 제공

**작업 항목**:
- [ ] tts-proxy 배포
  - [ ] Mac mini에 Flask 서버 설치
  - [ ] 방화벽/포트 설정 (5051)
  - [ ] Docker 컨테이너화 (선택)
  - [ ] systemd 서비스 등록

- [ ] 클라이언트 템플릿 업데이트
  - [ ] v5-keychain 템플릿에 SSE 클라이언트 추가
  - [ ] 설정 파일에 엣지서버 URL 추가

- [ ] 문서화
  - [ ] 엣지서버 설치 가이드
  - [ ] SSE 동기화 사용법
  - [ ] 문제 해결 가이드
  - [ ] API 문서 업데이트

**성공 기준**:
- tts-proxy가 Mac mini에서 안정적으로 실행
- 다중 디바이스에서 실시간 동기화 작동
- 사용자가 설치 및 사용법을 명확히 이해

**의존성**: 3차, 4차 마일스톤 완료

---

### 4차 마일스톤: 최종 권장 사항 도출 (3차 마일스톤 완료 후)

**목표**: PoC 결과를 바탕으로 최종 구현 방식 결정

**작업 항목**:
- [ ] 성능 비교 분석
  - [ ] 지연 시간 비교
  - [ ] 배터리 소모 비교
  - [ ] 데이터 사용량 비교
- [ ] 비용 분석
  - [ ] 초기 개발 비용
  - [ ] 월 운영 비용
  - [ ] 확장성 고려
- [ ] 사용자 경험 평가
  - [ ] UI 반응성
  - [ ] 오프라인 지원
  - [ ] 충돌 해결 UX
- [ ] 최종 권장 사항 문서화

**성공 기준**:
- 각 방식의 장단점이 명확히 비교됨
- 최종 권장 사항과 근거가 제시됨

**의존성**: 3차 마일스톤 완료

---

## 기술적 접근 (Technical Approach)

### 1. 현재 시스템 분석 방법

**코드 분석**:
```bash
# 1. 관련 파일 찾기
grep -r "startPolling\|stopPolling" templates/
grep -r "setInterval\|setTimeout" templates/ | grep -i "position"

# 2. 동기화 로직 파악
grep -A 10 "syncPosition" templates/
grep -A 10 "getPosition\|savePosition" templates/
```

**성능 측정 도구**:
- 브라우저 DevTools Network 탭
- Azure Monitor (Functions 요청 로그)
- Lighthouse (배터리 성능)

### 2. PoC 구현 가이드

#### PoC 1: 폴링 최적화

**구현 위치**:
- `templates/v5-keychain/tts-reader-v5-keychain.md`
- `playbackPositionManager` 객체 수정

**핵심 코드**:
```javascript
// Page Visibility API 추가
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 백그라운드: 폴링 중지
        this.stopPolling();
    } else {
        // 포그라운드: 즉시 동기화 + 폴링 재개
        this.syncPosition();
        this.startPolling();
    }
});

// 동적 폴링 간격 (활성화된지 얼마나 되었는지에 따라)
getPollingInterval() {
    const idleTime = Date.now() - this.lastActivityTime;
    if (idleTime > 300000) return 30000; // 5분 비활성: 30초 폴링
    if (idleTime > 60000) return 10000;  // 1분 비활성: 10초 폴링
    return 5000;                          // 활성: 5초 폴링
}
```

#### PoC 2: Optimistic UI

**구현 위치**:
- `playbackPositionManager.savePosition()` 수정

**핵심 코드**:
```javascript
async savePosition(lastPlayedIndex, notePath, noteTitle) {
    // 1. 즉시 로컬 업데이트 (Optimistic)
    localStorage.setItem('azureTTS_lastPlayedIndex', lastPlayedIndex.toString());
    localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
    this.updateUI(lastPlayedIndex); // 즉시 UI 반영

    // 2. 백그라운드에서 서버 동기화
    try {
        const response = await fetch(this.apiEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lastPlayedIndex,
                notePath,
                noteTitle,
                deviceId: this.deviceId,
                timestamp: Date.now()
            })
        });

        if (!response.ok) {
            // 서버 실패 시 롤백 고려
            console.warn('Server sync failed, keeping local update');
        }
    } catch (error) {
        console.error('Background sync failed:', error);
        // 네트워크 오류도 로컬 업데이트는 유지
    }
}
```

#### PoC 3: SSE (선택)

**Azure Functions (스트리밍 응답)**:
```javascript
// src/functions/position-stream.js
app.http('position-stream', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'position-stream',
    handler: async (request, context) => {
        return {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: (async function* () {
                while (true) {
                    const position = await getLatestPosition();
                    yield `data: ${JSON.stringify(position)}\n\n`;
                    await new Promise(r => setTimeout(r, 5000));
                }
            })()
        };
    }
});
```

**클라이언트 (EventSource)**:
```javascript
const eventSource = new EventSource(API_ENDPOINT + '/api/position-stream');

eventSource.onmessage = (event) => {
    const position = JSON.parse(event.data);
    this.handlePositionUpdate(position);
};

eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    // 자동 재연결은 EventSource가 처리
};
```

### 3. 성능 비교 지표

| 지표 | 측정 방법 | 목표 |
|------|-----------|------|
| 동기화 지연 시간 | 변경 발생부터 반영까지의 시간 | < 100ms (SSE) |
| 배터리 소모 | 1시간 사용 배터리 감소율 | < 2% (SSE) |
| 데이터 사용량 | 1시간 사용 데이터 전송량 | < 10KB (SSE) |
| 서버 요청 수 | 1시간당 API 호출 횟수 | < 10회 (PUT만) |
| 오프라인 지원 | 네트워크 차단 시 작동 여부 | 지원 |

**SSE vs 폴링 비교**:

| 지표 | 폴링 (5초) | SSE | 개선율 |
|------|-----------|-----|--------|
| 지연 시간 | 0-5초 | < 100ms | **50배** |
| 요청 수/시간 | 720회 | 10회 | **98% 감소** |
| 배터리 소모 | 기준 | -50% | **2배 개선** |
| 데이터 전송 | ~50KB/시간 | ~5KB/시간 | **90% 감소** |

---

## tts-proxy SSE 구현 가이드 (상세)

### 백엔드 구조 (Flask + Python)

#### 프로젝트 구조

```
tts-proxy/
├── server.py              # Flask 메인 서버
├── sse_manager.py         # SSE 클라이언트 관리
├── requirements.txt       # Python 의존성
├── data/
│   └── tts-cache/         # 캐시 디렉토리
└── docker-compose.yml     # (선택) Docker 배포
```

#### 1. server.py - Flask 메인 서버

```python
# tts-proxy/server.py
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
import time
import os
from pathlib import Path
from sse_manager import SSEManager, broadcast_event

app = Flask(__name__)
CORS(app)  # CORS 허용 (개발 환경)

# 데이터 디렉토리
DATA_DIR = Path('/data/tts-cache')
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 파일 경로
PLAYBACK_POSITION_FILE = DATA_DIR / 'playback-position.json'
SCROLL_POSITION_FILE = DATA_DIR / 'scroll-position.json'

# SSE 매니저 초기화
sse_manager = SSEManager()

# ============================================
# API 엔드포인트: GET/PUT 재생 위치
# ============================================

@app.route('/api/playback-position', methods=['GET'])
def get_playback_position():
    """재생 위치 조회 (기존 호환성 유지)"""
    try:
        if PLAYBACK_POSITION_FILE.exists():
            data = json.loads(PLAYBACK_POSITION_FILE.read_text())
            return jsonify(data)
        return jsonify({'lastPlayedIndex': -1})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/playback-position', methods=['PUT'])
def save_playback_position():
    """재생 위치 저장 + SSE 브로드캐스트"""
    try:
        data = request.json
        data['timestamp'] = int(time.time() * 1000)

        # 파일 저장
        PLAYBACK_POSITION_FILE.write_text(json.dumps(data, indent=2))

        # SSE 브로드캐스트
        sse_manager.broadcast('playback', data)

        return jsonify({'success': True, 'timestamp': data['timestamp']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# SSE 엔드포인트: 실시간 이벤트 스트림
# ============================================

@app.route('/api/events/playback')
def sse_playback():
    """재생 위치 SSE 엔드포인트"""
    return sse_manager.stream('playback', PLAYBACK_POSITION_FILE)

@app.route('/api/events/scroll')
def sse_scroll():
    """스크롤 위치 SSE 엔드포인트"""
    return sse_manager.stream('scroll', SCROLL_POSITION_FILE)

# ============================================
# 헬스 체크
# ============================================

@app.route('/health')
def health():
    """헬스 체크 엔드포인트"""
    return jsonify({
        'status': 'healthy',
        'sse_clients': len(sse_manager.clients),
        'timestamp': int(time.time() * 1000)
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5051, debug=False, threaded=True)
```

#### 2. sse_manager.py - SSE 클라이언트 관리

```python
# tts-proxy/sse_manager.py
import queue
import threading
import json
from pathlib import Path
from flask import Response

class SSEManager:
    """SSE 클라이언트 연결 관리 및 브로드캐스트"""

    def __init__(self):
        self.clients = []  # [(queue, event_type), ...]
        self.lock = threading.Lock()

    def add_client(self, q, event_type):
        """클라이언트 연결 추가"""
        with self.lock:
            self.clients.append((q, event_type))
        print(f"[SSE] 클라이언트 연결됨: {event_type}, 총 {len(self.clients)}개")

    def remove_client(self, q):
        """클라이언트 연결 제거"""
        with self.lock:
            self.clients = [(cq, et) for cq, et in self.clients if cq is not q]
        print(f"[SSE] 클라이언트 연결 해제, 총 {len(self.clients)}개")

    def broadcast(self, event_type, data):
        """모든 구독 클라이언트에게 브로드캐스트"""
        json_data = json.dumps(data)
        with self.lock:
            disconnected = []
            for q, subscribed_type in self.clients:
                if subscribed_type == event_type:
                    try:
                        q.put_nowait((event_type, json_data))
                    except queue.Full:
                        disconnected.append(q)
                    except Exception as e:
                        print(f"[SSE] 브로드캐스트 실패: {e}")
                        disconnected.append(q)

            # 실패한 연결 정리
            for q in disconnected:
                self.remove_client(q)

        print(f"[SSE] 브로드캐스트: {event_type} → {len(self.clients)}클라이언트")

    def stream(self, event_type, position_file):
        """SSE 스트림 생성 (Flask Response용)"""
        def generate():
            q = queue.Queue(maxsize=100)
            self.add_client(q, event_type)

            try:
                # 연결 즉시 현재 상태 전송
                if position_file.exists():
                    current_data = position_file.read_text()
                    yield f"event: {event_type}\ndata: {current_data}\n\n"

                # keep-alive 타이머
                last_heartbeat = time.time()

                while True:
                    try:
                        # 이벤트 대기 (30초 타임아웃)
                        event_type, data = q.get(timeout=30)
                        yield f"event: {event_type}\ndata: {data}\n\n"
                        last_heartbeat = time.time()
                    except queue.Empty:
                        # 30초마다 keep-alive 전송
                        if time.time() - last_heartbeat > 30:
                            yield ": keep-alive\n\n"
                            last_heartbeat = time.time()
            finally:
                self.remove_client(q)

        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',  # Nginx 버퍼링 방지
                'Access-Control-Allow-Origin': '*'
            }
        )


# ============================================
# Redis Pub/Sub 확장 (선택)
# ============================================

class RedisSSEManager(SSEManager):
    """Redis Pub/Sub 기반 SSE 매니저 (다중 프로세스 지원)"""

    def __init__(self, redis_host='localhost', redis_port=6379):
        super().__init__()
        try:
            import redis
            self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
            self.pubsub = self.redis_client.pubsub()
            self.redis_available = True
            print("[SSE] Redis Pub/Sub 활성화")
        except ImportError:
            print("[SSE] Redis 모듈 없음, 인메모리 모드 사용")
            self.redis_available = False
        except Exception as e:
            print(f"[SSE] Redis 연결 실패: {e}, 인메모리 모드 사용")
            self.redis_available = False

    def broadcast(self, event_type, data):
        """Redis Pub/Sub 또는 인메모리 브로드캐스트"""
        json_data = json.dumps(data)

        if self.redis_available:
            try:
                channel = f"tts:{event_type}"
                self.redis_client.publish(channel, json_data)
                print(f"[SSE] Redis 브로드캐스트: {channel}")
            except Exception as e:
                print(f"[SSE] Redis 브로드캐스트 실패: {e}, 인메모리 폴백")
                super().broadcast(event_type, data)
        else:
            super().broadcast(event_type, data)

    def subscribe_redis(self, event_type, callback):
        """Redis 채널 구독 (백그라운드 스레드)"""
        if not self.redis_available:
            return

        def redis_listener():
            self.pubsub.subscribe(f"tts:{event_type}")
            for message in self.pubsub.listen():
                if message['type'] == 'message':
                    callback(message['data'])

        thread = threading.Thread(target=redis_listener, daemon=True)
        thread.start()
```

#### 3. requirements.txt

```txt
Flask==3.0.0
flask-cors==4.0.0
redis==5.0.1  # 선택: Redis Pub/Sub 사용 시
```

---

### 클라이언트 구현 (Obsidian 템플릿)

#### SSE 클라이언트 매니저

```javascript
// tts-reader-v5-keychain.md에 추가

// ============================================
// 🔄 SSE 실시간 동기화 매니저
// ============================================

window.sseSyncManager = {
    eventSource: null,
    edgeServerUrl: null,
    isEnabled: false,

    /**
     * 엣지서버 SSE 연결 초기화
     */
    async init(edgeServerUrl) {
        this.edgeServerUrl = edgeServerUrl;

        // EventSource 지원 확인
        if (typeof EventSource === 'undefined') {
            console.warn('⚠️ EventSource not supported, fallback to polling');
            return false;
        }

        try {
            // 엣지서버 헬스 체크
            const healthResponse = await fetch(`${edgeServerUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)  // 3초 타임아웃
            });

            if (!healthResponse.ok) {
                throw new Error('Edge server unhealthy');
            }

            const health = await healthResponse.json();
            console.log('✅ Edge server healthy:', health);

            // SSE 연결
            this.connect();
            this.isEnabled = true;
            return true;

        } catch (error) {
            console.warn('⚠️ Edge server not available:', error.message);
            this.isEnabled = false;
            return false;
        }
    },

    /**
     * SSE 연결 시작
     */
    connect() {
        if (this.eventSource) {
            console.log('SSE already connected');
            return;
        }

        const url = `${this.edgeServerUrl}/api/events/playback`;
        console.log('🔌 Connecting to SSE:', url);

        this.eventSource = new EventSource(url);

        // 연결 성공
        this.eventSource.onopen = () => {
            console.log('✅ SSE connected');
            this.showConnectionStatus('sse');
        };

        // 재생 위치 이벤트 수신
        this.eventSource.addEventListener('playback', (event) => {
            const data = JSON.parse(event.data);
            this.handlePlaybackUpdate(data);
        });

        // 기본 메시지 핸들러
        this.eventSource.onmessage = (event) => {
            console.log('📨 SSE message:', event.data);
        };

        // 에러 처리
        this.eventSource.onerror = (error) => {
            console.error('❌ SSE error:', error);
            this.showConnectionStatus('disconnected');

            // EventSource는 자동 재연결을 시도함
            // 3초 후 재시도 (브라우저 기본 동작)
        };
    },

    /**
     * SSE 연결 해제
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            console.log('🔌 SSE disconnected');
        }
    },

    /**
     * 재생 위치 업데이트 처리
     */
    handlePlaybackUpdate(data) {
        console.log('📥 Playback update received:', data);

        // 타임스탬프 비교로 충돌 해결
        const localTimestamp = parseInt(
            localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0',
            10
        );

        if (data.timestamp && data.timestamp > localTimestamp) {
            // 서버 데이터가 더 최신이면 업데이트
            localStorage.setItem('azureTTS_lastPlayedIndex', data.lastPlayedIndex.toString());
            localStorage.setItem('azureTTS_lastPlayedTimestamp', data.timestamp.toString());

            // UI 업데이트 (TTS 리더가 실행 중이면)
            if (window.azureTTSReader) {
                window.azureTTSReader.lastPlayedIndex = data.lastPlayedIndex;
                window.azureTTSReader.currentIndex = data.lastPlayedIndex;

                // 현재 문장 하이라이트
                if (typeof highlightCurrentSentence === 'function') {
                    highlightCurrentSentence();
                }
            }

            console.log(`✅ Position synced: index ${data.lastPlayedIndex}`);
        }
    },

    /**
     * 연결 상태 표시
     */
    showConnectionStatus(status) {
        const statusMap = {
            'sse': '🟢 실시간 동기화',
            'polling': '🟡 폴링 동기화',
            'offline': '🔴 오프라인'
        };

        const statusElement = document.getElementById('sync-status-indicator');
        if (statusElement) {
            statusElement.textContent = statusMap[status] || status;
        }
    }
};

// ============================================
// Page Visibility API 연동 (배터리 절약)
// ============================================

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 백그라운드: SSE 연결 해제
        if (window.sseSyncManager.isEnabled) {
            window.sseSyncManager.disconnect();
            console.log('🌙 Background: SSE disconnected for battery saving');
        }
    } else {
        // 포그라운드: SSE 연결 재수립
        if (window.sseSyncManager.isEnabled) {
            window.sseSyncManager.connect();
            console.log('☀️ Foreground: SSE reconnected');

            // 즉시 최신 상태 동기화
            window.playbackPositionManager.syncPosition();
        }
    }
});
```

---

### Redis Pub/Sub 통합 (선택 사항)

#### Redis 확장을 위한 server.py 수정

```python
# sse_manager.py 사용
from sse_manager import RedisSSEManager

# Redis SSE 매니저 초기화 (인메모리 폴백 포함)
sse_manager = RedisSSEManager(redis_host='localhost', redis_port=6379)
```

#### Docker Compose 구성

```yaml
# docker-compose.yml
version: '3.8'
services:
  tts-proxy:
    build: .
    ports:
      - "5051:5051"
    volumes:
      - ./data:/data/tts-cache
    depends_on:
      - redis
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

---

## 아키텍처 설계 (Architecture Design)

### 권장 방식: tts-proxy SSE + 폴백

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Obsidian Client A                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ EventSource  │  │ Page Vis.    │  │ Fallback     │              │
│  │ (SSE Client) │──│ API          │──│ Polling      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│         │                                                      │
└─────────┼──────────────────────────────────────────────────────┘
          │ SSE (GET /api/events/playback)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      tts-proxy (Flask)                             │
│  Port: 5051                                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ SSE Manager                                                  │  │
│  │  - clients: [(queue, event_type), ...]                      │  │
│  │  - broadcast(event_type, data)                              │  │
│  │  - stream(event_type, file) → Response                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                                                   │
│         │ PUT /api/playback-position                       │ SSE
│         ▼                                                   ▼
│  ┌──────────────────┐                              ┌──────────────┐
│  │ File Storage     │                              │ Client Queue │
│  │ playback-        │                              │ (stream)     │
│  │ position.json    │                              └──────────────┘
│  └──────────────────┘                                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Redis Pub/Sub (optional)
                          ▼
                  ┌───────────────┐
                  │ Redis         │
                  │ Port: 6379    │
                  └───────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Obsidian Client B                           │
│  ┌──────────────┐                                                   │
│  │ EventSource  │ ◄── SSE Broadcast (real-time push)               │
│  │ (SSE Client) │                                                   │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Azure Functions (Fallback)                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ playback-position.js (PUT/GET)                               │  │
│  │ Blob Storage: playback-position.json                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**작동 순서**:

1. **초기화**: 클라이언트가 tts-proxy `/health` 확인
2. **SSE 연결**: EventSource로 `/api/events/playback` 구독
3. **위치 변경**: 클라이언트 A가 PUT `/api/playback-position` 요청
4. **브로드캐스트**: tts-proxy가 모든 SSE 클라이언트에 푸시
5. **실시간 반영**: 클라이언트 B가 < 100ms 내에 업데이트 수신
6. **배터리 절약**: 백그라운드 시 SSE 연결 해제
7. **폴백**: tts-proxy 불가 시 Azure Functions 폴링 자동 전환

---

## 테스트 전략 (Testing Strategy)

### 단위 테스트 (Unit Tests)

#### SSE 매니저 테스트

```python
# tests/test_sse_manager.py
import pytest
import queue
import time
import json
from sse_manager import SSEManager

def test_add_client():
    """클라이언트 연결 추가 테스트"""
    manager = SSEManager()
    q = queue.Queue()
    manager.add_client(q, 'playback')

    assert len(manager.clients) == 1
    assert manager.clients[0] == (q, 'playback')

def test_remove_client():
    """클라이언트 연결 제거 테스트"""
    manager = SSEManager()
    q = queue.Queue()
    manager.add_client(q, 'playback')
    manager.remove_client(q)

    assert len(manager.clients) == 0

def test_broadcast():
    """브로드캐스트 테스트"""
    manager = SSEManager()
    q1 = queue.Queue()
    q2 = queue.Queue()
    manager.add_client(q1, 'playback')
    manager.add_client(q2, 'playback')

    data = {'lastPlayedIndex': 42, 'timestamp': 1234567890}
    manager.broadcast('playback', data)

    # 두 큐 모두 데이터 수신 확인
    event_type, json_data = q1.get(timeout=1)
    assert event_type == 'playback'
    assert json.loads(json_data) == data

    event_type, json_data = q2.get(timeout=1)
    assert event_type == 'playback'
    assert json.loads(json_data) == data

def test_broadcast_filtered():
    """이벤트 타입 필터링 테스트"""
    manager = SSEManager()
    q_playback = queue.Queue()
    q_scroll = queue.Queue()
    manager.add_client(q_playback, 'playback')
    manager.add_client(q_scroll, 'scroll')

    data = {'lastPlayedIndex': 42}
    manager.broadcast('playback', data)

    # playback만 수신, scroll은 수신 안 함
    assert not q_playback.empty()
    assert q_scroll.empty()
```

#### Flask 엔드포인트 테스트

```python
# tests/test_server.py
import pytest
import json
from pathlib import Path
from server import app

@pytest.fixture
def client(tmp_path):
    """테스트 클라이언트 픽스처"""
    app.config['TESTING'] = True
    # 데이터 디렉토리 임시 경로로 설정
    import server
    server.DATA_DIR = tmp_path
    server.PLAYBACK_POSITION_FILE = tmp_path / 'playback-position.json'

    with app.test_client() as client:
        yield client

def test_get_playback_position_empty(client):
    """빈 상태에서 GET 테스트"""
    response = client.get('/api/playback-position')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['lastPlayedIndex'] == -1

def test_save_playback_position(client):
    """PUT 저장 테스트"""
    payload = {
        'lastPlayedIndex': 42,
        'notePath': 'test.md',
        'noteTitle': 'Test',
        'deviceId': 'test-device'
    }
    response = client.put('/api/playback-position',
                         json=payload,
                         content_type='application/json')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] == True
    assert 'timestamp' in data

def test_sse_playback_stream(client):
    """SSE 스트림 테스트"""
    response = client.get('/api/events/playback')
    assert response.status_code == 200
    assert response.content_type == 'text/event-stream'
    assert 'Cache-Control' in response.headers
    assert response.headers['Cache-Control'] == 'no-cache'

def test_health_endpoint(client):
    """헬스 체크 테스트"""
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'healthy'
```

### 통합 테스트 (Integration Tests)

#### SSE 연결 테스트

```javascript
// tests/integration/sse-connection.test.js
describe('SSE Connection Test', () => {
    const EDGE_SERVER_URL = 'http://localhost:5051';

    test('should connect to SSE endpoint', async () => {
        const eventSource = new EventSource(`${EDGE_SERVER_URL}/api/events/playback`);

        await new Promise((resolve) => {
            eventSource.onopen = () => {
                expect(eventSource.readyState).toBe(EventSource.OPEN);
                eventSource.close();
                resolve();
            };
        });
    });

    test('should receive playback position updates', async () => {
        const eventSource = new EventSource(`${EDGE_SERVER_URL}/api/events/playback`);

        // 테스트 데이터 전송
        await fetch(`${EDGE_SERVER_URL}/api/playback-position`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lastPlayedIndex: 99,
                notePath: 'test.md',
                noteTitle: 'Test',
                deviceId: 'test-device'
            })
        });

        // SSE 이벤트 수신 대기
        const update = await new Promise((resolve) => {
            eventSource.addEventListener('playback', (e) => {
                resolve(JSON.parse(e.data));
            });
        });

        expect(update.lastPlayedIndex).toBe(99);
        eventSource.close();
    });

    test('should auto-reconnect on connection loss', async () => {
        let reconnectCount = 0;
        const eventSource = new EventSource(`${EDGE_SERVER_URL}/api/events/playback`);

        eventSource.onerror = () => {
            reconnectCount++;
        };

        // 연결 강제 종료 후 재연결 대기
        eventSource.close();

        await new Promise(r => setTimeout(r, 5000));

        // EventSource는 자동 재연결을 시도함
        // 실제 테스트에서는 서버를 재시작하여 검증
    }, 10000);
});
```

### 다중 디바이스 테스트 (Multi-Device Tests)

#### 테스트 시나리오

```
시나리오 1: 기본 SSE 동기화
1. 디바이스 A (PC)에서 42번 노트까지 재생
2. 디바이스 B (태블릿)에서 SSE 연결 대기
3. 디바이스 A에서 PUT /api/playback-position 요청
4. 디바이스 B에서 < 100ms 내에 42번 노트 표시 확인 ✅

시나리오 2: 백그라운드/포그라운드 전환
1. 디바이스 A에서 SSE 연결 활성화
2. 디바이스 A를 백그라운드로 전환
3. SSE 연결 해제 확인 (EventSource.close())
4. 다른 디바이스에서 위치 변경
5. 디바이스 A를 포그라운드로 복귀
6. SSE 재연결 및 최신 위치 동기화 확인 ✅

시나리오 3: 폴백 전환
1. tts-proxy 서버 중지
2. 클라이언트가 Azure Functions 폴링으로 자동 전환 확인
3. tts-proxy 서버 재시작
4. 클라이언트가 SSE 모드로 자동 복귀 확인 ✅

시나리오 4: 충돌 해결
1. 디바이스 A에서 오프라인으로 50번까지 재생
2. 디바이스 B에서 온라인으로 40번까지 재생
3. 디바이스 A가 온라인 복귀
4. 타임스탬프 비교로 최신 위치 선택 확인 ✅
```

### 성능 테스트 (Performance Tests)

#### 지연 시간 측정

```python
# tests/performance/latency_test.py
import time
import requests
import sseclient

def test_sse_latency():
    """SSE 지연 시간 측정"""
    EDGE_SERVER_URL = 'http://localhost:5051'

    # SSE 연결
    response = requests.get(f'{EDGE_SERVER_URL}/api/events/playback', stream=True)
    client = sseclient.SSEClient(response)

    # 테스트 데이터 전송 전 시간 기록
    start_time = time.time()

    # PUT 요청
    requests.put(f'{EDGE_SERVER_URL}/api/playback-position',
                 json={'lastPlayedIndex': 42})

    # SSE 수신 대기
    for event in client.events():
        if event.event == 'playback':
            latency = (time.time() - start_time) * 1000  # ms
            print(f'SSE Latency: {latency:.2f}ms')
            assert latency < 100, f'Latency too high: {latency}ms'
            break
```

#### 배터리 소모 측정

```javascript
// tests/performance/battery_test.js
async function measureBatteryConsumption() {
    if (!navigator.getBattery) {
        console.log('Battery API not supported');
        return;
    }

    const battery = await navigator.getBattery();
    const initialLevel = battery.level;

    // SSE 모드로 1시간 실행 (시뮬레이션)
    await runForOneHour(() => {
        window.sseSyncManager.connect();
    });

    const finalLevel = battery.level;
    const consumption = initialLevel - finalLevel;

    console.log(`Battery consumption (SSE): ${consumption * 100}%`);
    assert(consumption < 0.05, 'Battery consumption too high');  // 5% 미만
}
```

---

### 테스트 체크리스트

#### 백엔드 (tts-proxy)
- [ ] 단위 테스트: SSE 매니저
- [ ] 단위 테스트: Flask 엔드포인트
- [ ] 통합 테스트: SSE 연결
- [ ] 성능 테스트: 지연 시간 < 100ms
- [ ] 스트레스 테스트: 100+ 동시 연결
- [ ] Redis Pub/Sub 테스트 (선택)

#### 클라이언트 (Obsidian)
- [ ] EventSource 연결 테스트
- [ ] SSE 이벤트 수신 테스트
- [ ] Page Visibility API 테스트
- [ ] 폴백 전환 테스트
- [ ] 다중 디바이스 테스트
- [ ] 배터리 소모 측정

#### 시스템 (End-to-End)
- [ ] 기본 동기화 시나리오
- [ ] 백그라운드/포그라운드 전환
- [ ] 네트워크 장애 복구
- [ ] 충돌 해결
- [ ] 오프라인/온라인 전환

### 권장 방식: 하이브리드 접근

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Client                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │ Optimistic UI    │         │ Page Visibility  │         │
│  │ (즉시 반영)      │────────▶│ (폴링 제어)      │         │
│  └──────────────────┘         └──────────────────┘         │
│          │                                                    │
│          ▼                                                    │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │ Local Storage    │         │ Smart Polling    │         │
│  │ (오프라인 지원)  │         │ (최소 요청)      │         │
│  └──────────────────┘         └──────────────────┘         │
│          │                            │                       │
│          └────────────┬───────────────┘                       │
│                       ▼                                       │
│              ┌──────────────────┐                             │
│              │ syncPosition()   │                             │
│              │ (충돌 해결)      │                             │
│              └──────────────────┘                             │
│                       │                                       │
└───────────────────────┼───────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Azure Functions                            │
├─────────────────────────────────────────────────────────────┤
│  PUT /api/playback-position                                 │
│  GET /api/playback-position                                 │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                Azure Blob Storage                           │
├─────────────────────────────────────────────────────────────┤
│  playback-position.json                                     │
└─────────────────────────────────────────────────────────────┘
```

**작동 순서**:
1. 사용자가 위치 변경 → 즉시 UI 업데이트 (Optimistic)
2. 로컬 저장소에 저장 (오프라인 지원)
3. 백그라운드에서 서버에 PUT 요청
4. 포그라운드일 때만 주기적 GET (Page Visibility)
5. 백그라운드 진입 시 폴링 중단
6. 포그라운드 복귀 시 즉시 GET

---

## 위험 및 완화 계획 (Risks and Mitigation)

### 위험 1: Obsidian DataviewJS 환경 제약

**위험도**: 높음
**영향**: WebSocket/SSE 구현 불가능

**완화 계획**:
- PoC 단계에서 API 지원 여부 확실히 테스트
- 지원하지 않을 경우 폴링 최적화로 대안 변경
- 플러그인 개발 고려 (DataviewJS 대신)

### 위험 2: 모바일 백그라운드 제약

**위험도**: 중간
**영향**: 실시간 동기화가 불가능

**완화 계획**:
- 모바일에서는 폴링 최적화 사용
- 포그라운드 복귀 시 즉시 동기화로 대응
- 사용자에게 백그라운드 제약 사실 공지

### 위험 3: Azure Functions 비용 증가

**위험도**: 낮음
**영향**: 운영 비용 증가

**완화 계획**:
- 폴링 최적화로 오히려 비용 절감
- Event Grid/SSE 사용 시 비용 모니터링
- 예산 알림 설정

### 위험 4: tts-proxy 서버 다운

**위험도**: 중간
**영향**: SSE 동기화 불가, 폴백 필요

**완화 계획**:
- Azure Functions 폴링을 자동 폴백으로 유지
- 서버 상태 모니터링 (/health 엔드포인트)
- systemd 자동 재시작 설정

### 위험 5: Obsidian DataviewJS EventSource 지원

**위험도**: 낮
**영향**: SSE 사용 불가, 폴링으로 폴백

**완화 계획**:
- PoC 단계에서 EventSource 지원 확인
- 폴백 메커니즘으로 Azure Functions 유지
- Progressive Enhancement: SSE → 폴링 → 오프라인

---

## 배포 가이드 (Deployment Guide)

### tts-proxy 서버 설치 (Mac mini)

#### 1. Python 환경 설정

```bash
# 가상 환경 생성
python3 -m venv venv
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

#### 2. tts-proxy 디렉토리 구조 생성

```bash
# 프로젝트 디렉토리 생성
mkdir -p ~/tts-proxy/data/tts-cache
cd ~/tts-proxy

# 파일 생성
# - server.py (위 코드 참조)
# - sse_manager.py (위 코드 참조)
# - requirements.txt (위 코드 참조)
```

#### 3. 실행 테스트

```bash
# 직접 실행 (테스트)
python server.py

# 백그라운드 실행
nohup python server.py > tts-proxy.log 2>&1 &

# 로그 확인
tail -f tts-proxy.log
```

#### 4. systemd 서비스 등록 (자동 시작)

```bash
# 서비스 파일 생성
sudo nano /etc/systemd/system/tts-proxy.service
```

```ini
[Unit]
Description=TTS Proxy SSE Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/tts-proxy
Environment="PATH=/home/your-username/tts-proxy/venv/bin"
ExecStart=/home/your-username/tts-proxy/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable tts-proxy
sudo systemctl start tts-proxy

# 상태 확인
sudo systemctl status tts-proxy
```

#### 5. 방화벽 설정

```bash
# macOS 방화벽 설정 (시스템 환경설정 → 보안 및 개인정보 보호 → 방화벽)
# Python에 대한 수신 연결 허용

# 포트 확인
lsof -i :5051
```

#### 6. Docker 배포 (선택)

```dockerfile
# Dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py sse_manager.py ./

EXPOSE 5051

CMD ["python", "server.py"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  tts-proxy:
    build: .
    ports:
      - "5051:5051"
    volumes:
      - ./data:/data/tts-cache
    restart: always

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
volumes:
  redis-data:
```

```bash
# Docker 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f tts-proxy
```

---

### 클라이언트 설정 (Obsidian 템플릿)

#### 1. obsidian-tts-config.md에 엣지서버 설정 추가

```markdown
```dataviewjs
// ============================================
// ⚙️ TTS 시스템 설정
// ============================================

const config = {
    // 기존 설정
    azureFunctionUrl: 'https://your-function-app.azurewebsites.net',

    // ✨ 엣지서버 SSE 설정 (NEW!)
    edgeServerUrl: 'http://192.168.1.100:5051',  // Mac mini 로컬 IP
    sseEnabled: true,  // SSE 활성화 여부

    // 폴백 설정
    enableFallback: true,  // 엣지서버 불가 시 Azure Functions 폴링
    pollingInterval: 5000,  // 폴백 폴링 간격 (ms)
};
```

#### 2. 초기화 코드에 SSE 연결 추가

```javascript
// tts-reader 템플릿 초기화 부분에 추가
if (config.sseEnabled && config.edgeServerUrl) {
    window.sseSyncManager.init(config.edgeServerUrl).then((success) => {
        if (success) {
            console.log('✅ SSE mode enabled');
        } else {
            console.log('⚠️ SSE unavailable, using polling');
            window.playbackPositionManager.startPolling();
        }
    });
} else {
    // SSE 비활성화 시 폴링 사용
    window.playbackPositionManager.startPolling();
}
```

---

### 네트워크 구성

#### 로컬 네트워크 (Wi-Fi)

```
┌─────────────────┐
│  Mac mini       │
│  (tts-proxy)    │
│  192.168.1.100  │
│  Port: 5051     │
└────────┬────────┘
         │ Wi-Fi
    ┌────┴────┐
    │ Router  │
    └────┬────┘
         │
    ┌────┴────────────────────┐
    │                         │
┌───┴────┐              ┌─────┴────┐
│ Laptop │              │  Tablet  │
│ SSE    │              │ SSE      │
└────────┘              └──────────┘
```

#### 외부 네트워크 (Cloudflare Tunnel)

```bash
# Cloudflare Tunnel 설치 (선택)
brew install cloudflare/cloudflare/cloudflared

# 터널 생성
cloudflared tunnel --url http://localhost:5051

# 또는 영구 터널 설정
cloudflared tunnel create tts-proxy
cloudflared tunnel route dns tts-proxy tts.your-domain.com
```

---

## 구현 일정 (Implementation Timeline) - 업데이트

### 1주차: tts-proxy 백엔드 구현
- Day 1-2: Flask 서버 구조 설정, SSE 매니저 구현
- Day 3-4: SSE 엔드포인트, PUT 핸들러 브로드캐스트
- Day 5: 단위 테스트, 로컬 테스트

### 2주차: 클라이언트 구현
- Day 1-2: SSE 클라이언트 매니저, EventSource 연결
- Day 3-4: Page Visibility API 통합, 폴백 메커니즘
- Day 5: Obsidian 템플릿 통합

### 3주차: 배포 및 테스트
- Day 1-2: Mac mini에 tts-proxy 배포, systemd 서비스 설정
- Day 3-4: 다중 디바이스 테스트, 성능 측정
- Day 5: 문서화, 사용자 가이드

### 4주차: 최적화 및 문서화
- Day 1-2: Redis Pub/Sub 통합 (선택)
- Day 3-4: 배터리 소모 최적화, 에러 핸들링
- Day 5: 최종 검증, 배포

---

## 다음 단계 (Next Steps) - 업데이트

SPEC-PERF-001 계획 완료 후:

1. **백엔드 구현**: tts-proxy Flask 서버 생성
   - `server.py`, `sse_manager.py`, `requirements.txt`
   - Mac mini에 배포

2. **클라이언트 구현**: Obsidian 템플릿에 SSE 클라이언트 추가
   - `sseSyncManager` 객체
   - Page Visibility API 통합

3. **테스트**: 단위, 통합, 다중 디바이스 테스트

4. **배포**: Mac mini에 tts-proxy 배포

5. **`/moai:3-sync SPEC-PERF-001`**: 문서 업데이트 및 가이드 배포

---

## 참고 자료

### 관련 문서
- `spec.md`: 상세 요구사항 및 기술 분석
- `acceptance.md`: 검수 기준

### 외부 참고
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Event Source API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Flask SSE Pattern](https://blog.miguelgrinberg.com/post/server-sent-events-with-python-and-flask)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)

### 라이브러리 버전
- Flask: 3.0.0 (최신 안정 버전)
- flask-cors: 4.0.0 (CORS 지원)
- redis: 5.0.1 (선택: Pub/Sub 확장)
- Python: 3.12+ (타입 힌트, async/await 지원)

---

## 부록: 코드 스니펫 모음

### Flask SSE 스트리밍 기본 패턴

```python
from flask import Response
import queue
import time

def sse_stream():
    def generate():
        q = queue.Queue()
        try:
            while True:
                try:
                    data = q.get(timeout=30)
                    yield f"data: {data}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            pass

    return Response(generate(), mimetype='text/event-stream')
```

### JavaScript EventSource 기본 패턴

```javascript
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (e) => {
    console.log('Message:', e.data);
};

eventSource.addEventListener('custom', (e) => {
    console.log('Custom:', JSON.parse(e.data));
});

eventSource.onerror = () => {
    console.error('Connection error');
    // 자동 재연결됨
};

// 수동 연결 해제
eventSource.close();
```

### Page Visibility API 배터리 절약 패턴

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 백그라운드: 연결 해제
        disconnect();
    } else {
        // 포그라운드: 연결 복구
        reconnect();
    }
});
```

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-05 | 1.0 | 초기 계획 작성 (폴링 분석) |
| 2026-02-05 | 2.0 | tts-proxy SSE 구현 계획 추가 |
| 2026-02-05 | 2.1 | 상세 코드 스니펫, 테스트 전략, 배포 가이드 추가 |
