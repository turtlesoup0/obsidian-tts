---
spec_id: SPEC-SYNC-001
title: 마지막 재생 항목 디바이스 간 동기화 기능 강화
status: In Progress
priority: High
created: 2026-02-05
assigned: manager-ddd
tags: sync, playback-state, cross-device, offline-first
lifecycle_level: spec-first
related_specs:
  - SPEC-PERF-001
  - SPEC-FIX-001
progress:
  phase_1_backend: Complete
  phase_2_client_manager: Complete
  phase_3_ui_components: Complete
  phase_4_offline_support: Complete
  phase_5_testing: Pending
---

# SPEC-SYNC-001: 마지막 재생 항목 디바이스 간 동기화 기능 강화

## 환경 (Environment)

### 시스템 컨텍스트
- **프로젝트**: obsidian-tts v5.1.1
- **배포 환경**:
  - 백엔드: Azure Functions (serverless)
  - 스토리지: Azure Blob Storage
  - 프론트엔드: Obsidian Desktop/Mobile (DataviewJS)
- **지원 플랫폼**: macOS, Windows, Linux, iOS, Android

### 기술 스택
- **백엔드**: Node.js 18.x, Azure Functions v4
- **프론트엔드**: JavaScript (DataviewJS), Obsidian 1.11.5+
- **스토리지**: Azure Blob Storage (playback-position.json)
- **통신**: HTTP/HTTPS

### 현재 구현 상태
**기존 `playback-position.js` API 데이터 구조**:
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "timestamp": 1737672000000,
  "deviceId": "desktop-chrome"
}
```

**현재 제약사항**:
- 인덱스 기반 위치 추적만 지원
- 오디오 내 재생 위치 정보 없음
- 재생 속도, 볼륨 설정 미동기화
- 현재 재생 중인 노트 식별 불가

## 가정 (Assumptions)

### 기술적 가정
1. **Azure Blob Storage 용량 충분**: JSON 데이터 크기가 수 KB 수준이므로 저장 공간 문제 없다고 가정
2. **Obsidian DataviewJS 환경**: 추가적인 JavaScript 기능(Enhanced State Management)이 지원된다고 가정
3. **기존 API 호환성**: 새로운 데이터 구조가 기존 클라이언트와 호환되도록 역호환성을 유지할 수 있다고 가정
4. **타임스탬프 충돌 해결**: 최신 타임스탬프 기반 Last-Write-Wins 전략이 충돌 해결에 적합하다고 가정

### 비즈니스 가정
1. **사용자 경험 개선**: 더 정교한 동기화가 사용자 만족도를 크게 향상시킬 것이라고 가정
2. **디바이스 전환 빈도**: 사용자가 PC와 모바일 간 전환을 자주 한다고 가정
3. **재생 중단 빈도**: 사용자가 재생 중간에 중단하고 다른 디바이스에서 이어들을 한다고 가정

### 검증 필요 가정 (Confidence: Medium)
1. **오디오 시간 동기화 가능성**: HTML5 Audio API의 `currentTime` 속성이 모든 플랫폼에서 정확하게 동작한다고 가정
   - 검증 방법: PC, iOS, Android에서 실제 `currentTime` 값 비교 테스트
2. **데이터 크기 영향**: 추가 데이터로 인한 동기화 지연이 1초 이내일 것이라고 가정
   - 검증 방법: 네트워크 프로파일링 및 응답 시간 측정

---

## 요구사항 (Requirements)

### R1: 현재 재생 상태 추적 (Event-Driven)
**WHEN** 사용자가 오디오를 재생하거나 일시정지하면 **THEN** 시스템은 현재 재생 상태를 추적해야 한다.

- **R1.1**: 오디오 `currentTime` 저장 (초 단위, 소수점 둘째 자리)
- **R1.2**: 현재 재생 중인 노트의 인덱스 저장
- **R1.3**: 오디오 파일의 총 길이 저장 (초 단위)
- **R1.4**: 재생 상태 플래그 저장 (playing, paused, stopped)
- **R1.5**: 마지막 상태 업데이트 타임스탬프 저장

### R2: 재생 설정 동기화 (State-Driven)
**IF** 사용자가 재생 속도나 볼륨을 변경하면 **THEN** 시스템은 이 설정을 모든 디바이스에 동기화해야 한다.

- **R2.1**: 재생 속도 (playbackRate) 저장 (0.5 ~ 2.0)
- **R2.2**: 볼륨 레벨 저장 (0 ~ 100)
- **R2.3**: 선택된 음성 유형 저장 (voiceId)
- **R2.4**: 디바이스 간 설정 일치 검증

### R3: 노트 컨텍스트 보존 (Ubiquitous)
**시스템은** 재생 중인 노트의 완전한 컨텍스트를 보존해야 한다.

- **R3.1**: 노트 경로 (notePath) 유지
- **R3.2**: 노트 제목 (noteTitle) 유지
- **R3.3**: 노트 내용 해시 (contentHash) 추가로 변경 감지
- **R3.4**: 폴더 구조 정보 유지
- **R3.5**: Dataview 쿼리 컨텍스트 유지

### R4: 향상된 API 설계 (Unwanted)
**시스템은** 기존 클라이언트 호환성을 깨트리는 방식으로 API를 변경해서는 안 된다.

- **R4.1**: 기존 `lastPlayedIndex` 필드 유지 (역호환성)
- **R4.2**: 새 필드는 선택적 (optional)으로 추가
- **R4.3**: 기존 API 응답 형식 변경 최소화
- **R4.4**: 단계적 마이그레이션 지원
- **R4.5**: 클라이언트 버전 감지 및 조건부 응답

### R5: 충돌 해결 전략 (Event-Driven)
**WHEN** 여러 디바이스에서 동시에 상태가 변경되면 **THEN** 시스템은 타임스탬프 기반 충돌 해결을 수행해야 한다.

- **R5.1**: 서버 측 타임스탬프 우선 (server timestamp wins)
- **R5.2**: 5초 이내의 중복 업데이트 무시 (debouncing)
- **R5.3**: 충돌 발생 시 사용자에게 알림 (선택적)
- **R5.4**: 충돌 로그 기록 (디버깅용)
- **R5.5**: Last-Write-Wins 전략 적용

### R6: 오프라인 지원 (Optional)
**가능하면** 시스템은 오프라인 환경에서도 작동해야 한다.

- **R6.1**: 로컬 Storage에 상태 캐싱
- **R6.2**: 오프라인 큐 관리
- **R6.3**: 온라인 복구 시 자동 동기화
- **R6.4**: 충돌 해결 (오프라인 변경 vs 온라인 변경)

### R7: UI/UX 개선 (State-Driven)
**IF** 사용자가 다른 디바이스에서 접속하면 **THEN** 시스템은 이어서 듣기 UI를 제공해야 한다.

- **R7.1**: "다른 디바이스에서 재생 중임" 알림 표시
- **R7.2**: "이어서 듣기" 버튼 제공
- **R7.3**: 현재 재생 위치 표시 (진행 바)
- **R7.4**: 예상 재생 시간 표시
- **R7.5**: 디바이스 식별 정보 표시

---

## 상세사양 (Specifications)

### S1: 향상된 데이터 구조

#### S1.1 새로운 `playback-state.json` 스키마

```json
{
  // 기존 필드 (역호환성 유지)
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "timestamp": 1737672000000,
  "deviceId": "MacIntel-abc123",

  // 새 필드: 재생 상태
  "playbackState": {
    "currentTime": 125.5,      // 현재 재생 위치 (초)
    "duration": 300.0,         // 오디오 총 길이 (초)
    "status": "paused",        // playing, paused, stopped
    "lastUpdated": 1737672001000
  },

  // 새 필드: 재생 설정
  "playbackSettings": {
    "playbackRate": 1.5,       // 재생 속도 (0.5 ~ 2.0)
    "volume": 80,              // 볼륨 (0 ~ 100)
    "voiceId": "ko-KR-SunHiNeural"
  },

  // 새 필드: 노트 컨텍스트
  "noteContext": {
    "contentHash": "a1b2c3d4", // 노트 내용 해시
    "folderPath": "1_Project/정보 관리 기술사",
    "dataviewQuery": '"출제예상" and -#검색제외'
  },

  // 새 필드: 세션 정보
  "sessionInfo": {
    "sessionId": "uuid-v4",
    "deviceType": "desktop",   // desktop, mobile, tablet
    "platform": "macos",       // macos, windows, linux, ios, android
    "appVersion": "5.1.1"
  }
}
```

#### S1.2 데이터 크기 분석

| 필드 그룹 | 크기 (bytes) | 비고 |
|-----------|--------------|------|
| 기존 필드 | ~150 | lastPlayedIndex, notePath, noteTitle, timestamp, deviceId |
| playbackState | ~80 | currentTime, duration, status, lastUpdated |
| playbackSettings | ~60 | playbackRate, volume, voiceId |
| noteContext | ~100 | contentHash, folderPath, dataviewQuery |
| sessionInfo | ~80 | sessionId, deviceType, platform, appVersion |
| **총계** | **~470** | 기존 150 bytes → 470 bytes (+320 bytes, +213%) |

**데이터 크기 영향 분석**:
- 전송 시간: 470 bytes @ 3G (1 Mbps) ≈ 3.76ms (무시할 수준)
- Blob Storage 비용: 월 1000회 요청 시 약 $0.00001 (무시할 수준)

---

### S2: API 엔드포인트 설계

#### S2.1 GET /api/playback-state (신규)

**목적**: 향상된 재생 상태 조회

**응답 (데이터 있음)**:
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "timestamp": 1737672000000,
  "deviceId": "MacIntel-abc123",
  "playbackState": {
    "currentTime": 125.5,
    "duration": 300.0,
    "status": "paused",
    "lastUpdated": 1737672001000
  },
  "playbackSettings": {
    "playbackRate": 1.5,
    "volume": 80,
    "voiceId": "ko-KR-SunHiNeural"
  },
  "noteContext": {
    "contentHash": "a1b2c3d4",
    "folderPath": "1_Project/정보 관리 기술사",
    "dataviewQuery": '"출제예상" and -#검색제외'
  },
  "sessionInfo": {
    "sessionId": "uuid-v4",
    "deviceType": "desktop",
    "platform": "macos",
    "appVersion": "5.1.1"
  }
}
```

**응답 (데이터 없음)**:
```json
{
  "lastPlayedIndex": -1,
  "playbackState": {
    "status": "stopped"
  }
}
```

#### S2.2 PUT /api/playback-state (신규)

**목적**: 향상된 재생 상태 저장

**요청**:
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "deviceId": "MacIntel-abc123",
  "playbackState": {
    "currentTime": 125.5,
    "duration": 300.0,
    "status": "paused"
  },
  "playbackSettings": {
    "playbackRate": 1.5,
    "volume": 80,
    "voiceId": "ko-KR-SunHiNeural"
  },
  "noteContext": {
    "contentHash": "a1b2c3d4",
    "folderPath": "1_Project/정보 관리 기술사",
    "dataviewQuery": '"출제예상" and -#검색제외'
  }
}
```

**응답**:
```json
{
  "success": true,
  "timestamp": 1737672000000,
  "conflict": false,
  "merged": false
}
```

**응답 (충돌 발생 시)**:
```json
{
  "success": true,
  "timestamp": 1737672000000,
  "conflict": true,
  "serverState": {
    "lastPlayedIndex": 43,
    "playbackState": {
      "currentTime": 200.0,
      "status": "playing"
    }
  },
  "message": "서버에 더 최신 상태가 있습니다. 서버 상태가 적용되었습니다."
}
```

#### S2.3 기존 API 호환성 유지

**GET /api/playback-position** (기존, 유지)
- 기존 클라이언트를 위해 계속 제공
- 응답 형식 변경 없음

**PUT /api/playback-position** (기존, 유지)
- 향상된 필드 무시하고 기존 필드만 저장
- 역호환성 보장

---

### S3: 클라이언트 구현

#### S3.1 향상된 상태 관리자

```javascript
window.playbackStateManager = {
    apiEndpoint: 'https://your-function-app-name.azurewebsites.net/api/playback-state',
    deviceId: null,
    sessionId: null,
    syncInterval: 5000, // 5초
    syncTimer: null,

    // 초기화
    init() {
        this.deviceId = this.getDeviceId();
        this.sessionId = this.generateSessionId();
        this.initSyncTimer();
    },

    // 상태 저장
    async saveState(state) {
        const payload = {
            lastPlayedIndex: state.index,
            notePath: state.notePath,
            noteTitle: state.noteTitle,
            deviceId: this.deviceId,
            playbackState: {
                currentTime: state.currentTime,
                duration: state.duration,
                status: state.status,
                lastUpdated: Date.now()
            },
            playbackSettings: {
                playbackRate: state.playbackRate,
                volume: state.volume,
                voiceId: state.voiceId
            },
            noteContext: {
                contentHash: state.contentHash,
                folderPath: state.folderPath,
                dataviewQuery: state.dataviewQuery
            }
        };

        const response = await fetch(this.apiEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.conflict) {
            console.warn('충돌 감지:', result.message);
            this.handleConflict(result.serverState);
        }

        return result;
    },

    // 상태 불러오기
    async loadState() {
        const response = await fetch(this.apiEndpoint);
        const state = await response.json();

        if (state.lastPlayedIndex === -1) {
            return null;
        }

        return state;
    },

    // 충돌 처리
    handleConflict(serverState) {
        const message = `다른 디바이스에서 재생 중입니다.\n\n` +
                       `서버 상태: 인덱스 ${serverState.lastPlayedIndex}, ` +
                       `시간 ${this.formatTime(serverState.playbackState.currentTime)}\n\n` +
                       `서버 상태를 불러오시겠습니까?`;

        if (confirm(message)) {
            this.applyServerState(serverState);
        }
    },

    // 자동 동기화 타이머
    initSyncTimer() {
        // Page Visibility API 기반 동기화
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopSyncTimer();
            } else {
                this.startSyncTimer();
                this.syncState(); // 즉시 동기화
            }
        });
    }
};
```

#### S3.2 이어서 듣기 UI

```javascript
function showResumePlaybackUI(serverState) {
    const progress = (serverState.playbackState.currentTime / serverState.playbackState.duration) * 100;

    const ui = `
        <div class="resume-playback-modal">
            <h3>이어서 듣기</h3>
            <p>${serverState.noteTitle}</p>
            <div class="progress-bar">
                <div class="progress" style="width: ${progress}%"></div>
            </div>
            <p class="time-info">
                ${formatTime(serverState.playbackState.currentTime)} /
                ${formatTime(serverState.playbackState.duration)}
            </p>
            <p class="device-info">
                ${serverState.deviceId}에서 재생 중
            </p>
            <div class="buttons">
                <button id="resume-btn">이어서 듣기</button>
                <button id="restart-btn">처음부터</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', ui);

    document.getElementById('resume-btn').addEventListener('click', () => {
        resumePlayback(serverState);
        closeModal();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        startFromBeginning();
        closeModal();
    });
}
```

---

### S4: 충돌 해결 전략

#### S4.1 타임스탬프 기반 전략

**서버 측 로직** (playback-state.js):
```javascript
// PUT 요청 처리
app.http('playback-state', {
    methods: ['PUT', 'GET', 'OPTIONS'],
    handler: async (request, context) => {
        if (request.method === 'PUT') {
            const clientState = await request.json();
            const serverState = await getServerState();

            const clientTimestamp = clientState.playbackState?.lastUpdated || clientState.timestamp;
            const serverTimestamp = serverState?.playbackState?.lastUpdated || serverState?.timestamp;

            let conflict = false;
            let merged = false;

            // 충돌 감지: 서버가 더 최신인 경우
            if (serverTimestamp && clientTimestamp < serverTimestamp) {
                conflict = true;
                // Last-Write-Wins: 서버 상태 유지
                return {
                    status: 200,
                    jsonBody: {
                        success: true,
                        timestamp: serverTimestamp,
                        conflict: true,
                        serverState: serverState,
                        message: '서버에 더 최신 상태가 있습니다.'
                    }
                };
            }

            // Debouncing: 5초 이내의 중복 업데이트 무시
            if (clientTimestamp && serverTimestamp && Math.abs(clientTimestamp - serverTimestamp) < 5000) {
                return {
                    status: 200,
                    jsonBody: {
                        success: true,
                        timestamp: serverTimestamp,
                        merged: true,
                        message: '중복 업데이트로 무시되었습니다.'
                    }
                };
            }

            // 클라이언트 상태 저장
            await saveState(clientState);

            return {
                status: 200,
                jsonBody: {
                    success: true,
                    timestamp: clientTimestamp,
                    conflict: false,
                    merged: false
                }
            };
        }
    }
});
```

#### S4.2 충돌 로그 기록

```javascript
// 충돌 로그 Blob
const CONFLICT_LOG_BLOB = 'conflict-log.json';

async function logConflict(clientState, serverState) {
    const logEntry = {
        timestamp: Date.now(),
        clientState: {
            deviceId: clientState.deviceId,
            lastPlayedIndex: clientState.lastPlayedIndex,
            currentTime: clientState.playbackState?.currentTime,
            status: clientState.playbackState?.status
        },
        serverState: {
            deviceId: serverState.deviceId,
            lastPlayedIndex: serverState.lastPlayedIndex,
            currentTime: serverState.playbackState?.currentTime,
            status: serverState.playbackState?.status
        },
        resolution: 'server-wins'
    };

    // 기존 로그에 추가
    const existingLog = await getConflictLog() || [];
    existingLog.push(logEntry);

    // 최근 100개만 유지
    const recentLog = existingLog.slice(-100);

    await saveConflictLog(recentLog);
}
```

---

### S5: 오프라인 지원

#### S5.1 로컬 Storage 캐싱

```javascript
window.offlineStateManager = {
    STORAGE_KEY: 'azureTTS_offlineState',
    QUEUE_KEY: 'azureTTS_offlineQueue',

    // 현재 상태 캐싱
    cacheState(state) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    },

    // 캐시된 상태 불러오기
    getCachedState() {
        const cached = localStorage.getItem(this.STORAGE_KEY);
        return cached ? JSON.parse(cached) : null;
    },

    // 오프라인 큐에 추가
    enqueue(state) {
        const queue = JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
        queue.push({
            state: state,
            timestamp: Date.now()
        });
        localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    },

    // 온라인 복구 시 큐 처리
    async processQueue() {
        const queue = JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');

        for (const item of queue) {
            try {
                await window.playbackStateManager.saveState(item.state);
            } catch (error) {
                console.error('큐 처리 실패:', error);
            }
        }

        localStorage.removeItem(this.QUEUE_KEY);
    }
};

// 온라인/오프라인 이벤트 리스너
window.addEventListener('online', () => {
    console.log('온라인 복구 - 큐 처리 시작');
    window.offlineStateManager.processQueue();
});

window.addEventListener('offline', () => {
    console.log('오프라인 모드 - 로컬 캐시 사용');
});
```

---

### S6: 백엔드 구현

#### S6.1 playback-state.js (신규)

```javascript
const { app } = require('@azure/functions');
const { getPlaybackStateContainer } = require('../../shared/blobHelper');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');

const STATE_BLOB_NAME = 'playback-state.json';

app.http('playback-state', {
    methods: ['GET', 'PUT', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'playback-state',
    handler: async (request, context) => {
        const requestOrigin = request.headers.get('origin');
        const corsHeaders = getCorsHeaders(requestOrigin);

        if (request.method === 'OPTIONS') {
            return handleCorsPreflightResponse(requestOrigin);
        }

        const containerClient = await getPlaybackStateContainer();

        // GET: 재생 상태 조회
        if (request.method === 'GET') {
            try {
                context.log('[PLAYBACK-GET] Request received');

                await containerClient.createIfNotExists({ access: 'blob' });
                const blobClient = containerClient.getBlobClient(STATE_BLOB_NAME);
                const exists = await blobClient.exists();

                if (!exists) {
                    return {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        jsonBody: { lastPlayedIndex: -1, playbackState: { status: 'stopped' } }
                    };
                }

                const downloadResponse = await blobClient.download();
                const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
                const state = JSON.parse(downloaded.toString());

                context.log(`[PLAYBACK-GET] State retrieved: index=${state.lastPlayedIndex}`);

                return {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    jsonBody: state
                };

            } catch (error) {
                context.error('[PLAYBACK-GET] Failed:', error);
                return {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    jsonBody: { error: 'Failed to retrieve playback state', message: error.message }
                };
            }
        }

        // PUT: 재생 상태 저장
        if (request.method === 'PUT') {
            try {
                const clientState = await request.json();

                context.log('[PLAYBACK-PUT] Request received:', {
                    index: clientState.lastPlayedIndex,
                    deviceId: clientState.deviceId,
                    currentTime: clientState.playbackState?.currentTime,
                    status: clientState.playbackState?.status
                });

                // 현재 서버 상태 조회
                const blobClient = containerClient.getBlockBlobClient(STATE_BLOB_NAME);
                const exists = await blobClient.exists();
                let serverState = null;

                if (exists) {
                    const downloadResponse = await blobClient.download();
                    const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
                    serverState = JSON.parse(downloaded.toString());
                }

                // 충돌 감지
                const clientTimestamp = clientState.playbackState?.lastUpdated || clientState.timestamp;
                const serverTimestamp = serverState?.playbackState?.lastUpdated || serverState?.timestamp;

                let conflict = false;

                if (serverState && serverTimestamp && clientTimestamp < serverTimestamp) {
                    conflict = true;
                    context.log('[PLAYBACK-PUT] Conflict detected - server is newer');

                    // 충돌 로그 기록
                    await logConflict(clientState, serverState);

                    return {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        jsonBody: {
                            success: true,
                            timestamp: serverTimestamp,
                            conflict: true,
                            serverState: serverState,
                            message: '서버에 더 최신 상태가 있습니다.'
                        }
                    };
                }

                // Debouncing
                if (serverState && clientTimestamp && serverTimestamp &&
                    Math.abs(clientTimestamp - serverTimestamp) < 5000) {
                    context.log('[PLAYBACK-PUT] Debouncing - duplicate update ignored');
                    return {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        jsonBody: {
                            success: true,
                            timestamp: serverTimestamp,
                            merged: true,
                            message: '중복 업데이트로 무시되었습니다.'
                        }
                    };
                }

                // 상태 저장
                const timestamp = Date.now();
                const stateToSave = {
                    ...clientState,
                    timestamp: timestamp,
                    playbackState: {
                        ...clientState.playbackState,
                        lastUpdated: timestamp
                    }
                };

                const content = JSON.stringify(stateToSave, null, 2);
                await blobClient.upload(content, content.length, {
                    blobHTTPHeaders: {
                        blobContentType: 'application/json',
                        blobCacheControl: 'no-cache'
                    }
                });

                context.log('[PLAYBACK-PUT] State saved successfully');

                return {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    jsonBody: {
                        success: true,
                        timestamp: timestamp,
                        conflict: false,
                        merged: false
                    }
                };

            } catch (error) {
                context.error('[PLAYBACK-PUT] Failed:', error);
                return {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    jsonBody: {
                        error: 'Failed to save playback state',
                        message: error.message
                    }
                };
            }
        }

        return {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            jsonBody: { error: 'Method not allowed' }
        };
    }
});

async function streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => resolve(Buffer.concat(chunks)));
        readableStream.on('error', reject);
    });
}

async function logConflict(clientState, serverState) {
    // 충돌 로그 기록 구현
    // ...
}
```

---

## 추적성 (Traceability)

### 요구사항-설계 매핑

| 요구사항 | 관련 설계 섹션 | 검증 방법 |
|----------|----------------|-----------|
| R1 (재생 상태 추적) | S1.1, S3.1 | currentTime 정확성 테스트 |
| R2 (설정 동기화) | S1.1, S2.2 | playbackRate, volume 동기화 테스트 |
| R3 (노트 컨텍스트) | S1.1 | contentHash 변경 감지 테스트 |
| R4 (API 호환성) | S2.3 | 기존 클라이언트 호환성 테스트 |
| R5 (충돌 해결) | S4.1, S4.2 | 다중 디바이스 충돌 시나리오 |
| R6 (오프라인 지원) | S5.1 | 오프라인 큐 처리 테스트 |
| R7 (UI/UX) | S3.2 | 이어서 듣기 UI 테스트 |

### 영향도 분석

**영향받는 컴포넌트**:
- `src/functions/playback-state.js` (신규) - 향상된 재생 상태 API
- `src/functions/playback-position.js` (기존 유지) - 역호환성 유지
- `templates/v5-keychain/tts-reader-v5-keychain.md` - 클라이언트 상태 관리자
- `shared/blobHelper.js` - playback-state 컨테이너 추가
- `docs/guides/cross-device-playback-sync.md` - 문서 업데이트

**의존성**:
- Obsidian 1.11.5+ (Keychain API)
- Azure Functions v4
- Azure Blob Storage
- HTML5 Audio API

### 관련 SPEC
- SPEC-PERF-001: 폴링 최적화 (동기화 빈도 최적화)
- SPEC-FIX-001: 스크롤 위치 저장 버그 수정 (ETag 검증 패턴 참조)

---

## 참고 자료

### 프로젝트 문서
- `docs/guides/cross-device-playback-sync.md` - 기존 동기화 방식
- `SECURITY-PERFORMANCE-REFACTORING.md` - 보안 및 성능 고려사항

### 기술 문서
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN: HTML5 Audio](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio)
- [Azure Blob Storage](https://learn.microsoft.com/azure/storage/blobs/)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
