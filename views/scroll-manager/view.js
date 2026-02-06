// ============================================
// scroll-manager: ServerScrollPositionManager (통합 노트용)
// 의존성: tts-core, ConfigResolver (TASK-006)
// input: { config } - AZURE_FUNCTION_URL 포함 CONFIG 객체
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.scrollPositionManager) {

    // R4: 역호환성 유지 - ConfigResolver 사용 시도
    const CONFIG = input?.config || {
        AZURE_FUNCTION_URL: 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net'
    };

    // ============================================
    // ServerScrollPositionManager 클래스
    // ============================================
    class ServerScrollPositionManager {
        constructor(config) {
            // TASK-006: ConfigResolver 통합
            if (window.ConfigResolver) {
                this.apiEndpoint = window.ConfigResolver.resolveEndpoint('scroll');
            } else {
                // 역호환성: 기존 로직 유지
                this.apiEndpoint = config.AZURE_FUNCTION_URL + '/api/scroll-position';
            }
            this.deviceId = null;
            this.cache = null;
            this.cacheTime = null;
            this.cacheDuration = 60000; // 60초 캐시 (Azure 비용 절감)
        }

        init() {
            this.deviceId = this.getDeviceId();
            window.ttsLog('📱 Scroll Device ID:', this.deviceId);
        }

        getDeviceId() {
            const storageKey = 'scroll_deviceId';
            let deviceId = localStorage.getItem(storageKey);
            if (!deviceId) {
                deviceId = `${navigator.platform}-${Math.random().toString(36).substring(2, 10)}`;
                localStorage.setItem(storageKey, deviceId);
            }
            return deviceId;
        }

        isCacheValid() {
            return this.cache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheDuration);
        }

        async getPosition(forceRefresh = false) {
            if (!forceRefresh && this.isCacheValid()) return this.cache;

            // 로컬 모드에서는 서버 조회 스킵
            if (window.ttsModeConfig?.features?.positionSync === 'local') {
                window.ttsLog(`📱 로컬 모드 - 서버 스크롤 위치 조회 스킵`);
                return { savedNoteName: '', savedIndex: -1 };
            }

            try {
                const response = await window.fetchWithTimeout(this.apiEndpoint, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 10000);
                if (!response.ok) return { savedNoteName: '', savedIndex: -1 };
                const data = await response.json();
                this.cache = data;
                this.cacheTime = Date.now();
                return data;
            } catch (error) {
                console.error('Error getting scroll position:', error);
                return { savedNoteName: '', savedIndex: -1 };
            }
        }

        async savePosition(noteName, noteIndex) {
            try {
                const response = await window.fetchWithTimeout(this.apiEndpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ savedNoteName: noteName, savedIndex: noteIndex, deviceId: this.deviceId })
                }, 10000);
                if (!response.ok) return false;
                const result = await response.json();
                this.cache = { savedNoteName: noteName, savedIndex: noteIndex, timestamp: result.timestamp };
                this.cacheTime = Date.now();
                return true;
            } catch (error) {
                console.error('Error saving scroll position:', error);
                return false;
            }
        }

        async syncPosition() {
            const serverData = await this.getPosition();
            const localData = this.getLocalPosition();
            if (serverData.timestamp && serverData.timestamp > localData.timestamp) {
                this.saveLocalPosition(serverData.savedNoteName, serverData.savedIndex, serverData.timestamp);
                return { noteName: serverData.savedNoteName || '', noteIndex: serverData.savedIndex || -1 };
            }
            if (localData.timestamp > (serverData.timestamp || 0) && localData.noteIndex >= 0) {
                await this.savePosition(localData.noteName, localData.noteIndex);
            }
            return { noteName: localData.noteName, noteIndex: localData.noteIndex };
        }

        getLocalPosition() {
            return {
                noteName: localStorage.getItem('scroll_lastNoteName') || '',
                noteIndex: parseInt(localStorage.getItem('scroll_lastNoteIndex') || '-1', 10),
                timestamp: parseInt(localStorage.getItem('scroll_lastTimestamp') || '0', 10)
            };
        }

        saveLocalPosition(noteName, noteIndex, timestamp) {
            localStorage.setItem('scroll_lastNoteName', noteName);
            localStorage.setItem('scroll_lastNoteIndex', noteIndex.toString());
            localStorage.setItem('scroll_lastTimestamp', timestamp.toString());
        }
    }

    // 싱글톤 초기화
    window.scrollPositionManager = new ServerScrollPositionManager(CONFIG);
    window.scrollPositionManager.init();

    // 동적 엔드포인트 갱신 지원 (TASK-006)
    window.scrollPositionManager.refreshEndpoint = function() {
        if (window.ConfigResolver) {
            this.apiEndpoint = window.ConfigResolver.resolveEndpoint('scroll');
            window.ttsLog?.('🔄 Scroll Endpoint refreshed:', this.apiEndpoint);
        }
    };

    window.ttsLog('✅ Scroll Position Endpoint:', window.scrollPositionManager.apiEndpoint);

    // playbackPositionManager는 tts-position/view.js에서 동기 생성됨
    // 스텁 생성 제거: savePosition() 누락 문제 방지 (SPEC-POSITION-SYNC-001)
    if (window.playbackPositionManager) {
        window.ttsLog('✅ [scroll-manager] playbackPositionManager 확인됨 (tts-position에서 생성)');
    } else {
        window.ttsLog('⚠️ [scroll-manager] playbackPositionManager 없음 - tts-position 로드 순서 확인 필요');
    }

    window.ttsLog('✅ [scroll-manager] 모듈 로드 완료');
}
