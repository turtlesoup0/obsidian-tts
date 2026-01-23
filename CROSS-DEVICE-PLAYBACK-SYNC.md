# 이기종 디바이스 간 재생 위치 동기화 구현 계획

## 📋 요구사항

사용자가 PC, 태블릿, 스마트폰 등 여러 디바이스에서 TTS를 사용할 때, 가장 마지막으로 재생했던 노트 위치를 모든 디바이스에서 공유하여 이어서 재생할 수 있도록 함.

## 🎯 목표

- ✅ 디바이스 간 재생 위치 동기화
- ✅ 최소한의 서버 부하 (가벼운 JSON 저장)
- ✅ 기존 로컬 저장소 방식과의 호환성 유지
- ✅ 충돌 해결 (최신 타임스탬프 우선)

## 🏗️ 아키텍처

### 현재 방식 (v4.1)
```
localStorage: {
  "azureTTS_lastPlayedIndex": "42"
}
```
- 로컬 디바이스에만 저장
- 다른 디바이스에서 접근 불가

### 개선 방식 (v4.2)
```
Azure Blob Storage:
  playback-position.json: {
    "lastPlayedIndex": 42,
    "notePath": "1_Project/정보 관리 기술사/...",
    "noteTitle": "API 정의",
    "timestamp": 1737672000000,
    "deviceId": "desktop-chrome"
  }
```
- 서버에 저장 → 모든 디바이스에서 공유
- 타임스탬프 기반 충돌 해결
- 디바이스 ID로 추적 가능

## 📡 API 설계

### GET /api/playback-position

재생 위치 조회

**응답:**
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "timestamp": 1737672000000,
  "deviceId": "desktop-chrome"
}
```

**응답 (데이터 없음):**
```json
{
  "lastPlayedIndex": -1
}
```

### PUT /api/playback-position

재생 위치 저장

**요청:**
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "deviceId": "desktop-chrome"
}
```

**응답:**
```json
{
  "success": true,
  "timestamp": 1737672000000
}
```

## 🔧 구현 세부사항

### 1. 백엔드 (Azure Functions)

**파일**: `src/functions/playback-position.js`

```javascript
const { app } = require('@azure/functions');
const { getBlobServiceClient } = require('../../shared/blobHelper');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');

const POSITION_BLOB_NAME = 'playback-position.json';

function getPositionContainer() {
  const blobServiceClient = getBlobServiceClient();
  return blobServiceClient.getContainerClient('tts-playback');
}

app.http('playback-position', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'playback-position',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    const containerClient = getPositionContainer();

    // GET: 재생 위치 조회
    if (request.method === 'GET') {
      try {
        await containerClient.createIfNotExists({ access: 'private' });
        const blobClient = containerClient.getBlobClient(POSITION_BLOB_NAME);

        const exists = await blobClient.exists();
        if (!exists) {
          return {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            jsonBody: { lastPlayedIndex: -1 }
          };
        }

        const downloadResponse = await blobClient.download();
        const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
        const position = JSON.parse(downloaded.toString());

        return {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: position
        };

      } catch (error) {
        context.error('Failed to get playback position:', error);
        return {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: { error: 'Failed to retrieve playback position' }
        };
      }
    }

    // PUT: 재생 위치 저장
    if (request.method === 'PUT') {
      try {
        const { lastPlayedIndex, notePath, noteTitle, deviceId } = await request.json();

        if (typeof lastPlayedIndex !== 'number' || lastPlayedIndex < -1) {
          return {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            jsonBody: { error: 'Invalid lastPlayedIndex' }
          };
        }

        await containerClient.createIfNotExists({ access: 'private' });

        const timestamp = Date.now();
        const position = {
          lastPlayedIndex,
          notePath: notePath || '',
          noteTitle: noteTitle || '',
          timestamp,
          deviceId: deviceId || 'unknown'
        };

        const blobClient = containerClient.getBlockBlobClient(POSITION_BLOB_NAME);
        const content = JSON.stringify(position, null, 2);

        await blobClient.upload(content, content.length, {
          blobHTTPHeaders: { blobContentType: 'application/json' }
        });

        context.log(`Playback position saved: index=${lastPlayedIndex}, device=${deviceId}`);

        return {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: { success: true, timestamp }
        };

      } catch (error) {
        context.error('Failed to save playback position:', error);
        return {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: { error: 'Failed to save playback position' }
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
```

### 2. 프론트엔드 (Obsidian)

**수정 위치**: `TTS 출제예상 읽기 v4 (Enhanced).md`

#### 2.1 서버 재생 위치 관리자 추가

```javascript
// ============================================
// 🔄 Playback Position Sync Manager
// ============================================

window.playbackPositionManager = {
    apiEndpoint: 'https://your-function-app-name.azurewebsites.net/api/playback-position',
    deviceId: null,

    init() {
        // 디바이스 ID 생성 (브라우저 fingerprint)
        this.deviceId = this.getDeviceId();
        console.log('📱 Device ID:', this.deviceId);
    },

    getDeviceId() {
        let deviceId = localStorage.getItem('azureTTS_deviceId');
        if (!deviceId) {
            // 간단한 디바이스 ID 생성 (UA + 랜덤)
            const ua = navigator.userAgent;
            const platform = navigator.platform;
            const random = Math.random().toString(36).substring(2, 10);
            deviceId = `${platform}-${random}`;
            localStorage.setItem('azureTTS_deviceId', deviceId);
        }
        return deviceId;
    },

    async getPosition() {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.warn('Failed to get server playback position');
                return { lastPlayedIndex: -1 };
            }

            const data = await response.json();
            console.log('☁️ Server playback position:', data);
            return data;

        } catch (error) {
            console.error('Error getting playback position:', error);
            return { lastPlayedIndex: -1 };
        }
    },

    async savePosition(lastPlayedIndex, notePath, noteTitle) {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lastPlayedIndex,
                    notePath,
                    noteTitle,
                    deviceId: this.deviceId
                })
            });

            if (!response.ok) {
                console.warn('Failed to save playback position to server');
                return false;
            }

            const result = await response.json();
            console.log('☁️ Playback position saved to server:', result);
            return true;

        } catch (error) {
            console.error('Error saving playback position:', error);
            return false;
        }
    },

    async syncPosition(localIndex) {
        // 서버에서 가져온 위치와 로컬 위치 비교
        const serverData = await this.getPosition();
        const localTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);

        // 서버 데이터가 더 최신이면 서버 값 사용
        if (serverData.timestamp && serverData.timestamp > localTimestamp) {
            console.log(`🔄 Using server position (newer): index=${serverData.lastPlayedIndex}`);
            return serverData.lastPlayedIndex;
        }

        // 로컬이 더 최신이면 로컬 값 사용
        console.log(`📱 Using local position (newer): index=${localIndex}`);
        return localIndex;
    }
};
```

#### 2.2 재생 시작 시 서버 동기화

```javascript
// 재생 시작 버튼 핸들러 수정
async startPlayback() {
    // 초기화
    await window.playbackPositionManager.init();

    // 로컬 저장소에서 마지막 재생 위치 복원
    const localIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
    const savedIndex = localIndex ? parseInt(localIndex, 10) : -1;

    // 서버와 동기화하여 최신 위치 가져오기
    const syncedIndex = await window.playbackPositionManager.syncPosition(savedIndex);
    window.azureTTSReader.lastPlayedIndex = syncedIndex;

    // UI 업데이트
    if (syncedIndex >= 0) {
        console.log(`🔄 재생 위치 복원: ${syncedIndex + 1}번 노트 다음부터 시작`);
    }

    // 재생 시작...
}
```

#### 2.3 재생 완료 시 서버 저장

```javascript
// 노트 재생 완료 핸들러 수정
async onNoteComplete(index) {
    const reader = window.azureTTSReader;
    reader.lastPlayedIndex = index;

    // 로컬 저장
    localStorage.setItem('azureTTS_lastPlayedIndex', index.toString());
    localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());

    // 서버 저장
    const note = reader.pages[index];
    if (note) {
        await window.playbackPositionManager.savePosition(
            index,
            note.file.path,
            note.file.name
        );
    }
}
```

## 🔐 보안 고려사항

1. **Private Container**: playback-position은 공개할 필요 없음 (access: 'private')
2. **사용자 식별**: 현재는 익명, 추가 인증이 필요하면 API Key 사용
3. **충돌 해결**: 타임스탬프 기반 (최신 우선)

## 📊 데이터 크기

- playback-position.json: ~200 bytes
- 서버 저장 빈도: 노트 재생 완료 시 (분당 1-2회)
- 월간 트래픽: ~1 MB 이하 (무시할 수준)

## 🧪 테스트 시나리오

### 시나리오 1: 단일 디바이스
1. PC에서 42번 노트까지 재생
2. 서버에 저장됨
3. PC 새로고침 → 43번부터 재생 ✅

### 시나리오 2: 디바이스 전환
1. PC에서 42번 노트까지 재생
2. 태블릿에서 재생 시작
3. 서버에서 42번 불러옴 → 43번부터 재생 ✅

### 시나리오 3: 충돌 해결
1. PC에서 오프라인으로 50번까지 재생 (로컬 저장)
2. 태블릿에서 온라인으로 40번까지 재생 (서버 저장)
3. PC 온라인 복귀 → 타임스탬프 비교
4. PC가 더 최신이면 서버 업데이트 ✅

## 📝 구현 순서

1. ✅ 문서 작성 (현재)
2. ⏳ 백엔드 API 구현 (playback-position.js)
3. ⏳ 프론트엔드 동기화 매니저 추가
4. ⏳ 로컬 테스트
5. ⏳ Azure 배포 및 통합 테스트
6. ⏳ README 업데이트

## 🚀 배포 후 사용법

### API 엔드포인트 설정

프론트엔드 코드에서 API 엔드포인트 수정:

```javascript
window.playbackPositionManager = {
    apiEndpoint: 'https://your-function-app-name.azurewebsites.net/api/playback-position',
    // ...
};
```

### 디바이스별 동작 확인

```javascript
// 브라우저 콘솔에서 확인
localStorage.getItem('azureTTS_deviceId')  // 디바이스 ID
localStorage.getItem('azureTTS_lastPlayedIndex')  // 로컬 위치
```

### 서버 상태 확인

```bash
# 현재 저장된 재생 위치 조회
curl https://your-function-app-name.azurewebsites.net/api/playback-position

# 수동으로 위치 저장 (테스트용)
curl -X PUT https://your-function-app-name.azurewebsites.net/api/playback-position \
  -H "Content-Type: application/json" \
  -d '{"lastPlayedIndex": 42, "notePath": "test.md", "noteTitle": "Test", "deviceId": "test-device"}'
```

## 💡 향후 개선 가능 사항

1. **사용자별 재생 위치**: 인증 추가하여 여러 사용자 지원
2. **재생 이력**: 최근 재생한 노트 10개 저장
3. **북마크 기능**: 특정 위치 저장 및 바로가기
4. **재생 통계**: 가장 많이 재생한 노트 추적
