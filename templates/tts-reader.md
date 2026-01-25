---
해시태그: "#tts-reader"
---

> **📌 TTS Reader v5.0**
> **자동 설정**: obsidian-tts-config.md에서 설정 자동 로드
> **새로운 기능**:
> - 🔧 설정 파일 자동 감지
> - ☁️ Azure Blob Storage 기반 캐시 공유
> - 🔄 디바이스 간 재생 위치 동기화
> - 🎯 볼드 텍스트 강조
> - ⚡ 오프라인 캐싱

# TTS Reader

```dataviewjs
// ============================================
// 🔧 설정 로드
// ============================================

// obsidian-tts-config.md 설정 확인
const config = window.ObsidianTTSConfig;

if (!config) {
    dv.paragraph("⚠️ **설정 파일 필요**: `obsidian-tts-config.md` 파일을 생성하세요.");
    dv.paragraph("자동 생성 방법:");
    dv.paragraph("```bash\ncd /path/to/your/vault\ncurl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh\nchmod +x setup-obsidian.sh\n./setup-obsidian.sh\n```");
    throw new Error("Config not loaded");
}

// 설정값 추출
const AZURE_FUNCTION_URL = config.azureFunctionUrl;
const TTS_ENDPOINT = config.ttsEndpoint || '/api/tts-stream';
const CACHE_ENDPOINT = config.cacheEndpoint || '/api/cache';
const PLAYBACK_POSITION_ENDPOINT = config.playbackPositionEndpoint || '/api/playback-position';

console.log('✅ Config loaded:', {
    functionUrl: AZURE_FUNCTION_URL,
    ttsEndpoint: TTS_ENDPOINT,
    cacheEndpoint: CACHE_ENDPOINT,
    playbackPositionEndpoint: PLAYBACK_POSITION_ENDPOINT
});
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
                    items: items.map(item => ({
                        cacheKey: item.cacheKey,
                        notePath: item.notePath,
                        size: item.size,
                        timestamp: item.timestamp
                    }))
                });
            };
            request.onerror = () => reject(request.error);
        });
    }
};

// 초기화
await window.offlineCacheManager.init();
console.log('✅ Offline Cache Manager initialized');
```

```dataviewjs
// ============================================
// ☁️ Server Cache Manager (Azure Blob Storage)
// ============================================

const CACHE_API_ENDPOINT = `${AZURE_FUNCTION_URL}${CACHE_ENDPOINT}`;

window.serverCacheManager = {
    cacheApiEndpoint: CACHE_API_ENDPOINT,

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

    saveStats() {
        localStorage.setItem('serverCacheStats', JSON.stringify(this.stats));
    },

    stats: null,

    getNoteContent(page) {
        const subject = page.file.name || '';
        const definition = page.정의 || '';
        const keyword = page.키워드 || '';
        return `${subject}|${definition}|${keyword}`;
    },

    async hashContent(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24);
    },

    async generateCacheKey(notePath, content) {
        const noteHash = await this.hashContent(notePath);
        const contentHash = await this.hashContent(content);
        return `${noteHash}-${contentHash}`;
    },

    async getCachedAudioFromServer(cacheKey) {
        try {
            this.stats.totalRequests++;
            this.saveStats();
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
            console.log(`💾 Server cache HIT: ${cacheKey} (${audioBlob.size} bytes) ⚡`);
            this.stats.cacheHits++;
            this.saveStats();

            return { audioBlob };
        } catch (error) {
            console.error('❌ Server cache read failed:', error);
            this.stats.cacheMisses++;
            this.saveStats();
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

    resetStats() {
        this.stats.totalRequests = 0;
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
        this.saveStats();
        console.log('🔄 Cache stats reset');
    }
};

window.serverCacheManager.stats = window.serverCacheManager.loadStats();
console.log('✅ Server Cache Manager loaded', window.serverCacheManager.stats);
```

```dataviewjs
// ============================================
// 🔄 Playback Position Sync Manager
// ============================================

const PLAYBACK_POSITION_API = `${AZURE_FUNCTION_URL}${PLAYBACK_POSITION_ENDPOINT}`;

window.playbackPositionManager = {
    apiEndpoint: PLAYBACK_POSITION_API,
    deviceId: null,

    init() {
        this.deviceId = this.getDeviceId();
        console.log('📱 Playback Device ID:', this.deviceId);
    },

    getDeviceId() {
        const storageKey = 'playback_deviceId';
        let deviceId = localStorage.getItem(storageKey);

        if (!deviceId) {
            deviceId = `${navigator.platform}-${Math.random().toString(36).substring(2, 10)}`;
            localStorage.setItem(storageKey, deviceId);
        }

        return deviceId;
    },

    async getPosition() {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.warn('Failed to get playback position');
                return this.getLocalPosition();
            }

            const data = await response.json();
            console.log('☁️ Server playback position:', data);

            // 로컬에도 저장
            this.saveLocalPosition(data.notePath, data.noteIndex, data.playbackTime);

            return data;
        } catch (error) {
            console.error('Error getting playback position:', error);
            return this.getLocalPosition();
        }
    },

    async savePosition(notePath, noteIndex, playbackTime) {
        // 로컬 저장
        this.saveLocalPosition(notePath, noteIndex, playbackTime);

        // 서버 저장
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: this.deviceId,
                    notePath,
                    noteIndex,
                    playbackTime,
                    timestamp: Date.now()
                })
            });

            if (response.ok) {
                console.log('☁️ Playback position synced to server');
            }
        } catch (error) {
            console.error('Failed to sync playback position:', error);
        }
    },

    getLocalPosition() {
        const saved = localStorage.getItem('azureTTS_lastPlaybackPosition');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse local position:', e);
            }
        }
        return { notePath: '', noteIndex: 0, playbackTime: 0 };
    },

    saveLocalPosition(notePath, noteIndex, playbackTime) {
        const data = { notePath, noteIndex, playbackTime, timestamp: Date.now() };
        localStorage.setItem('azureTTS_lastPlaybackPosition', JSON.stringify(data));
    }
};

window.playbackPositionManager.init();
console.log('✅ Playback Position Sync Manager initialized');
```

```dataviewjs
// ============================================
// 🎵 Azure TTS Reader with Enhanced Features
// ============================================

const API_ENDPOINT = `${AZURE_FUNCTION_URL}${TTS_ENDPOINT}`;

// 전역 변수 초기화
window.azureTTSReader = window.azureTTSReader || {
    apiEndpoint: API_ENDPOINT,
    pages: [],
    currentIndex: 0,
    isPaused: false,
    isStopped: false,
    audioElement: null,
    currentAudioUrl: null,
    defaultVoice: config.defaultVoice || 'ko-KR-SunHiNeural',
    defaultRate: config.defaultRate || 1.0,
    defaultPitch: config.defaultPitch || 0,
    defaultVolume: config.defaultVolume || 100
};

const reader = window.azureTTSReader;

// 3단계 캐싱 전략: 오프라인 → 서버 → 새로 생성
async function getAudioWithCaching(cacheKey, content, notePath) {
    // 1단계: 오프라인 캐시 확인
    const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
    if (offlineAudio) {
        console.log('📱 Using offline cache');
        return offlineAudio;
    }

    // 2단계: 서버 캐시 확인
    const serverCache = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
    if (serverCache) {
        console.log('☁️ Using server cache');
        // 오프라인 캐시에도 저장
        await window.offlineCacheManager.saveAudio(cacheKey, serverCache.audioBlob, notePath);
        return serverCache.audioBlob;
    }

    // 3단계: 새로 생성
    console.log('🔄 Generating new audio...');
    const audioBlob = await generateNewAudio(content);

    // 양쪽 캐시에 저장
    await Promise.all([
        window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath),
        window.serverCacheManager.saveAudioToServer(cacheKey, audioBlob)
    ]);

    return audioBlob;
}

async function generateNewAudio(content) {
    const response = await fetch(reader.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: content,
            voice: reader.defaultVoice,
            rate: reader.defaultRate,
            pitch: reader.defaultPitch,
            volume: reader.defaultVolume
        })
    });

    if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
    }

    return await response.blob();
}

async function playNote(index) {
    if (index < 0 || index >= reader.pages.length) {
        console.log('재생 목록 끝');
        return;
    }

    reader.currentIndex = index;
    reader.isStopped = false;
    reader.isPaused = false;

    const page = reader.pages[index];
    const content = window.serverCacheManager.getNoteContent(page);
    const notePath = page.file.path;
    const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);

    try {
        // 캐싱 전략 사용
        const audioBlob = await getAudioWithCaching(cacheKey, content, notePath);

        // 오디오 재생
        if (reader.currentAudioUrl) {
            URL.revokeObjectURL(reader.currentAudioUrl);
        }

        reader.currentAudioUrl = URL.createObjectURL(audioBlob);

        if (!reader.audioElement) {
            reader.audioElement = new Audio();
            reader.audioElement.addEventListener('ended', () => {
                if (!reader.isStopped) {
                    playNote(reader.currentIndex + 1);
                }
            });

            // 재생 위치 저장
            reader.audioElement.addEventListener('timeupdate', () => {
                window.playbackPositionManager.savePosition(
                    notePath,
                    index,
                    reader.audioElement.currentTime
                );
            });
        }

        reader.audioElement.src = reader.currentAudioUrl;
        await reader.audioElement.play();

        console.log(`▶️ Playing: ${page.file.name}`);
    } catch (error) {
        console.error('재생 오류:', error);
        dv.paragraph(`❌ 오류: ${error.message}`);
    }
}

function pauseAudio() {
    if (reader.audioElement && !reader.audioElement.paused) {
        reader.audioElement.pause();
        reader.isPaused = true;
        console.log('⏸️ 일시정지');
    }
}

function resumeAudio() {
    if (reader.audioElement && reader.isPaused) {
        reader.audioElement.play();
        reader.isPaused = false;
        console.log('▶️ 재개');
    }
}

function stopAudio() {
    if (reader.audioElement) {
        reader.audioElement.pause();
        reader.audioElement.currentTime = 0;
        reader.isStopped = true;
        reader.isPaused = false;
        console.log('⏹️ 정지');
    }
}

// 페이지 로드
const NOTES_PATH = config.notesPath || '';
const query = NOTES_PATH
    ? `"${NOTES_PATH}" and -#검색제외`
    : '-#검색제외';

reader.pages = dv.pages(query)
    .sort(b => [b.file.folder, b.file.name], 'asc')
    .array();

console.log(`📚 Loaded ${reader.pages.length} notes`);

// UI 렌더링
dv.paragraph(`**총 ${reader.pages.length}개 노트**`);

dv.paragraph(`
<button onclick="playNote(0)" style="padding: 10px 20px; font-size: 16px; margin: 5px;">▶️ 재생</button>
<button onclick="pauseAudio()" style="padding: 10px 20px; font-size: 16px; margin: 5px;">⏸️ 일시정지</button>
<button onclick="resumeAudio()" style="padding: 10px 20px; font-size: 16px; margin: 5px;">▶️ 재개</button>
<button onclick="stopAudio()" style="padding: 10px 20px; font-size: 16px; margin: 5px;">⏹️ 정지</button>
<button onclick="playNote(window.azureTTSReader.currentIndex - 1)" style="padding: 10px 20px; font-size: 16px; margin: 5px;">⏮️ 이전</button>
<button onclick="playNote(window.azureTTSReader.currentIndex + 1)" style="padding: 10px 20px; font-size: 16px; margin: 5px;">⏭️ 다음</button>
`);

// 노트 목록
dv.table(
    ["번호", "제목", "정의"],
    reader.pages.map((p, idx) => [
        idx + 1,
        `[[${p.file.name}]]`,
        p.정의 || ''
    ])
);

// 캐시 통계
const serverStats = window.serverCacheManager.stats;
dv.paragraph(`
**서버 캐시 통계**:
- 총 요청: ${serverStats.totalRequests}
- 캐시 적중: ${serverStats.cacheHits}
- 캐시 미스: ${serverStats.cacheMisses}
- 적중률: ${window.serverCacheManager.getHitRate()}%
`);

console.log('✅ TTS Reader initialized');
```

---

## 📊 캐시 통계 보기

오프라인 캐시 상태를 확인하려면:

\`\`\`js
window.offlineCacheManager.getCacheStats().then(stats => {
    console.log('Offline cache:', stats);
    console.log('Total size:', (stats.totalSize / 1024 / 1024).toFixed(2), 'MB');
});
\`\`\`

## 🔧 문제 해결

### 설정이 로드되지 않는 경우
1. `obsidian-tts-config.md` 파일이 vault 루트에 있는지 확인
2. Dataview 플러그인이 활성화되어 있는지 확인
3. Obsidian 재시작

### 음성이 재생되지 않는 경우
1. 브라우저 개발자 도구(F12) → Console 확인
2. Azure Function URL이 올바른지 확인
3. 네트워크 연결 확인
