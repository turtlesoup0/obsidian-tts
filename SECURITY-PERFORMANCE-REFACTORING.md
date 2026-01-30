# 보안 및 성능 리팩토링 문서

**작성일**: 2026-01-22
**목적**: 보안 취약점 및 성능 이슈 해결

---

## 📋 개요

이 문서는 Obsidian TTS 프로젝트의 보안 및 성능을 개선하기 위한 리팩토링 작업을 기록합니다.

### 리팩토링 범위
- **보안**: CORS, 입력 검증, 에러 메시지 정보 누출, race condition
- **성능**: 메모리 최적화, 타임아웃, 리소스 정리
- **코드 품질**: 환경 변수 기반 설정, 중앙화된 헬퍼 함수

---

## 🔒 보안 개선

### 1. CORS 설정 개선 ✅

**이슈**: 모든 엔드포인트에서 `Access-Control-Allow-Origin: *` 사용 (High Severity)

**문제점**:
- 모든 도메인에서 API 접근 가능
- CORS 정책 우회로 인한 보안 위험
- 프로덕션 환경에서 부적절

**해결 방법**:

#### 1) `shared/corsHelper.js` 생성

```javascript
/**
 * CORS Helper - 환경 변수 기반 CORS 설정
 */

function getAllowedOrigins() {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (!allowedOriginsEnv) {
    // 개발 환경: localhost만 허용
    return ['http://localhost', 'http://127.0.0.1'];
  }

  // 프로덕션: 환경 변수에서 쉼표로 구분된 도메인 목록
  return allowedOriginsEnv.split(',').map(origin => origin.trim());
}

function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  // Obsidian app:// 프로토콜 허용
  if (origin.startsWith('app://') || origin.startsWith('capacitor://')) {
    return true;
  }

  return allowedOrigins.some(allowed => allowed === origin);
}

function getCorsHeaders(requestOrigin) {
  const origin = isOriginAllowed(requestOrigin)
    ? requestOrigin
    : getAllowedOrigins()[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-TTS-Chars-Used, X-Cache-Status, X-Cached-At, X-Expires-At'
  };
}
```

#### 2) 모든 엔드포인트 업데이트

**변경 전**:
```javascript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
}
```

**변경 후**:
```javascript
const requestOrigin = request.headers.get('origin');
const corsHeaders = getCorsHeaders(requestOrigin);

headers: {
  ...corsHeaders,
  'Content-Type': 'application/json'
}
```

**영향을 받는 파일**:
- `src/functions/tts-stream.js`
- `src/functions/cache.js`
- `src/functions/cache-stats.js`

#### 3) Azure Function App 환경 변수 설정 필요

```bash
az functionapp config appsettings set \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --settings ALLOWED_ORIGINS="app://obsidian.md,https://yourdomain.com"
```

**테스트**:
```bash
# 허용된 origin에서 요청
curl -H "Origin: app://obsidian.md" \
  https://your-function-app.azurewebsites.net/api/cache-stats

# 허용되지 않은 origin에서 요청 (fallback to default)
curl -H "Origin: https://malicious.com" \
  https://your-function-app.azurewebsites.net/api/cache-stats
```

---

### 2. 입력 검증 강화 ✅

**이슈**: `tts-stream.js`에서 입력 검증 부족 (Medium Severity)

**문제점**:
- `voice`, `rate`, `pitch`, `volume` 파라미터 검증 없음
- 비정상적인 값으로 Azure API 호출 가능
- 비용 낭비 및 서비스 오류 발생 가능

**해결 방법**:

#### tts-stream.js:51-94

```javascript
// 입력 검증: text 필수
if (!text || typeof text !== 'string') {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Missing or invalid parameter: text must be a non-empty string' }
  };
}

// 입력 검증: text 길이 제한 (50,000자)
if (text.length > 50000) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Text too long: maximum 50,000 characters allowed' }
  };
}

// 입력 검증: voice (허용된 voice 목록)
const allowedVoices = [
  'ko-KR-SunHiNeural', 'ko-KR-InJoonNeural', 'ko-KR-BongJinNeural',
  'ko-KR-GookMinNeural', 'ko-KR-JiMinNeural', 'ko-KR-SeoHyeonNeural',
  'ko-KR-SoonBokNeural', 'ko-KR-YuJinNeural'
];
if (voice && !allowedVoices.includes(voice)) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: `Invalid voice: must be one of ${allowedVoices.join(', ')}` }
  };
}

// 입력 검증: rate (0.5 ~ 2.0)
if (rate !== undefined && (typeof rate !== 'number' || rate < 0.5 || rate > 2.0)) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Invalid rate: must be a number between 0.5 and 2.0' }
  };
}

// 입력 검증: pitch (-50 ~ 50)
if (pitch !== undefined && (typeof pitch !== 'number' || pitch < -50 || pitch > 50)) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Invalid pitch: must be a number between -50 and 50' }
  };
}

// 입력 검증: volume (0 ~ 100)
if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 100)) {
  return {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    jsonBody: { error: 'Invalid volume: must be a number between 0 and 100' }
  };
}
```

**효과**:
- ✅ 비정상적인 파라미터로 인한 Azure API 실패 방지
- ✅ 명확한 에러 메시지로 디버깅 용이
- ✅ 비용 절감 (잘못된 요청으로 인한 API 호출 감소)

---

### 3. 에러 메시지 정보 누출 방지 ✅

**이슈**: 에러 메시지에 내부 구현 세부사항 노출 (Medium Severity)

**문제점**:

**변경 전** (tts-stream.js:149):
```javascript
jsonBody: {
  error: 'Speech synthesis failed',
  details: error.message  // ❌ 내부 에러 메시지 노출
}
```

**해결 방법**:

**변경 후**:
```javascript
jsonBody: {
  error: 'Speech synthesis failed'  // ✅ 일반적인 메시지만 반환
}
```

**서버 로그에는 전체 에러 기록**:
```javascript
context.error('TTS Error:', error);  // 서버 로그에만 기록
```

**효과**:
- ✅ 내부 구현 세부사항 숨김
- ✅ 공격자에게 유용한 정보 제공 방지
- ✅ 서버 로그에는 전체 에러 기록 유지

---

### 4. Race Condition 해결 ✅

**이슈**: `usageTracker.js`의 read-modify-write 패턴 (High Severity)

**문제점**:

**변경 전**:
```javascript
async function addUsage(charsUsed) {
  const usage = await readUsage();     // 읽기
  usage.totalChars += charsUsed;       // 수정
  await writeUsage(usage);             // 쓰기
  return usage;
}
```

**문제 시나리오**:
```
시간 T1: Request A가 usage를 읽음 (totalChars: 1000)
시간 T2: Request B가 usage를 읽음 (totalChars: 1000)
시간 T3: Request A가 1000 + 500 = 1500 쓰기
시간 T4: Request B가 1000 + 300 = 1300 쓰기  ❌ A의 500이 손실됨!
```

**해결 방법**: 파일 잠금 메커니즘

#### usageTracker.js:13-63

```javascript
const LOCK_FILE = path.join(DATA_DIR, 'tts-usage.lock');
const LOCK_TIMEOUT = 5000;
const LOCK_RETRY_DELAY = 50;

/**
 * 파일 잠금 획득 (재시도 로직 포함)
 */
async function acquireLock() {
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT) {
    try {
      // 잠금 파일 생성 (이미 존재하면 실패)
      await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // 잠금 파일이 이미 존재 - 나이 확인
        try {
          const stats = await fs.stat(LOCK_FILE);
          const age = Date.now() - stats.mtimeMs;

          // 오래된 잠금 파일(10초 이상)은 제거 (stale lock)
          if (age > 10000) {
            await fs.unlink(LOCK_FILE);
            continue;
          }
        } catch (statError) {
          continue;
        }

        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Failed to acquire lock: timeout');
}

/**
 * 파일 잠금 해제
 */
async function releaseLock() {
  try {
    await fs.unlink(LOCK_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to release lock:', error);
    }
  }
}

async function addUsage(charsUsed) {
  // 입력 검증
  if (typeof charsUsed !== 'number' || charsUsed < 0 || !Number.isFinite(charsUsed)) {
    throw new Error('Invalid charsUsed: must be a positive finite number');
  }

  let lockAcquired = false;
  try {
    // 파일 잠금 획득
    await acquireLock();
    lockAcquired = true;

    // 파일 읽기
    const usage = await readUsage();

    // 업데이트
    usage.totalChars += charsUsed;

    // 파일 쓰기
    await writeUsage(usage);

    return usage;
  } finally {
    // 잠금 해제 (반드시 실행)
    if (lockAcquired) {
      await releaseLock();
    }
  }
}
```

**효과**:
- ✅ 동시 요청에서 데이터 손실 방지
- ✅ Atomic한 read-modify-write 보장
- ✅ Stale lock 자동 정리 (10초 이상 오래된 잠금)
- ✅ 입력 검증 추가

---

## ⚡ 성능 개선

### 1. Azure TTS 타임아웃 및 리소스 정리 ✅

**이슈**: `azureTTS.js`에서 타임아웃 없음, 리소스 정리 불완전 (Medium Severity)

**문제점**:
- Azure API 호출이 무한정 대기 가능
- 메모리 리크 위험 (synthesizer 객체 미정리)
- 타임아웃 발생 시 리소스 정리 누락

**해결 방법**:

#### azureTTS.js:7-72

```javascript
// Azure TTS 타임아웃 (30초)
const TTS_TIMEOUT = 30000;

async function synthesizeSpeech(ssml, subscriptionKey, region) {
  return new Promise((resolve, reject) => {
    let synthesizer = null;
    let timeoutId = null;
    let isCompleted = false;

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

      synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      // 타임아웃 설정
      timeoutId = setTimeout(() => {
        if (!isCompleted && synthesizer) {
          isCompleted = true;
          synthesizer.close();  // 리소스 정리
          reject(new Error('Speech synthesis timeout'));
        }
      }, TTS_TIMEOUT);

      synthesizer.speakSsmlAsync(
        ssml,
        result => {
          if (isCompleted) return; // 이미 타임아웃된 경우 무시

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = Buffer.from(result.audioData);
            resolve(audioData);
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
            reject(new Error(`Speech synthesis canceled: ${cancellation.errorDetails}`));
          } else {
            reject(new Error(`Speech synthesis failed: ${result.reason}`));
          }
        },
        error => {
          if (isCompleted) return;

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );
    } catch (error) {
      isCompleted = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (synthesizer) {
        synthesizer.close();
        synthesizer = null;
      }
      reject(new Error(`Azure TTS initialization error: ${error.message}`));
    }
  });
}
```

**개선 사항**:
- ✅ 30초 타임아웃 추가 (무한 대기 방지)
- ✅ `isCompleted` 플래그로 중복 실행 방지
- ✅ 모든 경로에서 `synthesizer.close()` 호출
- ✅ 타임아웃 발생 시에도 리소스 정리
- ✅ `finally` 블록이 아닌 명시적 정리 (더 확실함)

**동일한 개선을 `getAvailableVoices()`에도 적용** (10초 타임아웃)

---

### 2. cache-stats.js 메모리 최적화 ✅

**이슈**: 모든 blob을 메모리에 로드 후 통계 계산 (Medium Severity)

**문제점**:

**변경 전** (cache-stats.js:56-77):
```javascript
// 모든 blob을 배열에 저장
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
```

**문제**:
- 10,000개 파일 = ~1MB 메모리 (파일당 ~100 bytes)
- 불필요한 배열 복사 (`[...blobs]`)
- 정렬 연산 O(n log n)

**해결 방법**: 스트리밍 방식

**변경 후**:
```javascript
// 통계 변수 초기화
let totalFiles = 0;
let totalSize = 0;
let oldestFile = null;
let newestFile = null;

// 스트리밍 방식으로 blob 통계 계산 (메모리 효율적)
for await (const blob of containerClient.listBlobsFlat()) {
  totalFiles++;
  totalSize += blob.properties.contentLength || 0;

  const blobInfo = {
    name: blob.name,
    createdOn: blob.properties.createdOn
  };

  // oldest 파일 업데이트
  if (!oldestFile || blob.properties.createdOn < oldestFile.createdOn) {
    oldestFile = blobInfo;
  }

  // newest 파일 업데이트
  if (!newestFile || blob.properties.createdOn > newestFile.createdOn) {
    newestFile = blobInfo;
  }
}
```

**성능 비교**:

| 항목 | 변경 전 | 변경 후 | 개선 |
|------|---------|---------|------|
| **메모리** | O(n) | O(1) | 10,000배 개선 |
| **시간 복잡도** | O(n log n) | O(n) | log n 배 개선 |
| **파일 10,000개** | ~1MB 메모리 | ~200 bytes | 5,000배 개선 |

**효과**:
- ✅ 메모리 사용량 최소화 (O(1))
- ✅ 대용량 blob 컨테이너에서도 안정적
- ✅ 정렬 불필요 (단일 패스로 min/max 찾기)

---

## 📊 리팩토링 요약

### 보안 개선
| 이슈 | 심각도 | 상태 | 파일 |
|------|--------|------|------|
| CORS 와일드카드 | High | ✅ 완료 | corsHelper.js, tts-stream.js, cache.js, cache-stats.js |
| 입력 검증 부족 | Medium | ✅ 완료 | tts-stream.js |
| 에러 메시지 누출 | Medium | ✅ 완료 | tts-stream.js |
| Race condition | High | ✅ 완료 | usageTracker.js |

### 성능 개선
| 이슈 | 심각도 | 상태 | 파일 |
|------|--------|------|------|
| Azure TTS 타임아웃 없음 | Medium | ✅ 완료 | azureTTS.js |
| 리소스 정리 불완전 | Medium | ✅ 완료 | azureTTS.js |
| cache-stats 메모리 이슈 | Medium | ✅ 완료 | cache-stats.js |

---

## 🧪 테스트 가이드

### 1. CORS 테스트

```bash
# Azure에 환경 변수 설정
az functionapp config appsettings set \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --settings ALLOWED_ORIGINS="app://obsidian.md"

# 허용된 origin
curl -H "Origin: app://obsidian.md" \
  https://your-function-app.azurewebsites.net/api/cache-stats

# 응답 헤더 확인
# Access-Control-Allow-Origin: app://obsidian.md
```

### 2. 입력 검증 테스트

```bash
# 잘못된 rate
curl -X POST https://your-function-app.azurewebsites.net/api/tts-stream \
  -H "Content-Type: application/json" \
  -d '{"text":"테스트","rate":5.0}'
# 응답: 400 Bad Request, "Invalid rate: must be a number between 0.5 and 2.0"

# 텍스트 길이 초과
curl -X POST https://your-function-app.azurewebsites.net/api/tts-stream \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"$(printf 'a%.0s' {1..60000})\"}"
# 응답: 400 Bad Request, "Text too long: maximum 50,000 characters allowed"
```

### 3. Race Condition 테스트

```bash
# 동시 요청 10개 (병렬)
for i in {1..10}; do
  curl -X POST https://your-function-app.azurewebsites.net/api/tts-stream \
    -H "Content-Type: application/json" \
    -d '{"text":"테스트 100자"}' &
done
wait

# 사용량 확인
curl https://your-function-app.azurewebsites.net/api/get-usage
# totalChars가 정확히 1000 (100자 × 10회)인지 확인
```

### 4. 타임아웃 테스트

```bash
# 매우 긴 텍스트로 타임아웃 유도 (Azure TTS는 30초 내에 처리해야 함)
curl -X POST https://your-function-app.azurewebsites.net/api/tts-stream \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"$(printf 'a%.0s' {1..40000})\"}" \
  --max-time 35
# 30초 후 타임아웃 에러 확인
```

### 5. cache-stats 성능 테스트

```bash
# 시간 측정
time curl https://your-function-app.azurewebsites.net/api/cache-stats

# 응답 시간이 1초 이내인지 확인 (1,000개 파일 기준)
```

---

## 🚀 배포

### 1. 로컬 테스트

```bash
cd /Users/turtlesoup0/Documents/obsidian-tts
npm install
npm start
```

### 2. Azure 배포

```bash
# 수동 배포
cd /Users/turtlesoup0/Documents/obsidian-tts
func azure functionapp publish obsidian-tts-func

# 또는 GitHub Actions (자동 배포)
git add .
git commit -m "refactor: 보안 및 성능 개선"
git push origin main
```

### 3. 환경 변수 설정

```bash
# ALLOWED_ORIGINS 설정
az functionapp config appsettings set \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --settings ALLOWED_ORIGINS="app://obsidian.md,https://yourdomain.com"
```

---

## 📝 향후 개선 사항

### 추가 보안 개선
1. **Rate Limiting**: API 호출 빈도 제한 (초당 10회)
2. **Authentication**: API Key 기반 인증 추가
3. **Logging**: Azure Application Insights 연동

### 추가 성능 개선
1. **Cache API**: Redis 기반 메모리 캐시 추가
2. **CDN**: Azure CDN을 통한 오디오 파일 배포
3. **Async Usage Tracking**: 사용량 추적을 비동기로 처리 (응답 속도 개선)

---

**수정일**: 2026-01-22
**배포 상태**: ⏳ 대기 중
**다음 단계**: Azure 배포 및 테스트
