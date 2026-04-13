// ============================================
// StateLock: 상태 변경 시 Race Condition 방지
// 단순화된 구현 (queue 제거)
// ============================================

if (!window.StateLock) {
    window.StateLock = class StateLock {
        constructor() {
            this.locked = false;
            this.currentOwner = null;
        }

        async acquire(owner, timeoutMs = 5000) {
            const deadline = Date.now() + timeoutMs;
            while (this.locked) {
                // 수동 클릭 우선순위 - 진행 중인 작업이 자동 폴링이면 취소
                if (this.currentOwner === 'auto-polling' && owner === 'manual-click') {
                    window.ttsLog?.(`🔄 [StateLock] Manual click priority: canceling auto-polling`);
                    this.locked = false;
                    break;
                }
                if (Date.now() > deadline) {
                    window.ttsLog?.(`⚠️ [StateLock] Timeout: forced release (owner=${this.currentOwner}, requester=${owner})`);
                    this.locked = false;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            this.locked = true;
            this.currentOwner = owner;
        }

        release() {
            this.locked = false;
            this.currentOwner = null;
        }
    };

    window.ttsLog?.('✅ [integrated-ui/state-lock] 모듈 로드 완료');
}
