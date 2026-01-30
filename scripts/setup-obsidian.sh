#!/bin/bash

# ============================================
# Obsidian TTS 자동 설정 스크립트
# ============================================

set -e

echo "🚀 Obsidian TTS 자동 설정을 시작합니다..."
echo ""

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 현재 디렉토리가 Obsidian vault인지 확인
if [ ! -d ".obsidian" ]; then
    echo -e "${RED}❌ .obsidian 폴더를 찾을 수 없습니다.${NC}"
    echo "   Obsidian vault 루트 디렉토리에서 이 스크립트를 실행해주세요."
    exit 1
fi

echo -e "${GREEN}✅ Obsidian vault 감지됨${NC}"
echo ""

# config.properties 파일 찾기
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/config.properties"

# config.properties에서 설정 읽기
if [ -f "$CONFIG_FILE" ]; then
    echo -e "${GREEN}✅ config.properties 파일을 찾았습니다${NC}"
    echo "   위치: $CONFIG_FILE"
    echo ""

    # config.properties에서 값 읽기
    source "$CONFIG_FILE"

    # 필수 값 확인
    if [ -z "$AZURE_FUNCTION_URL" ]; then
        echo -e "${RED}❌ config.properties에 AZURE_FUNCTION_URL이 설정되지 않았습니다${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ 설정 로드 완료${NC}"
    echo "   - Azure Function URL: $AZURE_FUNCTION_URL"
    echo "   - TTS Endpoint: $TTS_API_ENDPOINT"
    echo "   - 무료 API 키: ${AZURE_SPEECH_KEY:0:20}..."
    if [ -n "$AZURE_SPEECH_KEY_PAID" ]; then
        echo "   - 유료 API 키: ${AZURE_SPEECH_KEY_PAID:0:20}..."
    fi
    echo ""
else
    echo -e "${YELLOW}⚠️  config.properties를 찾을 수 없습니다${NC}"
    echo "   수동 입력 모드로 진행합니다."
    echo ""

    # 수동 입력
    echo "📝 Azure Function URL을 입력하세요:"
    echo "   예: https://obsidian-tts-func.azurewebsites.net"
    read -p "URL: " AZURE_FUNCTION_URL

    if [ -z "$AZURE_FUNCTION_URL" ]; then
        echo -e "${RED}❌ URL이 입력되지 않았습니다.${NC}"
        exit 1
    fi

    # https:// 자동 추가
    if [[ ! "$AZURE_FUNCTION_URL" =~ ^https?:// ]]; then
        AZURE_FUNCTION_URL="https://$AZURE_FUNCTION_URL"
    fi

    # 기본값 설정
    TTS_API_ENDPOINT="/api/tts-stream"
    CACHE_API_ENDPOINT="/api/cache"
    PLAYBACK_POSITION_ENDPOINT="/api/playback-position"
    SCROLL_POSITION_ENDPOINT="/api/scroll-position"
    AZURE_SPEECH_KEY=""
    AZURE_SPEECH_KEY_PAID=""
    USE_PAID_API="false"
    DEFAULT_VOICE="ko-KR-SunHiNeural"
    DEFAULT_RATE="1.0"
    DEFAULT_PITCH="0"
    DEFAULT_VOLUME="100"
    ENABLE_OFFLINE_CACHE="true"
    CACHE_TTL_DAYS="30"
    DEBUG_MODE="false"
fi

echo -e "${GREEN}✅ Function URL: $AZURE_FUNCTION_URL${NC}"
echo ""

# Dataview 플러그인 확인
echo "🔍 Dataview 플러그인을 확인하는 중..."

if [ ! -f ".obsidian/community-plugins.json" ]; then
    echo -e "${YELLOW}⚠️  community-plugins.json을 찾을 수 없습니다${NC}"
    echo "   Dataview 플러그인을 수동으로 설치해주세요."
else
    if grep -q "dataview" ".obsidian/community-plugins.json"; then
        echo -e "${GREEN}✅ Dataview 플러그인 설치됨${NC}"
    else
        echo -e "${YELLOW}⚠️  Dataview 플러그인이 설치되지 않았습니다${NC}"
        echo "   Obsidian 설정 → Community plugins에서 'Dataview'를 설치해주세요."
    fi
fi
echo ""

# 설정 파일 생성
echo "📄 설정 파일을 생성하는 중..."

CONFIG_MD="obsidian-tts-config.md"

cat > "$CONFIG_MD" << EOF
---
해시태그: "#tts-config"
---

> 🔧 Obsidian TTS 설정 파일
> 이 노트는 git에 업로드되지 않습니다 (.gitignore에 포함)
>
> **자동 생성 방법**:
> \`\`\`bash
> cd /path/to/your/vault
> curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh
> chmod +x setup-obsidian.sh
> ./setup-obsidian.sh
> \`\`\`

# 설정

\`\`\`dataviewjs
// ============================================
// 🔧 Obsidian TTS 설정
// ============================================
// 이 설정은 ../obsidian-tts/config.properties에서 자동 생성됩니다.
// 수동으로 수정할 경우 setup-obsidian.sh를 다시 실행하면 덮어씌워집니다.

window.ObsidianTTSConfig = {
    // Azure Function 백엔드 URL
    azureFunctionUrl: '$AZURE_FUNCTION_URL',

    // API 엔드포인트
    ttsEndpoint: '${TTS_API_ENDPOINT:-/api/tts-stream}',
    cacheEndpoint: '${CACHE_API_ENDPOINT:-/api/cache}',
    playbackPositionEndpoint: '${PLAYBACK_POSITION_ENDPOINT:-/api/playback-position}',
    scrollPositionEndpoint: '${SCROLL_POSITION_ENDPOINT:-/api/scroll-position}',

    // Azure Speech API 키
    azureFreeApiKey: '${AZURE_SPEECH_KEY:-}',
    azurePaidApiKey: '${AZURE_SPEECH_KEY_PAID:-}',
    usePaidApi: ${USE_PAID_API:-false},

    // 기본 TTS 설정
    defaultVoice: '${DEFAULT_VOICE:-ko-KR-SunHiNeural}',
    defaultRate: ${DEFAULT_RATE:-1.0},
    defaultPitch: ${DEFAULT_PITCH:-0},
    defaultVolume: ${DEFAULT_VOLUME:-100},

    // 캐시 설정
    enableOfflineCache: ${ENABLE_OFFLINE_CACHE:-true},
    cacheTtlDays: ${CACHE_TTL_DAYS:-30},

    // 디버그 모드
    debugMode: ${DEBUG_MODE:-false}
};

console.log('✅ Obsidian TTS Config loaded:', window.ObsidianTTSConfig);
\`\`\`

## 설정 확인

현재 설정된 백엔드 URL:
- **Azure Function**: \`$AZURE_FUNCTION_URL\`
- **TTS Endpoint**: \`${TTS_API_ENDPOINT:-/api/tts-stream}\`
- **Cache Endpoint**: \`${CACHE_API_ENDPOINT:-/api/cache}\`

## 설정 변경 방법

1. **프로젝트의 config.properties 파일 수정**:
   \`\`\`bash
   cd /path/to/obsidian-tts
   nano config.properties
   \`\`\`

2. **setup-obsidian.sh 스크립트 재실행**:
   \`\`\`bash
   cd /path/to/your/vault
   ./setup-obsidian.sh
   \`\`\`

이렇게 하면 config.properties의 값이 이 파일에 자동으로 반영됩니다.

---

**생성 시각**: $(date '+%Y-%m-%d %H:%M:%S')
**스크립트 버전**: v2.0 (config.properties 통합)
**설정 소스**: ${CONFIG_FILE:-수동 입력}
EOF

echo -e "${GREEN}✅ 설정 파일 생성 완료: $CONFIG_MD${NC}"
echo ""

# .gitignore 확인 및 추가
if [ -f ".gitignore" ]; then
    if ! grep -q "obsidian-tts-config.md" ".gitignore"; then
        echo -e "\n# Obsidian TTS 설정 (민감 정보 포함)" >> ".gitignore"
        echo "obsidian-tts-config.md" >> ".gitignore"
        echo -e "${GREEN}✅ .gitignore에 설정 파일 추가됨${NC}"
    else
        echo -e "${GREEN}✅ .gitignore에 이미 설정 파일이 포함되어 있습니다${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .gitignore 파일이 없습니다${NC}"
    echo "   Git을 사용하는 경우, obsidian-tts-config.md를 .gitignore에 추가하세요:"
    echo ""
    echo "   echo 'obsidian-tts-config.md' >> .gitignore"
    echo ""
fi
echo ""

# 템플릿 다운로드 제안
echo "📦 TTS Reader 템플릿을 다운로드할까요?"
echo "   (Y/n)"
read -p "> " DOWNLOAD_TEMPLATE

DOWNLOAD_TEMPLATE=${DOWNLOAD_TEMPLATE:-Y}

if [[ "$DOWNLOAD_TEMPLATE" =~ ^[Yy]$ ]]; then
    echo "📥 템플릿 다운로드 중..."

    READER_FILE="TTS Reader.md"

    if command -v curl &> /dev/null; then
        curl -s -o "$READER_FILE" "https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/templates/tts-reader.md"
        echo -e "${GREEN}✅ TTS Reader 템플릿 다운로드 완료: $READER_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  curl이 설치되지 않았습니다${NC}"
        echo "   수동으로 템플릿을 다운로드하세요:"
        echo "   https://github.com/turtlesoup0/obsidian-tts/blob/main/templates/tts-reader.md"
    fi
else
    echo -e "${YELLOW}⏭️  템플릿 다운로드 건너뜀${NC}"
    echo "   필요 시 수동으로 다운로드하세요:"
    echo "   https://github.com/turtlesoup0/obsidian-tts/tree/main/templates"
fi
echo ""

# 완료 메시지
echo -e "${GREEN}🎉 설정이 완료되었습니다!${NC}"
echo ""
echo "다음 단계:"
echo "  1. Obsidian 재시작 (또는 Dataview 플러그인 새로고침)"
echo "  2. '$CONFIG_MD' 노트에서 설정 확인"
echo "  3. 'TTS Reader.md' 노트 열기"
echo "  4. 재생 버튼(▶️)으로 테스트"
echo ""

if [ -z "$AZURE_SPEECH_KEY" ]; then
    echo -e "${YELLOW}⚠️  참고: API 키가 설정되지 않았습니다${NC}"
    echo "   백엔드에서 환경변수로 API 키를 관리하는 경우 이는 정상입니다."
    echo "   프론트엔드에서 API 키를 관리하려면 config.properties에 추가하세요."
    echo ""
fi

echo "문제가 발생하면 QUICK-START-GUIDE.md의 '문제 해결' 섹션을 참조하세요."
echo ""
echo -e "${GREEN}✨ 즐거운 학습 되세요!${NC}"
