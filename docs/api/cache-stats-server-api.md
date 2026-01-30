# 서버 캐시 통계 API 추가

**작성일**: 2026-01-22
**문제**: localStorage는 디바이스 간 공유되지 않음
**해결**: 백엔드 API로 실제 서버 캐시 파일 수 조회

---

## 🎯 핵심 개선

### 문제
localStorage 기반 통계는 **같은 브라우저 내에서만** 작동:
- ❌ PC와 모바일 간 통계 공유 불가
- ❌ 실제 서버 캐시 파일 수와 불일치 가능

### 해결
새로운 `/api/cache-stats` 엔드포인트 추가:
- ✅ **Azure Blob Storage에서 직접** 파일 수 조회
- ✅ 모든 디바이스에서 **동일한 통계** 확인
- ✅ 실제 캐시 파일 수, 총 용량, 가장 오래된/최신 파일 정보

---

## 📡 API 사양

### Endpoint
```
GET /api/cache-stats
```

### Response
```json
{
  "totalFiles": 146,
  "totalSize": 30719808,
  "totalSizeMB": "29.30",
  "oldestFile": {
    "name": "test-hash-67890.mp3",
    "createdOn": "2026-01-22T10:33:48.000Z"
  },
  "newestFile": {
    "name": "d5c8dc176d41990915420841-5f285f84bd59ff874e8f1500.mp3",
    "createdOn": "2026-01-22T13:21:52.000Z"
  }
}
```

### Fields
- **totalFiles**: 서버에 저장된 캐시 파일 수
- **totalSize**: 총 용량 (bytes)
- **totalSizeMB**: 총 용량 (MB, 소수점 2자리)
- **oldestFile**: 가장 오래된 캐시 파일 정보
- **newestFile**: 가장 최근 캐시 파일 정보

---

## 🔧 구현

### 백엔드: `src/functions/cache-stats.js`

```javascript
const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

app.http('cache-stats', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache-stats',
  handler: async (request, context) => {
    // CORS 처리
    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      };
    }

    try {
      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient('tts-cache');

      // 컨테이너 존재 확인
      const exists = await containerClient.exists();
      if (!exists) {
        return {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: {
            totalFiles: 0,
            totalSize: 0,
            oldestFile: null,
            newestFile: null
          }
        };
      }

      // 모든 blob 나열
      const blobs = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength,
          createdOn: blob.properties.createdOn,
          lastModified: blob.properties.lastModified
        });
      }

      // 통계 계산
      const totalFiles = blobs.length;
      const totalSize = blobs.reduce((sum, blob) => sum + blob.size, 0);
      const sortedByDate = [...blobs].sort((a, b) => a.createdOn - b.createdOn);
      const oldestFile = sortedByDate.length > 0 ? {
        name: sortedByDate[0].name,
        createdOn: sortedByDate[0].createdOn
      } : null;
      const newestFile = sortedByDate.length > 0 ? {
        name: sortedByDate[sortedByDate.length - 1].name,
        createdOn: sortedByDate[sortedByDate.length - 1].createdOn
      } : null;

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        jsonBody: {
          totalFiles,
          totalSize,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
          oldestFile,
          newestFile
        }
      };

    } catch (error) {
      context.error('Cache stats error:', error);
      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get cache stats',
          message: error.message
        }
      };
    }
  }
});
```

### 프론트엔드: 서버 통계 조회 함수

```javascript
// 서버에서 실제 캐시 파일 수 조회
async getServerCacheCount() {
    try {
        const response = await fetch(`${this.cacheApiEndpoint}-stats`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📊 Server cache stats:', data);
            return data;
        }
    } catch (error) {
        console.error('Failed to fetch server stats:', error);
    }
    return null;
}
```

### 프론트엔드: 통계 표시 업데이트

```javascript
// 캐시 통계 UI 업데이트 (서버 통계 포함)
window.updateCacheStatsDisplay = async function() {
    const stats = window.serverCacheManager.stats;
    const hitRate = window.serverCacheManager.getHitRate();

    const cachedCountEl = document.getElementById('cached-count');
    const hitCountEl = document.getElementById('hit-count');
    const missCountEl = document.getElementById('miss-count');
    const hitRateEl = document.getElementById('hit-rate');

    if (cachedCountEl) cachedCountEl.textContent = stats.totalRequests;
    if (hitCountEl) hitCountEl.textContent = stats.cacheHits;
    if (missCountEl) missCountEl.textContent = stats.cacheMisses;
    if (hitRateEl) hitRateEl.textContent = `${hitRate}%`;

    // 서버 캐시 파일 수 조회 및 표시
    const serverStats = await window.serverCacheManager.getServerCacheCount();
    if (serverStats) {
        if (cachedCountEl) {
            cachedCountEl.innerHTML = `${stats.totalRequests} <small style="color: #999;">(서버: ${serverStats.totalFiles}개 파일, ${serverStats.totalSizeMB}MB)</small>`;
        }
    }
};
```

---

## 📊 UI 표시 예시

### Before (localStorage만)
```
총 요청: 10
캐시 히트: 5
캐시 미스: 5
Hit Rate: 50%
```

### After (서버 통계 포함)
```
총 요청: 10 (서버: 146개 파일, 29.30MB)
캐시 히트: 5
캐시 미스: 5
Hit Rate: 50%
```

---

## 🎯 장점

### 1. 디바이스 간 일관성
- ✅ PC, 모바일, 태블릿 모두 **동일한 서버 통계** 확인
- ✅ 실제 Azure Blob Storage 상태 반영

### 2. 정확성
- ✅ localStorage 통계는 **세션별 요청 추적**
- ✅ 서버 통계는 **실제 캐시 파일 수**
- ✅ 두 가지 관점 모두 제공

### 3. 디버깅 용이
- ✅ 서버에 몇 개의 파일이 있는지 확인 가능
- ✅ 총 용량 모니터링
- ✅ 가장 오래된/최신 캐시 확인

---

## 🧪 테스트

### 1. API 직접 호출
```bash
curl https://your-function-app.azurewebsites.net/api/cache-stats
```

**응답**:
```json
{
  "totalFiles": 146,
  "totalSize": 30719808,
  "totalSizeMB": "29.30",
  "oldestFile": {
    "name": "test-hash-67890.mp3",
    "createdOn": "2026-01-22T10:33:48.000Z"
  },
  "newestFile": {
    "name": "d5c8dc176d41990915420841-5f285f84bd59ff874e8f1500.mp3",
    "createdOn": "2026-01-22T13:21:52.000Z"
  }
}
```

### 2. Obsidian에서 확인
1. v4 노트 열기
2. F12 콘솔에서:
   ```javascript
   await window.serverCacheManager.getServerCacheCount()
   ```
3. "🔄 통계 새로고침" 버튼 클릭
4. UI에서 서버 파일 수 확인

---

## 📈 통계 해석

### 로컬 통계 (localStorage)
- **totalRequests**: 이 브라우저에서 시도한 총 캐시 조회 수
- **cacheHits**: 이 브라우저에서 성공한 캐시 히트 수
- **cacheMisses**: 이 브라우저에서 발생한 캐시 미스 수

### 서버 통계 (Blob Storage)
- **totalFiles**: 모든 디바이스가 생성한 총 캐시 파일 수
- **totalSize**: 실제 서버 스토리지 사용량
- **oldestFile/newestFile**: 캐시 생성 시간 범위

### 예시 해석
```
로컬: 10 요청, 5 히트, 5 미스 (50% hit rate)
서버: 146개 파일, 29.30MB

해석:
- 이 브라우저에서 10번 조회했고, 그 중 5번은 서버에 캐시가 있었음
- 서버에는 총 146개의 캐시가 있음 (다른 노트들 포함)
- 아직 조회하지 않은 136개의 노트가 이미 캐싱되어 있음
```

---

## 💡 향후 개선 아이디어

### 1. 디바이스별 통계 저장
```javascript
// 각 디바이스의 요청을 서버에 기록
POST /api/cache-stats/log
{
  "deviceId": "pc-chrome",
  "cacheHits": 5,
  "cacheMisses": 5
}
```

### 2. 실시간 대시보드
```javascript
// 전체 통계 조회
GET /api/cache-stats/summary
{
  "totalRequests": 1000,  // 모든 디바이스 합계
  "totalHits": 800,
  "totalMisses": 200,
  "hitRate": "80%",
  "devices": ["pc", "mobile", "tablet"]
}
```

### 3. 캐시 정리 기능
```javascript
// 오래된 캐시 삭제
DELETE /api/cache-stats/cleanup?olderThan=30days
```

---

## 🎉 결론

### 완료 사항
- ✅ `/api/cache-stats` 엔드포인트 추가
- ✅ Azure Blob Storage에서 직접 파일 수 조회
- ✅ 프론트엔드에서 서버 통계 표시
- ✅ 디바이스 간 일관된 통계 제공

### 사용자 액션
1. **Obsidian 재시작**
2. v4 노트 열기
3. "🔄 통계 새로고침" 버튼 클릭
4. 서버 파일 수 확인 (예: "10 (서버: 146개 파일, 29.30MB)")

### 실제 사용 예
```
[PC에서]
통계: 5/5 (서버: 146개 파일, 29.30MB)

[모바일에서]
통계: 10/10 (서버: 146개 파일, 29.30MB)

✅ 동일한 서버 통계를 모든 디바이스에서 확인!
```

---

**수정일**: 2026-01-22
**배포 상태**: ✅ 프로덕션 배포 완료
**API URL**: https://your-function-app.azurewebsites.net/api/cache-stats
