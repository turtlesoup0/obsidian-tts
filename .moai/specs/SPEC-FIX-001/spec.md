---
spec_id: SPEC-FIX-001
title: PC에서 스크롤 위치 저장 실패 버그 조사 및 수정
status: Planned
priority: High
created: 2026-02-05
assigned: manager-spec
tags: bug, scroll-position, pc-only, storage, debugging
lifecycle_level: spec-first
related_specs:
  - SPEC-PERF-001
---

# SPEC-FIX-001: PC에서 스크롤 위치 저장 실패 버그 조사 및 수정

## 환경 (Environment)

### 시스템 컨텍스트
- **프로젝트**: obsidian-tts v5.1.0
- **배포 환경**:
  - 백엔드: Azure Functions (serverless)
  - 스토리지: Azure Blob Storage
  - 프론트엔드: Obsidian Desktop/Mobile (DataviewJS)
- **지원 플랫폼**: macOS, Windows, Linux, iOS, Android

### 기술 스택
- **백엔드**: Node.js 18.x, Azure Functions v4
- **프론트엔드**: JavaScript (DataviewJS), Obsidian 1.11.5+
- **스토리지**: Azure Blob Storage (scroll-position.json)
- **통신**: HTTP/HTTPS (PUT method)

### 버그 신고 정보
- **신고일자**: 2026-02-05
- **증상**: PC에서 "저장" 버튼 누르면 scroll-position API가 HTTP 200을 반환하지만 실제로는 위치가 저장되지 않음
- **영향 플랫폼**: PC (Desktop) 전용
- **정상 작동 플랫폼**: iPad (Mobile)
- **에러 메시지**: 없음 (Silent failure)

## 가정 (Assumptions)

### 기술적 가정
1. **백엔드 API 정상 작동 가정**: scroll-position.js API가 서버 측에서 정상적으로 동작한다고 가정
2. **iPad 정상 작동 확인**: 모바일 환경(iPad)에서는 동일한 코드가 정상 작동하므로, PC 특정 문제라고 가정
3. **네트워크 연결**: PC와 iPad가 동일한 네트워크 환경을 사용한다고 가정 (CORS 이슈 배제)
4. **API 응답 200**: HTTP 200 응답이 실제 서버 처리 성공을 의미한다고 가정

### 검증 필요 가정 (Confidence: Medium)
1. **Blob Storage 업로드 성공 가정**: API가 200을 반환했지만 실제로 Blob에 데이터가 쓰여지지 않았을 가능성
   - 검증 방법: Azure Storage Explorer에서 Blob 내용 확인
2. **요청 페이로드 차이 가정**: PC에서 보내는 요청 데이터 형식이 iPad와 다를 가능성
   - 검증 방법: Network 탭에서 요청 페이로드 비교
3. **Azure Function 로그 가정**: Azure Functions 로그에 실제 저장 실패 기록이 있을 가능성
   - 검증 방법: Azure Portal에서 Application Insights 로그 확인

---

## 요구사항 (Requirements)

### R1: 버그 재현 및 원인 분석 (Event-Driven)
**WHEN** 사용자가 PC에서 "저장" 버튼을 누르면 **THEN** 시스템은 버그를 재현하고 근본 원인을 파악해야 한다.

- **R1.1**: Network 탭에서 scroll-position PUT 요청 캡처
- **R1.2**: 요청 페이로드 (savedNoteName, savedIndex, deviceId) 값 확인
- **R1.3**: 응답 본문 (response body) 확인
- **R1.4**: Azure Storage Blob에서 실제 저장된 데이터 확인
- **R1.5**: PC와 iPad 요청/응답 비교 분석

### R2: 잠재적 원인 탐색 (State-Driven)
**IF** 버그가 재현되면 **THEN** 시스템은 가능한 모든 원인을 체계적으로 탐색해야 한다.

- **R2.1**: **CORS 구성 차이**: PC Obsidian Desktop이 보내는 Origin 헤더와 iPad의 Origin 헤더 차이 분석
- **R2.2**: **요청 페이로드 차이**: savedNoteName, savedIndex, deviceId 값의 데이터 타입이나 형식 차이 분석
- **R2.3**: **Blob Storage 업로드 실패**: API가 200을 반환하지만 실제 업로드는 실패하는 시나리오 분석
- **R2.4**: **Blob 오버라이트 동작**: 동일한 키로 여러 번 업로드 시 Azure Blob의 동작 방식 분석
- **R2.5**: **Obsidian Desktop vs Mobile API 차이**: Electron 기반 Desktop과 WebView 기반 Mobile의 fetch API 동작 차이 분석

### R3: 디버깅 전략 수립 (Ubiquitous)
**시스템은** 포괄적인 디버깅 로깅 및 진단 도구를 제공해야 한다.

- **R3.1**: 클라이언트 측 로깅 포인트 추가 (요청 전/후, 응답 수신 시)
- **R3.2**: 백엔드 Azure Functions 로깅 강화 (요청 수신, 업로드 시도, 업로드 결과)
- **R3.3**: Azure Blob Storage 업로드 검증 로그 추가
- **R3.4**: 디버그 모드 UI (요청/응답 상세 표시)

### R4: 해결 방안 구현 (Unwanted)
**시스템은** 충분한 원인 분석 없이 임시 방편으로 수정해서는 안 된다.

- **R4.1**: 근본 원인이 확인된 후에만 수정 적용
- **R4.2**: 수정 후 PC와 iPad 모두에서 동작 검증
- **R4.3**: 회귀(regression) 방지를 위한 테스트 케이스 추가
- **R4.4**: 동일한 문제가 재발하지 않도록 방어 코드 추가

### R5: 문서화 및 예방 (Optional)
**가능하면** 시스템은 버그 해결 과정과 예방 조치를 문서화해야 한다.

- **R5.1**: 버그 원인 분석 보고서 작성
- **R5.2**: 플랫폼별 동작 차이 문서화
- **R5.3**: TROUBLESHOOTING-SYNC-ISSUE.md에 해결 방법 추가
- **R5.4**: 개발자 가이드에 디버깅 절차 추가

---

## 상세사양 (Specifications)

### S1: 현재 시스템 아키텍처 분석

#### S1.1 백엔드 API 동작 (scroll-position.js)

**PUT /api/scroll-position 요청 처리 흐름**:
```javascript
// 현재 구조 (Line 93-147)
1. request.json()에서 body 파싱
2. savedNoteName, savedIndex, deviceId 추출
3. savedIndex 유효성 검사 (number >= -1)
4. containerClient.createIfNotExists()
5. position 객체 생성 (timestamp 추가)
6. JSON.stringify(position, null, 2)
7. blobClient.upload(content, content.length)
8. HTTP 200 + { success: true, timestamp } 반환
```

**가능한 실패 지점**:
- `blobClient.upload()`가 실패해도 try-catch로 잡히지 않는 경우
- Azure Blob Storage의 BlockBlob 업로드가 비동기로 처리되어 200을 먼저 반환하는 경우
- Blob 컨테이너가 존재하지만 권한 문제로 업로드가 실패하는 경우

#### S1.2 클라이언트 요청 형식

**요청 페이로드**:
```json
{
  "savedNoteName": "출제예상 노트 이름",
  "savedIndex": 42,
  "deviceId": "MacIntel-abc123"
}
```

**deviceId 생성 로직 (추정)**:
```javascript
// deviceId 생성이 플랫폼별로 다를 가능성
// PC: "MacIntel-xxx" 또는 "Win32-xxx"
// iPad: "iPad-xxx" 또는 "iPhone-xxx"
```

#### S1.3 PC vs iPad 환경 차이

| 항목 | PC (Desktop) | iPad (Mobile) |
|------|--------------|---------------|
| Obsidian 런타임 | Electron | WebView (iOS/Android) |
| User-Agent | Chrome/Edge Safari 문자열 포함 | Mobile Safari 문자열 포함 |
| Origin 헤더 | `app://obsidian.md` 또는 `capacitor://` | `app://obsidian.md` 또는 `capacitor://` |
| Fetch API | Chromium 기본 제공 | iOS WebView 기본 제공 |
| Storage 로컬 API | localStorage, IndexedDB | localStorage, IndexedDB |

### S2: 잠재적 원인 상세 분석

#### S2.1 CORS Origin 검증 실패 (가능성: 중)

**시나리오**:
1. PC Obsidian Desktop이 `app://obsidian.md` 또는 다른 Origin을 보냄
2. corsHelper.js의 `isOriginAllowed()`가 해당 Origin을 거부
3. CORS preflight가 실패하지만, PUT 요청은 200을 반환
4. 실제 데이터는 저장되지 않음

**검증 방법**:
```javascript
// scroll-position.js Line 35에 로그 추가
context.log('Request Origin:', requestOrigin);
context.log('CORS Allowed:', isOriginAllowed(requestOrigin));
```

**예상 로그**:
```
PC (실패): Request Origin: app://obsidian.md → CORS Allowed: false
iPad (성공): Request Origin: capacitor://obsidian.md → CORS Allowed: true
```

#### S2.2 Blob 업로드 비동기 처리 문제 (가능성: 높음)

**시나리오**:
1. Azure Blob Storage의 `upload()` 메서드가 비동기로 처리됨
2. 업로드 완료를 기다리지 않고 HTTP 200을 반환
3. 실제 업로드는 백그라운드에서 진행 중이거나 실패
4. 클라이언트는 200을 받아 성공으로 간주하지만 데이터는 저장되지 않음

**현재 코드 분석** (Line 128-133):
```javascript
await blobClient.upload(content, content.length, {
  blobHTTPHeaders: {
    blobContentType: 'application/json',
    blobCacheControl: 'no-cache'
  }
});
```

**문제점**: `await`가 사용되고 있으므로 업로드 완료를 기다림. 하지만 다음 가능성 존재:
- Azure Storage SDK 내부에서 업로드 실패를 throw하지 않고 HTTP 200을 반환하는 경우
- Blob 컨테이너 권한 문제로 업로드가 조용히 실패하는 경우

#### S2.3 요청 페이로드 데이터 타입 문제 (가능성: 중)

**시나리오**:
1. PC에서 보내는 `savedIndex`가 숫자가 아닌 문자열
2. 백엔드의 `typeof savedIndex !== 'number'` 검사를 통과하지 못함
3. 하지만 HTTP 400 대신 200을 반환 (코드 오류 가능성)

**현재 검증 로직** (Line 101-110):
```javascript
if (typeof savedIndex !== 'number' || savedIndex < -1) {
  return {
    status: 400,
    // ... error response
  };
}
```

**문제점**: 이 검증이 정상 작동하면 400을 반환해야 함. 200이 반환되는 다른 경로 존재 가능성.

#### S2.4 Blob 이름 충돌 또는 컨테이너 문제 (가능성: 낮음)

**시나리오**:
1. 여러 클라이언트(PC, iPad)가 동일한 Blob(`scroll-position.json`)에 동시에 쓰기
2. Azure Blob Storage의 마지막 쓰기 승리(Last-Write-Wins) 정책
3. PC의 쓰기가 iPad의 쓰기로 덮어쓰여짐

**반론**: 사용자는 "저장" 버튼을 눌렀을 때 즉시 저장되지 않는다고 보고함. 동시 쓰기 문제가 아니라 단일 쓰기 실패 문제.

#### S2.5 Obsidian Desktop 특정 이슈 (가능성: 높음)

**시나리오**:
1. Obsidian Desktop (Electron)의 fetch API가 요청을 보내지 않음
2. 로컬 캐시된 응답을 반환 (200)
3. 실제 네트워크 요청은 발생하지 않음

**검증 방법**: Azure Functions Application Insights 로그에서 실제 요청 수신 여부 확인

### S3: 디버깅 전략

#### S3.1 클라이언트 측 로깅 강화

**추가할 로그 포인트**:
```javascript
// 저장 버튼 클릭 핸들러 (예상 위치)
async function saveScrollPosition() {
  const payload = {
    savedNoteName: currentNote,
    savedIndex: currentIndex,
    deviceId: getDeviceId()
  };

  console.log('[DEBUG] Scroll position save request:', {
    url: apiEndpoint,
    method: 'PUT',
    payload: payload,
    timestamp: Date.now()
  });

  try {
    const response = await fetch(apiEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('[DEBUG] Response status:', response.status);
    console.log('[DEBUG] Response headers:', Object.fromEntries(response.headers));

    const result = await response.json();
    console.log('[DEBUG] Response body:', result);

    // 저장 검증: 즉시 GET 요청으로 확인
    console.log('[DEBUG] Verifying save...');
    const verifyResponse = await fetch(apiEndpoint, { method: 'GET' });
    const verifyData = await verifyResponse.json();
    console.log('[DEBUG] Verification result:', verifyData);

  } catch (error) {
    console.error('[DEBUG] Save failed:', error);
  }
}
```

#### S3.2 백엔드 로깅 강화

**추가할 로그 포인트** (scroll-position.js):
```javascript
// PUT 요청 핸들러 시작
context.log('[SCROLL-DEBUG] PUT request received');
context.log('[SCROLL-DEBUG] Origin:', request.headers.get('origin'));
context.log('[SCROLL-DEBUG] User-Agent:', request.headers.get('user-agent'));

// Body 파싱 후
context.log('[SCROLL-DEBUG] Request body:', {
  savedNoteName: body.savedNoteName,
  savedIndex: body.savedIndex,
  savedIndexType: typeof body.savedIndex,
  deviceId: body.deviceId
});

// Blob 업로드 전
context.log('[SCROLL-DEBUG] Attempting blob upload...');
context.log('[SCROLL-DEBUG] Container:', containerClient.containerName);
context.log('[SCROLL-DEBUG] Blob name:', POSITION_BLOB_NAME);
context.log('[SCROLL-DEBUG] Content length:', content.length);

// Blob 업로드 후
const uploadResult = await blobClient.upload(content, content.length, {
  blobHTTPHeaders: {
    blobContentType: 'application/json',
    blobCacheControl: 'no-cache'
  }
});

context.log('[SCROLL-DEBUG] Upload result:', {
  etag: uploadResult.etag,
  lastModified: uploadResult.lastModified,
  contentMD5: uploadResult.contentMD5
});

// 응답 직전
context.log('[SCROLL-DEBUG] Sending 200 response');
```

#### S3.3 Azure Storage 진단

**Azure Storage Explorer로 확인**:
1. Blob 컨테이너 존재 여부 확인
2. `scroll-position.json` 파일 존재 여부 확인
3. 파일 내용 확인 (마지막 수정 시간, 데이터 내용)
4. PC에서 저장 후 즉시 확인 (업데이트 여부)

#### S3.4 네트워크 요청 분석

**PC 브라우저 DevTools 사용**:
1. Network 탭에서 `scroll-position` PUT 요청 필터링
2. Request Headers 확인 (Origin, User-Agent, Content-Type)
3. Request Payload 확인 (JSON 데이터)
4. Response Headers 확인 (CORS 헤더)
5. Response Body 확인 (success: true 여부)

**iPad Safari Web Inspector 사용**:
1. Mac Safari → Develop → [iPad] → Inspect
2. Network 탭에서 동일한 분석 수행
3. PC와 iPad 요청/응답 비교

### S4: 수정 방안

#### S4.1 근본 원인별 수정 방안

**CASE 1: CORS Origin 검증 실패**
```javascript
// corsHelper.js 수정
function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  // PC Obsidian Desktop Origin 명시적으로 허용
  const DESKTOP_ORIGINS = [
    'app://obsidian.md',
    'app://localhost',
    'capacitor://obsidian.md',
    'capacitor://localhost'
  ];

  if (DESKTOP_ORIGINS.includes(origin)) {
    return true;
  }

  // 기존 로직 유지
  return allowedOrigins.some(allowed => {
    if (allowed === origin) return true;
    // ...
  });
}
```

**CASE 2: Blob 업로드 검증 강화**
```javascript
// scroll-position.js 수정
const uploadResult = await blobClient.upload(content, content.length, {
  blobHTTPHeaders: {
    blobContentType: 'application/json',
    blobCacheControl: 'no-cache'
  }
});

// 업로드 결과 검증
if (!uploadResult.etag) {
  context.error('[SCROLL-DEBUG] Upload failed: no ETag');
  throw new Error('Blob upload failed: no ETag returned');
}

// 업로드 후 즉시 읽기 검증
const verifyClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
const verifyResponse = await verifyClient.download();
const verifyContent = (await streamToBuffer(verifyResponse.readableStreamBody)).toString();

if (verifyContent !== content) {
  context.error('[SCROLL-DEBUG] Verification failed: content mismatch');
  throw new Error('Blob upload verification failed');
}

context.log('[SCROLL-DEBUG] Upload verified successfully');
```

**CASE 3: 요청 페이로드 데이터 타입 검증 강화**
```javascript
// scroll-position.js 수정
const body = await request.json();

// 명시적 타입 변환
const savedNoteName = String(body.savedNoteName || '');
const savedIndex = parseInt(body.savedIndex, 10);
const deviceId = String(body.deviceId || 'unknown');

context.log('[SCROLL-DEBUG] Parsed values:', {
  savedNoteName,
  savedIndex,
  savedIndexType: typeof savedIndex,
  deviceId
});

// NaN 검사
if (isNaN(savedIndex)) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Invalid savedIndex: must be a valid number' }
  };
}
```

#### S4.2 방어 코드 추가

**클라이언트 측 저장 검증**:
```javascript
async function saveScrollPositionWithVerification(payload) {
  // 1. 저장 요청
  const saveResponse = await fetch(apiEndpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!saveResponse.ok) {
    throw new Error(`Save failed: ${saveResponse.status}`);
  }

  const saveResult = await saveResponse.json();

  // 2. 즉시 검증 요청
  const verifyResponse = await fetch(apiEndpoint, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!verifyResponse.ok) {
    console.warn('Verification request failed, assuming save succeeded');
    return saveResult;
  }

  const verifyData = await verifyResponse.json();

  // 3. 데이터 비교
  const isSaved = (
    verifyData.savedNoteName === payload.savedNoteName &&
    verifyData.savedIndex === payload.savedIndex &&
    Math.abs(verifyData.timestamp - Date.now()) < 5000 // 5초 이내
  );

  if (!isSaved) {
    console.error('[CRITICAL] Save verification failed!', {
      sent: payload,
      received: verifyData
    });

    // 재시도 또는 에러 표시
    throw new Error('Save verification failed: data mismatch');
  }

  console.log('[SUCCESS] Save verified:', verifyData);
  return saveResult;
}
```

---

## 추적성 (Traceability)

### 요구사항-설계 매핑

| 요구사항 | 관련 설계 섹션 | 검증 방법 |
|----------|----------------|-----------|
| R1 (버그 재현) | S1, S3.3, S3.4 | PC에서 재생 후 저장 테스트 |
| R2 (원인 탐색) | S2 | 각 원인별 검증 로그 확인 |
| R3 (디버깅 전략) | S3 | 로그 출력 확인 |
| R4 (해결 방안) | S4 | 수정 후 PC/iPad 테스트 |
| R5 (문서화) | S2.5 | TROUBLESHOOTING-SYNC-ISSUE.md 업데이트 |

### 영향도 분석

**영향받는 컴포넌트**:
- `src/functions/scroll-position.js` - 백엔드 API
- `shared/corsHelper.js` - CORS 헬퍼
- `templates/v5-keychain/tts-reader-v5-keychain.md` - 클라이언트 템플릿
- `TROUBLESHOOTING-SYNC-ISSUE.md` - 문서

**의존성**:
- Obsidian 1.11.5+ (Keychain API)
- Azure Functions v4
- Azure Blob Storage

### 관련 SPEC
- SPEC-PERF-001: 폴링 최적화 (동기화 관련)
