// ============================================
// sse-sync: SSE 기반 실시간 동기화 (SPEC-PERF-001)
// 의존성: tts-core, tts-config, ConfigResolver (TASK-006, TASK-009)
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.sseSyncManager) {

    const FALLBACK_EDGE_SERVER = 'http://100.107.208.106:5051';

    window.sseSyncManager = {
        // SSE 연결 상태
        playbackEventSource: null,
        scrollEventSource: null,
        isConnected: false,
        connectionMode: 'none',  // 'sse' | 'polling' | 'offline'

        // 엣지서버 URL
        edgeServerUrl: null,

        // 연결 재시도 설정
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,

        // 마지막 수신 타임스탬프 (중복 처리 방지)
        lastReceivedTimestamp: 0,

        // TASK-009: ConfigResolver 참조
        configResolver: null,

        /**
         * notePath로 pages 배열에서 해당 노트의 인덱스를 찾습니다.
         * SPEC-SYNC-002: 노트명 기반 TTS 위치 동기화
         */
        findIndexByNotePath(notePath) {
            const reader = window.azureTTSReader;
            if (!reader || !reader.pages || !notePath) {
                return -1;
            }

            // 1차: 완전 일치
            let index = reader.pages.findIndex(page => page.file.path === notePath);

            // 2차: 부분 일치 (경로 끝 일치)
            if (index === -1) {
                index = reader.pages.findIndex(page =>
                    page.file.path.endsWith(notePath) ||
                    notePath.endsWith(page.file.path)
                );
            }

            // 3차: 파일명만 일치
            if (index === -1) {
                const fileName = notePath.split('/').pop();
                index = reader.pages.findIndex(page =>
                    page.file.name === fileName
                );
            }

            if (index !== -1) {
                window.ttsLog?.(`🔍 노트 찾음: "${notePath}" → index ${index}`);
            } else {
                console.warn(`⚠️ 노트 못찾음: "${notePath}", 인덱스 폴백 사용`);
            }

            return index;
        },

        /**
         * SSE 매니저 초기화 (TASK-009: ConfigResolver 통합)
         */
        async init(edgeServerUrl = null) {
            // TASK-006 & TASK-009: ConfigResolver 사용
            this.configResolver = window.ConfigResolver || null;

            // TASK-009: SSE 활성화 시 sync endpoint를 로컬로 자동 전환
            if (this.configResolver) {
                await this.configResolver.loadConfig();
                const mode = this.configResolver.getOperationMode();
                window.ttsLog?.('🔧 SSE Sync Mode:', mode);

                // Hybrid 모드에서 SSE 연결 시 endpoint 로컬 사용
                if (mode === 'hybrid') {
                    window.ttsLog?.('🔄 Hybrid mode: SSE 연결 시 로컬 endpoint 사용');
                }
            }

            this.edgeServerUrl = edgeServerUrl
                || window.ttsEndpointConfig?.edgeServerUrl
                || window.ObsidianTTSConfig?.edgeServerUrl
                || FALLBACK_EDGE_SERVER;

            if (!this.edgeServerUrl) {
                console.log('⚠️ Edge server URL not configured, using polling mode');
                this.connectionMode = 'polling';
                return false;
            }

            console.log(`🚀 Initializing SSE Sync Manager: ${this.edgeServerUrl}`);

            // 엣지서버 상태 확인
            const isHealthy = await this.checkEdgeServerHealth();

            if (!isHealthy) {
                console.log('⚠️ Edge server unavailable, falling back to polling mode');
                this.connectionMode = 'polling';
                if (window.playbackPositionManager?.startPolling) {
                    window.playbackPositionManager.startPolling();
                }
                return false;
            }

            // SSE 연결 시작
            const success = await this.connect();

            if (success) {
                // TASK-009: SSE 연결 성공 시 endpoint 갱신
                this.notifySSEStateChange(true);

                if (window.playbackPositionManager?.stopPolling) {
                    window.playbackPositionManager.stopPolling();
                }
                this.initPageVisibility();
                this.connectionMode = 'sse';
                console.log('✅ SSE mode active - polling stopped');
            } else {
                this.connectionMode = 'polling';
                if (window.playbackPositionManager?.startPolling) {
                    window.playbackPositionManager.startPolling();
                }
            }

            return success;
        },

        /**
         * 엣지서버 상태 확인
         */
        async checkEdgeServerHealth() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                const response = await fetch(`${this.edgeServerUrl}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ Edge server health check:', data);
                    return true;
                }
                return false;
            } catch (error) {
                console.log('❌ Edge server health check failed:', error.message);
                return false;
            }
        },

        /**
         * SSE 연결 시작
         */
        async connect() {
            try {
                this.playbackEventSource = new EventSource(
                    `${this.edgeServerUrl}/api/events/playback`
                );

                this.playbackEventSource.addEventListener('playback', (e) => {
                    this.handlePlaybackEvent(e);
                });

                this.playbackEventSource.onerror = (error) => {
                    console.error('❌ SSE connection error:', error);
                    this.handleConnectionError();
                };

                this.playbackEventSource.onopen = () => {
                    console.log('✅ SSE connection established');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;

                    // 재연결 시에도 SSE 모드 전환 알림 (폴링 중지)
                    if (this.connectionMode !== 'sse') {
                        this.connectionMode = 'sse';
                        this.notifySSEStateChange(true);
                        console.log('🔄 SSE reconnected - polling stopped');
                    }
                };

                await new Promise(resolve => setTimeout(resolve, 500));

                if (this.isConnected) {
                    console.log('🟢 SSE mode active - real-time sync enabled');
                    return true;
                }

                return false;
            } catch (error) {
                console.error('❌ SSE connection failed:', error);
                return false;
            }
        },

        /**
         * 재생 위치 이벤트 처리
         */
        handlePlaybackEvent(event) {
            try {
                // 빈 데이터 또는 heartbeat 무시
                if (!event.data || event.data.trim() === '' || event.data === ':') {
                    return;
                }

                const data = JSON.parse(event.data);

                // heartbeat 메시지 무시
                if (data.type === 'heartbeat' || data.type === 'ping') {
                    return;
                }

                if (data.timestamp && data.timestamp <= this.lastReceivedTimestamp) {
                    return;
                }

                this.lastReceivedTimestamp = data.timestamp;
                console.log('📥 SSE playback update received:', data);

                const localTimestamp = parseInt(
                    localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0',
                    10
                );

                if (data.timestamp > localTimestamp) {
                    localStorage.setItem('azureTTS_lastPlayedIndex', data.lastPlayedIndex.toString());
                    localStorage.setItem('azureTTS_lastPlayedTimestamp', data.timestamp.toString());
                    localStorage.setItem('azureTTS_lastPlayedNotePath', data.notePath || '');

                    // updateUI가 notePath 기반으로 reconciled index를 반환
                    const reconciledIndex = this.updateUI(data.lastPlayedIndex, data.notePath, data.noteTitle);

                    // R3: TTS 위치 변경 이벤트 dispatch (AutoMove 연동)
                    // reconciled index를 전달하여 integrated-ui에서 올바른 행으로 이동
                    window.dispatchEvent(new CustomEvent('tts-position-changed', {
                        detail: {
                            index: reconciledIndex,
                            noteTitle: data.noteTitle || '',
                            notePath: data.notePath || ''
                        }
                    }));

                    console.log(
                        `🔄 Synced from SSE: index=${data.lastPlayedIndex}, ` +
                        `note="${data.noteTitle}", device=${data.deviceId}`
                    );
                }
            } catch (error) {
                console.error('❌ Error processing SSE event:', error);
            }
        },

        /**
         * UI 업데이트 (SPEC-SYNC-002: notePath 기반)
         */
        updateUI(lastPlayedIndex, notePath = null, noteTitle = null) {
            if (!window.azureTTSReader) return lastPlayedIndex;

            let targetIndex = lastPlayedIndex;

            if (notePath) {
                const foundIndex = this.findIndexByNotePath(notePath);
                if (foundIndex !== -1) {
                    targetIndex = foundIndex;
                    if (foundIndex !== lastPlayedIndex) {
                        console.log(
                            `📊 인덱스 불일치 감지: ` +
                            `서버 index=${lastPlayedIndex}, ` +
                            `로컬 index=${foundIndex}, ` +
                            `note="${noteTitle}"`
                        );
                    }
                }
            }

            window.azureTTSReader.state.currentSentenceIndex = targetIndex;

            if (typeof window.highlightCurrentSentence === 'function') {
                window.highlightCurrentSentence();
            }

            console.log(`✅ UI 업데이트: index=${targetIndex}, note="${noteTitle || 'N/A'}"`);
            return targetIndex;
        },

        /**
         * 연결 에러 처리 (자동 재연결 + TASK-009)
         */
        handleConnectionError() {
            this.isConnected = false;

            // TASK-009: SSE 연결 해제 알림
            this.notifySSEStateChange(false);

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(
                    `🔄 Reconnecting SSE... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
                );

                setTimeout(() => {
                    this.disconnect();
                    this.connect();
                }, this.reconnectDelay);
            } else {
                console.log('❌ Max reconnection attempts reached, switching to polling mode');
                this.connectionMode = 'polling';

                // TASK-009: 폴링 모드로 전환 시 endpoint 복원
                if (window.scrollPositionManager?.refreshEndpoint) {
                    window.scrollPositionManager.refreshEndpoint();
                }

                if (window.playbackPositionManager?.startPolling) {
                    window.playbackPositionManager.startPolling();
                }
            }
        },

        /**
         * TASK-009: SSE 상태 변경 알림 (R3: 자동 endpoint 전환)
         */
        notifySSEStateChange(isConnected) {
            // SSE 연결 상태 변경 시 로그
            window.ttsLog?.(`📡 SSE 상태 변경: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);

            // R4: SSE 모드 변경 이벤트 dispatch (AutoMove 폴링 제어)
            window.dispatchEvent(new CustomEvent('sse-mode-changed', {
                detail: {
                    mode: isConnected ? 'sse' : 'polling'
                }
            }));

            // SSE 연결 시 로컬 endpoint 사용 강제
            if (isConnected && window.ConfigResolver) {
                window.ttsLog?.('🔄 SSE 활성화: 로컬 endpoint로 전환');
                // ConfigResolver의 isSSEActive()가 true를 반환하도록
                // 연결 상태를 갱신해야 함
            }

            // SSE 해제 시 Azure endpoint로 복원
            if (!isConnected && window.ConfigResolver) {
                const mode = window.ConfigResolver.getOperationMode();
                if (mode === 'hybrid') {
                    window.ttsLog?.('🔄 SSE 비활성화: Azure endpoint로 복원');
                    if (window.scrollPositionManager?.refreshEndpoint) {
                        window.scrollPositionManager.refreshEndpoint();
                    }
                }
            }
        },

        /**
         * SSE 연결 해제
         */
        disconnect() {
            console.log('🔌 Disconnecting SSE...');

            // TASK-009: 연결 해제 전 상태 변경 알림
            if (this.isConnected) {
                this.notifySSEStateChange(false);
            }

            if (this.playbackEventSource) {
                this.playbackEventSource.close();
                this.playbackEventSource = null;
            }

            if (this.scrollEventSource) {
                this.scrollEventSource.close();
                this.scrollEventSource = null;
            }

            this.isConnected = false;
        },

        /**
         * Page Visibility API 초기화 (배터리 절약)
         */
        initPageVisibility() {
            const handleVisibilityChange = () => {
                if (document.hidden) {
                    console.log('📴 Page hidden - disconnecting SSE to save battery');
                    this.disconnect();
                } else {
                    console.log('📱 Page visible - reconnecting SSE');
                    this.reconnectAttempts = 0;
                    this.connect();
                }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);
        },

        /**
         * 연결 상태 확인
         */
        isSSEActive() {
            return this.isConnected && this.connectionMode === 'sse';
        },

        /**
         * 현재 연결 모드 반환
         */
        getConnectionMode() {
            return this.connectionMode;
        }
    };

    window.ttsLog?.('✅ [sse-sync] 모듈 로드 완료 (awaiting initialization)');
}
