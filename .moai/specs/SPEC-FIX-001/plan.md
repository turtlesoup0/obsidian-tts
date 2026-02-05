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

# SPEC-FIX-001: 구현 계획 및 수정 전략

## 목차
1. [조사 단계](#조사-단계)
2. [수정 단계](#수정-단계)
3. [검증 단계](#검증-단계)
4. [기술적 접근 방식](#기술적-접근-방식)
5. [위험 관리](#위험-관리)

---

## 조사 단계

### 1단계: 버그 재현 및 데이터 수집 (최우선)

#### 목표
PC에서 버그를 재현하고 원인 파악에 필요한 데이터 수집

#### 작업 항목
**1.1 PC 환경에서 네트워크 요청 캡처**
- Obsidian Desktop DevTools 열기 (단축키: Ctrl+Shift+I 또는 Cmd+Option+I)
- Network 탭에서 `scroll-position` 필터링
- "저장" 버튼 클릭
- 캡처 항목:
  - Request URL
  - Request Method (PUT)
  - Request Headers (Origin, User-Agent, Content-Type)
  - Request Payload (JSON body)
  - Response Status (200)
  - Response Headers
  - Response Body

**1.2 iPad 환경에서 네트워크 요청 캡처**
- Mac Safari → 메뉴 → Develop → [iPad 이름] → 웹 페이지 검사
- Network 탭에서 동일한 분석 수행
- PC와 iPad의 요청/응답 비교

**1.3 Azure Blob Storage 상태 확인**
- Azure Storage Explorer 접속
- `scroll-position` 컨테이너 확인
- `scroll-position.json` Blob 확인:
  - 파일 존재 여부
  - 마지막 수정 시간
  - 파일 내용 (savedNoteName, savedIndex, timestamp)
  - PC 저장 전/후 시간 비교

**1.4 Azure Functions 로그 확인**
- Azure Portal → Function App → Log Stream
- scroll-position 함수의 실시간 로그 확인
- Application Insights 로그 쿼리:
  ```kusto
  requests
  | where name == "scroll-position"
  | where timestamp > ago(1h)
  | project timestamp, resultCode, success, user_Agent, customDimensions
  ```

#### 성공 기준
- PC에서 200 응답을 받지만 Blob에 데이터가 저장되지 않는 현상 재현
- PC와 iPad 요청의 차이점 명확히 식별

---

### 2단계: 근본 원인 분석

#### 원인 분석 체크리스트

**2.1 CORS Origin 검증**
- [ ] PC Origin 헤더 값 확인
- [ ] corsHelper.js의 `isOriginAllowed()` 로직 검증
- [ ] ALLOWED_ORIGINS 환경변수 값 확인
- [ ] PC Origin이 허용 목록에 있는지 확인

**2.2 요청 페이로드 분석**
- [ ] savedNoteName 값 타입 (string vs undefined)
- [ ] savedIndex 값 타입 (number vs string)
- [ ] deviceId 값 형식 (PC vs iPad 차이)
- [ ] JSON 파싱 에러 여부

**2.3 백엔드 API 동작 분석**
- [ ] request.json() 파싱 성공 여부
- [ ] typeof savedIndex 검사 통과 여부
- [ ] containerClient.createIfNotExists() 성공 여부
- [ ] blobClient.upload() 반환 값 확인 (ETag 존재 여부)

**2.4 Blob Storage 업로드 분석**
- [ ] 컨테이너 접근 권한 확인
- [ ] Blob 업로드 완료 여부 (ETag 확인)
- [ ] 업로드 후 즉시 다운로드 시도 → 내용 일치 여부

**2.5 플랫폼별 동작 차이**
- [ ] Obsidian Desktop (Electron) fetch API 동작
- [ ] Obsidian Mobile (WebView) fetch API 동작
- [ ] User-Agent 문자열 차이
- [ ] Origin 헤더 차이

#### 결정 트리

```
START
  |
  v
Azure Functions 로그에 요청 도착?
  YES --> body 파싱 성공?
           YES --> typeof 검사 통과?
                    YES --> blobClient.upload() ETag 존재?
                             YES --> Blob 검증 (다운로드) 일치?
                                      YES --> 클라이언트 측 문제 (200 반환 후 무시?)
                                      NO --> 업로드 검증 실패 (업로드는 성공했지만 데이터 손상)
                             NO --> blobClient.upload() 실패 (에러 throw 안 됨)
                    NO --> savedIndex 타입 불일치 (400 반환해야 함)
           NO --> JSON 파싱 실패 (400 반환해야 함)
  NO --> 요청이 백엔드 도착 안 함 (CORS 또는 네트워크 문제)
```

---

### 3단계: 디버깅 로그 추가

#### 백엔드 로그 추가 (scroll-position.js)

```javascript
// Line 26-27 이후 추가
context.log('========================================');
context.log('[SCROLL-PUT] Request received at:', new Date().toISOString());
context.log('[SCROLL-PUT] Origin:', request.headers.get('origin'));
context.log('[SCROLL-PUT] User-Agent:', request.headers.get('user-agent'));
context.log('[SCROLL-PUT] Content-Type:', request.headers.get('content-type'));

// Line 95-98 이후 추가
context.log('[SCROLL-PUT] Body parsed:');
context.log('  - savedNoteName:', savedNoteName, '(type:', typeof savedNoteName, ')');
context.log('  - savedIndex:', savedIndex, '(type:', typeof savedIndex, ')');
context.log('  - deviceId:', deviceId, '(type:', typeof deviceId, ')');

// Line 101-110 검증 로직 수정
if (typeof savedIndex !== 'number' || savedIndex < -1 || isNaN(savedIndex)) {
  context.warn('[SCROLL-PUT] Invalid savedIndex:', savedIndex, typeof savedIndex);
  return { status: 400, ... };
}
context.log('[SCROLL-PUT] Validation passed');

// Line 112-113 이후 추가
context.log('[SCROLL-PUT] Container check...');
const containerExists = await containerClient.exists();
context.log('[SCROLL-PUT] Container exists:', containerExists);

// Line 125-133 업로드 로직 수정
context.log('[SCROLL-PUT] Starting blob upload...');
context.log('  - Blob name:', POSITION_BLOB_NAME);
context.log('  - Content length:', content.length);
context.log('  - Content preview:', content.substring(0, 100));

try {
  const uploadResult = await blobClient.upload(content, content.length, {
    blobHTTPHeaders: {
      blobContentType: 'application/json',
      blobCacheControl: 'no-cache'
    }
  });

  context.log('[SCROLL-PUT] Upload completed');
  context.log('  - ETag:', uploadResult.etag);
  context.log('  - LastModified:', uploadResult.lastModified);

  // 업로드 검증
  context.log('[SCROLL-PUT] Verifying upload...');
  const verifyClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
  const verifyResponse = await verifyClient.download();
  const verifyContent = (await streamToBuffer(verifyResponse.readableStreamBody)).toString();

  const verifyMatch = verifyContent === content;
  context.log('[SCROLL-PUT] Verification:', verifyMatch ? 'PASSED' : 'FAILED');

  if (!verifyMatch) {
    context.error('[SCROLL-PUT] Content mismatch!');
    context.error('  Expected:', content.substring(0, 100));
    context.error('  Received:', verifyContent.substring(0, 100));
  }

  // 최종 응답 직전
  context.log('[SCROLL-PUT] Sending 200 response');
  context.log('========================================');

} catch (uploadError) {
  context.error('[SCROLL-PUT] Upload failed:', uploadError);
  throw uploadError;
}
```

#### 클라이언트 로그 추가 (tts-reader-v5-keychain.md)

저장 버튼 클릭 핸들러에 추가:
```javascript
async function saveScrollPosition() {
  console.log('========================================');
  console.log('[CLIENT-SCROLL] Save button clicked');
  console.log('[CLIENT-SCROLL] Time:', new Date().toISOString());

  const payload = {
    savedNoteName: getCurrentNoteName(),
    savedIndex: getCurrentIndex(),
    deviceId: getDeviceId()
  };

  console.log('[CLIENT-SCROLL] Payload:', payload);
  console.log('[CLIENT-SCROLL] API Endpoint:', apiEndpoint);

  try {
    console.log('[CLIENT-SCROLL] Sending PUT request...');

    const response = await fetch(apiEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('[CLIENT-SCROLL] Response received');
    console.log('  - Status:', response.status);
    console.log('  - Status Text:', response.statusText);
    console.log('  - Headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();
    console.log('[CLIENT-SCROLL] Response body:', result);

    if (response.ok && result.success) {
      console.log('[CLIENT-SCROLL] Save reported success, verifying...');

      // 즉시 검증 요청
      const verifyResponse = await fetch(apiEndpoint, { method: 'GET' });
      const verifyData = await verifyResponse.json();

      console.log('[CLIENT-SCROLL] Verification result:', verifyData);

      const isMatch = (
        verifyData.savedNoteName === payload.savedNoteName &&
        verifyData.savedIndex === payload.savedIndex
      );

      if (isMatch) {
        console.log('[CLIENT-SCROLL] ✓ Verification PASSED');
      } else {
        console.error('[CLIENT-SCROLL] ✗ Verification FAILED!');
        console.error('  Sent:', payload);
        console.error('  Got:', verifyData);
      }
    }

    console.log('========================================');

  } catch (error) {
    console.error('[CLIENT-SCROLL] Request failed:', error);
    console.log('========================================');
  }
}
```

---

## 수정 단계

### 수정 전략

**우선순위 기반 수정**:

1. **Primary (최우선)**: 근본 원인 해결
2. **Secondary**: 방어 코드 추가
3. **Tertiary**: 모니터링 및 알림 강화

---

### CASE별 수정 방안

#### CASE 1: CORS Origin 검증 실패

**증상**:
- PC Origin이 허용 목록에 없음
- Azure Functions 로그에 요청 도착 안 함

**수정 파일**: `shared/corsHelper.js`

```javascript
// 수정 전
function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  if (process.env.NODE_ENV === 'development' && allowedOrigins.includes('*')) {
    return true;
  }

  return allowedOrigins.some(allowed => {
    if (allowed === origin) return true;

    const ALLOWED_APP_IDS = ['obsidian.md', 'md.obsidian'];
    if (origin.startsWith('app://') || origin.startsWith('capacitor://')) {
      const appId = origin.split('//')[1]?.split('/')[0];
      return ALLOWED_APP_IDS.includes(appId);
    }

    return false;
  });
}

// 수정 후
function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  // 와일드카드는 개발 환경에서만 허용
  if (process.env.NODE_ENV === 'development' && allowedOrigins.includes('*')) {
    return true;
  }

  // 정확한 일치
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Obsidian 앱 Origin 명시적으로 허용
  const OBSIDIAN_APP_ORIGINS = [
    'app://obsidian.md',
    'app://localhost',
    'app://obsidian.local',
    'capacitor://obsidian.md',
    'capacitor://localhost',
    'capacitor://obsidian.local'
  ];

  if (OBSIDIAN_APP_ORIGINS.includes(origin)) {
    return true;
  }

  // 앱 ID 기반 와일드카드 매칭 (app://xxx 또는 capacitor://xxx)
  if (origin.startsWith('app://') || origin.startsWith('capacitor://')) {
    const appId = origin.split('//')[1]?.split('/')[0];
    const ALLOWED_APP_IDS = ['obsidian.md', 'md.obsidian', 'obsidian', 'localhost'];
    if (ALLOWED_APP_IDS.includes(appId)) {
      console.log('[CORS] Allowed app origin:', origin, '(appId:', appId, ')');
      return true;
    }
  }

  console.warn('[CORS] Blocked origin:', origin);
  return false;
}
```

---

#### CASE 2: Blob 업로드 검증 누락

**증상**:
- blobClient.upload()가 성공으로 보고하지만 실제로는 실패
- ETag가 없거나 null

**수정 파일**: `src/functions/scroll-position.js`

```javascript
// Line 125-147 수정
try {
  context.log('[SCROLL-PUT] Starting blob upload...');

  const uploadResult = await blobClient.upload(content, content.length, {
    blobHTTPHeaders: {
      blobContentType: 'application/json',
      blobCacheControl: 'no-cache',
      blobContentTypeCharset: 'utf-8'
    },
    metadata: {
      uploadedAt: new Date().toISOString(),
      deviceId: deviceId
    }
  });

  // 업로드 결과 검증
  if (!uploadResult || !uploadResult.etag) {
    context.error('[SCROLL-PUT] Upload failed: No ETag returned');
    context.error('[SCROLL-PUT] uploadResult:', uploadResult);
    throw new Error('Blob upload failed: No ETag returned');
  }

  context.log('[SCROLL-PUT] Upload succeeded');
  context.log('  - ETag:', uploadResult.etag);
  context.log('  - LastModified:', uploadResult.lastModified);

  // 업로드 후 즉시 검증 (read-back verify)
  context.log('[SCROLL-PUT] Verifying uploaded content...');
  const verifyClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
  const verifyResponse = await verifyClient.download();

  if (!verifyResponse || !verifyResponse.readableStreamBody) {
    context.error('[SCROLL-PUT] Verification failed: Cannot download blob');
    throw new Error('Blob upload verification failed: Cannot download');
  }

  const downloadedBuffer = await streamToBuffer(verifyResponse.readableStreamBody);
  const downloadedContent = downloadedBuffer.toString();

  // 내용 비교 (공백/줄바꿈 정규화 후 비교)
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  const normalizedDownloaded = downloadedContent.replace(/\s+/g, ' ').trim();

  if (normalizedContent !== normalizedDownloaded) {
    context.error('[SCROLL-PUT] Verification failed: Content mismatch');
    context.error('  Expected length:', content.length, 'chars');
    context.error('  Downloaded length:', downloadedContent.length, 'chars');
    context.error('  Expected:', content.substring(0, 100));
    context.error('  Downloaded:', downloadedContent.substring(0, 100));
    throw new Error('Blob upload verification failed: Content mismatch');
  }

  context.log('[SCROLL-PUT] Verification PASSED');

  // 성공 응답
  context.log('[SCROLL-PUT] Sending 200 response');
  return {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    jsonBody: {
      success: true,
      timestamp: timestamp,
      verified: true  // 검증 완료 플래그
    }
  };

} catch (uploadError) {
  context.error('[SCROLL-PUT] Upload or verification failed:', uploadError);
  return {
    status: 500,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    jsonBody: {
      error: 'Failed to save or verify scroll position',
      message: uploadError.message,
      stack: uploadError.stack  // 디버깅용
    }
  };
}
```

---

#### CASE 3: 요청 페이로드 데이터 타입 문제

**증상**:
- savedIndex가 문자열로 전송됨
- typeof 검사를 통과하지 못해야 하지만 통과함

**수정 파일**: `src/functions/scroll-position.js`

```javascript
// Line 95-110 수정
try {
  const body = await request.json();

  context.log('[SCROLL-PUT] Raw body:', body);
  context.log('[SCROLL-PUT] Body types:', {
    savedNoteName: typeof body.savedNoteName,
    savedIndex: typeof body.savedIndex,
    deviceId: typeof body.deviceId
  });

  // 명시적 타입 변환 및 검증
  const savedNoteName = String(body.savedNoteName || '').trim();
  const rawIndex = body.savedIndex;
  const deviceId = String(body.deviceId || 'unknown').trim();

  // savedIndex를 숫자로 변환
  let savedIndex;
  if (typeof rawIndex === 'number') {
    savedIndex = rawIndex;
  } else if (typeof rawIndex === 'string') {
    savedIndex = parseInt(rawIndex, 10);
    context.log('[SCROLL-PUT] Converted savedIndex from string to number:', rawIndex, '→', savedIndex);
  } else {
    savedIndex = -1;
    context.warn('[SCROLL-PUT] Invalid savedIndex type, defaulting to -1');
  }

  // NaN 검사
  if (isNaN(savedIndex) || savedIndex < -1) {
    context.warn('[SCROLL-PUT] Invalid savedIndex after conversion:', savedIndex);
    return {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      jsonBody: {
        error: 'Invalid savedIndex',
        message: 'savedIndex must be a number >= -1',
        received: body.savedIndex,
        receivedType: typeof body.savedIndex,
        converted: savedIndex
      }
    };
  }

  context.log('[SCROLL-PUT] Parsed and validated:', {
    savedNoteName,
    savedIndex,
    deviceId
  });

} catch (jsonError) {
  context.error('[SCROLL-PUT] JSON parsing failed:', jsonError);
  return {
    status: 400,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    jsonBody: {
      error: 'Invalid JSON body',
      message: jsonError.message
    }
  };
}
```

---

#### CASE 4: 클라이언트 측 저장 검증 추가

**증상**:
- 클라이언트가 200을 받아 성공으로 간주하지만 실제 저장 안 됨
- 사용자에게 피드백 없음

**수정 파일**: `templates/v5-keychain/tts-reader-v5-keychain.md`

```javascript
// 저장 함수에 검증 로직 추가
async function saveScrollPositionWithVerification(savedNoteName, savedIndex) {
  const deviceId = getDeviceId();
  const payload = {
    savedNoteName,
    savedIndex,
    deviceId,
    timestamp: Date.now()
  };

  console.log('[SCROLL-SAVE] Saving position:', payload);

  try {
    // 1. 저장 요청
    const saveResponse = await fetch(scrollPositionEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[SCROLL-SAVE] Save failed:', saveResponse.status, errorData);
      throw new Error(`Save failed: ${saveResponse.status} - ${errorData.error || errorData.message}`);
    }

    const saveResult = await saveResponse.json();
    console.log('[SCROLL-SAVE] Save response:', saveResult);

    // 2. 즉시 검증 요청
    console.log('[SCROLL-SAVE] Verifying save...');
    const verifyResponse = await fetch(scrollPositionEndpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!verifyResponse.ok) {
      console.warn('[SCROLL-SAVE] Verification request failed, assuming save succeeded');
      return saveResult;
    }

    const verifyData = await verifyResponse.json();
    console.log('[SCROLL-SAVE] Verification data:', verifyData);

    // 3. 데이터 일치 검증
    const isMatch = (
      verifyData.savedNoteName === savedNoteName &&
      verifyData.savedIndex === savedIndex &&
      Math.abs(verifyData.timestamp - payload.timestamp) < 10000 // 10초 이내
    );

    if (!isMatch) {
      console.error('[SCROLL-SAVE] ✗ Verification FAILED!');
      console.error('  Expected:', payload);
      console.error('  Received:', verifyData);

      // 사용자에게 알림
      alert('⚠️ 스크롤 위치 저장 검증 실패\n\n' +
            `보낸 데이터: ${savedNoteName} #${savedIndex}\n` +
            `저장된 데이터: ${verifyData.savedNoteName} #${verifyData.savedIndex}\n\n` +
            '다시 시도하거나 관리자에게 문의하세요.');

      throw new Error('Save verification failed: Data mismatch');
    }

    console.log('[SCROLL-SAVE] ✓ Verification PASSED');

    // 4. UI 피드백 (성공 토스트)
    showSaveSuccessToast();

    return saveResult;

  } catch (error) {
    console.error('[SCROLL-SAVE] Save or verification failed:', error);
    throw error;
  }
}

// 저장 성공 토스트 메시지
function showSaveSuccessToast() {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = '✓ 스크롤 위치 저장됨';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// CSS 애니메이션 추가 (최초 1회)
if (!document.getElementById('scroll-save-toast-style')) {
  const style = document.createElement('style');
  style.id = 'scroll-save-toast-style';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
```

---

## 검증 단계

### 테스트 시나리오

#### 시나리오 1: PC 기본 테스트
1. Obsidian Desktop에서 출제예상 노트 열기
2. 스크롤을 중간 위치로 이동
3. "저장" 버튼 클릭
4. DevTools Console에서 로그 확인:
   - `[CLIENT-SCROLL]` 로그 확인
   - `[SCROLL-PUT]` 백엔드 로그 확인 (Azure Portal)
5. Blob Storage에서 파일 확인 (Azure Storage Explorer)
6. 예상: 파일이 최신 데이터로 업데이트됨

#### 시나리오 2: iPad 비교 테스트
1. 동일한 노트를 iPad에서 열기
2. 스크롤을 다른 위치로 이동
3. "저장" 버튼 클릭
4. PC와 동일한 검증 수행
5. 예상: PC와 iPad 동일한 동작

#### 시나리오 3: 연속 저장 테스트
1. PC에서 3번 연속 저장 (다른 위치)
2. 매번 Blob 내용 확인
3. 예상: 마지막 저장 내용이 반영됨

#### 시나리오 4: 교차 저장 테스트
1. PC에서 저장
2. iPad에서 저장
3. PC에서 다시 저장
4. Blob 내용 확인
5. 예상: 마지막 PC 저장이 반영됨

#### 시나리오 5: 에러 처리 테스트
1. 잘못된 데이터 전송 (savedIndex를 문자열로)
2. 예상: 400 에러 반환
3. 네트워크 연결 끊기 상태에서 저장
4. 예상: 적절한 에러 메시지 표시

---

## 기술적 접근 방식

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    클라이언트 (PC/iPad)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  저장 버튼 클릭                                        │  │
│  │    ↓                                                   │  │
│  │  saveScrollPositionWithVerification()                 │  │
│  │    - 로깅 (요청 전)                                    │  │
│  │    - fetch(PUT) 요청                                  │  │
│  │    - 로깅 (응답 후)                                    │  │
│  │    - fetch(GET) 검증                                  │  │
│  │    - 데이터 일치 검증                                   │  │
│  │    - UI 피드백                                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓ HTTP PUT
┌─────────────────────────────────────────────────────────────┐
│                  Azure Functions (scroll-position)          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. CORS preflight 확인                               │  │
│  │  2. request.json() 파싱                               │  │
│  │  3. 데이터 타입 변환 및 검증                            │  │
│  │  4. 로깅 (요청 데이터)                                  │  │
│  │  5. blobClient.upload()                               │  │
│  │  6. 로깅 (업로드 결과)                                  │  │
│  │  7. 다운로드 검증 (read-back verify)                   │  │
│  │  8. 로깅 (검증 결과)                                   │  │
│  │  9. HTTP 200 + {success, verified} 반환               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓ Upload
┌─────────────────────────────────────────────────────────────┐
│              Azure Blob Storage                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  scroll-position 컨테이너                             │  │
│  │    └── scroll-position.json Blob                      │  │
│  │        {                                             │  │
│  │          savedNoteName: "...",                        │  │
│  │          savedIndex: 42,                              │  │
│  │          timestamp: 1738234567890,                    │  │
│  │          deviceId: "..."                              │  │
│  │        }                                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 로그 플로우

**정상 흐름**:
```
[CLIENT-SCROLL] Save button clicked
[CLIENT-SCROLL] Payload: {savedNoteName: "...", savedIndex: 42, deviceId: "..."}
[CLIENT-SCROLL] Sending PUT request...
  ↓
[SCROLL-PUT] Request received at: 2026-02-05T...
[SCROLL-PUT] Origin: app://obsidian.md
[SCROLL-PUT] Body parsed: savedNoteName="...", savedIndex=42 (number), deviceId="..."
[SCROLL-PUT] Validation passed
[SCROLL-PUT] Starting blob upload...
[SCROLL-PUT] Upload succeeded - ETag: "0x8..."
[SCROLL-PUT] Verifying uploaded content...
[SCROLL-PUT] Verification PASSED
[SCROLL-PUT] Sending 200 response
  ↓
[CLIENT-SCROLL] Response received - Status: 200
[CLIENT-SCROLL] Response body: {success: true, timestamp: ..., verified: true}
[CLIENT-SCROLL] Verifying save...
[CLIENT-SCROLL] Verification result: {savedNoteName: "...", savedIndex: 42, ...}
[CLIENT-SCROLL] ✓ Verification PASSED
```

**비정상 흐름 (버그 발생)**:
```
[CLIENT-SCROLL] Save button clicked
[CLIENT-SCROLL] Sending PUT request...
  ↓ (요청이 백엔드에 도착 안 함 또는 처리됨)
[CLIENT-SCROLL] Response received - Status: 200
[CLIENT-SCROLL] Response body: {success: true, timestamp: ...}
[CLIENT-SCROLL] Verifying save...
[CLIENT-SCROLL] Verification result: {savedNoteName: "", savedIndex: -1, ...} ← 기본값!
[CLIENT-SCROLL] ✗ Verification FAILED!
```

---

## 위험 관리

### 잠재적 위험

#### 위험 1: Azure Functions 로깅 비용
- **위험**: 상세 로그로 인한 Storage/모니터링 비용 증가
- **완화**: 로그 레벨 조정, 개발 환경에서만 상세 로그

#### 위험 2: 검증 로직으로 인한 지연
- **위험**: read-back verify로 인한 응답 시간 증가
- **완화**: 비동기 검증 또는 선택적 검증 (production에서는 생략 가능)

#### 위험 3: 클라이언트 호환성
- **위해**: 검증 로직이 구형 Obsidian 버전에서 실패
- **완화**: 기능 감지(feature detection), try-catch로 우아한 degradation

#### 위험 4: CORS 헤더 오버헤드
- **위험**: 추가된 CORS 로직으로 인한 지연
- **완화**: Origin 캐싱, 사전 계산된 허용 목록

### 롤백 계획

**롤백 트리거**:
1. PC와 iPad 모두에서 저장 실패
2. 응답 시간이 5초 이상 증가
3. Azure Functions 오류율 10% 이상 증가

**롤백 절차**:
1. Git revert로 수정 사항 되돌리기
2. Azure Functions에 이전 버전 재배포
3. 핫픽스 후보로 등록
4. 영향 분석 및 재시작

---

## 다음 단계

### 즉시 실행 (우선순위: 최상)
1. PC에서 버그 재현 시도
2. Azure Functions 로그 스트림 확인
3. Blob Storage 상태 확인

### 단기 실행 (1-2일)
1. 디버깅 로그 추가
2. 로그 수집 및 분석
3. 근본 원인 확인

### 중기 실행 (1주)
1. 수정 방안 구현
2. PC/iPad 테스트
3. 문서 업데이트
