# 📖 Obsidian TTS - Azure 기반 고품질 음성 합성 백엔드

> Azure Cognitive Services를 활용한 서버리스 TTS (Text-to-Speech) 백엔드
> Obsidian 노트를 자연스러운 한국어 음성으로 변환하는 완전한 솔루션

[![Version](https://img.shields.io/badge/version-5.0.1-blue.svg)](https://github.com/turtlesoup0/obsidian-tts)
[![Security](https://img.shields.io/badge/security-A--grade-green.svg)](SECURITY-AUDIT-2026-01-30.md)
[![Node](https://img.shields.io/badge/node-18.x-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)

[English Documentation](README_EN.md) | **한국어 문서**

---

## 🚀 빠른 시작 (5분)

### ⭐ v5.0.0 신규: Keychain 기반 설정 (권장)

**Obsidian 1.11.5+ 사용자**에게 권장하는 가장 안전하고 간편한 방법:

1. **Keychain에 민감정보 등록** (Settings → About → Keychain)
   ```
   - azure-function-url: [Azure Function URL]
   - azure-tts-free-key: [무료 API 키]
   - azure-tts-paid-key: [유료 API 키] (선택)
   ```

2. **v5 템플릿 다운로드**
   ```bash
   curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/templates/v5-keychain/tts-reader-v5-keychain.md
   ```

3. **즉시 사용!** - 노트 파일 수정 불필요

📚 **상세 가이드**: [templates/v5-keychain/README.md](templates/v5-keychain/README.md)

---

### 💡 레거시: 자동 설정 스크립트 (v4 호환)

```bash
cd /path/to/your/obsidian/vault
curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh
chmod +x setup-obsidian.sh
./setup-obsidian.sh
```

👉 더 자세한 내용: [**빠른 시작 가이드**](QUICK-START-GUIDE.md)

---

## 📸 스크린샷

> 📸 스크린샷 준비 중...
>
> 기여하고 싶으시다면 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요!

<!--
향후 추가될 스크린샷:
- TTS Reader 인터페이스
- 디바이스 간 재생 동기화
- 캐시 통계 대시보드
-->

---

## ✨ 주요 기능

### 🔐 v5.0.1 보안 강화 (NEW!)
- **A- 등급** 보안 점수 달성
- eval() 코드 인젝션 방지
- 위험한 엔드포인트 인증 추가
- API 키 로깅 제거
- CORS 정책 강화
- 📄 [보안 개선 보고서](SECURITY-IMPROVEMENTS-2026-01-30.md)

### 🔑 v5.0.0 Keychain 통합 (NEW!)
- **Obsidian 1.11.5+ Keychain API** 지원
- API 키를 노트 파일에서 완전 분리
- macOS/Windows/Linux 시스템 Keychain 암호화 저장
- Git 커밋 시 민감정보 노출 위험 **제로**
- 📚 [Keychain 설정 가이드](templates/v5-keychain/README.md)

### 🎤 고품질 한국어 음성
- Azure Neural Voice (ko-KR-SunHiNeural) 사용
- 자연스러운 억양과 발음
- 8가지 한국어 음성 지원
- 40+ 기술 약어 정확한 발음 (API, SQL, CPU 등)

### ☁️ 디바이스 간 캐시 공유
- Azure Blob Storage 기반 서버 캐싱
- PC, 태블릿, 스마트폰 간 자동 공유
- 30일 TTL로 자동 관리
- 실시간 캐시 히트율 추적

### 🔄 이기종 디바이스 간 재생 위치 동기화 (v4.2)
- **서버 기반 재생 위치 공유**: PC, 태블릿, 스마트폰 간 자동 동기화
- 마지막 재생 위치 자동 저장 (로컬 + 서버)
- 디바이스 전환 시 이어서 재생
- 타임스탬프 기반 충돌 해결 (최신 우선)

### 🎯 볼드 텍스트 강조
- `**중요한 텍스트**` → 음성 강조 효과
- SSML prosody 태그 자동 변환
- 키워드 강조로 청취 집중도 향상

### 🔒 보안 강화 (v4.1 리팩토링)
- 환경 변수 기반 CORS 설정
- 입력 검증 강화 (rate, pitch, volume 범위 체크)
- Race condition 해결 (파일 잠금)
- 에러 메시지 정보 누출 방지
- Azure TTS 타임아웃 및 리소스 정리
- **NEW**: 텍스트 정제 로직 통합 (프론트엔드 단일화)

### ⚡ 성능 최적화
- 서버리스 아키텍처 (자동 스케일링)
- 스트리밍 방식 blob 통계 (O(1) 메모리)
- 마크다운 자동 제거 및 텍스트 정제
- 기술 용어 발음 최적화
- **NEW**: 적응형 오디오 포맷 (32/64/128kbps)

### 💰 비용 효율적
- Azure 무료 티어: 월 50만 자
- 예상 비용: 월 ~$1-2 (초과 시)

---

## 📚 문서

### 시작하기
- **🚀 [빠른 시작 가이드](QUICK-START-GUIDE.md)** - 5분 안에 TTS 사용하기
- **📘 [사용자 온보딩 계획](USER-ONBOARDING-PLAN.md)** - 프로젝트 로드맵 및 개선 방안

### 가이드
- **🔄 [디바이스 간 재생 동기화](docs/guides/cross-device-playback-sync.md)** - 재생 위치 공유
- **📱 [오프라인 지원](docs/guides/offline-support.md)** - IndexedDB 기반 로컬 캐싱
- **🚀 [GitHub 자동 배포](docs/guides/github-auto-deploy-setup.md)** - CI/CD 설정

### API 문서
- **📊 [캐시 통계 API](docs/api/cache-stats-server-api.md)** - 캐시 전략 및 최적화
- **📈 [API 사용량 추적](docs/api/api-usage-tracking.md)** - 사용량 모니터링
- **☁️ [Azure Consumption API](docs/api/azure-consumption-api-integration.md)** - 비용 추적

### 개발
- **🔒 [보안 및 성능 리팩토링](SECURITY-PERFORMANCE-REFACTORING.md)** - 보안 강화 내역
- **📋 [변경 이력](CHANGELOG.md)** - 버전별 변경사항
- **🗺️ [향후 로드맵](FUTURE-ROADMAP.md)** - 개발 계획

📖 **[전체 문서 보기](docs/README.md)**

---

## 🛠️ 개발자용 상세 설정

### 1단계: 저장소 클론

```bash
git clone https://github.com/turtlesoup0/obsidian-tts.git
cd obsidian-tts
```

### 2단계: 의존성 설치

```bash
npm install
```

### 3단계: Azure 리소스 생성

<details>
<summary><b>Azure Speech Service 생성 (클릭하여 펼치기)</b></summary>

```bash
# Azure CLI 설치 (https://learn.microsoft.com/cli/azure/install-azure-cli)
az login

# Speech Service 생성
az cognitiveservices account create \
  --name obsidian-tts-speech \
  --resource-group your-resource-group \
  --kind SpeechServices \
  --sku F0 \
  --location koreacentral

# 키 가져오기
az cognitiveservices account keys list \
  --name obsidian-tts-speech \
  --resource-group your-resource-group
```
</details>

<details>
<summary><b>Azure Storage Account 생성 (클릭하여 펼치기)</b></summary>

```bash
# Storage Account 생성
az storage account create \
  --name obsidiantts \
  --resource-group your-resource-group \
  --location koreacentral \
  --sku Standard_LRS \
  --allow-blob-public-access true

# 연결 문자열 가져오기
az storage account show-connection-string \
  --name obsidiantts \
  --resource-group your-resource-group \
  --query connectionString -o tsv

# tts-cache 컨테이너 생성
az storage container create \
  --name tts-cache \
  --account-name obsidiantts \
  --public-access container
```
</details>

### 4단계: 로컬 설정 파일 생성

`local.settings.json` 파일을 생성하세요:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_SPEECH_KEY": "여기에-Speech-Service-키-입력",
    "AZURE_SPEECH_REGION": "koreacentral",
    "AZURE_STORAGE_CONNECTION_STRING": "여기에-Storage-연결-문자열-입력",
    "ALLOWED_ORIGINS": "app://obsidian.md"
  }
}
```

> ⚠️ **중요**: `local.settings.json`은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.

### 5단계: 로컬 테스트

```bash
# Azure Functions Core Tools 설치 (처음 한 번만)
npm install -g azure-functions-core-tools@4

# 로컬 서버 시작
npm start
```

서버가 시작되면 다음 URL에서 접근할 수 있습니다:
- TTS API: `http://localhost:7071/api/tts-stream`
- 캐시 API: `http://localhost:7071/api/cache/{hash}`
- 통계 API: `http://localhost:7071/api/cache-stats`
- 캐시 목록 API: `http://localhost:7071/api/cache-list`
- 캐시 삭제 API: `http://localhost:7071/api/cache-clear`
- TTS 재생 위치 API: `http://localhost:7071/api/playback-position`
- 스크롤 위치 API: `http://localhost:7071/api/scroll-position`

### 6단계: API 테스트

```bash
# TTS 생성 테스트
curl -X POST http://localhost:7071/api/tts-stream \
  -H "Content-Type: application/json" \
  -d '{"text":"안녕하세요. **Obsidian TTS** API 테스트입니다."}' \
  --output test.mp3

# 오디오 파일 재생 (macOS)
afplay test.mp3

# 캐시 통계 확인
curl http://localhost:7071/api/cache-stats | jq .
```

### 7단계: Azure에 배포

```bash
# Function App 생성
az functionapp create \
  --resource-group your-resource-group \
  --consumption-plan-location koreacentral \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name your-function-app-name \
  --storage-account obsidiantts

# 환경 변수 설정
az functionapp config appsettings set \
  --name your-function-app-name \
  --resource-group your-resource-group \
  --settings \
    AZURE_SPEECH_KEY="여기에-키-입력" \
    AZURE_SPEECH_REGION="koreacentral" \
    AZURE_STORAGE_CONNECTION_STRING="여기에-연결-문자열-입력" \
    ALLOWED_ORIGINS="app://obsidian.md"

# 배포
func azure functionapp publish your-function-app-name
```

배포가 완료되면 다음 URL에서 API를 사용할 수 있습니다:
```
https://your-function-app-name.azurewebsites.net/api/tts-stream
```

---

## 📚 API 사용법

### POST /api/tts-stream

텍스트를 음성으로 변환합니다.

**요청 예시:**
```json
{
  "text": "주제: API. 정의: Application Programming Interface",
  "voice": "ko-KR-SunHiNeural",
  "rate": 1.0,
  "pitch": 0,
  "volume": 100
}
```

**파라미터:**

| 이름 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `text` | string | ✅ | - | 변환할 텍스트 (최대 50,000자) |
| `voice` | string | ❌ | ko-KR-SunHiNeural | 음성 선택 |
| `rate` | number | ❌ | 1.0 | 재생 속도 (0.5 ~ 2.0) |
| `pitch` | number | ❌ | 0 | 음높이 (-50 ~ 50) |
| `volume` | number | ❌ | 100 | 볼륨 (0 ~ 100) |

**지원되는 음성:**
- `ko-KR-SunHiNeural` (여성, 밝은 톤) ⭐ 추천
- `ko-KR-InJoonNeural` (남성, 부드러운 톤)
- `ko-KR-BongJinNeural` (남성, 침착한 톤)
- `ko-KR-GookMinNeural` (남성, 전문적인 톤)
- `ko-KR-JiMinNeural` (여성, 활기찬 톤)
- `ko-KR-SeoHyeonNeural` (여성, 차분한 톤)
- `ko-KR-SoonBokNeural` (여성, 친근한 톤)
- `ko-KR-YuJinNeural` (여성, 명확한 톤)

**응답:**
- 성공 시: `audio/mpeg` 스트림
- 실패 시: JSON 에러 메시지

**응답 헤더:**
- `X-TTS-Chars-Used`: 실제 사용된 문자 수
- `Content-Length`: 오디오 파일 크기 (bytes)

### GET /api/cache/{hash}

서버 캐시에서 오디오를 조회합니다.

**응답:**
- 캐시 HIT: `audio/mpeg` + `X-Cache-Status: HIT`
- 캐시 MISS: 404

### PUT /api/cache/{hash}

서버 캐시에 오디오를 저장합니다.

**요청 본문:** `audio/mpeg` binary

**응답:**
```json
{
  "success": true,
  "hash": "abc123def456-789012345678",
  "size": 12345,
  "cachedAt": "2026-01-22T13:21:52.000Z"
}
```

### GET /api/cache-stats

서버 캐시 통계를 조회합니다.

**응답:**
```json
{
  "totalFiles": 160,
  "totalSize": 33839280,
  "totalSizeMB": "32.27",
  "oldestFile": {
    "name": "test-hash-67890.mp3",
    "createdOn": "2026-01-22T10:33:48.000Z"
  },
  "newestFile": {
    "name": "cf1ffd2391f9ee8b6790c2bd.mp3",
    "createdOn": "2026-01-22T13:36:02.000Z"
  }
}
```

### GET /api/cache-list

캐시 키 목록을 조회합니다 (디버깅용).

**쿼리 파라미터:**
- `limit` (선택): 최대 반환 개수 (기본값: 100)
- `offset` (선택): 건너뛸 개수 (기본값: 0)

**요청 예시:**
```bash
curl "http://localhost:7071/api/cache-list?limit=10&offset=0"
```

**응답:**
```json
{
  "cacheKeys": [
    {
      "key": "abc123def456-789012345678",
      "size": 12345,
      "createdOn": "2026-01-23T10:30:00.000Z"
    }
  ],
  "total": 160,
  "offset": 0,
  "limit": 10
}
```

### DELETE /api/cache-clear

전체 캐시를 삭제합니다.

**요청 예시:**
```bash
curl -X DELETE http://localhost:7071/api/cache-clear
```

**응답:**
```json
{
  "success": true,
  "deletedCount": 436,
  "message": "Successfully deleted 436 cache files"
}
```

> ⚠️ **주의**: 이 작업은 되돌릴 수 없습니다. 모든 캐시 파일이 영구적으로 삭제됩니다.

### GET /api/playback-position

현재 저장된 재생 위치를 조회합니다 (디바이스 간 동기화용).

**응답 (데이터 있음):**
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "timestamp": 1737672000000,
  "deviceId": "MacIntel-xyz123"
}
```

**응답 (데이터 없음):**
```json
{
  "lastPlayedIndex": -1
}
```

### PUT /api/playback-position

재생 위치를 저장합니다 (디바이스 간 동기화용).

**요청:**
```json
{
  "lastPlayedIndex": 42,
  "notePath": "1_Project/정보 관리 기술사/출제예상/API.md",
  "noteTitle": "API 정의",
  "deviceId": "MacIntel-xyz123"
}
```

**응답:**
```json
{
  "success": true,
  "timestamp": 1737672000000
}
```

### GET /api/scroll-position

Obsidian 학습 노트의 스크롤 위치를 조회합니다 (디바이스 간 동기화용).

**응답 (데이터 있음):**
```json
{
  "savedNoteName": "API 정의",
  "savedIndex": 42,
  "timestamp": 1737672000000,
  "deviceId": "MacIntel-xyz123"
}
```

**응답 (데이터 없음):**
```json
{
  "savedNoteName": "",
  "savedIndex": -1
}
```

### PUT /api/scroll-position

스크롤 위치를 저장합니다 (디바이스 간 동기화용).

**요청:**
```json
{
  "savedNoteName": "API 정의",
  "savedIndex": 42,
  "deviceId": "MacIntel-xyz123"
}
```

**응답:**
```json
{
  "success": true,
  "timestamp": 1737672000000
}
```

---

## 📁 프로젝트 구조

```
obsidian-tts/
├── src/functions/                  # Azure Functions (v4 모델)
│   ├── tts-stream.js              # TTS API 엔드포인트
│   ├── cache.js                   # Blob Storage 캐싱 API
│   ├── cache-stats.js             # 캐시 통계 API
│   ├── cache-list.js              # 캐시 목록 조회 API (디버깅용)
│   ├── cache-clear.js             # 전체 캐시 삭제 API
│   ├── playback-position.js       # TTS 재생 위치 동기화 API (v4.2)
│   ├── scroll-position.js         # 학습 노트 스크롤 위치 동기화 API
│   └── get-azure-usage.js         # Azure 사용량 추적 API
├── shared/                         # 공유 유틸리티
│   ├── azureTTS-rest.js           # Azure Speech REST API 래퍼
│   ├── ssmlBuilder.js             # SSML 생성 (강조 태그 지원)
│   ├── usageTracker.js            # 사용량 추적 (파일 잠금)
│   ├── blobHelper.js              # Blob Storage 공통 유틸리티 (v4.1 추가)
│   └── corsHelper.js              # CORS 헬퍼 (환경 변수 기반)
├── .github/workflows/              # GitHub Actions CI/CD
│   └── azure-functions-deploy.yml # 자동 배포 워크플로우
├── host.json                       # Function App 설정
├── package.json                    # 의존성
├── .gitignore                      # Git 제외 파일 목록
├── SECURITY-PERFORMANCE-REFACTORING.md  # 리팩토링 문서
├── TTS-V4-FRONTEND-TEMPLATE.md    # Obsidian 프론트엔드 템플릿
└── README.md                       # 이 파일
```

---

## 🎨 Obsidian 프론트엔드 설정

### 1. 템플릿 복사

`TTS-V4-FRONTEND-TEMPLATE.md` 파일을 Obsidian Vault로 복사하세요.

### 2. API 엔드포인트 설정

템플릿에서 다음 2곳을 수정하세요:

```javascript
// 캐시 API 엔드포인트
cacheApiEndpoint: 'https://your-function-app-name.azurewebsites.net/api/cache',

// TTS API 엔드포인트
const API_ENDPOINT = 'https://your-function-app-name.azurewebsites.net/api/tts-stream';
```

### 3. 노트 경로 설정

```javascript
// 출제예상 노트 검색 경로 수정
window.azureTTSReader.pages = dv.pages('"YOUR_NOTE_PATH" and -#검색제외 and #출제예상')
```

### 4. Dataview 플러그인 설치

Obsidian 설정 → 커뮤니티 플러그인 → "Dataview" 검색 → 설치 및 활성화

### 5. 노트 재생 테스트

1. 수정한 노트를 Obsidian에서 열기
2. "재생 시작" 버튼 클릭
3. 콘솔(F12)에서 캐시 동작 확인

---

## 💰 비용 추정

### Azure 무료 티어 (F0)

| 서비스 | 무료 한도 | 초과 시 비용 |
|--------|-----------|-------------|
| **Speech TTS** | 500,000자/월 | $0.000016/자 |
| **Azure Functions** | 100만 실행/월 | $0.0000002/실행 |
| **Blob Storage** | 5GB | $0.0184/GB |

### 실제 사용량 예시

#### 시나리오 1: 가벼운 사용 (무료)
- 100개 노트 × 평균 190자 = 19,000자
- TTS 비용: **$0** (무료 티어 내)
- Functions 비용: **$0** (무료 티어 내)
- Storage 비용: **$0** (5GB 내)
- **총 비용: $0/월**

#### 시나리오 2: 일반 사용
- 3,000개 노트 × 평균 190자 = 570,000자
- TTS 비용: 70,000자 초과 × $0.000016 = **$1.12**
- Functions 비용: **$0** (무료 티어 내)
- Storage 비용: **$0** (100MB 수준)
- **총 비용: ~$1.12/월**

#### 시나리오 3: 헤비 사용
- 10,000개 노트 × 평균 190자 = 1,900,000자
- TTS 비용: 1,400,000자 초과 × $0.000016 = **$22.40**
- Functions 비용: **$0** (무료 티어 내)
- Storage 비용: ~$0.01 (500MB 수준)
- **총 비용: ~$22.41/월**

### 💡 비용 절감 팁

1. **캐싱 활용**: 동일한 노트는 서버 캐시에서 무료로 재사용
2. **캐시 히트율 모니터링**: `/api/cache-stats`로 히트율 확인
3. **텍스트 정제**: 불필요한 마크다운 제거로 문자 수 감소
4. **무료 티어 모니터링**: Azure Portal에서 사용량 추적

---

## 🔧 문제 해결

### 일반적인 오류

#### 1. "Service configuration error"
**원인**: Azure Speech Service 키가 설정되지 않음

**해결 방법**:
```bash
# 로컬 환경
local.settings.json에 AZURE_SPEECH_KEY 추가

# Azure 환경
az functionapp config appsettings set \
  --name your-function-app-name \
  --resource-group your-resource-group \
  --settings AZURE_SPEECH_KEY="your-key-here"
```

#### 2. "Invalid rate: must be a number between 0.5 and 2.0"
**원인**: 잘못된 파라미터 값

**해결 방법**: API 요청 시 파라미터 범위 확인
- rate: 0.5 ~ 2.0
- pitch: -50 ~ 50
- volume: 0 ~ 100

#### 3. "Speech synthesis timeout"
**원인**: 텍스트가 너무 길거나 Azure API 응답 지연

**해결 방법**:
- 텍스트 길이를 50,000자 이하로 제한
- 네트워크 연결 확인
- Azure 리전을 가까운 곳으로 변경

#### 4. 캐싱이 작동하지 않음
**확인 사항**:
```bash
# Storage Account 퍼블릭 액세스 확인
az storage account show \
  --name obsidiantts \
  --resource-group your-resource-group \
  --query allowBlobPublicAccess

# tts-cache 컨테이너 확인
az storage container show \
  --name tts-cache \
  --account-name obsidiantts
```

**해결 방법**:
```bash
# 퍼블릭 액세스 활성화
az storage account update \
  --name obsidiantts \
  --resource-group your-resource-group \
  --allow-blob-public-access true

# 컨테이너 생성 (없는 경우)
az storage container create \
  --name tts-cache \
  --account-name obsidiantts \
  --public-access container
```

#### 5. CORS 에러
**원인**: 허용되지 않은 Origin에서 요청

**해결 방법**:
```bash
# ALLOWED_ORIGINS 환경 변수 설정
az functionapp config appsettings set \
  --name your-function-app-name \
  --resource-group your-resource-group \
  --settings ALLOWED_ORIGINS="app://obsidian.md,https://yourdomain.com"
```

### 로그 확인

```bash
# 실시간 로그 스트리밍
func azure functionapp logstream your-function-app-name

# 또는 Azure Portal
# Function App → Monitoring → Log Stream
```

### 디버깅 팁

1. **로컬 테스트 우선**: 먼저 `npm start`로 로컬에서 테스트
2. **콘솔 로그 확인**: 브라우저 F12 → Console 탭
3. **네트워크 탭 확인**: F12 → Network 탭에서 API 요청/응답 확인
4. **캐시 통계 확인**: `/api/cache-stats`로 서버 상태 모니터링

---

## 🔒 보안 및 성능

### 🆕 v5.0.1 보안 패치 (2026-01-30)

**보안 점수**: 7.2/10 → **8.5/10** (+1.3점 상승)

#### 긴급 취약점 수정
- 🔴 **eval() 코드 인젝션 방지**
  - Function 생성자 + strict mode로 안전하게 변경
  - 악의적 config 파일 실행 차단

- 🟠 **위험한 엔드포인트 인증 추가**
  - `/api/cache-clear` → Function Key 필요
  - 무단 캐시 삭제 방지

- 🟠 **API 키 로깅 제거**
  - Azure Application Insights 로그 보호
  - 정보 노출 위험 제거

- 🟠 **CORS 정책 강화**
  - Obsidian 공식 앱만 허용 (앱 ID 화이트리스트)
  - 악성 app:// 프로토콜 차단

📄 [보안 개선 보고서](SECURITY-IMPROVEMENTS-2026-01-30.md)

---

### 🔑 v5.0.0 Keychain 통합 (2026-01-30)

#### 민감정보 완전 분리
- ✅ **Obsidian Keychain API** 사용 (macOS/Windows/Linux)
- ✅ API 키를 노트 파일에서 제거
- ✅ Git 커밋 시 민감정보 노출 **제로**
- ✅ 시스템 Keychain 암호화 저장

#### Git 히스토리 정리
- ✅ 과거 커밋에서 민감정보 완전 제거
- ✅ GitHub Secret Scanning 통과
- ✅ 62개 커밋 → 1개 clean 커밋

📄 [보안 감사 보고서](SECURITY-AUDIT-2026-01-30.md)

---

### v4.1 리팩토링 완료 사항

#### 아키텍처 개선 (v4.1)
- ✅ **텍스트 정제 로직 통합**: 프론트엔드에서만 처리 (Single Source of Truth)
- ✅ **코드 중복 제거**: Blob Storage 공통 유틸리티 모듈화 (blobHelper.js)
- ✅ **오디오 포맷 최적화**: Azure 지원 포맷으로 변경 (32/64/128kbps)
- ✅ **캐시 관리 API 추가**: cache-list, cache-clear 엔드포인트

#### 보안 개선 (v4.0)
- ✅ CORS 환경 변수 기반 설정
- ✅ 입력 검증 강화 (text, voice, rate, pitch, volume)
- ✅ Race condition 해결 (파일 잠금 메커니즘)
- ✅ 에러 메시지 정보 누출 방지

#### 성능 개선 (v4.0)
- ✅ Azure TTS 타임아웃 30초 추가
- ✅ 리소스 정리 개선 (메모리 리크 방지)
- ✅ cache-stats 메모리 최적화 (O(n) → O(1))
- ✅ 스트리밍 방식 blob 통계 계산

자세한 내용은 [SECURITY-PERFORMANCE-REFACTORING.md](SECURITY-PERFORMANCE-REFACTORING.md)를 참고하세요.

---

## 📖 관련 문서

### 보안
- [보안 감사 보고서 v5.0.0](SECURITY-AUDIT-2026-01-30.md) - 전체 코드베이스 심층 분석
- [보안 개선 보고서 v5.0.1](SECURITY-IMPROVEMENTS-2026-01-30.md) - 긴급 취약점 패치
- [보안 및 성능 리팩토링 가이드](SECURITY-PERFORMANCE-REFACTORING.md) - v4 개선사항

### v5 Keychain
- [v5 템플릿 가이드](templates/v5-keychain/README.md) - Keychain 기반 TTS
- [Keychain 설정 가이드](templates/v5-keychain/keychain-setup-guide.md) - 상세 설정
- [빠른 시작 체크리스트](templates/v5-keychain/keychain-setup-checklist.md) - 5분 완료
- [v4→v5 마이그레이션](templates/v5-keychain/v5-upgrade-guide.md) - 업그레이드 가이드

### 사용자 온보딩
- [빠른 시작 가이드](QUICK-START-GUIDE.md) - 5분 완성
- [사용자 온보딩 개선 방안](USER-ONBOARDING-PLAN.md) - 프로젝트 로드맵

### 기타
- [English Documentation](README_EN.md)

---

## 🤝 기여하기

이슈 리포트나 Pull Request를 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 라이선스

이 프로젝트는 MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

## 🙏 감사의 말

- [Azure Cognitive Services](https://azure.microsoft.com/services/cognitive-services/) - 고품질 TTS 제공
- [Azure Functions](https://azure.microsoft.com/services/functions/) - 서버리스 플랫폼
- [Obsidian](https://obsidian.md/) - 훌륭한 노트 앱

---

**버전**: 4.2.1
**최종 업데이트**: 2026-01-24
**작성자**: turtlesoup0
**저장소**: [https://github.com/turtlesoup0/obsidian-tts](https://github.com/turtlesoup0/obsidian-tts)

---

## 📋 v4.2.1 주요 변경사항

### ⚡ 재생 속도 최적화
**문제**: 재생 속도를 변경할 때마다 서버에 새로운 TTS를 요청하여 캐시가 중복 생성됨
- 예: 1.0x, 1.5x, 2.0x 각각에 대해 별도 캐시 생성 → 3배 저장 공간 낭비

**해결**: TTS 생성은 항상 정속(1.0x)으로, 재생 속도는 클라이언트 측에서만 제어
- TTS API 호출 시 `rate: 1.0` 고정
- HTML5 Audio API의 `playbackRate` 속성으로 클라이언트 측 속도 조절
- 동일 콘텐츠에 대해 단일 캐시만 생성

**효과**:
- 캐시 저장 공간 67% 절감 (3배 → 1배)
- 재생 속도 변경 시 즉시 반영 (실시간 조정 가능)
- 캐시 히트율 향상

**프론트엔드 수정 사항**:
```javascript
// Before (v4.2.0)
audioBlob = await window.callAzureTTS(textToSpeak, reader.playbackRate);
reader.audioElement.playbackRate = 1.0; // Azure에서 이미 rate 적용됨

// After (v4.2.1)
audioBlob = await window.callAzureTTS(textToSpeak);
reader.audioElement.playbackRate = reader.playbackRate; // 클라이언트 측 속도 제어
```

---

## 📋 v4.2 주요 변경사항

### 🔄 이기종 디바이스 간 재생 위치 동기화
**문제**: 사용자가 PC, 태블릿, 스마트폰 등 여러 디바이스에서 TTS를 사용할 때, 디바이스마다 재생 위치가 따로 관리되어 이어서 듣기 불편

**해결**: 서버 기반 재생 위치 동기화 구현
- Azure Blob Storage에 재생 위치 저장 (`tts-playback` 컨테이너)
- 모든 디바이스에서 자동으로 최신 재생 위치 공유
- 타임스탬프 기반 충돌 해결 (최신 우선)
- 디바이스 ID 추적 (어떤 디바이스에서 재생했는지 확인 가능)

**새로운 API**:
- `GET /api/playback-position`: 재생 위치 조회
- `PUT /api/playback-position`: 재생 위치 저장

**사용 시나리오**:
1. PC에서 42번 노트까지 재생 → 서버에 저장
2. 태블릿에서 재생 시작 → 서버에서 42번 불러옴 → 43번부터 자동 재생 ✅

**데이터 크기**: ~200 bytes (무시할 수준)

---

## 📋 v4.1 주요 변경사항

### 🔧 아키텍처 개선
1. **텍스트 정제 로직 통합** (Single Source of Truth)
   - 문제: 프론트엔드와 백엔드에서 중복된 텍스트 정제 로직으로 인해 캐시 키 불일치 발생
   - 해결: 백엔드에서 텍스트 정제 로직 제거, 프론트엔드에서만 처리
   - 결과: 캐시 히트율 0% → 100% 개선

2. **코드 중복 제거**
   - 4개 파일에서 중복된 Blob Storage 초기화 코드 제거
   - 공통 유틸리티 모듈 `shared/blobHelper.js` 생성
   - 유지보수성 및 코드 품질 향상

3. **오디오 포맷 수정**
   - 문제: Azure가 지원하지 않는 48kbps 포맷 사용으로 500 에러 발생
   - 해결: 텍스트 길이에 따른 적응형 포맷 (32/64/128kbps)
   - 결과: API 안정성 향상

### 🆕 새로운 API 엔드포인트
- `GET /api/cache-list`: 캐시 키 목록 조회 (디버깅용)
- `DELETE /api/cache-clear`: 전체 캐시 삭제

### ⚠️ 중요 공지
**v4.1로 업그레이드 시 기존 캐시 삭제 필요**

텍스트 정제 로직 변경으로 인해 기존 캐시 파일의 키가 더 이상 일치하지 않습니다.

**캐시 삭제 방법:**
```bash
# 로컬 환경
curl -X DELETE http://localhost:7071/api/cache-clear

# 프로덕션 환경
curl -X DELETE https://your-function-app-name.azurewebsites.net/api/cache-clear
```

삭제 후 프론트엔드에서 노트를 다시 재생하면 새로운 캐시 파일이 자동으로 생성됩니다.
