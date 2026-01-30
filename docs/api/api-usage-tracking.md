# API 사용량 추적 시스템

## 개요

무료 API(F0)와 유료 API(S0)의 사용량을 별도로 추적하여 사용자가 정확한 비용을 파악할 수 있도록 합니다.

## 구현된 기능

### 1. 별도 사용량 추적

**usageTracker.js 수정:**
```javascript
function createUsageData() {
  return {
    totalChars: 0,  // 전체 사용량 (무료 + 유료)
    freeChars: 0,   // 무료 API 사용량
    paidChars: 0,   // 유료 API 사용량
    currentMonth: '2026-01',
    lastUpdated: '2026-01-23T...',
    history: []
  };
}

async function addUsage(charsUsed, isPaid = false) {
  // ...
  usage.totalChars += charsUsed;
  if (isPaid) {
    usage.paidChars += charsUsed;
  } else {
    usage.freeChars += charsUsed;
  }
  // ...
}
```

### 2. TTS API에서 자동 추적

**tts-stream/index.js:**
```javascript
// 헤더에 API 키가 있으면 유료, 없으면 무료 (환경 변수)
const isPaidApi = req.headers['x-azure-speech-key'] ? true : false;
const charsUsed = cleanedText.length;

await addUsage(charsUsed, isPaidApi);

// 응답 헤더에 정보 포함
'X-TTS-Chars-Used': charsUsed.toString(),
'X-TTS-API-Type': isPaidApi ? 'paid' : 'free'
```

### 3. 사용량 API 응답

**GET /api/usage 응답:**
```json
{
  "source": "local-tracker",
  "totalChars": 189501,
  "freeChars": 15,
  "paidChars": 189486,
  "currentMonth": "2026-01",
  "lastUpdated": "2026-01-23T05:35:00Z",
  "freeLimit": 500000,
  "freePercentage": "0.00",
  "freeRemaining": 499985,
  "percentage": "0.00",      // 하위 호환성
  "remaining": 499985        // 하위 호환성
}
```

### 4. 프론트엔드 표시

**v4 노트 사용량 표시:**
```
📊 API 사용량 (이번 달) ✓ 서버 동기화
💳 유료 API 사용 중 (S0)  ☑ 유료 API 사용

🆓 무료: 15자 / 500,000자 (0.00%)
💳 유료: 189,486자
전체: 189,501자

남은 무료 사용량: 499,985자
마지막 업데이트: 2026. 1. 23. 오전 5:35:00
```

### 5. 무료 할당량 복구 시 자동 전환

```javascript
// 무료 할당량이 있으면 자동으로 무료 API로 전환
if (freeRemaining > 0 && window.apiKeyConfig.usePaidApi) {
    window.apiKeyConfig.usePaidApi = false;
    localStorage.setItem('azureTTS_usePaidApi', 'false');
    console.log('🔄 무료 할당량 복구됨 - 무료 API로 자동 전환');
}
```

## 사용 시나리오

### 시나리오 1: 유료 API로 캐싱 작업
```
1. 사용자가 "유료 API 사용" 체크
2. 노트 100개 캐싱 (평균 200자) = 20,000자
3. 사용량 표시:
   - 무료: 0자 / 500,000자 (0%)
   - 유료: 20,000자
   - 전체: 20,000자
4. 비용: 약 $0.32 (420원)
```

### 시나리오 2: 다음 달 무료 할당량 리셋
```
1. 2026년 2월 1일 00:00 UTC
2. 무료 할당량 자동 리셋: 500,000자
3. 사용량 표시가 자동으로 무료 API로 전환
4. 체크박스 자동 해제
5. 로그: "🔄 무료 할당량 복구됨 - 무료 API로 자동 전환"
```

### 시나리오 3: 혼합 사용
```
1. 무료 API로 450,000자 사용 (90%)
2. 무료 할당량 부족으로 유료 API 체크
3. 유료 API로 100,000자 사용
4. 사용량 표시:
   - 무료: 450,000자 / 500,000자 (90%)
   - 유료: 100,000자
   - 전체: 550,000자
5. 다음 달 리셋 시 자동으로 무료 API로 전환
```

## 비용 계산

### 무료 API (F0)
- 할당량: 500,000자/월
- 비용: 무료
- 리셋: 매월 1일 00:00 UTC

### 유료 API (S0)
- 할당량: 무제한
- 비용: $16 per 1M characters
  - 1,000자: $0.016 (약 20원)
  - 10,000자: $0.16 (약 210원)
  - 100,000자: $1.60 (약 2,100원)

### 예상 비용 (혼합 사용)
```
시나리오: 한 달 동안 600,000자 사용
- 무료: 500,000자 ($0)
- 유료: 100,000자 ($1.60 = 약 2,100원)
--------------------------
총 비용: $1.60 (약 2,100원)
```

## 데이터 저장

### 저장 위치
```bash
$HOME/data/tts-usage.json
```

### 데이터 구조
```json
{
  "totalChars": 189501,
  "freeChars": 15,
  "paidChars": 189486,
  "currentMonth": "2026-01",
  "lastUpdated": "2026-01-23T05:35:00.774Z",
  "history": [
    {
      "month": "2025-12",
      "totalChars": 450000,
      "freeChars": 450000,
      "paidChars": 0
    }
  ]
}
```

## 파일 잠금

동시 요청 시 데이터 무결성을 위해 파일 잠금 사용:

```javascript
// 잠금 파일: $HOME/data/tts-usage.lock
// 타임아웃: 5초
// Stale lock 제거: 10초 이상

async function acquireLock() {
  // 잠금 획득 재시도 로직
  await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
}

async function releaseLock() {
  await fs.unlink(LOCK_FILE);
}
```

## 모니터링

### 로그 확인
```bash
# Azure Functions 로그
func azure functionapp logstream obsidian-tts-func

# 사용량 확인
curl https://your-function-app.azurewebsites.net/api/usage | jq .
```

### 브라우저 콘솔
```javascript
// 현재 API 모드 확인
console.log('API Mode:', window.apiKeyConfig.usePaidApi ? 'Paid' : 'Free');

// 사용량 조회
await window.fetchUsageFromBackend();
```

## 문제 해결

### Q: 유료 사용량이 0으로 표시됨
**A**: 헤더에 API 키가 전달되지 않았습니다. 브라우저 개발자 도구(F12) → Network → 요청 헤더에서 `X-Azure-Speech-Key` 확인

### Q: 무료 할당량이 자동으로 리셋되지 않음
**A**: usageTracker.js의 `readUsage()` 함수가 매번 월을 확인합니다. 서버 시간대가 UTC인지 확인하세요.

### Q: 사용량 파일이 없어졌어요
**A**: `/tmp` 디렉토리는 재시작 시 삭제됩니다. 프로덕션 환경에서는 `$HOME/data` 또는 영구 스토리지 사용

### Q: 캐시된 노트도 사용량에 포함되나요?
**A**: 아니요. 캐시(오프라인/서버)에서 로드되는 노트는 TTS API를 호출하지 않으므로 사용량에 포함되지 않습니다.

## 데이터 마이그레이션

### 2026-01-23: 초기 마이그레이션
기존 `totalChars` 데이터를 `freeChars`로 마이그레이션 완료.

자세한 내용은 `USAGE-DATA-MIGRATION.md` 참조.

## 향후 개선사항

1. **Azure Monitor 통합**: 실시간 Azure 사용량 조회 (현재는 로컬 추적)
2. **알림 기능**: 무료 할당량 80% 도달 시 알림
3. **비용 예측**: 현재 사용 패턴 기반 월말 예상 비용
4. **사용량 그래프**: 일별/주별 사용량 시각화
5. **데이터 무결성 검증**: `freeChars + paidChars == totalChars` 자동 검증

---

**작성일**: 2026-01-23
**버전**: v1.1
**변경사항**: 데이터 마이그레이션 완료 (189,486자 복구)
**테스트 완료**: 유료 API 추적 ✅, 무료 API 추적 ✅, 자동 전환 ✅, 마이그레이션 ✅
