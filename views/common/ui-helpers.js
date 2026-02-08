// ============================================
// UI 생성 헬퍼 함수
// 버튼 및 UI 컴포넌트 생성을 위한 공통 모듈
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.createTTSButton) {
    /**
     * TTS 시스템용 플로팅 버튼 생성
     * @param {string} id - 버튼 ID
     * @param {string} text - 버튼 텍스트
     * @param {string} bgColor - 배경색 (CSS color 값)
     * @returns {HTMLButtonElement} 생성된 버튼 요소
     */
    window.createTTSButton = function(id, text, bgColor) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'in-action-btn';
        btn.textContent = text;
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${bgColor};
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            z-index: 1000;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: transform 0.2s;
        `;
        return btn;
    };

    /**
     * 모바일 디바이스 확인
     * @returns {boolean} 모바일이면 true
     */
    window.isMobileDevice = function() {
        return window.innerWidth < 768;
    };

    window.ttsLog?.('✅ [common/ui-helpers] 모듈 로드 완료');
}
