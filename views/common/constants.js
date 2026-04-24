// ============================================
// 공통 상수 (Single Source of Truth)
// 모든 TTS 모듈에서 참조하는 하드코딩 값을 중앙 관리
// ============================================

if (!window.TTS_CONSTANTS) {
    window.TTS_CONSTANTS = {
        // Azure 의존성 제거 (2026-04-24) — Cloudflare Tunnel(tts.tech-insight.org)로 이전
        AZURE_FUNCTION_URL: '',
        EDGE_SERVER_URL: 'https://tts.tech-insight.org'
    };

    window.ttsLog?.('✅ [common/constants] 공통 상수 로드 완료');
}
