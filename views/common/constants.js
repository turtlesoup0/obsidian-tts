// ============================================
// 공통 상수 (Single Source of Truth)
// 모든 TTS 모듈에서 참조하는 하드코딩 값을 중앙 관리
// ============================================

if (!window.TTS_CONSTANTS) {
    window.TTS_CONSTANTS = {
        AZURE_FUNCTION_URL: 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net',
        EDGE_SERVER_URL: 'http://100.107.208.106:5051'
    };

    window.ttsLog?.('✅ [common/constants] 공통 상수 로드 완료');
}
