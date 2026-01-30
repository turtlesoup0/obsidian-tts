---
해시태그: "#검색제외"
---

> **📌 버전**: v4.0 (Enhanced)
> **수정일**: 2026-01-22
> **새로운 기능**:
> - ☁️ Azure Blob Storage 기반 디바이스 간 캐시 공유
> - 🔄 마지막 재생 위치 자동 재개
> - 🎯 볼드 텍스트(**강조**)에 악센트 적용
> - 🔒 보안 강화 (API 엔드포인트 설정 분리)

```dataviewjs
// ============================================
// ☁️ Server-Side Cache Manager (Azure Blob Storage)
// ============================================

window.serverCacheManager = {
    // 백엔드 Cache API 엔드포인트 (사용자가 설정해야 함)
    cacheApiEndpoint: 'YOUR_AZURE_FUNCTION_URL/api/cache',

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
// 🎵 Azure TTS Reader with Enhanced Features
// ============================================

// 백엔드 TTS API 엔드포인트 (사용자가 설정해야 함)
const API_ENDPOINT = 'YOUR_AZURE_FUNCTION_URL/api/tts-stream';

// API 엔드포인트 유효성 검사
if (!API_ENDPOINT || API_ENDPOINT === 'YOUR_AZURE_FUNCTION_URL/api/tts-stream') {
    dv.paragraph("⚠️ **설정 필요**: 위의 API_ENDPOINT 변수에 Azure Functions URL을 입력하세요.");
    dv.paragraph("배포 후 URL 예시: `https://your-app.azurewebsites.net/api/tts-stream`");
} else {
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

    // 출제예상 노트 검색 (사용자의 노트 경로에 맞게 수정)
    window.azureTTSReader.pages = dv.pages('"YOUR_NOTE_PATH" and -#검색제외 and #출제예상')
        .sort(b => [b.file.folder, b.file.name], 'asc')
        .array();

    // 오디오 엘리먼트 생성
    if (!window.azureTTSReader.audioElement) {
        window.azureTTSReader.audioElement = new Audio();
        window.azureTTSReader.audioElement.preload = 'auto';
    }

    // 텍스트 정제 함수
    window.cleanTextForTTS = function(text) {
        if (!text) return "";

        let cleaned = String(text);

        // 백엔드에서 **bold**를 처리하므로 프론트엔드에서는 그대로 유지
        // 볼드를 제거하지 않고 API로 전달

        // 코드 블록 제거
        cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/`[^`]+`/g, '');

        // 이미지 제거
        cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

        // 링크는 텍스트만 남기기
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

        // 이탤릭만 제거 (볼드는 백엔드에서 처리)
        cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');  // single * (italic)
        cleaned = cleaned.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');      // single _ (italic)

        // 백슬래시 제거
        cleaned = cleaned.replace(/\\/g, '');

        // 헤더 마커 제거
        cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

        // 인용 마커 제거
        cleaned = cleaned.replace(/^>\s+/gm, '');

        // 리스트 마커 제거
        cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
        cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');

        // 해시태그 제거
        cleaned = cleaned.replace(/#[\w가-힣]+/g, '');

        // 공백 정규화
        cleaned = cleaned.replace(/\s+/g, ' ');

        return cleaned.trim();
    };

    // Azure TTS API 호출 함수
    window.callAzureTTS = async function(text, rate = 1.0) {
        const reader = window.azureTTSReader;

        try {
            const response = await fetch(reader.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice: 'ko-KR-SunHiNeural',
                    rate: rate
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API 오류 (${response.status}): ${errorData.error || response.statusText}`);
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
            throw error;
        }
    };

    // 서버 캐싱이 적용된 재생 함수
    window.speakNoteWithServerCache = async function(index) {
        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (index >= reader.pages.length || reader.isStopped) {
            const progressDiv = document.getElementById('tts-progress-azure');
            if (progressDiv) {
                progressDiv.innerHTML = '<div style="padding: 15px; background: #c8e6c9; border-left: 4px solid #4CAF50;">✅ 모든 노트 읽기 완료!</div>';
            }
            reader.isLoading = false;
            reader.lastPlayedIndex = -1;
            localStorage.setItem('azureTTS_lastIndex', '-1');
            return;
        }

        const page = reader.pages[index];
        reader.currentIndex = index;
        reader.lastPlayedIndex = index;

        // 마지막 재생 위치 저장
        localStorage.setItem('azureTTS_lastIndex', index.toString());

        const progressDiv = document.getElementById('tts-progress-azure');
        if (progressDiv) {
            progressDiv.innerHTML = `
                <div style="padding: 15px; background: #fff3e0; border-left: 4px solid #FF9800; margin: 10px 0;">
                    <strong>🔄 [${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                    <br><small style="color: #666;">캐시 확인 중...</small>
                </div>
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

            // 서버 캐시 확인
            const cached = await cacheManager.getCachedAudioFromServer(cacheKey);

            if (cached) {
                audioBlob = cached.audioBlob;
                fromCache = true;
                console.log(`💾 Using cached audio (${cached.size} bytes)`);
            } else {
                console.log(`🌐 Azure TTS API 호출 시작`);

                // 텍스트 구성
                let textToSpeak = `주제: ${page.file.name}. `;

                if (page.정의) {
                    const cleanDef = window.cleanTextForTTS(page.정의);
                    textToSpeak += `정의: ${cleanDef}. `;
                }

                if (page.키워드) {
                    let cleanKw = window.cleanTextForTTS(page.키워드);
                    if (cleanKw.length > 500) {
                        cleanKw = cleanKw.substring(0, 500) + " 외 다수";
                    }
                    textToSpeak += `키워드: ${cleanKw}`;
                }

                audioBlob = await window.callAzureTTS(textToSpeak, reader.playbackRate);
                console.log(`✅ TTS 생성 완료: ${audioBlob.size} bytes, ${textToSpeak.length} chars`);

                // 서버에 캐시 저장
                await cacheManager.saveAudioToServer(cacheKey, audioBlob);

                fromCache = false;
            }

            // 캐시 통계 업데이트
            window.updateCacheStatsDisplay();

            const audioUrl = URL.createObjectURL(audioBlob);
            reader.audioElement.src = audioUrl;
            reader.audioElement.playbackRate = 1.0;

            // 재생 완료 시 다음 노트로
            reader.audioElement.onended = function() {
                URL.revokeObjectURL(audioUrl);
                if (!reader.isStopped && !reader.isPaused) {
                    setTimeout(() => window.speakNoteWithServerCache(index + 1), 500);
                } else {
                    reader.isLoading = false;
                }
            };

            reader.audioElement.onerror = function(e) {
                console.error('오디오 재생 오류:', e);
                if (progressDiv) {
                    progressDiv.innerHTML = `<div style="padding: 15px; background: #ffebee; border-left: 4px solid #f44336;">❌ 오디오 재생 오류</div>`;
                }
                reader.isLoading = false;
            };

            await reader.audioElement.play();
            reader.isLoading = false;

            // 재생 중 상태 표시
            if (progressDiv) {
                const cacheIcon = fromCache ? '💾' : '🌐';
                const cacheText = fromCache ? '(서버 캐시 ⚡)' : '(새로 생성)';
                progressDiv.innerHTML = `
                    <div style="padding: 15px; background: #e3f2fd; border-left: 4px solid #2196F3; margin: 10px 0;">
                        <strong>${cacheIcon} [${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                        <br><small style="color: #666;">재생 중... ${cacheText}</small>
                    </div>
                `;
            }

        } catch (error) {
            console.error('TTS 오류:', error);
            if (progressDiv) {
                progressDiv.innerHTML = `
                    <div style="padding: 15px; background: #ffebee; border-left: 4px solid #f44336;">
                        ❌ TTS 오류: ${error.message}
                        <br><small style="color: #666;">서버 연결 및 설정을 확인하세요.</small>
                    </div>
                `;
            }
            reader.isLoading = false;
        }
    };

    // 버튼 컨트롤 함수들
    window.azureTTSPlay = async function() {
        const reader = window.azureTTSReader;

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

        // 마지막 재생 위치 복원 (다음 노트부터)
        const savedIndex = localStorage.getItem('azureTTS_lastIndex');
        if (savedIndex && parseInt(savedIndex) >= 0) {
            const lastIndex = parseInt(savedIndex);
            const nextIndex = lastIndex + 1;

            if (nextIndex < reader.pages.length) {
                console.log(`🔄 마지막 재생 위치 ${lastIndex + 1}번 다음부터 재개 (${nextIndex + 1}번)`);
                reader.currentIndex = nextIndex;
            } else {
                console.log(`✅ 모든 노트 재생 완료됨, 처음부터 재시작`);
                reader.currentIndex = 0;
            }
        }

        window.speakNoteWithServerCache(reader.currentIndex);
    };

    window.azureTTSPause = function() {
        const reader = window.azureTTSReader;
        if (reader.audioElement.src && !reader.audioElement.paused) {
            reader.audioElement.pause();
            reader.isPaused = true;
            console.log('⏸️ 일시정지');
        }
    };

    window.azureTTSStop = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        reader.isStopped = true;
        reader.isPaused = false;
        const progressDiv = document.getElementById('tts-progress-azure');
        if (progressDiv) {
            progressDiv.innerHTML = '<div style="padding: 10px; color: #666;">⏹️ 정지됨</div>';
        }
        console.log('⏹️ 재생 중지');
    };

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        window.speakNoteWithServerCache(reader.currentIndex + 1);
    };

    window.azureTTSSetRate = function(rate) {
        const reader = window.azureTTSReader;
        reader.playbackRate = parseFloat(rate);
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

    // 캐시 통계 UI 업데이트 (서버 통계 포함)
    window.updateCacheStatsDisplay = async function() {
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
        if (serverStats) {
            if (cachedCountEl) {
                cachedCountEl.innerHTML = `${stats.totalRequests} <small style="color: #999;">(서버: ${serverStats.totalFiles}개 파일, ${serverStats.totalSizeMB}MB)</small>`;
            }
        }
    };

    // 백엔드에서 사용량 조회
    window.fetchUsageFromBackend = async function() {
        const reader = window.azureTTSReader;
        try {
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

        let totalChars, freeLimit, percentage, remaining, lastUpdated;

        if (backendData) {
            totalChars = backendData.totalChars;
            freeLimit = backendData.freeLimit;
            percentage = parseFloat(backendData.percentage);
            remaining = backendData.remaining;
            lastUpdated = new Date(backendData.lastUpdated).toLocaleString('ko-KR');
        } else {
            totalChars = reader.totalCharsUsed;
            freeLimit = 500000;
            percentage = ((totalChars / freeLimit) * 100).toFixed(1);
            remaining = Math.max(0, freeLimit - totalChars);
            lastUpdated = '로컬 카운터';
        }

        let color = '#4CAF50';
        if (percentage > 80) color = '#FF9800';
        if (percentage > 100) color = '#F44336';

        usageDiv.innerHTML = `
            <div style="padding: 10px; background: #f5f5f5; border-radius: 5px; font-size: 14px;">
                <strong>📊 API 사용량 (이번 달)</strong>
                ${backendData ? '<span style="color: #4CAF50; font-size: 11px;">✓ 서버 동기화</span>' : '<span style="color: #FF9800; font-size: 11px;">⚠ 로컬 추정</span>'}
                <br>
                <div style="margin-top: 5px;">
                    <span style="color: ${color}; font-weight: bold;">${totalChars.toLocaleString()}자</span> / ${freeLimit.toLocaleString()}자
                    <span style="color: #666;">(${percentage}%)</span>
                </div>
                <div style="margin-top: 3px; font-size: 12px; color: #666;">
                    남은 무료 사용량: ${remaining.toLocaleString()}자
                </div>
                <div style="margin-top: 3px; font-size: 11px; color: #999;">
                    마지막 업데이트: ${lastUpdated}
                </div>
            </div>
        `;
    };

    // 로컬스토리지에서 사용량 복원
    const savedChars = localStorage.getItem('azureTTS_totalChars');
    if (savedChars && !isNaN(savedChars)) {
        window.azureTTSReader.totalCharsUsed = parseInt(savedChars, 10);
    }

    // 로컬스토리지에서 마지막 재생 위치 복원
    const savedIndex = localStorage.getItem('azureTTS_lastIndex');
    if (savedIndex && !isNaN(savedIndex)) {
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

    // 컨트롤 UI 생성
    const controlsDiv = dv.container.createEl('div', {
        attr: {
            style: 'margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
        }
    });

    const titleDiv = controlsDiv.createEl('div', {
        text: '🎵 Azure TTS 고품질 재생 (v4.0 Enhanced)',
        attr: {
            style: 'color: white; font-size: 18px; font-weight: bold; margin-bottom: 15px;'
        }
    });

    const btnStyle = 'margin: 5px; padding: 12px 24px; font-size: 16px; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; transition: all 0.3s;';

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
            style: 'margin-top: 15px;'
        }
    });

    window.updateUsageDisplay();

    // 진행 상황 표시
    const progressDiv = dv.container.createEl('div', {
        attr: {
            id: 'tts-progress-azure',
            style: 'margin-top: 10px; min-height: 50px; padding: 10px; color: #666; border-radius: 8px;'
        }
    });

    // 초기 캐시 통계 표시
    window.updateCacheStatsDisplay();
    console.log('📊 Initial cache stats loaded:', window.serverCacheManager.stats);

    // 마지막 재생 위치 표시
    if (window.azureTTSReader.lastPlayedIndex >= 0) {
        const lastNote = window.azureTTSReader.pages[window.azureTTSReader.lastPlayedIndex];
        if (lastNote) {
            progressDiv.innerHTML = `
                <div style="padding: 10px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 5px;">
                    💾 마지막 재생: <strong>${window.azureTTSReader.lastPlayedIndex + 1}번</strong> - ${lastNote.file.name}
                    <br><small style="color: #666;">다음 재생 시 ${window.azureTTSReader.lastPlayedIndex + 2}번부터 시작됩니다</small>
                </div>
            `;
        }
    } else {
        progressDiv.textContent = '준비됨 - "재생 시작" 버튼을 클릭하거나 아래 토픽의 ▶️ 버튼을 클릭하세요';
    }

    // 노트 목록 표시
    dv.header(3, `📚 총 ${window.azureTTSReader.pages.length}개의 출제예상 노트`);

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
- `**강조할 텍스트**` → SSML prosody 태그로 변환
- Azure Neural Voice의 자연스러운 강조 표현
- 중요한 키워드 강조 가능

### ✨ 4. 보안 강화 (리팩토링 완료)
- CORS 환경 변수 기반 설정
- 입력 검증 강화
- Race condition 해결
- 에러 메시지 정보 누출 방지

---

## 📝 사용 방법

### 1단계: Azure Function URL 설정

이 템플릿에서 다음 2곳을 수정하세요:

1. **cacheApiEndpoint** (라인 20):
```javascript
cacheApiEndpoint: 'YOUR_AZURE_FUNCTION_URL/api/cache',
```

2. **API_ENDPOINT** (라인 186):
```javascript
const API_ENDPOINT = 'YOUR_AZURE_FUNCTION_URL/api/tts-stream';
```

예시:
```javascript
cacheApiEndpoint: 'https://your-app.azurewebsites.net/api/cache',
const API_ENDPOINT = 'https://your-app.azurewebsites.net/api/tts-stream';
```

### 2단계: 노트 경로 수정 (라인 208)

```javascript
window.azureTTSReader.pages = dv.pages('"YOUR_NOTE_PATH" and -#검색제외 and #출제예상')
```

예시:
```javascript
window.azureTTSReader.pages = dv.pages('"1_Project/정보 관리 기술사" and -#검색제외 and #출제예상')
```

### 3단계: 백엔드 환경 변수 설정

Azure Portal → Function App → Configuration에서 설정:

```
AZURE_SPEECH_KEY=your-key-here
AZURE_SPEECH_REGION=koreacentral
AZURE_STORAGE_CONNECTION_STRING=your-connection-string
ALLOWED_ORIGINS=app://obsidian.md
```

### 4단계: 재생 테스트

1. "재생 시작" 클릭
2. 콘솔(F12)에서 캐시 동작 확인
3. 다른 디바이스에서 동일한 노트 재생 → 캐시 히트!

---

## 🔒 보안 참고사항

이 템플릿에서는 다음 정보가 **제거**되었습니다:
- ✅ Azure Function URL (사용자가 직접 입력 필요)
- ✅ Azure Speech API Key (백엔드 환경 변수에만 존재)
- ✅ Storage Connection String (백엔드 환경 변수에만 존재)
- ✅ 개인 노트 경로 (사용자가 직접 수정 필요)

공개 저장소에 올리기 안전한 코드입니다.

---

**버전**: 4.0.0
**최종 업데이트**: 2026-01-22
**보안**: ✅ 템플릿 버전 (민감 정보 제거 완료)
