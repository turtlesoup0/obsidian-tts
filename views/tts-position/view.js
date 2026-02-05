// ============================================
// tts-position: playbackPositionManager
// 재생 위치 동기화 (동적 엔드포인트 설정 사용)
// 의존성: tts-core, tts-config
// ============================================

// fetchWithTimeout 인라인 fallback (모듈 로드 실패 대비)
if (!window.fetchWithTimeout) {
    window.fetchWithTimeout = async function(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error(`Request timeout after ${timeout}ms`);
            throw error;
        }
    };
}

// Load common modules (best effort - 로드 실패해도 초기화 진행)
(async () => {
    const loadScript = (src) => new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.type = 'text/javascript';
        script.onload = resolve;
        script.onerror = () => {
            console.warn(`⚠️ [tts-position] 모듈 로드 실패 (무시): ${src}`);
            resolve();
        };
        document.head.appendChild(script);
    });

    await loadScript('views/common/device-id.js');
    await loadScript('views/common/fetch-helpers.js');
    window.ttsLog?.('✅ [tts-position] 모듈 로드 시도 완료');

    // 모듈 로드 성공/실패와 무관하게 항상 초기화
    if (!window.playbackPositionManager) {
        initializePlaybackPositionManager();
    }
})();

// Initialization function (called after modules load)
function initializePlaybackPositionManager() {

    // ============================================
    // 동적 엔드포인트 계산 (tts-config 사용)
    // ============================================
    const getPlaybackPositionEndpoint = function() {
        // tts-config의 설정 확인
        const modeConfig = window.ttsModeConfig?.features?.positionSync;

        // 로컬 모드: M4 Pro 서버 직접 사용
        if (modeConfig === 'local') {
            const localUrl = window.ttsEndpointConfig?.localEdgeTtsUrl || 'http://100.107.208.106:5051';
            window.ttsLog('📍 Position Endpoint: Local M4 Pro Server', localUrl);
            return localUrl.replace(/\/api\/.*$/, '') + '/api/playback-position';
        }

        // Azure/hybrid 모드: Azure Function 사용
        const azureUrl = window.ttsEndpointConfig?.azureFunctionUrl || window.ACTIVE_BASE_URL;
        if (azureUrl) {
            window.ttsLog('📍 Position Endpoint: Azure Function', azureUrl);
            return azureUrl + '/api/playback-position';
        }

        // 폴백: 기본 Azure Function URL
        const fallbackUrl = 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net/api/playback-position';
        window.ttsLog('⚠️ Position Endpoint: Using fallback', fallbackUrl);
        return fallbackUrl;
    };

    const PLAYBACK_POSITION_API = getPlaybackPositionEndpoint();

    window.playbackPositionManager = {
        apiEndpoint: PLAYBACK_POSITION_API,
        apiEndpointGetter: getPlaybackPositionEndpoint,  // 동적 엔드포인트 계산 함수 저장
        deviceId: null,

        init() {
            this.deviceId = this.getDeviceId();
            window.ttsLog('📱 Device ID:', this.deviceId);
        },

        getDeviceId() {
            // 모듈 로드 성공 시 공통 함수 사용
            if (typeof window.getTTSDeviceId === 'function') {
                return window.getTTSDeviceId();
            }
            // fallback: 모듈 로드 실패 시 인라인 생성
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

            // R2: 타임스탬프 허용 오차 설정 (기본값: 5분)
            const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5분
            const adjustedTimestamp = serverData.timestamp || 0;
            const timeDiff = adjustedTimestamp - now;

            // R2.1 & R2.2: 미래 타임스탬프 감지 및 현재 시간으로 조정
            if (adjustedTimestamp > 0 && timeDiff > TIMESTAMP_TOLERANCE_MS) {
                // R2.3: 타임스탬프 조정 로깅
                window.ttsLog(`⚠️ Server timestamp adjustment: ${adjustedTimestamp} (diff: ${Math.round(timeDiff / 1000)}s future) → ${now}`);

                // 조정된 타임스탬프 사용
                const adjustedData = {
                    ...serverData,
                    timestamp: now
                };

                localStorage.setItem('azureTTS_lastPlayedTimestamp', now.toString());
                this.updateSyncStatusUI('timestamp-adjusted', adjustedData);

                // 로컬 위치 우선 사용 (서버 시간 오정)
                window.ttsLog(`📱 Using local position due to server time error: index=${localIndex}`);
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

        // R4: 동기화 상태 UI 업데이트 함수 (R2.4: 타임스탬프 조정 경고 포함)
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
                },
                'timestamp-adjusted': {
                    icon: '⚠️',
                    text: '서버 시간 오차 감지 → 현재 시간으로 조정됨',
                    color: 'rgba(255,152,0,0.3)'
                }
            };

            const config = statusConfig[status] || statusConfig.local;
            syncStatusDiv.style.background = config.color;
            syncStatusText.textContent = `${config.icon} ${config.text}`;
        }
    };

    // 초기화
    window.playbackPositionManager.init();

    // 동적 엔드포인트 로깅
    const currentEndpoint = window.playbackPositionManager.apiEndpointGetter();
    const modeConfig = window.ttsModeConfig?.features?.positionSync || 'unknown';
    window.ttsLog('✅ [tts-position] 모듈 로드 완료');
    window.ttsLog('✅ Position Sync Mode:', modeConfig);
    window.ttsLog('✅ Playback Position Endpoint:', currentEndpoint);
    window.ttsLog('✅ Position Endpoint Source:', currentEndpoint.includes('azure') ? 'Azure Function' : 'Local M4 Pro Server');
}
