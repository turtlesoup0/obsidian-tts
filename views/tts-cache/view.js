// ============================================
// tts-cache: offlineCacheManager + serverCacheManager
// 의존성: tts-core, tts-text
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.offlineCacheManager) {

    // ============================================
    // Offline Cache Manager (IndexedDB)
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
                    window.ttsLog?.('✅ Offline cache database initialized');
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
                window.ttsLog?.('🔄 Reconnecting to IndexedDB...');
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
                    window.ttsLog?.(`💾 Saved to offline cache: ${cacheKey} (${audioBlob.size} bytes)`);
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
                        window.ttsLog?.(`📱 Retrieved from offline cache: ${cacheKey}`);
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
                        window.ttsLog?.(`🗑️ Cleared ${deletedCount} old offline cache entries`);
                        resolve(deletedCount);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        },

        async deleteAudio(cacheKey) {
            await this.ensureConnection();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['audio'], 'readwrite');
                const store = transaction.objectStore('audio');
                const request = store.delete(cacheKey);
                request.onsuccess = () => {
                    window.ttsLog?.(`🗑️ Deleted from offline cache: ${cacheKey}`);
                    resolve(true);
                };
                request.onerror = () => reject(request.error);
            });
        },

        async clearAll() {
            await this.ensureConnection();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['audio'], 'readwrite');
                const store = transaction.objectStore('audio');
                const request = store.clear();
                request.onsuccess = () => {
                    window.ttsLog?.('🗑️ Offline cache cleared');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }
    };

    // 초기화 및 진단
    window.offlineCacheManager.init()
        .then(() => {
            window.ttsLog?.('✅ 오프라인 캐시 초기화 성공');
            return window.offlineCacheManager.getCacheStats();
        })
        .then(stats => {
            window.ttsLog?.(`📱 오프라인 캐시: ${stats.count}개 파일, ${stats.totalSizeMB}MB`);
        })
        .catch(error => {
            console.error('❌ 오프라인 캐시 초기화 실패:', error);
            console.warn('⚠️ 오프라인 캐시를 사용할 수 없습니다. 서버 캐시만 사용됩니다.');
        });
}

// ============================================
// Server Cache Manager (Azure Blob Storage)
// ============================================
if (!window.serverCacheManager) {

    window.serverCacheManager = {
        cacheApiEndpoint: null,

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

        stats: null,

        // 노트 내용을 TTS용 텍스트로 변환
        getNoteContent(page) {
            let textToSpeak = `주제: ${page.file.name}. `;

            if (page.정의) {
                const cleanDef = window.cleanTextForTTS(page.정의);
                textToSpeak += `정의: ${cleanDef}. `;
            }

            if (page.키워드) {
                let cleanKw = window.cleanTextForTTS(page.키워드);
                textToSpeak += `키워드: ${cleanKw}`;
            }

            return window.cleanTextForTTS(textToSpeak);
        },

        _hashCache: new Map(),
        _hashCacheMaxSize: 500,

        async hashContent(text) {
            // 메모이제이션: 동일 텍스트 반복 해싱 방지
            const cached = this._hashCache.get(text);
            if (cached) return cached;

            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24);

            // LRU 방식: 크기 초과 시 가장 오래된 항목 삭제
            if (this._hashCache.size >= this._hashCacheMaxSize) {
                const firstKey = this._hashCache.keys().next().value;
                this._hashCache.delete(firstKey);
            }
            this._hashCache.set(text, hash);
            return hash;
        },

        async generateCacheKey(notePath, content) {
            const version = window.PRONUNCIATION_PROFILE_VERSION || 'ko-v1.2';

            const noteHash = await this.hashContent(notePath);
            const contentHash = await this.hashContent(content);
            const versionHash = await this.hashContent(version);

            return `${noteHash}-${contentHash}-${versionHash}`;
        },

        async getCachedAudioFromServer(cacheKey) {
            // 로컬 모드에서는 서버 캐시 조회 스킵
            if (window.ttsModeConfig?.features?.cache === 'local') {
                window.ttsLog?.(`📱 로컬 모드 - 서버 캐시 조회 스킵`);
                this.stats.totalRequests++;
                this.stats.cacheMisses++;
                this.saveStats();
                return null;
            }

            // 캐시 삭제 후 일정 시간 동안 서버 캐시 조회 스킵
            const cacheClearTime = localStorage.getItem('ttsServerCacheClearTime');
            if (cacheClearTime) {
                const clearTime = parseInt(cacheClearTime, 10);
                const now = Date.now();
                const SKIP_DURATION_MS = 60000; // 캐시 삭제 후 60초 동안 서버 캐시 조회 스킵

                if (now - clearTime < SKIP_DURATION_MS) {
                    const remainingSeconds = Math.ceil((SKIP_DURATION_MS - (now - clearTime)) / 1000);
                    window.ttsLog?.(`🚫 서버 캐시 삭제 후 ${remainingSeconds}초 남음 - 서버 캐시 조회 스킵`);
                    this.stats.totalRequests++;
                    this.stats.cacheMisses++;
                    this.saveStats();
                    return null;
                }
            }

            try {
                this.stats.totalRequests++;
                this.saveStats();
                window.ttsLog?.(`📥 Checking server cache: ${cacheKey}`);

                const response = await window.fetchWithTimeout(`${this.cacheApiEndpoint}/${cacheKey}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'audio/mpeg'
                    }
                }, 15000);

                if (response.status === 404) {
                    window.ttsLog?.(`⚠️ Server cache MISS: ${cacheKey}`);
                    this.stats.cacheMisses++;
                    this.saveStats();
                    return null;
                }

                if (!response.ok) {
                    console.error(`❌ Cache fetch failed: ${response.status}`);
                    this.stats.cacheMisses++;
                    this.saveStats();
                    return null;
                }

                const audioBlob = await response.blob();
                const serverContentType = response.headers.get('Content-Type') || '(없음)';

                // 서버 캐시 응답 유효성 검사
                if (audioBlob.size < 1000 || (!serverContentType.includes('audio') && !serverContentType.includes('octet-stream'))) {
                    console.warn(`⚠️ 서버 캐시 응답 의심: size=${audioBlob.size}, type=${serverContentType}`);
                    this.stats.cacheMisses++;
                    this.saveStats();
                    return null;
                }

                window.ttsLog?.(`💾 Server cache HIT: ${cacheKey} (${audioBlob.size} bytes) ⚡`);
                this.stats.cacheHits++;
                this.saveStats();

                return {
                    audioBlob,
                    cachedAt: response.headers.get('X-Cached-At'),
                    expiresAt: response.headers.get('X-Expires-At'),
                    size: audioBlob.size
                };
            } catch (error) {
                console.error('❌ Server cache read failed:', error);
                this.stats.cacheMisses++;
                this.saveStats();
                return null;
            }
        },

        async saveAudioToServer(cacheKey, audioBlob) {
            try {
                window.ttsLog?.(`📤 Saving to server cache: ${cacheKey} (${audioBlob.size} bytes)`);

                const response = await window.fetchWithTimeout(`${this.cacheApiEndpoint}/${cacheKey}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'audio/mpeg'
                    },
                    body: audioBlob
                }, 15000);

                if (!response.ok) {
                    console.error(`❌ Cache save failed: ${response.status}`);
                    return false;
                }

                const result = await response.json();
                window.ttsLog?.(`✅ Server cached: ${cacheKey}, size: ${result.size} bytes`);
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

        async getServerCacheCount() {
            try {
                const response = await window.fetchWithTimeout(`${this.cacheApiEndpoint}-stats`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 10000);

                if (response.ok) {
                    const data = await response.json();
                    window.ttsLog?.('📊 Server cache stats:', data);
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
            this.saveStats();
            window.ttsLog?.('🔄 Cache stats reset');
        },

        // R3: Individual cache deletion function
        async deleteCacheFromBoth(cacheKey) {
            const results = { offline: false, server: false, errors: [] };

            // Delete from offline cache
            try {
                await window.offlineCacheManager.deleteAudio(cacheKey);
                results.offline = true;
                window.ttsLog?.(`🗑️ 오프라인 캐시 삭제 성공: ${cacheKey}`);
            } catch (error) {
                results.errors.push(`오프라인 캐시 삭제 실패: ${error.message}`);
                console.error('❌ Failed to delete offline cache:', error);
            }

            // Delete from server cache (skip in local mode)
            if (window.ttsModeConfig?.features?.cache !== 'local') {
                try {
                    const response = await window.fetchWithTimeout(`${this.cacheApiEndpoint}/${cacheKey}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    }, 10000);

                    if (response.ok) {
                        results.server = true;
                        window.ttsLog?.(`🗑️ 서버 캐시 삭제 성공: ${cacheKey}`);
                    } else {
                        results.errors.push(`서버 캐시 삭제 실패: HTTP ${response.status}`);
                    }
                } catch (error) {
                    results.errors.push(`서버 캐시 삭제 실패: ${error.message}`);
                    console.error('❌ Failed to delete server cache:', error);
                }
            } else {
                window.ttsLog?.(`📱 로컬 모드 - 서버 캐시 삭제 스킵`);
            }

            return results;
        },

        // R4: Individual cache regeneration function
        async regenerateCache(cacheKey, page, content, apiEndpoint, voiceName) {
            // R4.2: Delete existing cache first
            const deleteResults = await this.deleteCacheFromBoth(cacheKey);
            window.ttsLog?.(`🔄 캐시 재생성 시작: ${page.file.name}`);

            try {
                // Generate new TTS
                window.ttsLog?.(`🎙️ TTS 생성 중...`);

                // Use existing TTS generation function
                const response = await window.fetchWithTimeout(apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: content,
                        voice: voiceName || window.ttsConfig?.defaultVoice || 'ko-KR-SunHiNeural',
                        rate: window.ttsConfig?.defaultRate || 1.0,
                        pitch: '+0Hz'
                    })
                }, 30000);

                if (!response.ok) {
                    throw new Error(`TTS 생성 실패: HTTP ${response.status}`);
                }

                const audioBlob = await response.blob();

                // Save to offline cache (순수 TTS만 저장)
                await window.offlineCacheManager.saveAudio(
                    cacheKey,
                    audioBlob,
                    page.file.path
                );

                // Save to server cache if not in local mode
                if (window.ttsModeConfig?.features?.cache !== 'local') {
                    await this.saveAudioToServer(cacheKey, audioBlob);
                }

                window.ttsLog?.(`✅ 캐시 재생성 완료: ${page.file.name}`);
                return { success: true, audioBlob: audioBlob };
            } catch (error) {
                console.error('❌ 캐시 재생성 실패:', error);
                throw new Error(`캐시 재생성 실패: ${error.message}`);
            }
        }
    };

    // stats 초기화 (localStorage에서 로드)
    window.serverCacheManager.stats = window.serverCacheManager.loadStats();

    // cacheApiEndpoint lazy 초기화 (tts-config보다 먼저 로드될 수 있으므로)
    window.serverCacheManager._cacheApiEndpoint = null;
    Object.defineProperty(window.serverCacheManager, 'cacheApiEndpoint', {
        get() {
            if (!this._cacheApiEndpoint && window.getActiveBaseUrl) {
                this._cacheApiEndpoint = window.getActiveBaseUrl() + (window.ttsConfig?.cacheEndpoint || '/api/cache');
            }
            return this._cacheApiEndpoint;
        },
        set(val) { this._cacheApiEndpoint = val; },
        configurable: true
    });

    // TTS 네임스페이스 등록 (기존 window.offlineCacheManager, window.serverCacheManager alias 유지)
    if (window.TTS) {
        window.TTS.offlineCache = window.offlineCacheManager;
        window.TTS.serverCache = window.serverCacheManager;
        window.TTS.registerModule('cache', {
            offline: window.offlineCacheManager,
            server: window.serverCacheManager
        });
    }

    window.ttsLog?.('✅ [tts-cache] 모듈 로드 완료 (cacheApiEndpoint: lazy init)');
}
