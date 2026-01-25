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

# Azure Function URL 입력
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

CONFIG_FILE="obsidian-tts-config.md"

cat > "$CONFIG_FILE" << EOF
---
해시태그: "#tts-config"
---

> 🔧 Obsidian TTS 설정 파일
> 이 노트는 git에 업로드되지 않습니다 (.gitignore에 포함)

# 설정

\`\`\`dataviewjs
window.ObsidianTTSConfig = {
    // Azure Function 백엔드 URL
    azureFunctionUrl: '$AZURE_FUNCTION_URL',

    // API 엔드포인트
    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    scrollPositionEndpoint: '/api/scroll-position',

    // 기본 TTS 설정
    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    defaultPitch: 0,
    defaultVolume: 100,

    // 캐시 설정
    enableOfflineCache: true,
    cacheTtlDays: 30,

    // 디버그 모드
    debugMode: false
};

console.log('✅ Obsidian TTS Config loaded:', window.ObsidianTTSConfig);
\`\`\`

# 사용 가이드

이 설정 파일은 TTS Reader 노트에서 자동으로 로드됩니다.

## 설정 변경

위의 \`window.ObsidianTTSConfig\` 객체의 값을 수정하세요.

### 음성 변경
\`\`\`javascript
defaultVoice: 'ko-KR-InJoonNeural'  // 남성 음성
\`\`\`

### 재생 속도 조절
\`\`\`javascript
defaultRate: 1.2  // 1.2배속
\`\`\`

### 디버그 모드 활성화
\`\`\`javascript
debugMode: true  // 콘솔에 상세 로그 출력
\`\`\`

## 다음 단계

1. TTS Reader 노트 생성 (템플릿 복사)
2. 샘플 노트로 재생 테스트
3. 자신의 노트에 \`정의\`, \`키워드\` 속성 추가

---

**생성 시각**: $(date '+%Y-%m-%d %H:%M:%S')
**스크립트 버전**: v1.0
EOF

echo -e "${GREEN}✅ 설정 파일 생성 완료: $CONFIG_FILE${NC}"
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
    echo "   Git을 사용하는 경우, obsidian-tts-config.md를 .gitignore에 추가하세요."
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
echo "  1. Obsidian 재시작"
echo "  2. '$CONFIG_FILE' 노트에서 설정 확인"
echo "  3. 'TTS Reader.md' 노트 열기"
echo "  4. 재생 버튼(▶️)으로 테스트"
echo ""
echo "문제가 발생하면 QUICK-START-GUIDE.md의 '문제 해결' 섹션을 참조하세요."
echo ""
echo -e "${GREEN}✨ 즐거운 학습 되세요!${NC}"
