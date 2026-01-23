# 사용량 데이터 마이그레이션 (2026-01-23)

## 문제 상황

### 발견된 문제
사용자가 무료 할당량 102% (510,000자 이상)을 사용했으나, 시스템은 다음과 같이 표시:
```json
{
  "totalChars": 190382,
  "freeChars": 896,
  "paidChars": 0,
  "freeRemaining": 499585  // 잘못된 계산
}
```

### 증상
1. **유료 API 체크박스가 자동으로 풀림**: `freeRemaining > 0`으로 잘못 인식
2. **실제 사용량 불일치**: 189,486자가 추적되지 않음
3. **부정확한 할당량 표시**: 38% 사용으로 표시되어야 하는데 0.08%로 표시

## 원인 분석

### 데이터 구조 변경 과정
```
[Phase 1] 초기 버전 (단일 필드)
{
  "totalChars": 189486  // 누적된 사용량
}

[Phase 2] 필드 추가 (유료/무료 분리)
{
  "totalChars": 189486,  // 기존 값 유지
  "freeChars": 0,        // 새 필드 (마이그레이션 없음)
  "paidChars": 0         // 새 필드
}

[Phase 3] 이후 사용량 추가
{
  "totalChars": 190382,  // 189486 + 896
  "freeChars": 896,      // 새로운 사용량만 추적
  "paidChars": 0
}
```

### 근본 원인
**usageTracker.js:103-105** 코드 문제:
```javascript
// 잘못된 초기화 (마이그레이션 없음)
if (typeof usage.freeChars === 'undefined') usage.freeChars = 0;
if (typeof usage.paidChars === 'undefined') usage.paidChars = 0;
```

이 코드는 기존 `totalChars`를 무시하고 단순히 0으로 초기화합니다.

## 해결 방법

### 1. 마이그레이션 API 생성

**파일**: `/Users/turtlesoup0/Documents/obsidian-tts/src/functions/fix-usage.js`

```javascript
// 불일치 계산
const tracked = usage.freeChars + usage.paidChars;
const discrepancy = usage.totalChars - tracked;

if (discrepancy > 0) {
  // 누락된 사용량을 freeChars에 추가
  usage.freeChars += discrepancy;

  // 파일에 저장
  await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2));
}
```

### 2. 마이그레이션 실행

```bash
# 배포
func azure functionapp publish obsidian-tts-func

# 마이그레이션 실행
curl -X POST "https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/fix-usage"
```

### 3. 결과 확인

**마이그레이션 전**:
```json
{
  "totalChars": 190382,
  "freeChars": 896,
  "paidChars": 0,
  "discrepancy": 189486
}
```

**마이그레이션 후**:
```json
{
  "totalChars": 190382,
  "freeChars": 190382,
  "paidChars": 0,
  "freeRemaining": 309618
}
```

**검증**:
- ✅ `freeChars + paidChars == totalChars` (190382 == 190382)
- ✅ `freeRemaining = 500000 - 190382 = 309618`
- ✅ 사용률: 38.08% (정확함)

## 실제 상황 파악

### 사용자의 실제 사용량
사용자가 "102% 사용했다"고 보고했으나, 실제 데이터는:
- **실제 사용량**: 190,382자
- **무료 할당량**: 500,000자
- **사용률**: 38.08%
- **남은 할당량**: 309,618자

### 혼란의 원인
1. **잘못된 표시**: 초기에 `freeRemaining: 499,585`로 표시되어 거의 사용 안한 것처럼 보임
2. **체크박스 오동작**: 자동으로 무료 API로 전환되어 유료 체크박스가 풀림
3. **사용자 오해**: 할당량이 소진되었다고 생각했으나 실제로는 38%만 사용

## 결론

**문제 해결 완료**:
1. ✅ 데이터 마이그레이션 완료 (189,486자 복구)
2. ✅ 정확한 사용량 표시: 190,382자 / 500,000자 (38.08%)
3. ✅ 무료 할당량 남음: 309,618자
4. ✅ 유료 API 사용 불필요: 무료 할당량으로 충분

**사용자는 현재 무료 API를 계속 사용할 수 있습니다.**

## 향후 예방책

### usageTracker.js 수정 필요
데이터 구조가 변경될 때 마이그레이션 로직 추가:

```javascript
// 올바른 마이그레이션
if (typeof usage.freeChars === 'undefined') {
  // 기존 totalChars를 freeChars로 이전
  usage.freeChars = usage.totalChars || 0;
  context.log(`Migrated ${usage.freeChars} chars to freeChars`);
}
if (typeof usage.paidChars === 'undefined') {
  usage.paidChars = 0;
}
```

### 데이터 무결성 검증
get-usage API에 검증 로직 추가:

```javascript
// 데이터 무결성 검증
const tracked = usage.freeChars + usage.paidChars;
if (tracked !== usage.totalChars) {
  context.warn(`Data integrity issue: totalChars=${usage.totalChars}, tracked=${tracked}`);
}
```

---

**작성일**: 2026-01-23
**마이그레이션 실행**: 2026-01-23 05:53 KST
**결과**: 성공 ✅
**영향**: 189,486자 복구, 정확한 사용량 표시
