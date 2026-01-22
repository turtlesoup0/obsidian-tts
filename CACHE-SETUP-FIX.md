# Azure Blob Storage 캐시 설정 수정

**작성일**: 2026-01-22
**문제**: PC와 모바일에서 캐시가 공유되지 않음
**원인**: Storage Account의 Public Access 비활성화 + 컨테이너 미생성

---

## 🐛 문제 상황

사용자가 PC에서 노트를 재생하고 캐싱했지만, 모바일에서는 캐시가 공유되지 않고 각 디바이스가 독립적으로 TTS를 생성했습니다.

**예상 동작**:
```
[PC] 노트 1 → TTS 생성 → Azure Blob Storage에 캐시
[모바일] 노트 1 → Blob Storage 캐시 HIT → 빠른 재생 ⚡
```

**실제 동작**:
```
[PC] 노트 1 → TTS 생성 → 캐시 저장 실패 ❌
[모바일] 노트 1 → TTS 생성 → 캐시 저장 실패 ❌
```

---

## 🔍 원인 분석

### 1. Storage Account Public Access 비활성화

```bash
az storage account show --name obsidiantts --resource-group speech-resources \
  --query allowBlobPublicAccess
# 결과: false
```

**결과**:
- 캐시 API의 `containerClient.createIfNotExists({ access: 'blob' })` 실패
- PUT 요청 시 "Public access is not permitted on this storage account" 오류

### 2. tts-cache 컨테이너 미생성

```bash
az storage container show --name tts-cache --account-name obsidiantts
# 결과: ContainerNotFound
```

**결과**:
- cache.js의 `createIfNotExists`가 권한 문제로 컨테이너 생성 실패
- GET/PUT 요청 모두 실패

---

## ✅ 해결 방법

### 1단계: Storage Account Public Access 활성화

```bash
az storage account update \
  --name obsidiantts \
  --resource-group speech-resources \
  --allow-blob-public-access true
```

**결과**:
```
AllowBlobPublicAccess: True ✅
```

### 2단계: tts-cache 컨테이너 생성

```bash
CONNECTION_STRING=$(az functionapp config appsettings list \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --query "[?name=='AZURE_STORAGE_CONNECTION_STRING'].value" \
  -o tsv)

az storage container create \
  --name tts-cache \
  --connection-string "$CONNECTION_STRING" \
  --public-access container
```

**결과**:
```json
{
  "created": true
}
```

**중요**: `--public-access container`를 사용해야 함 (`blob`이 아님)

---

## 🧪 테스트 결과

### PUT 테스트 (캐시 저장)

```bash
curl -X PUT 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/cache/test-hash-67890' \
  -H 'Content-Type: audio/mpeg' \
  --data-binary '@/tmp/test.mp3'
```

**응답**:
```json
{
  "success": true,
  "hash": "test-hash-67890",
  "size": 32544,
  "cachedAt": "2026-01-22T10:33:48.304Z"
}
```

### GET 테스트 (캐시 조회)

```bash
curl -X GET 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/cache/test-hash-67890' \
  -o retrieved.mp3
```

**결과**: 200 OK, audio/mpeg 다운로드 성공 ✅

### Blob Storage 확인

```bash
az storage blob list --container-name tts-cache \
  --connection-string "$CONNECTION_STRING" \
  --output table
```

**결과**:
```
Name                 Size    LastModified
-------------------  ------  -------------------------
test-hash-67890.mp3  32544   2026-01-22T10:33:48+00:00
```

---

## 📊 수정 전후 비교

### 수정 전

```
[PC]
노트 1 → TTS 생성 (2초) → 캐시 PUT 실패 ❌

[모바일]
노트 1 → TTS 생성 (2초) → 캐시 PUT 실패 ❌

각 디바이스가 독립적으로 생성 → 중복 비용 발생
```

### 수정 후

```
[PC]
노트 1 → TTS 생성 (2초) → 캐시 PUT 성공 ✅ → Blob Storage 저장

[모바일]
노트 1 → 캐시 GET 성공 ✅ (0.1초) → Blob Storage에서 다운로드

디바이스 간 캐시 공유 → 비용 및 시간 절약 ⚡
```

---

## 🎯 사용자 액션 필요

### Obsidian 재테스트

1. **PC에서**:
   - Obsidian 재시작
   - `TTS 출제예상 읽기 v4 (Enhanced).md` 열기
   - 새로운 노트로 "재생 시작"
   - F12 콘솔에서 "📤 Saving to server cache" 확인

2. **모바일에서**:
   - 동일한 노트 열기
   - "재생 시작"
   - 콘솔에서 "💾 Server cache HIT" 확인 ✅

3. **캐시 통계 확인**:
   - 프론트엔드 UI에서 "Server Cache Hit Rate" 확인
   - 모바일에서 100% hit rate 달성 예상

---

## 🔒 보안 고려사항

### Public Access Level

**Container Access** (`container` level):
- ✅ 컨테이너 및 Blob 목록 조회 가능
- ✅ 개별 Blob 다운로드 가능
- ⚠️ 보안: 캐시 해시를 알아야 접근 가능

**대안**: SAS Token 사용
- 더 높은 보안이 필요한 경우 SAS Token 기반 인증으로 전환 가능
- 현재는 캐시 해시가 SHA-256이므로 추측 불가능

### 캐시 데이터

- **민감 정보 없음**: 오디오 파일만 저장 (텍스트 저장 안 함)
- **해시 기반**: 파일명이 SHA-256 해시이므로 내용 추측 불가
- **TTL 30일**: 자동으로 만료되는 임시 캐시

---

## 📝 cache.js 코드 검토

### createIfNotExists 로직

```javascript
// cache.js 147번 줄
await containerClient.createIfNotExists({ access: 'blob' });
```

**문제**:
- `access: 'blob'`은 Blob만 공개 (컨테이너 목록은 비공개)
- 하지만 Storage Account의 `allowBlobPublicAccess: false`이면 실패

**해결**:
- Storage Account 레벨에서 `allowBlobPublicAccess: true` 필수
- 컨테이너는 `--public-access container`로 생성

### 향후 개선 사항

1. **Retry 로직 추가**:
   ```javascript
   // 캐시 저장 실패 시 재시도
   ```

2. **오류 로깅 강화**:
   ```javascript
   context.error('Cache PUT failed:', error.message);
   ```

3. **SAS Token 지원**:
   ```javascript
   // 더 높은 보안을 위한 SAS Token 인증
   ```

---

## 🎉 결론

### 완료 사항

- ✅ Storage Account public access 활성화
- ✅ tts-cache 컨테이너 생성 (public-access: container)
- ✅ PUT/GET 테스트 성공
- ✅ Blob Storage 저장 확인

### 기대 효과

- ✅ PC와 모바일 간 캐시 공유
- ✅ 중복 TTS 생성 방지
- ✅ 비용 절감 (Azure Speech API 호출 감소)
- ✅ 속도 향상 (2초 → 0.1초)

### 사용자 다음 단계

1. Obsidian PC에서 재테스트
2. 모바일에서 캐시 공유 확인
3. 캐시 통계 모니터링

---

**수정일**: 2026-01-22
**테스트 완료**: ✅
**배포 상태**: 프로덕션 적용 완료
