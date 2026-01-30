# 유료 API 사용량 추적 문제 해결

## 문제: "유료 API를 사용했는데 0자로 표시됨"

### 증상
- 체크박스: ☑ 유료 API 사용
- 사용량 표시: `💳 유료: 0자`
- Azure Consumption API: `paidChars: 0`
- 로컬 추적: `paidChars: 0`

### 가능한 원인

#### 1. 유료 API 키가 등록되지 않음 ⭐ (가장 가능성 높음)

**증상**:
- 체크박스는 체크되어 있음
- 실제 TTS 요청은 무료 API로 전송됨

**확인 방법**:
1. Obsidian에서 v4 노트 열기
2. 브라우저 개발자 도구(F12) → Console 탭
3. 다음 명령어 실행:
```javascript
console.log('무료 API 키:', window.apiKeyConfig.freeKey ? '등록됨' : '없음');
console.log('유료 API 키:', window.apiKeyConfig.paidKey ? '등록됨' : '없음');
console.log('현재 모드:', window.apiKeyConfig.usePaidApi ? '유료' : '무료');
```

**예상 결과**:
```
무료 API 키: 등록됨
유료 API 키: 없음  ← 이게 문제!
현재 모드: 유료
```

**해결**:
1. `Settings/PC-Azure TTS 설정.md` 파일 열기
2. `paidKey` 필드에 유료 API 키 입력:
```javascript
window.apiKeyConfig = {
    freeKey: "DKSJfXU1Ll...",  // F0 키
    paidKey: "8oO5DXpYVVs8..."  // ← S0 키 입력 필요!
};
```
3. 저장 후 v4 노트 새로고침

#### 2. 최근에 체크했지만 TTS 요청을 아직 안 함

**확인 방법**:
- 체크박스 체크 후 실제로 노트 재생을 했는가?
- 재생 버튼을 클릭했는가?

**해결**:
- 노트를 재생해서 실제 TTS API 호출

#### 3. 프론트엔드 헤더 전달 실패

**확인 방법**:
노트 재생 시 브라우저 콘솔에서 다음 로그 확인:

**정상**:
```
💳 유료 API 키 사용 (S0)
```

**유료 키 없음**:
```
⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다. 무료 API로 요청됩니다.
```

**무료 모드**:
```
🆓 무료 API 사용 (F0 - 백엔드 환경 변수)
```

#### 4. Azure Consumption API 24-48시간 지연

**설명**:
- Azure Consumption API는 실제 사용량을 24-48시간 후에 반영
- 오늘 사용한 유료 API는 내일이나 모레에 표시됨

**확인 방법**:
- 로컬 추적 API도 0이면 실제로 사용 안 한 것
- 로컬 추적에만 나타나면 Azure는 지연 중

**로컬 추적 확인**:
```bash
curl -s "https://your-function-app.azurewebsites.net/api/usage" | jq '{totalChars, freeChars, paidChars}'
```

## 단계별 진단

### Step 1: API 키 설정 확인
```javascript
// 브라우저 콘솔에서 실행
console.log('API 키 설정:', {
    freeKey: window.apiKeyConfig.freeKey?.substring(0, 10) + '...',
    paidKey: window.apiKeyConfig.paidKey?.substring(0, 10) + '...',
    usePaidApi: window.apiKeyConfig.usePaidApi
});
```

**결과 해석**:
- `paidKey: undefined...` → **유료 키 없음 (원인 1)**
- `paidKey: 8oO5DXpYVV...` → 유료 키 있음 (다음 단계로)

### Step 2: TTS 요청 시 로그 확인
노트 재생 버튼 클릭 후 콘솔 확인:

**Case A: 유료 키 없음**
```
⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다. 무료 API로 요청됩니다.
```
→ **해결**: `Settings/PC-Azure TTS 설정.md`에 유료 키 입력

**Case B: 유료 키 사용 중**
```
💳 유료 API 키 사용 (S0)
```
→ 정상 작동, 24-48시간 후 Azure Consumption API에 반영

**Case C: 무료 API 사용 중**
```
🆓 무료 API 사용 (F0 - 백엔드 환경 변수)
```
→ 체크박스가 풀렸거나, 자동 복구됨

### Step 3: 백엔드 로그 확인 (고급)
```bash
# Azure Functions 로그 스트림
func azure functionapp logstream obsidian-tts-func

# 최근 TTS 요청 로그 확인
# "Using API key from: header" → 유료 API
# "Using API key from: environment" → 무료 API
```

### Step 4: 사용량 API 직접 조회
```bash
# Azure Consumption API (24-48시간 지연)
curl -s "https://your-function-app.azurewebsites.net/api/azure-usage" | jq '{totalChars, freeChars, paidChars, paidCost}'

# 로컬 추적 (실시간)
curl -s "https://your-function-app.azurewebsites.net/api/usage" | jq '{totalChars, freeChars, paidChars}'
```

## 해결 방법 요약

### ✅ 해결책 1: 유료 API 키 등록 (가장 흔한 경우)
1. `Settings/PC-Azure TTS 설정.md` 열기
2. `paidKey` 필드에 S0 API 키 입력
3. 저장 후 v4 노트 새로고침
4. 노트 재생 후 콘솔에서 `💳 유료 API 키 사용 (S0)` 확인

### ✅ 해결책 2: 실제 TTS 사용
- 체크박스만 체크하고 재생하지 않았다면
- 노트 재생 버튼 클릭하여 실제 API 호출

### ✅ 해결책 3: 24-48시간 대기
- 로컬 추적에 `paidChars > 0`으로 나타나면
- Azure Consumption API는 내일/모레 반영됨

## 현재 상태 확인 (2026-01-23)

### Azure Consumption API 응답
```json
{
  "totalChars": 509710,
  "freeChars": 509710,
  "paidChars": 0,
  "paidCost": 0
}
```

### 로컬 추적 응답
```json
{
  "totalChars": 197636,
  "freeChars": 197636,
  "paidChars": 0
}
```

### 결론
**두 API 모두 `paidChars: 0`** → 실제로 유료 API가 사용되지 않았습니다.

**가장 가능성 높은 원인**: 유료 API 키가 등록되지 않음

## 예방 방법

### 1. 유료 API 키 등록 확인
노트 로딩 시 자동으로 경고 표시:
```javascript
if (window.apiKeyConfig.usePaidApi && !window.apiKeyConfig.paidKey) {
    console.warn('⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다.');
}
```

### 2. 실시간 로그 모니터링
- 브라우저 콘솔을 열어두고 재생
- `💳` 또는 `🆓` 아이콘으로 실제 사용 API 확인

### 3. 정기적인 사용량 확인
```javascript
// 현재 사용량 확인
await window.fetchUsageFromBackend();
```

## 참고 자료

- `API-USAGE-TRACKING.md`: 사용량 추적 시스템 설명
- `QUOTA-AUTO-SWITCH.md`: 자동 전환 정책
- `AZURE-CONSUMPTION-API-INTEGRATION.md`: Azure API 통합

---

**작성일**: 2026-01-23
**버전**: v1.0
**대상**: 유료 API 사용량이 0으로 표시되는 문제 진단 및 해결
