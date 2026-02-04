# SPEC-TTS-AUTOMOVE-001: TTS 자동 이동 기능 안정화

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TTS-AUTOMOVE-001
TITLE: TTS 자동 이동 기능 안정화
STATUS: Planned
PRIORITY: High
ASSIGNED: TBD
CREATED: 2026-02-04
LIFECYCLE: spec-anchored
RELATED: None
```

## 환경 (Environment)

### 시스템 컨텍스트

- **대상 노트**: `기술사_출제예상 (통합, 서버동기화, 최적화).md`
- **구현 파일**: `views/integrated-ui/view.js`
- **Azure Function 엔드포인트**: `/api/playback-position`
- **클라이언트 환경**: Obsidian Markdown 뷰어

### 기술 스택

- **프론트엔드**: Vanilla JavaScript (ES6+)
- **상태 관리**: localStorage
- **서버 동기화**: Azure Function HTTP API
- **폴링 간격**: 6초
- **API 타임아웃**: 8초

### 제약 조건

- 저사양 디바이스 지원 필요
- 네트워크 불안정 환경 고려
- 다중 노트 동시 열림 시나리오 지원
- Obsidian 생명주기 관리 필요

---

## 가정 (Assumptions)

### 기술적 가정

- [A-001] Azure Function `/api/playback-position` 엔드포인트가 정상 작동함
- [A-002] `window.ttsLog` 함수가 전역으로 정의되어 있음
- [A-003] `window.fetchWithTimeout` 헬퍼 함수가 존재함
- [A-004] Obsidian Dataview API(`dv`)가 사용 가능함

### 비즈니스 가정

- [A-101] 사용자는 TTS 재생 중 페이지 자동 이동을 기대함
- [A-102] 수동 위치 저장/이동과 자동 이동이 공존해야 함
- [A-103] 자동 이동은 사용자에 의해 언제든 비활성화 가능해야 함

### 검증 필요 가정

- [A-201] 현재 간헐적 실패의 원인은 Race Condition으로 추정
- [A-202] 전역 변수 공유가 다중 노트 환경에서 문제를 야기할 수 있음
- [A-203] 타이머 정리 불완전성이 메모리 누수를 유발할 수 있음

---

## 요구사항 (Requirements)

### EARS 형식 요구사항

#### Ubiquitous Requirements (항상 활성)

**REQ-U-001**: 시스템은 TTS 자동 이동 기능의 상태를 localStorage에 지속적으로 저장해야 한다.
- 이유: 페이지 새로고침 후에도 사용자 설정 유지
- 검증: localStorage 값 확인 및 토글 상태 일치

**REQ-U-002**: 시스템은 자동 이동 타이머의 라이프사이클을 관리하기 위해 노트별 고유 식별자를 사용해야 한다.
- 이유: 다중 노트 환경에서 타이머 격리
- 검증: 다중 노트 열림 시 독립적 타이머 작동

**REQ-U-003**: 시스템은 모든 네트워크 요청에 대해 타임아웃 처리를 수행해야 한다.
- 이유: API 응답 지연 시 UI 블로킹 방지
- 검증: 8초 타임아웃 후 적절한 에러 처리

#### Event-Driven Requirements (이벤트-응답)

**REQ-E-001**: WHEN 토글 스위치가 ON 상태로 변경되면, 시스템은 즉시 TTS 위치로 이동하고 모니터링을 시작해야 한다.
- 트리거: 토글 스위치 클릭
- 응답: `gotoTTSPosition()` 호출 후 `startAutoMoveMonitor()` 실행
- 검증: 토글 ON 후 즉시 이동 및 6초 간격 폴링 시작

**REQ-E-002**: WHEN 토글 스위치가 OFF 상태로 변경되면, 시스템은 실행 중인 타이머를 즉시 중지해야 한다.
- 트리거: 토글 스위치 클릭
- 응답: `clearInterval()` 호출 및 상태 플래그 업데이트
- 검증: 토글 OFF 후 추가 폴링 요청 중지

**REQ-E-003**: WHEN 노트가 전환되면, 시스템은 이전 노트의 타이머를 정리하고 현재 노트의 타이머를 초기화해야 한다.
- 트리거: DOM 변화 감지 (MutationObserver)
- 응답: 이전 타이머 정리 및 새로운 initUI 실행
- 검증: 노트 전환 후 이전 노트의 폴링 중지

**REQ-E-004**: WHEN TTS 위치가 변경되면, 시스템은 해당 행으로 스크롤하고 시각적 피드백을 제공해야 한다.
- 트리거: 서버 응답에서 인덱스/이름 변경 감지
- 응답: `scrollToRow()` 호출 및 하이라이트 표시
- 검증: 위치 변경 시 부드러운 스크롤 및 배경색 표시

#### State-Driven Requirements (상태-조건)

**REQ-S-001**: IF `window.ttsAutoMoveRunning`이 true이면, 시스템은 중복 타이머 생성을 방지해야 한다.
- 조건: 타이머 실행 중 상태
- 응답: `startAutoMoveMonitor()` 조기 반환
- 검증: 연속 토글 ON 시 단일 타이머만 존재

**REQ-S-002**: IF API 요청이 실패하면, 시스템은 상태 표시를 오류로 변경하고 다음 폴링을 계속해야 한다.
- 조건: `response.ok`가 false이거 네트워크 에러
- 응답: 상태 표시를 '✕'로 변경, 타이머 유지
- 검증: API 실패 후에도 다음 폴링 정상 실행

**REQ-S-003**: IF 대상 인덱스가 유효 범위를 벗어나면, 시스템은 이동을 수행하지 않고 로그만 기록해야 한다.
- 조건: `targetIndex < 0 || targetIndex >= rows.length`
- 응답: 로그 기록, 이동 스킵
- 검증: 범위 외 인덱스 시 스크롤 없음

#### Unwanted Requirements (바람직하지 않은 행위)

**REQ-W-001**: 시스템은 다중 노트 환경에서 타이머가 공유되어서는 안 된다.
- 이유: 노트 A의 타이머가 노트 B의 동작에 영향을 주면 안 됨
- 검증: 노트별 독립적 타이머 ID 관리

**REQ-W-002**: 시스템은 토글 OFF 시 타이머가 중지되지 않은 상태로 남아서는 안 된다.
- 이유: 메모리 누스 및 불필요한 네트워크 요청 방지
- 검증: 토글 OFF 후 clearInterval 실행 확인

**REQ-W-003**: 시스템은 Race Condition으로 인한 중복 타이머 생성을 허용해서는 안 된다.
- 이유: 중복 폴링으로 인한 성능 저하 및 API 부하 방지
- 검증: 원자적 상태 체크 및 타이머 생성

#### Optional Requirements (선택적 기능)

**REQ-O-001**: 가능하면 네트워크 요청 실패 시 Exponential Backoff를 적용해야 한다.
- 이유: API 서버 부하 분산
- 검증: 연속 실패 시 점진적 간격 증가

**REQ-O-002**: 가능하면 저사양 디바이스를 위해 폴링 간격을 사용자 정의 가능해야 한다.
- 이유: 기기 성능에 따른 최적화
- 검증: 설정 UI에서 간격 조정

---

## 명세 (Specifications)

### 기능 명세

#### F-SPEC-001: 타이머 관리 아키텍처 개선

**현재 문제점**:
- 전역 `window.ttsAutoMoveTimer`로 인한 다중 노트 간 간섭
- `window.ttsAutoMoveRunning` 플래그의 Race Condition

**개선 방안**:
```javascript
// 노트별 타이머 맵 (전역 싱글톤)
window.ttsAutoMoveTimers = window.ttsAutoMoveTimers || new Map();

// 노트별 상태 맵
window.ttsAutoMoveStates = window.ttsAutoMoveStates || new Map();

// 노트별 타이머 관리 클래스
class TTSAutoMoveManager {
    constructor(noteId) {
        this.noteId = noteId;
        this.timerId = null;
        this.isRunning = false;
        this.lastPosition = { index: -1, name: '' };
    }

    start() {
        if (this.isRunning) return false;
        this.isRunning = true;
        // 타이머 시작 로직
        return true;
    }

    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;
    }

    cleanup() {
        this.stop();
        // Map에서 제거
        window.ttsAutoMoveTimers.delete(this.noteId);
        window.ttsAutoMoveStates.delete(this.noteId);
    }
}
```

#### F-SPEC-002: 원자적 상태 관리

**상태 동기화 메커니즘**:
```javascript
// 상태 변경을 위한 큐/락 메커니즘
class StateLock {
    constructor() {
        this.locked = false;
        this.queue = [];
    }

    async acquire() {
        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.locked = true;
    }

    release() {
        this.locked = false;
    }
}

const stateLock = new StateLock();

async function atomicToggleChange(newState) {
    await stateLock.acquire();
    try {
        localStorage.setItem('ttsAutoMoveEnabled', newState);
        // 상태 변경 로직
    } finally {
        stateLock.release();
    }
}
```

#### F-SPEC-003: 타이머 정리 보장

**정리 콜백 체인**:
```javascript
// 1. MutationObserver 기반 정리
const cleanupObserver = new MutationObserver((mutations) => {
    if (!document.body.contains(table)) {
        manager.cleanup();
        cleanupObserver.disconnect();
    }
});

// 2. 페이지 숨김/언로드 시 정리
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        manager.pause();
    } else {
        manager.resume();
    }
});

// 3. Obsidian 이벤트 기반 정리
app.workspace.on('active-leaf-change', () => {
    // 활성 노트 변경 시 정리 로직
});
```

#### F-SPEC-004: API 요청 개선

**요청 중복 방지**:
```javascript
class APIThrottle {
    constructor(interval = 2000) {
        this.lastRequest = 0;
        this.interval = interval;
        this.pendingRequest = null;
    }

    async fetch(endpoint, options) {
        const now = Date.now();
        const elapsed = now - this.lastRequest;

        if (elapsed < this.interval) {
            // 이전 요청이 진행 중이면 대기
            if (this.pendingRequest) {
                return this.pendingRequest;
            }
            // 새 요청 지연
            await new Promise(resolve =>
                setTimeout(resolve, this.interval - elapsed)
            );
        }

        this.lastRequest = Date.now();
        this.pendingRequest = window.fetchWithTimeout(endpoint, options, 8000);

        try {
            const result = await this.pendingRequest;
            return result;
        } finally {
            this.pendingRequest = null;
        }
    }
}
```

### 비기능 명세

#### NF-SPEC-001: 성능 요구사항

- [NFR-001] 자동 이동 반응 시간: 위치 변경 후 1초 이내 스크롤 완료
- [NFR-002] 메모리 사용량: 타이머당 1KB 미만
- [NFR-003] CPU 사용량: 폴링 시 CPU 5% 미만 점유

#### NF-SPEC-002: 신뢰성 요구사항

- [NFR-011] 타이머 정리 성공률: 99% 이상
- [NFR-012] Race Condition 발생률: 0%
- [NFR-013] API 실패 복구 시간: 다음 폴링 사이클 내

#### NF-SPEC-003: 호환성 요구사항

- [NFR-021] 다중 노트 지원: 최소 5개 노트 동시 열림
- [NFR-022] 저사양 디바이스: 2GB RAM, 2코어 CPU 지원
- [NFR-023] 네트워크: 오프라인 상태에서 그레이스풀 디그레이션

---

## 추적성 (Traceability)

### 요구사항-명세 매트릭스

| REQ ID | Description | F-SPEC | Test Case | Priority |
|--------|-------------|---------|-----------|----------|
| REQ-U-001 | 상태 지속성 저장 | F-SPEC-002 | TC-STATE-001 | High |
| REQ-U-002 | 노트별 타이머 격리 | F-SPEC-001 | TC-TIMER-001 | High |
| REQ-U-003 | API 타임아웃 처리 | F-SPEC-004 | TC-API-001 | High |
| REQ-E-001 | 토글 ON 시 즉시 이동 | F-SPEC-002 | TC-TOGGLE-001 | Medium |
| REQ-E-002 | 토글 OFF 시 타이머 중지 | F-SPEC-003 | TC-TOGGLE-002 | High |
| REQ-E-003 | 노트 전환 시 타이머 정리 | F-SPEC-003 | TC-NOTE-001 | High |
| REQ-E-004 | 위치 변경 시 스크롤 | F-SPEC-001 | TC-SCROLL-001 | Medium |
| REQ-S-001 | 중복 타이머 방지 | F-SPEC-002 | TC-RACE-001 | High |
| REQ-S-002 | API 실패 시 계속 폴링 | F-SPEC-004 | TC-API-002 | Medium |
| REQ-S-003 | 인덱스 범위 검증 | F-SPEC-001 | TC-VALID-001 | Low |
| REQ-W-001 | 다중 노트 타이머 격리 | F-SPEC-001 | TC-MULTI-001 | High |
| REQ-W-002 | 타이머 완전 정리 | F-SPEC-003 | TC-CLEAN-001 | High |
| REQ-W-003 | Race Condition 방지 | F-SPEC-002 | TC-RACE-002 | High |

### 구현 작업 추적

| Task ID | Description | Linked REQs | Status |
|---------|-------------|-------------|--------|
| TASK-001 | TTSAutoMoveManager 클래스 구현 | REQ-U-002, REQ-W-001 | TBD |
| TASK-002 | StateLock 동기화 메커니즘 구현 | REQ-S-001, REQ-W-003 | TBD |
| TASK-003 | 정리 콜백 체인 구현 | REQ-E-003, REQ-W-002 | TBD |
| TASK-004 | APIThrottle 요청 제어 구현 | REQ-U-003, REQ-S-002 | TBD |
| TASK-005 | 테스트 스위트 작성 | All | TBD |
| TASK-006 | 기능 검증 및 리팩토링 | All | TBD |
