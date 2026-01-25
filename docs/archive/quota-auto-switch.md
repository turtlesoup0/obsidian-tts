# 할당량 기반 자동 API 전환

## 개요

무료 API 할당량이 소진되었을 때 자동으로 유료 API로 전환하여 서비스 중단 없이 계속 사용할 수 있도록 합니다.

## 문제 상황

### 기존 문제
1. **무료 할당량 소진**: 월 50만 자 초과 시 500 에러 발생
2. **초기 로딩 문제**: 페이지 로드 시 사용량 확인 전에 재생 시도 시 실패
3. **수동 전환 필요**: 사용자가 직접 체크박스를 체크해야 함
4. **불명확한 에러 메시지**: "Speech synthesis failed"만 표시

### 영향
- 사용자가 노트를 재생하려고 할 때 실패
- 무료 할당량 소진 사실을 모르면 계속 실패
- 매번 수동으로 유료 API 체크박스를 선택해야 함

## 구현된 해결책

### 1. 초기 로딩 시 자동 전환

**프론트엔드 (v4 노트):**
```javascript
// 페이지 로드 시 즉시 실행
(async () => {
    const backendData = await window.fetchUsageFromBackend();
    if (backendData && backendData.freeRemaining <= 0) {
        console.log('⚠️ 무료 할당량 소진 - 유료 API로 자동 전환');
        window.apiKeyConfig.usePaidApi = true;
        localStorage.setItem('azureTTS_usePaidApi', 'true');
    }
    await window.updateUsageDisplay();
})();
```

**동작 흐름:**
1. 페이지 로드
2. 즉시 사용량 API 호출 (`/api/usage`)
3. `freeRemaining <= 0` 확인
4. 조건 충족 시 자동으로 `usePaidApi = true` 설정
5. localStorage에 저장 (다음 로드에도 유지)
6. 사용량 UI 업데이트 (체크박스 자동 체크)

### 2. 명확한 에러 메시지

**프론트엔드:**
```javascript
catch (error) {
    // 500 에러는 할당량 초과일 가능성이 높음
    if (error.message.includes('500')) {
        const apiMode = window.apiKeyConfig.usePaidApi ? '유료' : '무료';
        throw new Error(`${apiMode} API 오류 (할당량 초과 가능성): ${error.message}`);
    }
    throw error;
}
```

**백엔드:**
```javascript
catch (error) {
    let errorMessage = 'Speech synthesis failed';
    let isQuotaExceeded = false;

    if (error.message.includes('quota') ||
        error.message.includes('429') ||
        error.message.includes('limit')) {
        errorMessage = 'API quota exceeded';
        isQuotaExceeded = true;
    }

    context.res = {
        status: isQuotaExceeded ? 429 : 500,
        body: {
            error: errorMessage,
            quotaExceeded: isQuotaExceeded
        }
    };
}
```

### 3. 다음 달 자동 복구

**usageTracker.js:**
```javascript
async function readUsage() {
    const usage = JSON.parse(data);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 월이 바뀌면 자동 리셋
    if (usage.currentMonth !== currentMonth) {
        usage.history.push({
            month: usage.currentMonth,
            totalChars: usage.totalChars,
            freeChars: usage.freeChars,
            paidChars: usage.paidChars
        });
        usage.totalChars = 0;
        usage.freeChars = 0;
        usage.paidChars = 0;
        usage.currentMonth = currentMonth;
    }
    return usage;
}
```

**프론트엔드 (updateUsageDisplay):**
```javascript
// 무료 할당량이 복구되면 자동으로 무료 API로 전환
if (freeRemaining > 0 && window.apiKeyConfig.usePaidApi) {
    window.apiKeyConfig.usePaidApi = false;
    localStorage.setItem('azureTTS_usePaidApi', 'false');
    console.log('🔄 무료 할당량 복구됨 - 무료 API로 자동 전환');
}
```

## 사용 시나리오

### 시나리오 1: 초기 로딩 (할당량 95% 사용)

```
[사용자] 페이지 열기
    ↓
[시스템] Azure 사용량 조회: 475,257자 / 500,000자 (95%)
    ↓
[시스템] 경고 표시: "⚠️ 무료 할당량 부족 (95.1%)"
    ↓
[UI] "⚠️ 무료 할당량 부족 (95.1%)" 경고 박스 표시
    ↓
[UI] 체크박스: ☐ 유료 API 사용 (수동 선택 대기)
    ↓
[사용자] 수동으로 체크박스 선택: ☑ 유료 API 사용
    ↓
[시스템] 유료 API 키로 TTS 호출 → ✅ 성공
```

### 시나리오 2: 재생 중 할당량 소진

```
[사용자] 무료 API로 노트 재생 중
    ↓
[시스템] 50만 자 도달 → 다음 노트 재생 시도
    ↓
[백엔드] 429 Quota Exceeded 에러 반환
    ↓
[UI] "무료 API 오류 (할당량 초과 가능성)" 표시
    ↓
[사용자] 수동으로 "유료 API 사용" 체크박스 선택
    ↓
[사용자] 재생 버튼 재클릭 → ✅ 유료 API로 성공
```

### 시나리오 3: 다음 달 (2026-02-01)

```
[시스템] 날짜 변경 감지: 2026-01 → 2026-02
    ↓
[usageTracker] 자동 리셋:
    - history에 1월 데이터 저장
    - freeChars = 0
    - paidChars = 0
    - currentMonth = "2026-02"
    ↓
[사용자] 페이지 열기
    ↓
[시스템] 사용량 조회: freeRemaining = 500,000
    ↓
[시스템] 자동 복구: usePaidApi = false
    ↓
[UI] "🆓 무료 API 사용 중 (F0)" 표시
    ↓
[UI] 체크박스 자동 해제: ☐ 유료 API 사용
    ↓
[콘솔] "🔄 무료 할당량 복구됨 - 무료 API로 자동 전환"
```

## UI 표시

### 무료 할당량 소진 시
```
📊 API 사용량 (이번 달) ✓ 서버 동기화
💳 유료 API 사용 중 (S0)  ☑ 유료 API 사용

🆓 무료: 500,000자 / 500,000자 (100%)
💳 유료: 15,000자
전체: 515,000자

남은 무료 사용량: 0자 ⚠️
마지막 업데이트: 2026. 1. 23. 오전 5:40:00
```

### 무료 할당량 복구 시
```
📊 API 사용량 (이번 달) ✓ 서버 동기화
🆓 무료 API 사용 중 (F0)  ☐ 유료 API 사용

🆓 무료: 0자 / 500,000자 (0%)

남은 무료 사용량: 500,000자 ✅
마지막 업데이트: 2026. 2. 1. 오전 12:01:00
```

## 에러 메시지

### 기존
```
❌ TTS 오류: API 오류 (500): Speech synthesis failed
```

### 개선
```
❌ TTS 오류: 무료 API 오류 (할당량 초과 가능성): API 오류 (500)
💡 유료 API 사용 체크박스를 선택하거나 페이지를 새로고침하세요.
```

## 환경 변수

백엔드 Azure Functions 환경 변수는 무료 API 키로 설정:
```bash
AZURE_SPEECH_KEY=<your-free-tier-key-here>
```

프론트엔드에서 헤더로 유료 API 키를 전달하면 그것을 우선 사용:
```javascript
headers: {
    'X-Azure-Speech-Key': window.apiKeyConfig.usePaidApi ?
        window.apiKeyConfig.paidKey :
        null  // null이면 백엔드 환경 변수 사용
}
```

## 모니터링

### 브라우저 콘솔
```javascript
// 자동 전환 로그
⚠️ 무료 할당량 소진 - 유료 API로 자동 전환

// 자동 복구 로그
🔄 무료 할당량 복구됨 - 무료 API로 자동 전환

// 현재 API 모드 확인
console.log('API Mode:', window.apiKeyConfig.usePaidApi ? 'Paid' : 'Free');

// 사용량 확인
const usage = await window.fetchUsageFromBackend();
console.log('Free remaining:', usage.freeRemaining);
```

### Azure Functions 로그
```
Using API key from: header, Key prefix: 8oO5DXpYVV...
Usage tracked: 15 chars (paid)

Using API key from: environment, Key prefix: DKSJfXU1Ll...
TTS Error: Quota exceeded
```

## 장점

1. **무중단 서비스**: 할당량 소진되어도 자동으로 유료 API로 전환
2. **사용자 편의성**: 수동 체크박스 선택 불필요
3. **비용 최적화**: 무료 할당량 복구 시 자동으로 무료 API로 복원
4. **명확한 피드백**: 할당량 초과 시 명확한 메시지 표시

## 제한사항

1. **초기 로딩 필요**: 페이지를 한 번은 새로고침해야 자동 전환 적용
2. **로컬 상태**: localStorage 기반이므로 브라우저 캐시 삭제 시 초기화
3. **백엔드 의존**: 사용량 API가 응답하지 않으면 자동 전환 불가

## 문제 해결

### Q: 페이지를 새로고침했는데도 여전히 500 에러가 나요
**A**:
1. 브라우저 개발자 도구(F12) → Console 확인
2. "⚠️ 무료 할당량 소진 - 유료 API로 자동 전환" 로그 확인
3. 로그가 없으면 사용량 API 응답 확인: `await window.fetchUsageFromBackend()`
4. 수동으로 체크박스 선택: ☑ 유료 API 사용

### Q: 다음 달인데도 여전히 유료 API를 사용해요
**A**:
1. 서버 시간대가 UTC인지 확인
2. 사용량 API 응답 확인: `currentMonth` 필드
3. 수동으로 localStorage 초기화:
   ```javascript
   localStorage.removeItem('azureTTS_usePaidApi')
   window.location.reload()
   ```

### Q: 자동 전환이 작동하지 않아요
**A**:
1. 네트워크 탭에서 `/api/usage` 호출 확인
2. 응답에 `freeRemaining` 필드가 있는지 확인
3. 브라우저 콘솔에서 수동 실행:
   ```javascript
   window.apiKeyConfig.usePaidApi = true
   localStorage.setItem('azureTTS_usePaidApi', 'true')
   await window.updateUsageDisplay()
   ```

### Q: 유료 API 체크박스가 자동으로 풀려요
**A**: v1.1 이전 버전의 버그입니다. `freeRemaining` 대신 `totalChars`를 기준으로 판단하도록 수정되었습니다.

**문제 원인**:
- 기존 로직: `freeRemaining > 0`이면 무료 API로 자동 전환
- 데이터 불일치: `totalChars: 189,901`인데 `freeChars: 415`, `paidChars: 0`
- 결과: `freeRemaining = 499,585`로 계산되어 잘못된 자동 전환 발생

**수정 내용** (v1.1):
```javascript
// 기존 (v1.0)
if (freeRemaining > 0 && window.apiKeyConfig.usePaidApi) {
    // 무료 API로 전환 (잘못된 판단)
}

// 수정 (v1.1)
const totalUsed = totalChars || (freeChars + paidChars);
if (totalUsed < freeLimit && window.apiKeyConfig.usePaidApi) {
    // totalChars 기반으로 정확하게 판단
}
```

**해결**:
1. v4 노트를 최신 버전으로 업데이트
2. 페이지 새로고침
3. 브라우저 콘솔에서 확인: `totalUsed` 값이 500,000보다 크면 유료 API 유지

---

---

**작성일**: 2026-01-23
**버전**: v2.1
**주요 변경사항**:
- Azure Consumption API 통합 (실제 Azure 사용량 조회)
- 자동 전환 정책 변경:
  - ❌ 유료 API로 자동 전환 제거 (비용 발생 위험)
  - ✅ 무료 API로 자동 복구 (10% 미만, 월 초만)
  - ✅ 경고 메시지 표시 (90% 이상 시)
- 로컬 추적 신뢰도 문제 해결

**자동 전환 정책**:
- **유료로 전환**: ❌ 자동 전환 없음 (사용자가 수동으로 선택)
- **무료로 복구**: ✅ 자동 전환 (월 초 할당량 리셋 시만, 10% 미만)

**테스트 완료**:
- 유료 자동 전환 제거 ✅ (사용자 수동 선택)
- 무료 자동 복구 ✅ (10% 임계값, 월 초만)
- 에러 메시지 개선 ✅
- Azure 실제 사용량 조회 ✅
- UI 경고 표시 ✅
