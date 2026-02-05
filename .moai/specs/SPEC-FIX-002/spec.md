---
spec_id: SPEC-FIX-002
title: tts-proxy SSE 구현으로 인한 TTS 기능 회귀 버그 수정
status: Complete
priority: Critical
created: 2026-02-05
assigned: expert-debug, expert-backend
tags: regression, bug-fix, tts-proxy, sse, docker
lifecycle_level: spec-first
---

# SPEC-FIX-002: tts-proxy SSE 구현으로 인한 TTS 기능 회귀 버그 수정

## 문제 요약 (Problem Summary)

SSE(Server-Sent Events) 기능 구현 후 기존 TTS API가 동작하지 않는 회귀(regression) 버그가 발생했습니다.

### 증상
- `http://100.107.208.106:5051/api/tts` 엔드포인트가 404 반환
- `http://100.107.208.106:5051/api/cache/...` 엔드포인트가 404 반환
- `/health` 엔드포인트는 정상 (200 반환)
- `/api/events/playback` SSE 엔드포인트는 정상

### 근본 원인 (Root Cause)

**SSE 구현 에이전트가 기존 server.py에 SSE 기능을 "추가"하지 않고, 완전히 새로운 server.py를 작성하여 기존 TTS 기능을 "대체"함**

| 파일 위치 | 내용 | TTS 엔드포인트 | SSE 엔드포인트 |
|-----------|------|---------------|----------------|
| 로컬: `/docker/tts-proxy/server.py` (371줄) | 원본 TTS 하이브리드 프록시 | ✅ `/api/tts`, `/api/tts-stream` | ❌ 없음 |
| 컨테이너: `/app/server.py` (384줄) | SSE 전용 버전 | ❌ 없음 | ✅ `/api/events/playback` |

### 영향도

- **심각도**: Critical (핵심 TTS 기능 완전 중단)
- **영향 범위**: 모든 TTS 재생 기능
- **사용자 영향**: TTS 재생 불가

---

## 환경 (Environment)

### 시스템 컨텍스트
- **프로젝트**: obsidian-tts
- **서버**: Mac mini 엣지 서버 (Docker 기반)
- **컨테이너**: obsidian-tts-proxy (포트 5051)
- **관련 서비스**: openai-edge-tts (포트 5050)

### 파일 위치
- **로컬 소스**: `/Users/turtlesoup0-macmini/docker/tts-proxy/server.py`
- **컨테이너 배포**: `/app/server.py`

---

## 요구사항 (Requirements)

### R1: TTS 기능 복원 (Critical)
**시스템은** 기존 TTS 엔드포인트를 복원해야 한다.

- **R1.1**: `/api/tts` POST 엔드포인트 복원
- **R1.2**: `/api/tts-stream` POST 엔드포인트 복원
- **R1.3**: `/api/cache/<key>` GET/PUT 엔드포인트 복원
- **R1.4**: `/api/stats`, `/api/usage` 엔드포인트 복원

### R2: SSE 기능 유지 (Event-Driven)
**WHEN** SSE 클라이언트가 연결하면 **THEN** 실시간 위치 동기화가 작동해야 한다.

- **R2.1**: `/api/events/playback` SSE 엔드포인트 유지
- **R2.2**: `/api/events/scroll` SSE 엔드포인트 유지
- **R2.3**: SSEManager 클래스 통합

### R3: 기능 통합 (State-Driven)
**IF** 두 버전의 server.py가 존재한다면 **THEN** 하나의 통합된 버전으로 병합해야 한다.

- **R3.1**: 로컬 server.py에 SSE 기능 추가
- **R3.2**: SSEManager 모듈 로컬에 복사
- **R3.3**: 중복 코드 제거 및 정리

### R4: 배포 및 검증 (Unwanted)
**시스템은** 통합된 코드를 컨테이너에 배포하고 검증해야 한다.

- **R4.1**: 도커 이미지 리빌드
- **R4.2**: 컨테이너 재배포
- **R4.3**: 모든 엔드포인트 작동 테스트

---

## 상세사양 (Specifications)

### S1: 코드 통합 전략

**방안: 로컬 server.py에 SSE 기능 추가**

1. 컨테이너에서 `sse_manager.py` 모듈 추출
2. 로컬 server.py에 SSE 관련 코드 통합
3. 기존 TTS 기능 유지하며 SSE 엔드포인트 추가

### S2: 통합 후 엔드포인트 목록

| 엔드포인트 | 메서드 | 기능 | 출처 |
|-----------|--------|------|------|
| `/api/tts` | POST | TTS 생성 (하이브리드) | 원본 |
| `/api/tts-stream` | POST | TTS 생성 (Azure 호환) | 원본 |
| `/api/cache/<key>` | GET/PUT | 캐시 조회/저장 | 원본 |
| `/api/stats` | GET | 통계 조회 | 원본 |
| `/api/usage` | GET | 사용량 조회 | 원본 |
| `/api/playback-position` | GET/PUT | 재생 위치 동기화 | 양쪽 |
| `/api/scroll-position` | GET/PUT | 스크롤 위치 동기화 | 양쪽 |
| `/api/events/playback` | GET | SSE 재생 위치 스트림 | SSE 버전 |
| `/api/events/scroll` | GET | SSE 스크롤 위치 스트림 | SSE 버전 |
| `/health` | GET | 헬스 체크 | 양쪽 |
| `/v1/audio/speech` | POST | OpenAI 호환 TTS | 원본 |

### S3: 배포 절차

1. 컨테이너에서 SSE 관련 파일 추출
2. 로컬 server.py에 SSE 코드 통합
3. docker-compose rebuild
4. 컨테이너 재시작
5. 전체 엔드포인트 테스트

---

## 인수 기준 (Acceptance Criteria)

### 인수 상태 (Acceptance Status)

| AC ID | 상태 | 검증 날짜 |
|-------|------|----------|
| AC1 | ✓ 통과 | 2026-02-05 |
| AC2 | ✓ 통과 | 2026-02-05 |
| AC3 | ✓ 통과 | 2026-02-05 |
| AC4 | ✓ 통과 | 2026-02-05 |

### AC1: TTS 엔드포인트 복원

**Given** tts-proxy 컨테이너가 재시작되었을 때
**When** `/api/tts`에 POST 요청을 보내면
**Then** 200 상태 코드와 오디오 데이터가 반환되어야 한다

### AC2: SSE 엔드포인트 유지

**Given** tts-proxy 컨테이너가 재시작되었을 때
**When** `/api/events/playback`에 GET 요청을 보내면
**Then** `text/event-stream` 응답이 반환되어야 한다

### AC3: 캐시 엔드포인트 복원

**Given** tts-proxy 컨테이너가 재시작되었을 때
**When** `/api/cache/<key>`에 GET 요청을 보내면
**Then** 캐시된 오디오 또는 404가 반환되어야 한다

### AC4: 전체 통합 테스트

**Given** 통합된 server.py가 배포되었을 때
**When** 아래 모든 엔드포인트를 테스트하면
**Then** 모든 테스트가 통과해야 한다:
- `/api/tts` POST → 200
- `/api/events/playback` GET → 200 (SSE)
- `/api/playback-position` GET → 200
- `/api/stats` GET → 200
- `/health` GET → 200

---

## 실행 계획 (Execution Plan)

### Phase 1: 코드 추출 및 분석
1. 컨테이너에서 SSE 관련 파일 추출 (`server.py`, `sse_manager.py`)
2. 두 버전의 코드 비교 분석
3. 통합 전략 확정

### Phase 2: 코드 통합
1. 로컬 server.py에 SSE 임포트 추가
2. SSE 엔드포인트 코드 통합
3. 기존 playback-position PUT에 SSE 브로드캐스트 추가
4. sse_manager.py 로컬 복사

### Phase 3: 배포 및 테스트
1. docker-compose build --no-cache
2. docker-compose up -d
3. 모든 엔드포인트 테스트
4. Obsidian 클라이언트 테스트

---

## 교훈 및 재발 방지 (Lessons Learned)

### 문제 원인
- 새 기능 구현 시 기존 코드 "추가" 대신 "대체" 방식 사용
- 통합 테스트 부재
- 배포 전 엔드포인트 검증 누락

### 재발 방지책
1. **기능 추가 시 기존 테스트 먼저 실행** - 회귀 방지
2. **코드 리뷰 시 "삭제된 기능" 확인** - 의도치 않은 제거 방지
3. **배포 전 핵심 엔드포인트 체크리스트** - 자동화된 스모크 테스트
4. **SPEC-RUN 시 DDD 원칙 준수** - ANALYZE-PRESERVE-IMPROVE

---

## 인수 보고서 (Acceptance Report)

### 테스트 결과 요약

모든 인수 기준(AC)이 통과했습니다:

#### AC1: TTS 엔드포인트 복원 ✓
```bash
$ curl -X POST http://localhost:5051/api/tts -H "Content-Type: application/json" -d '{"text":"Hello World","voice":"alloy"}'
# 결과: MPEG ADTS, layer III, v2, 48 kbps, 24 kHz, Monaural (오디오 데이터 반환)
```

#### AC2: SSE 엔드포인트 유지 ✓
```bash
$ curl -N http://localhost:5051/api/events/playback
# 결과: event: playback\ndata: {"lastPlayedIndex":5,...} (SSE 스트림 반환)
```

#### AC3: 캐시 엔드포인트 복원 ✓
```bash
$ curl http://localhost:5051/api/cache/nonexistent
# 결과: 404 Not Found (예상대로 작동)
```

#### AC4: 전체 통합 테스트 ✓

| 엔드포인트 | 메서드 | 예상 | 실제 |
|-----------|--------|------|------|
| `/api/tts` | POST | 200 | ✓ 200 (오디오) |
| `/api/events/playback` | GET | 200 (SSE) | ✓ 200 (SSE) |
| `/api/playback-position` | GET | 200 | ✓ 200 |
| `/api/stats` | GET | 200 | ✓ 200 |
| `/health` | GET | 200 | ✓ 200 |

### 배포 변경 사항

- **docker-compose.yml**: Redis 포트 노출 제거, `REDIS_ENABLED=false` 추가
- **server.py**: 변경 없음 (이미 통합된 상태)
- **sse_manager.py**: 변경 없음 (이미 배치된 상태)

---

## 참고

### 관련 SPEC
- SPEC-PERF-001: TTS 위치 추적을 위한 폴링 대체 동기화 방식 검토 (Complete)

### 변경 이력
| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-05 | 1.0 | 초기 SPEC 작성 (회귀 버그 분석) |
| 2026-02-05 | 1.1 | Docker 컨테이너 리빌드로 TTS/SSE 통합 완료, 모든 AC 통과 |
