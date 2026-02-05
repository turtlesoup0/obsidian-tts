---
spec_id: SPEC-SYNC-001
title: 마지막 재생 항목 디바이스 간 동기화 기능 강화
status: Planned
priority: High
created: 2026-02-05
assigned: manager-spec
tags: sync, playback-state, cross-device, offline-first
lifecycle_level: spec-first
related_specs:
  - SPEC-PERF-001
  - SPEC-FIX-001
---

# SPEC-SYNC-001: 수용 기준

## 목차
1. [테스트 시나리오](#테스트-시나리오)
2. [품질 게이트](#품질-게이트)
3. [검증 방법](#검증-방법)
4. [완료 정의](#완료-정의)

---

## 테스트 시나리오

### 시나리오 1: 기본 재생 상태 추적

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** TTS 읽기 노트가 열려 있고
**AND** Azure Function URL이 Keychain에 등록되어 있고
**AND** 오디오가 재생 중이고

**WHEN** 오디오의 `currentTime`이 125.5초이고
**AND** 사용자가 일시정지 버튼을 누르면

**THEN** 시스템은 다음 상태를 서버에 저장해야 하고:
- `lastPlayedIndex`: 현재 노트 인덱스 (예: 42)
- `playbackState.currentTime`: 125.5
- `playbackState.duration`: 오디오 총 길이 (예: 300.0)
- `playbackState.status`: "paused"
- `playbackState.lastUpdated`: 현재 타임스탬프

**AND** HTTP 200 응답을 반환하고
**AND** 응답 본문에 `{success: true, conflict: false}`가 포함되어야 하고
**AND** Azure Blob Storage의 `playback-state.json` 파일이 업데이트되어야 하고
**AND** DevTools Console에 `[PLAYBACK-PUT] State saved successfully`가 로깅되어야 한다

**검증 방법**:
```javascript
// 1. 오디오 이벤트 리스너로 상태 감지
audio.addEventListener('pause', () => {
  console.log('Status: paused, currentTime:', audio.currentTime);
  // playbackStateManager.saveState() 호출
});

// 2. Azure Storage Explorer에서 Blob 확인
{
  "lastPlayedIndex": 42,
  "playbackState": {
    "currentTime": 125.5,
    "duration": 300.0,
    "status": "paused",
    "lastUpdated": 1737672001000
  }
}
```

---

### 시나리오 2: 재생 설정 동기화

**GIVEN** 사용자가 PC에서 재생 속도를 1.5배로 변경하고
**AND** 볼륨을 80으로 설정하고
**AND** 음성을 "ko-KR-SunHiNeural"로 선택하고

**WHEN** 사용자가 모바일 기기에서 동일한 노트를 열고
**AND** 재생 시작 버튼을 누르면

**THEN** 시스템은 PC에서 설정한 재생 설정을 적용해야 하고:
- `playbackSettings.playbackRate`: 1.5
- `playbackSettings.volume`: 80
- `playbackSettings.voiceId`: "ko-KR-SunHiNeural"

**AND** 오디오가 1.5배 속도로 재생되어야 하고
**AND** 볼륨이 80으로 설정되어야 하고
**AND** 선택된 음성이 "ko-KR-SunHiNeural"이어야 한다

**검증 방법**:
```javascript
// PC에서 설정 변경
window.playbackStateManager.saveState({
  playbackSettings: {
    playbackRate: 1.5,
    volume: 80,
    voiceId: "ko-KR-SunHiNeural"
  }
});

// 모바일에서 불러오기
const state = await window.playbackStateManager.loadState();
assert(state.playbackSettings.playbackRate === 1.5);
assert(state.playbackSettings.volume === 80);
assert(state.playbackSettings.voiceId === "ko-KR-SunHiNeural");

// 오디오에 적용
audio.playbackRate = state.playbackSettings.playbackRate;
audio.volume = state.playbackSettings.volume / 100;
```

---

### 시나리오 3: 다중 디바이스 충돌 해결 (Last-Write-Wins)

**GIVEN** PC에서 오디오를 재생 중이고
**AND** `currentTime`이 100초이고
**AND** 타임스탬프가 T1이고

**WHEN** 모바일 기기에서 동시에 오디오를 재생하고
**AND** `currentTime`이 50초이고
**AND** 타임스탬프가 T2 (T2 > T1)이고

**THEN** 시스템은 더 최신 타임스탬프(T2)를 가진 모바일 기기의 상태를 우선해야 하고
**AND** PC에서 다음 상태 저장 시 충돌 응답을 받아야 하고:
- `conflict`: true
- `serverState.currentTime`: 200 (모바일에서 계속 재생 중)
- `message`: "서버에 더 최신 상태가 있습니다."

**AND** PC 사용자에게 충돌 알림이 표시되어야 하고
**AND** 사용자가 서버 상태를 적용하기로 선택하면 200초부터 이어서 재생되어야 한다

**검증 방법**:
```javascript
// PC에서 상태 저장 (타임스탬프 T1)
const pcResponse = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 100,
    timestamp: T1
  })
});
const pcResult = await pcResponse.json();
// pcResult.conflict === false

// 모바일에서 상태 저장 (타임스탬프 T2 > T1)
const mobileResponse = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 50,
    timestamp: T2  // T2 > T1
  })
});
const mobileResult = await mobileResponse.json();
// mobileResult.conflict === false

// PC에서 다시 상태 저장 (충돌 발생)
const pcResponse2 = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 150,
    timestamp: T3  // T3 < T2
  })
});
const pcResult2 = await pcResponse2.json();
// pcResult2.conflict === true
// pcResult2.serverState.currentTime > 150 (모바일이 계속 재생 중)

// 충돌 알림 표시
if (pcResult2.conflict) {
  showConflictAlert(pcResult2.serverState);
}
```

---

### 시나리오 4: 이어서 듣기 UI

**GIVEN** 사용자가 PC에서 노트를 재생 중이고
**AND** 42번 노트의 125.5초에서 일시정지하고
**AND** 상태가 서버에 저장되고

**WHEN** 사용자가 모바일 기기에서 동일한 노트를 열고
**AND** 재생 시작 버튼을 누르면

**THEN** 시스템은 이어서 듣기 UI를 표시해야 하고:
- 진행 바: 125.5 / 300.0 (42%)
- 시간 정보: "2:05 / 5:00"
- 디바이스 정보: "MacIntel-abc123에서 재생 중"
- 이어서 듣기 버튼
- 처음부터 버튼

**AND** 사용자가 "이어서 듣기"를 누르면 125.5초부터 재생되어야 하고
**AND** "처음부터"를 누르면 0초부터 재생되어야 한다

**검증 방법**:
```javascript
// 모바일에서 앱 실행 시 서버 상태 확인
const serverState = await window.playbackStateManager.loadState();

if (serverState && serverState.playbackState.status === 'paused') {
  // 이어서 듣기 UI 표시
  showResumePlaybackUI(serverState);
}

// UI 표시 확인
const modal = document.querySelector('.resume-playback-modal');
assert(modal !== null);

const progress = modal.querySelector('.progress').style.width;
assert(progress === '42%'); // (125.5 / 300) * 100

const timeInfo = modal.querySelector('.time-info').textContent;
assert(timeInfo.includes('2:05'));
assert(timeInfo.includes('5:00'));

const deviceInfo = modal.querySelector('.device-info').textContent;
assert(deviceInfo.includes('MacIntel-abc123'));

// 버튼 동작 확인
document.getElementById('resume-btn').click();
assert(audio.currentTime === 125.5);
assert(audio.paused === false);
```

---

### 시나리오 5: Debouncing (5초 이내 중복 업데이트 무시)

**GIVEN** 사용자가 오디오를 재생 중이고
**AND** `timeupdate` 이벤트가 1초 간격으로 발생하고

**WHEN** 사용자가 5초 이내에 여러 번 상태 저장을 요청하면:
- t=0초: 첫 번째 저장 요청
- t=2초: 두 번째 저장 요청
- t=4초: 세 번째 저장 요청

**THEN** 시스템은 첫 번째 요청만 처리하고
**AND** 나머지 요청은 중복 업데이트로 무시해야 하고:
- 첫 번째: `{success: true, merged: false}`
- 두 번째: `{success: true, merged: true}`
- 세 번째: `{success: true, merged: true}`

**AND** Azure Blob Storage에는 첫 번째 요청의 타임스탬프만 저장되어야 한다

**검증 방법**:
```javascript
// t=0초: 첫 번째 저장
const response1 = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 100,
    timestamp: T0
  })
});
const result1 = await response1.json();
// result1.merged === false

// t=2초: 두 번째 저장 (5초 이내)
const response2 = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 102,
    timestamp: T2  // T2 < T0 + 5000
  })
});
const result2 = await response2.json();
// result2.merged === true
// result2.message === "중복 업데이트로 무시되었습니다."

// t=4초: 세 번째 저장 (5초 이내)
const response3 = await fetch('/api/playback-state', {
  method: 'PUT',
  body: JSON.stringify({
    currentTime: 104,
    timestamp: T3  // T3 < T0 + 5000
  })
});
const result3 = await response3.json();
// result3.merged === true

// Blob Storage 확인: 첫 번째 타임스탬프로 저장됨
const blob = await getBlobState();
assert(blob.timestamp === T0);
```

---

### 시나리오 6: 오프라인 지원

**GIVEN** 사용자가 오프라인 상태에서 오디오를 재생 중이고
**AND** `currentTime`이 50초이고

**WHEN** 사용자가 일시정지를 누르면

**THEN** 시스템은 상태를 로컬 Storage에 캐싱해야 하고:
- `localStorage.azureTTS_offlineState`에 상태 저장
- `offlineStateManager.cacheState()` 호출 확인

**AND** 오프라인 큐에 변경사항을 추가해야 하고:
- `localStorage.azureTTS_offlineQueue`에 큐 항목 추가

**WHEN** 사용자가 온라인 상태로 복구하면

**THEN** 시스템은 오프라인 큐를 자동으로 처리해야 하고:
- 큐에 저장된 모든 변경사항을 서버에 전송
- 큐 처리 완료 후 localStorage에서 큐 삭제

**AND** 서버에 최신 상태가 저장되어야 한다

**검증 방법**:
```javascript
// 오프라인 상태 시뮬레이션
window.dispatchEvent(new Event('offline'));

// 상태 변경
audio.currentTime = 50;
audio.pause();

// 로컬 캐싱 확인
const cachedState = JSON.parse(localStorage.getItem('azureTTS_offlineState'));
assert(cachedState.playbackState.currentTime === 50);

// 오프라인 큐 확인
const queue = JSON.parse(localStorage.getItem('azureTTS_offlineQueue'));
assert(queue.length === 1);
assert(queue[0].state.playbackState.currentTime === 50);

// 온라인 복구 시뮬레이션
window.dispatchEvent(new Event('online'));

// 서버 상태 확인
const serverState = await window.playbackStateManager.loadState();
assert(serverState.playbackState.currentTime === 50);

// 큐 비어있는지 확인
const emptyQueue = localStorage.getItem('azureTTS_offlineQueue');
assert(emptyQueue === null);
```

---

### 시나리오 7: Page Visibility API 기반 배터리 최적화

**GIVEN** 사용자가 PC에서 오디오를 재생 중이고
**AND** 자동 동기화 타이머가 활성화되어 있고

**WHEN** 사용자가 다른 탭으로 전환하면 (페이지 숨김)

**THEN** 시스템은 자동 동기화 타이머를 중단해야 하고:
- `playbackStateManager.stopSyncTimer()` 호출
- 더 이상 네트워크 요청 없음
- Console에 `[SYNC] Timer stopped (page hidden)` 로그

**WHEN** 사용자가 다시 탭으로 전환하면 (페이지 표시)

**THEN** 시스템은 즉시 동기화를 수행하고
**AND** 자동 동기화 타이머를 재시작해야 하고:
- `playbackStateManager.syncState()` 즉시 호출
- `playbackStateManager.startSyncTimer()` 호출
- Console에 `[SYNC] Timer restarted (page visible)` 로그

**검증 방법**:
```javascript
// 자동 동기화 활성화
window.playbackStateManager.initSyncTimer();

// 페이지 숨김 시뮬레이션
Object.defineProperty(document, 'hidden', { value: true, writable: true });
document.dispatchEvent(new Event('visibilitychange'));

// 타이머 중단 확인
assert(window.playbackStateManager.syncTimer === null);

// 페이지 표시 시뮬레이션
Object.defineProperty(document, 'hidden', { value: false, writable: true });
document.dispatchEvent(new Event('visibilitychange'));

// 즉시 동기화 및 타이머 재시작 확인
assert(window.playbackStateManager.syncTimer !== null);
```

---

### 시나리오 8: 노트 컨텍스트 변경 감지

**GIVEN** 사용자가 특정 노트를 재생 중이고
**AND** `noteContext.contentHash`가 "abc123"이고

**WHEN** 사용자가 노트 내용을 수정하고
**AND** `contentHash`가 "def456"으로 변경되면

**THEN** 시스템은 노트가 변경되었음을 감지해야 하고
**AND** 사용자에게 노트 변경 알림을 표시해야 하고:
- "노트 내용이 변경되었습니다. 처음부터 다시 재생하시겠습니까?"

**AND** 사용자가 확인을 누르면 인덱스 0부터 재생을 시작해야 하고
**AND** 취소를 누르면 이전 위치에서 계속 재생해야 한다

**검증 방법**:
```javascript
// 현재 노트 해시 계산
const currentHash = calculateContentHash(noteContent);
// "abc123"

// 상태 저장
await window.playbackStateManager.saveState({
  noteContext: { contentHash: currentHash }
});

// 노트 내용 수정
noteContent += "\n새로운 내용 추가";
const newHash = calculateContentHash(noteContent);
// "def456"

// 해시 불일치 감지
const serverState = await window.playbackStateManager.loadState();
if (serverState.noteContext.contentHash !== newHash) {
  // 노트 변경 알림 표시
  showNoteChangedAlert();
}
```

---

### 시나리오 9: 기존 API 역호환성

**GIVEN** 기존 클라이언트가 `/api/playback-position` 엔드포인트를 사용하고 있고
**AND** 요청 형식이 다음과 같고:
```json
{
  "lastPlayedIndex": 42,
  "notePath": "path/to/note.md",
  "noteTitle": "제목",
  "deviceId": "device-id"
}
```

**WHEN** 기존 클라이언트가 PUT 요청을 보내면

**THEN** 시스템은 기존 형식대로 처리해야 하고:
- HTTP 200 응답 반환
- 기존 필드만 저장 (새 필드 무시)
- 응답 형식 변경 없음:
```json
{
  "success": true,
  "timestamp": 1737672000000
}
```

**AND** Azure Blob Storage의 `playback-position.json` 파일이 업데이트되어야 하고
**AND** 기존 클라이언트가 정상적으로 작동해야 한다

**검증 방법**:
```javascript
// 기존 클라이언트 요청 시뮬레이션
const response = await fetch('/api/playback-position', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lastPlayedIndex: 42,
    notePath: "path/to/note.md",
    noteTitle: "제목",
    deviceId: "device-id"
  })
});

assert(response.ok === true);
const result = await response.json();
assert(result.success === true);
assert(result.timestamp !== undefined);

// 새 필드가 응답에 없는지 확인
assert(result.playbackState === undefined);
assert(result.playbackSettings === undefined);
```

---

### 시나리오 10: 세션 정보 추적

**GIVEN** 사용자가 다양한 플랫폼에서 Obsidian을 사용 중이고

**WHEN** 각 플랫폼에서 재생 상태를 저장하면

**THEN** 시스템은 정확한 세션 정보를 저장해야 하고:

| 플랫폼 | deviceId 예시 | deviceType | platform |
|--------|---------------|------------|----------|
| PC (macOS) | `MacIntel-abc123` | `desktop` | `macos` |
| PC (Windows) | `Win32-def456` | `desktop` | `windows` |
| PC (Linux) | `X11-ghi789` | `desktop` | `linux` |
| iPad | `iPad-jkl012` | `tablet` | `ios` |
| iPhone | `iPhone-mno345` | `mobile` | `ios` |
| Android | `Android-pqr678` | `mobile` | `android` |

**AND** `sessionId`는 UUID v4 형식이어야 하고
**AND** `appVersion`은 현재 앱 버전 (예: "5.1.1")이어야 한다

**검증 방법**:
```javascript
// 각 플랫폼에서 세션 정보 생성
const sessionInfo = {
  sessionId: crypto.randomUUID(),  // UUID v4
  deviceType: getDeviceType(),     // desktop, mobile, tablet
  platform: getPlatform(),         // macos, windows, linux, ios, android
  appVersion: "5.1.1"
};

// UUID 형식 검증
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert(uuidRegex.test(sessionInfo.sessionId));

// deviceType 유효성 검증
const validDeviceTypes = ['desktop', 'mobile', 'tablet'];
assert(validDeviceTypes.includes(sessionInfo.deviceType));

// platform 유효성 검증
const validPlatforms = ['macos', 'windows', 'linux', 'ios', 'android'];
assert(validPlatforms.includes(sessionInfo.platform));
```

---

## 품질 게이트

### TRUST 5 프레임워크 기반 검증

#### Tested: 테스트 커버리지
- [ ] 단위 테스트: playbackStateManager 메서드 테스트
- [ ] 단위 테스트: 충돌 해결 로직 테스트
- [ ] 단위 테스트: 오프라인 큐 관리 테스트
- [ ] 통합 테스트: Azure Blob Storage와의 통합 테스트
- [ ] E2E 테스트: PC ↔ Mobile 동기화 테스트
- [ ] E2E 테스트: 오프라인 큐 처리 테스트
- [ ] 커버리지 목표: 85% 이상

#### Readable: 코드 가독성
- [ ] 로그 메시지에 명확한 prefix 사용 (`[PLAYBACK-PUT]`, `[PLAYBACK-GET]`)
- [ ] 변수명이 의미를 명확히 전달
- [ ] 복잡한 로직에 주석 추가
- [ ] ESLint 경고 0개

#### Unified: 코드 일관성
- [ ] 기존 코드 스타일과 일관성 유지
- [ ] 들여쓰기, 포맷팅 통일
- [ ] 에러 처리 패턴 일관성
- [ ] 로깅 패턴 일관성

#### Secured: 보안
- [ ] 입력 검증 (currentTime, duration, playbackRate, volume 범위)
- [ ] CORS 헤더 적용
- [ ] 민감정보 로깅 안 함
- [ ] deviceId에 개인 식별 정보 포함 안 함

#### Trackable: 추적 가능성
- [ ] Git 커밋 메시지에 SPEC-SYNC-001 참조
- [ ] 로그에 타임스탬프 포함
- [ ] 에러에 stack trace 포함
- [ ] 충돌 로그 기록

---

### LSP 품질 게이트 (Run Phase)

**최대 허용치**:
- Errors: 0
- Type errors: 0
- Lint errors: 0
- Security warnings: 0

**검증 명령어**:
```bash
# JavaScript 프로젝트
npx eslint src/functions/playback-state.js --max-warnings=0
npx tsc --noEmit
```

---

## 검증 방법

### 1. 자동화된 테스트

#### 단위 테스트

```javascript
// tests/playback-state-manager.test.js
describe('playbackStateManager', () => {
  test('saveState() 서버에 상태 저장', async () => {
    const manager = window.playbackStateManager;
    const state = {
      index: 42,
      currentTime: 125.5,
      status: 'paused',
      playbackRate: 1.5,
      volume: 80
    };

    const result = await manager.saveState(state);

    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);
  });

  test('handleConflict() 충돌 처리', () => {
    const manager = window.playbackStateManager;
    const serverState = {
      lastPlayedIndex: 43,
      playbackState: {
        currentTime: 200.0,
        status: 'playing'
      }
    };

    // 모의 alert 함수
    global.alert = jest.fn();

    manager.handleConflict(serverState);

    expect(global.alert).toHaveBeenCalledWith(
      expect.stringContaining('다른 디바이스에서 재생 중입니다')
    );
  });
});
```

---

### 2. 통합 테스트

```javascript
// tests/integration/playback-state.integration.test.js
describe('playback-state integration test', () => {
  test('PC에서 저장 후 모바일에서 불러오기', async () => {
    const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;

    // 1. PC에서 상태 저장
    const pcState = {
      lastPlayedIndex: 42,
      notePath: 'path/to/note.md',
      noteTitle: '테스트 노트',
      deviceId: 'MacIntel-test',
      playbackState: {
        currentTime: 125.5,
        duration: 300.0,
        status: 'paused'
      },
      playbackSettings: {
        playbackRate: 1.5,
        volume: 80,
        voiceId: 'ko-KR-SunHiNeural'
      }
    };

    const putResponse = await fetch(`${AZURE_FUNCTION_URL}/api/playback-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pcState)
    });

    expect(putResponse.ok).toBe(true);
    const putResult = await putResponse.json();
    expect(putResult.success).toBe(true);

    // 2. 모바일에서 상태 불러오기
    const getResponse = await fetch(`${AZURE_FUNCTION_URL}/api/playback-state`);
    const mobileState = await getResponse.json();

    expect(mobileState.lastPlayedIndex).toBe(42);
    expect(mobileState.playbackState.currentTime).toBe(125.5);
    expect(mobileState.playbackSettings.playbackRate).toBe(1.5);
    expect(mobileState.playbackSettings.volume).toBe(80);
  });
});
```

---

### 3. 성능 테스트

```javascript
async function performanceTest() {
  const iterations = 100;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();

    await fetch(`${AZURE_FUNCTION_URL}/api/playback-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastPlayedIndex: i,
        playbackState: { currentTime: i * 10, status: 'paused' }
      })
    });

    const elapsed = Date.now() - start;
    times.push(elapsed);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  console.log(`평균 응답 시간: ${avgTime}ms`);
  console.log(`최대 응답 시간: ${maxTime}ms`);
  console.log(`최소 응답 시간: ${minTime}ms`);

  // 검증
  assert(avgTime < 500, `평균 응답 시간이 500ms를 초과: ${avgTime}ms`);
  assert(maxTime < 2000, `최대 응답 시간이 2000ms를 초과: ${maxTime}ms`);
}
```

---

## 완료 정의 (Definition of Done)

### 코드 완료 기준
- [ ] 모든 테스트 시나리오 통과 (10/10)
- [ ] LSP 품질 게이트 통과 (Error: 0, Warning: 0)
- [ ] 코드 리뷰 완료 및 승인
- [ ] TRUST 5 프레임워크 준수

### 문서 완료 기준
- [ ] API 문서 업데이트 (playback-state 엔드포인트)
- [ ] 사용자 가이드 업데이트
- [ ] README.md에 새로운 기능 추가
- [ ] CHANGELOG.md 엔트리 추가

### 배포 완료 기준
- [ ] Azure Functions에 배포
- [ ] 프로덕션 환경에서 smoke test 통과
- [ ] PC/Mobile 실제 기기 테스트 통과
- [ ] 기존 기능 회귀 없음 확인

### 모니터링 완료 기준
- [ ] Azure Application Insights 대시보드 설정
- [ ] 충돌 발생률 모니터링
- [ ] API 응답 시간 모니터링
- [ ] 오프라인 큐 처리 모니터링

---

## 회귀 방지 (Regression Prevention)

### 새로운 테스트 추가
1. 단위 테스트: playbackStateManager 모듈
2. 단위 테스트: 충돌 해결 로직
3. 단위 테스트: 오프라인 큐 관리
4. 통합 테스트: Azure Blob Storage와의 통합
5. E2E 테스트: PC ↔ Mobile 동기화
6. E2E 테스트: 오프라인 큐 처리
7. 성능 테스트: API 응답 시간

### 코드 리뷰 체크리스트
- [ ] 기존 `/api/playback-position` API 호환성 유지
- [ ] 새 필드가 선택적 (optional)으로 구현되었는지
- [ ] 충돌 해결 로직이 명확한지
- [ ] 오프라인 큐가 우아하게 실패处理하는지
- [ ] 로그에 민감정보가 포함되지 않았는지

### 모니터링 지표
- 동기화 성공률: > 99%
- 평균 API 응답 시간: < 500ms
- 충돌 발생률: < 5%
- 오프라인 큐 처리 성공률: > 95%
