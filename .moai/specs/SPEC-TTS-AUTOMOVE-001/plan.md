# SPEC-TTS-AUTOMOVE-001: 구현 계획

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TTS-AUTOMOVE-001
TITLE: TTS 자동 이동 기능 안정화
STATUS: Planned
PRIORITY: High
ASSIGNED: TBD
CREATED: 2026-02-04
PHASE: Plan
```

## 구현 전략

### 아키텍처 접근법

본 SPEC은 **리팩토링 우선, 점진적 개선** 전략을 따릅니다.

1. **Phase 1: 타이머 관리 리팩토링** - 전역 변수 문제 해결
2. **Phase 2: 상태 동기화 개선** - Race Condition 방지
3. **Phase 3: 정리 메커니즘 강화** - 메모리 누수 방지
4. **Phase 4: API 요청 최적화** - 요청 중복 방지

---

## 마일스톤 (Milestones)

### Primary Goal (필수 구현)

**M1: 타이머 관리 아키텍처 개선**
- TTSAutoMoveManager 클래스 구현
- 노트별 타이머 Map 구조 도입
- 기존 전역 변수 제거
- 예상 복잡도: Medium
- 의존 작업: 없음

**M2: 상태 동기화 메커니즘 구현**
- StateLock 클래스 구현
- 원자적 토글 변경 로직
- localStorage 동기화 개선
- 예상 복잡도: Medium
- 의존 작업: M1

**M3: 타이머 정리 보장**
- MutationObserver 기반 정리
- 페이지 생명주기 훅 연결
- 정리 콜백 체인 구현
- 예상 복잡도: Low
- 의존 작업: M1

### Secondary Goal (중요 개선)

**M4: API 요청 최적화**
- APIThrottle 클래스 구현
- 요청 중복 방지 로직
- 타임아웃 처리 개선
- 예상 복잡도: Low
- 의존 작업: M1

**M5: 테스트 스위트 작성**
- 단위 테스트 작성
- 통합 테스트 작성
- Race Condition 재현 테스트
- 예상 복잡도: High
- 의존 작업: M1-M4

### Optional Goal (향상 기능)

**M6: Exponential Backoff 도입**
- API 실패 시 점진적 간격 증가
- 최대 백오프 제한
- 재시도 로직 구현
- 예상 복잡도: Medium
- 의존 작업: M4

**M7: 사용자 정의 폴링 간격**
- 설정 UI 추가
- 간격 저장/로드
- 유효성 검증
- 예상 복잡도: Medium
- 의존 작업: M1

---

## 기술적 접근 (Technical Approach)

### 1. 타이머 관리 리팩토링

**현재 아키텍처 문제**:
```javascript
// 현재: 전역 변수 사용 (문제)
window.ttsAutoMoveTimer = null;
window.ttsAutoMoveRunning = false;
```

**개선된 아키텍처**:
```javascript
// 개선: 노트별 Map 구조
window.ttsAutoMoveTimers = new Map(); // noteId -> TTSAutoMoveManager
window.ttsAutoMoveStates = new Map(); // noteId -> state

// 노트 ID 생성 (파일 경로 기반)
const noteId = savedNoteName || `note_${Date.now()}`;
```

**구현 단계**:
1. TTSAutoMoveManager 클래스 정의
2. 노트 ID 생성 로직 구현
3. 기존 코드를 Manager 패턴으로 마이그레이션
4. 전역 변수 제거

### 2. Race Condition 방지

**문제 시나리오**:
```
Thread A: 토글 ON → running 체크 (false) → 타이머 생성 시작
Thread B: 토글 ON → running 체크 (false) → 타이머 생성 시작
Result: 중복 타이머 생성
```

**해결 방안: StateLock 패턴**
```javascript
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
        // 대기 중인 작업이 있으면 처리
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }
}
```

### 3. 타이머 정리 보장

**다중 레이어 정리 전략**:

| 레이어 | 트리거 | 동작 | 우선순위 |
|--------|--------|------|----------|
| L1 | MutationObserver | DOM 제거 감지 시 정리 | 1 |
| L2 | visibilitychange | 탭 숨김 시 일시정지 | 2 |
| L3 | beforeunload | 페이지 언로드 시 정리 | 3 |
| L4 | 주기적 체크 | 안전장치로 5분마다 정리 | 4 |

**구현 예시**:
```javascript
class TTSAutoMoveManager {
    constructor(noteId) {
        this.noteId = noteId;
        this.setupCleanupHandlers();
    }

    setupCleanupHandlers() {
        // L1: MutationObserver
        this.observer = new MutationObserver(() => {
            if (!document.body.contains(this.container)) {
                this.cleanup();
            }
        });

        // L2: visibilitychange
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });

        // L3: beforeunload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // L4: 주기적 체크
        this.cleanupCheckInterval = setInterval(() => {
            this.validateCleanup();
        }, 300000); // 5분
    }

    cleanup() {
        this.stop();
        this.observer?.disconnect();
        clearInterval(this.cleanupCheckInterval);
        window.ttsAutoMoveTimers.delete(this.noteId);
        window.ttsAutoMoveStates.delete(this.noteId);
    }
}
```

### 4. API 요청 최적화

**요청 중복 방지 전략**:
```javascript
class APIThrottle {
    constructor(minInterval = 2000) {
        this.minInterval = minInterval;
        this.lastRequestTime = 0;
        this.pendingRequest = null;
        this.requestQueue = [];
    }

    async fetch(endpoint, options, timeout = 8000) {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;

        // 최소 간격 미달 시 대기
        if (elapsed < this.minInterval) {
            const delay = this.minInterval - elapsed;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 진행 중인 요청이 있으면 재사용
        if (this.pendingRequest) {
            return this.pendingRequest;
        }

        // 새 요청 시작
        this.lastRequestTime = Date.now();
        this.pendingRequest = window.fetchWithTimeout(endpoint, options, timeout);

        try {
            const result = await this.pendingRequest;
            return result;
        } finally {
            this.pendingRequest = null;
        }
    }

    reset() {
        this.pendingRequest = null;
        this.requestQueue = [];
    }
}
```

---

## 위험 및 대응 계획 (Risks & Mitigation)

| 위험 | 확률 | 영향 | 대응 계획 |
|------|------|------|----------|
| 다중 노트 환경에서 동시성 버그 발생 | Medium | High | StateLock + 철저한 테스트 |
| 리팩토링 중 기능 회귀 | Low | High | characterization tests 작성 |
| 성능 저하 (Map 룩업 오버헤드) | Low | Medium | 벤치마킹 후 최적화 |
| Obsidian 이벤트 API 변경 | Low | Medium | 버전 확인 및 폴백 |
| 메모리 누스 (정리 실패) | Medium | High | 다중 레이어 정리 검증 |

---

## 구현 순서 (Implementation Order)

### Phase 1: 기반 구축 (Foundation)

1. **TTSAutoMoveManager 클래스 작성**
   - 생성자, start, stop 메서드
   - 노트 ID 생성 로직
   - 기본 타이머 관리

2. **테스트 프레임워크 구축**
   - Jest 또는 Vitest 설정
   - Mock 환경 구성 (window, localStorage)
   - 테스트 유틸리티 작성

3. **Characterization Tests 작성**
   - 현재 동작 캡처
   - 회귀 방지 기준 확립

### Phase 2: 핵심 리팩토링 (Core Refactoring)

4. **StateLock 구현**
   - acquire/release 메서드
   - 대기 큐 관리

5. **TTSAutoMoveManager 통합**
   - 기존 코드를 Manager 패턴으로 변경
   - 전역 변수를 Map 구조로 마이그레이션

6. **정리 메커니즘 강화**
   - 다중 레이어 정리 핸들러
   - cleanup 메서드 완성

### Phase 3: 최적화 (Optimization)

7. **APIThrottle 구현**
   - 요청 간격 제어
   - 중복 요청 방지

8. **Exponential Backoff 구현** (Optional)
   - 실패 시 간격 증가 로직
   - 최대 백오프 제한

### Phase 4: 검증 (Validation)

9. **단위 테스트 작성**
   - 각 클래스별 테스트
   - 엣지 케이스 커버리지

10. **통합 테스트 작성**
    - 전체 플로우 테스트
    - 다중 노트 시나리오

11. **Race Condition 테스트**
    - 동시성 시나리오 재현
    - 스트레스 테스트

12. **수동 테스트**
    - Obsidian 환경에서 실제 테스트
    - 다양한 시나리오 검증

---

## 성공 기준 (Success Criteria)

### 기능적 기준

- [ ] 토글 ON/OFF가 항상 정상 동작함
- [ ] 다중 노트 환경에서 독립적 작동함
- [ ] 노트 전환 시 이전 타이머가 정리됨
- [ ] Race Condition이 발생하지 않음
- [ ] API 실패 시에도 복구 가능함

### 비기능적 기준

- [ ] 메모리 누수가 없음 (Chrome DevTools Memory Profiler 검증)
- [ ] CPU 사용량이 5% 미만임
- [ ] 타이머 정리 성공률 99% 이상
- [ ] 테스트 커버리지 85% 이상

### 품질 기준 (TRUST 5)

- **Tested**: 모든 기능에 테스트 작성, 85% 커버리지
- **Readable**: 명확한 명명, 주석, 코드 구조
- **Unified**: 일관된 코딩 스타일, ESLint 통과
- **Secured**: 입력 검증, 타임아웃 처리
- **Trackable**: Git 커밋 메시지, SPEC 참조

---

## 다음 단계 (Next Steps)

1. **코드 분석**: 현재 구현의 모든 엣지 케이스 파악
2. **테스트 작성**: Characterization tests로 현재 동작 캡처
3. **리팩토링 실행**: Phase별로 점진적 개선
4. **검증**: 자동 및 수동 테스트로 품질 보증

**다음 작업**: `/moai:2-run SPEC-TTS-AUTOMOVE-001`
