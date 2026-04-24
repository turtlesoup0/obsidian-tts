// ============================================
// tts-engine: TTS 재생 엔진
// window.ttsPlayer 네임스페이스 (state + play/pause/stop/next/... + synthesize + speakNote)
// 의존성: tts-core, tts-config, tts-text, tts-cache, tts-position
// input: { pages } - dv.pages() 결과
// ============================================

// 가드 패턴: 중복 로드 방지
// Dataview 리렌더링 시 async 모듈 로드 대기 중 재진입 방지를 위해
// 동기 _ttsEngineLoading 플래그로 경쟁 차단
if (!window.ttsPlayer && !window._ttsEngineLoading) {
    window._ttsEngineLoading = true;

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

        await loadVaultModule('3_Resource/obsidian/views/common/fetch-helpers.js');
        await loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/audio-state-machine.js');
        await loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/audio-cache-resolver.js');
        window.ttsLog?.('✅ [tts-engine] 모듈 로드 시도 완료');

        // 모듈 로드 성공/실패와 무관하게 항상 초기화
        initializeTTSPlayer();
    })();

    // Initialization function (called after modules load)
    function initializeTTSPlayer() {
    // 이중 방어: 예기치 않은 재호출 차단 (async 예외 등으로 _ttsEngineLoading만으로 부족할 수 있음)
    if (window.ttsPlayer?.state) {
        window.ttsLog?.('⚠️ [tts-engine] initializeTTSPlayer 재호출 스킵 (이미 초기화됨)');
        return;
    }

    // ttsPlayer 전역 네임스페이스 초기화 (메서드는 아래에서 차례로 추가됨)
    window.ttsPlayer = window.ttsPlayer || {};
    window.ttsPlayer.state = {
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
        _prefetchedNext: null,
        _nextTrackPrepared: false,  // iOS 백그라운드 연속 재생: 다음 트랙 전환 완료 플래그
        _src4RetryIndex: -1,  // SRC_NOT_SUPPORTED 무한루프 방지 트래커 (마지막 재시도 인덱스)
        // ============================================
        // 플레이백 모드 (2026-04-24 추가): 도메인 필터 + 랜덤 재생(Case C: shuffle + no-repeat)
        // ============================================
        originalPages: null,    // input.pages 스냅샷 (필터 해제 시 복구용)
        domainFilter: '',       // '' = 전체, 예: '1_신기술'
        shuffle: false,         // 랜덤 재생 활성 여부
        shuffleOrder: null,     // 현재 pages 길이의 인덱스 permutation (Fisher-Yates)
        shuffleCursor: -1,      // shuffleOrder 상 현재 위치
        shuffleHistory: []      // prev 복원용 방문 이력 스택
    };

    // 오디오 엘리먼트 생성 (iOS 백그라운드 재생 지원)
    window.ttsPlayer.state.audioElement = new Audio();
    window.ttsPlayer.state.audioElement.preload = 'auto';
    window.ttsPlayer.state.audioElement.setAttribute('playsinline', '');
    window.ttsPlayer.state.audioElement.setAttribute('webkit-playsinline', '');
    // iOS 백그라운드 오디오: 무음 루프로 세션 유지 (연속 재생 지원)
    window.ttsPlayer.state.audioElement.loop = false;
    window.ttsPlayer.state.audioElement.crossOrigin = 'anonymous';
    window.ttsLog('🎵 오디오 엘리먼트 생성 완료 (iOS 백그라운드 재생 지원)');

    // ============================================
    // Phase B-5: localStorage 마이그레이션 V2 (최종 — 복사 + 구 키 삭제)
    // 구 키(azureTTS_*) → 신 키(ttsPlayer_*) 복사 후 구 키 제거
    // V1 플래그가 있으면 V1은 스킵하고 삭제만 수행
    // V2 플래그로 1회만 실행 보장
    // ============================================
    (function migrateLocalStorageV2() {
        const flagV2 = 'ttsPlayer_migratedV2';
        if (localStorage.getItem(flagV2)) return;

        const keys = [
            'totalChars', 'lastPlayedIndex', 'lastPlayedTimestamp', 'lastPlayedTitle',
            'lastPlayedNotePath', 'deviceId', 'usePaidApi', 'useLocalEdgeTts'
        ];
        let copiedCount = 0;
        let deletedCount = 0;
        keys.forEach(key => {
            const oldKey = `azureTTS_${key}`;
            const newKey = `ttsPlayer_${key}`;
            const oldVal = localStorage.getItem(oldKey);
            if (oldVal !== null) {
                // 구 키 존재 → 신 키 비어있으면 복사, 그다음 구 키 삭제
                if (localStorage.getItem(newKey) === null) {
                    localStorage.setItem(newKey, oldVal);
                    copiedCount++;
                }
                localStorage.removeItem(oldKey);
                deletedCount++;
            }
        });
        // V1 플래그도 제거 (더 이상 필요 없음)
        localStorage.removeItem('ttsPlayer_migratedV1');
        localStorage.setItem(flagV2, '1');
        window.ttsLog?.(`📦 [localStorage] 마이그레이션 V2 완료: ${copiedCount}개 복사, ${deletedCount}개 구 키 삭제`);
    })();

    // ============================================
    // 오디오 엘리먼트 정리 헬퍼
    // onended/onerror 해제 후 pause — 트랙 전환 시 이전 핸들러의
    // spurious 이벤트(src='' 후 error code 4 등)로 인한 경합 방지
    // ============================================
    function cleanupAudioElement(el) {
        if (!el) return;
        el.onended = null;
        el.onerror = null;
        if (!el.paused) el.pause();
    }

    // ============================================
    // Blob URL 안전 관리 헬퍼
    // _currentAudioUrl을 변경할 때 이전 URL을 자동 revoke하여 누수 방지
    // 주의: 활성 재생 중인 URL에 호출하면 안 됨 (audio.src가 아직 참조 중)
    //   → 안전 지점(일시정지/정지/cleanup)에서만 사용
    // ============================================
    window._ttsSetAudioUrl = function(url) {
        const reader = window.ttsPlayer.state;
        if (!reader) return;
        if (reader._currentAudioUrl && reader._currentAudioUrl !== url) {
            try { URL.revokeObjectURL(reader._currentAudioUrl); } catch (e) { /* already revoked */ }
        }
        reader._currentAudioUrl = url;
    };

    // ============================================
    // 오디오 상태 머신 클래스는 modules/audio-state-machine.js로 추출됨
    // AudioPlaybackStateMachine, AudioInterruptDetector,
    // AudioRecoveryStrategy, AudioPlaybackWatchdog
    // ============================================

    // 상태 머신 및 감지기 초기화 (모듈에서 로드된 window.* 클래스 사용)
    window.audioStateMachine = new window.AudioPlaybackStateMachine();
    window.audioInterruptDetector = new window.AudioInterruptDetector(
        window.ttsPlayer.state.audioElement,
        window.audioStateMachine
    );
    window.audioRecoveryStrategy = new window.AudioRecoveryStrategy(
        window.ttsPlayer.state.audioElement,
        window.audioStateMachine
    );
    window.audioWatchdog = new window.AudioPlaybackWatchdog(
        window.ttsPlayer.state.audioElement,
        window.audioStateMachine
    );

    // 인터럽트 감지 리스너 설정
    window.audioInterruptDetector.setupListeners();

    // Watchdog 시작
    window.audioWatchdog.start();

    // 복구 요청 이벤트 리스너 (정지 상태에서는 복구 시도 안 함)
    document.addEventListener('audioRecoveryRequested', async (event) => {
        const reader = window.ttsPlayer.state;
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
        const reader = window.ttsPlayer.state;
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
            reader._src4RetryIndex = -1;  // 성공 재생 시 SRC_NOT_SUPPORTED 재시도 트래커 리셋

            // R4: 상태 머신 통합
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PLAYING', {
                    source: 'audio_event'
                });
            }

            if (dbg()) console.log('[TTS-Guard] play event - flags reset');
        });

        // --- iOS 백그라운드 연속 재생: timeupdate 기반 자동 전환 ---
        // onended는 백그라운드에서 신뢰성 없으므로 timeupdate 사용
        audio.addEventListener('timeupdate', function() {
            // 사용자가 정지/일시정지한 경우 스킵
            if (reader.isStopped || reader.isPaused) return;

            const duration = audio.duration;
            const currentTime = audio.currentTime;

            // duration이 유효하지 않으면 스킵
            if (!duration || !isFinite(duration) || duration === 0) return;

            // 트랙 끝에서 0.3초 전에 다음 트랙으로 전환
            // iOS 백그라운드에서 오디오 세션 유지를 위해 끝나기 전에 전환
            const timeLeft = duration - currentTime;
            if (timeLeft <= 0.3 && !reader._nextTrackPrepared) {
                reader._nextTrackPrepared = true;

                // shuffle 인지 순차인지에 따라 다음 인덱스 결정 (2026-04-24 수정)
                const nextIndex = window.ttsPlayer._computeAutoNextIndex?.() ??
                    ((reader.currentIndex + 1 >= reader.pages.length) ? 0 : reader.currentIndex + 1);
                const prefetched = reader._prefetchedNext;

                if (prefetched && prefetched.index === nextIndex && prefetched.blob) {
                    // Prefetch된 blob이 있으면 즉시 전환 (백그라운드에서도 작동)
                    const nextPage = reader.pages[nextIndex];
                    const nextBlob = prefetched.blob;
                    const nextCacheKey = prefetched.cacheKey;

                    // 다음 URL 생성 및 설정
                    const nextUrl = URL.createObjectURL(nextBlob);
                    reader._currentAudioBlob = nextBlob;
                    reader._currentAudioUrl = nextUrl;
                    reader.currentIndex = nextIndex;
                    reader.lastPlayedIndex = nextIndex;
                    reader._prefetchedNext = null;

                    // 오디오 요소에 다음 트랙 설정 (현재 트랙이 끝나기 전)
                    audio.src = nextUrl;
                    audio.playbackRate = reader.playbackRate;

                    // 자동 재생 (iOS 백그라운드에서도 작동해야 함)
                    audio.play().catch(e => {
                        console.warn('[AutoNext] 백그라운드 play() 실패:', e.message);
                        // 실패 시 onended로 fallback
                    });

                    // UI 업데이트 (비동기로 처리하여 재생 방해하지 않음)
                    requestAnimationFrame(() => {
                        // Stale 가드: rAF 대기 중 사용자가 Next/Prev/Stop을 누르면
                        // reader.currentIndex가 이미 다른 값이 됨 → 오래된 UI 덮어쓰기 방지
                        if (reader.currentIndex !== nextIndex) return;

                        updateNoteHighlight(reader, nextIndex);
                        setupMediaSession(reader, nextPage, nextIndex);
                        setupAudioHandlers(reader, nextUrl, nextCacheKey, nextIndex, nextPage);

                        localStorage.setItem('ttsPlayer_lastPlayedIndex', nextIndex.toString());
                        localStorage.setItem('ttsPlayer_lastPlayedTimestamp', Date.now().toString());
                        localStorage.setItem('ttsPlayer_lastPlayedTitle', nextPage.file.name);

                        window.dispatchEvent(new CustomEvent('tts-position-changed', {
                            detail: { index: nextIndex, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
                        }));

                        const lastPlayedDiv = document.getElementById('last-played-info');
                        if (lastPlayedDiv) {
                            lastPlayedDiv.innerHTML = `
                                ▶️ 재생 중: <strong>[${nextIndex + 1}/${reader.pages.length}]</strong> ${nextPage.file.name}
                                <br><small style="opacity: 0.9;">⚡ 자동 연속 재생</small>
                            `;
                        }

                        if (window.playbackPositionManager?.savePosition) {
                            window.playbackPositionManager.savePosition(
                                nextIndex, nextPage.file.path, nextPage.file.name
                            ).catch(error => console.warn('⚠️ Failed to save position:', error));
                        }

                        // 다음-다음 트랙 prefetch
                        prefetchNextTrack(reader, window.serverCacheManager, nextIndex);
                    });

                    window.ttsLog?.(`🔄 [AutoNext] 자동 전환: [${nextIndex + 1}] ${nextPage.file.name}`);
                }
            }
        });

        // --- 2. visibilitychange 감지 + 자동 재개 ---
        document.addEventListener('visibilitychange', function() {
            // 백그라운드 진입 시: 오디오 세션 유지
            if (document.visibilityState === 'hidden') {
                // 백그라운드로 진입할 때 Media Session 상태 확인
                if (reader.isPlaying && !reader.isPaused && !reader.isStopped) {
                    reader._wasPlayingBeforeInterruption = true;
                    // Media Session 상태를 'playing'으로 명시 설정 (iOS 백그라운드 재생 유지)
                    try {
                        if (navigator.mediaSession) {
                            navigator.mediaSession.playbackState = 'playing';
                        }
                    } catch (e) {
                        // playbackState 설정 실패는 무시
                    }
                    if (dbg()) console.log('[TTS-Guard] Background enter, maintaining audio session');
                }
                return;
            }

            // 포그라운드 복귀 시: 재생 확인 및 복구
            if (document.visibilityState === 'visible') {
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
                            // Media Session 상태 복원
                            try {
                                if (navigator.mediaSession) {
                                    navigator.mediaSession.playbackState = 'playing';
                                }
                            } catch (e) { /* ignore */ }
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
                            // Media Session 상태 복원
                            try {
                                if (navigator.mediaSession) {
                                    navigator.mediaSession.playbackState = 'playing';
                                }
                            } catch (e) { /* ignore */ }
                            if (dbg()) console.log('[TTS-Guard] Blob recovery resume succeeded');
                            return;
                        } catch (e) {
                            if (dbg()) console.warn('[TTS-Guard] Blob recovery failed:', e.message);
                        }
                    }

                    // Last resort: 캐시에서 재로드
                    try {
                        reader._wasPlayingBeforeInterruption = false;
                        await window.ttsPlayer.speakNote(reader.currentIndex);
                        if (dbg()) console.log('[TTS-Guard] Full reload resume succeeded');
                    } catch (e) {
                        console.error('[TTS-Guard] All resume attempts failed:', e);
                    }
                }, 500);
            }
        });

        // Heartbeat Watchdog는 AudioPlaybackWatchdog 클래스에 통합 (중복 제거)
        // AudioPlaybackWatchdog가 10초 간격, 5초 유예, blob 복구를 모두 담당

        window.ttsLog('🛡️ [TTS-Guard] 화면 잠금 방어 코드 활성화');
    })();

    // localStorage에서 사용량 복원
    const savedChars = localStorage.getItem('ttsPlayer_totalChars');
    if (savedChars && !isNaN(savedChars)) {
        window.ttsPlayer.state.totalCharsUsed = parseInt(savedChars, 10);
    }

    // ============================================
    // Azure TTS API 호출 함수 (모드 기반)
    // ============================================
    window.ttsPlayer.synthesize = async function(text) {
        const reader = window.ttsPlayer.state;

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
                localStorage.setItem('ttsPlayer_totalChars', reader.totalCharsUsed.toString());
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
    // ttsPlayer.speakNote 헬퍼 함수들
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

        // 다음 트랙 정보 미리 계산
        const nextIndex = (index + 1 >= reader.pages.length) ? 0 : index + 1;
        const nextPage = reader.pages[nextIndex];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: page.file.name,
            artist: 'Azure TTS',
            album: `출제예상 (${index + 1}/${reader.pages.length})`,
            artwork: []
        });

        // iOS 백그라운드 연속 재생: playbackState 설정
        try {
            navigator.mediaSession.playbackState = 'playing';
        } catch (e) {
            // playbackState 설정 실패는 무시 (일부 브라우저에서 지원하지 않음)
        }

        // 다음 트랙 정보 미리 설정 (iOS 연속 재생 힌트)
        if (nextPage) {
            try {
                const nextMetadata = {
                    type: 'nexttrack',
                    title: nextPage.file.name,
                    artist: 'Azure TTS',
                    album: `출제예상 (${nextIndex + 1}/${reader.pages.length})`,
                    artwork: []
                };
                // 미디어 세션에 다음 트랙 정보 전달 (지원하는 브라우저만)
                if (navigator.mediaSession.setNextTrack) {
                    navigator.mediaSession.setNextTrack(nextMetadata);
                }
            } catch (e) {
                // setNextTrack 실패는 무시
            }
        }

        navigator.mediaSession.setActionHandler('play', async () => {
            try {
                if (reader.audioElement && !reader.audioElement.error) {
                    await reader.audioElement.play();
                    reader.isPaused = false;
                    navigator.mediaSession.playbackState = 'playing';
                } else {
                    await window.ttsPlayer.speakNote(reader.currentIndex);
                }
            } catch (error) {
                console.error('❌ Media Session play error:', error);
                try { await window.ttsPlayer.speakNote(reader.currentIndex); } catch (e) { console.debug('[MediaSession] fallback play failed:', e.message); }
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            try {
                if (reader.audioElement) {
                    reader.audioElement.pause();
                    reader.isPaused = true;
                    navigator.mediaSession.playbackState = 'paused';
                }
            } catch (error) {
                console.error('❌ Media Session pause error:', error);
            }
        });

        // iOS 잠금화면 control center — 기존 previous/next 와 동일 경로 (shuffle 고려) (2026-04-24 수정)
        navigator.mediaSession.setActionHandler('previoustrack', async () => {
            try {
                await window.ttsPlayer.previous();
            } catch (error) {
                console.error('❌ Media Session previoustrack error:', error);
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', async () => {
            try {
                await window.ttsPlayer.next();
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

            if (reader.isStopped || reader.isPaused) {
                reader.isLoading = false;
                updateToggleButtonState(false);
                return;
            }

            // iOS 잠금화면 fast-play: prefetch blob이 준비되어 있으면
            // async 작업 없이 즉시 src 설정 + play() 호출하여 오디오 세션 유지
            // shuffle 인지 순차인지에 따라 다음 인덱스 결정 (2026-04-24 수정)
            const nextIndex = window.ttsPlayer._computeAutoNextIndex?.() ??
                ((index + 1 >= reader.pages.length) ? 0 : index + 1);
            const prefetched = reader._prefetchedNext;
            if (prefetched && prefetched.index === nextIndex && prefetched.blob) {
                const nextPage = reader.pages[nextIndex];
                const nextBlob = prefetched.blob;
                const nextCacheKey = prefetched.cacheKey;
                reader._prefetchedNext = null;

                // 즉시 재생 (sync 경로, async 0)
                const nextUrl = URL.createObjectURL(nextBlob);
                reader._currentAudioBlob = nextBlob;
                reader._currentAudioUrl = nextUrl;
                reader.currentIndex = nextIndex;
                reader.lastPlayedIndex = nextIndex;
                reader.audioElement.src = nextUrl;
                reader.audioElement.playbackRate = reader.playbackRate;

                try {
                    await reader.audioElement.play();

                    // Stale 가드: play() 대기 중 사용자가 Next/Prev/Stop을 누르면
                    // reader.currentIndex가 이미 다른 값이 됨 → 오래된 UI 덮어쓰기 방지
                    if (reader.currentIndex !== nextIndex) return;

                    // 재생 성공 후 UI/상태 업데이트 (비동기 후처리)
                    updateNoteHighlight(reader, nextIndex);
                    setupMediaSession(reader, nextPage, nextIndex);
                    setupAudioHandlers(reader, nextUrl, nextCacheKey, nextIndex, nextPage);

                    localStorage.setItem('ttsPlayer_lastPlayedIndex', nextIndex.toString());
                    localStorage.setItem('ttsPlayer_lastPlayedTimestamp', Date.now().toString());
                    localStorage.setItem('ttsPlayer_lastPlayedTitle', nextPage.file.name);

                    window.dispatchEvent(new CustomEvent('tts-position-changed', {
                        detail: { index: nextIndex, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
                    }));

                    if (lastPlayedDiv) {
                        lastPlayedDiv.innerHTML = `
                            ▶️ 재생 중: <strong>[${nextIndex + 1}/${reader.pages.length}]</strong> ${nextPage.file.name}
                            <br><small style="opacity: 0.9;">⚡ prefetch 캐시</small>
                        `;
                    }

                    reader.isLoading = false;
                    updateToggleButtonState(true);

                    if (window.playbackPositionManager?.savePosition) {
                        window.playbackPositionManager.savePosition(
                            nextIndex, nextPage.file.path, nextPage.file.name
                        ).catch(error => console.warn('⚠️ Failed to save position:', error));
                    }

                    // 다음-다음 트랙 prefetch
                    prefetchNextTrack(reader, window.serverCacheManager, nextIndex);

                    window.ttsLog(`⚡ [FastPlay] iOS fast-play 성공: [${nextIndex + 1}] ${nextPage.file.name}`);
                    return;
                } catch (e) {
                    // fast-play 실패 시 기존 경로로 폴백
                    console.warn('[FastPlay] iOS fast-play 실패, 기존 경로로 폴백:', e.message);
                    URL.revokeObjectURL(nextUrl);
                    reader._currentAudioBlob = null;
                    reader._currentAudioUrl = null;
                }
            }

            // 기존 경로: prefetch 없거나 fast-play 실패 시
            // nextIndex 는 L706 의 _computeAutoNextIndex() 결과 (shuffle/순차 고려됨) (2026-04-24 수정)
            window.ttsPlayer.speakNote(nextIndex);
        };

        reader.audioElement.onerror = async function(e) {
            console.error('❌ 오디오 재생 오류:', e);
            const errorType = reader.audioElement.error?.code;

            // SRC_NOT_SUPPORTED (code 4): 손상된 Blob 또는 미지원 형식
            // → prefetch/캐시 폐기 후 3단계 캐시 해결 재실행
            // 무한루프 방지: 동일 index에서 재시도 1회만 허용
            if (errorType === 4) {
                if (reader._src4RetryIndex === index) {
                    console.error(`⚠️ SRC_NOT_SUPPORTED 재시도도 실패: index=${index}`);
                    reader._src4RetryIndex = -1;  // 리셋 후 에러 UI로 fall-through
                } else {
                    console.warn(`⚠️ SRC_NOT_SUPPORTED 감지, prefetch/캐시 폐기 후 재시도: index=${index}`);
                    reader._src4RetryIndex = index;
                    reader._prefetchedNext = null;
                    // 오염된 오프라인 캐시 삭제
                    try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch (delErr) { /* ignore */ }
                    // 현재 Blob URL revoke 후 상태 초기화
                    window._ttsSetAudioUrl(null);
                    reader._currentAudioBlob = null;
                    reader.isLoading = false;
                    // 3단계 캐시 해결 재실행 (prefetch 건너뜀 → 오프라인 삭제됨 → 서버/TTS 생성)
                    window.ttsPlayer.speakNote(index);
                    return;
                }
            }

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
    window.ttsPlayer.speakNote = async function(index) {
        const reader = window.ttsPlayer.state;
        const cacheManager = window.serverCacheManager;

        // [DIAG 2026-04-25] shuffle 자동 전환 디버깅 — 임시 로깅 (확인 후 제거 예정)
        try {
            const stack = (new Error()).stack?.split('\n').slice(2, 5).map(s => s.trim()).join(' | ');
            console.log('[DIAG speakNote]', {
                index,
                prevCurrentIndex: reader.currentIndex,
                shuffle: reader.shuffle,
                cursor: reader.shuffleCursor,
                orderLen: reader.shuffleOrder?.length,
                historyLen: reader.shuffleHistory?.length,
                caller: stack
            });
        } catch (e) {}

        // 로딩 플래그 ON — ttsPlayer.togglePlayPause 이중 클릭 방어 활성화
        // 모든 퇴장 경로(empty pages / isStopped / play 성공 / catch)에서 false로 리셋됨
        reader.isLoading = true;

        // 자동 전환 플래그 리셋 (새 트랙 시작 시)
        reader._nextTrackPrepared = false;

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
        localStorage.setItem('ttsPlayer_lastPlayedIndex', index.toString());
        localStorage.setItem('ttsPlayer_lastPlayedTimestamp', Date.now().toString());
        localStorage.setItem('ttsPlayer_lastPlayedTitle', page.file.name);

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
            // 이전 URL 자동 revoke (Next/Prev 경로에서 이전 트랙 이미 일시정지됨 → 안전)
            window._ttsSetAudioUrl(audioUrl);
            reader.audioElement.src = audioUrl;
            reader.audioElement.playbackRate = reader.playbackRate;

            setupMediaSession(reader, page, index);

            setupAudioHandlers(reader, audioUrl, cacheKey, index, page);

            // TTS 재생 (벨 제거 — 연속재생 방해 요소 제거, Sub-1)
            try {
                await reader.audioElement.play();
            } catch (playError) {
                handlePlayError(playError, reader, lastPlayedDiv, index);
                throw playError;
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
    window.ttsPlayer.play = async function() {
        const reader = window.ttsPlayer.state;

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
        const localIndex = localStorage.getItem('ttsPlayer_lastPlayedIndex');
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

        window.ttsPlayer.speakNote(reader.currentIndex);
    };

    window.ttsPlayer.pause = function() {
        const reader = window.ttsPlayer.state;
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
    window.ttsPlayer.togglePlayPause = async function() {
        const reader = window.ttsPlayer.state;

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
            window.ttsPlayer.pause();
            updateToggleButtonState(false);
            return;
        }

        // 정지 상태이면 새로 재생
        await window.ttsPlayer.play();
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

    // onended 토글 업데이트는 ttsPlayer.speakNote 내 onended 핸들러에 통합 (덮어쓰기 제거)

    window.ttsPlayer.stop = function() {
        const reader = window.ttsPlayer.state;

        // 🔥 플래그를 pause() 호출 전에 먼저 설정 (pause 이벤트 핸들러 race condition 방지)
        reader.isStopped = true;
        reader.isPaused = false;
        reader.isPlaying = false;
        reader._wasPlayingBeforeInterruption = false;
        reader._prefetchedNext = null;

        cleanupAudioElement(reader.audioElement);
        reader.audioElement.src = '';
        reader._currentAudioBlob = null;
        // Blob URL 누수 방지: 이전 URL 자동 revoke 후 null 설정 (기존 직접 대입은 누수 지점이었음)
        window._ttsSetAudioUrl(null);

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

    // ============================================
    // 플레이백 모드 API (2026-04-24 추가)
    // setDomainFilter / setShuffle / regenerateShuffleOrder
    // ============================================
    const DOMAIN_PATH_PREFIX = '1_Project/정보 관리 기술사/';

    window.ttsPlayer.regenerateShuffleOrder = function() {
        const reader = window.ttsPlayer.state;
        const n = (reader.pages || []).length;
        const order = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        reader.shuffleOrder = order;
        reader.shuffleCursor = -1;
        reader.shuffleHistory = [];
        window.ttsLog?.(`🔀 Shuffle 재생성: ${n}개 permutation`);
    };

    // ============================================
    // 자동 전환용 다음 인덱스 계산 (side-effect 있음: cursor 전진 + history push)
    // onended / iOS timeupdate 등 auto-advance 경로에서 공통 사용
    // shuffle ON 이면 shuffleOrder 를 따르고, OFF 면 +1 (wrap to 0)
    // ============================================
    window.ttsPlayer._computeAutoNextIndex = function() {
        const reader = window.ttsPlayer.state;
        if (!reader.pages || reader.pages.length === 0) return -1;

        if (reader.shuffle && reader.shuffleOrder && reader.shuffleOrder.length > 0) {
            if (reader.currentIndex >= 0) {
                reader.shuffleHistory = reader.shuffleHistory || [];
                reader.shuffleHistory.push(reader.currentIndex);
            }
            reader.shuffleCursor = (reader.shuffleCursor ?? -1) + 1;
            if (reader.shuffleCursor >= reader.shuffleOrder.length) {
                window.ttsPlayer.regenerateShuffleOrder();
                reader.shuffleCursor = 0;
            }
            const picked = reader.shuffleOrder[reader.shuffleCursor];
            // [DIAG 2026-04-25] 임시 로그
            console.log('[DIAG _computeAutoNextIndex/SHUFFLE]', { picked, cursor: reader.shuffleCursor, currentIndex: reader.currentIndex });
            return picked;
        }

        // 순차 (wrap around)
        const seq = (reader.currentIndex + 1 >= reader.pages.length) ? 0 : reader.currentIndex + 1;
        // [DIAG 2026-04-25] shuffle 조건 실패 — 어느 조건에서 실패했는지 덤프
        console.log('[DIAG _computeAutoNextIndex/SEQUENTIAL]', {
            seq,
            shuffle: reader.shuffle,
            hasOrder: !!reader.shuffleOrder,
            orderLen: reader.shuffleOrder?.length,
            currentIndex: reader.currentIndex
        });
        return seq;
    };

    window.ttsPlayer.setShuffle = function(enabled) {
        const reader = window.ttsPlayer.state;
        reader.shuffle = !!enabled;
        if (reader.shuffle) {
            window.ttsPlayer.regenerateShuffleOrder();
        } else {
            reader.shuffleOrder = null;
            reader.shuffleCursor = -1;
            reader.shuffleHistory = [];
        }
        window.ttsLog?.(`🔀 Shuffle ${reader.shuffle ? 'ON' : 'OFF'}`);
    };

    window.ttsPlayer.setDomainFilter = function(domain) {
        const reader = window.ttsPlayer.state;
        if (!reader.originalPages) reader.originalPages = (reader.pages || []).slice();
        reader.domainFilter = domain || '';

        if (!reader.domainFilter) {
            reader.pages = reader.originalPages.slice();
        } else {
            const prefix = DOMAIN_PATH_PREFIX + reader.domainFilter + '/';
            reader.pages = reader.originalPages.filter(p => p.file?.path?.startsWith(prefix));
        }

        // 필터 적용 후 currentIndex 무효화 (다음 재생부터 새 pages 기준)
        reader.currentIndex = -1;

        // shuffle 켜져 있으면 새 pages 기준으로 재셔플
        if (reader.shuffle) window.ttsPlayer.regenerateShuffleOrder();

        window.ttsLog?.(`📂 도메인 필터: '${reader.domainFilter || '전체'}' → ${reader.pages.length}개`);

        if (reader.pages.length === 0) {
            alert(`⚠️ '${reader.domainFilter}' 도메인에 재생할 노트가 없습니다.`);
        }
    };

    window.ttsPlayer.next = function() {
        const reader = window.ttsPlayer.state;

        // pages 배열 유효성 검증
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

        cleanupAudioElement(reader.audioElement);
        reader.audioElement.src = '';

        // Shuffle 모드: shuffleOrder 상 cursor 전진
        if (reader.shuffle && reader.shuffleOrder && reader.shuffleOrder.length > 0) {
            if (reader.currentIndex >= 0) {
                reader.shuffleHistory = reader.shuffleHistory || [];
                reader.shuffleHistory.push(reader.currentIndex);
            }
            reader.shuffleCursor = (reader.shuffleCursor ?? -1) + 1;
            // 한 바퀴 완료 → 자동 재셔플
            if (reader.shuffleCursor >= reader.shuffleOrder.length) {
                window.ttsPlayer.regenerateShuffleOrder();
                reader.shuffleCursor = 0;
            }
            const nextIdx = reader.shuffleOrder[reader.shuffleCursor];
            window.ttsPlayer.speakNote(nextIdx);
            return;
        }

        // 순차 모드
        window.ttsPlayer.speakNote(reader.currentIndex + 1);
    };

    window.ttsPlayer.previous = function() {
        const reader = window.ttsPlayer.state;

        // pages 배열 유효성 검증
        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 재생할 노트가 없습니다.');
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

        // Shuffle 모드: history 스택에서 복원
        if (reader.shuffle) {
            if (reader.shuffleHistory && reader.shuffleHistory.length > 0) {
                const prevIdx = reader.shuffleHistory.pop();
                reader.shuffleCursor = Math.max(-1, (reader.shuffleCursor ?? 0) - 1);
                cleanupAudioElement(reader.audioElement);
                reader.audioElement.src = '';
                window.ttsPlayer.speakNote(prevIdx);
            } else {
                alert('⚠️ 이전 랜덤 항목이 없습니다.');
            }
            return;
        }

        // 순차 모드
        const prevIndex = reader.currentIndex - 1;
        if (prevIndex < 0) {
            alert('⚠️ 첫 번째 노트입니다.');
            return;
        }

        cleanupAudioElement(reader.audioElement);
        reader.audioElement.src = '';
        window.ttsPlayer.speakNote(prevIndex);
    };

    window.ttsPlayer.setRate = function(rate) {
        const reader = window.ttsPlayer.state;
        reader.playbackRate = parseFloat(rate);

        if (reader.audioElement && reader.audioElement.src) {
            reader.audioElement.playbackRate = reader.playbackRate;
        }

        const rateDisplay = document.getElementById('rate-display');
        if (rateDisplay) {
            rateDisplay.textContent = `${rate}x`;
        }
    };

    window.ttsPlayer.playFrom = function(index) {
        const reader = window.ttsPlayer.state;
        reader.currentIndex = index;
        reader.isStopped = false;
        reader.isPaused = false;
        window.ttsPlayer.speakNote(index);
    };

    window.ttsLog('✅ [tts-engine] 모듈 로드 완료');

    // ============================================
    // Cleanup 함수: 메모리 누수 방지
    // ============================================
    window.ttsPlayer.cleanup = function() {
        const reader = window.ttsPlayer.state;
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

            // Blob URL 해제 (_ttsSetAudioUrl이 자동 revoke 수행)
            window._ttsSetAudioUrl(null);
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
    // Phase B-5 완료: ttsPlayer 네임스페이스 최종화
    // 모든 메서드는 위에서 window.ttsPlayer.X = function() {} 형태로 직접 할당됨
    // 구 shim(window.azureTTS* / window.callAzureTTS / window.speakNoteWithServerCache) 완전 제거
    // ============================================
    window.ttsLog('✅ [tts-engine] ttsPlayer v6.0 네임스페이스 활성화');

    // ============================================
    // 페이지 언로드 시 자동 정리 (Obsidian 뷰 닫힘 감지)
    // ============================================
    const originalOnUnload = window.onbeforeunload;
    window.onbeforeunload = function() {
        if (window.ttsPlayer.cleanup) {
            window.ttsPlayer.cleanup();
        }
        if (originalOnUnload) {
            return originalOnUnload.apply(this, arguments);
        }
    };
    // pages 배열 설정 (비동기 초기화 완료 후 즉시 설정)
    if (input && input.pages) {
        window.ttsPlayer.state.pages = input.pages;
        window.ttsPlayer.state.originalPages = input.pages.slice();  // 원본 스냅샷 (필터 해제 시 복구용)
        window.ttsLog(`📚 [initializeTTSPlayer] ${input.pages.length}개 페이지 로드`);

        const savedIndex = localStorage.getItem('ttsPlayer_lastPlayedIndex');
        if (savedIndex && !isNaN(savedIndex)) {
            window.ttsPlayer.state.currentIndex = parseInt(savedIndex, 10);
            window.ttsPlayer.state.lastPlayedIndex = parseInt(savedIndex, 10);
            window.ttsLog(`📍 마지막 재생 위치 복원: ${window.ttsPlayer.state.lastPlayedIndex + 1}번`);
        }

        // 필터/셔플 복원 (localStorage) — UI 초기화 전에 엔진 상태 선적용
        const savedDomain = localStorage.getItem('ttsPlayer_domainFilter') || '';
        if (savedDomain && window.ttsPlayer.setDomainFilter) {
            window.ttsPlayer.setDomainFilter(savedDomain);
        }
        const savedShuffle = localStorage.getItem('ttsPlayer_shuffle') === 'true';
        if (savedShuffle && window.ttsPlayer.setShuffle) {
            window.ttsPlayer.setShuffle(true);
        }
    }

    } // End of initializeTTSPlayer()
} // End of if (!window.ttsPlayer)

// ============================================
// pages 배열 설정 (input으로 전달받음)
// 비동기 초기화 완료 전에는 ttsPlayer.state가 없을 수 있음 → 옵셔널 체이닝 사용
//
// [Issue 1 방어] Dataview 리렌더링(통합노트 왕복 등) 시 재생 중인데
// pages/currentIndex를 덮어쓰면 prefetch/timeupdate의 captured reference가
// 무효화되고 오디오 세션이 중단될 수 있음 → 재생 중이면 overwrite 스킵
// ============================================
if (input && input.pages && window.ttsPlayer?.state) {
    const _state = window.ttsPlayer.state;
    const _isActivelyPlaying = _state.isPlaying && _state.pages && _state.pages.length > 0;

    if (_isActivelyPlaying) {
        // 재생 중: 외부 재렌더링으로 인한 state 교체 차단
        window.ttsLog?.(`⚠️ [tts-engine] 재생 중 Dataview 리렌더 감지 - pages/index overwrite 스킵 (현재 index=${_state.currentIndex})`);
    } else {
        _state.pages = input.pages;
        _state.originalPages = input.pages.slice();  // 원본 스냅샷 갱신 (필터 해제 시 복구용)
        window.ttsLog(`📚 TTS 엔진에 ${input.pages.length}개 페이지 로드`);

        // 마지막 재생 위치 복원
        const savedIndex = localStorage.getItem('ttsPlayer_lastPlayedIndex');
        if (savedIndex && !isNaN(savedIndex)) {
            _state.currentIndex = parseInt(savedIndex, 10);
            _state.lastPlayedIndex = parseInt(savedIndex, 10);
            window.ttsLog(`📍 마지막 재생 위치 복원: ${_state.lastPlayedIndex + 1}번`);
        }

        // 리렌더 시 필터/셔플 재적용
        if (_state.domainFilter && window.ttsPlayer.setDomainFilter) {
            window.ttsPlayer.setDomainFilter(_state.domainFilter);
        }
        if (_state.shuffle && window.ttsPlayer.regenerateShuffleOrder) {
            window.ttsPlayer.regenerateShuffleOrder();
        }
    }
}
