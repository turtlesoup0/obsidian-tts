# Azure Consumption API 통합

## 문제: 로컬 추적의 심각한 부정확성

### 발견된 데이터 불일치
| 출처 | 사용량 | 차이 |
|------|--------|------|
| **로컬 추적** | 190,382자 (38.08%) | 기준 |
| **Azure 실제** | 475,257자 (95.05%) | **+284,875자 누락** ❌ |

**결론**: 로컬 추적은 **실제 사용량의 40%만 추적**하고 있어 신뢰할 수 없습니다.

## 해결: Azure Consumption API

### Azure Consumption API 특징

**장점**:
- ✅ Azure 공식 사용량 데이터 (신뢰도 100%)
- ✅ 모든 디바이스에서 동일한 데이터 조회
- ✅ 일별 세분화된 사용량
- ✅ 무료 API (조회 비용 없음)
- ✅ REST API로 직접 호출 가능

**단점**:
- ❌ 24~48시간 지연: 당일 사용량은 다음 날에야 확인 가능
- ❌ 인증 필요: Azure AD 토큰 필요

### 실제 사용량 확인 (2026-01-23 기준)

```bash
2026-01-19: 18,026자
2026-01-20: 57,339자
2026-01-21: 25,417자
2026-01-22: 374,475자
─────────────────────
총합: 475,257자 / 500,000자 (95.05%)
남은 할당량: 24,743자
```

**중요**: 사용자는 **무료 할당량의 95%를 이미 사용**했으며, **24,743자만 남아있습니다**.

## 구현

### 1. 새로운 API 엔드포인트

**파일**: `src/functions/get-azure-usage.js`

**엔드포인트**: `GET /api/azure-usage`

**응답 예시**:
```json
{
  "source": "azure-consumption-api",
  "totalChars": 475257,
  "freeChars": 475257,
  "paidChars": 0,
  "currentMonth": "2026-01",
  "freeLimit": 500000,
  "freePercentage": "95.05",
  "freeRemaining": 24743,
  "dailyUsage": {
    "2026-01-19": 18026,
    "2026-01-20": 57339,
    "2026-01-21": 25417,
    "2026-01-22": 374475
  },
  "dataDelay": "24-48 hours",
  "note": "Azure Consumption API has 24-48 hour delay. Today's usage may not be reflected yet."
}
```

### 2. Managed Identity 설정

Azure Function App에서 Managed Identity를 활성화하고 구독에 대한 Reader 권한을 부여해야 합니다.

**단계**:

#### Step 1: Managed Identity 활성화
```bash
az functionapp identity assign \
  --name obsidian-tts-func \
  --resource-group speech-resources
```

출력에서 `principalId`를 복사합니다.

#### Step 2: Reader 역할 할당
```bash
PRINCIPAL_ID="<위에서 복사한 principalId>"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Reader" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"
```

#### Step 3: 환경 변수 설정
```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

az functionapp config appsettings set \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --settings \
    "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID" \
    "COGNITIVE_SERVICES_RESOURCE_ID=/subscriptions/$SUBSCRIPTION_ID/resourceGroups/speech-resources/providers/Microsoft.CognitiveServices/accounts/obsidian-tts"
```

### 3. 배포

```bash
cd /Users/turtlesoup0/Documents/obsidian-tts
func azure functionapp publish obsidian-tts-func
```

### 4. 테스트

```bash
curl "https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/azure-usage" | jq .
```

## 하이브리드 접근: 로컬 + Azure

### 전략

1. **Azure Consumption API (신뢰도 높음)**:
   - 24~48시간 지연된 정확한 데이터
   - 일별 사용량 제공

2. **로컬 추적 (실시간)**:
   - 오늘 사용량 실시간 추적
   - Azure 데이터와 결합하여 보정

### 구현 아이디어

```javascript
async function getCombinedUsage() {
  // 1. Azure에서 지난 데이터 가져오기 (D-2까지)
  const azureUsage = await getAzureConsumptionUsage();
  const yesterdayTotal = azureUsage.totalChars;

  // 2. 오늘 로컬 추적 데이터
  const localToday = await getLocalUsageToday();

  // 3. 결합
  const estimatedTotal = yesterdayTotal + localToday;

  return {
    confirmed: yesterdayTotal,  // Azure 확인된 사용량
    todayEstimate: localToday,  // 오늘 예상 사용량 (로컬)
    totalEstimate: estimatedTotal,
    note: "Today's usage is estimated from local tracking and may be inaccurate"
  };
}
```

## 데이터 지연 문제 해결

### 옵션 1: 로컬 보정 방식
- Azure 데이터를 기준으로 로컬 추적 오차 계산
- 오차율을 적용하여 오늘 사용량 보정

### 옵션 2: 당일 사용량 무시
- Azure 확인된 사용량만 표시
- "오늘 사용량은 내일 확인 가능"이라고 안내

### 옵션 3: 두 가지 모두 표시
```
📊 API 사용량

✅ Azure 확인된 사용량 (1/22까지): 475,257자 / 500,000자 (95.05%)
⏱️ 오늘 예상 사용량 (로컬 추적): 481자
📈 총 예상: 475,738자 / 500,000자 (95.15%)

⚠️ 오늘 사용량은 내일 Azure에서 확인 가능합니다.
```

## 비용 및 제한

### Consumption API 호출 비용
- **무료**: Consumption API 조회는 무료입니다

### API 제한
- **Rate Limit**: 분당 100회 호출
- **데이터 지연**: 24~48시간
- **데이터 보관**: 13개월

## 추천 구현

### 단기 (즉시 적용)
1. ✅ Azure Consumption API 통합
2. ✅ Managed Identity 설정
3. ✅ 새 `/api/azure-usage` 엔드포인트 배포
4. ⚠️ **사용자에게 실제 95% 사용 알림**

### 중기 (다음 주)
1. 하이브리드 모드: Azure + 로컬 추적 결합
2. 오차율 계산 및 보정
3. 프론트엔드에 두 가지 모두 표시

### 장기 (다음 달)
1. 로컬 추적 완전 폐기
2. Azure Consumption API만 사용
3. "오늘 사용량은 내일 확인" 방식 수용

## 결론

**중요한 발견**:
- 로컬 추적은 **284,875자 (56%)를 누락**했습니다
- 실제 사용량은 **475,257자 (95.05%)**입니다
- **24,743자만 남아있어** 거의 할당량을 다 사용했습니다

**즉시 조치 필요**:
1. Azure Consumption API 통합 배포
2. 사용자에게 실제 사용량 알림
3. 유료 API로 전환 또는 사용 제한 필요

---

**작성일**: 2026-01-23
**버전**: v2.0
**변경사항**: Azure Consumption API 통합, 로컬 추적 신뢰도 문제 발견
**실제 사용량**: 475,257자 / 500,000자 (95.05%) ⚠️
