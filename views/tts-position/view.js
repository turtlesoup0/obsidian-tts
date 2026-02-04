// ============================================
// tts-position: playbackPositionManager
// 재생 위치 동기화 (M4 Pro 서버 사용)
// 의존성: tts-core
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.playbackPositionManager) {

    // M4 Pro 서버에 직접 저장/조회
    const PLAYBACK_POSITION_API = 'http://100.107.208.106:5051/api/playback-position';

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
            // 로컬 모드에서는 서버 조회 스킵
            if (window.ttsModeConfig?.features?.positionSync === 'local') {
                window.ttsLog(`📱 로컬 모드 - 서버 위치 조회 스킵`);
                return { lastPlayedIndex: -1, timestamp: 0 };
            }

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
            const now = Date.now();

            // R1: 동기화 상태 UI 업데이트
            this.updateSyncStatusUI('syncing');

            // 서버 타임스탬프가 미래 너무 멀리 있으면 무시 (서버 시간 오류 처리)
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            const isServerTimeInvalid = serverData.timestamp && (serverData.timestamp > now + ONE_DAY_MS);

            if (isServerTimeInvalid) {
                window.ttsLog(`⚠️ Server timestamp too far in future, using local position: index=${localIndex}`);
                localStorage.setItem('azureTTS_lastPlayedTimestamp', now.toString());
                this.updateSyncStatusUI('local');
                return localIndex;
            }

            // 서버 데이터가 더 최신이면 서버 값 사용
            if (serverData.timestamp && serverData.timestamp > localTimestamp) {
                window.ttsLog(`🔄 Using server position (newer): index=${serverData.lastPlayedIndex}, device=${serverData.deviceId}`);

                localStorage.setItem('azureTTS_lastPlayedIndex', serverData.lastPlayedIndex.toString());
                localStorage.setItem('azureTTS_lastPlayedTimestamp', serverData.timestamp.toString());
                if (serverData.noteTitle) {
                    localStorage.setItem('azureTTS_lastPlayedTitle', serverData.noteTitle);
                }

                this.updateSyncStatusUI('server', serverData);
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
                this.updateSyncStatusUI('uploaded');
            } else {
                this.updateSyncStatusUI('local');
            }

            return localIndex;
        },

        // R4: 동기화 상태 UI 업데이트 함수
        updateSyncStatusUI(status, serverData = null) {
            const syncStatusDiv = document.getElementById('sync-status-info');
            const syncStatusText = document.getElementById('sync-status-text');

            if (!syncStatusDiv || !syncStatusText) return;

            const statusConfig = {
                syncing: {
                    icon: '🔄',
                    text: '서버 동기화 중...',
                    color: 'rgba(255,193,7,0.3)'
                },
                server: {
                    icon: '☁️',
                    text: `서버에서 동기화됨 (${serverData?.deviceId || '알 수 없음'}에서 업데이트)`,
                    color: 'rgba(76,175,80,0.3)'
                },
                uploaded: {
                    icon: '✅',
                    text: '서버에 업로드됨',
                    color: 'rgba(76,175,80,0.3)'
                },
                local: {
                    icon: '📱',
                    text: '로컬 상태 사용',
                    color: 'rgba(158,158,158,0.3)'
                }
            };

            const config = statusConfig[status] || statusConfig.local;
            syncStatusDiv.style.background = config.color;
            syncStatusText.textContent = `${config.icon} ${config.text}`;
        }
    };

    // 초기화
    window.playbackPositionManager.init();
    window.ttsLog('✅ [tts-position] 모듈 로드 완료');
    window.ttsLog('✅ Playback Position Endpoint:', window.playbackPositionManager.apiEndpoint);
}
