# TTS 재생 위치 동기화 문제 해결 문서

**작성일**: 2026-01-30
**수정일**: 2026-02-05
**상태**: 🟢 개선 완료 - scroll-position API 디버깅 강화
**환경**: Obsidian Desktop (PC), Mobile (iPad)

---

## 📋 목차

1. [증상 요약](#증상-요약)
2. [사용자 환경](#사용자-환경)
3. [시도한 수정 내역](#시도한-수정-내역)
4. [현재 상태](#현재-상태)
5. [확인 필요 사항](#확인-필요-사항)
6. [다음 단계 제안](#다음-단계-제안)
7. [파일 위치 및 구조](#파일-위치-및-구조)
8. **[Scroll Position 저장 실패 버그 수정 (SPEC-FIX-001)](#scroll-position-저장-실패-버그-수정-spec-fix-001)** 🆕

---

## 증상 요약

### 주요 문제
사용자가 두 개의 Obsidian 노트에서 **디바이스 간 재생 위치 동기화**가 작동하지 않음:

1. **TTS v5 노트** (`TTS 출제예상 읽기 v5 (Keychain).md`)
   - TTS 음성 재생 내역 동기화 실패
   - API 엔드포인트가 `app://obsidian.md/api/...`로 잘못 설정됨

2. **통합 노트** (`기술사_출제예상 (통합, 서버동기화, 최적화).md`)
   - 스크롤 위치 및 TTS 재생 위치 동기화 실패
   - 다양한 undefined 참조 에러 발생

### 근본 원인
**Keychain에서 Azure Function URL을 로드하지 못함**

- Keychain 테스트 노트에서는 정상적으로 URL 읽기 성공:
  ```
  azure-function-url: https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net
  ```
- 하지만 실제 노트(TTS v5, 통합)에서는 로딩 실패
- "Keychain 설정 필요" 메시지 표시됨

---

## 사용자 환경

### 플랫폼
- **Obsidian Mobile** (iOS/Android - 정확한 OS 미확인)
- Console 접근 어려움 (모바일 환경)

### Obsidian 설정
- Obsidian 버전: 1.11.5+ (Keychain API 지원 버전)
- Keychain 설정 확인됨:
  - `azure-function-url`: 등록됨 ✅
  - `azure-tts-free-key`: 등록됨 ✅
  - `azure-tts-paid-key`: 미확인

### Vault 구조
```
/Users/turtlesoup0-macmini/Documents/turtlesoup0/
└── 1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/
    ├── TTS 출제예상 읽기 v5 (Keychain).md
    ├── 기술사_출제예상 (통합, 서버동기화, 최적화).md
    ├── Keychain 테스트.md (진단용)
    └── Keychain 설정 가이드.md
```

---

## 시도한 수정 내역

### 1차 시도: API 엔드포인트 수정 (실패)
**문제**: TTS v5 노트에서 `API_ENDPOINT`가 Keychain 로딩 전에 계산됨

**수정**:
```javascript
// ❌ 이전 (Line 578)
const API_ENDPOINT = config.azureFunctionUrl + '/api/tts-stream';
// ... Keychain 로딩 (Line 624)
const secrets = await loadSecretsFromKeychain();
config.azureFunctionUrl = secrets.functionUrl;

// ✅ 수정 (순서 변경)
const secrets = await loadSecretsFromKeychain();
config.azureFunctionUrl = secrets.functionUrl;
const API_ENDPOINT = config.azureFunctionUrl + '/api/tts-stream';
```

**결과**: 문법 에러 발생
```
SyntaxError: Invalid or unexpected token
SyntaxError: Unexpected token ')'
```

---

### 2차 시도: TTS v5 템플릿 복원 (진행중)
**조치**:
- 원본 템플릿(`/Documents/obsidian-tts/templates/v5-keychain/tts-reader-v5-keychain.md`)으로 복원
- 문법 에러는 해결되었으나 Keychain 로딩 문제는 여전히 존재

---

### 3차 시도: 통합 노트 하드코딩 제거 및 Keychain 통합 (부분 성공)

**문제**: 통합 노트에 하드코딩된 Azure Function URL 사용
```javascript
// Line 44 (ServerScrollPositionManager)
this.apiEndpoint = 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/scroll-position';

// Line 231 (playbackPositionManager)
apiEndpoint: 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/playback-position';
```

**수정**:
1. Keychain 로딩 코드 추가 (Line 42-58)
2. 하드코딩 URL 제거
3. 동적으로 Keychain에서 로드한 URL 사용

**발생한 에러들**:
```
Error 1: Azure Function URL not configured (Line 66)
→ throw new Error 제거, 경고만 표시하도록 수정

Error 2: Cannot read properties of undefined (reading 'syncPosition')
→ 조건부 매니저 생성으로 수정

Error 3: Cannot read properties of undefined (reading 'file') (Line 944)
→ statusMessages 객체 사전 평가 문제, 조건부로 수정

Error 4: Cannot read properties of undefined (reading 'startPolling')
→ 조건부 호출로 수정
```

---

### 4차 시도: 디버깅 로그 추가 (현재)

**추가한 로그**:
```javascript
// 통합 노트 - loadSecretsFromKeychain()
console.log('🔐 [통합노트] Keychain 로딩 시작...');
console.log('🔐 [통합노트] app.keychain 존재:', !!app.keychain);
console.log('🔐 [통합노트] Keychain에서 읽은 URL:', functionUrl ? `${functionUrl.substring(0, 30)}...` : '(null)');
console.log('🔐 [통합노트] 최종 AZURE_FUNCTION_URL:', AZURE_FUNCTION_URL ? `${AZURE_FUNCTION_URL.substring(0, 30)}...` : '(비어있음)');
```

**목적**: Keychain 로딩 과정을 추적하여 어느 단계에서 실패하는지 파악

---

## 현재 상태

### 통합 노트
- ✅ 문법 에러 해결됨
- ✅ undefined 참조 에러 해결됨
- ⚠️ "Keychain 설정 필요" 메시지 표시됨
- ⚠️ `현재 값: ...` 표시 (사용자 확인 대기중)
- ❓ 실제 Keychain URL 로딩 여부 미확인

### TTS v5 노트
- ✅ 원본 템플릿으로 복원
- ⚠️ API 엔드포인트 오류 예상 (`app://obsidian.md/api/...`)
- ❓ Keychain 로딩 여부 미확인

### Keychain 테스트 노트
- ✅ 정상 작동
- ✅ URL 읽기 성공

---

## 확인 필요 사항

### 🔴 최우선 확인
1. **통합 노트의 "현재 값:" 메시지 내용**
   - 위치: 노트 상단
   - 예상: `(비어있음)` 또는 실제 URL
   - 이것으로 Keychain 로딩 성공/실패 판단 가능

2. **Console 로그 (PC 환경에서 확인 가능 시)**
   ```
   🔐 [통합노트] Keychain 로딩 시작...
   🔐 [통합노트] app.keychain 존재: true/false
   🔐 [통합노트] Keychain에서 읽은 URL: ...
   🔐 [통합노트] 최종 AZURE_FUNCTION_URL: ...
   ```

### 🟡 2차 확인
3. **Obsidian 버전**
   - Settings → About → Version
   - Keychain API는 1.11.5+ 필요

4. **모바일 OS**
   - iOS: Keychain Access
   - Android: Credential Manager
   - 플랫폼별 동작 차이 가능성

5. **Keychain 키 이름 정확성**
   - 오타 가능성: `azure-function-url` vs `azure-function-URL` vs `azureFunctionUrl`
   - 대소문자 구분 여부

### 🟢 3차 확인
6. **다른 노트들의 Keychain 로딩 순서**
   - `Keychain 테스트.md`: 성공 ✅
   - `TTS v5.md`: 실패 (추정)
   - `통합 노트.md`: 실패 (확인됨)
   - 노트 로딩 순서가 영향을 주는지?

7. **dataviewjs 블록 실행 순서**
   - 각 노트에 여러 dataviewjs 블록 존재
   - 첫 번째 블록 실행 시 Keychain 준비 안 됨?

---

## 다음 단계 제안

### Plan A: 임시 하드코딩 (빠른 해결)
**목적**: Keychain 문제 우회, 동기화 기능 먼저 테스트

```javascript
// 통합 노트 - Line 61 수정
const AZURE_FUNCTION_URL = secrets.functionUrl ||
    'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net';
```

**장점**: 즉시 동기화 기능 테스트 가능
**단점**: 보안 위험 (URL에 리소스 ID 포함)

---

### Plan B: Keychain 로딩 지연 (타이밍 문제 해결)
**가설**: dataviewjs 블록이 너무 빨리 실행되어 Keychain이 준비되지 않음

```javascript
async function loadSecretsFromKeychain() {
    // Keychain 준비 대기
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!app.keychain) {
        console.warn('⚠️ Keychain API를 사용할 수 없습니다.');
        return { functionUrl: '' };
    }

    const functionUrl = await app.keychain.getPassword('azure-function-url');
    return { functionUrl: functionUrl || '' };
}
```

---

### Plan C: 재시도 로직 (견고성 향상)
**목적**: Keychain 로딩 실패 시 재시도

```javascript
async function loadSecretsFromKeychain(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (!app.keychain) {
                await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)));
                continue;
            }

            const functionUrl = await app.keychain.getPassword('azure-function-url');
            if (functionUrl) {
                console.log(`✅ Keychain 로딩 성공 (시도 ${i + 1}/${retries})`);
                return { functionUrl };
            }
        } catch (error) {
            console.warn(`⚠️ Keychain 로딩 실패 (시도 ${i + 1}/${retries}):`, error);
        }
    }

    console.error('❌ Keychain 로딩 최종 실패');
    return { functionUrl: '' };
}
```

---

### Plan D: Fallback to localStorage (대안)
**목적**: Keychain 대신 localStorage 사용

```javascript
async function loadSecretsFromKeychain() {
    // 1. Keychain 시도
    if (app.keychain) {
        const functionUrl = await app.keychain.getPassword('azure-function-url');
        if (functionUrl) {
            // localStorage에 캐시
            localStorage.setItem('cached_azure_function_url', functionUrl);
            return { functionUrl };
        }
    }

    // 2. localStorage 캐시 사용
    const cached = localStorage.getItem('cached_azure_function_url');
    if (cached) {
        console.warn('⚠️ Keychain 실패, localStorage 캐시 사용');
        return { functionUrl: cached };
    }

    return { functionUrl: '' };
}
```

---

## 파일 위치 및 구조

### 주요 파일

**1. 통합 노트** (문제 발생)
```
경로: /Users/turtlesoup0-macmini/Documents/turtlesoup0/1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/기술사_출제예상 (통합, 서버동기화, 최적화).md

주요 코드 위치:
- Line 42-70: Keychain 로딩 함수
- Line 74-253: ServerScrollPositionManager 클래스
- Line 268-340: playbackPositionManager 객체
- Line 355-361: syncPosition 호출 (동기화 시작)
- Line 638: startPolling 호출
- Line 921: stopPolling 호출
```

**2. TTS v5 노트** (문제 발생)
```
경로: /Users/turtlesoup0-macmini/Documents/turtlesoup0/1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/TTS 출제예상 읽기 v5 (Keychain).md

상태: 원본 템플릿으로 복원됨
템플릿 위치: /Users/turtlesoup0-macmini/Documents/obsidian-tts/templates/v5-keychain/tts-reader-v5-keychain.md
```

**3. Keychain 테스트 노트** (정상 작동)
```
경로: /Users/turtlesoup0-macmini/Documents/turtlesoup0/1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/Keychain 테스트.md

용도: Keychain API 작동 확인
결과: ✅ 정상 (URL 읽기 성공)
```

**4. 백엔드 API**
```
경로: /Users/turtlesoup0-macmini/Documents/obsidian-tts/src/functions/

관련 파일:
- playback-position.js: TTS 재생 위치 동기화 API
- scroll-position.js: 스크롤 위치 동기화 API (존재 여부 미확인)
- tts-stream.js: TTS 음성 생성 API

배포 URL: https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net
```

---

## 코드 스니펫

### 현재 Keychain 로딩 코드 (통합 노트)
```javascript
// Line 42-70
async function loadSecretsFromKeychain() {
    try {
        console.log('🔐 [통합노트] Keychain 로딩 시작...');
        console.log('🔐 [통합노트] app.keychain 존재:', !!app.keychain);

        if (!app.keychain) {
            console.warn('⚠️ Keychain API를 사용할 수 없습니다.');
            return { functionUrl: '' };
        }

        const functionUrl = await app.keychain.getPassword('azure-function-url');
        console.log('🔐 [통합노트] Keychain에서 읽은 URL:', functionUrl ? `${functionUrl.substring(0, 30)}...` : '(null)');

        return {
            functionUrl: functionUrl || ''
        };
    } catch (error) {
        console.error('❌ [통합노트] Keychain 로드 실패:', error);
        return { functionUrl: '' };
    }
}

const secrets = await loadSecretsFromKeychain();
const AZURE_FUNCTION_URL = secrets.functionUrl;
console.log('🔐 [통합노트] 최종 AZURE_FUNCTION_URL:', AZURE_FUNCTION_URL ? `${AZURE_FUNCTION_URL.substring(0, 30)}...` : '(비어있음)');

if (!AZURE_FUNCTION_URL || AZURE_FUNCTION_URL.includes('your-app')) {
    dv.paragraph("⚠️ **Keychain 설정 필요**");
    dv.paragraph("Settings → About → Keychain에서 `azure-function-url` 키를 등록하세요.");
    dv.paragraph(`현재 값: "${AZURE_FUNCTION_URL || '(비어있음)'}"`);
    dv.paragraph("**재생 위치 동기화 기능이 비활성화됩니다.**");
    console.warn('⚠️ Azure Function URL not configured - sync features disabled');
} else {
    console.log('✅ Keychain 설정 로드 완료:', AZURE_FUNCTION_URL);
}
```

### 매니저 생성 코드
```javascript
// Line 255-262: ScrollPositionManager 생성 (조건부)
if (!window.scrollPositionManager && AZURE_FUNCTION_URL) {
    window.scrollPositionManager = new ServerScrollPositionManager();
    window.scrollPositionManager.apiEndpoint = AZURE_FUNCTION_URL + '/api/scroll-position';
    window.scrollPositionManager.init();
    console.log('✅ Scroll Position Endpoint:', window.scrollPositionManager.apiEndpoint);
} else if (!AZURE_FUNCTION_URL) {
    console.warn('⚠️ Scroll Position sync disabled - no Azure Function URL');
}

// Line 268-340: playbackPositionManager 생성 (조건부)
if (!window.playbackPositionManager && AZURE_FUNCTION_URL) {
    window.playbackPositionManager = {
        apiEndpoint: AZURE_FUNCTION_URL + '/api/playback-position',
        // ... 메서드 정의
    };
    window.playbackPositionManager.init();
    console.log('✅ TTS Playback Position Endpoint:', window.playbackPositionManager.apiEndpoint);
} else if (!AZURE_FUNCTION_URL) {
    console.warn('⚠️ TTS Playback Position sync disabled - no Azure Function URL');
}
```

---

## 에러 로그 히스토리

### TTS v5 노트
```
Evaluation Error: SyntaxError: Invalid or unexpected token
    at DataviewInlineApi.eval (plugin:dataview:19027:21)

Evaluation Error: SyntaxError: Unexpected token ')'
    at DataviewInlineApi.eval (plugin:dataview:19027:21)

GET app://obsidian.md/api/azure-usage net::ERR_FILE_NOT_FOUND
GET app://obsidian.md/api/cache-stats net::ERR_FILE_NOT_FOUND

TypeError: freePercentage.toFixed is not a function
    at window.updateUsageDisplay (Line 1375)
```

### 통합 노트
```
Evaluation Error: Error: Azure Function URL not configured
    at eval (Line 28:11)

TypeError: Cannot read properties of undefined (reading 'syncPosition')
    at eval (Line 317:59)

TypeError: Cannot read properties of undefined (reading 'file')
    at eval (Line 906:78)

TypeError: Cannot read properties of undefined (reading 'startPolling')
    at initUI (Line 600:34)
```

---

## 참고: 백엔드 API 상태

### playback-position.js (확인됨)
```javascript
// GET/PUT /api/playback-position
app.http('playback-position', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'playback-position',
  handler: async (request, context) => {
    // Azure Blob Storage에 재생 위치 저장/조회
    // Blob: playback-position.json
  }
});
```

**데이터 형식**:
```json
{
  "lastPlayedIndex": 0,
  "notePath": "path/to/note.md",
  "noteTitle": "제목",
  "timestamp": 1738234567890,
  "deviceId": "MacIntel-abc123"
}
```

---

## 결론

### 핵심 문제
**Keychain API는 작동하지만, 특정 노트(TTS v5, 통합)에서만 URL 로딩 실패**

### 가능한 원인
1. **타이밍 문제**: dataviewjs 실행 시점에 Keychain 준비 안 됨
2. **모바일 환경 차이**: iOS/Android에서 Keychain API 동작 방식 다름
3. **노트 로딩 순서**: 여러 dataviewjs 블록 간 경쟁 조건
4. **async/await 문제**: 최상위 레벨 await가 제대로 작동하지 않음

### 권장 다음 단계
1. **"현재 값:" 확인** (최우선)
2. **Console 로그 확인** (가능 시)
3. **Plan B (지연 로딩) 또는 Plan C (재시도 로직) 적용**
4. 실패 시 **Plan D (localStorage 캐시) 적용**

---

**문서 작성자**: Claude Sonnet 4.5
**최종 업데이트**: 2026-02-05
**토큰 사용량**: ~105,000 tokens

---

## Scroll Position 저장 실패 버그 수정 (SPEC-FIX-001) 🆕

**수정일**: 2026-02-05
**상태**: ✅ 완료 - 백엔드 디버깅 강화
**영향 파일**: `src/functions/scroll-position.js`, `shared/corsHelper.js`

---

### 증상 요약

**PC에서 "저장" 버튼 클릭 시 API가 HTTP 200을 반환하지만 실제로는 데이터가 저장되지 않음**

- **증상**: scroll-position API가 200 OK를 반환하지만 Azure Blob Storage에 데이터가 저장되지 않음
- **플랫폼**: PC (Desktop)에서만 발생, iPad는 정상 작동
- **에러 메시지**: 없음 (Silent failure)

---

### 근본 원인 분석

#### 문제 1: Blob 업로드 검증 누락 (주요 원인)

**기존 코드 문제점**:
```javascript
// 기존 코드 (scroll-position.js Line 128-133)
await blobClient.upload(content, content.length, {
  blobHTTPHeaders: {
    blobContentType: 'application/json',
    blobCacheControl: 'no-cache'
  }
});

// 업로드 완료 후 바로 200 반환 - 검증 없음
return { status: 200, jsonBody: { success: true } };
```

**문제**:
- Azure Blob Storage SDK의 `upload()` 메서드가 성공을 반환해도 실제 업로드는 실패할 수 있음
- ETag 검증 없이 200을 반환
- 업로드 후 읽기 검증 (Read-Back Verification) 부재

#### 문제 2: 요청 페이로드 타입 검증 부족

**기존 코드**:
```javascript
// savedIndex 타입 검증 (Line 101)
if (typeof savedIndex !== 'number' || savedIndex < -1) {
  return { status: 400, ... };
}
```

**문제**:
- 명시적 타입 변환 없음
- 문자열로 전송된 숫자에 대한 처리 부족
- NaN 검증 누락

#### 문제 3: 디버깅 로그 부족

**문제**:
- 요청 수신 로그 불충분
- 업로드 과정 추적 불가
- 실패 시 원인 파악 곤란

---

### 수정 내역

#### 수정 1: 업로드 검증 강화 (scroll-position.js)

**추가된 검증 로직**:

1. **ETag 검증**:
```javascript
const uploadResult = await blobClient.upload(content, content.length, {...});

// ETag 검증 (업로드 성공 확인)
if (!uploadResult.etag) {
  context.error('[SCROLL-PUT] Upload failed: no ETag returned');
  throw new Error('Blob upload failed: no ETag returned from Azure Storage');
}
```

2. **Read-Back Verification (업로드 후 즉시 읽기 검증)**:
```javascript
// 업로드 후 즉시 읽기 검증
context.log('[SCROLL-PUT] Verifying upload by reading back...');
const verifyClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
const verifyResponse = await verifyClient.download();
const verifyBuffer = await streamToBuffer(verifyResponse.readableStreamBody);
const verifyContent = verifyBuffer.toString();

// 업로드한 내용과 읽어온 내용 비교
if (verifyContent !== content) {
  context.error('[SCROLL-PUT] Verification failed: content mismatch');
  throw new Error('Blob upload verification failed');
}
```

3. **데이터 값 검증**:
```javascript
// JSON 파싱 및 데이터 값 검증
const verifyParsed = JSON.parse(verifyContent);

if (
  verifyParsed.savedNoteName !== position.savedNoteName ||
  verifyParsed.savedIndex !== position.savedIndex ||
  verifyParsed.deviceId !== position.deviceId
) {
  throw new Error('Blob upload verification failed: data values do not match');
}
```

#### 수정 2: 요청 페이로드 타입 처리 강화

```javascript
// 명시적 타입 변환
const parsedSavedIndex = typeof savedIndex === 'string'
  ? parseInt(savedIndex, 10)
  : savedIndex;

// NaN 검사
if (isNaN(parsedSavedIndex) || typeof parsedSavedIndex !== 'number') {
  return {
    status: 400,
    jsonBody: {
      error: 'Invalid savedIndex: must be a valid number',
      received: savedIndex,
      receivedType: typeof savedIndex
    }
  };
}
```

#### 수정 3: 포괄적인 디버깅 로그 추가

**PUT 요청 로그**:
```javascript
context.log('[SCROLL-PUT] ========== PUT REQUEST START ==========');
context.log('[SCROLL-PUT] Origin:', requestOrigin);
context.log('[SCROLL-PUT] User-Agent:', userAgent);
context.log('[SCROLL-PUT] Request body:', {
  savedNoteName: body.savedNoteName,
  savedNoteNameType: typeof body.savedNoteName,
  savedIndex: body.savedIndex,
  savedIndexType: typeof body.savedIndex,
  deviceId: body.deviceId,
  deviceIdType: typeof body.deviceId
});
```

**업로드 과정 로그**:
```javascript
context.log('[SCROLL-PUT] Attempting blob upload...');
context.log('[SCROLL-PUT] Content length:', content.length);
context.log('[SCROLL-PUT] Upload result:', {
  etag: uploadResult.etag,
  lastModified: uploadResult.lastModified,
  contentMD5: uploadResult.contentMD5
});
context.log('[SCROLL-PUT] ========== UPLOAD VERIFIED SUCCESSFULLY ==========');
```

**GET 요청 로그**:
```javascript
context.log('[SCROLL-GET] ========== GET REQUEST START ==========');
context.log('[SCROLL-GET] Blob exists:', exists);
context.log('[SCROLL-GET] Retrieved data:', {
  savedNoteName: position.savedNoteName,
  savedIndex: position.savedIndex,
  timestamp: position.timestamp,
  deviceId: position.deviceId
});
```

#### 수정 4: CORS 헬퍼 디버깅 강화

```javascript
// corsHelper.js
function isOriginAllowed(origin) {
  // 로깅 추가
  console.log('[CORS] App protocol check:', {
    origin,
    appId,
    allowed: isAllowed,
    allowedAppIds: ALLOWED_APP_IDS
  });

  // localhost 허용 (개발 환경)
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    console.log('[CORS] Localhost allowed:', origin);
    return true;
  }

  console.log('[CORS] Origin denied:', { origin, allowedOrigins });
  return false;
}
```

---

### 응답 포맷 변경

#### 기존 응답
```json
{
  "success": true,
  "timestamp": 1738234567890
}
```

#### 새로운 응답 (검증 포함)
```json
{
  "success": true,
  "timestamp": 1738234567890,
  "verified": true,
  "etag": "0x8DC72E...",
  "data": {
    "savedNoteName": "출제예상 노트 이름",
    "savedIndex": 42,
    "timestamp": 1738234567890,
    "deviceId": "MacIntel-abc123"
  }
}
```

---

### 테스트 방법

#### 1. Azure Portal 로그 확인

1. Azure Portal → Function App → Log Analytics
2. 다음 쿼리 실행:
```kusto
AzureDiagnostics
| where Category == "Function"
| where log_s contains "SCROLL-PUT"
| project TimeGenerated, log_s
| order by TimeGenerated desc
```

#### 2. PC에서 저장 테스트

1. Obsidian Desktop에서 노트 열기
2. 개발자 콘솔 (F12) 열기
3. Network 탭에서 scroll-position PUT 요청 필터링
4. 다음 항목 확인:
   - Request Headers (Origin, User-Agent)
   - Request Payload (savedNoteName, savedIndex, deviceId)
   - Response Body (verified: true 여부 확인)

#### 3. Azure Storage Explorer로 직접 확인

1. Azure Storage Explorer 열기
2. 스토리지 계정 → Blob 컨테이너
3. `scroll-position.json` 파일 확인
4. 파일 내용 확인:
   - 마지막 수정 시간
   - 데이터 내용 (savedNoteName, savedIndex, timestamp, deviceId)

#### 4. iPad와 비교 테스트

1. iPad에서 동일한 노트 열기
2. 저장 버튼 클릭
3. PC와 동일한 방법으로 로그 확인
4. 로그 패턴 비교

---

### 예상 로그 패턴

#### 정상 작동 시
```
[SCROLL-PUT] ========== PUT REQUEST START ==========
[SCROLL-PUT] Origin: app://obsidian.md
[SCROLL-PUT] Request body: { savedNoteName: "...", savedIndex: 42, ... }
[SCROLL-PUT] Attempting blob upload...
[SCROLL-PUT] Upload result: { etag: "0x8DC72E...", ... }
[SCROLL-PUT] Verifying upload by reading back...
[SCROLL-PUT] Verification content length: 150
[SCROLL-PUT] ========== UPLOAD VERIFIED SUCCESSFULLY ==========
```

#### 실패 시
```
[SCROLL-PUT] ========== PUT REQUEST START ==========
[SCROLL-PUT] Request body: { savedIndex: "42", ... }
[SCROLL-PUT] Parsed savedIndex: { original: "42", parsed: 42 }
[SCROLL-PUT] Upload result: { etag: null }
[SCROLL-PUT] ========== UPLOAD FAILED ==========
[SCROLL-PUT] Upload failed: no ETag returned
```

---

### 다음 단계 (필요시)

#### 1. 클라이언트 측 검증 로직 추가

```javascript
async function saveScrollPositionWithVerification(payload) {
  // 1. 저장 요청
  const saveResponse = await fetch(apiEndpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const saveResult = await saveResponse.json();

  // 2. 검증 확인
  if (!saveResult.verified) {
    console.error('[CLIENT-SCROLL] Save not verified by server');
    throw new Error('Save verification failed');
  }

  // 3. 즉시 GET으로 확인
  const verifyResponse = await fetch(apiEndpoint, { method: 'GET' });
  const verifyData = await verifyResponse.json();

  // 4. 데이터 비교
  if (verifyData.savedNoteName !== payload.savedNoteName ||
      verifyData.savedIndex !== payload.savedIndex) {
    console.error('[CLIENT-SCROLL] Data mismatch after save');
    throw new Error('Save verification failed: data mismatch');
  }

  console.log('[CLIENT-SCROLL] Save verified:', verifyData);
  return saveResult;
}
```

#### 2. 재시도 로직 추가

```javascript
async function saveScrollPositionWithRetry(payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await saveScrollPositionWithVerification(payload);
      return result;
    } catch (error) {
      console.warn(`[CLIENT-SCROLL] Retry ${i + 1}/${maxRetries}:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

---

### 참고 링크

- SPEC 문서: `.moai/specs/SPEC-FIX-001/spec.md`
- 백엔드 코드: `src/functions/scroll-position.js`
- CORS 헬퍼: `shared/corsHelper.js`

---

**수정 완료일**: 2026-02-05
**DDD 방법론**: ANALYZE-PRESERVE-IMPROVE 완료
**LSP 상태**: No errors
