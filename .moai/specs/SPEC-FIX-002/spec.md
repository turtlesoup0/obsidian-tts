---
id: SPEC-FIX-002
version: "1.0.0"
status: completed
created: "2026-02-06"
updated: "2026-02-06"
author: turtlesoup0
priority: high
lifecycle_level: spec-first
---

## HISTORY

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0.0 | 2026-02-06 | 구현 완료 - SSE 활성 시 HTTP 폴링 제거 |
| 0.1.0 | 2026-02-06 | 초안 작성 |

---

# SPEC-FIX-002: SSE 활성 시 통합노트 불필요 HTTP 폴링 제거

## 1. 개요

SSE(Server-Sent Events) 실시간 동기화가 성공적으로 연결된 후에도, 통합노트(integrated-ui)의 TTSAutoMoveManager가 Azure Function의 playback-position 엔드포인트로 HTTP GET 폴링을 계속 수행하는 버그를 수정한다.

### 1.1 현재 문제

- SSE 연결 성공 시 playbackPositionManager.stopPolling()은 호출되지만, 통합노트의 AutoMoveManager 폴링은 중지되지 않음
- TTS_POSITION_READ_ENDPOINT가 초기화 시점에 Azure URL로 고정되어 SSE 모드에서도 엣지서버로 전환되지 않음
- 결과: SSE와 HTTP 폴링이 동시에 동작하여 불필요한 네트워크 요청 발생

### 1.2 영향 범위

| 파일 | 역할 | 문제 |
|------|------|------|
| 기술사_출제예상 (통합).md:98 | TTS_POSITION_READ_ENDPOINT 설정 | Azure URL 고정 |
| views/integrated-ui/view.js:617-667 | getTTSPosition() | SSE 모드 체크 없음 |
| views/integrated-ui/view.js:960-1027 | pollTTSPosition + AutoMove | SSE와 독립적 폴링 |

---

## 2. 요구사항 (EARS Format)

### R1: SSE 활성 시 AutoMove HTTP 폴링 중지

WHEN SSE 연결이 성공하고 connectionMode === 'sse'일 때
THEN 통합노트의 TTSAutoMoveManager는 HTTP 폴링 타이머를 중지해야 한다
AND SSE 이벤트 기반 업데이트로 전환해야 한다

사양:
- window.sseSyncManager.isSSEActive() === true이면 autoMoveManager.stop() 호출
- SSE 이벤트 리스너(tts-position-changed CustomEvent)로 AutoMove UI 업데이트 수행
- 기존 TTSAutoMoveManager의 적응형 폴링 로직은 보존 (SSE 비활성 시 사용)

### R2: 통합노트 엔드포인트 동적 전환

WHEN 하이브리드 모드에서 SSE가 활성 상태일 때
THEN getTTSPosition()은 엣지서버 URL을 사용해야 한다
WHEN SSE가 비활성 상태일 때
THEN getTTSPosition()은 Azure Function URL을 사용해야 한다 (현재 동작 유지)

사양:
- getTTSPosition() 내부에서 호출 시점마다 window.sseSyncManager?.isSSEActive() 체크
- SSE 활성: window.sseSyncManager.edgeServerUrl + '/api/playback-position' 사용
- SSE 비활성: 기존 TTS_POSITION_READ_ENDPOINT (Azure) 사용
- ConfigResolver가 있으면 ConfigResolver.resolveEndpoint('position') 우선 사용

### R3: SSE 이벤트 기반 AutoMove 연동

WHEN sseSyncManager가 SSE를 통해 playback-position 업데이트를 수신할 때
THEN tts-position-changed CustomEvent를 dispatch해야 한다
SO THAT AutoMoveManager가 HTTP 폴링 없이 UI를 업데이트할 수 있다

사양:
- handlePlaybackEvent() 내부에서 UI 업데이트 후 CustomEvent dispatch
- 통합노트의 AutoMove 섹션에서 이 이벤트를 수신하여 행 하이라이트 및 스크롤 수행

### R4: SSE 연결 해제 시 폴링 복원

WHEN SSE 연결이 끊어지거나 재연결에 실패할 때
THEN AutoMoveManager는 HTTP 폴링을 재개해야 한다
AND 엔드포인트는 Azure Function으로 복원되어야 한다

사양:
- sseSyncManager.handleConnectionError()에서 폴링 모드 전환 시 sse-mode-changed CustomEvent dispatch
- 통합노트에서 이벤트 수신 시 autoMoveManager.start(pollTTSPosition) 재호출
- 엔드포인트는 getTTSPosition() 내부의 SSE 체크 로직으로 자동 전환 (R2)

---

## 3. 제약사항

- 3-file limit: 수정 파일 3개 이내로 제한
- 역호환성: SSE 미지원 환경에서 기존 HTTP 폴링 동작 보존
- 기존 테스트: views/integrated-ui/__tests__/view.characterization.test.js 통과 필수
- 성능: SSE 활성 시 playback-position HTTP 요청 0건이 목표
