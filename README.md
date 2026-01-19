# Obsidian TTS Backend

Azure Functions serverless backend for high-quality Text-to-Speech conversion using Azure Cognitive Services.

## Features

- 🎤 **High-Quality Korean TTS**: Azure Neural Voice (ko-KR-SunHiNeural)
- ⚡ **Serverless**: Azure Functions with automatic scaling
- 🌐 **CORS Enabled**: Works from Obsidian mobile/desktop apps
- 🧹 **Text Cleaning**: Automatic markdown removal and technical term pronunciation
- 📝 **SSML Support**: Fine-grained control over speech output
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
obsidian-tts-backend/
├── tts-stream/              # Main HTTP trigger function
│   ├── index.js             # Function handler
│   └── function.json        # Function configuration
├── shared/                  # Shared utilities
│   ├── azureTTS.js          # Azure Speech SDK wrapper
│   ├── ssmlBuilder.js       # SSML generation
│   └── textCleaner.js       # Text preprocessing
├── host.json                # Function app settings
├── package.json             # Dependencies
└── README.md                # This file
```

## Cost Estimation

### Azure Free Tier
- **Speech TTS**: 500,000 characters/month free
- **Functions**: 1M executions free

### Typical Usage
- 3000 topics/month × 190 chars = 570,000 chars
- Overage: 70,000 chars × $0.000016 = **~$1.12/month**

## Documentation

- Full deployment guide: See DEPLOYMENT.md (create separately)
- Quick start: See QUICKSTART.md (create separately)

## License

MIT
