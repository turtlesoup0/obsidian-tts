// ============================================
// Fetch 타임아웃 래퍼
// API 요청 타임아웃 처리를 위한 공통 모듈
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.fetchWithTimeout) {
    /**
     * 타임아웃이 있는 fetch 요청
     * @param {string} url - 요청 URL
     * @param {RequestInit} options - fetch 옵션
     * @param {number} timeout - 타임아웃(ms), 기본값 10000
     * @returns {Promise<Response>} fetch 응답
     */
    window.fetchWithTimeout = async function(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    };

    window.ttsLog?.('✅ [common/fetch-helpers] 모듈 로드 완료');
}
