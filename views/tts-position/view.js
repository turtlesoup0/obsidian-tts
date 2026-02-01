// ============================================
// tts-position: playbackPositionManager
// 재생 위치 동기화 (항상 Azure Function 직접 사용)
// 의존성: tts-core
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.playbackPositionManager) {

    // Azure Function에 직접 저장/조회 (프록시 경유 X)
    const PLAYBACK_POSITION_API = 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/playback-position';

    window.playbackPositionManager = {
        apiEndpoint: PLAYBACK_POSITION_API,
        deviceId: null,

        init() {
            this.deviceId = this.getDeviceId();
            window.ttsLog('📱 Device ID:', this.deviceId);
        },

        getDeviceId() {
            let deviceId = localStorage.getItem('azureTTS_deviceId');
            if (!deviceId) {
                const platform = navigator.platform || 'unknown';
                const random = Math.random().toString(36).substring(2, 10);
                deviceId = `${platform}-${random}`;
                localStorage.setItem('azureTTS_deviceId', deviceId);
            }
            return deviceId;
        },

        async getPosition() {
            try {
                const response = await window.fetchWithTimeout(this.apiEndpoint, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 10000);

                if (!response.ok) {
                    console.warn('⚠️ Failed to get server playback position');
                    return { lastPlayedIndex: -1, timestamp: 0 };
                }

                const data = await response.json();
                window.ttsLog('☁️ Server playback position:', data);
                return data;

            } catch (error) {
                console.error('❌ Error getting playback position:', error);
                return { lastPlayedIndex: -1, timestamp: 0 };
            }
        },

        async savePosition(lastPlayedIndex, notePath, noteTitle) {
            try {
                const response = await window.fetchWithTimeout(this.apiEndpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lastPlayedIndex,
                        notePath,
                        noteTitle,
                        deviceId: this.deviceId
                    })
                }, 10000);

                if (!response.ok) {
                    console.warn('⚠️ Failed to save playback position to server');
                    return false;
                }

                const result = await response.json();
                window.ttsLog(`☁️ Playback position saved to server: index=${lastPlayedIndex}, note="${noteTitle}"`);
                return true;

            } catch (error) {
                console.error('❌ Error saving playback position:', error);
                return false;
            }
        },

        async syncPosition(localIndex) {
            const serverData = await this.getPosition();
            const localTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);

            // 서버 데이터가 더 최신이면 서버 값 사용
            if (serverData.timestamp && serverData.timestamp > localTimestamp) {
                window.ttsLog(`🔄 Using server position (newer): index=${serverData.lastPlayedIndex}, device=${serverData.deviceId}`);

                localStorage.setItem('azureTTS_lastPlayedIndex', serverData.lastPlayedIndex.toString());
                localStorage.setItem('azureTTS_lastPlayedTimestamp', serverData.timestamp.toString());
                if (serverData.noteTitle) {
                    localStorage.setItem('azureTTS_lastPlayedTitle', serverData.noteTitle);
                }

                return serverData.lastPlayedIndex;
            }

            // 로컬이 더 최신이면 서버에 업데이트
            window.ttsLog(`📱 Using local position (newer or equal): index=${localIndex}`);

            if (localTimestamp > (serverData.timestamp || 0) && localIndex >= 0) {
                window.ttsLog('🔄 Syncing local position to server...');
                const pages = window.azureTTSReader?.pages;
                if (pages && pages[localIndex]) {
                    await this.savePosition(
                        localIndex,
                        pages[localIndex].file.path,
                        pages[localIndex].file.name
                    );
                }
            }

            return localIndex;
        }
    };

    // 초기화
    window.playbackPositionManager.init();
    window.ttsLog('✅ [tts-position] 모듈 로드 완료');
    window.ttsLog('✅ Playback Position Endpoint:', window.playbackPositionManager.apiEndpoint);
}
