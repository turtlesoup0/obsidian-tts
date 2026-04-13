// ============================================
// tts-core: 공유 유틸리티 모듈
// TTS 노트, 통합 노트 모두 첫 번째로 로드
// ============================================

// TTS 네임스페이스: 가드 밖에서 항상 보장 (Dataview 리렌더링 시 소실 방지)
if (!window.TTS) {
    window.TTS = {
        version: '5.0',
        modules: {},  // 로드된 모듈 추적
        registerModule(name, ref) {
            this.modules[name] = ref;
            if (window.TTS_DEBUG) console.log(`[TTS] Module registered: ${name}`);
        }
    };
}

// 가드 패턴: 중복 로드 방지
if (!window.ttsLog) {

    // 디버그 플래그 (localStorage 기반)
    window.TTS_DEBUG = localStorage.getItem('tts_debug') === 'true';

    // 조건부 로깅 함수
    window.ttsLog = function(...args) {
        if (window.TTS_DEBUG) console.log(...args);
    };

    // fetchWithTimeout: tts-core가 모든 뷰의 첫 번째 로드이므로 여기서 정의 (Primary)
    // common/fetch-helpers.js에도 동일 가드 정의 존재 (tts-engine 독립 모듈용 Fallback)
    if (!window.fetchWithTimeout) {
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
                    throw new Error(`Request timeout after ${timeoutMs}ms`);
                }
                throw error;
            }
        };
    }

    // 네임스페이스에 core 유틸리티 등록
    window.TTS.log = window.ttsLog;
    window.TTS.fetchWithTimeout = window.fetchWithTimeout;
    window.TTS.registerModule('core', { log: window.ttsLog, fetchWithTimeout: window.fetchWithTimeout });

    window.ttsLog('✅ [tts-core] 모듈 로드 완료');
}
