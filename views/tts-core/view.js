// ============================================
// tts-core: 공유 유틸리티 모듈
// TTS 노트, 통합 노트 모두 첫 번째로 로드
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.fetchWithTimeout) {

    // 디버그 플래그 (localStorage 기반)
    window.TTS_DEBUG = localStorage.getItem('tts_debug') === 'true';

    // 조건부 로깅 함수
    window.ttsLog = function(...args) {
        if (window.TTS_DEBUG) console.log(...args);
    };

    // Fetch with Timeout (AbortController)
    window.fetchWithTimeout = async function(url, options = {}, timeoutMs = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`요청 시간 초과 (${timeoutMs/1000}초): ${url}`);
            }
            throw error;
        }
    };

    window.ttsLog('✅ [tts-core] 모듈 로드 완료');
}
