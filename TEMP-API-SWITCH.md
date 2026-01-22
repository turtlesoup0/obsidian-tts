# 임시 유료 API 전환 가이드

## 현재 상태

무료 사용량이 소진되어 임시로 유료 S0 리소스로 전환했습니다.

### 리소스 정보

**임시 유료 리소스** (현재 사용 중):
- 이름: `obsidian-tts-paid-temp`
- SKU: S0 (유료)
- 비용:
  - Neural TTS: $16 per 1M characters
  - 즉, 1,000자당 약 $0.016 (약 20원)
- 위치: koreacentral

**원래 무료 리소스**:
- 이름: `obsidian-tts`
- SKU: F0 (무료)
- 월 할당량: 500,000자
- 원래 키 (앞 10자): `DKSJfXU1Ll...` (전체 키는 `/tmp/original-speech-key.txt`에 백업됨)

### 환경 변수 설정됨

Azure Functions의 `AZURE_SPEECH_KEY`가 임시 유료 키로 업데이트되었습니다.

## 캐싱 완료 후 복구 방법

### 1단계: 원래 무료 키 확인

\`\`\`bash
# 백업된 키 확인
cat /tmp/original-speech-key.txt

# 또는 직접 조회
az cognitiveservices account keys list \
  --name obsidian-tts \
  --resource-group speech-resources \
  --query "key1" -o tsv
\`\`\`

### 2단계: Azure Functions 환경 변수 복구 (간편 명령어)

\`\`\`bash
# 백업된 키로 자동 복구
ORIGINAL_KEY=$(cat /tmp/original-speech-key.txt)
az functionapp config appsettings set \
  --name obsidian-tts-func-hwh0ffhneka3dtaa \
  --resource-group speech-resources \
  --settings "AZURE_SPEECH_KEY=$ORIGINAL_KEY"

echo "✅ 무료 API로 복구 완료!"
\`\`\`

### 3단계: 임시 유료 리소스 삭제 (선택사항)

캐싱이 완료되고 더 이상 필요 없다면:

\`\`\`bash
az cognitiveservices account delete \
  --name obsidian-tts-paid-temp \
  --resource-group speech-resources
\`\`\`

**주의**: 삭제 후 30일간 soft-delete 상태로 유지되며, 이 기간 동안에도 약간의 비용이 발생할 수 있습니다.

## 예상 비용 계산

100개 노트를 캐싱할 경우:
- 평균 노트 길이: 200자
- 총 문자 수: 20,000자
- 예상 비용: 20,000 × $0.000016 = **$0.32** (약 420원)

이미 캐시된 노트는 서버 캐시나 오프라인 캐시에서 로드되므로 추가 비용이 발생하지 않습니다.

## 현재 캐시 상태 확인

\`\`\`bash
# 서버 캐시 확인
curl https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/cache-stats
\`\`\`

## 다음 달 무료 할당량 갱신

무료 F0 리소스의 50만 자 할당량은 **매월 1일 00:00 UTC**에 자동으로 리셋됩니다.

---

**작성일**: 2026-01-23
**임시 전환 이유**: 캐싱 작업 완료를 위해
**복구 예정일**: 캐싱 완료 즉시 또는 2026-02-01 (무료 할당량 리셋 시)
