// ============================================
// tts-position: playbackPositionManager
// 재생 위치 동기화 (동적 엔드포인트 설정 사용)
// 의존성: tts-core, tts-config
// ============================================

// fetchWithTimeout는 tts-core/common/fetch-helpers.js에서 로드됨
// 인라인 fallback 제거됨 (ST1 중복 통합)

// 동기 초기화: dv.view()가 async IIFE 완료를 기다리지 않는 문제 해결
// ConfigResolver는 Obsidian webview에서 로드 불가 (dead code 제거)
// Edge-First 아키텍처: 엔드포인트를 직접 계산하므로 ConfigResolver 불필요
if (!window.playbackPositionManager) {
    initializePlaybackPositionManager();
}
window.ttsLog?.('✅ [tts-position] 동기 초기화 완료');

// Initialization function (called after modules load)
function initializePlaybackPositionManager() {

    // ============================================
    // 동적 엔드포인트 계산 (Edge-First 아키텍처)
    // ============================================
    const FALLBACK_AZURE_URL = window.TTS_CONSTANTS?.AZURE_FUNCTION_URL || 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net';
    const FALLBACK_LOCAL_URL = window.TTS_CONSTANTS?.EDGE_SERVER_URL || 'http://100.107.208.106:5051';

    // Primary: 항상 Edge 서버 직접 반환 (ConfigResolver 우회)
    // 근본 수정: ConfigResolver의 hybrid 모드에서 SSE 비활성 시 Azure로 라우팅되는 버그 방지
    // position PUT은 반드시 Edge로 가야 SSE broadcast가 작동함
    const getPlaybackPositionEndpoint = function() {
        const edgeUrl = window.ttsEndpointConfig?.edgeServerUrl
            || window.ObsidianTTSConfig?.edgeServerUrl
            || FALLBACK_LOCAL_URL;
        return edgeUrl.replace(/\/$/, '') + '/api/playback-position';
    };

    // Fallback: Azure (Edge 서버 장애 시에만 사용)
    const getFallbackEndpoint = function() {
        const azureUrl = window.ttsEndpointConfig?.azureFunctionUrl
            || window.ObsidianTTSConfig?.azureFunctionUrl
            || FALLBACK_AZURE_URL;
        return azureUrl.replace(/\/$/, '') + '/api/playback-position';
    };

    const PLAYBACK_POSITION_API = getPlaybackPositionEndpoint();

    window.playbackPositionManager = {
        apiEndpoint: PLAYBACK_POSITION_API,
        apiEndpointGetter: getPlaybackPositionEndpoint,
        fallbackEndpointGetter: getFallbackEndpoint,
        deviceId: null,

        init() {
            this.deviceId = this.getDeviceId();
            window.ttsLog('📱 Device ID:', this.deviceId);
        },

        getDeviceId() {
            // 공통 모듈 사용 (common/device-id.js)
            return window.getTTSDeviceId();
        },

        async getPosition() {
            // 로컬 모드에서는 서버 조회 스킵
            if (window.ttsModeConfig?.features?.positionSync === 'local') {
                const savedIndex = parseInt(localStorage.getItem('azureTTS_lastPlayedIndex') || '-1', 10);
                const savedTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);
                const savedTitle = localStorage.getItem('azureTTS_lastPlayedTitle') || '';
                window.ttsLog(`📱 로컬 모드 - localStorage 위치 반환: index=${savedIndex}`);
                return { lastPlayedIndex: savedIndex, timestamp: savedTimestamp, noteTitle: savedTitle };
            }

            const _saveToLocal = (data) => {
                if (data.notePath) localStorage.setItem('azureTTS_lastPlayedNotePath', data.notePath);
                if (data.noteTitle) localStorage.setItem('azureTTS_lastPlayedTitle', data.noteTitle);
            };

            // Edge-First: Edge 서버 우선, 실패 시 Azure fallback
            try {
                const primaryEndpoint = this.apiEndpointGetter();
                const response = await window.fetchWithTimeout(primaryEndpoint, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 5000);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                _saveToLocal(data);
                window.ttsLog('✅ Edge 서버 위치 조회:', data);
                return data;
            } catch (primaryError) {
                window.ttsLog?.(`⚠️ Edge 서버 실패 (${primaryError.message}), Azure fallback 시도...`);

                try {
                    const fallbackEndpoint = this.fallbackEndpointGetter();
                    const response = await window.fetchWithTimeout(fallbackEndpoint, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    }, 10000);

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const data = await response.json();
                    _saveToLocal(data);
                    window.ttsLog('☁️ Azure fallback 위치 조회:', data);
                    return data;
                } catch (fallbackError) {
                    console.error('❌ Edge + Azure 모두 실패:', fallbackError.message);
                    return { lastPlayedIndex: -1, timestamp: 0 };
                }
            }
        },

        async savePosition(lastPlayedIndex, notePath, noteTitle) {
            const payload = JSON.stringify({
                lastPlayedIndex, notePath, noteTitle, deviceId: this.deviceId
            });

            // Edge-First: Edge 서버 우선 저장, 실패 시 Azure fallback
            try {
                const primaryEndpoint = this.apiEndpointGetter();
                window.ttsLog?.(`📤 [savePosition] PUT → ${primaryEndpoint} (index=${lastPlayedIndex}, note="${noteTitle}")`);
                const response = await window.fetchWithTimeout(primaryEndpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                }, 5000);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                await response.json();
                window.ttsLog(`✅ Edge 서버 위치 저장: index=${lastPlayedIndex}, note="${noteTitle}"`);
                return true;
            } catch (primaryError) {
                window.ttsLog?.(`⚠️ Edge 서버 저장 실패 (${primaryError.message}), Azure fallback 시도...`);
                console.error('❌ [savePosition] Edge PUT 실패 상세:', primaryError);

                try {
                    const fallbackEndpoint = this.fallbackEndpointGetter();
                    window.ttsLog?.(`📤 [savePosition] Fallback PUT → ${fallbackEndpoint}`);
                    const response = await window.fetchWithTimeout(fallbackEndpoint, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload
                    }, 10000);

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    await response.json();
                    window.ttsLog(`☁️ Azure fallback 위치 저장: index=${lastPlayedIndex}, note="${noteTitle}"`);
                    return true;
                } catch (fallbackError) {
                    console.error('❌ Edge + Azure 모두 저장 실패:', fallbackError.message);
                    return false;
                }
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

    // R2: SSE 상태 변경 시 캐시된 엔드포인트 갱신
    document.addEventListener('sse-mode-changed', (event) => {
        const newEndpoint = window.playbackPositionManager.apiEndpointGetter();
        window.playbackPositionManager.apiEndpoint = newEndpoint;
        window.ttsLog?.(`🔄 [tts-position] SSE 모드 변경 감지 - 엔드포인트 갱신: ${newEndpoint}`);
    });

    // 동적 엔드포인트 로깅
    const currentEndpoint = window.playbackPositionManager.apiEndpointGetter();
    const modeConfig = window.ttsModeConfig?.features?.positionSync || 'unknown';
    window.ttsLog('✅ [tts-position] 모듈 로드 완료');
    window.ttsLog('✅ Position Sync Mode:', modeConfig);
    window.ttsLog('✅ Playback Position Endpoint:', currentEndpoint);
    window.ttsLog('✅ Position Endpoint Source:', currentEndpoint.includes('azure') ? 'Azure Function' : 'Local M4 Pro Server');
}
