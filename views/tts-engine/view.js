// ============================================
// tts-engine: TTS 재생 엔진
// callAzureTTS + speakNoteWithServerCache + 재생 컨트롤
// 의존성: tts-core, tts-config, tts-text, tts-cache, tts-position
// input: { pages } - dv.pages() 결과
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.azureTTSReader) {

    // fetchWithTimeout는 tts-core/common/fetch-helpers.js에서 로드됨
    // 인라인 fallback 제거됨 (ST1 중복 통합)

    // Load modules (app.vault.read 사용 - Obsidian app:// 프로토콜에서 <script src> 불가)
    (async () => {
        const loadVaultModule = async (path) => {
            try {
                const file = app.vault.getAbstractFileByPath(path);
                if (file) {
                    const content = await app.vault.read(file);
                    new Function(content)();
                } else {
                    console.warn(`⚠️ [tts-engine] 모듈 파일 없음 (무시): ${path}`);
                }
            } catch(e) {
                console.warn(`⚠️ [tts-engine] 모듈 로드 실패 (무시): ${path}`, e.message);
            }
        };

        await loadVaultModule('views/common/fetch-helpers.js');
        await loadVaultModule('views/tts-engine/modules/audio-state-machine.js');
        await loadVaultModule('views/tts-engine/modules/audio-cache-resolver.js');
        window.ttsLog?.('✅ [tts-engine] 모듈 로드 시도 완료');

        // 모듈 로드 성공/실패와 무관하게 항상 초기화
        initializeTTSReader();
    })();

    // Initialization function (called after modules load)
    function initializeTTSReader() {

    // azureTTSReader 전역 객체 초기화
    window.azureTTSReader = {
        apiEndpoint: window.ACTIVE_TTS_ENDPOINT,
        pages: [],
        currentIndex: 0,
        isPaused: false,
        isPlaying: false,  // 🔥 추가: 실제 재생 상태 추적
        isStopped: false,
        audioElement: null,
        playbackRate: 1.0,
        isLoading: false,
        totalCharsUsed: 0,
        lastPlayedIndex: -1,
        _lastBlobInfo: null,
        _wasPlayingBeforeInterruption: false,
        _lastInterruptionTime: 0,
        _currentAudioBlob: null,
        _currentAudioUrl: null,
        _watchdogTimerId: null,
        _watchdogDetectedAt: 0,
        _prefetchedNext: null
    };

    // 오디오 엘리먼트 생성 (iOS 백그라운드 재생 지원)
    window.azureTTSReader.audioElement = new Audio();
    window.azureTTSReader.audioElement.preload = 'auto';
    window.azureTTSReader.audioElement.setAttribute('playsinline', '');
    window.azureTTSReader.audioElement.setAttribute('webkit-playsinline', '');
    window.ttsLog('🎵 오디오 엘리먼트 생성 완료 (iOS 백그라운드 재생 지원)');

    // ============================================
    // 오디오 상태 머신 클래스는 modules/audio-state-machine.js로 추출됨
    // AudioPlaybackStateMachine, AudioInterruptDetector,
    // AudioRecoveryStrategy, AudioPlaybackWatchdog
    // ============================================

    // 상태 머신 및 감지기 초기화 (모듈에서 로드된 window.* 클래스 사용)
    window.audioStateMachine = new window.AudioPlaybackStateMachine();
    window.audioInterruptDetector = new window.AudioInterruptDetector(
        window.azureTTSReader.audioElement,
        window.audioStateMachine
    );
    window.audioRecoveryStrategy = new window.AudioRecoveryStrategy(
        window.azureTTSReader.audioElement,
        window.audioStateMachine
    );
    window.audioWatchdog = new window.AudioPlaybackWatchdog(
        window.azureTTSReader.audioElement,
        window.audioStateMachine
    );

    // 인터럽트 감지 리스너 설정
    window.audioInterruptDetector.setupListeners();

    // Watchdog 시작
    window.audioWatchdog.start();

    // 복구 요청 이벤트 리스너 (정지 상태에서는 복구 시도 안 함)
    document.addEventListener('audioRecoveryRequested', async (event) => {
        const reader = window.azureTTSReader;
        if (reader?.isStopped || reader?.isPaused) return;
        const { attempt } = event.detail;
        try {
            await window.audioRecoveryStrategy.attemptRecovery({ attempt });
        } catch (error) {
            console.error('[Recovery] Recovery attempt failed:', error);
        }
    });

    window.ttsLog('✅ 오디오 인터럽트 감지 및 복구 시스템 초기화 완료');

    // ============================================
    // 화면 잠금 시 TTS 재생 유지 방어 코드
    // ============================================
    (function() {
        const reader = window.azureTTSReader;
        const audio = reader.audioElement;
        const dbg = () => window.TTS_DEBUG;

        // --- 1. pause/play 이벤트 리스너 (addEventListener으로 덮어쓰기 방지) ---
        audio.addEventListener('pause', function() {
            // 🔥 중요: pause 이벤트 발생 시 isPlaying 플래그 업데이트
            reader.isPlaying = false;

            if (reader.isPaused || reader.isStopped) {
                // 사용자가 직접 일시정지하거나 정지한 경우
                reader._wasPlayingBeforeInterruption = false;
                return;
            }
            // OS가 강제로 정지한 경우 (화면 잠금, 다른 앱 소리 등)
            reader._wasPlayingBeforeInterruption = true;
            reader._lastInterruptionTime = Date.now();
            if (dbg()) console.log('[TTS-Guard] OS-forced pause detected at', new Date().toLocaleTimeString());
        });

        audio.addEventListener('play', function() {
            // 🔥 중요: play 이벤트 발생 시 isPlaying 플래그 업데이트
            reader.isPlaying = true;
            reader._wasPlayingBeforeInterruption = false;
            reader._watchdogDetectedAt = 0;

            // R4: 상태 머신 통합
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PLAYING', {
                    source: 'audio_event'
                });
            }

            if (dbg()) console.log('[TTS-Guard] play event - flags reset');
        });

        // --- 2. visibilitychange 감지 + 자동 재개 ---
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState !== 'visible') return;
            if (!reader._wasPlayingBeforeInterruption) return;
            if (reader.isPaused || reader.isStopped) return;

            if (dbg()) console.log('[TTS-Guard] Screen returned, attempting resume...');

            setTimeout(async function() {
                // 재진입 방지: 이미 재생 중이면 스킵
                if (!audio.paused) {
                    reader._wasPlayingBeforeInterruption = false;
                    return;
                }
                if (reader.isPaused || reader.isStopped) return;

                // Fast path: readyState가 충분하면 직접 play()
                if (audio.readyState >= 2) {
                    try {
                        await audio.play();
                        reader._wasPlayingBeforeInterruption = false;
                        if (dbg()) console.log('[TTS-Guard] Fast resume succeeded');
                        return;
                    } catch (e) {
                        if (dbg()) console.warn('[TTS-Guard] Fast resume failed:', e.message);
                    }
                }

                // Recovery path: Blob URL 무효화 시 _currentAudioBlob에서 URL 재생성
                if (reader._currentAudioBlob) {
                    try {
                        const newUrl = URL.createObjectURL(reader._currentAudioBlob);
                        audio.src = newUrl;
                        audio.playbackRate = reader.playbackRate;
                        reader._currentAudioUrl = newUrl;
                        await audio.play();
                        reader._wasPlayingBeforeInterruption = false;
                        if (dbg()) console.log('[TTS-Guard] Blob recovery resume succeeded');
                        return;
                    } catch (e) {
                        if (dbg()) console.warn('[TTS-Guard] Blob recovery failed:', e.message);
                    }
                }

                // Last resort: 캐시에서 재로드
                try {
                    reader._wasPlayingBeforeInterruption = false;
                    await window.speakNoteWithServerCache(reader.currentIndex);
                    if (dbg()) console.log('[TTS-Guard] Full reload resume succeeded');
                } catch (e) {
                    console.error('[TTS-Guard] All resume attempts failed:', e);
                }
            }, 500);
        });

        // Heartbeat Watchdog는 AudioPlaybackWatchdog 클래스에 통합 (중복 제거)
        // AudioPlaybackWatchdog가 10초 간격, 5초 유예, blob 복구를 모두 담당

        window.ttsLog('🛡️ [TTS-Guard] 화면 잠금 방어 코드 활성화');
    })();

    // localStorage에서 사용량 복원
    const savedChars = localStorage.getItem('azureTTS_totalChars');
    if (savedChars && !isNaN(savedChars)) {
        window.azureTTSReader.totalCharsUsed = parseInt(savedChars, 10);
    }

    // ============================================
    // Azure TTS API 호출 함수 (모드 기반)
    // ============================================
    window.callAzureTTS = async function(text) {
        const reader = window.azureTTSReader;

        // 로컬/하이브리드 모드에서 로컬 Edge TTS 사용
        if (window.ttsEndpointConfig?.useLocalEdgeTts) {
            window.ttsLog(`🏠 로컬 Edge TTS 사용 - Azure API 호출 스킵`);
            // 로컬 Edge TTS 호출은 이미 설정된 엔드포인트로 자동 처리됨
        }

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // 유료 API 사용 시에만 헤더로 API 키 전달
            if (window.apiKeyConfig.usePaidApi) {
                if (window.apiKeyConfig.paidKey) {
                    headers['X-Azure-Speech-Key'] = window.apiKeyConfig.paidKey;
                    window.ttsLog('💳 유료 API 키 사용 (S0)');
                } else {
                    console.warn('⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다.');
                }
            } else {
                window.ttsLog('🆓 무료 API 사용 (F0 - 백엔드 환경 변수)');
            }

            const response = await window.fetchWithTimeout(reader.apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: text,
                    voice: 'ko-KR-SunHiNeural',
                    rate: 1.0,
                    usePaidApi: window.apiKeyConfig.usePaidApi
                })
            }, 30000);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('🔴 TTS API 에러 응답:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData.error,
                    details: errorData.details,
                    quotaExceeded: errorData.quotaExceeded
                });

                let errorMsg = `API 오류 (${response.status})`;
                if (errorData.error) errorMsg += `: ${errorData.error}`;
                if (errorData.details) errorMsg += ` - ${errorData.details}`;

                throw new Error(errorMsg);
            }

            const responseContentType = response.headers.get('Content-Type') || '(없음)';
            const audioBlob = await response.blob();

            // 로컬 Edge TTS가 아닐 때만 사용량 증가 (Azure API 사용 시만)
            if (!window.ttsEndpointConfig?.useLocalEdgeTts) {
                const actualCharsUsed = parseInt(response.headers.get('X-TTS-Chars-Used') || text.length, 10);
                reader.totalCharsUsed += actualCharsUsed;
                localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());
                window.ttsLog(`💰 사용량 증가: ${actualCharsUsed} chars (총 ${reader.totalCharsUsed} chars)`);
            } else {
                window.ttsLog(`🆓 로컬 Edge TTS 사용 - 사용량 미증가`);
            }

            if (audioBlob.size === 0) {
                throw new Error('빈 오디오 응답: 서버가 오디오 데이터를 반환하지 않았습니다.');
            }

            if (responseContentType.includes('text/html') || responseContentType.includes('text/plain') || responseContentType.includes('application/json')) {
                // 🔑 clone() 안전 호출
                const htmlPreview = typeof audioBlob.clone === 'function'
                    ? await audioBlob.clone().text().catch(() => '(읽기 실패)')
                    : '(clone 미지원)';
                throw new Error(`TTS 서버가 오디오 대신 ${responseContentType} 반환 (${audioBlob.size}bytes)\n응답 내용: ${htmlPreview.substring(0, 300)}`);
            }

            if (window.updateUsageDisplay) {
                window.updateUsageDisplay();
            }

            return audioBlob;

        } catch (error) {
            console.error('Azure TTS API 호출 실패:', error);
            if (error.message.includes('500')) {
                const apiMode = window.apiKeyConfig.usePaidApi ? '유료' : '무료';
                throw new Error(`${apiMode} API 오류 (할당량 초과 가능성): ${error.message}`);
            }
            throw error;
        }
    };

    // ============================================
    // R3: play() 에러 처리 함수
    // ============================================
    function handlePlayError(error, reader, lastPlayedDiv, index) {
        // R3.1: 에러 타입별 분류
        const errorInfo = {
            name: error.name,
            message: error.message,
            timestamp: new Date().toISOString()
        };

        console.error('[PlayError] Play() rejected:', errorInfo);

        // R3.2: NotAllowedError (자동 재생 정책 위반)
        if (error.name === 'NotAllowedError') {
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; margin-top: 8px;">
                        🔇 자동 재생이 차단되었습니다. 화면을 터치하여 재생을 시작해주세요.
                    </div>
                `;
            }
        }
        // R3.3: AbortError 또는 네트워크 관련 에러
        else if (error.name === 'AbortError' || error.message.includes('network')) {
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; margin-top: 8px;">
                        🌐 네트워크 오류가 발생했습니다. 오프라인 캐시에서 복구를 시도합니다...
                    </div>
                `;
            }
        }
        // 기타 에러
        else {
            if (lastPlayedDiv) {
                const page = reader.pages[index];
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(244,67,54,0.2); border-radius: 8px; margin-top: 8px;">
                        ❌ 재생 오류: ${error.message}<br>
                        ${page ? `노트: [${index + 1}/${reader.pages.length}] ${page.file.name}` : ''}
                    </div>
                `;
            }
        }
    }

    // ============================================
    // speakNoteWithServerCache 헬퍼 함수들
    // ============================================

    // 현재 재생 노트 행 강조 (이전 강조 해제 포함)
    function updateNoteHighlight(reader, index) {
        for (let i = 0; i < reader.pages.length; i++) {
            const row = document.getElementById(`note-row-${i}`);
            if (row) {
                row.style.background = '';
                row.style.fontWeight = '';
            }
        }
        const currentRow = document.getElementById(`note-row-${index}`);
        if (currentRow) {
            currentRow.style.background = 'linear-gradient(90deg, rgba(76,175,80,0.2), rgba(76,175,80,0.1))';
            currentRow.style.fontWeight = 'bold';
        }
    }

    // iOS 잠금화면 Media Session API 핸들러 등록
    function setupMediaSession(reader, page, index) {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: page.file.name,
            artist: 'Azure TTS',
            album: `출제예상 (${index + 1}/${reader.pages.length})`,
            artwork: []
        });

        navigator.mediaSession.setActionHandler('play', async () => {
            try {
                if (reader.audioElement && !reader.audioElement.error) {
                    await reader.audioElement.play();
                    reader.isPaused = false;
                } else {
                    await window.speakNoteWithServerCache(reader.currentIndex);
                }
            } catch (error) {
                console.error('❌ Media Session play error:', error);
                try { await window.speakNoteWithServerCache(reader.currentIndex); } catch (e) { console.debug('[MediaSession] fallback play failed:', e.message); }
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            try {
                if (reader.audioElement) {
                    reader.audioElement.pause();
                    reader.isPaused = true;
                }
            } catch (error) {
                console.error('❌ Media Session pause error:', error);
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', async () => {
            try {
                if (index > 0) {
                    await window.speakNoteWithServerCache(index - 1);
                }
            } catch (error) {
                console.error('❌ Media Session previoustrack error:', error);
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', async () => {
            try {
                const nextIdx = index < reader.pages.length - 1 ? index + 1 : 0;
                await window.speakNoteWithServerCache(nextIdx);
            } catch (error) {
                console.error('❌ Media Session nexttrack error:', error);
            }
        });
    }

    // onended + onerror 핸들러 등록
    function setupAudioHandlers(reader, audioUrl, cacheKey, index, page) {
        const lastPlayedDiv = document.getElementById('last-played-info');

        reader.audioElement.onended = async function() {
            URL.revokeObjectURL(audioUrl);
            reader._currentAudioBlob = null;
            reader._currentAudioUrl = null;
            reader._wasPlayingBeforeInterruption = false;

            const currentRow = document.getElementById(`note-row-${index}`);
            if (currentRow) {
                currentRow.style.background = '';
                currentRow.style.fontWeight = '';
            }

            if (!reader.isStopped && !reader.isPaused) {
                window.speakNoteWithServerCache(index + 1);
            } else {
                reader.isLoading = false;
                updateToggleButtonState(false);
            }
        };

        reader.audioElement.onerror = async function(e) {
            console.error('❌ 오디오 재생 오류:', e);
            const errorType = reader.audioElement.error?.code;

            // 네트워크 에러 시 오프라인 캐시로 재시도
            if (errorType === 2 || errorType === 3) {
                console.warn('⚠️ 네트워크 에러 감지, 오프라인 캐시 재시도');
                try {
                    const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
                    if (offlineAudio) {
                        window.ttsLog('✅ 오프라인 캐시에서 복구 성공');
                        if (reader._currentAudioUrl) {
                            URL.revokeObjectURL(reader._currentAudioUrl);
                        }
                        const recoveryUrl = URL.createObjectURL(offlineAudio);
                        reader._currentAudioBlob = offlineAudio;
                        reader._currentAudioUrl = recoveryUrl;
                        reader.audioElement.src = recoveryUrl;
                        await reader.audioElement.play();

                        if (lastPlayedDiv) {
                            lastPlayedDiv.innerHTML = `
                                ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                                <br><small style="opacity: 0.9;">💾 오프라인 캐시 (네트워크 복구)</small>
                            `;
                        }
                        return;
                    }
                } catch (retryError) {
                    console.error('❌ 오프라인 캐시 재시도 실패:', retryError);
                }
            }

            // 에러 표시
            const errorNames = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
            const blobInfo = reader._lastBlobInfo || {};
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div style="text-align:left; font-size:13px; line-height:1.6;">
                    ❌ <strong>오디오 재생 오류</strong>
                    <br>에러 코드: <strong>${errorType || '?'} (${errorNames[errorType] || 'UNKNOWN'})</strong>
                    <br>Blob 크기: <strong>${blobInfo.size ?? '?'} bytes</strong>
                    <br>Blob 타입: <strong>${blobInfo.type ?? '?'}</strong>
                    <br>캐시 소스: ${blobInfo.cacheSource ?? '?'}
                    </div>
                `;
            }

            reader.isLoading = false;
        };
    }

    // 다음 트랙 오디오 미리 가져오기 (비동기, 실패해도 무시)
    async function prefetchNextTrack(reader, cacheManager, index) {
        try {
            const nextIdx = (index + 1 >= reader.pages.length) ? 0 : index + 1;
            const nextPage = reader.pages[nextIdx];
            if (!nextPage) return;

            const nextContent = cacheManager.getNoteContent(nextPage);
            if (!nextContent || nextContent.trim().length === 0) return;

            const nextCacheKey = await cacheManager.generateCacheKey(nextPage.file.path, nextContent);

            let nextBlob = null;
            try {
                nextBlob = await window.offlineCacheManager.getAudio(nextCacheKey);
            } catch (e) { console.debug('[Prefetch] offline cache read failed:', e.message); }

            if (!nextBlob) {
                try {
                    const serverCached = await cacheManager.getCachedAudioFromServer(nextCacheKey);
                    if (serverCached && serverCached.audioBlob) {
                        nextBlob = serverCached.audioBlob;
                        try { await window.offlineCacheManager.saveAudio(nextCacheKey, nextBlob, nextPage.file.path); } catch(e) { console.debug('[Prefetch] offline cache save failed:', e.message); }
                    }
                } catch (e) { console.debug('[Prefetch] server cache read failed:', e.message); }
            }

            if (nextBlob && nextBlob instanceof Blob && nextBlob.size > 1000) {
                reader._prefetchedNext = { index: nextIdx, blob: nextBlob, cacheKey: nextCacheKey };
                window.ttsLog(`⚡ [Prefetch] 다음 트랙 준비 완료: [${nextIdx + 1}] ${nextPage.file.name} (${nextBlob.size} bytes)`);
            }
        } catch (e) {
            // prefetch 실패해도 재생에 영향 없음
        }
    }

    // ============================================
    // 서버 캐싱이 적용된 재생 함수
    // ============================================
    window.speakNoteWithServerCache = async function(index) {
        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        // R4: 상태 머신 LOADING 상태로 전이
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('LOADING', {
                index: index
            });
        }

        // pages 배열 유효성 검증 (함수 시작 부분)
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            reader.isLoading = false;
            return;
        }

        if (reader.isStopped) {
            reader.isLoading = false;
            return;
        }

        // 리스트 끝 → 처음부터 반복 재생
        if (index >= reader.pages.length) {
            window.ttsLog('🔄 리스트 끝 → 처음부터 반복 재생');
            index = 0;
        }

        const page = reader.pages[index];
        reader.currentIndex = index;
        reader.lastPlayedIndex = index;

        updateNoteHighlight(reader, index);

        // R1: localStorage에 즉시 저장 (동기, 빠름)
        localStorage.setItem('azureTTS_lastPlayedIndex', index.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
        localStorage.setItem('azureTTS_lastPlayedTitle', page.file.name);

        // 통합 노트 즉시 알림: CustomEvent로 위치 변경 전파
        window.dispatchEvent(new CustomEvent('tts-position-changed', {
            detail: { index: index, noteTitle: page.file.name, notePath: page.file.path }
        }));

        // NOTE: savePosition(PUT) 은 재생 시작 후로 이동 (iOS 최적화)

        // 재생 컨트롤 영역 업데이트
        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                🔄 캐시 확인 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
            `;
        }

        try {
            // 3단계 캐시 해결 (modules/audio-cache-resolver.js)
            const { audioBlob, fromCache, cacheSource, cacheKey } = await window.resolveAudioCache({
                cacheManager, reader, page, index
            });

            const audioUrl = URL.createObjectURL(audioBlob);
            reader._currentAudioBlob = audioBlob;
            reader._currentAudioUrl = audioUrl;
            reader.audioElement.src = audioUrl;
            reader.audioElement.playbackRate = reader.playbackRate;

            setupMediaSession(reader, page, index);

            setupAudioHandlers(reader, audioUrl, cacheKey, index, page);

            // 종소리 + TTS 연속 재생
            if (window.playTTSWithBellSequential) {
                try {
                    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
                } catch (bellError) {
                    console.warn('⚠️ 종소리 재생 실패, TTS만 재생:', bellError.message);
                    // 이전 Blob URL 해제 후 새 URL 생성
                    if (reader._currentAudioUrl) {
                        URL.revokeObjectURL(reader._currentAudioUrl);
                    }
                    const fallbackUrl = URL.createObjectURL(audioBlob);
                    reader._currentAudioUrl = fallbackUrl;
                    reader.audioElement.src = fallbackUrl;

                    try {
                        await reader.audioElement.play();
                    } catch (playError) {
                        handlePlayError(playError, reader, lastPlayedDiv, index);
                        throw playError;
                    }
                }
            } else {
                try {
                    await reader.audioElement.play();
                } catch (playError) {
                    handlePlayError(playError, reader, lastPlayedDiv, index);
                    throw playError;
                }
            }
            reader.isLoading = false;

            // R3: 토글 버튼 상태 업데이트 (재생 중)
            const toggleBtn = document.getElementById('tts-toggle-play-pause-btn');
            if (toggleBtn) {
                toggleBtn.textContent = '⏸️ 일시정지';
                toggleBtn.style.background = '#FF9800';
            }

            // 재생 중 상태 표시
            if (lastPlayedDiv) {
                const cacheIcon = fromCache ? '💾' : '🎙️';
                lastPlayedDiv.innerHTML = `
                    ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                    <br><small style="opacity: 0.9;">${cacheIcon} ${cacheSource}</small>
                `;
            }

            // R1: 서버에 위치 저장 (재생 시작 후 실행 — iOS에서 오디오 활성 상태일 때 네트워크 접근 안정)
            if (window.playbackPositionManager?.savePosition) {
                window.ttsLog?.(`📤 [tts-engine] savePosition 호출: index=${index}, note="${page.file.name}"`);
                window.playbackPositionManager.savePosition(
                    index,
                    page.file.path,
                    page.file.name
                ).catch(error => {
                    console.warn('⚠️ Failed to save playback position to server:', error);
                });
            }

            // 다음 트랙 미리 가져오기 (비동기, 실패해도 무시)
            prefetchNextTrack(reader, cacheManager, index);

        } catch (error) {
            console.error('❌ TTS 전체 오류:', error);

            if (lastPlayedDiv) {
                const msgParts = error.message.split('\n');
                const mainMsg = msgParts[0];
                const responsePreview = msgParts.length > 1 ? msgParts.slice(1).join('\n') : '';

                lastPlayedDiv.innerHTML = `
                    <div style="text-align:left; font-size:12px; line-height:1.5;">
                    ❌ <strong>TTS 오류</strong>
                    <br>${mainMsg}
                    <br>엔드포인트: <span style="word-break:break-all;">${reader.apiEndpoint || '?'}</span>
                    ${responsePreview ? `<br><br><strong>서버 응답:</strong><br><pre style="white-space:pre-wrap; word-break:break-all; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; font-size:11px;">${responsePreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : ''}
                    </div>
                `;
            }

            reader.isLoading = false;
        }
    };

    // ============================================
    // 버튼 컨트롤 함수들
    // ============================================
    window.azureTTSPlay = async function() {
        const reader = window.azureTTSReader;

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

                    // R4: 상태 머신 PLAYING 상태로 전이
                    if (window.audioStateMachine) {
                        window.audioStateMachine.transitionTo('PLAYING', {
                            source: 'resume_from_pause'
                        });
                    }

                    window.ttsLog('▶️ 재생 재개');
                    return;
                } catch (error) {
                    console.error('❌ 재생 재개 실패:', error);
                }
            }
            reader.audioElement.src = '';
        }

        reader.isStopped = false;
        reader.isPaused = false;

        // Watchdog 재시작 (Stop에서 중지된 경우)
        if (window.audioWatchdog && !window.audioWatchdog.timerId) {
            window.audioWatchdog.start();
        }

        // 서버와 재생 위치 동기화
        const localIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
        const savedIndex = localIndex ? parseInt(localIndex, 10) : -1;
        const syncedIndex = await window.playbackPositionManager.syncPosition(savedIndex);
        reader.lastPlayedIndex = syncedIndex;

        // R2: 마지막 재생 노트 자동 실행
        if (syncedIndex >= 0 && syncedIndex < reader.pages.length) {
            // 마지막으로 재생한 노트가 있는 경우, 해당 노트부터 재생
            window.ttsLog(`🔄 마지막 재생: ${syncedIndex + 1}번 노트 - 자동 재생합니다`);
            reader.currentIndex = syncedIndex;

            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                const lastNote = reader.pages[syncedIndex];
                lastPlayedDiv.innerHTML = `
                    🔄 마지막 재생 복원: <strong>[${syncedIndex + 1}/${reader.pages.length}]</strong> ${lastNote.file.name}
                    <br><small style="opacity: 0.9;">계속 재생합니다...</small>
                `;
            }
        } else {
            // 마지막 재생 기록이 없으면 처음부터
            window.ttsLog(`🎵 첫 재생: 1번 노트부터 시작`);
            reader.currentIndex = 0;
        }

        if (reader.currentIndex < 0 || reader.currentIndex >= reader.pages.length) {
            reader.currentIndex = 0;
        }

        window.speakNoteWithServerCache(reader.currentIndex);
    };

    window.azureTTSPause = function() {
        const reader = window.azureTTSReader;
        if (reader.audioElement.src && !reader.audioElement.paused) {
            reader.audioElement.pause();
            reader.isPaused = true;
            reader.isPlaying = false;  // 🔥 추가: 일시정지 시 isPlaying 플래그 업데이트

            // R4: 상태 머신 PAUSED 상태로 전이
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PAUSED', {
                    source: 'user_action'
                });
            }

            // R3: 토글 버튼 상태 업데이트
            const toggleBtn = document.getElementById('tts-toggle-play-pause-btn');
            if (toggleBtn) {
                toggleBtn.textContent = '▶️ 재생';
                toggleBtn.style.background = '#4CAF50';
            }

            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                const currentNote = reader.pages[reader.currentIndex];
                lastPlayedDiv.innerHTML = `
                    ⏸️ 일시정지: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${currentNote.file.name}
                `;
            }

            window.ttsLog('⏸️ 일시정지');
        }
    };

    // R3: 통합 재생/일시정지 토글 버튼
    window.azureTTSTogglePlayPause = async function() {
        const reader = window.azureTTSReader;

        // 로딩 중이면 무시
        if (reader.isLoading) {
            console.warn('⚠️ 로딩 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }

        // 일시정지 상태이면 재생 재개
        if (reader.isPaused) {
            if (reader.audioElement.src && reader.audioElement.readyState >= 2) {
                try {
                    await reader.audioElement.play();
                    reader.isPaused = false;

                    // R4: 상태 머신 PLAYING 상태로 전이
                    if (window.audioStateMachine) {
                        window.audioStateMachine.transitionTo('PLAYING', {
                            source: 'toggle_resume'
                        });
                    }

                    window.ttsLog('▶️ 재생 재개');

                    const lastPlayedDiv = document.getElementById('last-played-info');
                    if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                        const currentNote = reader.pages[reader.currentIndex];
                        lastPlayedDiv.innerHTML = `
                            ▶️ 재생 중: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${currentNote.file.name}
                        `;
                    }

                    updateToggleButtonState(true);
                    return;
                } catch (error) {
                    console.error('❌ 재생 재개 실패:', error);
                }
            }
            // 오디오가 없으면 새로 재생
            reader.isPaused = false;
        }

        // 재생 중이면 일시정지
        if (!reader.audioElement.paused && !reader.isStopped) {
            window.azureTTSPause();
            updateToggleButtonState(false);
            return;
        }

        // 정지 상태이면 새로 재생
        await window.azureTTSPlay();
        updateToggleButtonState(true);
    };

    // 토글 버튼 상태 업데이트 함수
    function updateToggleButtonState(isPlaying) {
        const toggleBtn = document.getElementById('tts-toggle-play-pause-btn');
        if (toggleBtn) {
            if (isPlaying) {
                toggleBtn.textContent = '⏸️ 일시정지';
                toggleBtn.style.background = '#FF9800';
            } else {
                toggleBtn.textContent = '▶️ 재생';
                toggleBtn.style.background = '#4CAF50';
            }
        }
    }

    // onended 토글 업데이트는 speakNoteWithServerCache 내 onended 핸들러에 통합 (덮어쓰기 제거)

    window.azureTTSStop = function() {
        const reader = window.azureTTSReader;

        // 🔥 플래그를 pause() 호출 전에 먼저 설정 (pause 이벤트 핸들러 race condition 방지)
        reader.isStopped = true;
        reader.isPaused = false;
        reader.isPlaying = false;
        reader._wasPlayingBeforeInterruption = false;
        reader._prefetchedNext = null;

        reader.audioElement.pause();
        reader.audioElement.src = '';
        reader._currentAudioBlob = null;
        reader._currentAudioUrl = null;

        // Watchdog 중지 (정지 후 자동 재개 방지)
        if (window.audioWatchdog) {
            window.audioWatchdog.stop();
        }

        // R4: 상태 머신 STOPPED 상태로 전이
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('STOPPED', {
                source: 'user_action'
            });
        }

        // R3: 토글 버튼 상태 업데이트
        const toggleBtn = document.getElementById('tts-toggle-play-pause-btn');
        if (toggleBtn) {
            toggleBtn.textContent = '▶️ 재생';
            toggleBtn.style.background = '#4CAF50';
        }

        // R4: 모든 노트 행 강조 해제
        if (reader.pages) {
            for (let i = 0; i < reader.pages.length; i++) {
                const row = document.getElementById(`note-row-${i}`);
                if (row) {
                    row.style.background = '';
                    row.style.fontWeight = '';
                }
            }
        }

        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            if (reader.lastPlayedIndex >= 0 && reader.lastPlayedIndex < reader.pages.length) {
                const lastNote = reader.pages[reader.lastPlayedIndex];
                lastPlayedDiv.innerHTML = `
                    💾 마지막 재생: <strong>[${reader.lastPlayedIndex + 1}/${reader.pages.length}]</strong> ${lastNote.file.name}
                    <br><small style="opacity: 0.9;">다음 재생 시 ${reader.lastPlayedIndex + 1}번부터 시작됩니다</small>
                `;
            } else {
                lastPlayedDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ⏹️ <strong>정지됨</strong> - 위 버튼을 클릭하여 재생하세요
                    </div>
                `;
            }
        }

        window.ttsLog('⏹️ 재생 중지');
    };

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;

        // pages 배열 유효성 검증
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

        reader.audioElement.pause();
        reader.audioElement.src = '';
        window.speakNoteWithServerCache(reader.currentIndex + 1);
    };

    window.azureTTSPrevious = function() {
        const reader = window.azureTTSReader;

        // pages 배열 유효성 검증
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

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

        if (reader.audioElement && reader.audioElement.src) {
            reader.audioElement.playbackRate = reader.playbackRate;
        }

        const rateDisplay = document.getElementById('rate-display');
        if (rateDisplay) {
            rateDisplay.textContent = `${rate}x`;
        }
    };

    window.azureTTSPlayFrom = function(index) {
        const reader = window.azureTTSReader;
        reader.currentIndex = index;
        reader.isStopped = false;
        reader.isPaused = false;
        window.speakNoteWithServerCache(index);
    };

    window.ttsLog('✅ [tts-engine] 모듈 로드 완료');

    // ============================================
    // Cleanup 함수: 메모리 누수 방지
    // ============================================
    window.azureTTSCleanup = function() {
        const reader = window.azureTTSReader;
        if (!reader) return;

        // 새로운 컴포넌트 정리
        if (window.audioWatchdog) {
            window.audioWatchdog.stop();
            window.audioWatchdog = null;
        }

        if (window.audioRecoveryStrategy) {
            window.audioRecoveryStrategy.clearTimeout();
            window.audioRecoveryStrategy = null;
        }

        if (window.audioInterruptDetector) {
            window.audioInterruptDetector.reset();
            window.audioInterruptDetector = null;
        }

        if (window.audioStateMachine) {
            window.audioStateMachine.reset();
            window.audioStateMachine = null;
        }

        // 워치독 타이머 정리
        if (reader._watchdogTimerId) {
            clearInterval(reader._watchdogTimerId);
            reader._watchdogTimerId = null;
        }

        // 오디오 엘리먼트 정리
        if (reader.audioElement) {
            reader.audioElement.pause();
            reader.audioElement.src = '';

            // Blob URL 해제
            if (reader._currentAudioUrl) {
                try {
                    URL.revokeObjectURL(reader._currentAudioUrl);
                } catch (e) {
                    // 무시: 이미 해제됨
                }
                reader._currentAudioUrl = null;
            }
            reader._currentAudioBlob = null;

            // 이벤트 리스너 제거 (cloneNode를 통한 전체 리스너 제거)
            const newAudio = reader.audioElement.cloneNode(true);
            if (reader.audioElement.parentNode) {
                reader.audioElement.parentNode.replaceChild(newAudio, reader.audioElement);
            }
            reader.audioElement = newAudio;
        }

        // 상태 초기화
        reader.isStopped = true;
        reader.isPaused = false;
        reader.isLoading = false;
        reader._wasPlayingBeforeInterruption = false;
        reader._watchdogDetectedAt = 0;

        // pages 배열 초기화 (선택 사항)
        reader.pages = [];
        reader.currentIndex = 0;

        window.ttsLog('✅ TTS 엔진 cleaned up');
    };

    // ============================================
    // 페이지 언로드 시 자동 정리 (Obsidian 뷰 닫힘 감지)
    // ============================================
    const originalOnUnload = window.onbeforeunload;
    window.onbeforeunload = function() {
        if (window.azureTTSCleanup) {
            window.azureTTSCleanup();
        }
        if (originalOnUnload) {
            return originalOnUnload.apply(this, arguments);
        }
    };
    // pages 배열 설정 (비동기 초기화 완료 후 즉시 설정)
    if (input && input.pages) {
        window.azureTTSReader.pages = input.pages;
        window.ttsLog(`📚 [initializeTTSReader] ${input.pages.length}개 페이지 로드`);

        const savedIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
        if (savedIndex && !isNaN(savedIndex)) {
            window.azureTTSReader.currentIndex = parseInt(savedIndex, 10);
            window.azureTTSReader.lastPlayedIndex = parseInt(savedIndex, 10);
            window.ttsLog(`📍 마지막 재생 위치 복원: ${window.azureTTSReader.lastPlayedIndex + 1}번`);
        }
    }

    } // End of initializeTTSReader()
} // End of if (!window.azureTTSReader)

// ============================================
// pages 배열 설정 (input으로 전달받음)
// 비동기 초기화 완료 전에는 azureTTSReader가 없을 수 있음
// ============================================
if (input && input.pages && window.azureTTSReader) {
    window.azureTTSReader.pages = input.pages;
    window.ttsLog(`📚 TTS 엔진에 ${input.pages.length}개 페이지 로드`);

    // 마지막 재생 위치 복원
    const savedIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
    if (savedIndex && !isNaN(savedIndex)) {
        window.azureTTSReader.currentIndex = parseInt(savedIndex, 10);
        window.azureTTSReader.lastPlayedIndex = parseInt(savedIndex, 10);
        window.ttsLog(`📍 마지막 재생 위치 복원: ${window.azureTTSReader.lastPlayedIndex + 1}번`);
    }
}
