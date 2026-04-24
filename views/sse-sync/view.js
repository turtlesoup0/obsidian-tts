// ============================================
// sse-sync: SSE 기반 실시간 동기화 (SPEC-PERF-001)
// 의존성: tts-core, tts-config
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.sseSyncManager) {

    const FALLBACK_EDGE_SERVER = 'http://100.107.208.106:5051';

    window.sseSyncManager = {
        // SSE 연결 상태
        playbackEventSource: null,
        isConnected: false,
        connectionMode: 'none',  // 'sse' | 'offline'

        // 엣지서버 URL
        edgeServerUrl: null,

        // 연결 재시도 설정 (지수 백오프)
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        baseReconnectDelay: 1000,   // 시작: 1초
        maxReconnectDelay: 30000,   // 최대: 30초
        recoveryCheckInterval: null, // 자동 복구 타이머

        // 마지막 수신 타임스탬프 (중복 처리 방지)
        lastReceivedTimestamp: 0,
        // JSON 파싱 에러 카운터 (연속 10회 실패 시 재연결)
        parseErrorCount: 0,

        /**
         * notePath로 pages 배열에서 해당 노트의 인덱스를 찾습니다.
         * SPEC-SYNC-002: 노트명 기반 TTS 위치 동기화
         */
        findIndexByNotePath(notePath) {
            const reader = window.ttsPlayer?.state;
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
         * SSE 매니저 초기화
         * Edge-First: ConfigResolver 불필요 (Obsidian webview에서 로드 불가)
         */
        async init(edgeServerUrl = null) {
            this.edgeServerUrl = edgeServerUrl
                || window.ttsEndpointConfig?.edgeServerUrl
                || window.ObsidianTTSConfig?.edgeServerUrl
                || FALLBACK_EDGE_SERVER;

            if (!this.edgeServerUrl) {
                console.log('⚠️ Edge server URL 미설정');
                this.connectionMode = 'offline';
                return false;
            }

            console.log(`🚀 SSE Sync Manager 초기화: ${this.edgeServerUrl}`);

            // 엣지서버 상태 확인
            const isHealthy = await this.checkEdgeServerHealth();

            if (!isHealthy) {
                console.log('⚠️ Edge 서버 미응답 - 자동 복구 모드');
                this.connectionMode = 'offline';
                this.scheduleRecoveryCheck();
                return false;
            }

            // SSE 연결 시작
            const success = await this.connect();

            if (success) {
                this.initPageVisibility();
                this.connectionMode = 'sse';
                console.log('✅ SSE 활성 - 실시간 동기화 모드');
            } else {
                this.connectionMode = 'offline';
                this.scheduleRecoveryCheck();
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
         * onopen/onerror 이벤트 기반으로 연결 성공/실패를 정확히 판단
         */
        async connect() {
            try {
                return await new Promise((resolve) => {
                    const CONNECTION_TIMEOUT = 5000;
                    let settled = false;

                    const timeout = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        console.error('❌ SSE 연결 타임아웃 (5초)');
                        resolve(false);
                    }, CONNECTION_TIMEOUT);

                    this.playbackEventSource = new EventSource(
                        `${this.edgeServerUrl}/api/events/playback`
                    );

                    this.playbackEventSource.addEventListener('playback', (e) => {
                        this.handlePlaybackEvent(e);
                    });

                    this.playbackEventSource.onopen = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeout);

                        const wasDisconnected = !this.isConnected;
                        this.isConnected = true;
                        this.reconnectAttempts = 0;

                        // 재연결 시에도 항상 이벤트 발행 (integrated-ui 통지)
                        if (this.connectionMode !== 'sse' || wasDisconnected) {
                            this.connectionMode = 'sse';
                            this.notifySSEStateChange(true);
                            if (wasDisconnected) {
                                console.log('🔄 SSE 재연결 완료');
                            }
                        }

                        console.log('🟢 SSE 연결 성공 - 실시간 동기화 활성');
                        resolve(true);
                    };

                    this.playbackEventSource.onerror = (error) => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timeout);
                            console.error('❌ SSE 연결 실패:', error);
                            resolve(false);
                        } else {
                            // 연결 후 발생한 에러 (연결 끊김)
                            console.error('❌ SSE 연결 에러:', error);
                            this.handleConnectionError();
                        }
                    };
                });
            } catch (error) {
                console.error('❌ SSE 연결 예외:', error);
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

                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (parseError) {
                    this.parseErrorCount++;
                    console.error(`❌ SSE JSON 파싱 오류 (${this.parseErrorCount}/10):`, parseError.message);
                    if (this.parseErrorCount >= 10) {
                        console.error('❌ JSON 파싱 연속 실패 - SSE 재연결');
                        this.parseErrorCount = 0;
                        this.handleConnectionError();
                    }
                    return;
                }
                this.parseErrorCount = 0; // 성공 시 리셋

                // heartbeat 메시지 무시
                if (data.type === 'heartbeat' || data.type === 'ping') {
                    return;
                }

                // 중복 이벤트 필터링 (타임스탬프 기반)
                if (data.timestamp && data.timestamp <= this.lastReceivedTimestamp) {
                    return;
                }

                this.lastReceivedTimestamp = data.timestamp || Date.now();
                console.log('📥 SSE playback update received:', data);

                // 필수 필드 검증
                if (data.lastPlayedIndex === undefined || data.lastPlayedIndex < 0) {
                    console.warn('⚠️ SSE 이벤트에 유효한 lastPlayedIndex 없음:', data);
                    return;
                }

                const localTimestamp = parseInt(
                    localStorage.getItem('ttsPlayer_lastPlayedTimestamp') || '0',
                    10
                );

                // localStorage 갱신 (타임스탬프 비교)
                const eventTimestamp = data.timestamp || Date.now();
                if (eventTimestamp > localTimestamp) {
                    localStorage.setItem('ttsPlayer_lastPlayedIndex', data.lastPlayedIndex.toString());
                    localStorage.setItem('ttsPlayer_lastPlayedTimestamp', eventTimestamp.toString());
                    localStorage.setItem('ttsPlayer_lastPlayedNotePath', data.notePath || '');
                }

                // updateUI: TTS 노트 전용 (ttsPlayer.state 없으면 스킵)
                // 실패해도 이벤트 발행은 반드시 수행
                let reconciledIndex = data.lastPlayedIndex;
                try {
                    reconciledIndex = this.updateUI(data.lastPlayedIndex, data.notePath, data.noteTitle);
                } catch (uiError) {
                    console.warn('⚠️ updateUI 실패 (통합노트에서는 정상):', uiError.message);
                }

                // TTS 위치 변경 이벤트 dispatch (integrated-ui 연동)
                // updateUI 실패와 무관하게 반드시 발행
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
            } catch (error) {
                console.error('❌ SSE 이벤트 처리 오류:', error);
            }
        },

        /**
         * UI 업데이트 (SPEC-SYNC-002: notePath 기반)
         */
        updateUI(lastPlayedIndex, notePath = null, noteTitle = null) {
            if (!window.ttsPlayer?.state) return lastPlayedIndex;

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

            window.ttsPlayer.state.lastPlayedIndex = targetIndex;

            if (typeof window.highlightCurrentSentence === 'function') {
                window.highlightCurrentSentence();
            }

            console.log(`✅ UI 업데이트: index=${targetIndex}, note="${noteTitle || 'N/A'}"`);
            return targetIndex;
        },

        /**
         * 연결 에러 처리 (지수 백오프 + 자동 복구)
         */
        handleConnectionError() {
            this.isConnected = false;
            this.notifySSEStateChange(false);

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;

                // 지수 백오프 + 지터: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
                const exponentialDelay = Math.min(
                    this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
                    this.maxReconnectDelay
                );
                const jitter = Math.random() * 1000;
                const delay = Math.round(exponentialDelay + jitter);

                console.log(
                    `🔄 SSE 재연결 대기... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) ${delay}ms 후`
                );

                setTimeout(() => {
                    this.disconnect();
                    this.connect().catch(error => {
                        console.error('❌ SSE 재연결 실패:', error);
                    });
                }, delay);
            } else {
                console.log('❌ SSE 재연결 한도 초과 - 자동 복구 모드 전환');
                this.connectionMode = 'offline';
                this.scheduleRecoveryCheck();
            }
        },

        /**
         * 자동 복구: 주기적으로 Edge 서버 상태 확인 → 복구 시 SSE 재연결
         */
        scheduleRecoveryCheck() {
            if (this.recoveryCheckInterval) return; // 중복 방지

            const RECOVERY_INTERVAL = 60000; // 60초
            console.log(`🔍 자동 복구 모드: ${RECOVERY_INTERVAL / 1000}초마다 서버 상태 확인`);

            this.recoveryCheckInterval = setInterval(async () => {
                if (this.connectionMode !== 'offline') {
                    clearInterval(this.recoveryCheckInterval);
                    this.recoveryCheckInterval = null;
                    return;
                }

                const isHealthy = await this.checkEdgeServerHealth();
                if (isHealthy) {
                    console.log('✅ Edge 서버 복구 감지 - SSE 재연결 시도');
                    clearInterval(this.recoveryCheckInterval);
                    this.recoveryCheckInterval = null;
                    this.reconnectAttempts = 0;
                    const success = await this.connect();
                    if (success) {
                        this.connectionMode = 'sse';
                        console.log('✅ SSE 자동 복구 완료');
                    }
                }
            }, RECOVERY_INTERVAL);
        },

        /**
         * SSE 상태 변경 알림 → integrated-ui에 sse-mode-changed 이벤트 전달
         */
        notifySSEStateChange(isConnected) {
            window.ttsLog?.(`📡 SSE 상태 변경: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);

            window.dispatchEvent(new CustomEvent('sse-mode-changed', {
                detail: {
                    mode: isConnected ? 'sse' : 'offline'
                }
            }));
        },

        /**
         * SSE 연결 해제
         */
        disconnect() {
            console.log('🔌 SSE 연결 해제...');

            if (this.isConnected) {
                this.notifySSEStateChange(false);
            }

            if (this.playbackEventSource) {
                this.playbackEventSource.close();
                this.playbackEventSource = null;
            }

            // 복구 타이머 정리
            if (this.recoveryCheckInterval) {
                clearInterval(this.recoveryCheckInterval);
                this.recoveryCheckInterval = null;
            }

            this.isConnected = false;
        },

        /**
         * Page Visibility API 초기화
         * 탭 숨김 시에도 SSE 유지 (PC에서 탭 전환해도 동기화 유지)
         * 연결 끊긴 경우에만 visible 복귀 시 재연결
         */
        initPageVisibility() {
            const handleVisibilityChange = () => {
                if (!document.hidden && !this.isConnected) {
                    console.log('📱 Page visible + SSE 끊김 감지 - 재연결');
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

    // 자동 초기화: 모듈 로드 시 SSE 연결 시작
    window.sseSyncManager.init().then(success => {
        if (success) {
            window.ttsLog?.('✅ [sse-sync] SSE 연결 성공 - 실시간 동기화 활성');
        } else {
            window.ttsLog?.('⚠️ [sse-sync] SSE 연결 실패 - 자동 복구 모드');
        }
    }).catch(err => {
        console.warn('⚠️ [sse-sync] 초기화 오류:', err.message);
    });

    // TTS 네임스페이스 등록
    if (window.TTS) {
        window.TTS.sse = window.sseSyncManager;
        window.TTS.registerModule('sse', window.sseSyncManager);
    }

    window.ttsLog?.('✅ [sse-sync] 모듈 로드 완료');
}
