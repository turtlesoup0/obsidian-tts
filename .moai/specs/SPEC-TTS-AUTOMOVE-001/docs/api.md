# TTS 자동 이동 기능 API 문서

## 개요

본 문서는 TTS 자동 이동 기능의 핵심 클래스 API를 상세히 설명합니다.

## 클래스 목차

1. [StateLock](#statelock) - Race Condition 방지
2. [APIThrottle](#apithrottle) - API 요청 제어
3. [TTSAutoMoveManager](#ttsautomovemanager) - 타이머 관리

---

## StateLock

비동기 락 메커니즘을 통해 Race Condition을 방지하는 클래스입니다.

### 생성자

```javascript
new StateLock()
```

새로운 StateLock 인스턴스를 생성합니다.

#### 속성

| 속성 | 타입 | 설명 |
|------|------|------|
| `locked` | `boolean` | 락 상태 |
| `queue` | `Function[]` | 대기 중인 작업 큐 |

### 메서드

#### acquire()

락을 획득합니다. 이미 락이 획득되어 있으면 대기합니다.

```javascript
async acquire(): Promise<void>
```

**반환값**: `Promise<void>`

**동작**:
- `locked`가 `false`일 때까지 10ms 간격으로 대기
- 락 획득 후 `locked`를 `true`로 설정

**예시**:
```javascript
await stateLock.acquire();
try {
    // 원자적으로 실행할 코드
    localStorage.setItem('ttsAutoMoveEnabled', 'true');
} finally {
    stateLock.release();
}
```

#### release()

락을 해제하고 대기 중인 작업이 있으면 실행합니다.

```javascript
release(): void
```

**동작**:
- `locked`를 `false`로 설정
- `queue`에 대기 중인 작업이 있으면 순차적으로 실행

**예시**:
```javascript
stateLock.release();
```

### 사용 예시

```javascript
const lock = new StateLock();

async function atomicToggleChange(newState) {
    await lock.acquire();
    try {
        localStorage.setItem('ttsAutoMoveEnabled', newState);
    } finally {
        lock.release();
    }
}
```

---

## APIThrottle

API 요청의 중복을 방지하고 최소 요청 간격을 보장하는 클래스입니다.

### 생성자

```javascript
new APIThrottle(minInterval: number = 2000)
```

#### 매개변수

| 매개변수 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `minInterval` | `number` | `2000` | 최소 요청 간격 (밀리초) |

#### 속성

| 속성 | 타입 | 설명 |
|------|------|------|
| `minInterval` | `number` | 최소 요청 간격 (ms) |
| `lastRequestTime` | `number` | 마지막 요청 시간 (timestamp) |
| `pendingRequest` | `Promise\<Response\> \| null` | 진행 중인 요청 |

### 메서드

#### fetch()

쓰로틀링이 적용된 fetch 요청을 수행합니다.

```javascript
async fetch(endpoint: string, options?: object, timeout?: number): Promise<Response>
```

#### 매개변수

| 매개변수 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `endpoint` | `string` | ✅ | API 엔드포인트 URL |
| `options` | `object` | ❌ | fetch 옵션 |
| `timeout` | `number` | ❌ | 타임아웃 (ms, 기본값: 8000) |

#### 반환값

`Promise<Response>` - API 응답

#### 동작

1. 최소 간격 확인: 마지막 요청으로부터 `minInterval` ms 미만이면 대기
2. 요청 중복 방지: 진행 중인 요청이 있으면 재사용
3. 타임아웃 처리: `window.fetchWithTimeout` 사용

#### 예시

```javascript
const throttle = new APIThrottle(2000);

// 첫 번째 요청
const response1 = await throttle.fetch('/api/playback-position');

// 1초 후 두 번째 요청 (1초 대기 후 실행)
await delay(1000);
const response2 = await throttle.fetch('/api/playback-position');

// 동시 요청 (동일한 응답 재사용)
const [r1, r2] = await Promise.all([
    throttle.fetch('/api/playback-position'),
    throttle.fetch('/api/playback-position')
]);
console.assert(r1 === r2); // 동일한 객체
```

#### reset()

진행 중인 요청을 초기화합니다.

```javascript
reset(): void
```

**사용 시나리오**: 네트워크 오류 후 강제 재시도 시

```javascript
try {
    await throttle.fetch('/api/playback-position');
} catch (error) {
    throttle.reset();
    // 재시도
}
```

---

## TTSAutoMoveManager

노트별 TTS 자동 이동 타이머를 관리하는 클래스입니다.

### 생성자

```javascript
new TTSAutoMoveManager(noteId: string, config?: object)
```

#### 매개변수

| 매개변수 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `noteId` | `string` | ✅ | 노트 고유 ID |
| `config` | `object` | ❌ | 설정 객체 |

#### config 객체

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `endpoint` | `string` | `'/api/playback-position'` | API 엔드포인트 |
| `interval` | `number` | `6000` | 폴링 간격 (ms) |
| `initialDelay` | `number` | `3000` | 초기 지연 (ms) |

#### 속성

| 속성 | 타입 | 설명 |
|------|------|------|
| `noteId` | `string` | 노트 고유 ID |
| `config` | `object` | 설정 객체 |
| `timerId` | `number \| null` | 타이머 ID |
| `isRunning` | `boolean` | 실행 중 상태 |
| `lastPosition` | `object` | 마지막 위치 `{index, name}` |
| `apiThrottle` | `APIThrottle` | API 쓰로틀러 |
| `statusSpan` | `HTMLElement \| null` | 상태 표시 요소 |
| `rows` | `HTMLElement[] \| null` | 테이블 행 배열 |
| `scrollToRow` | `Function \| null` | 스크롤 함수 |

### 메서드

#### start()

TTS 자동 이동 모니터링을 시작합니다.

```javascript
start(): boolean
```

#### 반환값

`boolean` - 시작 성공 여부

#### 동작

1. 이미 실행 중이면 `false` 반환 및 로그 출력
2. `localStorage.ttsAutoMoveEnabled` 확인
3. `initialDelay` ms 후 타이머 시작
4. `interval` ms마다 `poll()` 호출

#### 예시

```javascript
const manager = new TTSAutoMoveManager('note-123');
const success = manager.start();

if (success) {
    console.log('모니터링 시작됨');
} else {
    console.log('이미 실행 중이거나 토글이 꺼짐');
}
```

#### stop()

모니터링을 중지합니다.

```javascript
stop(): void
```

#### 동작

- 타이머 정리 (`clearInterval`)
- `isRunning`을 `false`로 설정
- 상태 표시를 '○' (회색)으로 변경

#### 예시

```javascript
manager.stop();
```

#### poll()

TTS 위치를 폴링하고 스크롤을 수행합니다.

```javascript
async poll(): Promise<void>
```

#### 동작

1. `apiThrottle.fetch()`로 API 요청
2. 응답 파싱: `{lastPlayedIndex, noteTitle}`
3. 위치 변경 확인
4. 변경 시 `scrollToRow()` 호출 및 하이라이트

#### 에러 처리

- 타임아웃: 상태 표시를 '✕'로 변경
- 유효하지 않은 인덱스: 로그만 출력
- 네트워크 오류: 다음 폴링 계속

#### 예시

```javascript
await manager.poll();
```

#### cleanup()

모든 리소스를 정리하고 Map에서 제거합니다.

```javascript
cleanup(): void
```

#### 동작

1. `stop()` 호출
2. MutationObserver 정리
3. 이벤트 리스너 제거
4. `window.ttsAutoMoveTimers`에서 제거

#### 예시

```javascript
manager.cleanup();
```

#### setupCleanupHandlers()

다중 레이어 정리 핸들러를 설정합니다.

```javascript
setupCleanupHandlers(): void
```

#### 정리 레이어

| 레이어 | 이벤트 | 동작 |
|-------|--------|------|
| L1 | DOM 제거 | MutationObserver로 감지 |
| L2 | visibilitychange | 탭 숨김 시 pause, 표시 시 resume |
| L3 | beforeunload | 페이지 언로드 시 cleanup |

#### pause() / resume()

일시 정지 및 재개 (탭 숨김/표시용).

```javascript
pause(): void
resume(): void
```

### 전역 관리

#### window.ttsAutoMoveTimers

모든 TTSAutoMoveManager 인스턴스를 저장하는 Map입니다.

```javascript
// 전역 Map 초기화
window.ttsAutoMoveTimers = window.ttsAutoMoveTimers || new Map();

// 매니저 등록
const manager = new TTSAutoMoveManager('note-123');
window.ttsAutoMoveTimers.set('note-123', manager);

// 매니저 조회
const manager = window.ttsAutoMoveTimers.get('note-123');

// 매니저 제거
window.ttsAutoMoveTimers.delete('note-123');
```

#### window.ttsAutoMoveStateLock

전역 StateLock 인스턴스입니다.

```javascript
window.ttsAutoMoveStateLock = window.ttsAutoMoveStateLock || new StateLock();
```

### 완전한 사용 예시

```javascript
// 1. 매니저 생성
const noteId = generateNoteId();
const manager = new TTSAutoMoveManager(noteId, {
    endpoint: '/api/playback-position',
    interval: 6000,
    initialDelay: 3000
});

// 2. UI 참조 설정
manager.statusSpan = document.querySelector('.tts-status');
manager.rows = Array.from(document.querySelectorAll('.table-view-table tbody tr'));
manager.scrollToRow = (index) => { /* 스크롤 로직 */ };

// 3. 정리 핸들러 설정
manager.setupCleanupHandlers();

// 4. 전역 Map에 등록
window.ttsAutoMoveTimers.set(noteId, manager);

// 5. 모니터링 시작
if (manager.start()) {
    console.log('TTS 자동 이동 시작됨');
}

// 6. 정리 (노트 전환 시)
manager.cleanup();
```

---

## 타입 정의

### Position

TTS 재생 위치 정보

```typescript
interface Position {
    index: number;      // 행 인덱스
    name: string;       // 노트 제목
}
```

### ManagerConfig

TTSAutoMoveManager 설정

```typescript
interface ManagerConfig {
    endpoint?: string;     // API 엔드포인트
    interval?: number;     // 폴링 간격 (ms)
    initialDelay?: number; // 초기 지연 (ms)
}
```

---

## 에러 코드

| 코드 | 설명 | 조치 |
|------|------|------|
| `ALREADY_RUNNING` | 이미 실행 중인 상태 | `start()` 호출 중단 |
| `TOGGLE_DISABLED` | 토글이 꺼져 있음 | localStorage 확인 필요 |
| `INVALID_INDEX` | 유효하지 않은 인덱스 | 로그 확인 |
| `TIMEOUT` | API 요청 타임아웃 | 네트워크 상태 확인 |
| `NETWORK_ERROR` | 네트워크 오류 | 다음 폴링에서 자동 재시도 |

---

## 참고

- [설계 문서](./design.md) - 아키텍처 및 설계 결정
- [README](./README.md) - 프로젝트 개요
