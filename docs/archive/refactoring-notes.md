# 코드 리팩토링 노트 (2026-01-23)

## 🎯 목표
Azure TTS Function 코드베이스의 안정성, 유지보수성, 보안성 개선

---

## 📋 변경 사항

### 1️⃣ **REST API 전환 (크리티컬)**
- **문제**: `tts-stream.js`가 Azure Speech SDK 버전(`azureTTS.js`) 사용
- **원인**: Azure Function 환경에서 SDK 초기화 시 30초 타임아웃 발생
- **해결**: REST API 버전(`azureTTS-rest.js`)으로 전환
- **파일**: `src/functions/tts-stream.js:7`

```diff
- const { synthesizeSpeech } = require('../../shared/azureTTS');
+ const { synthesizeSpeech } = require('../../shared/azureTTS-rest');
```

---

### 2️⃣ **무료/유료 API 명시적 전환**
- **문제**: 자동 전환 시 사용자가 비용 발생을 인지하지 못할 위험
- **해결**: 환경 변수 `USE_PAID_API=true`로 명시적 설정 필요
- **파일**: `src/functions/tts-stream.js:27-73`

#### 동작 방식
```javascript
// 환경 변수 확인
const isPaidApiEnabled = process.env.USE_PAID_API === 'true';

// 무료 API 사용 중
if (!isPaidApiEnabled) {
  // 할당량 확인 (500,000자/월)
  if (currentUsage.freeChars >= FREE_LIMIT) {
    // HTTP 429 에러 반환 (자동 전환 없음)
    return { status: 429, error: 'Free API quota exceeded' };
  }
}
```

#### 설정 방법
```bash
# Azure Function 환경 변수 설정
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings USE_PAID_API=true
```

---

### 3️⃣ **사용량 추적 정확성 개선**
- **문제**: `isPaid` 파라미터가 전달되지 않아 모든 사용량이 무료로 기록됨
- **해결**: `addUsage(actualCharsUsed, isPaidApiEnabled)` 올바르게 전달
- **파일**: `src/functions/tts-stream.js:212`

```diff
- const updatedUsage = await addUsage(actualCharsUsed);
+ const updatedUsage = await addUsage(actualCharsUsed, isPaidApiEnabled);
```

---

### 4️⃣ **SDK 버전 Deprecated 표시**
- **문제**: 사용하지 않는 SDK 버전 코드 혼란 유발
- **해결**: `@deprecated` 주석으로 명확히 표시
- **파일**: `shared/azureTTS.js:1-12`

```javascript
/**
 * @deprecated 이 모듈은 더 이상 사용되지 않습니다.
 * Azure Function 환경에서 타임아웃 문제가 발생하여
 * REST API 방식(azureTTS-rest.js)으로 대체되었습니다.
 */
```

---

### 5️⃣ **에러 처리 세분화**
- **문제**: 모든 에러가 HTTP 500으로 반환되어 디버깅 어려움
- **해결**: 에러 메시지 분석하여 적절한 HTTP 상태 코드 반환
- **파일**: `src/functions/tts-stream.js:231-266`

| 에러 종류 | HTTP 코드 | 사용자 메시지 |
|---------|----------|------------|
| 할당량 초과 | 429 | API quota exceeded |
| 잘못된 API 키 | 401 | Invalid API key |
| 타임아웃 | 504 | Request timeout |
| 네트워크 에러 | 503 | Network error |
| 기타 | 500 | Speech synthesis failed |

---

### 6️⃣ **환경 변수 문서화**
- **파일**: `.env.example`, `local.settings.json`

#### 새로운 환경 변수
```bash
# 유료 API 사용 설정 (기본값: false)
USE_PAID_API=false
```

#### 전체 환경 변수 목록
```bash
# Azure Speech Service (필수)
AZURE_SPEECH_KEY=your-subscription-key
AZURE_SPEECH_REGION=koreacentral

# 유료 API 사용 설정 (선택)
USE_PAID_API=false

# Azure Storage (캐싱용, 선택)
AZURE_STORAGE_CONNECTION_STRING=your-storage-connection-string
```

---

## ✅ 검증 완료
- ✅ JavaScript 문법 검증 (`node -c`)
- ✅ REST API 모듈 사용 확인
- ✅ isPaid 파라미터 전달 확인
- ✅ 환경 변수 문서화 완료
- ✅ 에러 처리 세분화 완료

---

## 🚀 배포 가이드

### 1. 로컬 테스트
```bash
# 환경 변수 설정
cp .env.example .env
# .env 파일 편집하여 API 키 입력

# Function 시작
npm start
```

### 2. Azure 배포
```bash
# 환경 변수 설정 (무료 API 사용)
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings AZURE_SPEECH_KEY=<your-key> \
              AZURE_SPEECH_REGION=koreacentral \
              USE_PAID_API=false

# 코드 배포
func azure functionapp publish <function-app-name>
```

### 3. 유료 API 전환 (할당량 초과 시)
```bash
# USE_PAID_API 환경 변수만 변경
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings USE_PAID_API=true

# 재배포 불필요 (환경 변수만 변경하면 즉시 적용)
```

---

## 📊 비용 모니터링

### 무료 API (F0 Free Tier)
- 할당량: 500,000자/월
- 현재 사용량 확인: `GET /api/usage`

### 유료 API (S0 Standard)
- 비용: $16/1M 문자
- 월별 예상 비용: `(totalChars / 1,000,000) * $16`

---

## 🔒 보안 고려사항
1. **API 키 보안**: 환경 변수로만 관리, 코드에 하드코딩 금지
2. **CORS 설정**: `ALLOWED_ORIGINS` 환경 변수로 도메인 제한
3. **입력 검증**: 텍스트 길이 50,000자 제한
4. **Rate Limiting**: 무료 API 할당량 초과 시 HTTP 429 반환

---

## 🐛 알려진 이슈
- **없음**: 모든 크리티컬 이슈 해결 완료

---

## 📝 향후 개선 사항
1. **데이터베이스 도입**: 파일 기반 사용량 추적을 Azure Table Storage로 전환
2. **실시간 비용 추적**: Azure Consumption API 통합
3. **자동 알림**: 할당량 80% 도달 시 이메일 알림
4. **캐싱 최적화**: 중복 요청 감지 및 캐시 히트율 개선

---

## 📚 관련 문서
- [TROUBLESHOOTING-PAID-API.md](TROUBLESHOOTING-PAID-API.md)
- [QUOTA-AUTO-SWITCH.md](QUOTA-AUTO-SWITCH.md)
- [API-USAGE-TRACKING.md](API-USAGE-TRACKING.md)
