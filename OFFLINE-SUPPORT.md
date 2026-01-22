# 오프라인 지원 기능

## 개요

Service Worker와 IndexedDB를 사용하여 이미 들은 노트를 오프라인에서도 재생할 수 있도록 합니다.

## 플랫폼 호환성

- ✅ **macOS**: 완전 지원
- ⚠️ **iOS/iPadOS**: iOS 15.4+ 필요 (Service Worker), 하위 버전은 IndexedDB만 사용
- ✅ **모든 플랫폼**: IndexedDB는 모든 환경에서 작동

## 구현 방법

### 1. IndexedDB 기반 오프라인 캐시 (모든 플랫폼 지원)

프론트엔드 코드에 다음 스크립트를 추가하세요:

\`\`\`javascript
// ============================================
// 💾 오프라인 캐시 매니저 (IndexedDB)
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

                // audio store: 오디오 Blob 저장
                if (!db.objectStoreNames.contains('audio')) {
                    const audioStore = db.createObjectStore('audio', { keyPath: 'cacheKey' });
                    audioStore.createIndex('timestamp', 'timestamp', { unique: false });
                    audioStore.createIndex('notePath', 'notePath', { unique: false });
                }
            };
        });
    },

    async saveAudio(cacheKey, audioBlob, notePath) {
        if (!this.db) await this.init();

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
                console.log(\`💾 Saved to offline cache: \${cacheKey} (\${audioBlob.size} bytes)\`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getAudio(cacheKey) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readonly');
            const store = transaction.objectStore('audio');
            const request = store.get(cacheKey);

            request.onsuccess = () => {
                if (request.result) {
                    console.log(\`📱 Retrieved from offline cache: \${cacheKey}\`);
                    resolve(request.result.audioBlob);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getCacheStats() {
        if (!this.db) await this.init();

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
        if (!this.db) await this.init();

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
                    console.log(\`🗑️ Cleared \${deletedCount} old offline cache entries\`);
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
};

// 앱 시작 시 초기화
window.offlineCacheManager.init().catch(console.error);
\`\`\`

### 2. 기존 TTS Reader와 통합

\`azureTTSReader\` 객체의 \`playAudio\` 함수를 수정하여 오프라인 캐시를 사용하도록 합니다:

\`\`\`javascript
// 기존 playAudio 함수 수정
async playAudio(cacheKey, notePath, content) {
    try {
        // 1. 먼저 오프라인 캐시 확인
        const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
        if (offlineAudio) {
            const audioUrl = URL.createObjectURL(offlineAudio);
            this.audioElement.src = audioUrl;
            this.audioElement.play();
            console.log('🎵 재생 중 (오프라인 캐시)');
            return;
        }

        // 2. 서버 캐시 확인
        const serverAudio = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
        if (serverAudio) {
            // 서버에서 받은 오디오를 오프라인 캐시에 저장
            await window.offlineCacheManager.saveAudio(cacheKey, serverAudio, notePath);

            const audioUrl = URL.createObjectURL(serverAudio);
            this.audioElement.src = audioUrl;
            this.audioElement.play();
            console.log('🎵 재생 중 (서버 캐시 → 오프라인 캐시 저장)');
            return;
        }

        // 3. TTS 생성
        const response = await fetch(\`\${this.apiEndpoint}/api/tts-stream\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: content,
                voice: this.voice,
                rate: this.playbackRate,
                pitch: 0,
                volume: 100
            })
        });

        if (!response.ok) throw new Error(\`TTS failed: \${response.status}\`);

        const audioBlob = await response.blob();

        // 오프라인 캐시에 저장
        await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);

        const audioUrl = URL.createObjectURL(audioBlob);
        this.audioElement.src = audioUrl;
        this.audioElement.play();
        console.log('🎵 재생 중 (새로 생성 → 오프라인 캐시 저장)');

    } catch (error) {
        console.error('재생 오류:', error);
        dv.paragraph(\`❌ 재생 실패: \${error.message}\`);
    }
}
\`\`\`

### 3. 캐시 통계 UI 추가

\`\`\`javascript
// 캐시 통계 버튼 추가
const statsButton = dv.el('button', '📊 캐시 통계');
statsButton.style.cssText = 'margin: 10px 5px; padding: 10px 20px; font-size: 14px;';
statsButton.onclick = async () => {
    const stats = await window.offlineCacheManager.getCacheStats();
    dv.paragraph(\`
📊 **오프라인 캐시 통계**
- 저장된 노트: \${stats.count}개
- 총 용량: \${stats.totalSizeMB} MB
- 네트워크 없이 재생 가능!
    \`);
};

// 캐시 정리 버튼 추가
const clearButton = dv.el('button', '🗑️ 오래된 캐시 정리');
clearButton.style.cssText = 'margin: 10px 5px; padding: 10px 20px; font-size: 14px;';
clearButton.onclick = async () => {
    const deleted = await window.offlineCacheManager.clearOldCache(30);
    dv.paragraph(\`🗑️ \${deleted}개의 오래된 캐시 항목을 삭제했습니다.\`);
};
\`\`\`

## 사용 시나리오

### 시나리오 1: 첫 재생
1. 사용자가 노트 재생
2. 서버에서 TTS 생성
3. **오프라인 캐시에 자동 저장** ✅
4. 오디오 재생

### 시나리오 2: 두 번째 재생 (온라인)
1. 사용자가 같은 노트 재생
2. **오프라인 캐시에서 즉시 로드** ⚡
3. 네트워크 요청 없이 즉시 재생

### 시나리오 3: 오프라인 상태
1. 사용자가 인터넷 연결 없음
2. **오프라인 캐시에서 로드** 📱
3. 이미 들은 노트는 정상 재생!
4. 처음 듣는 노트는 "네트워크 필요" 메시지 표시

## 예상 효과

- ✅ **즉시 재생**: 두 번째 재생부터는 0ms 대기 (네트워크 요청 없음)
- ✅ **오프라인 지원**: 지하철, 비행기에서도 학습 가능
- ✅ **데이터 절약**: 재생 시마다 다운로드하지 않음
- ✅ **배터리 절약**: 네트워크 요청 감소

## 주의사항

- IndexedDB는 브라우저 스토리지를 사용하므로, 공간이 부족하면 자동으로 오래된 캐시가 삭제될 수 있습니다.
- iOS Safari의 경우 Private 모드에서는 IndexedDB가 제한될 수 있습니다.
- 약 100개 노트 기준 평균 30-50MB 정도의 용량을 사용합니다.

## 다음 단계

이 기능을 적용하려면:
1. 위 JavaScript 코드를 Obsidian Dataview 노트에 추가
2. 기존 \`playAudio\` 함수를 수정된 버전으로 교체
3. 캐시 통계 버튼을 UI에 추가

문제가 발생하면 브라우저 개발자 도구 (F12) → Console에서 로그를 확인하세요.
