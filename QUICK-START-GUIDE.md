# 🚀 Obsidian TTS 빠른 시작 가이드

> 5분 안에 Obsidian에서 TTS 기능을 사용할 수 있습니다!

## 📋 목차
1. [사전 요구사항](#사전-요구사항)
2. [백엔드 배포 (Azure)](#백엔드-배포)
3. [Obsidian 설정](#obsidian-설정)
4. [첫 TTS 노트 만들기](#첫-tts-노트-만들기)
5. [문제 해결](#문제-해결)

---

## 사전 요구사항

### ✅ 필수 항목
- [ ] [Obsidian](https://obsidian.md/) 설치됨
- [ ] [Dataview 플러그인](https://github.com/blacksmithgu/obsidian-dataview) 설치됨
- [ ] Azure 계정 (무료 계정도 가능)
- [ ] Node.js 18.x 이상 설치됨

### 📦 Dataview 플러그인 설치
1. Obsidian 설정 → Community plugins
2. "Browse" 클릭
3. "Dataview" 검색 후 설치
4. "Enable" 클릭

---

## 백엔드 배포

### 1. Azure Function App 생성

```bash
# Azure CLI 로그인
az login

# Resource Group 생성
az group create --name obsidian-tts-rg --location koreacentral

# Storage Account 생성
az storage account create \
  --name obsidiantts \
  --resource-group obsidian-tts-rg \
  --location koreacentral \
  --sku Standard_LRS

# Function App 생성
az functionapp create \
  --resource-group obsidian-tts-rg \
  --consumption-plan-location koreacentral \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name obsidian-tts-func \
  --storage-account obsidiantts
```

### 2. Azure Speech Service 생성

```bash
# Speech Service 생성 (무료 티어)
az cognitiveservices account create \
  --name obsidian-tts-speech \
  --resource-group obsidian-tts-rg \
  --kind SpeechServices \
  --sku F0 \
  --location koreacentral

# 키 가져오기
az cognitiveservices account keys list \
  --name obsidian-tts-speech \
  --resource-group obsidian-tts-rg
```

출력된 `key1`을 복사해두세요.

### 3. 프로젝트 배포

```bash
# 프로젝트 클론
git clone https://github.com/turtlesoup0/obsidian-tts.git
cd obsidian-tts

# 의존성 설치
npm install

# Azure Function에 배포
npm run deploy

# 환경 변수 설정
az functionapp config appsettings set \
  --name obsidian-tts-func \
  --resource-group obsidian-tts-rg \
  --settings \
    "AZURE_SPEECH_KEY=<위에서 복사한 키>" \
    "AZURE_SPEECH_REGION=koreacentral"
```

### 4. Function URL 확인

```bash
# Function App URL 확인
az functionapp show \
  --name obsidian-tts-func \
  --resource-group obsidian-tts-rg \
  --query defaultHostName \
  --output tsv
```

출력: `obsidian-tts-func.azurewebsites.net`

---

## Obsidian 설정

### 방법 1: 자동 설정 스크립트 (추천)

1. Obsidian vault에서 터미널 열기
2. 다음 명령 실행:

```bash
# 설정 스크립트 다운로드 및 실행
curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh
chmod +x setup-obsidian.sh
./setup-obsidian.sh
```

3. 스크립트가 물어보는 질문에 답하기:
   - Azure Function URL: `https://obsidian-tts-func.azurewebsites.net`
   - 노트 경로: 예) `1_Project/Study`

### 방법 2: 수동 설정

1. Obsidian vault 루트에 `obsidian-tts-config.md` 파일 생성
2. 다음 내용 복사:

```markdown
---
해시태그: "#tts-config"
---

> 🔧 Obsidian TTS 설정 파일
> 이 노트는 git에 업로드되지 않습니다

# 설정

\`\`\`dataviewjs
window.ObsidianTTSConfig = {
    azureFunctionUrl: 'https://obsidian-tts-func.azurewebsites.net',
    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    scrollPositionEndpoint: '/api/scroll-position',

    // 기본 TTS 설정
    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    defaultPitch: 0,
    defaultVolume: 100,

    // 노트 경로 (vault 루트 기준 상대 경로)
    notesPath: '1_Project/Study',

    // 캐시 설정
    enableOfflineCache: true,
    cacheTtlDays: 30,

    // 디버그
    debugMode: false
};

console.log('✅ Obsidian TTS Config loaded:', window.ObsidianTTSConfig);
\`\`\`
```

---

## 첫 TTS 노트 만들기

### 1. 샘플 노트 복사

```bash
# Obsidian vault에서 실행
cd /Users/turtlesoup0/Documents/obsidian-tts
cp templates/sample-tts-note.md "Your-Vault-Path/My First TTS Note.md"
```

또는 직접 생성:

1. Obsidian에서 새 노트 생성
2. 다음 내용 복사:

```markdown
---
정의: TTS는 텍스트를 음성으로 변환하는 기술입니다
키워드: ["TTS", "음성합성", "Azure"]
---

# My First TTS Note

**TTS (Text-to-Speech)**는 텍스트를 자연스러운 음성으로 변환하는 기술입니다.

## 주요 특징
- **고품질 음성**: Azure Neural Voice 사용
- **볼드 강조**: 볼드 텍스트는 음성에서도 강조됩니다
- **빠른 변환**: 캐싱으로 재생성 불필요

## 테스트 문장
이 문장을 들어보세요. **중요한 부분**은 강조되어 읽힙니다.
```

### 2. TTS 리더 노트 생성

```bash
cp templates/tts-reader.md "Your-Vault-Path/TTS Reader.md"
```

또는 [TTS-V4-FRONTEND-TEMPLATE.md](TTS-V4-FRONTEND-TEMPLATE.md)의 내용을 복사하여 새 노트로 생성하세요.

### 3. 재생 테스트

1. `TTS Reader.md` 노트 열기
2. 노트 목록에서 `My First TTS Note` 찾기
3. 재생 버튼(▶️) 클릭
4. 음성이 재생되는지 확인

---

## 문제 해결

### 🔴 "Config not loaded" 에러
**원인**: 설정 파일이 로드되지 않음
**해결**:
1. `obsidian-tts-config.md` 파일이 vault 루트에 있는지 확인
2. Dataview 플러그인이 활성화되어 있는지 확인
3. Obsidian 재시작

### 🔴 "Failed to fetch audio" 에러
**원인**: Azure Function URL이 잘못되었거나 Function이 실행 중이 아님
**해결**:
1. Azure Portal에서 Function App이 실행 중인지 확인
2. Function URL이 정확한지 확인 (https:// 포함)
3. 브라우저 개발자 도구(F12) → Console에서 에러 메시지 확인

### 🔴 음성이 재생되지 않음
**원인**: 캐시 문제 또는 Azure Speech Service 키 오류
**해결**:
1. 브라우저 개발자 도구(F12) → Network 탭에서 API 호출 확인
2. Azure Portal에서 Speech Service 키가 올바른지 확인
3. Function App 로그 확인:
   ```bash
   az webapp log tail --name obsidian-tts-func --resource-group obsidian-tts-rg
   ```

### 🔴 Dataview 노트가 표시되지 않음
**원인**: Dataview 플러그인 비활성화 또는 쿼리 오류
**해결**:
1. 설정 → Community plugins에서 Dataview 활성화 확인
2. 설정 → Dataview → "Enable JavaScript Queries" 체크
3. Obsidian 재시작

---

## 🎉 다음 단계

축하합니다! TTS가 작동합니다. 이제:

1. **커스터마이징**: [TTS-V4-FRONTEND-TEMPLATE.md](TTS-V4-FRONTEND-TEMPLATE.md)에서 UI 커스터마이징 방법 확인
2. **고급 기능**: [CROSS-DEVICE-PLAYBACK-SYNC.md](CROSS-DEVICE-PLAYBACK-SYNC.md)에서 디바이스 간 동기화 설정
3. **비용 최적화**: [CACHE-STATS-SERVER-API.md](CACHE-STATS-SERVER-API.md)에서 캐시 전략 이해
4. **문제 신고**: [GitHub Issues](https://github.com/turtlesoup0/obsidian-tts/issues)

---

## 📞 도움이 필요하신가요?

- **문서**: [README.md](README.md)
- **GitHub Issues**: [Issues 페이지](https://github.com/turtlesoup0/obsidian-tts/issues)
- **이메일**: support@example.com
