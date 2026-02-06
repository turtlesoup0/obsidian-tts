// ============================================
// TTSAutoMoveManager: SSE 전용 위치 상태 관리자
// 위치 동기화는 100% SSE 이벤트(tts-position-changed)로만 수행
// 폴링(setInterval) 완전 제거 - SPEC-SSE-ONLY
// ============================================

if (!window.TTSAutoMoveManager) {
    window.TTSAutoMoveManager = class TTSAutoMoveManager {
        constructor(noteId) {
            this.noteId = noteId;
            this.lastPosition = { index: -1, name: '' };
            this.enabled = false;
        }

        // SSE 이벤트에서 위치 변화 시 호출
        onPositionChanged() {
            window.ttsLog?.(`🔄 [AutoMove] SSE 위치 업데이트 수신 (${this.noteId})`);
        }

        enable() {
            this.enabled = true;
            window.ttsLog?.(`▶️ [AutoMove] 활성화: ${this.noteId} (SSE 전용, 폴링 없음)`);
        }
        disable() {
            this.enabled = false;
            window.ttsLog?.(`⏸️ [AutoMove] 비활성화: ${this.noteId}`);
        }
        setUIRefs(statusSpan, rows, scrollToRow) {
            this.statusSpan = statusSpan;
            this.rows = rows;
            this.scrollToRow = scrollToRow;
        }
        setupCleanupHandlers(container) {
            this.cleanupContainer = container;
        }
        cleanup() {
            this.disable();
            window.ttsAutoMoveTimers?.delete(this.noteId);
        }
    };

    window.ttsLog?.('✅ [integrated-ui/auto-move-manager] SSE 전용 모듈 로드 완료');
}
