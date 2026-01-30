# 🔧 로컬 개발 환경 설정 가이드

> config.properties를 사용한 로컬 개발 환경 설정 방법

## 📋 목차
1. [config.properties 설정](#configproperties-설정)
2. [로컬 Azure Functions 실행](#로컬-azure-functions-실행)
3. [Obsidian 프론트엔드 설정](#obsidian-프론트엔드-설정)
4. [테스트](#테스트)

---

## config.properties 설정

### 1. 설정 파일 생성

```bash
# 프로젝트 루트로 이동
cd obsidian-tts

# 예제 파일을 복사하여 실제 설정 파일 생성
cp config.properties.example config.properties
```

### 2. Azure 백엔드 설정 입력

`config.properties` 파일을 열고 다음 값들을 입력하세요:

```properties
# ============================================
# Azure Backend 설정
# ============================================

# Azure Speech Service 인증 정보
AZURE_SPEECH_KEY=your-actual-azure-speech-key-here
AZURE_SPEECH_REGION=koreacentral

# Azure Storage 연결 문자열 (캐시 및 사용량 추적용)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=youraccount;AccountKey=yourkey;EndpointSuffix=core.windows.net

# Azure Blob Storage 컨테이너 이름
AZURE_BLOB_CONTAINER_NAME=tts-cache

# 유료 API 사용 여부 (true/false)
USE_PAID_API=false
```

### 3. Obsidian 프론트엔드 설정 입력

```properties
# ============================================
# Obsidian Frontend 설정
# ============================================

# Azure Function 백엔드 URL (로컬 개발 시)
AZURE_FUNCTION_URL=http://localhost:7071

# 또는 배포된 Azure Function URL
# AZURE_FUNCTION_URL=https://your-function-app.azurewebsites.net
```

### 4. 설정 우선순위

설정 로딩 우선순위:
1. **config.properties 파일** (최우선)
2. **환경 변수** (config.properties에 값이 없을 때)
3. **기본값** (둘 다 없을 때)

---

## 로컬 Azure Functions 실행

### 1. 필수 도구 설치

```bash
# Azure Functions Core Tools 설치 (macOS)
brew tap azure/functions
brew install azure-functions-core-tools@4

# 또는 npm으로 설치
npm install -g azure-functions-core-tools@4
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 로컬에서 Functions 실행

```bash
# Functions 시작
npm start

# 또는
func start
```

출력 예시:
```
Functions:
    cache: [GET,PUT] http://localhost:7071/api/cache/{hash}
    tts-stream: [POST] http://localhost:7071/api/tts-stream
    playback-position: [GET,PUT] http://localhost:7071/api/playback-position
    ...
```

### 4. 환경 변수 사용 (대안)

`config.properties` 대신 환경 변수를 사용하려면:

```bash
export AZURE_SPEECH_KEY="your-key"
export AZURE_SPEECH_REGION="koreacentral"
export AZURE_STORAGE_CONNECTION_STRING="your-connection-string"

func start
```

---

## Obsidian 프론트엔드 설정

### 방법 1: obsidian-tts-config.md 사용 (추천)

Obsidian vault 루트에 `obsidian-tts-config.md` 파일 생성:

```markdown
---
해시태그: "#tts-config"
---

\`\`\`dataviewjs
window.ObsidianTTSConfig = {
    // 로컬 개발 서버 URL
    azureFunctionUrl: 'http://localhost:7071',

    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    scrollPositionEndpoint: '/api/scroll-position',

    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    defaultPitch: 0,
    defaultVolume: 100,

    debugMode: true  // 개발 시 true로 설정
};

console.log('✅ Obsidian TTS Config loaded (DEV):', window.ObsidianTTSConfig);
\`\`\`
```

### 방법 2: 자동 설정 스크립트 사용

```bash
cd /path/to/your/obsidian-vault
curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh
chmod +x setup-obsidian.sh
./setup-obsidian.sh
```

---

## 테스트

### 1. 백엔드 API 테스트

```bash
# TTS 엔드포인트 테스트
curl -X POST http://localhost:7071/api/tts-stream \
  -H "Content-Type: application/json" \
  -d '{"text":"테스트 음성입니다", "voice":"ko-KR-SunHiNeural"}' \
  --output test.mp3

# 오디오 파일 재생 확인
open test.mp3  # macOS
```

### 2. Obsidian에서 테스트

1. Obsidian 재시작
2. `TTS Reader.md` 노트 열기
3. 샘플 노트 선택 후 재생 버튼(▶️) 클릭
4. 브라우저 콘솔에서 디버그 로그 확인 (`Cmd+Option+I`)

### 3. 디버그 로그 확인

#### 백엔드 (터미널)
```
✅ Config loaded from config.properties
🔑 환경 변수 API 키 사용
TTS Request: 테스트 음성입니다...
Audio generated: 12345 bytes, 10 chars used
```

#### 프론트엔드 (브라우저 콘솔)
```
✅ Obsidian TTS Config loaded (DEV): {azureFunctionUrl: "http://localhost:7071", ...}
🎵 TTS 요청 중: http://localhost:7071/api/tts-stream
✅ TTS 생성 완료: 12345 bytes
```

---

## 문제 해결

### config.properties not found

**증상**: `⚠️  config.properties not found, using environment variables or defaults`

**해결**:
1. `config.properties` 파일이 프로젝트 루트에 있는지 확인
2. `config.properties.example`을 복사했는지 확인
3. 파일 권한 확인: `chmod 644 config.properties`

### AZURE_STORAGE_CONNECTION_STRING not set

**증상**: `Error: AZURE_STORAGE_CONNECTION_STRING not set in config.properties or environment`

**해결**:
```bash
# Storage Account 연결 문자열 가져오기
az storage account show-connection-string \
  --name obsidiantts \
  --resource-group obsidian-tts-rg \
  --output tsv
```

연결 문자열을 복사하여 `config.properties`의 `AZURE_STORAGE_CONNECTION_STRING`에 입력

### CORS 에러

**증상**: `Access to fetch at 'http://localhost:7071/api/tts-stream' from origin 'app://obsidian.md' has been blocked by CORS`

**해결**: `shared/corsHelper.js`에서 로컬 환경 허용 확인
```javascript
const ALLOWED_ORIGINS = [
  'app://obsidian.md',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:7071'  // 로컬 개발
];
```

---

## 프로덕션 배포 전 체크리스트

- [ ] `config.properties`가 `.gitignore`에 포함되어 있는지 확인
- [ ] 로컬 테스트 완료
- [ ] Azure Function에 환경 변수 설정됨
- [ ] Obsidian에서 프로덕션 URL로 변경
- [ ] 디버그 모드 비활성화 (`debugMode: false`)

---

## 관련 문서

- [QUICK-START-GUIDE.md](../../QUICK-START-GUIDE.md) - 프로덕션 배포 가이드
- [config.properties.example](../../config.properties.example) - 설정 파일 템플릿
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - 기여 가이드
