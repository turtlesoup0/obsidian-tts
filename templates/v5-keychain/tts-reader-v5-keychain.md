---
해시태그: "#검색제외"
---

> **📌 버전**: v5.0.0 (Keychain Security Update)
> **수정일**: 2026-01-30
> **주요 변경사항**:
> - 🔐 **Obsidian 1.11.5 Keychain 통합** - API 키를 안전하게 Keychain에 저장
> - 🛡️ 민감정보 완전 분리 - 코드에서 하드코딩된 API 키 제거
> - 🔑 자동 Keychain 연동 - 플러그인 재시작 없이 즉시 적용
>
> **기존 기능 (v4.3.0 유지)**:
> - ☁️ Azure Blob Storage 기반 디바이스 간 캐시 공유
> - 📱 오프라인 지원 (IndexedDB 기반 로컬 캐싱)
> - 🔄 이기종 디바이스 간 재생 위치 동기화
> - ⚡ 재생 속도 최적화 - 클라이언트 측 제어
> - 🎯 볼드 텍스트(**강조**)에 악센트 적용
> - 🎵 iOS 잠금 화면 연속 재생 지원 (Media Session API)
> - 🗣️ 발음 최적화 시스템 (40+ 기술 약어, 한국어 발음 교정)
> - ⚡ 3단계 캐시 전략: 오프라인 → 서버 → 새로 생성

```dataviewjs
// ============================================
// 🔧 설정 로드 (최우선 실행)
// ============================================
// obsidian-tts-config.md 파일을 찾아서 설정을 로드합니다.

(async function loadConfig() {
    // 이미 로드되었으면 스킵
    if (window.ObsidianTTSConfig) {
        console.log('✅ 설정이 이미 로드되어 있습니다.');
        return;
    }

    try {
        const vault = app.vault;
        const configFile = vault.getAbstractFileByPath('obsidian-tts-config.md');

        if (configFile) {
            console.log('📄 obsidian-tts-config.md 파일을 찾았습니다.');
            const content = await vault.read(configFile);

            // dataviewjs 블록 내의 코드를 추출하여 실행
            const codeMatch = content.match(/```dataviewjs\n([\s\S]*?)```/);
            if (codeMatch) {
                // 🔒 보안: eval() 대신 Function 생성자 + strict mode 사용
                try {
                    const safeExecute = new Function('"use strict"; ' + codeMatch[1]);
                    safeExecute();
                    console.log('✅ 설정 파일 로드 완료 (안전 모드)');
                    localStorage.setItem('tts-config-created', 'true');
                } catch (execError) {
                    console.error('❌ 설정 파일 실행 오류:', execError.message);
                }
            }
        } else {
            console.log('⚠️ obsidian-tts-config.md 파일이 없습니다. 기본 설정을 사용합니다.');
        }
    } catch (error) {
        console.error('❌ 설정 파일 로드 실패:', error);
    }
})();
```

```dataviewjs
// ============================================
// 💾 Offline Cache Manager (IndexedDB)
// ============================================

window.offlineCacheManager = {
    dbName: 'obsidian-tts-offline',
    dbVersion: 1,
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Offline cache database initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('audio')) {
                    const audioStore = db.createObjectStore('audio', { keyPath: 'cacheKey' });
                    audioStore.createIndex('timestamp', 'timestamp', { unique: false });
                    audioStore.createIndex('notePath', 'notePath', { unique: false });
                }
            };
        });
    },

    async ensureConnection() {
        if (!this.db || !this.db.objectStoreNames || this.db.objectStoreNames.length === 0) {
            console.log('🔄 Reconnecting to IndexedDB...');
            await this.init();
        }
    },

    async saveAudio(cacheKey, audioBlob, notePath) {
        await this.ensureConnection();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readwrite');
            const store = transaction.objectStore('audio');

            const data = {
                cacheKey,
                audioBlob,
                notePath,
                timestamp: Date.now(),
                size: audioBlob.size
            };

            const request = store.put(data);
            request.onsuccess = () => {
                console.log(`💾 Saved to offline cache: ${cacheKey} (${audioBlob.size} bytes)`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getAudio(cacheKey) {
        await this.ensureConnection();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readonly');
            const store = transaction.objectStore('audio');
            const request = store.get(cacheKey);

            request.onsuccess = () => {
                if (request.result) {
                    console.log(`📱 Retrieved from offline cache: ${cacheKey}`);
                    resolve(request.result.audioBlob);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getCacheStats() {
        await this.ensureConnection();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readonly');
            const store = transaction.objectStore('audio');
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result;
                const totalSize = items.reduce((sum, item) => sum + item.size, 0);
                resolve({
                    count: items.length,
                    totalSize,
                    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
                });
            };
            request.onerror = () => reject(request.error);
        });
    },

    async clearOldCache(daysOld = 30) {
        await this.ensureConnection();

        const threshold = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readwrite');
            const store = transaction.objectStore('audio');
            const index = store.index('timestamp');
            const request = index.openCursor();

            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.timestamp < threshold) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    console.log(`🗑️ Cleared ${deletedCount} old offline cache entries`);
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
};

// 초기화 및 진단
window.offlineCacheManager.init()
    .then(() => {
        console.log('✅ 오프라인 캐시 초기화 성공');
        // 간단한 테스트
        return window.offlineCacheManager.getCacheStats();
    })
    .then(stats => {
        console.log(`📱 오프라인 캐시: ${stats.count}개 파일, ${stats.totalSizeMB}MB`);
    })
    .catch(error => {
        console.error('❌ 오프라인 캐시 초기화 실패:', error);
        console.warn('⚠️ 오프라인 캐시를 사용할 수 없습니다. 서버 캐시만 사용됩니다.');
        console.warn('💡 iOS/iPadOS에서는 Private Browsing 모드에서 IndexedDB를 사용할 수 없습니다.');
    });

// ============================================
// ☁️ Server-Side Cache Manager (Azure Blob Storage)
// ============================================

window.serverCacheManager = {
    // 🔐 백엔드 Cache API 엔드포인트 (config 또는 Keychain에서 로드)
    cacheApiEndpoint: null,  // 초기화 시점에 설정됨

    // localStorage에서 통계 로드
    loadStats() {
        const saved = localStorage.getItem('serverCacheStats');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load cache stats:', e);
            }
        }
        return {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    },

    // localStorage에 통계 저장
    saveStats() {
        localStorage.setItem('serverCacheStats', JSON.stringify(this.stats));
    },

    stats: null,  // 초기화는 아래에서

    getNoteContent(page) {
        // ⚠️ 중요: TTS 생성 시와 동일한 텍스트 구성
        // 백엔드가 전체 텍스트에 cleanTextForTTS()를 적용하므로
        // 캐시 키 생성 시에도 동일하게 적용해야 함
        let textToSpeak = `주제: ${page.file.name}. `;

        if (page.정의) {
            const cleanDef = window.cleanTextForTTS(page.정의);
            textToSpeak += `정의: ${cleanDef}. `;
        }

        if (page.키워드) {
            let cleanKw = window.cleanTextForTTS(page.키워드);
            // 키워드 전체를 읽도록 변경 (길이 제한 제거)
            textToSpeak += `키워드: ${cleanKw}`;
        }

        // ✅ 백엔드가 전체 텍스트에 cleanTextForTTS()를 적용하므로
        // 캐시 키 생성 시에도 동일하게 적용
        return window.cleanTextForTTS(textToSpeak);
    },

    async hashContent(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24);
    },

    /**
     * 🔑 캐시 키 생성 (SHA-256 기반)
     *
     * 목적:
     * - 동일한 노트/내용/발음규칙에 대해 항상 동일한 캐시 키 생성
     * - 내용 또는 발음 규칙 변경 시 자동으로 새로운 키 생성 → 캐시 무효화
     *
     * 캐시 키 구성 요소:
     * 1. notePath: 노트 파일 경로 (예: "1_Project/정보 관리 기술사/AI.md")
     * 2. content: 실제 텍스트 내용
     * 3. PRONUNCIATION_PROFILE_VERSION: 발음 규칙 버전 (ko-v1.2)
     *
     * 버전 변경 시나리오:
     * - ko-v1.1 → ko-v1.2 업그레이드 시
     * - versionHash가 변경되어 기존 캐시 자동 무효화
     * - 새로운 발음 규칙으로 TTS 재생성
     *
     * @param {string} notePath - 노트 파일 경로
     * @param {string} content - 정제된 텍스트 내용
     * @returns {Promise<string>} 캐시 키 (예: "a1b2c3d4-e5f6g7h8-i9j0k1l2")
     */
    async generateCacheKey(notePath, content) {
        // 백엔드에서 동적으로 로드된 버전 사용
        const version = window.PRONUNCIATION_PROFILE_VERSION || 'ko-v1.2';

        // SHA-256 해시 생성 (24자로 단축)
        const noteHash = await this.hashContent(notePath);
        const contentHash = await this.hashContent(content);
        const versionHash = await this.hashContent(version);

        // 3개의 해시 조합: {노트}-{내용}-{버전}
        return `${noteHash}-${contentHash}-${versionHash}`;
    },

    async getCachedAudioFromServer(cacheKey) {
        try {
            this.stats.totalRequests++;
            this.saveStats();  // 즉시 저장
            console.log(`📥 Checking server cache: ${cacheKey}`);

            const response = await fetch(`${this.cacheApiEndpoint}/${cacheKey}`, {
                method: 'GET',
                headers: {
                    'Accept': 'audio/mpeg'
                }
            });

            if (response.status === 404) {
                console.log(`⚠️ Server cache MISS: ${cacheKey}`);
                this.stats.cacheMisses++;
                this.saveStats();  // 즉시 저장
                return null;
            }

            if (!response.ok) {
                console.error(`❌ Cache fetch failed: ${response.status}`);
                this.stats.cacheMisses++;
                this.saveStats();  // 즉시 저장
                return null;
            }

            const audioBlob = await response.blob();
            const cachedAt = response.headers.get('X-Cached-At');
            const expiresAt = response.headers.get('X-Expires-At');

            console.log(`💾 Server cache HIT: ${cacheKey} (${audioBlob.size} bytes) ⚡`);
            this.stats.cacheHits++;
            this.saveStats();  // 즉시 저장

            return {
                audioBlob,
                cachedAt,
                expiresAt,
                size: audioBlob.size
            };
        } catch (error) {
            console.error('❌ Server cache read failed:', error);
            this.stats.cacheMisses++;
            this.saveStats();  // 즉시 저장
            return null;
        }
    },

    async saveAudioToServer(cacheKey, audioBlob) {
        try {
            console.log(`📤 Saving to server cache: ${cacheKey} (${audioBlob.size} bytes)`);

            const response = await fetch(`${this.cacheApiEndpoint}/${cacheKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'audio/mpeg'
                },
                body: audioBlob
            });

            if (!response.ok) {
                console.error(`❌ Cache save failed: ${response.status}`);
                return false;
            }

            const result = await response.json();
            console.log(`✅ Server cached: ${cacheKey}, size: ${result.size} bytes`);
            return true;
        } catch (error) {
            console.error('❌ Cache save failed:', error);
            return false;
        }
    },

    getHitRate() {
        if (this.stats.totalRequests === 0) return 0;
        return ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(1);
    },

    // 서버에서 실제 캐시 파일 수 조회
    async getServerCacheCount() {
        try {
            const response = await fetch(`${this.cacheApiEndpoint}-stats`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('📊 Server cache stats:', data);
                return data;
            }
        } catch (error) {
            console.error('Failed to fetch server stats:', error);
        }
        return null;
    },

    resetStats() {
        this.stats.totalRequests = 0;
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
        this.saveStats();  // localStorage에도 반영
        console.log('🔄 Cache stats reset');
    }
};

// stats 초기화 (localStorage에서 로드)
window.serverCacheManager.stats = window.serverCacheManager.loadStats();
console.log('✅ Server Cache Manager loaded', window.serverCacheManager.stats);
```

```dataviewjs
// ============================================
// 🔄 Playback Position Sync Manager
// ============================================

window.playbackPositionManager = {
    // 🔐 API 엔드포인트 (config 또는 Keychain에서 로드)
    apiEndpoint: null,  // 초기화 시점에 설정됨
    deviceId: null,

    // 🔄 폴링 상태 관리
    pollingInterval: 5000,  // 기본 폴링 간격: 5초
    pollingTimer: null,
    isPolling: false,

    // 🔄 Optimistic UI 관련
    offlineQueue: [],
    isOnline: navigator.onLine,

    init() {
        // 디바이스 ID 생성 (브라우저 fingerprint)
        this.deviceId = this.getDeviceId();
        console.log('📱 Device ID:', this.deviceId);

        // 🔄 Page Visibility API 등록
        this.initPageVisibility();

        // 🔄 온라인/오프라인 상태 감지
        this.initConnectivityListeners();

        // 🔄 오프라인 큐에서 남은 작업 처리
        this.processOfflineQueue();
    },

    getDeviceId() {
        let deviceId = localStorage.getItem('azureTTS_deviceId');
        if (!deviceId) {
            // 간단한 디바이스 ID 생성 (Platform + Random)
            const platform = navigator.platform || 'unknown';
            const random = Math.random().toString(36).substring(2, 10);
            deviceId = `${platform}-${random}`;
            localStorage.setItem('azureTTS_deviceId', deviceId);
        }
        return deviceId;
    },

    // 🔄 온라인/오프라인 상태 감지 초기화
    initConnectivityListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Online detected - processing offline queue');
            this.processOfflineQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Offline detected - queueing position updates');
        });
    },

    // 🔄 오프라인 큐 처리
    async processOfflineQueue() {
        if (!this.isOnline || this.offlineQueue.length === 0) {
            return;
        }

        console.log(`🔄 Processing ${this.offlineQueue.length} queued updates`);

        const queue = [...this.offlineQueue];
        this.offlineQueue = [];

        for (const update of queue) {
            await this.savePosition(update.index, update.notePath, update.noteTitle);
        }
    },

    // 🔄 낙관적 위치 업데이트 (Optimistic Update)
    // 로컬 상태를 즉시 업데이트하고 백그라운드에서 서버 동기화
    optimisticUpdate(lastPlayedIndex, notePath, noteTitle) {
        const timestamp = Date.now();

        // 1. 즉시 로컬 상태 업데이트 (Optimistic)
        localStorage.setItem('azureTTS_lastPlayedIndex', lastPlayedIndex.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', timestamp.toString());
        console.log(`⚡ Optimistic update: index=${lastPlayedIndex}, note="${noteTitle}"`);

        // 2. 오프라인이면 큐에 추가, 온라인이면 즉시 서버 전송
        if (this.isOnline) {
            // 백그라운드에서 비동기 전송 (실패해도 UI는 이미 업데이트됨)
            this.savePosition(lastPlayedIndex, notePath, noteTitle).catch(error => {
                console.warn('⚠️ Background sync failed, queuing for retry:', error);
                this.offlineQueue.push({ index: lastPlayedIndex, notePath, noteTitle });
            });
        } else {
            // 오프라인이면 큐에 추가
            console.log('📴 Offline - queuing position update');
            this.offlineQueue.push({ index: lastPlayedIndex, notePath, noteTitle });
        }
    },

    // 🔄 폴링 시작 메서드
    startPolling(interval = null) {
        if (interval !== null) {
            this.pollingInterval = interval;
        }

        // 이미 폴링 중이면 중지
        if (this.isPolling) {
            this.stopPolling();
        }

        this.isPolling = true;
        console.log(`🔄 Starting playback position polling (interval: ${this.pollingInterval}ms)`);

        // 즉시 한 번 동기화 후 주기적 폴링 시작
        this.pollPosition();

        this.pollingTimer = setInterval(() => {
            this.pollPosition();
        }, this.pollingInterval);
    },

    // 🔄 폴링 중지 메서드
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.isPolling = false;
        console.log('⏸️ Stopped playback position polling');
    },

    // 🔄 위치 폴링 (내부 메서드)
    async pollPosition() {
        // 현재 로컬 위치 가져오기
        const localIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
        if (localIndex !== null) {
            await this.syncPosition(parseInt(localIndex, 10));
        }
    },

    // 🔄 Page Visibility API 초기화
    initPageVisibility() {
        // 페이지가 보이면 폴링 시작, 숨겨지면 폴링 중지
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // 페이지가 숨겨지면 폴링 중지 (배터리 절약)
                console.log('📴 Page hidden - stopping polling to save battery');
                this.stopPolling();
            } else {
                // 페이지가 다시 보이면 즉시 동기화 후 폴링 재개
                console.log('📱 Page visible - resuming polling with immediate sync');
                this.pollPosition();  // 즉시 동기화
                this.startPolling();  // 폴링 재개
            }
        };

        // 이벤트 리스너 등록
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 초기 상태 확인 (페이지가 이미 보이는 경우)
        if (!document.hidden) {
            this.startPolling();
        }
    },

    async getPosition() {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.warn('⚠️ Failed to get server playback position');
                return { lastPlayedIndex: -1, timestamp: 0 };
            }

            const data = await response.json();
            console.log('☁️ Server playback position:', data);
            return data;

        } catch (error) {
            console.error('❌ Error getting playback position:', error);
            return { lastPlayedIndex: -1, timestamp: 0 };
        }
    },

    async savePosition(lastPlayedIndex, notePath, noteTitle) {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lastPlayedIndex,
                    notePath,
                    noteTitle,
                    timestamp: Date.now(),
                    deviceId: this.deviceId
                })
            });

            if (!response.ok) {
                console.warn('⚠️ Failed to save playback position to server');
                return false;
            }

            const result = await response.json();
            console.log(`☁️ Playback position saved to server: index=${lastPlayedIndex}, note="${noteTitle}"`);
            return true;

        } catch (error) {
            console.error('❌ Error saving playback position:', error);
            return false;
        }
    },

    async syncPosition(localIndex) {
        // 서버에서 가져온 위치와 로컬 위치 비교
        const serverData = await this.getPosition();
        const localTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);

        // 서버 데이터가 더 최신이면 서버 값 사용
        if (serverData.timestamp && serverData.timestamp > localTimestamp) {
            console.log(`🔄 Using server position (newer): index=${serverData.lastPlayedIndex}, device=${serverData.deviceId}`);

            // 로컬에도 동기화
            localStorage.setItem('azureTTS_lastPlayedIndex', serverData.lastPlayedIndex.toString());
            localStorage.setItem('azureTTS_lastPlayedTimestamp', serverData.timestamp.toString());

            return serverData.lastPlayedIndex;
        }

        // 로컬이 더 최신이거나 같으면 로컬 값 사용
        console.log(`📱 Using local position (newer or equal): index=${localIndex}`);

        // 로컬이 더 최신이면 서버에 업데이트
        if (localTimestamp > (serverData.timestamp || 0) && localIndex >= 0) {
            console.log('🔄 Syncing local position to server...');
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
console.log('✅ Playback Position Sync Manager initialized');
```

```dataviewjs
// ============================================
// 🔄 Enhanced Playback State Manager (SPEC-SYNC-001)
// ============================================
// 향상된 재생 상태 동기화 - 오디오 위치, 재생 설정, 노트 컨텍스트 포함

window.playbackStateManager = {
    // API 엔드포인트 (config 또는 Keychain에서 로드)
    apiEndpoint: null,
    deviceId: null,
    sessionId: null,

    // 동기화 설정
    syncInterval: 5000,  // 5초
    syncTimer: null,
    isSyncing: false,

    // 오프라인 지원
    offlineQueue: [],
    isOnline: navigator.onLine,

    /**
     * 초기화 (개선됨 - 오프라인 큐 로드, Sync Status 초기화)
     */
    init() {
        this.deviceId = this.getDeviceId();
        this.sessionId = this.generateSessionId();
        console.log('📱 Playback State Device ID:', this.deviceId);
        console.log('🔄 Session ID:', this.sessionId);

        // 오프라인 큐 로드 (localStorage에서)
        this.loadOfflineQueue();

        // Page Visibility API 등록
        this.initPageVisibility();

        // 온라인/오프라인 상태 감지
        this.initConnectivityListeners();

        // 동기화 상태 표시기 초기화
        if (window.SyncStatusIndicator) {
            window.SyncStatusIndicator.init();
            window.SyncStatusIndicator.setStatus('idle', this.offlineQueue.length);
        }

        // 오프라인 큐에서 남은 작업 처리
        this.processOfflineQueue();
    },

    /**
     * 디바이스 ID 생성 (localStorage에 저장)
     */
    getDeviceId() {
        let deviceId = localStorage.getItem('azureTTS_stateDeviceId');
        if (!deviceId) {
            const platform = navigator.platform || 'unknown';
            const random = Math.random().toString(36).substring(2, 10);
            deviceId = `${platform}-${random}`;
            localStorage.setItem('azureTTS_stateDeviceId', deviceId);
        }
        return deviceId;
    },

    /**
     * 세션 ID 생성 (UUID v4 스타일)
     */
    generateSessionId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Page Visibility API 초기화
     */
    initPageVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopSyncTimer();
            } else {
                this.startSyncTimer();
                this.syncState(); // 즉시 동기화
            }
        });
    },

    /**
     * 온라인/오프라인 상태 감지 초기화 (개선됨 - 상태 표시기 연동)
     */
    initConnectivityListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Online detected - processing offline queue');

            // 상태 표시기 업데이트
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('syncing', this.offlineQueue.length);
            }

            this.processOfflineQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Offline detected - queueing state updates');

            // 상태 표시기 업데이트
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('offline');
            }
        });
    },

    /**
     * 오프라인 큐 처리 (개선됨 - 상태 표시기 연동, 큐 지속성)
     */
    async processOfflineQueue() {
        if (!this.isOnline || this.offlineQueue.length === 0) {
            return;
        }

        console.log(`🔄 Processing ${this.offlineQueue.length} queued state updates`);

        // 상태 표시기 업데이트
        if (window.SyncStatusIndicator) {
            window.SyncStatusIndicator.setStatus('syncing', this.offlineQueue.length);
        }

        const queue = [...this.offlineQueue];
        this.offlineQueue = [];

        // 큐 저장 (빈 큐)
        this.saveOfflineQueue();

        for (const state of queue) {
            await this.saveState(state);
        }

        // 상태 표시기 업데이트
        if (window.SyncStatusIndicator) {
            window.SyncStatusIndicator.setStatus('synced', 0);
        }
    },

    /**
     * 동기화 타이머 시작
     */
    startSyncTimer() {
        if (this.syncTimer) {
            return; // 이미 실행 중
        }

        this.isSyncing = true;
        console.log(`🔄 Starting playback state sync (interval: ${this.syncInterval}ms)`);

        this.syncTimer = setInterval(() => {
            this.syncState();
        }, this.syncInterval);
    },

    /**
     * 동기화 타이머 중지
     */
    stopSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.isSyncing = false;
        console.log('⏸️ Stopped playback state sync');
    },

    /**
     * 상태 저장 (서버에 전송, 개선됨 - 상태 표시기 연동)
     */
    async saveState(state) {
        try {
            const payload = {
                lastPlayedIndex: state.index,
                notePath: state.notePath,
                noteTitle: state.noteTitle,
                deviceId: this.deviceId,
                playbackState: {
                    currentTime: state.currentTime,
                    duration: state.duration,
                    status: state.status,
                    lastUpdated: Date.now()
                },
                playbackSettings: {
                    playbackRate: state.playbackRate,
                    volume: state.volume,
                    voiceId: state.voiceId
                },
                noteContext: {
                    contentHash: state.contentHash,
                    folderPath: state.folderPath,
                    dataviewQuery: state.dataviewQuery
                },
                sessionInfo: {
                    sessionId: this.sessionId,
                    deviceType: this.getDeviceType(),
                    platform: this.getPlatform(),
                    appVersion: '5.1.1'
                }
            };

            const response = await fetch(this.apiEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn('⚠️ Failed to save playback state to server');
                if (window.SyncStatusIndicator) {
                    window.SyncStatusIndicator.setStatus('error');
                }
                return false;
            }

            const result = await response.json();

            if (result.conflict) {
                console.warn('⚠️ 충돌 감지:', result.message);
                this.handleConflict(result.serverState);
                return true;
            }

            console.log(`☁️ Playback state saved: index=${state.index}, time=${state.currentTime}s`);
            return true;

        } catch (error) {
            console.error('❌ Error saving playback state:', error);
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('error');
            }
            return false;
        }
    },

    /**
     * 상태 불러오기 (서버에서 가져오기)
     */
    async loadState() {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.warn('⚠️ Failed to get server playback state');
                return null;
            }

            const state = await response.json();
            console.log('☁️ Server playback state retrieved:', state);

            if (state.lastPlayedIndex === -1) {
                return null;
            }

            return state;

        } catch (error) {
            console.error('❌ Error loading playback state:', error);
            return null;
        }
    },

    /**
     * 상태 동기화 (충돌 감지 및 해결, 개선됨 - 상태 표시기 연동)
     */
    async syncState() {
        const localState = this.getLocalState();

        if (!localState) {
            return;
        }

        // 상태 표시기 업데이트
        if (window.SyncStatusIndicator) {
            window.SyncStatusIndicator.setStatus('syncing');
        }

        const serverState = await this.loadState();

        if (!serverState) {
            // 서버에 데이터가 없으면 로컬 상태 저장
            await this.saveState(localState);
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('synced');
            }
            return;
        }

        // 타임스탬프 비교
        const localTimestamp = localState.playbackState?.lastUpdated || 0;
        const serverTimestamp = serverState.playbackState?.lastUpdated || 0;

        if (serverTimestamp > localTimestamp) {
            console.log('🔄 Using server state (newer)');
            this.applyServerState(serverState);
        } else if (localTimestamp > serverTimestamp) {
            console.log('📱 Using local state (newer) - syncing to server');
            await this.saveState(localState);
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('synced');
            }
        } else {
            // 타임스탬프가 같으면 동기화 완료로 표시
            if (window.SyncStatusIndicator) {
                window.SyncStatusIndicator.setStatus('synced');
            }
        }
    },

    /**
     * 로컬 상태 가져오기
     */
    getLocalState() {
        const savedState = localStorage.getItem('azureTTS_playbackState');
        return savedState ? JSON.parse(savedState) : null;
    },

    /**
     * 로컬 상태 저장
     */
    setLocalState(state) {
        localStorage.setItem('azureTTS_playbackState', JSON.stringify(state));
    },

    /**
     * 현재 오디오 위치 업데이트 (개선됨 - 큐 지속성)
     */
    updateCurrentTime(currentTime, duration) {
        const state = this.getLocalState() || {};
        state.playbackState = state.playbackState || {};
        state.playbackState.currentTime = currentTime;
        state.playbackState.duration = duration;
        state.playbackState.lastUpdated = Date.now();
        this.setLocalState(state);

        // 백그라운드 동기화
        if (this.isOnline) {
            this.saveState(state).catch(() => {
                this.offlineQueue.push(state);
                this.saveOfflineQueue();
            });
        } else {
            this.offlineQueue.push(state);
            this.saveOfflineQueue();
        }

        // 상태 표시기 업데이트
        if (window.SyncStatusIndicator && this.offlineQueue.length > 0) {
            window.SyncStatusIndicator.setStatus('offline', this.offlineQueue.length);
        }
    },

    /**
     * 재생 상태 업데이트 (개선됨 - 큐 지속성, 상태 표시기 연동)
     */
    updatePlaybackStatus(status) {
        const state = this.getLocalState() || {};
        state.playbackState = state.playbackState || {};
        state.playbackState.status = status; // 'playing', 'paused', 'stopped'
        state.playbackState.lastUpdated = Date.now();
        this.setLocalState(state);

        if (this.isOnline) {
            this.saveState(state).catch(() => {
                this.offlineQueue.push(state);
                this.saveOfflineQueue();
            });
        } else {
            this.offlineQueue.push(state);
            this.saveOfflineQueue();
        }

        // 상태 표시기 업데이트
        if (window.SyncStatusIndicator) {
            if (status === 'playing') {
                window.SyncStatusIndicator.setStatus('syncing', this.offlineQueue.length);
            } else if (this.offlineQueue.length > 0) {
                window.SyncStatusIndicator.setStatus('offline', this.offlineQueue.length);
            }
        }
    },

    /**
     * 재생 설정 업데이트 (개선됨 - 큐 지속성)
     */
    updatePlaybackSettings(playbackRate, volume, voiceId) {
        const state = this.getLocalState() || {};
        state.playbackSettings = state.playbackSettings || {};
        state.playbackSettings.playbackRate = playbackRate;
        state.playbackSettings.volume = volume;
        state.playbackSettings.voiceId = voiceId;
        state.playbackState = state.playbackState || {};
        state.playbackState.lastUpdated = Date.now();
        this.setLocalState(state);

        if (this.isOnline) {
            this.saveState(state).catch(() => {
                this.offlineQueue.push(state);
                this.saveOfflineQueue();
            });
        } else {
            this.offlineQueue.push(state);
            this.saveOfflineQueue();
        }
    },

    /**
     * 충돌 처리 (개선됨 - "이어서 듣기" 모달 사용)
     */
    handleConflict(serverState) {
        console.log('⚠️ 충돌 감지 - "이어서 듣기" 모달 표시');

        // "이어서 듣기" 모달 표시
        window.ContinueListeningModal.show(
            serverState,
            // "이어서 듣기" 클릭 시
            () => {
                console.log('▶️ 이어서 듣기 선택됨');
                this.applyServerState(serverState, true);
            },
            // "처음부터" 클릭 시
            () => {
                console.log('🔄 처음부터 선택됨');
                // 로컬 상태 유지하고 서버 상태 무시
                if (window.SyncStatusIndicator) {
                    window.SyncStatusIndicator.setStatus('synced');
                }
            },
            // 닫기 클릭 시
            () => {
                console.log('❌ 모달 닫힘 - 서버 상태 무시');
                if (window.SyncStatusIndicator) {
                    window.SyncStatusIndicator.setStatus('synced');
                }
            }
        );
    },

    /**
     * 서버 상태 적용 (개선됨)
     * @param {Object} serverState - 서버에서 가져온 상태
     * @param {boolean} resumePlayback - 이어서 재생 여부
     */
    applyServerState(serverState, resumePlayback = false) {
        this.setLocalState(serverState);

        // 이벤트 발생 (UI가 이를 감지하여 상태를 업데이트)
        const event = new CustomEvent('playbackStateSync', {
            detail: { ...serverState, resumePlayback }
        });
        window.dispatchEvent(event);

        console.log('✅ Server state applied', resumePlayback ? '(resume)' : '');

        if (window.SyncStatusIndicator) {
            window.SyncStatusIndicator.setStatus('synced');
        }
    },

    /**
     * 시간 포맷 (초 -> MM:SS)
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * 디바이스 타입 감지
     */
    getDeviceType() {
        const width = window.innerWidth;
        if (width < 768) return 'mobile';
        if (width < 1024) return 'tablet';
        return 'desktop';
    },

    /**
     * 플랫폼 감지
     */
    getPlatform() {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) return 'macos';
        if (platform.includes('win')) return 'windows';
        if (platform.includes('linux')) return 'linux';
        if (platform.includes('iphone') || platform.includes('ipad')) return 'ios';
        if (platform.includes('android')) return 'android';
        return 'unknown';
    },

    // ============================================
    // 🔄 오프라인 큐 지속성 (Phase 4)
    // ============================================

    /**
     * 오프라인 큐를 localStorage에 저장
     */
    saveOfflineQueue() {
        try {
            localStorage.setItem('azureTTS_offlineQueue', JSON.stringify(this.offlineQueue));
            console.log(`💾 오프라인 큐 저장됨: ${this.offlineQueue.length}개 항목`);
        } catch (error) {
            console.error('❌ 오프라인 큐 저장 실패:', error);
        }
    },

    /**
     * localStorage에서 오프라인 큐 로드
     */
    loadOfflineQueue() {
        try {
            const saved = localStorage.getItem('azureTTS_offlineQueue');
            if (saved) {
                this.offlineQueue = JSON.parse(saved);
                console.log(`📂 오프라인 큐 로드됨: ${this.offlineQueue.length}개 항목`);
            }
        } catch (error) {
            console.error('❌ 오프라인 큐 로드 실패:', error);
            this.offlineQueue = [];
        }
    }
};

// ============================================
// 🎨 UI Components (SPEC-SYNC-001 Phase 3)
// ============================================

/**
 * "이어서 듣기" 모달 컴포넌트
 * 다른 디바이스에서 재생 중인 상태를 표시하고 이어서 듣기 옵션 제공
 */
window.ContinueListeningModal = {
    modalElement: null,
    onContinue: null,
    onRestart: null,
    onClose: null,

    /**
     * 모달 표시
     * @param {Object} serverState - 서버에서 가져온 재생 상태
     * @param {Function} onContinue - "이어서 듣기" 클릭 시 콜백
     * @param {Function} onRestart - "처음부터" 클릭 시 콜백
     * @param {Function} onClose - 닫기 클릭 시 콜백
     */
    show(serverState, onContinue, onRestart, onClose) {
        this.onContinue = onContinue;
        this.onRestart = onRestart;
        this.onClose = onClose;

        // 기존 모달 제거
        this.hide();

        // 진행률 계산
        const currentTime = serverState.playbackState?.currentTime || 0;
        const duration = serverState.playbackState?.duration || 0;
        const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

        // 디바이스 정보 포맷
        const deviceInfo = this.formatDeviceInfo(serverState);

        // 모달 HTML 생성
        const modalHTML = `
            <div id="continue-listening-modal" class="cl-modal-overlay">
                <div class="cl-modal-content">
                    <div class="cl-modal-header">
                        <h2 class="cl-modal-title">🎧 이어서 듣기</h2>
                        <button class="cl-modal-close" aria-label="닫기">&times;</button>
                    </div>

                    <div class="cl-modal-body">
                        <div class="cl-note-info">
                            <div class="cl-note-icon">📄</div>
                            <div class="cl-note-details">
                                <div class="cl-note-title">${serverState.noteTitle || '알 수 없는 노트'}</div>
                                <div class="cl-note-path">${serverState.notePath || ''}</div>
                            </div>
                        </div>

                        <div class="cl-progress-section">
                            <div class="cl-progress-bar">
                                <div class="cl-progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <div class="cl-time-info">
                                <span class="cl-current-time">${this.formatTime(currentTime)}</span>
                                <span class="cl-duration">/ ${this.formatTime(duration)}</span>
                            </div>
                        </div>

                        <div class="cl-device-info">
                            <div class="cl-device-label">마지막 재생 디바이스</div>
                            <div class="cl-device-details">${deviceInfo}</div>
                        </div>

                        ${serverState.playbackSettings ? `
                            <div class="cl-settings-info">
                                <span class="cl-setting-item">⚡ ${serverState.playbackSettings.playbackRate}x</span>
                                <span class="cl-setting-item">🔊 ${serverState.playbackSettings.volume}%</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="cl-modal-footer">
                        <button class="cl-btn cl-btn-secondary" id="cl-restart-btn">
                            🔄 처음부터
                        </button>
                        <button class="cl-btn cl-btn-primary" id="cl-continue-btn">
                            ▶️ 이어서 듣기
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 모달 추가
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modalElement = document.getElementById('continue-listening-modal');

        // 이벤트 리스너 등록
        this.attachEventListeners();
    },

    /**
     * 모달 숨기기
     */
    hide() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    },

    /**
     * 이벤트 리스너 등록
     */
    attachEventListeners() {
        if (!this.modalElement) return;

        // 닫기 버튼
        this.modalElement.querySelector('.cl-modal-close').addEventListener('click', () => {
            this.hide();
            if (this.onClose) this.onClose();
        });

        // 배경 클릭 시 닫기
        this.modalElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('cl-modal-overlay')) {
                this.hide();
                if (this.onClose) this.onClose();
            }
        });

        // 이어서 듣기 버튼
        this.modalElement.querySelector('#cl-continue-btn').addEventListener('click', () => {
            this.hide();
            if (this.onContinue) this.onContinue();
        });

        // 처음부터 버튼
        this.modalElement.querySelector('#cl-restart-btn').addEventListener('click', () => {
            this.hide();
            if (this.onRestart) this.onRestart();
        });

        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.hide();
                if (this.onClose) this.onClose();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    },

    /**
     * 시간 포맷 (초 -> MM:SS)
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * 디바이스 정보 포맷
     */
    formatDeviceInfo(serverState) {
        const platform = serverState.sessionInfo?.platform || serverState.deviceId || 'unknown';
        const deviceType = serverState.sessionInfo?.deviceType || 'desktop';
        const platformNames = {
            'macos': 'Mac',
            'windows': 'Windows',
            'linux': 'Linux',
            'ios': 'iOS',
            'android': 'Android'
        };

        const platformName = platformNames[platform] || platform;
        const typeLabels = {
            'desktop': '데스크톱',
            'mobile': '모바일',
            'tablet': '태블릿'
        };

        return `${platformName} (${typeLabels[deviceType] || deviceType})`;
    }
};

/**
 * 동기화 상태 표시기 컴포넌트
 * 동기화 상태, 마지막 동기화 시간, 오프라인 큐 상태 표시
 */
window.SyncStatusIndicator = {
    element: null,
    currentStatus: 'idle', // idle, syncing, synced, error, offline
    lastSyncTime: null,
    offlineQueueCount: 0,
    updateTimer: null,

    /**
     * 상태 표시기 초기화
     */
    init() {
        // 기존 요소 제거
        const existing = document.getElementById('sync-status-indicator');
        if (existing) existing.remove();

        // 상태 표시기 HTML 생성
        const indicatorHTML = `
            <div id="sync-status-indicator" class="sync-indicator">
                <div class="sync-icon-wrapper">
                    <span class="sync-icon" id="sync-icon">🔄</span>
                    <span class="sync-pulse"></span>
                </div>
                <div class="sync-tooltip">
                    <div class="sync-status-text" id="sync-status-text">동기화 대기 중</div>
                    <div class="sync-time-text" id="sync-time-text"></div>
                    <div class="sync-queue-text" id="sync-queue-text" style="display: none;"></div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', indicatorHTML);
        this.element = document.getElementById('sync-status-indicator');

        // 상태 자동 새로고침 (1분마다)
        this.startAutoUpdate();
    },

    /**
     * 상태 업데이트
     * @param {string} status - 동기화 상태
     * @param {number} queueCount - 오프라인 큐 개수
     */
    setStatus(status, queueCount = 0) {
        this.currentStatus = status;
        this.lastSyncTime = Date.now();
        this.offlineQueueCount = queueCount;

        if (!this.element) return;

        const iconElement = document.getElementById('sync-icon');
        const statusText = document.getElementById('sync-status-text');
        const timeText = document.getElementById('sync-time-text');
        const queueText = document.getElementById('sync-queue-text');

        // 상태에 따른 아이콘과 텍스트 설정
        const statusConfig = {
            'idle': { icon: '⏸️', text: '동기화 대기 중' },
            'syncing': { icon: '🔄', text: '동기화 중...' },
            'synced': { icon: '✅', text: '동기화 완료' },
            'error': { icon: '⚠️', text: '동기화 오류' },
            'offline': { icon: '📴', text: '오프라인 모드' }
        };

        const config = statusConfig[status] || statusConfig['idle'];
        iconElement.textContent = config.icon;
        statusText.textContent = config.text;

        // 마지막 동기화 시간 표시
        if (status === 'synced' || status === 'error') {
            timeText.textContent = this.formatRelativeTime(this.lastSyncTime);
        } else {
            timeText.textContent = '';
        }

        // 오프라인 큐 표시
        if (queueCount > 0) {
            queueText.style.display = 'block';
            queueText.textContent = `대기 중: ${queueCount}개`;
        } else {
            queueText.style.display = 'none';
        }

        // 애니메이션 클래스 추가/제거
        this.element.classList.remove('sync-syncing', 'sync-error', 'sync-offline', 'sync-success');
        if (status === 'syncing') {
            this.element.classList.add('sync-syncing');
        } else if (status === 'error') {
            this.element.classList.add('sync-error');
        } else if (status === 'offline') {
            this.element.classList.add('sync-offline');
        } else if (status === 'synced') {
            this.element.classList.add('sync-success');
            // 3초 후 idle 상태로
            setTimeout(() => {
                if (this.currentStatus === 'synced') {
                    this.setStatus('idle');
                }
            }, 3000);
        }
    },

    /**
     * 자동 업데이트 시작
     */
    startAutoUpdate() {
        if (this.updateTimer) clearInterval(this.updateTimer);

        this.updateTimer = setInterval(() => {
            // 시간 텍스트 업데이트
            const timeText = document.getElementById('sync-time-text');
            if (timeText && (this.currentStatus === 'synced' || this.currentStatus === 'error')) {
                timeText.textContent = this.formatRelativeTime(this.lastSyncTime);
            }
        }, 60000); // 1분마다
    },

    /**
     * 상대적 시간 포맷
     */
    formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;

        const days = Math.floor(hours / 24);
        return `${days}일 전`;
    },

    /**
     * 제거
     */
    destroy() {
        if (this.updateTimer) clearInterval(this.updateTimer);
        if (this.element) this.element.remove();
    }
};

/**
 * 오프라인/온라인 충돌 해결 UI 컴포넌트
 * 오프라인 변경과 온라인 변경 간 충돌 해결
 */
window.ConflictResolutionModal = {
    modalElement: null,
    onResolve: null,

    /**
     * 충돌 해결 모달 표시
     * @param {Object} localState - 로컬(오프라인) 상태
     * @param {Object} serverState - 서버(온라인) 상태
     * @param {Function} onResolve - 해결 선택 시 콜백 (resolution: 'local' | 'server' | 'merge')
     */
    show(localState, serverState, onResolve) {
        this.onResolve = onResolve;

        // 기존 모달 제거
        this.hide();

        const modalHTML = `
            <div id="conflict-resolution-modal" class="cr-modal-overlay">
                <div class="cr-modal-content">
                    <div class="cr-modal-header">
                        <h2 class="cr-modal-title">⚠️ 충돌 해결 필요</h2>
                        <button class="cr-modal-close" aria-label="닫기">&times;</button>
                    </div>

                    <div class="cr-modal-body">
                        <p class="cr-description">
                            오프라인 동안 변경된 내용과 서버 상태가 다릅니다.
                            어떤 버전을 사용하시겠습니까?
                        </p>

                        <div class="cr-state-comparison">
                            <div class="cr-state-card cr-state-local">
                                <div class="cr-state-header">
                                    <span class="cr-state-icon">📱</span>
                                    <span class="cr-state-title">내 변경사항 (오프라인)</span>
                                </div>
                                <div class="cr-state-details">
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">노트:</span>
                                        <span class="cr-state-value">${localState.noteTitle || '알 수 없음'}</span>
                                    </div>
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">위치:</span>
                                        <span class="cr-state-value">${localState.lastPlayedIndex}번 (${window.playbackStateManager.formatTime(localState.playbackState?.currentTime || 0)})</span>
                                    </div>
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">상태:</span>
                                        <span class="cr-state-value">${localState.playbackState?.status || 'stopped'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="cr-state-divider">VS</div>

                            <div class="cr-state-card cr-state-server">
                                <div class="cr-state-header">
                                    <span class="cr-state-icon">☁️</span>
                                    <span class="cr-state-title">서버 상태</span>
                                </div>
                                <div class="cr-state-details">
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">노트:</span>
                                        <span class="cr-state-value">${serverState.noteTitle || '알 수 없음'}</span>
                                    </div>
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">위치:</span>
                                        <span class="cr-state-value">${serverState.lastPlayedIndex}번 (${window.playbackStateManager.formatTime(serverState.playbackState?.currentTime || 0)})</span>
                                    </div>
                                    <div class="cr-state-row">
                                        <span class="cr-state-label">상태:</span>
                                        <span class="cr-state-value">${serverState.playbackState?.status || 'stopped'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cr-modal-footer">
                        <button class="cr-btn cr-btn-secondary" id="cr-use-server">
                            ☁️ 서버 버전 사용
                        </button>
                        <button class="cr-btn cr-btn-primary" id="cr-use-local">
                            📱 내 버전 사용
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modalElement = document.getElementById('conflict-resolution-modal');

        this.attachEventListeners();
    },

    /**
     * 모달 숨기기
     */
    hide() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    },

    /**
     * 이벤트 리스너 등록
     */
    attachEventListeners() {
        if (!this.modalElement) return;

        // 닫기 버튼 (닫으면 서버 버전 사용)
        this.modalElement.querySelector('.cr-modal-close').addEventListener('click', () => {
            this.hide();
            if (this.onResolve) this.onResolve('server');
        });

        // 배경 클릭 시 닫기
        this.modalElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('cr-modal-overlay')) {
                this.hide();
                if (this.onResolve) this.onResolve('server');
            }
        });

        // 로컬 버전 사용
        this.modalElement.querySelector('#cr-use-local').addEventListener('click', () => {
            this.hide();
            if (this.onResolve) this.onResolve('local');
        });

        // 서버 버전 사용
        this.modalElement.querySelector('#cr-use-server').addEventListener('click', () => {
            this.hide();
            if (this.onResolve) this.onResolve('server');
        });

        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.hide();
                if (this.onResolve) this.onResolve('server');
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
};

// ============================================
// 🎨 CSS Styles for UI Components
// ============================================

/**
 * UI 컴포넌트 스타일 추가
 */
(function injectStyles() {
    const styleCSS = `
        /* ============================================
           이어서 듣기 모달 스타일
           ============================================ */
        .cl-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: cl-fadeIn 0.2s ease-out;
        }

        @keyframes cl-fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .cl-modal-content {
            background: var(--background-primary, #1e1e1e);
            border-radius: 12px;
            width: 90%;
            max-width: 480px;
            max-height: 85vh;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            animation: cl-slideUp 0.3s ease-out;
        }

        @keyframes cl-slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .cl-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid var(--background-modifier-border, #333);
        }

        .cl-modal-title {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--text-normal, #e0e0e0);
        }

        .cl-modal-close {
            background: none;
            border: none;
            font-size: 28px;
            color: var(--text-muted, #999);
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s;
        }

        .cl-modal-close:hover {
            background: var(--background-modifier-hover, #333);
            color: var(--text-normal, #e0e0e0);
        }

        .cl-modal-body {
            padding: 24px;
            overflow-y: auto;
            max-height: calc(85vh - 140px);
        }

        .cl-note-info {
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
            padding: 16px;
            background: var(--background-secondary, #2a2a2a);
            border-radius: 10px;
        }

        .cl-note-icon {
            font-size: 32px;
            flex-shrink: 0;
        }

        .cl-note-details {
            flex: 1;
            min-width: 0;
        }

        .cl-note-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-normal, #e0e0e0);
            margin-bottom: 4px;
            word-break: break-word;
        }

        .cl-note-path {
            font-size: 13px;
            color: var(--text-muted, #999);
            word-break: break-all;
        }

        .cl-progress-section {
            margin-bottom: 20px;
        }

        .cl-progress-bar {
            height: 8px;
            background: var(--background-modifier-border, #333);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .cl-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--interactive-accent, #7c3aed), var(--interactive-accent-hover, #8b5cf6));
            transition: width 0.3s ease;
        }

        .cl-time-info {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: var(--text-muted, #999);
        }

        .cl-device-info {
            margin-bottom: 16px;
            padding: 12px;
            background: var(--background-modifier-border, #333);
            border-radius: 8px;
        }

        .cl-device-label {
            font-size: 12px;
            color: var(--text-muted, #999);
            margin-bottom: 4px;
        }

        .cl-device-details {
            font-size: 14px;
            color: var(--text-normal, #e0e0e0);
        }

        .cl-settings-info {
            display: flex;
            gap: 12px;
            justify-content: center;
        }

        .cl-setting-item {
            padding: 8px 16px;
            background: var(--background-secondary, #2a2a2a);
            border-radius: 20px;
            font-size: 13px;
            color: var(--text-normal, #e0e0e0);
        }

        .cl-modal-footer {
            display: flex;
            gap: 12px;
            padding: 20px 24px;
            border-top: 1px solid var(--background-modifier-border, #333);
        }

        .cl-btn {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .cl-btn-primary {
            background: var(--interactive-accent, #7c3aed);
            color: var(--text-on-accent, #fff);
        }

        .cl-btn-primary:hover {
            background: var(--interactive-accent-hover, #8b5cf6);
        }

        .cl-btn-secondary {
            background: var(--background-secondary, #2a2a2a);
            color: var(--text-normal, #e0e0e0);
        }

        .cl-btn-secondary:hover {
            background: var(--background-modifier-hover, #333);
        }

        /* ============================================
           동기화 상태 표시기 스타일
           ============================================ */
        .sync-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
        }

        .sync-icon-wrapper {
            position: relative;
            width: 44px;
            height: 44px;
            background: var(--background-primary, #1e1e1e);
            border: 2px solid var(--background-modifier-border, #333);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .sync-indicator.sync-syncing .sync-icon-wrapper {
            border-color: var(--interactive-accent, #7c3aed);
            animation: sync-spin 1s linear infinite;
        }

        .sync-indicator.sync-error .sync-icon-wrapper {
            border-color: var(--text-error, #ef4444);
        }

        .sync-indicator.sync-offline .sync-icon-wrapper {
            border-color: var(--text-warning, #f59e0b);
        }

        .sync-indicator.sync-success .sync-icon-wrapper {
            border-color: var(--text-success, #10b981);
        }

        @keyframes sync-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .sync-icon {
            font-size: 20px;
            line-height: 1;
        }

        .sync-pulse {
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            border-radius: 50%;
            border: 2px solid var(--interactive-accent, #7c3aed);
            opacity: 0;
        }

        .sync-indicator.sync-syncing .sync-pulse {
            animation: pulse 1.5s ease-out infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(1.5); opacity: 0; }
        }

        .sync-tooltip {
            position: absolute;
            bottom: 54px;
            right: 0;
            background: var(--background-primary, #1e1e1e);
            border: 1px solid var(--background-modifier-border, #333);
            border-radius: 8px;
            padding: 10px 14px;
            min-width: 180px;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s;
            pointer-events: none;
        }

        .sync-icon-wrapper:hover + .sync-tooltip,
        .sync-indicator:hover .sync-tooltip {
            opacity: 1;
            visibility: visible;
        }

        .sync-status-text {
            font-size: 13px;
            font-weight: 500;
            color: var(--text-normal, #e0e0e0);
            margin-bottom: 4px;
        }

        .sync-time-text,
        .sync-queue-text {
            font-size: 11px;
            color: var(--text-muted, #999);
        }

        .sync-queue-text {
            color: var(--text-warning, #f59e0b);
        }

        /* ============================================
           충돌 해결 모달 스타일
           ============================================ */
        .cr-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: cr-fadeIn 0.2s ease-out;
        }

        @keyframes cr-fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .cr-modal-content {
            background: var(--background-primary, #1e1e1e);
            border-radius: 12px;
            width: 90%;
            max-width: 640px;
            max-height: 85vh;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            animation: cr-slideUp 0.3s ease-out;
        }

        @keyframes cr-slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .cr-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid var(--background-modifier-border, #333);
        }

        .cr-modal-title {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--text-error, #ef4444);
        }

        .cr-modal-close {
            background: none;
            border: none;
            font-size: 28px;
            color: var(--text-muted, #999);
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s;
        }

        .cr-modal-close:hover {
            background: var(--background-modifier-hover, #333);
            color: var(--text-normal, #e0e0e0);
        }

        .cr-modal-body {
            padding: 24px;
            overflow-y: auto;
            max-height: calc(85vh - 140px);
        }

        .cr-description {
            font-size: 14px;
            color: var(--text-muted, #999);
            margin-bottom: 20px;
            line-height: 1.5;
        }

        .cr-state-comparison {
            display: flex;
            gap: 16px;
            align-items: stretch;
        }

        .cr-state-card {
            flex: 1;
            background: var(--background-secondary, #2a2a2a);
            border-radius: 10px;
            overflow: hidden;
            border: 2px solid transparent;
            transition: all 0.2s;
        }

        .cr-state-card:hover {
            border-color: var(--interactive-accent, #7c3aed);
        }

        .cr-state-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background: var(--background-modifier-border, #333);
            border-bottom: 1px solid var(--background-modifier-border, #333);
        }

        .cr-state-icon {
            font-size: 20px;
        }

        .cr-state-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-normal, #e0e0e0);
        }

        .cr-state-details {
            padding: 16px;
        }

        .cr-state-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
        }

        .cr-state-row:last-child {
            margin-bottom: 0;
        }

        .cr-state-label {
            color: var(--text-muted, #999);
        }

        .cr-state-value {
            color: var(--text-normal, #e0e0e0);
            font-weight: 500;
            text-align: right;
            word-break: break-all;
        }

        .cr-state-divider {
            display: flex;
            align-items: center;
            font-size: 14px;
            font-weight: 700;
            color: var(--text-muted, #999);
        }

        .cr-modal-footer {
            display: flex;
            gap: 12px;
            padding: 20px 24px;
            border-top: 1px solid var(--background-modifier-border, #333);
        }

        .cr-btn {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .cr-btn-primary {
            background: var(--interactive-accent, #7c3aed);
            color: var(--text-on-accent, #fff);
        }

        .cr-btn-primary:hover {
            background: var(--interactive-accent-hover, #8b5cf6);
        }

        .cr-btn-secondary {
            background: var(--background-secondary, #2a2a2a);
            color: var(--text-normal, #e0e0e0);
        }

        .cr-btn-secondary:hover {
            background: var(--background-modifier-hover, #333);
        }

        /* 반응형 디자인 */
        @media (max-width: 640px) {
            .cr-state-comparison {
                flex-direction: column;
            }

            .cr-state-divider {
                display: none;
            }

            .cl-modal-content {
                width: 95%;
            }

            .sync-indicator {
                bottom: 16px;
                right: 16px;
            }
        }
    `;

    // 스타일 주입
    const styleElement = document.createElement('style');
    styleElement.textContent = styleCSS;
    document.head.appendChild(styleElement);
})();

console.log('✅ UI Components loaded (Continue Listening, Sync Status, Conflict Resolution)');

```dataviewjs
// ============================================
// 🎵 Azure TTS Reader with Enhanced Features
// ============================================

// ⚙️ 설정 로드 (obsidian-tts-config.md 또는 기본값)
const config = window.ObsidianTTSConfig || {
    // 기본 설정 (obsidian-tts-config.md가 없을 경우 사용)
    // 🔐 Azure Function URL은 Keychain에서 로드 (하드코딩 제거)
    azureFunctionUrl: '',  // Keychain: azure-function-url
    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    playbackStateEndpoint: '/api/playback-state',
    scrollPositionEndpoint: '/api/scroll-position',
    // 🔐 API 키는 Keychain에서 로드 (하드코딩 제거)
    azureFreeApiKey: '',  // Keychain: azure-tts-free-key
    azurePaidApiKey: '',  // Keychain: azure-tts-paid-key
    usePaidApi: false,
    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    enableOfflineCache: true,
    cacheTtlDays: 30,
    debugMode: false,
    // 🔄 위치 동기화 폴링 설정
    pollingEnabled: true,
    pollingInterval: 5000  // 밀리초 (5초)
};

// 설정 파일 존재 여부에 따라 메시지 표시
if (!window.ObsidianTTSConfig) {
    console.log('⚠️ obsidian-tts-config.md가 없습니다. 기본 설정을 사용합니다.');
    console.log('💡 보안을 위해 설정 파일 생성을 권장합니다 (데스크톱에서 setup-obsidian.sh 실행)');
} else {
    console.log('✅ obsidian-tts-config.md에서 설정을 로드했습니다.');
}

// 설정값 추출
const API_ENDPOINT = config.azureFunctionUrl + (config.ttsEndpoint || '/api/tts-stream');

// 🔐 Keychain에서 민감정보 로드 (Obsidian 1.11.5+)
async function loadSecretsFromKeychain() {
    try {
        // Keychain API 사용 가능 여부 확인
        if (!app.keychain) {
            console.warn('⚠️ Keychain API를 사용할 수 없습니다. Obsidian 1.11.5 이상이 필요합니다.');
            return {
                functionUrl: config.azureFunctionUrl || '',
                freeKey: config.azureFreeApiKey || '',
                paidKey: config.azurePaidApiKey || ''
            };
        }

        // Keychain에서 Azure Function URL 및 API 키 읽기
        const functionUrl = await app.keychain.getPassword('azure-function-url') || config.azureFunctionUrl || '';
        const freeKey = await app.keychain.getPassword('azure-tts-free-key') || config.azureFreeApiKey || '';
        const paidKey = await app.keychain.getPassword('azure-tts-paid-key') || config.azurePaidApiKey || '';

        if (functionUrl || freeKey || paidKey) {
            console.log('✅ Keychain에서 민감정보 로드 완료');
            console.log('   - Azure Function URL:', functionUrl ? '등록됨 (Keychain)' : '❌ 없음');
            console.log('   - 무료 API 키:', freeKey ? '등록됨 (Keychain)' : '❌ 없음');
            console.log('   - 유료 API 키:', paidKey ? '등록됨 (Keychain)' : '❌ 없음');
        } else {
            console.warn('⚠️ Keychain에 저장된 정보가 없습니다.');
            console.log('💡 설정 방법:');
            console.log('   Settings → About → Keychain에서 다음 키를 등록하세요:');
            console.log('   - azure-function-url: Azure Function URL');
            console.log('   - azure-tts-free-key: 무료 API 키');
            console.log('   - azure-tts-paid-key: 유료 API 키 (선택)');
        }

        return { functionUrl, freeKey, paidKey };
    } catch (error) {
        console.error('❌ Keychain 로드 실패:', error);
        return {
            functionUrl: config.azureFunctionUrl || '',
            freeKey: config.azureFreeApiKey || '',
            paidKey: config.azurePaidApiKey || ''
        };
    }
}

// 🔐 민감정보 로드 및 설정 업데이트
const secrets = await loadSecretsFromKeychain();

// Config에 Keychain 값 반영
if (secrets.functionUrl) {
    config.azureFunctionUrl = secrets.functionUrl;
}

// API 키 설정 (무료 F0 / 유료 S0)
if (!window.apiKeyConfig) {
    window.apiKeyConfig = {
        freeKey: secrets.freeKey,
        paidKey: secrets.paidKey,
        usePaidApi: config.usePaidApi || false
    };
}

// localStorage에서 API 키 선택 복원 (사용자가 UI에서 변경한 경우)
const savedApiMode = localStorage.getItem('azureTTS_usePaidApi');
if (savedApiMode !== null) {
    window.apiKeyConfig.usePaidApi = (savedApiMode === 'true');
}

console.log('✅ TTS Reader Config loaded:', {
    endpoint: API_ENDPOINT,
    usingPaidApi: window.apiKeyConfig.usePaidApi,
    configSource: window.ObsidianTTSConfig ? 'config file' : 'defaults'
});

// API 엔드포인트 유효성 검사
if (!API_ENDPOINT || API_ENDPOINT.includes('YOUR_AZURE_FUNCTION_URL')) {
    dv.paragraph("⚠️ **설정 필요**: Azure Function URL을 설정하세요.");
    dv.paragraph("배포 후 URL 예시: `https://your-app.azurewebsites.net`");
    dv.paragraph("💡 **Keychain 설정**: Settings → About → Keychain에서 `azure-function-url` 키를 등록하세요.");
} else {
    // 🔐 서버 엔드포인트 초기화 (Keychain 기반 URL 사용)
    if (window.serverCacheManager && !window.serverCacheManager.cacheApiEndpoint) {
        window.serverCacheManager.cacheApiEndpoint = config.azureFunctionUrl + (config.cacheEndpoint || '/api/cache');
        console.log('✅ Server Cache Endpoint:', window.serverCacheManager.cacheApiEndpoint);
    }

    if (window.playbackPositionManager && !window.playbackPositionManager.apiEndpoint) {
        window.playbackPositionManager.apiEndpoint = config.azureFunctionUrl + (config.playbackPositionEndpoint || '/api/playback-position');
        console.log('✅ Playback Position Endpoint:', window.playbackPositionManager.apiEndpoint);

        // 🔄 폴링 설정 적용
        if (config.pollingEnabled !== false) {
            window.playbackPositionManager.pollingInterval = config.pollingInterval || 5000;
            console.log('✅ Polling configured:', window.playbackPositionManager.pollingInterval, 'ms');
        } else {
            console.log('⚠️ Polling disabled by config');
        }
    }

    // 🔄 향상된 재생 상태 관리자 초기화 (SPEC-SYNC-001)
    if (window.playbackStateManager && !window.playbackStateManager.apiEndpoint) {
        window.playbackStateManager.apiEndpoint = config.azureFunctionUrl + (config.playbackStateEndpoint || '/api/playback-state');
        console.log('✅ Playback State Endpoint:', window.playbackStateManager.apiEndpoint);

        // 초기화 실행
        window.playbackStateManager.init();
        console.log('✅ Enhanced Playback State Manager initialized');
    }

    // 전역 변수 초기화
    window.azureTTSReader = window.azureTTSReader || {
        apiEndpoint: API_ENDPOINT,
        pages: [],
        currentIndex: 0,
        isPaused: false,
        isStopped: false,
        audioElement: null,
        playbackRate: 1.0,
        isLoading: false,
        totalCharsUsed: 0,
        lastPlayedIndex: -1  // 마지막 재생 위치 추적
    };

    // 출제예상 및 130~137회 기출 노트 검색
    let tagQuery = "#출제예상";
    for (let i = 130; i <= 137; i++) {
        tagQuery += ` or #${i}관 or #${i}응`;
    }

    window.azureTTSReader.pages = dv.pages(`"1_Project/정보 관리 기술사" and -#검색제외 and (${tagQuery})`)
        .sort(b => [b.file.folder, b.file.name], 'asc')
        .array();

    // 오디오 엘리먼트 생성 (iOS 백그라운드 재생 지원)
    if (!window.azureTTSReader.audioElement) {
        window.azureTTSReader.audioElement = new Audio();
        window.azureTTSReader.audioElement.preload = 'auto';

        // iOS Safari에서 백그라운드 재생 허용
        window.azureTTSReader.audioElement.setAttribute('playsinline', '');
        window.azureTTSReader.audioElement.setAttribute('webkit-playsinline', '');

        console.log('🎵 오디오 엘리먼트 생성 완료 (iOS 백그라운드 재생 지원)');
    }

    // 볼드 텍스트 추출 및 강조 처리
    window.extractBoldText = function(text) {
        if (!text) return { clean: '', boldParts: [] };

        const boldParts = [];
        let clean = String(text);

        // **텍스트** 패턴 찾기
        const boldRegex = /\*\*([^*]+)\*\*/g;
        let match;

        while ((match = boldRegex.exec(text)) !== null) {
            boldParts.push(match[1]);
        }

        // 마크다운 제거
        clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');

        return { clean, boldParts };
    };

    // SSML에 강조 추가하는 함수
    // 볼드는 백엔드에서 처리하므로 프론트엔드에서는 그대로 유지
    // 이 함수는 더 이상 사용하지 않음 (백엔드에서 **text**를 prosody로 변환)

    // ============================================
    // ✅ 백엔드와 100% 동일한 텍스트 정제 로직
    // ============================================

    /**
     * 🔄 발음 프로파일 버전 관리 (자동 동기화)
     *
     * 목적:
     * - 발음 규칙 변경 시 기존 캐시 자동 무효화
     * - 프론트엔드-백엔드 버전 불일치 방지
     *
     * 동작 방식:
     * 1. 백엔드 /api/version에서 최신 버전 조회
     * 2. 로컬 버전과 비교
     * 3. 불일치 시 경고 표시 및 자동 업데이트
     *
     * 버전 히스토리:
     * - ko-v1.0: 콜론 기반 음절 분리 (정:의)
     * - ko-v1.1: 텍스트 직접 치환 (정으이)
     * - ko-v1.2: 공백 기반 음절 분리 (정 의) ← 현재
     */
    window.PRONUNCIATION_PROFILE_VERSION = null;  // 백엔드에서 동적 로드

    // 백엔드에서 버전 가져오기 (자동 동기화)
    (async function syncVersionWithBackend() {
        try {
            const versionUrl = config.azureFunctionUrl.replace('/tts-stream', '/version');
            const response = await fetch(versionUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const versionData = await response.json();
                window.PRONUNCIATION_PROFILE_VERSION = versionData.pronunciationProfileVersion;
                console.log(`✅ 백엔드 버전 동기화 완료: ${window.PRONUNCIATION_PROFILE_VERSION}`);

                // 버전 불일치 경고 (deprecated 버전 사용 시)
                if (versionData.deprecatedVersions && versionData.deprecatedVersions.includes(window.PRONUNCIATION_PROFILE_VERSION)) {
                    console.warn('⚠️ 이전 버전을 사용 중입니다. 캐시가 무효화될 수 있습니다.');
                }
            } else {
                throw new Error(`Version API failed: ${response.status}`);
            }
        } catch (error) {
            // Fallback: 하드코딩된 버전 사용
            console.warn('⚠️ 백엔드 버전 조회 실패. 기본값 사용:', error.message);
            window.PRONUNCIATION_PROFILE_VERSION = 'ko-v1.2';  // Fallback
        }
    })();

    /**
     * 📚 기술 약어 발음 사전
     *
     * 목적:
     * - 영문 약어를 한글 발음으로 정확하게 변환
     * - TTS가 "API"를 "아피"가 아닌 "에이피아이"로 읽도록 함
     *
     * 적용 순서:
     * - 긴 약어부터 매칭 (예: "REST API" → "REST 에이피아이" 먼저, 그 다음 "API" → "에이피아이")
     * - applyPronunciation() 함수에서 자동 정렬 처리
     *
     * 유지보수:
     * - 새로운 약어 추가 시 카테고리별로 정리
     * - 백엔드 shared/textCleaner.js의 PRONUNCIATION_DICT와 동일하게 유지
     */
    window.PRONUNCIATION_DICT = {
        // 웹 기술
        'API': '에이피아이', 'HTTP': '에이치티티피', 'HTTPS': '에이치티티피에스',
        'HTML': '에이치티엠엘', 'CSS': '씨에스에스', 'JSON': '제이슨',
        'XML': '엑스엠엘', 'URL': '유알엘', 'URI': '유알아이',

        // 데이터베이스
        'SQL': '에스큐엘', 'NoSQL': '노에스큐엘', 'DB': '디비', 'DBMS': '디비엠에스',

        // 인공지능/머신러닝
        'AI': '인공지능', 'ML': '머신러닝', 'DL': '딥러닝', 'IoT': '아이오티',

        // 하드웨어
        'CPU': '씨피유', 'GPU': '지피유', 'RAM': '램',
        'SSD': '에스에스디', 'HDD': '에이치디디',

        // 네트워크
        'IP': '아이피', 'TCP': '티씨피', 'UDP': '유디피',
        'DNS': '디엔에스', 'VPN': '브이피엔', 'NW': '네트워크',

        // 프로그래밍
        'OS': '오에스', 'IDE': '아이디이', 'SDK': '에스디케이',
        'CLI': '씨엘아이', 'GUI': '지유아이',

        // 기타
        'IT': '아이티', 'SW': '소프트웨어', 'HW': '하드웨어'
    };

    /**
     * 🔤 한국어 발음 교정 사전
     *
     * 문제:
     * - Azure TTS가 "정의"를 "정에"로 잘못 발음
     * - 한글 "의"의 발음 규칙이 복잡 (단어 첫음절: "의", 중간/끝: "이", 조사: "에")
     *
     * 해결책:
     * - SSML phoneme은 한국어 미지원 (테스트 결과 확인)
     * - 공백 삽입으로 음절 분리: "정의" → "정 의"
     * - TTS가 두 음절로 인식하여 정확한 발음 유도
     *
     * 적용 방식:
     * - applyKoreanPronunciationFixes() 함수에서 전역 매칭
     * - 텍스트 정제 파이프라인의 4단계에서 실행
     */
    window.KOREAN_PRONUNCIATION_FIXES = {
        '정의': '정 의',
        '의존': '의 존',
        '의의': '의 의',
        '회의': '회 의',
        '합의': '합 의',
        '동의': '동 의',
        '의미': '의 미',
    };

    // ============================================
    // Phase 2: 특수문자 정규화
    // ============================================
    /**
     * 🔧 특수문자 정규화 함수
     *
     * 목적:
     * - 마크다운 및 기술 문서에서 자주 사용되는 특수문자를 음성 친화적으로 변환
     * - TTS가 자연스럽게 읽을 수 있도록 텍스트 전처리
     *
     * 처리 항목:
     * 1. 하이픈으로 연결된 단어: "데이터-분석" → "데이터 분석"
     * 2. 슬래시로 구분된 단어: "TCP/IP" → "TCP IP"
     * 3. 화살표: "A -> B" → "A B" (자연스러운 흐름)
     * 4. 범위 표시: "100~200" → "100에서 200까지"
     *
     * @param {string} text - 정규화할 텍스트
     * @returns {string} 정규화된 텍스트
     *
     * 예시:
     * - 입력: "클라우드-네이티브 아키텍처의 성능은 100~200 TPS"
     * - 출력: "클라우드 네이티브 아키텍처의 성능은 100에서 200까지 TPS"
     */
    window.normalizeSpecialChars = function(text) {
        if (!text) return '';

        // 1. 하이픈으로 연결된 한글/영문 단어 분리
        // "데이터-분석" → "데이터 분석"
        text = text.replace(/([가-힣])-([가-힣])/g, '$1 $2');

        // 2. 슬래시로 구분된 한글/영문 단어 분리
        // "TCP/IP" → "TCP IP"
        text = text.replace(/([가-힣A-Z])\/([가-힣A-Z])/g, '$1 $2');

        // 3. 화살표 변환 (공백으로)
        // "요청 -> 응답" → "요청 응답"
        text = text.replace(/->|=>|→/g, ' ');

        // 4. 범위 표시 (~) 자연어 변환
        // "100~200" → "100에서 200까지"
        text = text.replace(/(\d+)\s*~\s*(\d+)/g, '$1에서 $2까지');

        return text;
    };

    // ============================================
    // Phase 1: 개조식 문장 교정
    // ============================================
    window.fixBulletEndings = function(text) {
        if (!text) return '';
        // 개조식 어미 뒤에 마침표 추가
        text = text.replace(/([가-힣]+[함임됨])\s*$/gm, '$1.');
        return text;
    };

    // ============================================
    // Phase 2: 한국어 발음 교정
    // ============================================
    window.applyKoreanPronunciationFixes = function(text) {
        if (!text) return '';

        for (const [word, fix] of Object.entries(window.KOREAN_PRONUNCIATION_FIXES)) {
            const regex = new RegExp(`\\b${word}\\b`, 'g');
            text = text.replace(regex, fix);
        }

        return text;
    };

    window.applyPronunciation = function(text) {
        let result = text;
        const terms = Object.keys(window.PRONUNCIATION_DICT).sort((a, b) => b.length - a.length);
        for (const term of terms) {
            const regex = new RegExp('\\b' + term + '\\b', 'gi');
            result = result.replace(regex, window.PRONUNCIATION_DICT[term]);
        }
        return result;
    };

    window.improveDefinitionPauses = function(text) {
        if (!text) return '';
        text = text.replace(/\.\s+/g, '. ');
        text = text.replace(/\?\s+/g, '? ');
        text = text.replace(/!\s+/g, '! ');
        text = text.replace(/(다|요|임|음)\s+/g, '$1. ');
        return text;
    };

    window.cleanTextForTTS = function(text) {
        if (!text) return "";

        let cleaned = String(text);

        // ============================================
        // 파이프라인 순서 (백엔드와 100% 동일)
        // ============================================

        // 1. Markdown 정제
        cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/`[^`]+`/g, '');
        cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
        cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
        cleaned = cleaned.replace(/___([^_]+)___/g, '$1');
        cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
        cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
        cleaned = cleaned.replace(/\\/g, '');
        cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
        cleaned = cleaned.replace(/^>\s+/gm, '');
        cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '');
        cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
        cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');
        cleaned = cleaned.replace(/#[\w가-힣]+/g, '');
        cleaned = cleaned.replace(/\s+/g, ' ');

        // 2. 특수문자 정규화 (Phase 2)
        cleaned = window.normalizeSpecialChars(cleaned);

        // 3. 개조식 문장 교정 (Phase 1)
        cleaned = window.fixBulletEndings(cleaned);

        // 4. 한국어 발음 교정 (Phase 2)
        cleaned = window.applyKoreanPronunciationFixes(cleaned);

        // 5. 기술 약어 치환 (Phase 1)
        cleaned = window.applyPronunciation(cleaned);

        // 6. 문장 pause 개선
        cleaned = window.improveDefinitionPauses(cleaned);
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    };

    // Azure TTS API 호출 함수 (강조 지원)
    // ✅ rate는 항상 1.0으로 고정 → 클라이언트 측에서 재생 속도 제어
    window.callAzureTTS = async function(text) {
        const reader = window.azureTTSReader;

        try {
            // 헤더 구성
            const headers = {
                'Content-Type': 'application/json'
            };

            // 유료 API 사용 시에만 헤더로 API 키 전달
            // 무료 API는 헤더 없이 전송 -> 백엔드 환경 변수 사용
            if (window.apiKeyConfig.usePaidApi) {
                if (window.apiKeyConfig.paidKey) {
                    headers['X-Azure-Speech-Key'] = window.apiKeyConfig.paidKey;
                    console.log('💳 유료 API 키 사용 (S0)');
                } else {
                    console.warn('⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다. 무료 API로 요청됩니다.');
                }
            } else {
                console.log('🆓 무료 API 사용 (F0 - 백엔드 환경 변수)');
            }

            const response = await fetch(reader.apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: text,
                    voice: 'ko-KR-SunHiNeural',
                    rate: 1.0,  // ✅ 항상 정속(1.0x)으로 TTS 생성 → 캐시 재사용 가능
                    usePaidApi: window.apiKeyConfig.usePaidApi  // ✅ 유료 API 사용 여부 전달
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // 상세 에러 정보 로깅
                console.error('🔴 TTS API 에러 응답:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData.error,
                    details: errorData.details,
                    quotaExceeded: errorData.quotaExceeded
                });

                // 에러 메시지 구성
                let errorMsg = `API 오류 (${response.status})`;
                if (errorData.error) errorMsg += `: ${errorData.error}`;
                if (errorData.details) errorMsg += ` - ${errorData.details}`;

                throw new Error(errorMsg);
            }

            // 백엔드에서 반환된 실제 사용량 읽기
            const actualCharsUsed = parseInt(response.headers.get('X-TTS-Chars-Used') || text.length, 10);

            // API 사용량 추적
            reader.totalCharsUsed += actualCharsUsed;
            localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());

            // 오디오 Blob 받기
            const audioBlob = await response.blob();

            // 사용량 표시 업데이트
            window.updateUsageDisplay();

            return audioBlob;

        } catch (error) {
            console.error('Azure TTS API 호출 실패:', error);

            // 500 에러는 할당량 초과일 가능성이 높음
            if (error.message.includes('500')) {
                const apiMode = window.apiKeyConfig.usePaidApi ? '유료' : '무료';
                throw new Error(`${apiMode} API 오류 (할당량 초과 가능성): ${error.message}`);
            }
            throw error;
        }
    };

    // 서버 캐싱이 적용된 재생 함수
    window.speakNoteWithServerCache = async function(index) {
        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (index >= reader.pages.length || reader.isStopped) {
            reader.isLoading = false;
            reader.lastPlayedIndex = -1;

            // ⚡ 낙관적 업데이트: 완료 상태 저장 (로컬 즉시 업데이트 + 백그라운드 서버 동기화)
            window.playbackPositionManager.optimisticUpdate(-1, '', '모든 노트 완료');

            // 재생 컨트롤 영역 업데이트
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `✅ 모든 노트 재생 완료! 다음 재생 시 처음부터 시작됩니다.`;
            }

            return;
        }

        const page = reader.pages[index];
        reader.currentIndex = index;
        reader.lastPlayedIndex = index;

        // ⚡ 낙관적 업데이트: 마지막 재생 위치 저장 (로컬 즉시 업데이트 + 백그라운드 서버 동기화)
        window.playbackPositionManager.optimisticUpdate(
            index,
            page.file.path,
            page.file.name
        );

        // 재생 컨트롤 영역 업데이트: 캐시 확인 중
        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                🔄 캐시 확인 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
            `;
        }

        try {
            const content = cacheManager.getNoteContent(page);
            const notePath = page.file.path;
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);

            console.log(`\n=== 노트 ${index + 1}/${reader.pages.length}: ${page.file.name} ===`);
            console.log(`Cache Key: ${cacheKey}`);

            let audioBlob;
            let fromCache = false;
            let cacheSource = '';

            // 1단계: 오프라인 캐시 확인 (가장 빠름)
            try {
                audioBlob = await window.offlineCacheManager.getAudio(cacheKey);
                if (audioBlob) {
                    fromCache = true;
                    cacheSource = '📱 오프라인 캐시';
                    console.log(`📱 Using offline cache (${audioBlob.size} bytes)`);
                }
            } catch (offlineError) {
                console.warn('⚠️ Offline cache error (continuing):', offlineError.message);
                audioBlob = null;
            }

            if (!audioBlob) {
                // 2단계: 서버 캐시 확인 (네트워크 에러 시 3단계로 바로 진행)
                try {
                    const cached = await cacheManager.getCachedAudioFromServer(cacheKey);

                    if (cached) {
                        audioBlob = cached.audioBlob;
                        fromCache = true;
                        cacheSource = '☁️ 서버 캐시';
                        console.log(`💾 Using server cache (${cached.size} bytes)`);

                        // 서버 캐시를 오프라인 캐시에 저장 (네트워크 불안정 대비)
                        // ⚠️ 중요: 서버 캐시 히트 시에도 반드시 오프라인에 저장하여
                        //         다음 재생 시 네트워크 없이도 재생 가능하도록 함
                        try {
                            await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                            console.log(`✅ 오프라인 캐시 저장 완료 (서버 → 로컬)`);
                        } catch (saveError) {
                            console.warn('⚠️ 오프라인 캐시 저장 실패:', saveError.message);
                            // iOS Private Browsing 모드 또는 저장 공간 부족
                            // 재생은 계속 진행 (서버 캐시로 이미 받음)
                        }
                    }
                } catch (serverError) {
                    console.warn('⚠️ 서버 캐시 조회 실패 (네트워크 에러):', serverError.message);
                    // 네트워크 에러 발생 시 null 유지하여 3단계(TTS 생성)로 진행
                    audioBlob = null;
                }

                if (!audioBlob) {
                    // 3단계: TTS 생성 (네트워크 에러 시 예외 발생)
                    try {
                        console.log(`🌐 Azure TTS API 호출 시작`);
                        cacheSource = '🎙️ 새로 생성';

                        // 텍스트 구성 (강조 태그 포함)
                        let textToSpeak = `주제: ${page.file.name}. `;

                        if (page.정의) {
                            const cleanDef = window.cleanTextForTTS(page.정의);
                            textToSpeak += `정의: ${cleanDef}. `;
                        }

                        if (page.키워드) {
                            let cleanKw = window.cleanTextForTTS(page.키워드);
                            // 키워드 전체를 읽도록 변경 (길이 제한 제거)
                            textToSpeak += `키워드: ${cleanKw}`;
                        }

                        audioBlob = await window.callAzureTTS(textToSpeak);
                        console.log(`✅ TTS 생성 완료: ${audioBlob.size} bytes, ${textToSpeak.length} chars`);

                        // 서버 캐시에 저장 (네트워크 에러 시 무시하고 계속)
                        try {
                            await cacheManager.saveAudioToServer(cacheKey, audioBlob);
                            console.log(`✅ 서버 캐시 저장 완료`);
                        } catch (saveServerError) {
                            console.warn('⚠️ 서버 캐시 저장 실패 (네트워크 에러):', saveServerError.message);
                        }

                        // 오프라인 캐시에 저장 (에러 무시)
                        try {
                            await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                            console.log(`✅ 오프라인 캐시 저장 완료`);
                        } catch (saveError) {
                            console.warn('⚠️ Failed to save to offline cache:', saveError.message);
                        }

                        fromCache = false;
                    } catch (ttsError) {
                        console.error('❌ TTS 생성 실패:', ttsError.message);
                        throw new Error(`TTS 생성 실패: ${ttsError.message}. 네트워크 연결을 확인하세요.`);
                    }
                }
            }

            // 캐시 통계 업데이트
            window.updateCacheStatsDisplay();

            const audioUrl = URL.createObjectURL(audioBlob);
            reader.audioElement.src = audioUrl;
            reader.audioElement.playbackRate = reader.playbackRate; // ✅ 클라이언트 측에서 재생 속도 적용

            // 📱 iOS 잠금 화면 지원: Media Session API 설정
            // ⚠️ 중요: 각 핸들러에 에러 처리 추가하여 네트워크 에러 발생 시에도
            //         잠금 화면 컨트롤이 계속 작동하도록 함
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: page.file.name,
                    artist: 'Azure TTS',
                    album: `출제예상 (${index + 1}/${reader.pages.length})`,
                    artwork: []
                });

                // 잠금 화면 컨트롤 핸들러 (에러 복원 로직 포함)
                navigator.mediaSession.setActionHandler('play', async () => {
                    try {
                        // 오디오 요소가 있으면 재개
                        if (reader.audioElement && !reader.audioElement.error) {
                            await reader.audioElement.play();
                            reader.isPaused = false;
                        } else {
                            // 오디오 에러 상태면 현재 노트 재생성
                            console.warn('⚠️ 오디오 에러 상태 감지, 현재 노트 재로드 시도');
                            await window.speakNoteWithServerCache(reader.currentIndex);
                        }
                    } catch (error) {
                        console.error('❌ Media Session play 핸들러 에러:', error);
                        // 재생 실패 시 현재 노트 재시도
                        try {
                            await window.speakNoteWithServerCache(reader.currentIndex);
                        } catch (retryError) {
                            console.error('❌ 재시도 실패:', retryError);
                        }
                    }
                });

                navigator.mediaSession.setActionHandler('pause', () => {
                    try {
                        if (reader.audioElement) {
                            reader.audioElement.pause();
                            reader.isPaused = true;
                        }
                    } catch (error) {
                        console.error('❌ Media Session pause 핸들러 에러:', error);
                    }
                });

                navigator.mediaSession.setActionHandler('previoustrack', async () => {
                    try {
                        if (index > 0) {
                            await window.speakNoteWithServerCache(index - 1);
                        }
                    } catch (error) {
                        console.error('❌ Media Session previoustrack 핸들러 에러:', error);
                    }
                });

                navigator.mediaSession.setActionHandler('nexttrack', async () => {
                    try {
                        if (index < reader.pages.length - 1) {
                            await window.speakNoteWithServerCache(index + 1);
                        }
                    } catch (error) {
                        console.error('❌ Media Session nexttrack 핸들러 에러:', error);
                    }
                });

                console.log('📱 Media Session API 설정 완료 (iOS 잠금 화면 지원)');
            }

            // 재생 완료 시 다음 노트로
            reader.audioElement.onended = function() {
                URL.revokeObjectURL(audioUrl);
                if (!reader.isStopped && !reader.isPaused) {
                    // iOS에서 백그라운드 실행을 위해 짧은 지연
                    setTimeout(() => window.speakNoteWithServerCache(index + 1), 100);
                } else {
                    reader.isLoading = false;
                }
            };

            // 🔄 오디오 에러 핸들러 (네트워크 복구 로직 포함)
            reader.audioElement.onerror = async function(e) {
                console.error('❌ 오디오 재생 오류:', e);
                const errorType = reader.audioElement.error?.code;

                // 네트워크 에러(MEDIA_ERR_SRC_NOT_SUPPORTED, MEDIA_ERR_NETWORK)인 경우
                // 오프라인 캐시로 재시도
                if (errorType === 2 || errorType === 3) {
                    console.warn('⚠️ 네트워크 에러 감지, 오프라인 캐시 재시도 시도');

                    try {
                        // 오프라인 캐시에서 재시도
                        const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);

                        if (offlineAudio) {
                            console.log('✅ 오프라인 캐시에서 복구 성공');
                            const audioUrl = URL.createObjectURL(offlineAudio);
                            reader.audioElement.src = audioUrl;
                            await reader.audioElement.play();

                            if (lastPlayedDiv) {
                                lastPlayedDiv.innerHTML = `
                                    ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                                    <br><small style="opacity: 0.9;">💾 오프라인 캐시 (네트워크 복구)</small>
                                `;
                            }
                            return; // 복구 성공
                        }
                    } catch (retryError) {
                        console.error('❌ 오프라인 캐시 재시도 실패:', retryError);
                    }
                }

                // 복구 실패 시 에러 표시
                if (lastPlayedDiv) {
                    lastPlayedDiv.innerHTML = `
                        ❌ 오디오 재생 오류 (코드: ${errorType || 'unknown'})
                        <br><small style="opacity: 0.9;">네트워크 연결을 확인하고 다시 시도하세요.</small>
                    `;
                }

                reader.isLoading = false;
            };

            await reader.audioElement.play();
            reader.isLoading = false;

            // 재생 컨트롤 영역: 재생 중 상태 표시 (캐시 소스 포함)
            if (lastPlayedDiv) {
                const cacheIcon = fromCache ? '💾' : '🎙️';
                lastPlayedDiv.innerHTML = `
                    ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                    <br><small style="opacity: 0.9;">${cacheIcon} ${cacheSource}</small>
                `;
            }

        } catch (error) {
            console.error('❌ TTS 전체 오류:', error);

            // 재생 컨트롤 영역에 에러 표시
            if (lastPlayedDiv) {
                const isNetworkError = error.message.includes('네트워크') ||
                                      error.message.includes('Failed to fetch') ||
                                      error.message.includes('NetworkError');

                lastPlayedDiv.innerHTML = `
                    ❌ TTS 오류: ${error.message}
                    <br><small style="opacity: 0.9;">${
                        isNetworkError
                            ? '🔌 네트워크 연결을 확인하세요. 오프라인 캐시가 있으면 자동으로 사용됩니다.'
                            : '서버 연결 및 설정을 확인하세요.'
                    }</small>
                `;
            }

            reader.isLoading = false;

            // Media Session 상태는 유지 (잠금 화면 컨트롤이 계속 작동하도록)
            console.log('💡 Media Session 상태 유지 (잠금 화면 컨트롤 계속 활성)');
        }
    };

    // 버튼 컨트롤 함수들
    window.azureTTSPlay = async function() {
        const reader = window.azureTTSReader;

        // pages 배열이 비어있는지 확인
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

        // 일시정지 상태에서 재개
        if (reader.isPaused && reader.audioElement.src) {
            if (reader.audioElement.readyState >= 2) {
                try {
                    await reader.audioElement.play();
                    reader.isPaused = false;
                    console.log('▶️ 재생 재개');
                    return;
                } catch (error) {
                    console.error('❌ 재생 재개 실패:', error);
                }
            }
            reader.audioElement.src = '';
        }

        // 새로 재생 시작
        reader.isStopped = false;
        reader.isPaused = false;

        // ☁️ 서버와 재생 위치 동기화
        const localIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
        const savedIndex = localIndex ? parseInt(localIndex, 10) : -1;

        // 서버와 동기화하여 최신 위치 가져오기
        const syncedIndex = await window.playbackPositionManager.syncPosition(savedIndex);
        reader.lastPlayedIndex = syncedIndex;

        // 🔄 디바이스 전환 감지 및 "이어서 듣기" 확인 (SPEC-SYNC-001 Phase 3)
        const serverState = await window.playbackStateManager.loadState();
        const shouldShowContinueModal = serverState &&
            serverState.sessionInfo &&
            serverState.sessionInfo.sessionId !== window.playbackStateManager.sessionId;

        if (shouldShowContinueModal && window.ContinueListeningModal) {
            console.log('🔄 다른 디바이스에서 재생 감지됨 - "이어서 듣기" 모달 표시');

            // 모달 표시 및 사용자 선택 대기
            const userChoice = await new Promise((resolve) => {
                window.ContinueListeningModal.show(
                    serverState,
                    () => resolve('continue'), // 이어서 듣기
                    () => resolve('restart'),  // 처음부터
                    () => resolve('close')     // 닫기
                );
            });

            if (userChoice === 'continue') {
                // 서버 상태에서 복원
                const serverIndex = serverState.lastPlayedIndex || 0;
                if (serverIndex >= 0 && serverIndex < reader.pages.length) {
                    // 현재 오디오 위치 설정
                    reader.currentIndex = serverIndex;

                    // 오디오 시간 설정 (있는 경우)
                    const currentTime = serverState.playbackState?.currentTime || 0;
                    const duration = serverState.playbackState?.duration || 0;

                    // 재생 설정 적용
                    if (serverState.playbackSettings) {
                        reader.playbackRate = serverState.playbackSettings.playbackRate || 1.0;
                        if (reader.audioElement) {
                            reader.audioElement.playbackRate = reader.playbackRate;
                        }
                        const rateDisplay = document.getElementById('rate-display');
                        if (rateDisplay) {
                            rateDisplay.textContent = `${reader.playbackRate}x`;
                        }
                    }

                    // 노트 재생 (시간 설정은 이후에)
                    window.speakNoteWithServerCache(serverIndex);

                    // 오디오 로딩 후 시간 설정
                    const setAudioTime = () => {
                        if (reader.audioElement && reader.audioElement.duration > 0 && currentTime > 0) {
                            reader.audioElement.currentTime = Math.min(currentTime, reader.audioElement.duration);
                            console.log(`⏰ 오디오 시간 설정: ${currentTime}초`);
                        }
                    };

                    // 오디오가 로드되면 시간 설정
                    reader.audioElement.addEventListener('loadedmetadata', setAudioTime, { once: true });
                    reader.audioElement.addEventListener('canplay', setAudioTime, { once: true });

                    return;
                }
            } else if (userChoice === 'close') {
                // 모달 닫기 - 로컬 인덱스 사용
                console.log('❌ 사용자가 모달을 닫음 - 로컬 인덱스 사용');
            }
            // 'restart'인 경우 아래 로직 그대로 실행 (처음부터)
        }

        // 마지막 재생 위치 복원 (다음 노트부터)
        if (syncedIndex >= 0) {
            const nextIndex = syncedIndex + 1;

            if (nextIndex < reader.pages.length) {
                console.log(`🔄 마지막 재생 위치 ${syncedIndex + 1}번 다음부터 재개 (${nextIndex + 1}번)`);
                reader.currentIndex = nextIndex;
            } else {
                console.log(`✅ 모든 노트 재생 완료됨, 처음부터 재시작`);
                reader.currentIndex = 0;
            }
        }

        // 최종 인덱스 유효성 검증
        if (reader.currentIndex < 0 || reader.currentIndex >= reader.pages.length) {
            console.error(`❌ 잘못된 인덱스: ${reader.currentIndex} (총 ${reader.pages.length}개 노트)`);
            reader.currentIndex = 0;
        }

        window.speakNoteWithServerCache(reader.currentIndex);
    };

    window.azureTTSPause = function() {
        const reader = window.azureTTSReader;
        if (reader.audioElement.src && !reader.audioElement.paused) {
            reader.audioElement.pause();
            reader.isPaused = true;

            // 재생 컨트롤 영역 업데이트
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                const currentNote = reader.pages[reader.currentIndex];
                lastPlayedDiv.innerHTML = `
                    ⏸️ 일시정지: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${currentNote.file.name}
                `;
            }

            console.log('⏸️ 일시정지');
        }
    };

    window.azureTTSStop = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        reader.isStopped = true;
        reader.isPaused = false;

        // 재생 컨트롤 영역 업데이트: 마지막 재생 위치 표시
        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            if (reader.lastPlayedIndex >= 0 && reader.lastPlayedIndex < reader.pages.length) {
                const lastNote = reader.pages[reader.lastPlayedIndex];
                lastPlayedDiv.innerHTML = `
                    💾 마지막 재생: <strong>[${reader.lastPlayedIndex + 1}/${reader.pages.length}]</strong> ${lastNote.file.name}
                    <br><small style="opacity: 0.9;">다음 재생 시 ${reader.lastPlayedIndex + 2}번부터 시작됩니다</small>
                `;
            } else {
                lastPlayedDiv.textContent = '⏹️ 정지됨 - 아래 버튼을 클릭하여 재생하세요';
            }
        }

        console.log('⏹️ 재생 중지');
    };

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        window.speakNoteWithServerCache(reader.currentIndex + 1);
    };

    // 이전 노트 재생 (NEW)
    window.azureTTSPrevious = function() {
        const reader = window.azureTTSReader;
        const prevIndex = reader.currentIndex - 1;

        if (prevIndex < 0) {
            alert('⚠️ 첫 번째 노트입니다.');
            return;
        }

        reader.audioElement.pause();
        reader.audioElement.src = '';
        window.speakNoteWithServerCache(prevIndex);
    };

    window.azureTTSSetRate = function(rate) {
        const reader = window.azureTTSReader;
        reader.playbackRate = parseFloat(rate);

        // 현재 재생 중인 오디오에도 즉시 속도 적용
        if (reader.audioElement && reader.audioElement.src) {
            reader.audioElement.playbackRate = reader.playbackRate;
        }

        document.getElementById('rate-display').textContent = `${rate}x`;
    };

    // 특정 인덱스부터 재생
    window.azureTTSPlayFrom = function(index) {
        const reader = window.azureTTSReader;
        reader.currentIndex = index;
        reader.isStopped = false;
        reader.isPaused = false;
        window.speakNoteWithServerCache(index);
    };

    // 캐시 통계 UI 업데이트 (서버 + 오프라인 통계 포함)
    window.updateCacheStatsDisplay = async function() {
        // serverCacheManager가 초기화되지 않았으면 스킵
        if (!window.serverCacheManager || !window.serverCacheManager.stats) {
            console.warn('⚠️ serverCacheManager가 아직 초기화되지 않았습니다.');
            return;
        }

        const stats = window.serverCacheManager.stats;
        const hitRate = window.serverCacheManager.getHitRate();

        const cachedCountEl = document.getElementById('cached-count');
        const hitCountEl = document.getElementById('hit-count');
        const missCountEl = document.getElementById('miss-count');
        const hitRateEl = document.getElementById('hit-rate');

        if (cachedCountEl) cachedCountEl.textContent = stats.totalRequests;
        if (hitCountEl) hitCountEl.textContent = stats.cacheHits;
        if (missCountEl) missCountEl.textContent = stats.cacheMisses;
        if (hitRateEl) hitRateEl.textContent = `${hitRate}%`;

        // 서버 캐시 파일 수 조회 및 표시
        const serverStats = await window.serverCacheManager.getServerCacheCount();

        let offlineStats = { count: 0, totalSizeMB: '0' };
        try {
            offlineStats = await window.offlineCacheManager.getCacheStats();
        } catch (error) {
            console.warn('⚠️ Failed to get offline cache stats:', error.message);
        }

        if (serverStats) {
            if (cachedCountEl) {
                cachedCountEl.innerHTML = `${stats.totalRequests} <small style="color: #999;">(☁️ 서버: ${serverStats.totalFiles}개, ${serverStats.totalSizeMB}MB | 📱 오프라인: ${offlineStats.count}개, ${offlineStats.totalSizeMB}MB)</small>`;
            }
        }
    };

    /**
     * ⚡ 전체 노트 TTS 일괄 생성 함수
     *
     * 목적:
     * - 정보관리기술사 폴더의 모든 노트에 대해 TTS를 미리 생성
     * - 첫 재생 시 대기 시간 제거 (모든 노트가 캐시됨)
     * - 오프라인 사용 준비
     *
     * 작동 방식:
     * 1. Dataview로 노트 목록 조회 (#검색제외 제외)
     * 2. 각 노트마다:
     *    a. 오프라인 캐시 확인 → 있으면 건너뜀
     *    b. 서버 캐시 확인 → 있으면 건너뜀
     *    c. 없으면 TTS 생성 → 서버 + 오프라인 캐시에 저장
     * 3. 실시간 진행 상황 표시 (진행률, 현재 노트, 통계)
     * 4. 언제든지 중단 가능
     *
     * 성능 최적화:
     * - 캐시 히트 시 즉시 건너뜀 (네트워크 요청 최소화)
     * - API 부하 방지: 각 노트 사이 500ms 딜레이
     * - 에러 발생 시 해당 노트만 실패 처리하고 계속 진행
     *
     * UI 요소:
     * - 진행률 바: 전체 노트 대비 현재 진행 상황
     * - 현재 노트: 처리 중인 노트명 실시간 표시
     * - 통계: 생성/건너뜀/실패 개수
     * - 중단 버튼: 현재 노트 완료 후 안전하게 중단
     *
     * 사용 시나리오:
     * - 아침에 출근 후 일괄 생성 → 하루 종일 빠른 재생
     * - 새로운 노트 대량 추가 후 일괄 캐싱
     * - 오프라인 환경 준비 (기차, 비행기 등)
     */
    window.bulkGenerateAllNotes = async function() {
        // 1. 전체 노트 조회 (Dataview 쿼리)
        // - "1_Project/정보 관리 기술사" 폴더 내 모든 노트
        // - #검색제외 태그가 없는 노트만 포함
        // - #출제예상 또는 #130관~#137응 태그가 있는 노트
        // - 폴더 → 파일명 순으로 정렬
        let tagQuery = "#출제예상";
        for (let i = 130; i <= 137; i++) {
            tagQuery += ` or #${i}관 or #${i}응`;
        }

        const allPages = dv.pages(`"1_Project/정보 관리 기술사" and -#검색제외 and (${tagQuery})`)
            .sort(b => [b.file.folder, b.file.name], 'asc')
            .array();

        // 2. 노트 유무 확인
        if (!allPages || allPages.length === 0) {
            alert('❌ 생성할 노트가 없습니다.');
            return;
        }

        // 3. 사용자 확인
        const totalNotes = allPages.length;
        const confirmed = confirm(
            `⚡ 전체 ${totalNotes}개 노트에 대해 TTS를 일괄 생성하시겠습니까?\n\n` +
            `✅ 캐시된 노트는 자동으로 건너뜁니다\n` +
            `🎤 새로운 노트만 생성됩니다\n` +
            `⏹️ 진행 중 언제든지 중단 가능합니다\n` +
            `⏱️ 예상 소요 시간: 약 ${Math.ceil(totalNotes * 0.5 / 60)}분`
        );

        if (!confirmed) return;

        // 진행 상황 표시 영역 생성
        const progressDiv = document.createElement('div');
        progressDiv.id = 'bulk-generation-progress';
        progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; min-width: 400px;';
        progressDiv.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #333;">⚡ TTS 일괄 생성 중...</h3>
            <div style="margin-bottom: 15px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                    진행: <strong id="bulk-current">0</strong> / <strong id="bulk-total">${totalNotes}</strong>
                    (<strong id="bulk-percentage">0%</strong>)
                </div>
                <div style="background: #eee; height: 20px; border-radius: 10px; overflow: hidden;">
                    <div id="bulk-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); transition: width 0.3s;"></div>
                </div>
            </div>
            <div id="bulk-current-note" style="font-size: 12px; color: #999; margin-bottom: 10px; height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
            <div id="bulk-stats" style="font-size: 12px; color: #666; margin-bottom: 15px;">
                ✅ 생성: <strong id="bulk-generated">0</strong> |
                ⏭️ 건너뜀: <strong id="bulk-skipped">0</strong> |
                ❌ 실패: <strong id="bulk-failed">0</strong>
            </div>
            <button id="bulk-cancel-btn" style="width: 100%; padding: 10px; background: #F44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                ⏹️ 중단
            </button>
        `;
        document.body.appendChild(progressDiv);

        let cancelled = false;
        document.getElementById('bulk-cancel-btn').onclick = () => {
            cancelled = true;
            alert('⏹️ 중단 요청됨. 현재 노트 완료 후 중단됩니다.');
        };

        let generated = 0, skipped = 0, failed = 0;

        for (let i = 0; i < allPages.length; i++) {
            if (cancelled) break;

            const page = allPages[i];
            const noteTitle = page.file.name;
            const content = await dv.io.load(page.file.path);

            // 진행 상황 업데이트
            document.getElementById('bulk-current').textContent = i + 1;
            document.getElementById('bulk-percentage').textContent = Math.round(((i + 1) / totalNotes) * 100) + '%';
            document.getElementById('bulk-progress-bar').style.width = ((i + 1) / totalNotes * 100) + '%';
            document.getElementById('bulk-current-note').textContent = `📄 ${noteTitle}`;

            try {
                // ⚠️ 중요: 재생 시와 동일한 텍스트 구성 방식 사용
                // getNoteContent()를 사용하여 "주제 + 정의 + 키워드" 형식으로 구성
                const structuredContent = window.serverCacheManager.getNoteContent(page);

                if (!structuredContent || structuredContent.trim().length === 0) {
                    console.log(`⏭️ 건너뜀: ${noteTitle} (내용 없음)`);
                    skipped++;
                    document.getElementById('bulk-skipped').textContent = skipped;
                    continue;
                }

                const notePath = page.file.path;
                const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, structuredContent);

                // 1. 오프라인 캐시 확인
                let audioBlob = null;
                try {
                    audioBlob = await window.offlineCacheManager.getAudio(cacheKey);
                } catch (err) {
                    console.warn(`⚠️ 오프라인 캐시 확인 실패: ${noteTitle}`);
                }

                // 2. 서버 캐시 확인
                if (!audioBlob) {
                    const cached = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
                    if (cached) {
                        audioBlob = cached.audioBlob;
                    }
                }

                // 캐시가 있으면 건너뜀
                if (audioBlob) {
                    console.log(`⏭️ 건너뜀: ${noteTitle} (이미 캐시됨)`);
                    skipped++;
                    document.getElementById('bulk-skipped').textContent = skipped;
                    continue;
                }

                // 3. TTS 생성
                console.log(`🎤 생성 중: ${noteTitle}`);
                audioBlob = await window.callAzureTTS(structuredContent);

                if (!audioBlob) {
                    throw new Error('TTS 생성 실패');
                }

                console.log(`✅ TTS 생성 완료: ${noteTitle} (${audioBlob.size} bytes)`);

                // 4. 캐시에 저장
                await window.serverCacheManager.saveAudioToServer(cacheKey, audioBlob);

                try {
                    await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                } catch (err) {
                    console.warn(`⚠️ 오프라인 캐시 저장 실패: ${noteTitle}`);
                }

                generated++;
                document.getElementById('bulk-generated').textContent = generated;

            } catch (error) {
                console.error(`❌ 실패: ${noteTitle}`, error);
                failed++;
                document.getElementById('bulk-failed').textContent = failed;
            }

            // API 부하 방지를 위한 딜레이 (500ms)
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 완료 메시지
        document.body.removeChild(progressDiv);

        const resultMessage = cancelled
            ? `⏹️ 중단됨\n\n✅ 생성: ${generated}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개`
            : `🎉 완료!\n\n✅ 생성: ${generated}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개`;

        alert(resultMessage);

        // 캐시 통계 업데이트
        await window.updateCacheStatsDisplay();
    };

    // 백엔드에서 사용량 조회 (Azure 실제 사용량)
    window.fetchUsageFromBackend = async function() {
        const reader = window.azureTTSReader;
        try {
            // Azure Consumption API 우선 시도 (실제 Azure 사용량)
            const azureUsageUrl = reader.apiEndpoint.replace('/tts-stream', '/azure-usage');
            const azureResponse = await fetch(azureUsageUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (azureResponse.ok) {
                const data = await azureResponse.json();
                reader.totalCharsUsed = data.totalChars || 0;
                localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());
                console.log('✅ Azure 실제 사용량:', data.totalChars, '자 (source:', data.source + ')');

                // Blob Storage 실시간 사용량 추가 조회
                try {
                    const storageUsageUrl = reader.apiEndpoint.replace('/tts-stream', '/storage-usage');
                    const storageResponse = await fetch(storageUsageUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (storageResponse.ok) {
                        const storageData = await storageResponse.json();
                        // Blob Storage 데이터를 기존 데이터에 병합
                        data.blobStorageBytes = storageData.totalBytes || 0;
                        data.blobStorageGB = storageData.totalGB || 0;
                        data.blobStorageCost = storageData.estimatedMonthlyCost || 0;
                        data.blobCount = storageData.blobCount || 0;
                        data.totalCost = (data.totalCost || 0) + (data.blobStorageCost || 0);
                        console.log('✅ Blob Storage:', storageData.totalGB, 'GB (실시간)');
                    }
                } catch (storageError) {
                    console.warn('⚠️ Blob Storage 사용량 조회 실패:', storageError);
                }

                return data;
            } else {
                console.warn('⚠️ Azure Consumption API 실패, 로컬 추적으로 폴백');
            }

            // 폴백: 로컬 추적 API (부정확할 수 있음)
            const usageApiUrl = reader.apiEndpoint.replace('/tts-stream', '/usage');
            const response = await fetch(usageApiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                reader.totalCharsUsed = data.totalChars || 0;
                localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());
                console.log('⚠️ 로컬 추적 사용량:', data.totalChars, '자 (부정확할 수 있음)');
                return data;
            }
        } catch (error) {
            console.error('백엔드 사용량 조회 실패:', error);
        }
        return null;
    };

    // 사용량 표시 업데이트
    window.updateUsageDisplay = async function() {
        const reader = window.azureTTSReader;
        const usageDiv = document.getElementById('tts-usage-azure');
        if (!usageDiv) return;

        const backendData = await window.fetchUsageFromBackend();

        let totalChars, freeChars, paidChars, freeLimit, freePercentage, freeRemaining, lastUpdated;
        let paidCost = 0;
        let blobStorageGB = 0;
        let blobStorageCost = 0;
        let totalCost = 0;
        let hasCostData = false;

        if (backendData) {
            totalChars = backendData.totalChars || 0;
            freeLimit = backendData.freeLimit || 500000;

            // 무료/유료 사용량 계산
            freeChars = Math.min(totalChars, freeLimit);  // 무료는 최대 50만자
            paidChars = Math.max(0, totalChars - freeLimit);  // 초과분은 유료

            freePercentage = parseFloat(backendData.freePercentage || backendData.percentage || ((freeChars / freeLimit) * 100).toFixed(1));
            freeRemaining = Math.max(0, freeLimit - totalChars);
            lastUpdated = new Date(backendData.lastUpdated).toLocaleString('ko-KR');

            // Azure Consumption API에서 비용 정보 가져오기 (있으면)
            if (backendData.source === 'azure-consumption-api') {
                paidCost = backendData.paidCost || 0;
                blobStorageGB = backendData.blobStorageGB || 0;
                blobStorageCost = backendData.blobStorageCost || 0;
                totalCost = backendData.totalCost || 0;
                hasCostData = true;
            } else {
                // Azure API가 없으면 수동 계산 (유료 문자 * $0.000016)
                paidCost = paidChars * 0.000016;
            }
        } else {
            totalChars = reader.totalCharsUsed;
            freeLimit = 500000;
            freeChars = Math.min(totalChars, freeLimit);
            paidChars = Math.max(0, totalChars - freeLimit);
            freePercentage = ((freeChars / freeLimit) * 100).toFixed(1);
            freeRemaining = Math.max(0, freeLimit - totalChars);
            lastUpdated = '로컬 카운터';
            paidCost = paidChars * 0.000016;  // 수동 계산
        }

        let color = '#4CAF50';
        if (freePercentage > 80) color = '#FF9800';
        if (freePercentage > 100) color = '#F44336';

        // 무료 할당량이 월 초에 리셋되면 자동으로 무료 API로 전환
        // 조건: 사용량이 10% 미만이고 (거의 리셋된 상태), 현재 유료 API 사용 중
        const totalUsed = totalChars || (freeChars + paidChars);
        const isMonthlyReset = (totalUsed < freeLimit * 0.1);  // 10% 미만 = 월 초 리셋

        if (isMonthlyReset && window.apiKeyConfig.usePaidApi) {
            window.apiKeyConfig.usePaidApi = false;
            localStorage.setItem('azureTTS_usePaidApi', 'false');
            console.log('🔄 월 초 할당량 리셋 감지 - 무료 API로 자동 전환 (totalUsed:', totalUsed, '/', freeLimit, ')');
        }

        const apiMode = window.apiKeyConfig.usePaidApi;
        const apiModeText = apiMode ?
            '<span style="color: #FFD700;">💳 유료 API 사용 중 (S0)</span>' :
            '<span style="color: #4CAF50;">🆓 무료 API 사용 중 (F0)</span>';

        // 데이터 소스 표시
        const dataSourceBadge = backendData && backendData.source === 'azure-consumption-api' ?
            '<span style="color: #4CAF50;">✓ Azure 실제 사용량</span>' :
            (backendData && backendData.source === 'local-tracker' ?
                '<span style="color: #FFB74D;">⚠️ 로컬 추적 (부정확)</span>' :
                '<span style="color: rgba(255,255,255,0.6);">⚠ 로컬 추정</span>');

        // 할당량 경고
        const quotaWarning = freePercentage >= 90 ?
            `<div style="margin-top: 10px; padding: 10px; background: rgba(255,193,7,0.2); border-left: 3px solid #FFD700; border-radius: 5px; font-size: 11px; color: white;">
                ⚠️ 무료 할당량 ${freePercentage >= 100 ? '소진' : '부족'} (${freePercentage.toFixed(1)}%)
            </div>` : '';

        // 유료 사용량 표시 텍스트 (항상 표시하되, 0자면 투명도 낮춰서)
        const paidCharsDisplay = paidChars > 0 ?
            `<span style="color: #FFD700; font-weight: bold;">${paidChars.toLocaleString()}자</span>` :
            `<span style="color: rgba(255,255,255,0.5);">0자</span>`;

        const paidCostDisplay = paidChars > 0 ?
            `<span style="color: #FFD700; font-size: 11px;"> ($${paidCost.toFixed(4)})</span>` :
            `<span style="color: rgba(255,255,255,0.5); font-size: 11px;"> ($0.0000)</span>`;

        // 무료 사용량 색상 (그라디언트 배경에서 보이도록)
        const freeColor = freePercentage > 100 ? '#FF6B6B' : (freePercentage > 80 ? '#FFD700' : '#4CAF50');

        usageDiv.innerHTML = `
            <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-height: 180px;">
                <h3 style="color: white; margin: 0 0 15px 0; font-size: 16px;">📊 API 사용량 (이번 달)</h3>

                <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                    <div style="margin-bottom: 5px; font-size: 12px; color: rgba(255,255,255,0.9);">
                        ${apiModeText}
                    </div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.7);">
                        ${dataSourceBadge}
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 5px; color: white; font-size: 14px;">
                    <div style="margin-bottom: 8px;">
                        <strong>🆓 무료:</strong> <span style="color: ${freeColor}; font-weight: bold;">${freeChars.toLocaleString()}자</span> / ${freeLimit.toLocaleString()}자 <span style="color: rgba(255,255,255,0.7);">(${freePercentage.toFixed(1)}%)</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>💳 유료:</strong> ${paidCharsDisplay} ${paidCostDisplay}
                    </div>
                    ${hasCostData && blobStorageGB > 0 ? `<div style="margin-bottom: 8px;">
                        <strong>💾 Blob Storage:</strong> <span style="color: #90CAF9; font-weight: bold;">${blobStorageGB.toFixed(2)} GB</span>
                        <span style="color: #90CAF9; font-size: 11px;"> ($${blobStorageCost.toFixed(4)})</span>
                    </div>` : ''}
                    <div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
                        전체: ${totalChars.toLocaleString()}자
                        ${(hasCostData && totalCost > 0) || paidCost > 0 ? `<span style="color: #FFD700;"> | 예상 총 비용: $${(totalCost || paidCost).toFixed(4)}</span>` : ''}
                    </div>
                </div>

                <div style="margin-top: 10px; font-size: 12px; color: ${freeRemaining < 50000 ? '#FF6B6B' : '#4CAF50'}; font-weight: bold;">
                    남은 무료 사용량: ${freeRemaining.toLocaleString()}자 ${freeRemaining < 50000 ? '⚠️' : '✅'}
                </div>
                ${quotaWarning}
                <div style="margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.6);">
                    마지막 업데이트: ${lastUpdated}
                    ${hasCostData ? '<span style="color: #4CAF50;"> ✓ 실시간 Azure 데이터</span>' : '<span style="color: #FFB74D;"> ⚠️ 추정값</span>'}
                </div>
            </div>
        `;
    };

    // 유료 API 설정 진단 함수 (디버깅용)
    window.diagnosePaidApi = function() {
        console.log('=== 유료 API 설정 진단 ===');
        console.log('1. API 키 설정:');
        console.log('   - 무료 API 키:', window.apiKeyConfig.freeKey ? '✅ 등록됨 (Keychain)' : '❌ 없음');
        console.log('   - 유료 API 키:', window.apiKeyConfig.paidKey ? '✅ 등록됨 (Keychain)' : '❌ 없음');
        console.log('2. 현재 모드:', window.apiKeyConfig.usePaidApi ? '💳 유료 API 선택됨' : '🆓 무료 API 선택됨');
        console.log('3. localStorage 상태:', localStorage.getItem('azureTTS_usePaidApi'));

        if (window.apiKeyConfig.usePaidApi && !window.apiKeyConfig.paidKey) {
            console.error('❌ 문제 발견: 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다!');
            console.log('💡 해결: Settings/PC-Azure TTS 설정.md 파일에서 paidKey를 입력하세요.');
        } else if (window.apiKeyConfig.usePaidApi && window.apiKeyConfig.paidKey) {
            console.log('✅ 유료 API 설정 정상');
            console.log('💡 다음: 노트를 재생하여 실제 TTS API를 호출하세요.');
        } else {
            console.log('✅ 무료 API 모드 정상');
        }

        console.log('\n다음 명령어로 사용량 확인:');
        console.log('await window.fetchUsageFromBackend()');
        console.log('\nAPI 키 테스트:');
        console.log('await window.testApiKey()');
        console.log('\n캐시 키 분석:');
        console.log('await window.analyzeCacheKeys()');
    };

    // 캐시 키 생성 분석 함수 (디버깅용)
    window.analyzeCacheKeys = async function(sampleSize = 10) {
        console.log('🔍 캐시 키 생성 분석 시작...');

        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 노트 데이터가 없습니다. 먼저 페이지를 로드하세요.');
            return;
        }

        // 서버 캐시 통계 가져오기
        const cacheStats = await cacheManager.getCacheStats();
        console.log(`\n📊 서버 캐시 현황: ${cacheStats.totalFiles}개 파일, ${cacheStats.totalSizeMB} MB`);

        // 샘플 노트 분석
        const samples = reader.pages.slice(0, Math.min(sampleSize, reader.pages.length));
        console.log(`\n📋 샘플 ${samples.length}개 노트 분석:\n`);

        const results = [];
        for (let i = 0; i < samples.length; i++) {
            const page = samples[i];
            const notePath = page.file.path;
            const content = cacheManager.getNoteContent(page);
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);

            // 서버에 캐시가 있는지 확인
            const cached = await cacheManager.getCachedAudioFromServer(cacheKey);
            const status = cached ? '✅ HIT' : '❌ MISS';

            results.push({
                index: i,
                title: page.file.name,
                notePath: notePath,
                contentLength: content.length,
                cacheKey: cacheKey,
                cached: !!cached,
                status: status
            });

            console.log(`[${i+1}/${samples.length}] ${status}`);
            console.log(`  제목: ${page.file.name}`);
            console.log(`  경로: ${notePath}`);
            console.log(`  내용 길이: ${content.length}자`);
            console.log(`  캐시 키: ${cacheKey}`);
            if (content.length < 200) {
                console.log(`  내용 미리보기: ${content.substring(0, 100)}...`);
            }
            console.log('');
        }

        const hitCount = results.filter(r => r.cached).length;
        const missCount = results.length - hitCount;
        const hitRate = ((hitCount / results.length) * 100).toFixed(1);

        console.log(`\n📈 샘플 분석 결과:`);
        console.log(`  전체: ${results.length}개`);
        console.log(`  캐시 HIT: ${hitCount}개`);
        console.log(`  캐시 MISS: ${missCount}개`);
        console.log(`  HIT 비율: ${hitRate}%`);

        // MISS가 많으면 원인 분석
        if (missCount > hitCount) {
            console.log(`\n⚠️ 캐시 MISS가 많습니다. 가능한 원인:`);
            console.log(`  1. 노트 내용이 최근 수정되어 캐시 키가 변경됨`);
            console.log(`  2. 서버 캐시가 삭제되었거나 만료됨`);
            console.log(`  3. 캐시 키 생성 로직이 변경됨`);
            console.log(`\n💡 해결 방법:`);
            console.log(`  - 전체 노트를 한 번 재생하여 캐시 재생성`);
            console.log(`  - 서버 캐시 통계 확인: await window.serverCacheManager.getCacheStats()`);
        }

        return results;
    };

    // API 키 유효성 테스트 함수
    window.testApiKey = async function() {
        console.log('🧪 API 키 유효성 테스트 시작...');

        const reader = window.azureTTSReader;
        const testText = "테스트";

        try {
            // 헤더 구성
            const headers = {
                'Content-Type': 'application/json'
            };

            if (window.apiKeyConfig.usePaidApi) {
                if (!window.apiKeyConfig.paidKey) {
                    console.error('❌ 유료 API 키가 설정되지 않았습니다.');
                    return { success: false, error: 'No paid API key configured' };
                }
                headers['X-Azure-Speech-Key'] = window.apiKeyConfig.paidKey;
                console.log('💳 유료 API 키로 테스트 시작 (Keychain에서 로드됨)');
            } else {
                console.log('🆓 무료 API 키로 테스트 (백엔드 환경변수)');
            }

            console.log('📤 요청 URL:', reader.apiEndpoint);
            console.log('📤 요청 헤더:', headers);

            const response = await fetch(reader.apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: testText,
                    voice: 'ko-KR-SunHiNeural',
                    rate: 1.0
                })
            });

            console.log('📥 응답 상태:', response.status, response.statusText);
            console.log('📥 응답 헤더:', Object.fromEntries(response.headers.entries()));

            if (response.ok) {
                const audioBlob = await response.blob();
                console.log('✅ API 키 테스트 성공!');
                console.log(`✅ 오디오 생성됨: ${audioBlob.size} bytes`);
                return { success: true, audioSize: audioBlob.size };
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ API 키 테스트 실패:', response.status);
                console.error('❌ 에러 응답:', errorData);
                return { success: false, status: response.status, error: errorData };
            }

        } catch (error) {
            console.error('❌ API 키 테스트 중 예외 발생:', error);
            return { success: false, error: error.message };
        }
    };

    // 서버 캐시 키와 로컬 생성 캐시 키 비교 (디버깅용)
    window.compareServerCacheKeys = async function(sampleSize = 50) {
        console.log('🔍 서버 캐시 키 vs 로컬 생성 캐시 키 비교 시작...\n');

        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 노트 데이터가 없습니다. 먼저 페이지를 로드하세요.');
            return;
        }

        // 1. 서버에서 캐시 키 목록 가져오기
        console.log('📥 서버 캐시 키 목록 다운로드 중...');
        const response = await fetch(`${cacheManager.cacheApiEndpoint}-list?limit=${sampleSize}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            console.error('❌ 서버 캐시 목록을 가져올 수 없습니다:', response.status);
            return;
        }

        const serverData = await response.json();
        const serverKeys = new Set(serverData.cacheKeys.map(k => k.key));
        console.log(`✅ 서버 캐시: ${serverKeys.size}개\n`);

        // 2. 로컬에서 캐시 키 생성
        console.log('🔑 로컬 캐시 키 생성 중...');
        const localKeys = new Map(); // key -> note info

        const samples = reader.pages.slice(0, Math.min(sampleSize, reader.pages.length));
        for (const page of samples) {
            const notePath = page.file.path;
            const content = cacheManager.getNoteContent(page);
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);
            localKeys.set(cacheKey, {
                title: page.file.name,
                path: notePath,
                contentLength: content.length
            });
        }

        console.log(`✅ 로컬 생성: ${localKeys.size}개\n`);

        // 3. 매칭 분석
        const matches = [];
        const mismatches = [];

        for (const [localKey, noteInfo] of localKeys.entries()) {
            if (serverKeys.has(localKey)) {
                matches.push({ key: localKey, ...noteInfo });
            } else {
                mismatches.push({ key: localKey, ...noteInfo });
            }
        }

        // 4. 결과 출력
        console.log('📊 분석 결과:\n');
        console.log(`전체 비교: ${localKeys.size}개`);
        console.log(`✅ 매칭: ${matches.length}개 (${((matches.length / localKeys.size) * 100).toFixed(1)}%)`);
        console.log(`❌ 불일치: ${mismatches.length}개 (${((mismatches.length / localKeys.size) * 100).toFixed(1)}%)\n`);

        if (mismatches.length > 0) {
            console.log('❌ 불일치 캐시 키 샘플 (최대 10개):\n');
            mismatches.slice(0, 10).forEach((item, idx) => {
                console.log(`[${idx + 1}] ${item.title}`);
                console.log(`  경로: ${item.path}`);
                console.log(`  내용 길이: ${item.contentLength}자`);
                console.log(`  캐시 키: ${item.key}\n`);
            });

            console.log('💡 불일치 원인 가능성:');
            console.log('  1. 노트 내용이 최근 수정됨');
            console.log('  2. cleanTextForTTS() 함수가 변경됨');
            console.log('  3. 서버에 아직 캐시되지 않은 새 노트');
        }

        if (matches.length > 0) {
            console.log('✅ 매칭된 캐시 키 샘플 (최대 5개):\n');
            matches.slice(0, 5).forEach((item, idx) => {
                console.log(`[${idx + 1}] ${item.title} - ${item.key}`);
            });
        }

        return {
            totalCompared: localKeys.size,
            matches: matches.length,
            mismatches: mismatches.length,
            matchRate: ((matches.length / localKeys.size) * 100).toFixed(1) + '%',
            mismatchedKeys: mismatches
        };
    };

    // 로컬스토리지에서 사용량 복원
    const savedChars = localStorage.getItem('azureTTS_totalChars');
    if (savedChars && !isNaN(savedChars)) {
        window.azureTTSReader.totalCharsUsed = parseInt(savedChars, 10);
    }

    // 초기 로딩 시 유료 API 설정 확인
    if (window.apiKeyConfig.usePaidApi && !window.apiKeyConfig.paidKey) {
        console.warn('⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다.');
        console.log('💡 진단 실행: window.diagnosePaidApi()');
    }

    // 로컬스토리지에서 마지막 재생 위치 복원 + 서버 동기화
    // v4.2.1: azureTTS_lastIndex → azureTTS_lastPlayedIndex 마이그레이션
    let savedIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
    if (!savedIndex) {
        // 이전 버전 호환성
        savedIndex = localStorage.getItem('azureTTS_lastIndex');
        if (savedIndex) {
            localStorage.setItem('azureTTS_lastPlayedIndex', savedIndex);
            localStorage.removeItem('azureTTS_lastIndex');
            console.log('🔄 Migrated lastIndex to lastPlayedIndex');
        }
    }

    // ☁️ 페이지 로드 시 서버와 동기화하여 최신 재생 위치 가져오기
    const localIndex = savedIndex ? parseInt(savedIndex, 10) : -1;
    const syncedIndex = await window.playbackPositionManager.syncPosition(localIndex);

    if (syncedIndex >= 0) {
        window.azureTTSReader.currentIndex = syncedIndex;
        window.azureTTSReader.lastPlayedIndex = syncedIndex;
        console.log(`📍 Restored playback position: ${syncedIndex + 1}/${window.azureTTSReader.pages.length}`);
    } else if (savedIndex && !isNaN(savedIndex)) {
        // 폴백: 서버 동기화 실패 시 로컬 값 사용
        window.azureTTSReader.currentIndex = parseInt(savedIndex, 10);
        window.azureTTSReader.lastPlayedIndex = parseInt(savedIndex, 10);
    }

    // ============================================
    // 🎨 UI 생성
    // ============================================

    // 서버 캐시 관리 패널
    const cachePanel = dv.container.createEl('div', {
        attr: {
            style: 'margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
        }
    });

    cachePanel.createEl('h3', {
        text: '☁️ 서버 캐시 관리 (Azure Blob Storage)',
        attr: {
            style: 'color: white; margin: 0 0 15px 0;'
        }
    });

    const statsDiv = cachePanel.createEl('div', {
        attr: {
            id: 'cache-stats-content',
            style: 'background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; margin-bottom: 15px; color: white;'
        }
    });

    statsDiv.innerHTML = `
        <div style="font-size: 14px;">
            <div>📊 총 요청: <strong id="cached-count">0</strong></div>
            <div>💾 캐시 히트: <strong id="hit-count">0</strong></div>
            <div>🌐 캐시 미스: <strong id="miss-count">0</strong></div>
            <div>⚡ 히트율: <strong id="hit-rate">0%</strong></div>
        </div>
    `;

    const buttonStyle = 'background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 5px;';

    const refreshStatsBtn = cachePanel.createEl('button', {
        text: '🔄 통계 새로고침',
        attr: { style: buttonStyle }
    });
    refreshStatsBtn.onclick = window.updateCacheStatsDisplay;

    const resetStatsBtn = cachePanel.createEl('button', {
        text: '🔄 통계 초기화',
        attr: { style: buttonStyle + 'background: #FF9800;' }
    });
    resetStatsBtn.onclick = function() {
        window.serverCacheManager.resetStats();
        window.updateCacheStatsDisplay();
        alert('✅ 캐시 통계가 초기화되었습니다.');
    };

    const clearOfflineBtn = cachePanel.createEl('button', {
        text: '🗑️ 오프라인 캐시 정리',
        attr: { style: buttonStyle + 'background: #9C27B0;' }
    });
    clearOfflineBtn.onclick = async function() {
        const deleted = await window.offlineCacheManager.clearOldCache(30);
        await window.updateCacheStatsDisplay();
        alert(`✅ ${deleted}개의 오래된 오프라인 캐시를 삭제했습니다.`);
    };

    const bulkGenerateBtn = cachePanel.createEl('button', {
        text: '⚡ 전체 노트 TTS 일괄 생성',
        attr: { style: buttonStyle + 'background: #2196F3;' }
    });
    bulkGenerateBtn.onclick = window.bulkGenerateAllNotes;

    const clearAllCacheBtn = cachePanel.createEl('button', {
        text: '🔥 전체 캐시 삭제',
        attr: { style: buttonStyle + 'background: #F44336;' }
    });
    clearAllCacheBtn.onclick = async function() {
        if (!confirm('⚠️ 모든 캐시를 삭제하시겠습니까?\n\n- 서버 캐시 (Azure Blob)\n- 오프라인 캐시 (IndexedDB)\n\n삭제 후 재생 시 모든 오디오를 새로 생성합니다.')) {
            return;
        }

        try {
            // 1. 서버 캐시 삭제
            const cacheApiEndpoint = config.azureFunctionUrl + (config.cacheEndpoint || '/api/cache');
            const clearResponse = await fetch(`${cacheApiEndpoint}-clear`, {
                method: 'DELETE'
            });

            if (!clearResponse.ok) {
                throw new Error(`서버 캐시 삭제 실패: ${clearResponse.status}`);
            }

            const clearData = await clearResponse.json();
            console.log(`☁️ 서버 캐시 삭제: ${clearData.deletedCount}개`);

            // 2. 오프라인 캐시 삭제 (전체)
            const db = window.offlineCacheManager.db;
            const transaction = db.transaction(['audio'], 'readwrite');
            const store = transaction.objectStore('audio');
            await store.clear();
            console.log('📱 오프라인 캐시 전체 삭제 완료');

            // 3. 통계 초기화
            window.serverCacheManager.resetStats();
            await window.updateCacheStatsDisplay();

            alert(`✅ 전체 캐시 삭제 완료!\n\n- 서버: ${clearData.deletedCount}개\n- 오프라인: 전체 삭제\n\n다음 재생 시 새 오디오가 생성됩니다.`);

        } catch (error) {
            console.error('❌ 캐시 삭제 실패:', error);
            alert(`❌ 캐시 삭제 실패\n\n${error.message}`);
        }
    };

    // 컨트롤 UI 생성
    const controlsDiv = dv.container.createEl('div', {
        attr: {
            style: 'margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
        }
    });

    const titleDiv = controlsDiv.createEl('div', {
        text: '🎵 Azure TTS 고품질 재생 (v4.3.0 - 발음 최적화)',
        attr: {
            style: 'color: white; font-size: 18px; font-weight: bold; margin-bottom: 15px;'
        }
    });

    // ⚙️ 설정 파일 생성 UI (obsidian-tts-config.md가 없을 경우만 표시)
    // localStorage에 "config-created" 플래그가 없고, window.ObsidianTTSConfig도 없을 때만 표시
    const configExists = window.ObsidianTTSConfig || localStorage.getItem('tts-config-created') === 'true';

    if (!configExists) {
        const configSetupDiv = controlsDiv.createEl('div', {
            attr: {
                id: 'config-setup-panel',
                style: 'margin-bottom: 15px; padding: 15px; background: rgba(255,193,7,0.2); border: 2px solid #FFC107; border-radius: 8px;'
            }
        });

        configSetupDiv.createEl('div', {
            text: '⚙️ 설정 파일 생성',
            attr: { style: 'color: #FFC107; font-size: 16px; font-weight: bold; margin-bottom: 10px;' }
        });

        configSetupDiv.createEl('div', {
            text: '현재 기본 설정을 사용 중입니다. 보안을 위해 별도 설정 파일 생성을 권장합니다.',
            attr: { style: 'color: white; font-size: 13px; margin-bottom: 10px; opacity: 0.9;' }
        });

        const inputDiv = configSetupDiv.createEl('div', {
            attr: { style: 'margin-bottom: 10px;' }
        });

        inputDiv.createEl('label', {
            text: 'Azure Function URL:',
            attr: { style: 'color: white; font-size: 13px; display: block; margin-bottom: 5px;' }
        });

        const urlInput = inputDiv.createEl('input', {
            attr: {
                type: 'text',
                id: 'azure-function-url-input',
                placeholder: 'https://your-app.azurewebsites.net',
                value: config.azureFunctionUrl || '',
                style: 'width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px;'
            }
        });

        const btnDiv = configSetupDiv.createEl('div', {
            attr: { style: 'display: flex; gap: 10px;' }
        });

        const createBtn = btnDiv.createEl('button', {
            text: '✅ 설정 파일 생성',
            attr: {
                style: 'padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px;'
            }
        });

        const skipBtn = btnDiv.createEl('button', {
            text: '⏭️ 나중에',
            attr: {
                style: 'padding: 10px 20px; background: #757575; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;'
            }
        });

        // 설정 파일 생성 버튼 클릭
        createBtn.onclick = async function() {
            const url = urlInput.value.trim();
            if (!url) {
                alert('❌ Azure Function URL을 입력하세요.');
                return;
            }

            // URL 검증
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                alert('❌ URL은 http:// 또는 https://로 시작해야 합니다.');
                return;
            }

            try {
                // 설정 파일 내용 생성
                const configContent = `---
해시태그: "#tts-config"
---

> 🔧 Obsidian TTS 설정 파일
> 이 노트는 git에 업로드되지 않습니다 (.gitignore에 포함)

# 설정

\`\`\`dataviewjs
window.ObsidianTTSConfig = {
    // Azure Function 백엔드 URL
    azureFunctionUrl: '${url}',

    // API 엔드포인트
    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    playbackStateEndpoint: '/api/playback-state',
    scrollPositionEndpoint: '/api/scroll-position',

    // Azure Speech API 키
    azureFreeApiKey: '${config.azureFreeApiKey}',
    azurePaidApiKey: '${config.azurePaidApiKey}',
    usePaidApi: false,

    // 기본 TTS 설정
    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    defaultPitch: 0,
    defaultVolume: 100,

    // 캐시 설정
    enableOfflineCache: true,
    cacheTtlDays: 30,

    // 디버그 모드
    debugMode: false
};

console.log('✅ Obsidian TTS Config loaded:', window.ObsidianTTSConfig);
\`\`\`

# 사용 가이드

이 설정 파일은 TTS Reader 노트에서 자동으로 로드됩니다.

## 설정 변경

위의 \`window.ObsidianTTSConfig\` 객체의 값을 수정하세요.

---

**생성 시각**: ${new Date().toLocaleString('ko-KR')}
**생성 방법**: TTS Reader UI
`;

                // Obsidian API를 통해 파일 생성
                const vault = app.vault;
                const configPath = 'obsidian-tts-config.md';

                // 파일이 이미 존재하는지 확인
                const existingFile = vault.getAbstractFileByPath(configPath);
                if (existingFile) {
                    await vault.modify(existingFile, configContent);
                } else {
                    await vault.create(configPath, configContent);
                }

                // localStorage에 플래그 저장
                localStorage.setItem('tts-config-created', 'true');

                alert('✅ 설정 파일이 생성되었습니다!\n\n노트를 새로고침하면 설정이 적용됩니다.');

                // UI 패널 숨기기
                configSetupDiv.style.display = 'none';

            } catch (error) {
                console.error('❌ 설정 파일 생성 실패:', error);
                alert('❌ 설정 파일 생성에 실패했습니다.\n\n' + error.message);
            }
        };

        // 나중에 버튼 클릭
        skipBtn.onclick = function() {
            if (confirm('기본 설정으로 계속 사용하시겠습니까?\n\n보안을 위해 설정 파일 생성을 권장합니다.')) {
                configSetupDiv.style.display = 'none';
                localStorage.setItem('tts-config-setup-skipped', 'true');
            }
        };

        // 이전에 건너뛰기를 선택한 경우 패널 숨기기
        if (localStorage.getItem('tts-config-setup-skipped') === 'true') {
            configSetupDiv.style.display = 'none';
        }
    }

    // ☁️ 마지막 재생 위치 표시 (재생 버튼 위)
    const lastPlayedDiv = controlsDiv.createEl('div', {
        attr: {
            id: 'last-played-info',
            style: 'margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 14px;'
        }
    });

    // 초기 마지막 재생 위치 표시
    if (window.azureTTSReader.lastPlayedIndex >= 0) {
        const lastNote = window.azureTTSReader.pages[window.azureTTSReader.lastPlayedIndex];
        if (lastNote) {
            lastPlayedDiv.innerHTML = `
                💾 마지막 재생: <strong>${window.azureTTSReader.lastPlayedIndex + 1}번</strong> - ${lastNote.file.name}
                <br><small style="opacity: 0.9;">다음 재생 시 ${window.azureTTSReader.lastPlayedIndex + 2}번부터 시작됩니다</small>
            `;
        }
    } else {
        lastPlayedDiv.textContent = '준비됨 - 아래 버튼을 클릭하여 재생하세요';
    }

    // 💳 API 모드 선택 (재생 버튼 위)
    const apiModeDiv = controlsDiv.createEl('div', {
        attr: {
            style: 'margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.15); border-radius: 8px;'
        }
    });

    const apiLabel = apiModeDiv.createEl('label', {
        attr: {
            style: 'display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; font-size: 14px;'
        }
    });

    const apiCheckbox = apiLabel.createEl('input', {
        attr: {
            type: 'checkbox',
            id: 'use-paid-api-control',
            style: 'cursor: pointer; width: 18px; height: 18px;'
        }
    });

    if (window.apiKeyConfig.usePaidApi) {
        apiCheckbox.checked = true;
    }

    apiLabel.createEl('span', {
        text: '💳 유료 API 사용 (S0)',
        attr: { style: 'font-weight: bold;' }
    });

    apiCheckbox.addEventListener('change', function(e) {
        const usePaid = e.target.checked;
        window.apiKeyConfig.usePaidApi = usePaid;
        localStorage.setItem('azureTTS_usePaidApi', usePaid.toString());

        const mode = usePaid ? '유료 API (S0)' : '무료 API (F0)';
        console.log(`🔄 API 모드 전환: ${mode}`);

        // 사용량 표시도 업데이트
        window.updateUsageDisplay();

        alert(`✅ ${mode}로 전환되었습니다.\n\n다음 TTS 요청부터 적용됩니다.`);
    });

    // 재생 버튼 영역
    const btnStyle = 'margin: 5px; padding: 12px 24px; font-size: 16px; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; transition: all 0.3s;';

    // 이전 버튼 (NEW)
    const prevBtn = controlsDiv.createEl('button', {
        text: '⏮️ 이전',
        attr: { style: btnStyle + 'background: #9C27B0;' }
    });
    prevBtn.onclick = window.azureTTSPrevious;
    prevBtn.onmouseover = function() { this.style.background = '#7b1fa2'; };
    prevBtn.onmouseout = function() { this.style.background = '#9C27B0'; };

    // 재생 버튼
    const playBtn = controlsDiv.createEl('button', {
        text: '▶️ 재생 시작',
        attr: { style: btnStyle + 'background: #4CAF50;' }
    });
    playBtn.onclick = window.azureTTSPlay;
    playBtn.onmouseover = function() { this.style.background = '#45a049'; };
    playBtn.onmouseout = function() { this.style.background = '#4CAF50'; };

    // 일시정지 버튼
    const pauseBtn = controlsDiv.createEl('button', {
        text: '⏸️ 일시정지',
        attr: { style: btnStyle + 'background: #FF9800;' }
    });
    pauseBtn.onclick = window.azureTTSPause;
    pauseBtn.onmouseover = function() { this.style.background = '#e68900'; };
    pauseBtn.onmouseout = function() { this.style.background = '#FF9800'; };

    // 정지 버튼
    const stopBtn = controlsDiv.createEl('button', {
        text: '⏹️ 정지',
        attr: { style: btnStyle + 'background: #F44336;' }
    });
    stopBtn.onclick = window.azureTTSStop;
    stopBtn.onmouseover = function() { this.style.background = '#da190b'; };
    stopBtn.onmouseout = function() { this.style.background = '#F44336'; };

    // 다음 버튼
    const nextBtn = controlsDiv.createEl('button', {
        text: '⏭️ 다음',
        attr: { style: btnStyle + 'background: #2196F3;' }
    });
    nextBtn.onclick = window.azureTTSNext;
    nextBtn.onmouseover = function() { this.style.background = '#0b7dda'; };
    nextBtn.onmouseout = function() { this.style.background = '#2196F3'; };

    // 속도 조절
    const rateDiv = controlsDiv.createEl('div', {
        attr: {
            style: 'margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;'
        }
    });

    const rateLabel = rateDiv.createEl('label', {
        text: '재생 속도: ',
        attr: {
            style: 'color: white; font-weight: bold; margin-right: 10px;'
        }
    });

    const rateDisplay = rateLabel.createEl('span', {
        text: '1.0x',
        attr: {
            id: 'rate-display',
            style: 'color: #FFD700; font-size: 18px;'
        }
    });

    const rateSlider = rateDiv.createEl('input', {
        attr: {
            type: 'range',
            min: '0.5',
            max: '2.0',
            step: '0.1',
            value: '1.0',
            style: 'width: 200px; margin-left: 10px; vertical-align: middle;'
        }
    });

    rateSlider.oninput = function() {
        window.azureTTSSetRate(this.value);
    };

    // API 사용량 표시
    const usageDiv = dv.container.createEl('div', {
        attr: {
            id: 'tts-usage-azure',
            style: 'margin-top: 15px; min-height: 180px;'
        }
    });

    // 초기 로딩 상태 표시
    usageDiv.innerHTML = `
        <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-height: 180px;">
            <h3 style="color: white; margin: 0 0 15px 0; font-size: 16px;">📊 API 사용량 (이번 달)</h3>
            <div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.1); border-radius: 5px;">
                🔄 사용량 로딩 중...
            </div>
        </div>
    `;

    // 초기 로딩: 사용량 확인 (경고만 표시, 자동 전환 없음)
    (async () => {
        const backendData = await window.fetchUsageFromBackend();
        if (backendData) {
            const totalUsed = backendData.totalChars || (backendData.freeChars + backendData.paidChars);
            const freeLimit = backendData.freeLimit || 500000;
            const usagePercentage = (totalUsed / freeLimit) * 100;

            // 경고만 표시 (사용자가 수동으로 유료 API 선택해야 함)
            if (usagePercentage >= 90) {
                console.warn('⚠️ 무료 할당량 부족 (' + usagePercentage.toFixed(1) + '%) - 유료 API 사용을 권장합니다');
            }
        }
        await window.updateUsageDisplay();
    })();

    // 초기 캐시 통계 표시 (serverCacheManager 초기화 대기)
    setTimeout(() => {
        if (window.serverCacheManager && window.serverCacheManager.stats) {
            window.updateCacheStatsDisplay();
            console.log('📊 Initial cache stats loaded:', window.serverCacheManager.stats);
        }
    }, 100);

    // 📝 참고: 진행 상황은 재생 컨트롤 영역(last-played-info)에 통합 표시됨

    // 노트 목록 표시
    dv.header(3, `📚 총 ${window.azureTTSReader.pages.length}개의 노트 (출제예상 + 130~137회 기출)`);

    const tableDiv = dv.container.createEl('table', {
        attr: {
            style: 'width: 100%; border-collapse: collapse; margin-top: 10px;'
        }
    });

    const thead = tableDiv.createEl('thead');
    const headerRow = thead.createEl('tr');
    ['재생', '토픽', '정의 (미리보기)'].forEach(header => {
        headerRow.createEl('th', {
            text: header,
            attr: {
                style: 'border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: left;'
            }
        });
    });

    const tbody = tableDiv.createEl('tbody');

    window.azureTTSReader.pages.forEach((p, idx) => {
        const row = tbody.createEl('tr', {
            attr: {
                style: 'border: 1px solid #ddd;'
            }
        });

        // 재생 버튼
        const playCell = row.createEl('td', {
            attr: {
                style: 'border: 1px solid #ddd; padding: 8px; text-align: center; width: 60px;'
            }
        });

        const playBtn = playCell.createEl('button', {
            text: '▶️',
            attr: {
                style: 'padding: 5px 10px; cursor: pointer; border: none; background: #4CAF50; color: white; border-radius: 3px; font-size: 14px;'
            }
        });

        playBtn.onclick = function() {
            window.azureTTSPlayFrom(idx);
        };

        playBtn.onmouseover = function() {
            this.style.background = '#45a049';
        };

        playBtn.onmouseout = function() {
            this.style.background = '#4CAF50';
        };

        // 토픽
        const topicCell = row.createEl('td', {
            attr: {
                style: 'border: 1px solid #ddd; padding: 8px;'
            }
        });

        topicCell.createEl('a', {
            text: p.file.name,
            attr: {
                href: p.file.path,
                class: 'internal-link'
            }
        });

        // 정의 미리보기
        const defCell = row.createEl('td', {
            text: p.정의 ? String(p.정의).substring(0, 80) + "..." : "-",
            attr: {
                style: 'border: 1px solid #ddd; padding: 8px; color: #666; font-size: 13px;'
            }
        });
    });
}
```

---

## 🎯 v4.0 새로운 기능

### ✨ 1. 디바이스 간 캐시 공유 (Azure Blob Storage)
- 브라우저 Cache API → Azure Blob Storage로 전환
- PC, 태블릿, 스마트폰 등 모든 디바이스에서 캐시 공유
- 30일 TTL 자동 관리
- 실시간 캐시 히트율 추적

### ✨ 2. 마지막 재생 위치 자동 재개
- 마지막으로 재생한 노트 추적
- "재생 시작" 클릭 시 **마지막 노트의 다음**부터 자동 시작
- 모든 노트 완료 시 처음부터 재시작

### ✨ 3. 볼드 텍스트 악센트 적용
- `**강조할 텍스트**` → SSML `<emphasis level="strong">` 변환
- Azure Neural Voice의 자연스러운 강조 표현
- 중요한 키워드 강조 가능

### ✨ 4. 보안 강화
- API 엔드포인트는 퍼블릭 (문제없음)
- 실제 키값은 `.env` / `local.settings.json`에만 존재
- `.gitignore`로 민감 파일 보호

---

## 📝 사용 방법

### 1단계: Keychain에 민감정보 등록 (v5.0.0 신규)

Obsidian 1.11.5 이상에서 Keychain 기능을 사용하여 안전하게 민감정보를 저장합니다.

1. **Settings (⚙️) → About → Keychain** 메뉴로 이동
2. 다음 키를 등록:
   - **키 이름**: `azure-function-url`
     **값**: Azure Function URL (예: `https://your-app.azurewebsites.net`)

   - **키 이름**: `azure-tts-free-key`
     **값**: 무료 Azure Speech API 키 (F0 tier)

   - **키 이름**: `azure-tts-paid-key`
     **값**: 유료 Azure Speech API 키 (S0 tier, 선택사항)

3. 저장 후 Obsidian 재시작 불필요 - 즉시 적용됨

> **🔐 보안 이점**:
> - API 키와 서버 URL이 노트 파일에 저장되지 않음
> - Git 커밋에 노출될 위험 완전 제거
> - 무단 사용 및 DDoS 공격 위험 감소
> - 시스템 Keychain (macOS: Keychain Access, Windows: Credential Manager)에 암호화 저장

### 2단계: 백엔드 환경 변수 설정

Azure Portal → Function App → Configuration에서 설정:

```
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=koreacentral
AZURE_STORAGE_CONNECTION_STRING=your-storage-connection
```

### 3단계: v5 노트 사용

기존 v4 노트 대신 이 파일을 사용하세요.

### 3단계: 재생 테스트

1. "재생 시작" 클릭
2. 콘솔(F12)에서 캐시 동작 확인
3. 다른 디바이스에서 동일한 노트 재생 → 캐시 히트!

---

## 🔍 캐시 동작 확인

### 첫 번째 실행:
```
=== 노트 1/100: API ===
Cache Key: abc123def456-789012345678
📥 Checking server cache: abc123def456-789012345678
⚠️ Server cache MISS: abc123def456-789012345678
🌐 Azure TTS API 호출 시작
✅ TTS 생성 완료: 12345 bytes, 123 chars
📤 Saving to server cache: abc123def456-789012345678
✅ Server cached: abc123def456-789012345678, size: 12345 bytes
```

### 두 번째 실행 (같은 디바이스):
```
=== 노트 1/100: API ===
Cache Key: abc123def456-789012345678
📥 Checking server cache: abc123def456-789012345678
💾 Server cache HIT: abc123def456-789012345678 (12345 bytes) ⚡
💾 Using cached audio (12345 bytes)
```

### 다른 디바이스에서 실행:
```
💾 Server cache HIT: abc123def456-789012345678 (12345 bytes) ⚡
(PC에서 생성한 캐시를 태블릿/스마트폰에서 사용!)
```

---

## 🔐 v4에서 v5로 마이그레이션 가이드

### v4.x를 사용 중이신가요?

기존 TTS v4 노트에서 하드코딩된 API 키를 Keychain으로 안전하게 이전하세요.

#### 마이그레이션 단계:

1. **v4 노트에서 민감정보 복사**
   - `azureFunctionUrl` 값 복사 (Line 548)
   - `azureFreeApiKey` 값 복사 (Line 553)
   - `azurePaidApiKey` 값 복사 (Line 554, 있는 경우)

2. **Keychain에 등록**
   - Settings → About → Keychain
   - `azure-function-url`: 복사한 Azure Function URL 입력
   - `azure-tts-free-key`: 복사한 무료 API 키 입력
   - `azure-tts-paid-key`: 복사한 유료 API 키 입력 (선택)

3. **v5 노트 사용 시작**
   - 이 파일(v5)로 전환
   - 콘솔(F12)에서 "✅ Keychain에서 민감정보 로드 완료" 확인
   - 모든 기능 정상 작동 확인

4. **v4 노트 정리 (선택)**
   - v4 노트를 백업용으로 보관하거나
   - 민감정보 부분만 삭제하여 안전하게 보관

#### 주요 차이점:

| 항목 | v4.3.0 | v5.0.0 (Keychain) |
|------|--------|-------------------|
| API 키 저장 위치 | 노트 파일 내 하드코딩 | Keychain (암호화) |
| Git 커밋 시 노출 | ⚠️ 위험 (수동 제외 필요) | ✅ 안전 (자동 분리) |
| 다른 PC 동기화 | ⚠️ API 키 함께 동기화 | ✅ 키는 분리, 설정만 동기화 |
| 보안 수준 | 🟡 중간 | 🟢 높음 (시스템 Keychain) |
| 설정 편의성 | 코드 직접 수정 | UI에서 간단 등록 |

#### 롤백 방법:

v5에서 문제가 발생하면 언제든 v4로 돌아갈 수 있습니다:
- v4 노트 파일 재사용
- 모든 데이터 (캐시, 재생 위치 등)는 공유됨

---

## 📚 Keychain 사용법 (Obsidian 1.11.5+)

### Keychain이란?

Obsidian 1.11.5에서 추가된 보안 기능으로, 민감한 정보(API 키, 비밀번호 등)를 안전하게 저장합니다.

- **macOS**: Keychain Access에 저장
- **Windows**: Credential Manager에 저장
- **Linux**: Secret Service API 사용

### 저장된 키 확인 방법:

#### macOS:
1. Keychain Access 앱 실행
2. "login" 키체인 선택
3. `azure-tts-free-key` 검색

#### Windows:
1. 제어판 → Credential Manager
2. Windows 자격 증명 → 일반 자격 증명
3. `obsidian-azure-tts-free-key` 확인

### 자주 묻는 질문 (FAQ):

**Q: Keychain 키를 변경하려면?**
A: Settings → About → Keychain에서 동일한 키 이름으로 다시 등록하면 덮어씁니다.

**Q: 여러 Vault에서 같은 키를 사용할 수 있나요?**
A: 네, 시스템 Keychain에 저장되므로 모든 Vault에서 공유 가능합니다.

**Q: 다른 PC로 동기화하려면?**
A: Keychain은 PC별로 관리되므로, 각 PC에서 한 번씩 등록해야 합니다. (보안상 의도된 설계)

**Q: Obsidian 1.11.5 미만 버전에서는?**
A: v4 노트를 사용하거나, `obsidian-tts-config.md` 파일에 키를 저장하세요.

---

**버전**: 5.0.0
**최종 업데이트**: 2026-01-30
**새로운 기능**: Keychain 통합, 민감정보 분리, 보안 강화
**이전 기능 유지**: 서버 캐싱, 자동 재개, 볼드 강조, 발음 최적화
