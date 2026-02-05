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

# SPEC-FIX-001: 수용 기준

## 목차
1. [테스트 시나리오](#테스트-시나리오)
2. [품질 게이트](#품질-게이트)
3. [검증 방법](#검증-방법)
4. [완료 정의](#완료-정의)

---

## 테스트 시나리오

### 시나리오 1: PC에서 기본 저장 동작

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 출제예상 노트가 열려 있고
**AND** 스크롤 위치가 인덱스 42에 있고
**AND** Azure Function URL이 Keychain에 등록되어 있고
**AND** Azure Blob Storage `scroll-position` 컨테이너가 존재

**WHEN** 사용자가 "저장" 버튼을 클릭하면

**THEN** 시스템은 HTTP 200 응답을 반환하고
**AND** 응답 본문에 `{success: true, verified: true}`가 포함되어야 하고
**AND** Azure Blob Storage의 `scroll-position.json` 파일이 업데이트되어야 하고
**AND** 파일 내용에 `savedIndex: 42`가 포함되어야 하고
**AND** 클라이언트 DevTools Console에 `[CLIENT-SCROLL] ✓ Verification PASSED`가 로깅되어야 하고
**AND** 사용자에게 성공 토스트 메시지가 표시되어야 한다

**검증 방법**:
```javascript
// 1. DevTools Console 확인
console.log('[CLIENT-SCROLL] Save button clicked');
console.log('[CLIENT-SCROLL] ✓ Verification PASSED');

// 2. Azure Storage Explorer에서 Blob 확인
{
  "savedNoteName": "출제예상 노트",
  "savedIndex": 42,
  "timestamp": 1738234567890,
  "deviceId": "MacIntel-abc123"
}

// 3. 즉시 GET 요청으로 검증
fetch('/api/scroll-position')
  .then(r => r.json())
  .then(d => {
    assert(d.savedIndex === 42, 'savedIndex must be 42');
  });
```

---

### 시나리오 2: iPad에서 저장 동작 (비교 테스트)

**GIVEN** 사용자가 iPad Obsidian Mobile을 사용 중이고
**AND** 동일한 출제예상 노트가 열려 있고
**AND** 스크롤 위치가 인덱스 55에 있고
**AND** PC와 동일한 Azure Function URL이 설정되어 있고

**WHEN** 사용자가 "저장" 버튼을 클릭하면

**THEN** 시스템은 HTTP 200 응답을 반환하고
**AND** PC 시나리오 1과 동일한 응답 형식을 반환해야 하고
**AND** Blob Storage에 `savedIndex: 55`가 저장되어야 하고
**AND** iPad Safari Web Inspector에 성공 로그가 표시되어야 하고
**AND** PC와 iPad가 동일한 API를 사용하여 저장되어야 한다

**검증 방법**:
```javascript
// iPad Safari Web Inspector Console
console.log('[CLIENT-SCROLL] ✓ Verification PASSED');

// Blob Storage (PC 저장 후 iPad 저장)
// 마지막 저장이 반영되어야 함
{
  "savedNoteName": "출제예상 노트",
  "savedIndex": 55,  // iPad 저장값
  "timestamp": [최신값],
  "deviceId": "iPad-xyz789"
}
```

---

### 시나리오 3: 연속 저장 테스트

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 출제예상 노트가 열려 있고

**WHEN** 사용자가 다음 순서대로 저장을 3번 수행하면:
1. 인덱스 10에서 저장
2. 인덱스 20에서 저장
3. 인덱스 30에서 저장

**THEN** 시스템은 모든 저장 요청에 HTTP 200을 반환하고
**AND** Blob Storage의 `scroll-position.json`에는 마지막 저장값만 존재해야 하고
**AND** 파일 내용은 `savedIndex: 30`이어야 하고
**AND** timestamp는 마지막 저장 시간이어야 하고
**AND** 모든 저장 요청에 대해 성공 토스트가 표시되어야 한다

**검증 방법**:
```javascript
// 각 저장 후 GET 요청으로 검증
// 저장 1: savedIndex = 10
// 저장 2: savedIndex = 20
// 저장 3: savedIndex = 30 (최종값)

// 최종 Blob 내용
{
  "savedNoteName": "출제예상 노트",
  "savedIndex": 30,  // 마지막 저장값
  "timestamp": [세 번째 저장 시간],
  "deviceId": "MacIntel-abc123"
}
```

---

### 시나리오 4: PC와 iPad 교차 저장 테스트

**GIVEN** PC와 iPad가 동일한 Azure Function URL을 사용하고
**AND** 두 디바이스가 동일한 노트를 열고 있고

**WHEN** 사용자가 다음 순서대로 저장하면:
1. PC에서 인덱스 100 저장
2. iPad에서 인덱스 200 저장
3. PC에서 인덱스 150 저장

**THEN** 시스템은 모든 요청에 HTTP 200을 반환하고
**AND** Blob Storage에는 마지막 저장값(PC, 인덱스 150)이 있어야 하고
**AND** PC와 iPad 모두에서 검증(GET) 요청 시 동일한 값을 반환해야 하고
**AND** 두 디바이스 모두 성공 토스트를 표시해야 한다

**검증 방법**:
```javascript
// PC에서 GET
fetch('/api/scroll-position')
  .then(r => r.json())
  .then(d => {
    assert(d.savedIndex === 150, 'Must be 150 (last saved by PC)');
  });

// iPad에서 GET
fetch('/api/scroll-position')
  .then(r => r.json())
  .then(d => {
    assert(d.savedIndex === 150, 'Must be 150 (last saved by PC)');
  });
```

---

### 시나리오 5: 잘못된 데이터 타입 처리

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 출제예상 노트가 열려 있고

**WHEN** 클라이언트가 잘못된 타입의 데이터를 전송하면:
```json
{
  "savedNoteName": "출제예상 노트",
  "savedIndex": "42",  // 문자열 instead of 숫자
  "deviceId": "MacIntel-abc123"
}
```

**THEN** 시스템은 HTTP 400 Bad Request를 반환하고
**AND** 응답 본문에 에러 메시지가 포함되어야 하고
**AND** Blob Storage는 업데이트되지 않아야 하고
**AND** 백엔드 로그에 타입 변환 로그가 기록되어야 한다

**검증 방법**:
```javascript
// 잘못된 요청
fetch('/api/scroll-position', {
  method: 'PUT',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    savedNoteName: "출제예상 노트",
    savedIndex: "42",  // 문자열
    deviceId: "MacIntel-abc123"
  })
})
  .then(r => {
    assert(r.status === 400, 'Must return 400');
    return r.json();
  })
  .then(d => {
    assert(d.error === 'Invalid savedIndex', 'Must have error message');
    assert(d.receivedType === 'string', 'Must log received type');
    assert(d.converted === 42, 'Must show converted value');
  });
```

---

### 시나리오 6: CORS Origin 검증

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** Origin 헤더가 `app://obsidian.md`이고
**AND** ALLOWED_ORIGINS 환경변수에 `app://obsidian.md`가 포함되어 있고

**WHEN** 사용자가 "저장" 버튼을 클릭하면

**THEN** 시스템은 CORS preflight를 성공적으로 처리하고
**AND** PUT 요청이 정상적으로 처리되어야 하고
**AND** 응답 헤더에 `Access-Control-Allow-Origin: app://obsidian.md`가 포함되어야 하고
**AND** Blob Storage가 업데이트되어야 한다

**검증 방법**:
```javascript
// DevTools Network 탭 확인
// Request Headers:
// Origin: app://obsidian.md

// Response Headers:
// Access-Control-Allow-Origin: app://obsidian.md
// Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
// Access-Control-Allow-Headers: Content-Type, Authorization
```

---

### 시나리오 7: 네트워크 에러 처리

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 네트워크 연결이 끊겨 있거나 Azure Function이 응답하지 않고

**WHEN** 사용자가 "저장" 버튼을 클릭하면

**THEN** 클라이언트는 fetch 에러를 catch하고
**AND** 사용자에게 에러 메시지가 표시되어야 하고
**AND** Console에 에러 로그가 기록되어야 하고
**AND** 오프라인 큐에 요청이 추가되어야 한다 (오프라인 큐 기능이 있는 경우)

**검증 방법**:
```javascript
// 네트워크 차단 상태에서 저장
saveScrollPosition()
  .catch(error => {
    assert(error.message.includes('Failed to fetch'), 'Must have fetch error');
    // UI에 에러 표시
    // 오프라인 큐에 추가 (구현된 경우)
  });
```

---

### 시나리오 8: 저장 검증 실패 (버그 재현)

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 백엔드가 200을 반환하지만 실제로는 저장하지 않는 상태 (버그 상황)

**WHEN** 사용자가 "저장" 버튼을 클릭하고
**AND** 클라이언트가 검증(GET) 요청을 보내면

**THEN** 검증이 실패했다는 에러가 표시되어야 하고
**AND** 사용자에게 명확한 에러 메시지가 alert로 표시되어야 하고
**AND** Console에 `[CLIENT-SCROLL] ✗ Verification FAILED!`가 로깅되어야 한다

**검증 방법**:
```javascript
// 백엔드가 200을 반환하지만 Blob이 업데이트되지 않는 상황 시뮬레이션
// 1. PUT 요청 → 200 반환
// 2. GET 요청 → 이전 데이터 반환

// 예상 결과:
console.error('[CLIENT-SCROLL] ✗ Verification FAILED!');
console.error('  Expected:', {savedNoteName: "출제예상", savedIndex: 42});
console.error('  Received:', {savedNoteName: "", savedIndex: -1});

// alert 메시지:
alert('⚠️ 스크롤 위치 저장 검증 실패\n\n' +
      '보낸 데이터: 출제예상 #42\n' +
      '저장된 데이터:  #-1\n\n' +
      '다시 시도하거나 관리자에게 문의하세요.');
```

---

### 시나리오 9: 빈 값 처리

**GIVEN** 사용자가 PC Obsidian Desktop을 사용 중이고
**AND** 출제예상 노트가 열려 있고
**AND** savedNoteName이 빈 문자열이거나 null이고

**WHEN** 사용자가 "저장" 버튼을 클릭하면

**THEN** 시스템은 빈 문자열을 기본값으로 사용하고
**AND** 저장이 성공해야 하고
**AND** Blob 내용에 `savedNoteName: ""`가 포함되어야 한다

**검증 방법**:
```javascript
fetch('/api/scroll-position', {
  method: 'PUT',
  body: JSON.stringify({
    savedNoteName: null,
    savedIndex: 42,
    deviceId: "MacIntel-abc123"
  })
})
  .then(r => r.json())
  .then(d => {
    assert(d.success === true, 'Must succeed');
  });

// Blob 내용
{
  "savedNoteName": "",  // 빈 문자열로 저장
  "savedIndex": 42,
  "timestamp": 1738234567890,
  "deviceId": "MacIntel-abc123"
}
```

---

### 시나리오 10: deviceId 다양성 테스트

**GIVEN** 사용자가 다양한 플랫폼에서 Obsidian을 사용 중이고

**WHEN** 각 플랫폼에서 저장 요청을 보내면:

| 플랫폼 | deviceId 예시 | 예상 동작 |
|--------|---------------|-----------|
| PC (macOS) | `MacIntel-abc123` | 저장 성공 |
| PC (Windows) | `Win32-def456` | 저장 성공 |
| PC (Linux) | `X11-ghi789` | 저장 성공 |
| iPad | `iPad-jkl012` | 저장 성공 |
| iPhone | `iPhone-mno345` | 저장 성공 |
| Android | `Android-pqr678` | 저장 성공 |

**THEN** 모든 플랫폼에서 저장이 성공하고
**AND** Blob의 deviceId가 각 플랫폼에 맞게 설정되어야 한다

**검증 방법**:
```javascript
// 각 플랫폼에서 저장 후 GET으로 확인
const platforms = [
  'MacIntel-abc123',
  'Win32-def456',
  'X11-ghi789',
  'iPad-jkl012',
  'iPhone-mno345',
  'Android-pqr678'
];

for (const deviceId of platforms) {
  const response = await fetch('/api/scroll-position', {
    method: 'PUT',
    body: JSON.stringify({
      savedNoteName: '테스트',
      savedIndex: 42,
      deviceId: deviceId
    })
  });

  assert(response.ok, `Must succeed for ${deviceId}`);

  const data = await response.json();
  assert(data.success === true, `Success must be true for ${deviceId}`);
}
```

---

## 품질 게이트

### TRUST 5 프레임워크 기반 검증

#### Tested: 테스트覆盖率
- [ ] 단위 테스트: scroll-position.js 핸들러 테스트 (mock Azure SDK)
- [ ] 통합 테스트: Azure Storage와의 통합 테스트
- [ ] E2E 테스트: PC/iPad 실제 기기 테스트
- [ ]覆盖率目标: 85% 이상

#### Readable: 코드 가독성
- [ ] 로그 메시지에 명확한 prefix 사용 (`[SCROLL-PUT]`, `[CLIENT-SCROLL]`)
- [ ] 변수명이 의미를 명확히 전달
- [ ] 주석이 복잡한 로직 설명
- [ ] ESLint 경고 0개

#### Unified: 코드 일관성
- [ ] 기존 코드 스타일과 일관성 유지
- [ ] 들여쓰기, 포맷팅统一 (Prettier/black equivalent)
- [ ] 에러 처리 패턴 일관성
- [ ] 로깅 패턴 일관성

#### Secured: 보안
- [ ] 입력 검증 (savedIndex 타입, 범위)
- [ ] CORS 헤더 적용
- [ ] 민감정보 로깅 안 함 (API 키, 토큰)
- [ ] deviceId에 개인 식별 정보 포함 안 함

#### Trackable: 추적 가능성
- [ ] Git 커밋 메시지에 SPEC-FIX-001 참조
- [ ] 로그에 타임스탬프 포함
- [ ] 에러에 stack trace 포함
- [ ] Azure Application Insights에 correlation ID

---

### LSP 품질 게이트 (Run Phase)

**최대 허용치**:
- Errors: 0
- Type errors: 0
- Lint errors: 0
- Security warnings: 0

**검증 명령어**:
```bash
# Python 프로젝트의 경우 (해당되면)
python -m ruff check src/functions/scroll-position.js
python -m mypy src/functions/scroll-position.js

# JavaScript 프로젝트의 경우
npx eslint src/functions/scroll-position.js --max-warnings=0
npx tsc --noEmit
```

---

## 검증 방법

### 1. 자동화된 테스트

#### 단위 테스트 (mock 사용)

```javascript
// tests/scroll-position.test.js
const { jest } = require('@jest/globals');
const { app } = require('../src/functions/scroll-position');

describe('scroll-position API', () => {
  let mockContext;
  let mockRequest;

  beforeEach(() => {
    mockContext = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    mockRequest = {
      method: 'PUT',
      headers: {
        get: jest.fn((header) => {
          if (header === 'origin') return 'app://obsidian.md';
          if (header === 'content-type') return 'application/json';
          return null;
        })
      },
      json: jest.fn()
    };
  });

  test('PUT 요청으로 저장 성공', async () => {
    mockRequest.json.mockResolvedValue({
      savedNoteName: '테스트 노트',
      savedIndex: 42,
      deviceId: 'MacIntel-test'
    });

    const response = await app.http('scroll-position').handler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(response.jsonBody.success).toBe(true);
    expect(response.jsonBody.verified).toBe(true);
    expect(mockContext.log).toHaveBeenCalledWith(expect.stringContaining('[SCROLL-PUT]'));
  });

  test('잘못된 savedIndex 타입 처리', async () => {
    mockRequest.json.mockResolvedValue({
      savedNoteName: '테스트',
      savedIndex: 'not-a-number',  // 문자열
      deviceId: 'test'
    });

    const response = await app.http('scroll-position').handler(mockRequest, mockContext);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBeDefined();
  });

  test('CORS Origin 검증', async () => {
    mockRequest.method = 'OPTIONS';
    mockRequest.headers.get.mockReturnValue('https://evil.com');

    const response = await app.http('scroll-position').handler(mockRequest, mockContext);

    // 허용되지 않은 Origin에 대한 응답 검증
    expect(response.status).not.toBe(204);  // preflight 성공이면 204
  });
});
```

---

### 2. 통합 테스트 (Azure Storage 실제 사용)

```javascript
// tests/integration/scroll-position.integration.test.js
const { BlobServiceClient } = require('@azure/storage-blob');
const fetch = require('node-fetch');

describe('scroll-position integration test', () => {
  const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
  const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

  test('PC에서 저장 후 검증', async () => {
    const payload = {
      savedNoteName: '통합 테스트 노트',
      savedIndex: 99,
      deviceId: 'MacIntel-integration-test'
    };

    // 1. PUT 요청
    const putResponse = await fetch(`${AZURE_FUNCTION_URL}/api/scroll-position`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });

    expect(putResponse.ok).toBe(true);
    const putResult = await putResponse.json();
    expect(putResult.success).toBe(true);

    // 2. GET으로 검증
    const getResponse = await fetch(`${AZURE_FUNCTION_URL}/api/scroll-position`);
    const getData = await getResponse.json();

    expect(getData.savedNoteName).toBe(payload.savedNoteName);
    expect(getData.savedIndex).toBe(payload.savedIndex);
    expect(getData.deviceId).toBe(payload.deviceId);

    // 3. Azure Storage 직접 확인
    const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient('scroll-position');
    const blobClient = containerClient.getBlobClient('scroll-position.json');

    const exists = await blobClient.exists();
    expect(exists).toBe(true);

    const downloadResponse = await blobClient.download();
    const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
    const blobData = JSON.parse(downloaded.toString());

    expect(blobData.savedIndex).toBe(payload.savedIndex);
  });
});
```

---

### 3. 수동 테스트 절차

#### PC 테스트 절차

**사전 준비**:
1. Obsidian Desktop 최신 버전 설치
2. Azure Function URL을 Keychain에 등록
3. DevTools 활성화 (F12 또는 Cmd+Option+I)

**테스트 단계**:
1. 출제예상 노트 열기
2. 스크롤을 인덱스 50으로 이동
3. "저장" 버튼 클릭
4. DevTools Console에서 다음 로그 확인:
   ```
   [CLIENT-SCROLL] Save button clicked
   [CLIENT-SCROLL] Payload: {savedNoteName: "...", savedIndex: 50, ...}
   [CLIENT-SCROLL] Sending PUT request...
   [CLIENT-SCROLL] Response received - Status: 200
   [CLIENT-SCROLL] Verification result: {savedNoteName: "...", savedIndex: 50, ...}
   [CLIENT-SCROLL] ✓ Verification PASSED
   ```
5. 성공 토스트 메시지 확인: "✓ 스크롤 위치 저장됨"
6. Azure Storage Explorer에서 `scroll-position.json` 파일 내용 확인

**예상 결과**:
- 모든 로그가 에러 없이 출력
- Blob 파일이 최신 데이터로 업데이트됨
- 성공 토스트가 2초간 표시되었다가 사라짐

---

#### iPad 테스트 절차

**사전 준비**:
1. Mac에 Obsidian Mobile 설치 (iPad)
2. Mac Safari 브라우저 준비
3. Mac과 iPad를 같은 Wi-Fi에 연결

**테스트 단계**:
1. Mac Safari → 메뉴 → Develop → [iPad 이름] → 웹 페이지 검사
2. Web Inspector가 열리면 Console 탭 선택
3. iPad에서 출제예상 노트 열기
4. 스크롤을 인덱스 75로 이동
5. "저장" 버튼 클릭
6. Web Inspector Console에서 로그 확인 (PC와 동일한 패턴)
7. Azure Storage Explorer에서 Blob 내용 확인

**예상 결과**:
- PC와 동일한 로그 패턴
- Blob에 iPad 저장값 반영
- 성공 토스트 표시

---

### 4. 성능 테스트

**목표**: 저장 응답 시간이 2초 이내

```javascript
// 성능 테스트 코드
async function performanceTest() {
  const iterations = 10;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();

    await fetch(`${AZURE_FUNCTION_URL}/api/scroll-position`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        savedNoteName: `성능 테스트 ${i}`,
        savedIndex: i,
        deviceId: 'test-device'
      })
    });

    const elapsed = Date.now() - start;
    times.push(elapsed);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);

  console.log(`평균 응답 시간: ${avgTime}ms`);
  console.log(`최대 응답 시간: ${maxTime}ms`);

  // 검증
  assert(avgTime < 2000, `평균 응답 시간이 2초를 초과: ${avgTime}ms`);
  assert(maxTime < 5000, `최대 응답 시간이 5초를 초과: ${maxTime}ms`);
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
- [ ] TROUBLESHOOTING-SYNC-ISSUE.md 업데이트
- [ ] 코드 주석 추가 (복잡한 로직)
- [ ] README.md에 수정 내용 추가 (해당되면)
- [ ] CHANGELOG.md 엔트리 추가

### 배포 완료 기준
- [ ] Azure Functions에 배포
- [ ] 프로덕션 환경에서 smoke test 통과
- [ ] PC/iPad 실제 기기 테스트 통과
- [ ] 사용자에게 알림 (해당되면)

### 모니터링 완료 기준
- [ ] Azure Application Insights 대시보드 설정
- [ ] 에러 알림 규칙配置
- [ ] 저장 성공률 모니터링
- [ ] 응답 시간 모니터링

---

## 회귀 방지 (Regression Prevention)

### 새로운 테스트 추가
1. 단위 테스트: 타입 변환 로직
2. 통합 테스트: read-back verify
3. E2E 테스트: PC/iPad 저장 흐름
4. 성능 테스트: 응답 시간

### 코드 리뷰 체크리스트
- [ ] CORS 허용 Origin 목록 검토
- [ ] 타입 변환 로직 검토
- [ ] 에러 처리 누락 없는지 확인
- [ ] 로그에 민감정보 없는지 확인
- [ ] 검증 로직이 너무 복잡하지 않은지 확인

### 모니터링 지표
- 저장 성공률: > 99%
- 평균 응답 시간: < 2초
- 에러율: < 1%
- 검증 실패율: < 0.1%
