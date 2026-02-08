// ============================================
// Device ID 생성 유틸리티
// 중복 코드 제거를 위한 공통 모듈
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.getTTSDeviceId) {
    /**
     * TTS 시스템용 고유 Device ID 생성/반환
     * @returns {string} 디바이스 ID (예: "MacIntel-a1b2c3d4")
     */
    window.getTTSDeviceId = function() {
        let deviceId = localStorage.getItem('azureTTS_deviceId');
        if (!deviceId) {
            const platform = navigator.platform || 'unknown';
            const random = Math.random().toString(36).substring(2, 10);
            deviceId = `${platform}-${random}`;
            localStorage.setItem('azureTTS_deviceId', deviceId);
        }
        return deviceId;
    };

    window.ttsLog?.('✅ [common/device-id] 모듈 로드 완료');
}
