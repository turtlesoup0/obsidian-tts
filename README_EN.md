# Obsidian TTS Backend

Azure Functions serverless backend for high-quality Text-to-Speech conversion using Azure Cognitive Services.

## Features (v4.0)

- 🎤 **High-Quality Korean TTS**: Azure Neural Voice (ko-KR-SunHiNeural)
- ☁️ **Device-Shared Caching**: Azure Blob Storage based cross-device cache
- 🔄 **Auto-Resume**: Automatically continue from last played note
- 🎯 **Bold Text Emphasis**: SSML emphasis for `**bold text**`
- ⚡ **Serverless**: Azure Functions with automatic scaling
- 🌐 **CORS Enabled**: Works from Obsidian mobile/desktop apps
- 🧹 **Text Cleaning**: Automatic markdown removal and technical term pronunciation
- 📝 **SSML Support**: Fine-grained control over speech output with emphasis tags
- 💰 **Cost-Effective**: Azure free tier covers ~500K characters/month

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Azure Speech Service

Create `local.settings.json`:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_SPEECH_KEY": "your-azure-speech-key",
    "AZURE_SPEECH_REGION": "koreacentral"
  }
}
```

### 3. Local Testing
```bash
npm start
```

Test endpoint:
```bash
curl -X POST http://localhost:7071/api/tts-stream \
  -H "Content-Type: application/json" \
  -d '{"text":"안녕하세요. API 테스트입니다."}' \
  --output test.mp3
```

### 4. Deploy to Azure
```bash
func azure functionapp publish your-function-app-name
```

## API Reference

### POST /api/tts-stream

**Request Body:**
```json
{
  "text": "텍스트를 입력하세요",
  "voice": "ko-KR-SunHiNeural",
  "rate": 1.0,
  "pitch": 0,
  "volume": 100
}
```

**Response:**

- Success: Audio stream (audio/mpeg)
- Error: JSON with error details

## Project Structure
```
obsidian-tts/
├── src/functions/           # Azure Functions (v4 programming model)
│   ├── tts-stream.js        # Main TTS API endpoint
│   ├── cache.js             # Blob Storage caching API
│   └── get-usage.js         # Usage tracking API
├── tts-stream/              # Legacy function (deprecated)
│   └── index.js
├── shared/                  # Shared utilities
│   ├── azureTTS.js          # Azure Speech SDK wrapper
│   ├── ssmlBuilder.js       # SSML generation (with emphasis support)
│   ├── textCleaner.js       # Text preprocessing (bold → emphasis)
│   └── usageTracker.js      # Usage tracking
├── host.json                # Function app settings
├── package.json             # Dependencies
├── .env.example             # Environment variables template
├── CHANGELOG.md             # Version history
└── README.md                # This file
```

## Cost Estimation

### Azure Free Tier
- **Speech TTS**: 500,000 characters/month free
- **Functions**: 1M executions free

### Typical Usage
- 3000 topics/month × 190 chars = 570,000 chars
- Overage: 70,000 chars × $0.000016 = **~$1.12/month**

## Troubleshooting

### Common Errors

#### 1. "Failed to register function" 에러
**원인**: 동일한 라우트에 중복된 함수 등록
**해결**: v1.1.0 이상으로 업데이트 (cache.js 수정됨)

#### 2. "DefaultAzureCredential authentication failed"
**원인**: get-usage.js에서 Azure Monitor 접근 권한 없음
**해결방법**:
```bash
# Azure Portal에서 Managed Identity 활성화
az functionapp identity assign --name <your-function-app> --resource-group <your-rg>

# Speech Service에 Reader 권한 부여
az role assignment create \
  --assignee <managed-identity-principal-id> \
  --role "Monitoring Reader" \
  --scope <speech-service-resource-id>
```

#### 3. 캐싱이 작동하지 않음
**확인사항**:
- `AZURE_STORAGE_CONNECTION_STRING` 환경 변수 설정 확인
- Azure Storage에 `tts-cache` 컨테이너 생성 확인
- Blob 퍼블릭 액세스 설정 확인

#### 4. CORS 에러
**해결**: Azure Portal → Function App → CORS 설정에서 `*` 추가

### 로그 확인 방법

```bash
# Azure Functions 실시간 로그 스트리밍
func azure functionapp logstream <your-function-app-name>

# 또는 Azure Portal에서
# Function App → Monitor → Log Stream
```

## Environment Variables

필수 환경 변수 (Azure Portal → Configuration → Application Settings):

| 변수명 | 설명 | 필수 여부 |
|--------|------|----------|
| `AZURE_SPEECH_KEY` | Azure Speech Service 키 | ✅ 필수 |
| `AZURE_SPEECH_REGION` | 리전 (예: koreacentral) | ✅ 필수 |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage 연결 문자열 | 🟡 캐싱 기능용 |
| `AZURE_SUBSCRIPTION_ID` | Azure 구독 ID | 🟡 사용량 조회용 |
| `AZURE_RESOURCE_GROUP` | 리소스 그룹 이름 | 🟡 사용량 조회용 |
| `AZURE_SPEECH_RESOURCE_NAME` | Speech Service 리소스 이름 | 🟡 사용량 조회용 |

## Documentation

- Full deployment guide: See DEPLOYMENT.md (create separately)
- Quick start: See QUICKSTART.md (create separately)

## License

MIT
