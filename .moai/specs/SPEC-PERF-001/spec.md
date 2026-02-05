---
spec_id: SPEC-PERF-001
title: TTS 위치 추적을 위한 폴링 대체 동기화 방식 검토
status: Complete
priority: High
created: 2026-02-05
completed: 2026-02-05
assigned: manager-spec
tags: performance, synchronization, websocket, sse, event-driven
lifecycle_level: spec-first
---

# SPEC-PERF-001: TTS 위치 추적을 위한 폴링 대체 동기화 방식 검토

## 환경 (Environment)

### 시스템 컨텍스트
- **프로젝트**: obsidian-tts - Obsidian 플러그인 기반 TTS (Text-to-Speech) 시스템
- **현재 버전**: v5.2.0
- **배포 환경**:
  - **실제 운영 (Edge)**: Mac mini 로컬 서버 (Docker 기반)
  - **클라우드 백업**: Azure Functions (Standby 상태)
  - 프론트엔드: Obsidian Desktop/Mobile (DataviewJS)
- **지원 플랫폼**: macOS, Windows, Linux, iOS, Android

### 기술 스택

#### 실제 운영 환경 (Edge Server - Mac mini)
- **tts-proxy** (포트 5051): Python 3 + Flask, TTS 하이브리드 프록시
  - 재생 위치 API: `/api/playback-position` (GET/PUT)
  - 스크롤 위치 API: `/api/scroll-position` (GET/PUT)
  - 캐시: 로컬 파일 시스템 (`/data/tts-cache`)
- **openai-edge-tts** (포트 5050): Python, Edge TTS 서버 (SSE 지원)
- **Redis** (포트 6379): Pub/Sub 가능
- **PostgreSQL** (포트 5432): 데이터 저장

#### 클라우드 백업 환경 (Azure)
- **백엔드**: Node.js 18.x, Azure Functions v4
- **스토리지**: Azure Blob Storage

#### 클라이언트
- **프론트엔드**: JavaScript (DataviewJS), Obsidian 1.11.5+
- **통신**: HTTP/HTTPS (현재 폴링 기반, 5초 간격)

## 가정 (Assumptions)

### 기술적 가정
1. Obsidian 플러그인 환경에서 WebSocket 연결이 백그라운드에서 유지될 수 있다고 가정
2. Azure Functions에서 SignalR Service를 통한 실시간 푸시가 가능하다고 가정
3. Azure Blob Storage 이벤트를 Event Grid로 라우팅할 수 있다고 가정
4. 모바일 환경에서도 SSE (Server-Sent Events) 연결이 안정적이라고 가정
5. 현재 폴링 간격이 5-10초라고 가정 (문서화되지 않음, 추정)

### 비즈니스 가정
1. 사용자가 실시간 위치 동기화를 위해 추가 비용을 지불할 의사가 있다고 가정
2. 배터리 소모와 데이터 사용량이 주요 관심사라고 가정
3. 오프라인 환경에서도 기본 기능이 작동해야 한다고 가정

### 검증 필요 가정 (Confidence: Medium)
1. Obsidian DataviewJS 환경에서 WebSocket API가 완전히 지원된다고 가정
   - 검증 방법: Obsidian Plugin API 문서 확인 및 실제 테스트
2. Azure Functions Consumption Plan에서 WebSocket 연결 제한이 없다고 가정
   - 검증 방법: Azure Functions 문서 확인 및 부하 테스트
3. 모바일 환경에서 백그라운드 탭에서 연결이 유지된다고 가정
   - 검증 방법: iOS/Android에서 실제 테스트

---

## 요구사항 (Requirements)

### R1: 현재 폴링 방식 분석 (Ubiquitous)
**시스템은** 현재 폴링 기반 위치 동기화 메커니즘의 문제점과 한계를 문서화해야 한다.

- **R1.1**: 현재 구현의 서버 부하 분석 (요청 빈도, 리소스 사용)
- **R1.2**: 클라이언트 배터리 소모 및 데이터 사용량 측정
- **R1.3**: 동기화 지연 시간 (latency) 측정
- **R1.4**: TROUBLESHOOTING-SYNC-ISSUE.md에 언급된 `startPolling`/`stopPolling` 에러 원인 분석

### R2: 동기화 대안 기술 탐색 (Event-Driven)
**WHEN** 사용자가 위치 변경을 발생시키면 **THEN** 시스템은 더 효율적인 동기화 방법을 제공해야 한다.

- **R2.1**: WebSocket 기반 양방향 통신 방안 분석
- **R2.2**: Server-Sent Events (SSE) 기반 단방향 푸시 방안 분석
- **R2.3**: Azure Blob Storage Events + Event Grid 방안 분석
- **R2.4**: Azure SignalR Service 통합 방안 분석
- **R2.5**: Optimistic UI + Conflict Resolution 방안 분석

### R3: 기술적 타당성 평가 (State-Driven)
**IF** 제안된 대안이 Obsidian 환경에서 구현 가능하다 **THEN** 시스템은 각 방식의 기술적 타당성을 평가해야 한다.

- **R3.1**: Obsidian DataviewJS 환경에서의 API 지원 여부 확인
- **R3.2**: Azure Functions에서의 구현 가능성 확인
- **R3.3**: 모바일 환경 (iOS/Android) 호환성 확인
- **R3.4**: 백그라운드 탭에서의 연결 유지 가능성 확인

### R4: 비용-이익 분석 (Ubiquitous)
**시스템은** 각 대안 방식의 비용과 이익을 분석하여 비교해야 한다.

- **R4.1**: 구현 복잡도 평가 (개발 시간, 유지보수 비용)
- **R4.2**: 인프라 비용 평가 (Azure 서비스 요금)
- **R4.3**: 운영 비용 평가 (모니터링, 디버깅, 확장성)
- **R4.4**: 사용자 경험 개선 효과 평가 (지연 시간 감소, 배터리 효율)

### R5: 권장 사항 도출 (Unwanted)
**시스템은** 충분한 분석 없이 임의의 방식을 선택해서는 안 된다.

- **R5.1**: 각 방식의 장단점 비교표 작성
- **R5.2**: 사용자 요구사항과 기술 제약조건을 고려한 점수 매기기
- **R5.3**: 단계적 마이그레이션 로드맵 제시
- **R5.4**: 롤백 계획 포함

### R6: PoC 구현 가이드 (Optional)
**가능하면** 시스템은 권장 방식의 개념 증명 (Proof of Concept) 구현 가이드를 제공해야 한다.

- **R6.1**: 최소 기능 구현을 위한 코드 스니펫
- **R6.2**: 테스트 시나리오 및 검증 방법
- **R6.3**: 성능 비교 지표 및 측정 방법

### R7: 엣지서버 SSE 통합 (Event-Driven) ⭐ 신규
**WHEN** 엣지서버(tts-proxy)가 실행 중이면 **THEN** 시스템은 SSE 기반 실시간 동기화를 제공해야 한다.

- **R7.1**: tts-proxy Flask 서버에 `/api/events/playback` SSE 엔드포인트 구현
- **R7.2**: 기존 `/api/playback-position` PUT 엔드포인트에서 SSE 브로드캐스트 트리거
- **R7.3**: EventSource API를 통한 클라이언트 연결 관리
- **R7.4**: 연결 해제/재연결 자동 처리

### R8: 연결 관리 최적화 (State-Driven)
**IF** 클라이언트가 백그라운드 상태라면 **THEN** SSE 연결을 해제하여 배터리를 절약해야 한다.

- **R8.1**: Page Visibility API 통합으로 탭 활성 상태 감지
- **R8.2**: 백그라운드 전환 시 SSE 연결 해제
- **R8.3**: 포그라운드 복귀 시 SSE 연결 재수립 및 최신 상태 동기화
- **R8.4**: 연결 상태 인디케이터 UI 제공

### R9: 폴백 전략 (Unwanted)
**시스템은** 엣지서버 불가 시에도 기본 동기화 기능을 유지해야 한다.

- **R9.1**: 엣지서버 연결 실패 시 Azure Functions 폴링 모드로 자동 전환
- **R9.2**: 네트워크 복구 시 SSE 모드로 자동 복귀
- **R9.3**: 오프라인 모드에서 로컬 저장소에 임시 저장 후 연결 복구 시 동기화
- **R9.4**: 동기화 모드 상태를 사용자에게 표시 (SSE/폴링/오프라인)

---

## 상세사양 (Specifications)

### S1: 현재 폴링 방식 분석

#### S1.1 현재 구현 파악
현재 시스템의 위치 동기화는 다음과 같이 작동한다:

**서버 측 (Azure Functions)**:
- `/api/playback-position` (GET/PUT) - 재생 위치 저장/조회
- `/api/scroll-position` (GET/PUT) - 스크롤 위치 저장/조회
- Azure Blob Storage에 JSON 형식으로 저장
- 데이터 형식:
  ```json
  {
    "lastPlayedIndex": 42,
    "notePath": "path/to/note.md",
    "noteTitle": "제목",
    "timestamp": 1738234567890,
    "deviceId": "desktop-chrome"
  }
  ```

**클라이언트 측 (Obsidian 노트 템플릿)**:
- `playbackPositionManager` 객체:
  - `getPosition()` - 서버에서 위치 조회
  - `savePosition()` - 서버에 위치 저장
  - `syncPosition(localIndex)` - 타임스탬프 비교로 충돌 해결
- 동기화 발생 시점:
  - 페이지 로드 시
  - 재생 시작 시
  - 각 노트 재생 완료 후

#### S1.2 폴링 관련 문제점
TROUBLESHOOTING-SYNC-ISSUE.md에서 확인된 문제:
- `startPolling` 메서드가 undefined인 에러 발생
- `stopPolling` 메서드가 undefined인 에러 발생
- 현재 구현에서 폴링이 명확하게 구현되지 않음

#### S1.3 폴링 방식의 한계
1. **불필요한 서버 요청**: 변경이 없어도 주기적 요청 발생
2. **지연 시간**: 폴링 간격만큼의 최소 지연 발생 (5-10초 추정)
3. **배터리 소모**: 모바일 기기에서 주기적 네트워크 요청
4. **서버 부하**: Azure Functions 호출 횟수 증가 (비용 영향)

---

### S2: 대안 기술 상세 분석

#### S2.1 WebSocket 기반 양방향 통신

**아키텍처**:
```
클라이언트 <--WebSocket--> Azure SignalR Service <--WebSocket--> Azure Functions
                                                      |
                                                      v
                                              Azure Blob Storage
```

**구현 방안**:
- Azure SignalR Service 사용
- 클라이언트: SignalR JavaScript SDK
- 서버: Azure Functions에 SignalR output binding

**장점**:
- 실시간 양방향 통신 (지연 < 100ms)
- 서버에서 클라이언트로 즉시 푸시 가능
- 연결 유지에 따른 재연결 자동 처리
- 효율적인带宽 사용 (변경 시에만 데이터 전송)

**단점**:
- 복잡한 연결 관리 로직
- Azure SignalR Service 추가 비용
- Obsidian DataviewJS에서 WebSocket 지원 불확실
- 모바일 백그라운드에서 연결 끊김 가능성

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Obsidian 지원 | ? | DataviewJS 환경에서 WebSocket API 사용 가능성 확인 필요 |
| Azure Functions | ✅ | SignalR binding 지원 |
| 모바일 호환성 | ⚠️ | 백그라운드 탭에서 제한 |
| 구현 복잡도 | 높음 | 연결 관리, 재연결 로직 필요 |

**비용 추정**:
- Azure SignalR Service:
  - Free Tier: 1개 unit, 20,000 메시지/일
  - Standard Tier: $0.002/1,000 메시지 (미국 동부)
- 월 100,000 메시지 가정 시: 약 $0.20/월

#### S2.2 Server-Sent Events (SSE) 기반 단방향 푸시

**아키텍처**:
```
클라이언트 <--SSE--> Azure Functions (EventStream)
```

**구현 방안**:
- Azure Functions에서 HTTP 스트리밍 응답
- 클라이언트: EventSource API

**장점**:
- 단방향 푸시에 최적화 (서버 → 클라이언트)
- WebSocket보다 간단한 구현
- 자동 재연결 지원
- 표준 HTTP 기반 (프록시 친화적)

**단점**:
- 단방향 통신만 가능 (클라이언트 → 서버는 별도 HTTP 필요)
- 하나의 연결만 허용 (여러 이벤트 타입에 제한)
- Internet Explorer 미지원 (Obsidian에는 영향 없음)

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Obsidian 지원 | ✅ | EventSource API는 표준 JavaScript API |
| Azure Functions | ✅ | HTTP 스트리밍 응답 지원 |
| 모바일 호환성 | ⚠️ | 백그라운드 탭에서 제한 |
| 구현 복잡도 | 중간 | WebSocket보다 간단 |

**비용 추정**:
- 추가 Azure 서비스 비용 없음
- Azure Functions 실행 시간만 비용 발생

#### S2.3 Azure Blob Storage Events + Event Grid

**아키텍처**:
```
클라이언트 PUT --> Azure Blob Storage
        ^
        |
        | Event Grid (Blob Created Event)
        |
Azure SignalR / Azure Functions
```

**구현 방안**:
- Blob Storage에 Event Grid 이벤트 source 구성
- Event Grid → SignalR/Functions 연결
- 클라이언트는 SignalR/SSE 구독

**장점**:
- 이벤트 기반 아키텍처 (느슨한 결합)
- Blob 업데이트를 자동 감지
- 여러 구독자에게 broadcast 가능
- Azure 네이티브 서비스 통합

**단점**:
- 이벤트 지연 (최소 수초)
- 추가 서비스 복잡도
- Event Grid 비용 발생
- 디바이스 간 직접 통신 불가 (항상 서버 경유)

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Azure 통합 | ✅ | 네이티브 서비스 연동 |
| 구현 복잡도 | 높음 | Event Grid + SignalR/Functions 조합 |
| 이벤트 지연 | 3-10초 | Blob Storage 이벤트 지연 |

**비용 추정**:
- Event Grid: $0.60/백만 연산 (2025년 기준)
- 월 100,000 이벤트 가정 시: 약 $0.06/월

#### S2.4 Optimistic UI + Conflict Resolution

**아키텍처**:
```
1. 사용자 동작 → 즉시 UI 업데이트 (Optimistic)
2. 백그라운드에서 서버에 변경 전송
3. 서버에서 충돌 감지 → 클라이언트에 알림
4. 클라이언트에서 충돌 해결 (자동 또는 사용자 선택)
```

**구현 방안**:
- 클라이언트: 낙관적 업데이트 + 타임스탬프 기반 충돌 해결
- 서버: 마지막-쓰기-승리 (Last-Write-Wins) 또는 버전 벡터

**장점**:
- 즉각적인 UI 반응 (지연 0ms)
- 오프라인에서도 작동 가능
- 폴링보다 효율적 (변경 시에만 요청)
- 구현이 상대적으로 간단

**단점**:
- 일시적 불일치 상태 발생 가능
- 충돌 해결 로직 필요
- 실시간 동기화보다 지연 발생

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Obsidian 지원 | ✅ | 순수 클라이언트 로직 |
| 복잡도 | 낮음 | 현재 syncPosition 로직 확장 |
| 오프라인 지원 | ✅ | 로컬 저장 + 백그라운드 동기화 |

**비용 추정**:
- 추가 인프라 비용 없음
- 기존 Azure Functions만 사용

#### S2.5 하이브리드 방식: 폴링 최적화 + 배터리 절약

**아키텍처**:
```
1. 포그라운드: 폴링 간격 동적 조절 (Page Visibility API)
2. 백그라운드: 폴링 일시 중지
3. 페이지 활성화: 즉시 동기화 요청
```

**구현 방안**:
- Page Visibility API로 활성/비활성 상태 감지
- 활성 시: 5초 폴링
- 비활성 시: 폴링 중단
- 재활성화 시: 즉시 동기화

**장점**:
- 가장 간단한 구현
- 배터리 소모 획기적 개선
- 기존 코드 최소 수정
- 모든 환경 호환

**단점**:
- 여전히 폴링 기반 (실시간 아님)
- 백그라운드에서 동기화 안 됨

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Obsidian 지원 | ✅ | Page Visibility API 표준 지원 |
| 복잡도 | 매우 낮음 | 기존 코드 수정만 |
| 배터리 효율 | 크게 개선 | 백그라운드에서 폴링 중단 |

**비용 추정**:
- 추가 비용 없음
- 오히려 Azure Functions 호출 감소로 비용 절감

#### S2.6 tts-proxy SSE 동기화 (엣지서버 활용) ⭐ 권장

**아키텍처**:
```
클라이언트 A (Obsidian) --PUT--> tts-proxy:5051/api/playback-position
                                      |
                                      v (브로드캐스트)
                         tts-proxy:5051/api/events/playback <--SSE-- 클라이언트 B (다른 기기)
```

**구현 방안**:
- 기존 tts-proxy Flask 서버에 SSE 엔드포인트 추가
- Redis Pub/Sub 또는 인메모리 브로드캐스트 활용
- 클라이언트: EventSource API로 연결

**서버 측 구현 (Python Flask)**:
```python
# tts-proxy/server.py 추가 코드
from flask import Response
import queue
import threading

# SSE 클라이언트 관리
class SSEManager:
    def __init__(self):
        self.clients = []
        self.lock = threading.Lock()

    def add_client(self, q):
        with self.lock:
            self.clients.append(q)

    def remove_client(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def broadcast(self, data):
        with self.lock:
            for q in self.clients:
                try:
                    q.put_nowait(data)
                except:
                    pass

sse_manager = SSEManager()

@app.route('/api/events/playback')
def sse_playback():
    """SSE 엔드포인트 - 재생 위치 실시간 수신"""
    def generate():
        q = queue.Queue()
        sse_manager.add_client(q)
        try:
            # 연결 즉시 현재 상태 전송
            if playback_position_file.exists():
                data = playback_position_file.read_text()
                yield f"event: position\ndata: {data}\n\n"

            while True:
                try:
                    data = q.get(timeout=30)  # 30초 타임아웃 (keep-alive)
                    yield f"event: position\ndata: {data}\n\n"
                except queue.Empty:
                    yield ": heartbeat\n\n"  # keep-alive
        finally:
            sse_manager.remove_client(q)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )

@app.route('/api/playback-position', methods=['PUT'])
def save_playback_position():
    """재생 위치 저장 + SSE 브로드캐스트"""
    data = request.json or {}
    data['timestamp'] = int(time.time() * 1000)
    json_data = json.dumps(data)
    playback_position_file.write_text(json_data)

    # 모든 SSE 클라이언트에게 브로드캐스트
    sse_manager.broadcast(json_data)

    return jsonify(data)
```

**클라이언트 측 구현 (DataviewJS)**:
```javascript
// tts-reader 템플릿 추가 코드
const playbackSSE = {
    eventSource: null,

    connect() {
        if (this.eventSource) return;

        const url = `${config.edgeServerUrl}/api/events/playback`;
        this.eventSource = new EventSource(url);

        this.eventSource.addEventListener('position', (e) => {
            const data = JSON.parse(e.data);
            // 타임스탬프 비교로 충돌 해결
            if (data.timestamp > state.lastSyncTimestamp) {
                state.lastSyncTimestamp = data.timestamp;
                state.currentSentenceIndex = data.lastPlayedIndex;
                highlightCurrentSentence();
            }
        });

        this.eventSource.onerror = () => {
            // 자동 재연결 (EventSource 기본 동작)
            console.log('SSE 연결 끊김, 재연결 시도...');
        };
    },

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
};

// Page Visibility API 연동
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        playbackSSE.disconnect();  // 배터리 절약
    } else {
        playbackSSE.connect();
    }
});
```

**장점**:
- 기존 인프라 활용 (tts-proxy 서버 확장)
- 실시간 동기화 (지연 < 100ms)
- 구현 복잡도 낮음 (Flask + EventSource)
- 추가 비용 없음 (로컬 서버)
- Azure Functions 호출 완전 제거 가능
- Redis Pub/Sub 확장 가능 (다중 서버 시)

**단점**:
- 엣지 서버 의존성 (서버 다운 시 동기화 불가)
- 로컬 네트워크 외부 접근 불가 (VPN/포트포워딩 필요)
- 모바일 외부 접속 시 추가 설정 필요

**기술적 타당성**:
| 항목 | 평가 | 비고 |
|------|------|------|
| Obsidian 지원 | ✅ | EventSource API 표준 지원 |
| 서버 구현 | ✅ | Flask 기존 코드 확장 |
| 모바일 호환성 | ✅ | 로컬 네트워크 내 완전 지원 |
| 실시간성 | ★★★★★ | < 100ms 지연 |
| 구현 복잡도 | 낮음 | 기존 PUT 엔드포인트 수정 + SSE 추가 |

**비용 추정**:
- 추가 비용 없음 (기존 Mac mini 서버 활용)
- Azure Functions 호출 감소로 오히려 비용 절감

**확장 옵션 (Redis Pub/Sub)**:
```python
# 다중 프로세스/서버 환경용
import redis

redis_client = redis.Redis(host='localhost', port=6379)
pubsub = redis_client.pubsub()

def broadcast_via_redis(data):
    redis_client.publish('playback-position', data)

# SSE 생성기에서 Redis 구독
def generate_with_redis():
    pubsub.subscribe('playback-position')
    for message in pubsub.listen():
        if message['type'] == 'message':
            yield f"event: position\ndata: {message['data'].decode()}\n\n"
```

---

### S3: 비교 분석

#### S3.1 기술적 타당성 비교표

| 대안 | Obsidian 지원 | 구현 복잡도 | 모바일 호환성 | 백그라운드 지원 | 실시간성 |
|------|---------------|-------------|---------------|-----------------|----------|
| **tts-proxy SSE** ⭐ | ✅ | **낮음** | ✅ (로컬) | ❌ | ★★★★★ |
| WebSocket | ? | 높음 | ⚠️ | ❌ | ★★★★★ |
| SSE (Azure) | ✅ | 중간 | ⚠️ | ❌ | ★★★★☆ |
| Event Grid | ✅ | 높음 | ✅ | ✅ | ★★★☆☆ |
| Optimistic UI | ✅ | 낮음 | ✅ | ✅ | ★★☆☆☆ |
| 폴링 최적화 | ✅ | 매우 낮음 | ✅ | ❌ | ★★☆☆☆ |

#### S3.2 비용 비교표

| 대안 | 초기 비용 | 월 운영 비용 (추정) | 비고 |
|------|-----------|---------------------|------|
| **tts-proxy SSE** ⭐ | **매우 낮음** | **$0** | 기존 서버 활용, Azure 호출 제거 |
| WebSocket + SignalR | 중간 | $0.20~$5 | 사용량 기반 |
| SSE (Azure) | 낮음 | $0 | Functions 비용만 |
| Event Grid | 중간 | $0.06+ | 이벤트 수 기반 |
| Optimistic UI | 낮음 | $0 | 기존 인프라 사용 |
| 폴링 최적화 | 매우 낮음 | $0 | 오히려 절감 |

#### S3.3 개발 시간 추정 (우선순위 기반)

| 대안 | 개발 시간 | 테스트 시간 | 총 소요 시간 | 우선순위 |
|------|-----------|-------------|--------------|----------|
| **tts-proxy SSE** ⭐ | 4시간 | 2시간 | **6시간** | **1순위** |
| 폴링 최적화 | 8시간 | 4시간 | 12시간 | 2순위 |
| Optimistic UI | 16시간 | 8시간 | 24시간 | 3순위 |
| SSE (Azure) | 24시간 | 8시간 | 32시간 | 4순위 |
| Event Grid | 32시간 | 12시간 | 44시간 | 5순위 |
| WebSocket + SignalR | 40시간 | 16시간 | 56시간 | 6순위 |

---

### S4: 권장 사항

#### S4.1 단계적 접근 전략 (수정)

**1단계: tts-proxy SSE 구현 (최우선) ⭐**
- 기존 엣지서버에 SSE 엔드포인트 추가
- 실시간 동기화 즉시 달성 (< 100ms)
- 최소 개발 비용 (기존 Flask 확장)
- Azure Functions 호출 제거로 비용 절감

**2단계: Page Visibility API 통합 (병행)**
- SSE 연결 관리 최적화
- 백그라운드 탭에서 연결 해제
- 배터리 소모 최적화

**3단계: 폴백 전략 수립 (안정성)**
- 엣지서버 불가 시 Azure Functions 폴링으로 폴백
- 오프라인 모드 지원 (로컬 저장소 활용)
- Optimistic UI 패턴 적용

**4단계: 클라우드 백업 동기화 (선택)**
- Azure Functions는 백업용으로 유지
- 엣지서버 다운 시 자동 전환
- 외부 네트워크 접근 시 사용

#### S4.2 최종 권장 사항 (수정)

**주요 권장**: tts-proxy SSE → Page Visibility 통합 순서로 구현

**이유**:
1. **즉시 실시간 동기화**: < 100ms 지연으로 폴링 대비 50배 향상
2. **기존 인프라 활용**: Mac mini 엣지서버 이미 운영 중
3. **최소 개발 비용**: 기존 Flask 서버에 SSE 엔드포인트 추가만 필요
4. **비용 절감**: Azure Functions 호출 완전 제거 가능
5. **확장성**: Redis Pub/Sub 연동으로 다중 서버 지원 가능
6. **기술적 검증 완료**: openai-edge-tts가 이미 SSE 사용 중

**tts-proxy SSE 선택 근거**:
| 비교 항목 | tts-proxy SSE | 폴링 최적화 |
|-----------|---------------|-------------|
| 실시간성 | < 100ms | 5초 (폴링 간격) |
| 개발 시간 | 6시간 | 12시간 |
| 추가 비용 | $0 | $0 |
| 배터리 영향 | 최소 (이벤트 기반) | 중간 (주기적 요청) |
| 구현 복잡도 | 낮음 | 매우 낮음 |

**조건부 권장 (향후 검토)**:
- 외부 네트워크 접근 필요 시: Cloudflare Tunnel 또는 VPN 설정
- 다중 서버 환경 필요 시: Redis Pub/Sub 통합
- Azure 완전 의존이 필요한 경우에만: SignalR 또는 Event Grid 검토

---

## 추적성 (Traceability)

### 요구사항-설계 매핑

| 요구사항 | 관련 설계 섹션 | 검증 방법 |
|----------|----------------|-----------|
| R1 (현재 분석) | S1.1, S1.2, S1.3 | 코드 리뷰, 성능 측정 |
| R2 (대안 탐색) | S2.1~S2.6 | 기술 문서 검토 |
| R3 (타당성 평가) | S3.1 | PoC 테스트 |
| R4 (비용 분석) | S3.2 | Azure 가격 계산기 |
| R5 (권장 사항) | S4.1, S4.2 | 이해관계자 검토 |
| R6 (PoC 가이드) | - | 별도 문서 (plan.md) |
| R7 (엣지서버 SSE) ⭐ | S2.6 | tts-proxy SSE 테스트 |
| R8 (연결 관리) | S2.6, S2.5 | Page Visibility 테스트 |
| R9 (폴백 전략) | S4.1 3단계 | 네트워크 장애 시뮬레이션 |

### 영향도 분석

**영향받는 컴포넌트**:
- `templates/v5-keychain/tts-reader-v5-keychain.md` - TTS 템플릿 (SSE 클라이언트 추가)
- `templates/sample-tts-note.md` - 샘플 노트
- `/docker/tts-proxy/server.py` - **핵심** SSE 엔드포인트 추가 ⭐
- `/docker/tts-proxy/requirements.txt` - 의존성 (필요시)
- `src/functions/playback-position.js` - 백엔드 API (폴백용 유지)
- `src/functions/scroll-position.js` - 백엔드 API (폴백용 유지)
- `docs/guides/cross-device-playback-sync.md` - 문서 업데이트

**의존성**:
- Obsidian 1.11.5+ (Keychain API)
- tts-proxy Flask 서버 (포트 5051) ⭐
- Redis 6.x+ (선택: Pub/Sub 확장 시)
- Azure Functions v4 (폴백용)
- Azure Blob Storage (폴백용)

---

## 참고 자료

### 프로젝트 문서
- `TROUBLESHOOTING-SYNC-ISSUE.md` - 현재 폴링 관련 문제
- `docs/guides/cross-device-playback-sync.md` - 현재 동기화 방식
- `SECURITY-PERFORMANCE-REFACTORING.md` - 보안 및 성능 고려사항

### 기술 문서
- [Azure SignalR Service](https://learn.microsoft.com/azure/azure-signalr/signalr-overview)
- [Azure Event Grid](https://learn.microsoft.com/azure/event-grid/overview)
- [MDN: WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

### 관련 SPEC
- **SPEC-SYNC-001**: 향상된 재생 상태 동기화 (Phase 1-4 완료)
  - 관련성: 동기화 시스템의 기반 구현
  - 연계: SSE 기반 실시간 동기화로 확장

### 변경 이력
| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-05 | 1.0 | 초기 SPEC 작성 (폴링 대체 방안 검토) |
| 2026-02-05 | 1.1 | 엣지서버(tts-proxy) 연계 섹션 추가 (S2.6, R7-R9) |
| 2026-02-05 | 1.2 | tts-proxy SSE 상세 구현 계획 추가 (plan.md 업데이트) |
| 2026-02-05 | 1.3 | 구현 완료 및 상태 변경 (Planned → Complete) |

---

## tts-proxy SSE 구현 상세사양 (추가)

### S2.7: tts-proxy SSE 서버 구조

**프로젝트 구조**:
```
tts-proxy/
├── server.py              # Flask 메인 서버 (포트 5051)
├── sse_manager.py         # SSE 클라이언트 관리
├── requirements.txt       # Python 의존성
├── data/
│   └── tts-cache/         # 캐시 디렉토리
│       ├── playback-position.json
│       └── scroll-position.json
└── docker-compose.yml     # (선택) Docker 배포
```

**API 엔드포인트**:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/playback-position` | GET | 재생 위치 조회 (기존 호환성) |
| `/api/playback-position` | PUT | 재생 위치 저장 + SSE 브로드캐스트 |
| `/api/events/playback` | GET | SSE 실시간 재생 위치 스트림 |
| `/api/events/scroll` | GET | SSE 실시간 스크롤 위치 스트림 |
| `/health` | GET | 서버 상태 확인 |

### S2.8: SSE 메시지 형식

**이벤트 타입**: `playback`, `scroll`

**메시지 형식** (Server-Sent Events 표준):
```
event: playback
data: {"lastPlayedIndex":42,"notePath":"test.md","noteTitle":"Test","timestamp":1738234567890,"deviceId":"desktop-chrome"}

event: playback
data: {"lastPlayedIndex":43,"notePath":"test.md","noteTitle":"Test","timestamp":1738234568000,"deviceId":"desktop-chrome"}

: keep-alive
```

**keep-alive**: 30초마다 전송하여 연결 유지

### S2.9: 클라이언트 SSE 연결 관리

**연결 라이프사이클**:
1. 초기화: `window.sseSyncManager.init(edgeServerUrl)`
2. 연결: `EventSource('/api/events/playback')`
3. 수신: `addEventListener('playback', handler)`
4. 해제: 백그라운드 진입 시 `EventSource.close()`
5. 복구: 포그라운드 복귀 시 재연결

**폴백 전환 조건**:
- 엣지서버 `/health` 실패
- EventSource 연결 실패
- 네트워크 타임아웃 (3초)

### S2.10: Redis Pub/Sub 확장 (선택)

**채널 구조**:
- `tts:playback`: 재생 위치 브로드캐스트
- `tts:scroll`: 스크롤 위치 브로드캐스트

**Pub/Sub 패턴**:
```
Publisher (PUT handler) → Redis Channel → Subscriber (SSE generator) → Clients
```

**다중 프로세스 지원**:
- 여러 tts-proxy 프로세스 실행 가능
- Redis 통해 메시지 공유
- 클라이언트는 어느 프로세스에 연결되어도 동일 메시지 수신

### S2.11: 성능 목표

| 지표 | 목표 | 측정 방법 |
|------|------|-----------|
| SSE 지연 시간 | < 100ms | PUT → EventSource 수신까지 |
| 동시 연결 수 | 100+ | 동시 EventSource 연결 |
| 메모리 사용 | < 100MB | 프로세스 메모리 |
| CPU 사용 | < 10% | 유휴 상태 |
| 배터리 소모 | < 2%/시간 | 모바일 기기 |

---

## tts-proxy SSE 구현 검증 기준 (추가)

### AC10: tts-proxy 서버 배포

#### AC10.1 Flask 서버 실행

**Given** Mac mini에 Python 3.12+가 설치되어 있을 때
**When** `python server.py`를 실행하면
**Then** 서버가 포트 5051에서 정상적으로 시작해야 한다
**And** `/health` 엔드포인트가 `{"status":"healthy"}`를 반환해야 한다

#### AC10.2 SSE 엔드포인트 접속

**Given** tts-proxy 서버가 실행 중일 때
**When** `/api/events/playback`에 GET 요청을 보내면
**Then** `Content-Type: text/event-stream` 헤더가 반환되어야 한다
**And** `Cache-Control: no-cache` 헤더가 포함되어야 한다

#### AC10.3 브로드캐스트 기능

**Given** 두 개의 EventSource 연결이 활성화되어 있을 때
**When** `/api/playback-position`에 PUT 요청을 보내면
**Then** 두 EventSource 모두 동일한 `playback` 이벤트를 수신해야 한다
**And** 수신까지의 지연이 < 100ms여야 한다

### AC11: 클라이언트 SSE 연결

#### AC11.1 EventSource 초기화

**Given** Obsidian에서 tts-reader 템플릿이 로드되었을 때
**When** `window.sseSyncManager.init()`를 호출하면
**Then** EventSource 연결이 established되어야 한다
**And** 연결 상태 인디케이터가 "🟢 실시간 동기화"를 표시해야 한다

#### AC11.2 실시간 업데이트

**Given** 두 디바이스에서 SSE 연결이 활성화되어 있을 때
**When** 디바이스 A에서 다음 노트로 넘어가면
**Then** 디바이스 B에서 < 100ms 내에 현재 문장 하이라이트가 업데이트되어야 한다

#### AC11.3 백그라운드 연결 해제

**Given** SSE 연결이 활성화되어 있을 때
**When** 탭을 백그라운드로 전환하면
**Then** EventSource 연결이 해제되어야 한다
**And** 서버에서 클라이언트 목록에서 제거되어야 한다

#### AC11.4 포그라운드 복귀 시 재연결

**Given** SSE 연결이 백그라운드에서 해제되었을 때
**When** 탭을 포그라운드로 복귀하면
**Then** EventSource가 재연결되어야 한다
**And** 최신 재생 위치가 즉시 동기화되어야 한다

### AC12: 폴백 메커니즘

#### AC12.1 엣지서버 불가 시 폴백

**Given** tts-proxy 서버가 실행 중이지 않을 때
**When** 클라이언트가 초기화되면
**Then** Azure Functions 폴링 모드로 자동 전환해야 한다
**And** 연결 상태 인디케이터가 "🟡 폴링 동기화"를 표시해야 한다

#### AC12.2 네트워크 복구 시 SSE 복귀

**Given** Azure Functions 폴링 모드로 실행 중일 때
**When** tts-proxy 서버가 다시 실행되면
**Then** 다음 초기화 시 SSE 모드로 자동 복귀해야 한다
**And** 연결 상태 인디케이터가 "🟢 실시간 동기화"로 변경되어야 한다

### AC13: Redis Pub/Sub 확장 (선택)

#### AC13.1 다중 프로세스 브로드캐스트

**Given** 두 개의 tts-proxy 프로세스가 실행 중일 때
**And** 프로세스 A에 클라이언트가 연결되어 있을 때
**When** 프로세스 B의 PUT 엔드포인트가 호출되면
**Then** Redis Pub/Sub을 통해 프로세스 A의 클라이언트가 메시지를 수신해야 한다

#### AC13.2 Redis 장애 시 인메모리 폴백

**Given** Redis Pub/Sub이 활성화되어 있을 때
**When** Redis 서버가 다운되면
**Then** 인메모리 큐로 자동 폴백해야 한다
**And** 단일 프로세스 내 브로드캐스트는 계속 작동해야 한다
