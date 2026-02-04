# SPEC-TTS-AUTOMOVE-001: 인수 기준

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TTS-AUTOMOVE-001
TITLE: TTS 자동 이동 기능 안정화
STATUS: Planned
PRIORITY: High
ASSIGNED: TBD
CREATED: 2026-02-04
VERSION: 1.0
```

## 개요 (Overview)

본 문서는 TTS 자동 이동 기능 안정화에 대한 인수 기준을 정의합니다. 모든 테스트 시나리오는 Given-When-Then (Gherkin) 형식으로 작성되어 있으며, 기능 검증, 리팩토링, TDD 접근법을 포함합니다.

---

## 기능 검증 시나리오 (Functional Verification)

### FV-001: 토글 ON 시 자동 이동 시작

**Given**: 사용자가 통합 노트를 열고 토글이 OFF 상태임
**When**: 사용자가 "자동 이동" 토글을 ON으로 변경함
**Then**:
- 시스템은 즉시 현재 TTS 위치로 이동함
- 상태 표시가 '●' (녹색)으로 변경됨
- 6초 후부터 주기적 위치 모니터링이 시작됨
- `localStorage.ttsAutoMoveEnabled`가 'true'로 설정됨

**검증 방법**:
```javascript
// 테스트 코드
const toggle = document.querySelector('.in-tts-toggle-switch');
toggle.click();

await waitFor(() => {
    assert.equal(localStorage.getItem('ttsAutoMoveEnabled'), 'true');
    assert.equal(ttsStatusSpan.textContent, '●');
    assert.equal(ttsStatusSpan.style.color, '#4CAF50');
});
```

---

### FV-002: 토글 OFF 시 타이머 중지

**Given**: 자동 이동이 활성화되고 모니터링 중임
**When**: 사용자가 "자동 이동" 토글을 OFF로 변경함
**Then**:
- 실행 중인 타이머가 즉시 중지됨
- 상태 표시가 '○' (회색)으로 변경됨
- 추가 API 요청이 발생하지 않음
- `localStorage.ttsAutoMoveEnabled`가 'false'로 설정됨

**검증 방법**:
```javascript
// Given: 토글 ON 상태
toggle.click();
await waitFor(() => window.ttsAutoMoveTimer !== null);

// When: 토글 OFF
toggle.click();

// Then: 타이머 정리 확인
await waitFor(() => {
    assert.isNull(window.ttsAutoMoveTimer);
    assert.isFalse(window.ttsAutoMoveRunning);
    assert.equal(localStorage.getItem('ttsAutoMoveEnabled'), 'false');
});
```

---

### FV-003: TTS 위치 변경 시 자동 스크롤

**Given**: 자동 이동이 활성화되고 현재 인덱스가 5임
**When**: Azure Function이 새로운 인덱스 10을 반환함
**Then**:
- 시스템은 인덱스 10에 해당하는 행으로 부드럽게 스크롤함
- 해당 행의 배경색이 '#9C27B033' (보라색 투명)으로 변경됨
- 2초 후 배경색이 원래대로 복원됨
- 마지막 위치가 10으로 업데이트됨

**검증 방법**:
```javascript
// Given
const manager = window.ttsAutoMoveTimers.get('test-note');
manager.lastPosition = { index: 5, name: '' };

// When: 서버 응답 모킹
mockFetchResponse({ lastPlayedIndex: 10, noteTitle: 'Topic 10' });
await manager.poll();

// Then
await waitFor(() => {
    const row10 = rows[10];
    assert.isAbove(row10.getBoundingClientRect().top, 0);
    assert.equal(row10.style.backgroundColor, '#9C27B033');
});
```

---

### FV-004: 다중 노트 환경에서 독립적 작동

**Given**: 사용자가 3개의 통합 노트를 동시에 열어둠
**When**: 각 노트에서 토글을 ON으로 변경함
**Then**:
- 각 노트는 독립적인 타이머를 가짐
- 노트 A의 위치 변경이 노트 B, C에 영향을 주지 않음
- 노트 전환 시 해당 노트의 타이머만 활성화됨

**검증 방법**:
```javascript
// Given: 3개 노트 열림
const noteA = 'Note A';
const noteB = 'Note B';
const noteC = 'Note C';

// When: 각 노트에서 토글 ON
await toggleAutoMove(noteA);
await toggleAutoMove(noteB);
await toggleAutoMove(noteC);

// Then: 독립적 타이머 확인
assert.equal(window.ttsAutoMoveTimers.size, 3);
assert.isTrue(window.ttsAutoMoveTimers.has(noteA));
assert.isTrue(window.ttsAutoMoveTimers.has(noteB));
assert.isTrue(window.ttsAutoMoveTimers.has(noteC));

// 각 타이머의 ID가 다름
const timers = [...window.ttsAutoMoveTimers.values()];
assert.notEqual(timers[0].timerId, timers[1].timerId);
assert.notEqual(timers[1].timerId, timers[2].timerId);
```

---

### FV-005: 노트 전환 시 타이머 정리

**Given**: 노트 A에서 자동 이동이 활성화되어 있음
**When**: 사용자가 노트 B로 전환함
**Then**:
- 노트 A의 타이머가 정리됨
- 노트 B가 활성화되면 해당 타이머가 초기화됨
- 메모리 누수가 발생하지 않음

**검증 방법**:
```javascript
// Given: 노트 A 활성화
const managerA = window.ttsAutoMoveTimers.get('Note A');
assert.isNotNull(managerA.timerId);

// When: 노트 B로 전환 (DOM 이벤트 시뮬레이션)
simulateNoteTransition('Note B');

// Then: 노트 A 정리, 노트 B 활성화
await waitFor(() => {
    assert.isNull(window.ttsAutoMoveTimers.get('Note A')?.timerId);
    assert.isNotNull(window.ttsAutoMoveTimers.get('Note B')?.timerId);
});
```

---

## 리팩토링 검증 시나리오 (Refactoring Verification)

### RV-001: TTSAutoMoveManager 클래스 구현

**Given**: 기존 전역 변수 기반 코드가 존재함
**When**: TTSAutoMoveManager 클래스로 리팩토링함
**Then**:
- 모든 전역 변수(`window.ttsAutoMoveTimer`, `window.ttsAutoMoveRunning`)가 제거됨
- 노트별 Map 구조(`window.ttsAutoMoveTimers`)가 사용됨
- 기존 기능이 동일하게 작동함 (회귀 없음)

**검증 방법**:
```javascript
// Before: 전역 변수 존재
assert.isDefined(window.ttsAutoMoveTimer);
assert.isDefined(window.ttsAutoMoveRunning);

// After: 리팩토링
refactorToManagerPattern();

assert.isUndefined(window.ttsAutoMoveTimer);
assert.isUndefined(window.ttsAutoMoveRunning);
assert.isDefined(window.ttsAutoMoveTimers);
assert.instanceOf(window.ttsAutoMoveTimers, Map);

// 기능 동등성 확인
const manager = new TTSAutoMoveManager('test-note');
manager.start();
assert.isTrue(manager.isRunning);
manager.stop();
assert.isFalse(manager.isRunning);
```

---

### RV-002: StateLock을 통한 Race Condition 방지

**Given**: 동시에 여러 토글 변경 요청이 발생할 수 있음
**When**: 100ms 간격으로 10번 연속 토글을 클릭함
**Then**:
- 단일 타이머만 생성됨
- 모든 요청이 순차적으로 처리됨
- 최종 상태가 올바름

**검증 방법**:
```javascript
// Given: 토글 OFF 상태
let toggleClicked = 0;

// When: 연속 클릭 (Race Condition 테스트)
const clicks = [];
for (let i = 0; i < 10; i++) {
    clicks.push(
        Promise.resolve().then(() => {
            toggleClicked++;
            return toggleAutoMove(true);
        })
    );
    await delay(100);
}

await Promise.all(clicks);

// Then: 단일 타이머만 존재
const timers = [...window.ttsAutoMoveTimers.values()];
const activeTimers = timers.filter(t => t.timerId !== null);
assert.equal(activeTimers.length, 1);
assert.isTrue(timers[0].isRunning);
```

---

### RV-003: 다중 레이어 정리 메커니즘

**Given**: 다양한 시나리오에서 타이머 정리가 필요함
**When**: 다음 상황이 발생함
  1. DOM 제거
  2. 탭 숨김
  3. 페이지 언로드
**Then**:
- 각 상황에서 적절한 정리가 수행됨
- Map에서 노트가 제거됨
- 메모리 누수가 없음

**검증 방법**:
```javascript
// Scenario 1: DOM 제거
const manager = new TTSAutoMoveManager('test-note');
manager.start();
manager.container.remove();
await waitFor(() => {
    assert.isFalse(window.ttsAutoMoveTimers.has('test-note'));
});

// Scenario 2: 탭 숨김
const manager2 = new TTSAutoMoveManager('test-note-2');
manager2.start();
Object.defineProperty(document, 'hidden', { value: true });
dispatchEvent(new Event('visibilitychange'));
await waitFor(() => {
    assert.isFalse(manager2.isRunning);
});

// Scenario 3: 메모리 누수 검증
const initialMemory = performance.memory.usedJSHeapSize;
// 노트 100개 생성/삭제
for (let i = 0; i < 100; i++) {
    const m = new TTSAutoMoveManager(`note-${i}`);
    m.start();
    m.cleanup();
}
const finalMemory = performance.memory.usedJSHeapSize;
const leak = finalMemory - initialMemory;
assert.isBelow(leak, 1024 * 100); // 100KB 미만
```

---

## TDD 시나리오 (Test-Driven Development)

### TDD-001: TTSAutoMoveManager.start() 메서드

**Red (실패하는 테스트 작성)**:
```javascript
describe('TTSAutoMoveManager.start()', () => {
    it('이미 실행 중이면 false를 반환함', () => {
        const manager = new TTSAutoMoveManager('test');
        manager.isRunning = true;
        assert.isFalse(manager.start());
        assert.isNull(manager.timerId);
    });

    it('실행 중이 아니면 타이머를 시작하고 true를 반환함', () => {
        const manager = new TTSAutoMoveManager('test');
        const result = manager.start();
        assert.isTrue(result);
        assert.isTrue(manager.isRunning);
        assert.isNotNull(manager.timerId);
    });

    it('localStorage 상태를 확인함', () => {
        localStorage.setItem('ttsAutoMoveEnabled', 'false');
        const manager = new TTSAutoMoveManager('test');
        const result = manager.start();
        assert.isFalse(result);
        assert.isFalse(manager.isRunning);
    });
});
```

**Green (최소 구현으로 통과)**:
```javascript
start() {
    if (this.isRunning) return false;
    if (localStorage.getItem('ttsAutoMoveEnabled') === 'false') return false;

    this.isRunning = true;
    this.timerId = setInterval(() => this.poll(), 6000);
    return true;
}
```

**Refactor (개선)**:
```javascript
start() {
    if (this.isRunning) {
        window.ttsLog('⚠️ 이미 모니터링 실행 중');
        return false;
    }

    const enabled = localStorage.getItem('ttsAutoMoveEnabled') !== 'false';
    if (!enabled) {
        window.ttsLog('❌ 토글이 꺼져 있어 시작 안함');
        return false;
    }

    this.isRunning = true;
    this.timerId = setInterval(async () => {
        await this.pollWithTimeout();
    }, 6000);

    window.ttsLog('✅ TTS 자동 이동 모니터링 시작');
    return true;
}
```

---

### TDD-002: StateLock 동기화

**Red**:
```javascript
describe('StateLock', () => {
    it('동시에 두 개의 작업이 acquire를 시도하면 하나만 성공함', async () => {
        const lock = new StateLock();
        let acquiredCount = 0;

        const acquireTask = async () => {
            await lock.acquire();
            acquiredCount++;
            await delay(50);
            lock.release();
        };

        await Promise.all([acquireTask(), acquireTask()]);
        await delay(100);

        assert.equal(acquiredCount, 2); // 순차적으로 실행됨
    });

    it('acquire 후 release 전까지 다른 acquire는 대기함', async () => {
        const lock = new StateLock();
        let secondAcquired = false;

        lock.acquire();
        setTimeout(() => {
            lock.acquire().then(() => {
                secondAcquired = true;
                lock.release();
            });
        }, 10);

        await delay(5);
        assert.isFalse(secondAcquired);
        await delay(20);
        assert.isTrue(secondAcquired);
    });
});
```

**Green**:
```javascript
class StateLock {
    constructor() {
        this.locked = false;
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
```

---

### TDD-003: APIThrottle 요청 제어

**Red**:
```javascript
describe('APIThrottle', () => {
    it('최소 간격 미만의 요청은 지연됨', async () => {
        const throttle = new APIThrottle(100);
        let requestCount = 0;

        mockFetch(() => {
            requestCount++;
            return { ok: true, json: async () => ({}) };
        });

        const start = Date.now();
        await throttle.fetch('/api/test');
        await throttle.fetch('/api/test');
        const elapsed = Date.now() - start;

        assert.equal(requestCount, 2);
        assert.isAtLeast(elapsed, 100);
    });

    it('진행 중인 요청이 있으면 재사용됨', async () => {
        const throttle = new APIThrottle(0);
        let requestCount = 0;

        mockFetch(async () => {
            requestCount++;
            await delay(50);
            return { ok: true, json: async () => ({}) };
        });

        const [r1, r2] = await Promise.all([
            throttle.fetch('/api/test'),
            throttle.fetch('/api/test')
        ]);

        assert.equal(requestCount, 1); // 단일 요청만 실행됨
        assert.strictEqual(r1, r2); // 동일한 응답 객체
    });
});
```

**Green**:
```javascript
class APIThrottle {
    constructor(minInterval = 2000) {
        this.minInterval = minInterval;
        this.lastRequestTime = 0;
        this.pendingRequest = null;
    }

    async fetch(endpoint, options, timeout = 8000) {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;

        if (elapsed < this.minInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, this.minInterval - elapsed)
            );
        }

        if (this.pendingRequest) {
            return this.pendingRequest;
        }

        this.lastRequestTime = Date.now();
        this.pendingRequest = window.fetchWithTimeout(endpoint, options, timeout);

        try {
            return await this.pendingRequest;
        } finally {
            this.pendingRequest = null;
        }
    }
}
```

---

## 엣지 케이스 테스트 (Edge Cases)

### EC-001: 네트워크 오류 복구

**Given**: 자동 이동이 활성화되어 있음
**When**: API 요청이 타임아웃됨 (8초 경과)
**Then**:
- 상태 표시가 '✕' (회색)으로 변경됨
- 다음 폴링 사이클이 정상적으로 계속됨
- 사용자가 수동으로 재시도할 수 있음

---

### EC-002: 유효하지 않은 인덱스 응답

**Given**: 자동 이동이 활성화되어 있음
**When**: 서버가 음수 또는 범위 외 인덱스를 반환함
**Then**:
- 이동을 수행하지 않음
- 로그에 경고가 기록됨
- 다음 폴링이 계속됨

---

### EC-003: localStorage 동기화 실패

**Given**: 브라우저가 비공개 모드이거나 localStorage가 차단됨
**When**: 토글 상태를 변경하려고 함
**Then**:
- 메모리 내 상태로 폴백함
- 콘솔에 경고가 기록됨
- 기능이 계속 작동함

---

### EC-004: 저사양 디바이스 성능

**Given**: 저사양 디바이스 (2GB RAM, 2코어 CPU)
**When**: 6초 간격 폴링이 실행됨
**Then**:
- CPU 사용량이 5% 미만으로 유지됨
- 스크롤이 부드럽게 유지됨 (60fps 목표)
- 메모리 누수가 없음

---

## Definition of Done

각 마일스톤이 완료되려면 다음 기준을 충족해야 합니다:

### 기능 완료 기준

- [ ] 모든 EARS 요구사항이 구현됨
- [ ] 모든 인수 테스트가 통과함
- [ ] 수동 테스트가 Obsidian 환경에서 성공함

### 품질 완료 기준 (TRUST 5)

- [ ] **Tested**: 테스트 커버리지 85% 이상
- [ ] **Readable**: 코드 리뷰 통과, 명확한 명명
- [ ] **Unified**: ESLint 0 경고, 일관된 스타일
- [ ] **Secured**: 타임아웃 처리, 입력 검증 완료
- [ ] **Trackable**: Git 커밋에 SPEC ID 참조 포함

### 문서 완료 기준

- [ ] 코드 내 주석이 완료됨 (한국어)
- [ ] API 문서가 작성됨
- [ ] 회귀 방지 문서가 작성됨

---

## 테스트 실행 가이드

### 단위 테스트 실행

```bash
# Jest 기반
npm test -- TTSAutoMoveManager.test.js

# Vitest 기반
npm run test:unit
```

### 통합 테스트 실행

```bash
npm run test:integration
```

### 수동 테스트 절차

1. Obsidian에서 통합 노트 열기
2. 개발자 콘솔에서 `window.ttsLog` 활성화
3. 토글 ON/OFF 테스트
4. 다중 노트 열기 테스트
5. 네트워크 차단 후 복구 테스트
6. 메모리 프로파일링 (Chrome DevTools)
