// ============================================
// APIThrottle: API 요청 중복 방지 및 쓰로틀링
// ============================================

if (!window.APIThrottle) {
    window.APIThrottle = class APIThrottle {
        constructor(minInterval = 2000) {
            this.minInterval = minInterval;
            this.lastRequestTime = 0;
            this.pendingRequest = null;
        }

        async fetch(endpoint, options = {}, timeout = 8000) {
            const now = Date.now();
            const elapsed = now - this.lastRequestTime;

            // 최소 간격 미달 시 대기
            if (elapsed < this.minInterval) {
                await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
            }

            // 진행 중인 요청이 있으면 재사용
            if (this.pendingRequest) {
                return this.pendingRequest;
            }

            // 새 요청 시작
            this.lastRequestTime = Date.now();
            this.pendingRequest = window.fetchWithTimeout(endpoint, options, timeout);

            try {
                return await this.pendingRequest;
            } finally {
                this.pendingRequest = null;
            }
        }

        reset() {
            this.pendingRequest = null;
        }
    };

    window.ttsLog?.('✅ [integrated-ui/api-throttle] 모듈 로드 완료');
}
