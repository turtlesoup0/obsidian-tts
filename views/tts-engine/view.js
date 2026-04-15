// ============================================
// tts-engine: TTS 재생 엔진
// callAzureTTS + speakNoteWithServerCache + 재생 컨트롤
// 의존성: tts-core, tts-config, tts-text, tts-cache, tts-position
// input: { pages } - dv.pages() 결과
// ============================================

// XSS 방지: HTML 이스케이프 헬퍼 (innerHTML에 동적 값 삽입 시 사용)
window._ttsEscapeHtml = window._ttsEscapeHtml || function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// 핵심 유틸리티: 가드 밖에서 항상 보장 (Dataview 리렌더링 시 소실 방지)
if (window.azureTTSReader) {
    if (!window._ttsSetAudioUrl) {
        window._ttsSetAudioUrl = function(url) {
            const reader = window.azureTTSReader;
            if (reader._currentAudioUrl && reader._currentAudioUrl !== url) {
                try { URL.revokeObjectURL(reader._currentAudioUrl); } catch (e) { /* ignore */ }
            }
            reader._currentAudioUrl = url;
        };
    }
    if (!window._ttsGetActiveAudio) {
        window._ttsGetActiveAudio = function() {
            const reader = window.azureTTSReader;
            return reader._activeAudioIdx === 'B' ? reader.audioElementB : reader.audioElement;
        };
    }
    if (!window._ttsStopKeepalive) {
        window._ttsStopKeepalive = function() {
            const reader = window.azureTTSReader;
            if (reader._keepaliveCtx) {
                try { reader._keepaliveCtx.close(); } catch (e) { /* ignore */ }
                reader._keepaliveCtx = null;
                reader._keepaliveRunning = false;
            }
        };
    }
}

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

        // Phase 3: 서브모듈 병렬 로딩
        await Promise.all([
            loadVaultModule('3_Resource/obsidian/views/common/fetch-helpers.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/audio-state-machine.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/audio-cache-resolver.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/playback-core.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/playback-handlers.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/media-session.js'),
            loadVaultModule('3_Resource/obsidian/views/tts-engine/modules/player-controls.js'),
        ]);
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
        _prefetchedNext: null,
        _nextTrackPrepared: false,  // iOS 백그라운드 연속 재생: 다음 트랙 전환 완료 플래그
        // Phase 1: Dual Audio Element + Silent Keepalive
        audioElementB: null,       // 두 번째 오디오 엘리먼트 (gapless 전환용)
        _activeAudioIdx: 'A',      // 현재 활성 엘리먼트 ('A' 또는 'B')
        _keepaliveCtx: null,       // Silent AudioContext (iOS 세션 유지)
        _keepaliveRunning: false
    };

    // Blob URL 안전 관리: 이전 URL 자동 해제
    window._ttsSetAudioUrl = function(url) {
        const reader = window.azureTTSReader;
        if (reader._currentAudioUrl && reader._currentAudioUrl !== url) {
            try { URL.revokeObjectURL(reader._currentAudioUrl); } catch (e) { /* ignore */ }
        }
        reader._currentAudioUrl = url;
    };

    // 오디오 엘리먼트 생성 (iOS 백그라운드 재생 지원)
    window.azureTTSReader.audioElement = new Audio();
    window.azureTTSReader.audioElement.preload = 'auto';
    window.azureTTSReader.audioElement.setAttribute('playsinline', '');
    window.azureTTSReader.audioElement.setAttribute('webkit-playsinline', '');
    // iOS 백그라운드 오디오: 무음 루프로 세션 유지 (연속 재생 지원)
    window.azureTTSReader.audioElement.loop = false;
    window.azureTTSReader.audioElement.crossOrigin = 'anonymous';
    // Phase 1: 두 번째 오디오 엘리먼트 생성 (gapless 전환용)
    window.azureTTSReader.audioElementB = new Audio();
    window.azureTTSReader.audioElementB.preload = 'auto';
    window.azureTTSReader.audioElementB.setAttribute('playsinline', '');
    window.azureTTSReader.audioElementB.setAttribute('webkit-playsinline', '');
    window.azureTTSReader.audioElementB.loop = false;
    window.azureTTSReader.audioElementB.crossOrigin = 'anonymous';

    window.ttsLog('🎵 Dual 오디오 엘리먼트 생성 완료 (A+B gapless 전환)');

    // Phase 1: Silent Audio Keepalive (iOS 백그라운드 오디오 세션 유지)
    window._ttsStartKeepalive = function() {
        const reader = window.azureTTSReader;
        if (reader._keepaliveRunning) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 10; // 비가청 주파수
            gain.gain.value = 0.001;  // 거의 무음
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            reader._keepaliveCtx = ctx;
            reader._keepaliveRunning = true;
            window.ttsLog?.('🔇 [Keepalive] Silent AudioContext 시작 (iOS 세션 유지)');
        } catch (e) {
            console.warn('[Keepalive] AudioContext 생성 실패:', e.message);
        }
    };

    window._ttsStopKeepalive = function() {
        const reader = window.azureTTSReader;
        if (!reader._keepaliveRunning || !reader._keepaliveCtx) return;
        try {
            reader._keepaliveCtx.close();
        } catch (e) { /* ignore */ }
        reader._keepaliveCtx = null;
        reader._keepaliveRunning = false;
        window.ttsLog?.('🔇 [Keepalive] Silent AudioContext 종료');
    };

    // 활성 오디오 엘리먼트 getter (A/B 중 현재 활성)
    window._ttsGetActiveAudio = function() {
        const reader = window.azureTTSReader;
        return reader._activeAudioIdx === 'B' ? reader.audioElementB : reader.audioElement;
    };

    // 비활성 오디오 엘리먼트 getter (다음 트랙 프리로드용)
    window._ttsGetInactiveAudio = function() {
        const reader = window.azureTTSReader;
        return reader._activeAudioIdx === 'B' ? reader.audioElement : reader.audioElementB;
    };

    // A/B 스왑
    window._ttsSwapAudio = function() {
        const reader = window.azureTTSReader;
        reader._activeAudioIdx = reader._activeAudioIdx === 'A' ? 'B' : 'A';
        // audioElement 참조를 현재 활성으로 업데이트 (기존 코드 호환)
        // NOTE: reader.audioElement은 항상 A를 가리킴 (원본 참조 유지)
        window.ttsLog?.(`🔄 [DualAudio] Active element swapped to ${reader._activeAudioIdx}`);
    };

    // cleanupAudioElement, verifiedPlay, finalizeTransition → modules/playback-core.js로 추출됨
    // view.js 내부에서는 window.cleanupAudioElement, window.verifiedPlay, window.finalizeTransition 사용
    const cleanupAudioElement = window.cleanupAudioElement;
    const verifiedPlay = window.verifiedPlay;
    const finalizeTransition = window.finalizeTransition;

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

    // 복구 요청 이벤트 리스너 (정지 상태에서는 복구 시도 안 함) — 중복 등록 방지
    if (!window._ttsRecoveryListenerRegistered) {
    window._ttsRecoveryListenerRegistered = true;
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
    } // end recovery listener guard

    window.ttsLog('✅ 오디오 인터럽트 감지 및 복구 시스템 초기화 완료');

    // ============================================
    // 화면 잠금 시 TTS 재생 유지 방어 코드 (중복 등록 방지)
    // ============================================
    (function() {
        if (window._ttsGuardListenersRegistered) return; // 중복 등록 방지
        window._ttsGuardListenersRegistered = true;

        const reader = window.azureTTSReader;
        const audio = reader.audioElement;
        const dbg = () => window.TTS_DEBUG;

        // --- 1. pause/play 이벤트 리스너 (A+B 양쪽 등록, Dual Audio 전환 후에도 감지 보장) ---
        const onOsPause = function() {
            // 이 엘리먼트가 현재 활성이 아니면 스킵
            if (window._ttsGetActiveAudio() !== this) return;
            // pause 이벤트: 사용자 일시정지/정지가 아닌 경우 OS 강제 중단으로 판단
            if (reader.isPaused || reader.isStopped) {
                // 사용자가 직접 일시정지하거나 정지한 경우
                reader._wasPlayingBeforeInterruption = false;
                return;
            }
            // OS가 강제로 정지한 경우 (화면 잠금, 다른 앱 소리 등)
            reader._wasPlayingBeforeInterruption = true;
            reader._lastInterruptionTime = Date.now();
            if (dbg()) console.log('[TTS-Guard] OS-forced pause detected on', reader._activeAudioIdx, 'at', new Date().toLocaleTimeString());
        };
        audio.addEventListener('pause', onOsPause);
        reader.audioElementB.addEventListener('pause', onOsPause);

        const onPlay = function() {
            // 이 엘리먼트가 현재 활성이 아니면 스킵
            if (window._ttsGetActiveAudio() !== this) return;
            // play 이벤트: 상태 머신이 PLAYING 전이 시 syncReaderFlags가 isPlaying=true 설정
            reader._wasPlayingBeforeInterruption = false;
            reader._watchdogDetectedAt = 0;

            // R4: 상태 머신 통합
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PLAYING', {
                    source: 'audio_event'
                });
            }

            if (dbg()) console.log('[TTS-Guard] play event - flags reset');
        };
        audio.addEventListener('play', onPlay);
        reader.audioElementB.addEventListener('play', onPlay);

        // --- iOS 백그라운드 연속 재생: timeupdate 기반 Dual Audio gapless 전환 ---
        // onended는 백그라운드에서 신뢰성 없으므로 timeupdate를 primary로 사용
        // Phase 1: Dual Audio Element로 갭 없는 전환 구현
        const setupTimeupdateForElement = (audioEl) => {
            audioEl.addEventListener('timeupdate', function() {
                // 이 엘리먼트가 현재 활성이 아니면 스킵
                if (window._ttsGetActiveAudio() !== audioEl) return;
                // 사용자가 정지/일시정지한 경우 스킵
                if (reader.isStopped || reader.isPaused) return;

                const duration = audioEl.duration;
                const currentTime = audioEl.currentTime;

                // duration이 유효하지 않으면 스킵
                if (!duration || !isFinite(duration) || duration === 0) return;

                // 트랙 끝에서 0.3초 전에 다음 트랙으로 전환
                const timeLeft = duration - currentTime;
                if (timeLeft <= 0.3 && !reader._nextTrackPrepared) {
                    reader._nextTrackPrepared = true;

                    // iOS 백그라운드 감지: hidden이면 Dual Audio 전환 스킵
                    // → onended 핸들러가 단일 엘리먼트로 안전하게 전환
                    const isBackground = document.visibilityState === 'hidden';

                    const nextIndex = (reader.currentIndex + 1 >= reader.pages.length) ? 0 : reader.currentIndex + 1;
                    const prefetched = reader._prefetchedNext;

                    if (!isBackground && prefetched && prefetched.index === nextIndex && prefetched.blob) {
                        // === 포그라운드: Dual Audio gapless 전환 ===
                        const nextPage = reader.pages[nextIndex];
                        const nextBlob = prefetched.blob;
                        const nextCacheKey = prefetched.cacheKey;
                        const savedCurrentIndex = reader.currentIndex;

                        const inactiveAudio = window._ttsGetInactiveAudio();
                        const nextUrl = URL.createObjectURL(nextBlob);

                        inactiveAudio.src = nextUrl;
                        inactiveAudio.playbackRate = reader.playbackRate;

                        reader._currentAudioBlob = nextBlob;
                        window._ttsSetAudioUrl(nextUrl);
                        reader.currentIndex = nextIndex;
                        reader.lastPlayedIndex = nextIndex;
                        reader._prefetchedNext = null;

                        // 현재 엘리먼트의 onended/onerror를 play() 전에 동기적으로 해제
                        // (play() → .then() 사이에 A가 자연 종료하면 onended 발동 → 돌림노래 방지)
                        audioEl.onended = null;
                        audioEl.onerror = null;

                        // 비활성 엘리먼트로 즉시 재생 시작 (갭 0ms) + 좀비 검증
                        verifiedPlay(inactiveAudio, { cacheKey: nextCacheKey }).then(() => {
                            // 성공: A/B 스왑 + 이전 엘리먼트 정리
                            window._ttsSwapAudio();
                            audioEl.pause();
                            audioEl.src = '';

                            finalizeTransition(nextIndex, nextPage, {
                                cacheKey: nextCacheKey, audioUrl: nextUrl, source: '⚡ gapless 연속 재생'
                            });
                        }).catch(e => {
                            console.warn('[AutoNext] Dual audio play() 실패, onended 위임:', e.message);
                            // 실패: 상태 롤백 → 현재 트랙이 자연 종료 시 onended가 처리
                            reader.currentIndex = savedCurrentIndex;
                            reader.lastPlayedIndex = savedCurrentIndex;
                            reader._currentAudioBlob = null;
                            window._ttsSetAudioUrl(null);
                            // prefetch 복원 (onended에서 사용)
                            reader._prefetchedNext = { index: nextIndex, blob: nextBlob, cacheKey: nextCacheKey };
                            URL.revokeObjectURL(nextUrl);
                            inactiveAudio.src = '';
                            // onended/onerror 복원 (위에서 해제했으므로 — 현재 트랙 종료 시 다음으로 진행)
                            const currentPage = reader.pages[savedCurrentIndex];
                            if (currentPage) {
                                window.setupAudioHandlers(reader, audioEl.src, '', savedCurrentIndex, currentPage);
                            }
                            reader._nextTrackPrepared = false;
                        });
                    } else {
                        // === 백그라운드 또는 prefetch 없음: onended에 위임 ===
                        // timeupdate에서는 아무것도 하지 않음 — 트랙 자연 종료 시 onended가 처리
                        reader._nextTrackPrepared = false;
                        if (isBackground) {
                            window.ttsLog?.(`📱 [AutoNext] 백그라운드 → onended 단일 엘리먼트 전환 위임`);
                        }
                    }
                }
            });
        };
        // 양쪽 오디오 엘리먼트 모두에 timeupdate 리스너 등록
        setupTimeupdateForElement(audio);
        setupTimeupdateForElement(reader.audioElementB);

        // --- 2. visibilitychange 감지 + 자동 재개 ---
        document.addEventListener('visibilitychange', function() {
            // 백그라운드 진입 시: 오디오 세션 유지
            if (document.visibilityState === 'hidden') {
                // 백그라운드로 진입할 때 Media Session 상태 확인
                if (reader.isPlaying && !reader.isPaused && !reader.isStopped) {
                    reader._wasPlayingBeforeInterruption = true;
                    // Phase 1: Keepalive AudioContext resume (iOS가 suspend할 수 있으므로)
                    if (reader._keepaliveCtx && reader._keepaliveCtx.state === 'suspended') {
                        reader._keepaliveCtx.resume().catch(() => {});
                    }
                    // Media Session 상태를 'playing'으로 명시 설정 (iOS 백그라운드 재생 유지)
                    try {
                        if (navigator.mediaSession) {
                            navigator.mediaSession.playbackState = 'playing';
                        }
                    } catch (e) {
                        // playbackState 설정 실패는 무시
                    }
                    if (dbg()) console.log('[TTS-Guard] Background enter, keepalive active, maintaining audio session');
                }
                return;
            }

            // 포그라운드 복귀 시: 재생 확인 및 복구
            if (document.visibilityState === 'visible') {
                if (!reader._wasPlayingBeforeInterruption) return;
                if (reader.isPaused || reader.isStopped) return;

                if (dbg()) console.log('[TTS-Guard] Screen returned, attempting resume...');

                setTimeout(async function() {
                    const activeAudio = window._ttsGetActiveAudio();

                    // 좀비 감지: paused=false인데 currentTime 정지
                    if (!activeAudio.paused) {
                        const snapTime = activeAudio.currentTime;
                        await new Promise(r => setTimeout(r, 500));
                        if (!activeAudio.paused && activeAudio.currentTime !== snapTime) {
                            // 정상 재생 중 — 스킵
                            reader._wasPlayingBeforeInterruption = false;
                            return;
                        }
                        // 좀비 또는 paused로 전환됨 — 아래 복구로 진행
                        if (dbg()) console.log('[TTS-Guard] Zombie or paused detected on foreground return');
                    }

                    if (reader.isPaused || reader.isStopped) return;

                    // 통합 복구: speakNoteWithServerCache가 cleanup → cache resolve → verifiedPlay 전체 처리
                    // 포그라운드이므로 cleanup 안전, verifiedPlay가 좀비도 처리
                    try {
                        reader._wasPlayingBeforeInterruption = false;
                        await window.speakNoteWithServerCache(reader.currentIndex);
                        if (dbg()) console.log('[TTS-Guard] Foreground recovery succeeded via speakNoteWithServerCache');
                    } catch (e) {
                        console.error('[TTS-Guard] Foreground recovery failed:', e);
                    }
                }, 500);
            }
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
            }, 120000);

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
    // handlePlayError, updateNoteHighlight, updateToggleButtonState,
    // azureTTSPlay/Pause/Toggle/Stop/Next/Prev/SetRate/PlayFrom
    // → modules/player-controls.js로 추출됨

    // TTS 네임스페이스에 엔진 등록
    if (window.TTS) {
        window.TTS.reader = window.azureTTSReader;
        window.TTS.stateMachine = window.audioStateMachine;
        window.TTS.watchdog = window.audioWatchdog;
        window.TTS.play = window.azureTTSPlay;
        window.TTS.pause = window.azureTTSPause;
        window.TTS.stop = window.azureTTSStop;
        window.TTS.playFrom = window.azureTTSPlayFrom;
        window.TTS.registerModule('engine', {
            reader: window.azureTTSReader,
            play: window.azureTTSPlay,
            pause: window.azureTTSPause,
            stop: window.azureTTSStop
        });
    }

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

        // Phase 1: Keepalive 정리
        window._ttsStopKeepalive();

        // 오디오 엘리먼트 정리 (A + B 모두)
        [reader.audioElement, reader.audioElementB].forEach(el => {
            if (el) {
                el.pause();
                el.src = '';
            }
        });

        // Blob URL 해제
        window._ttsSetAudioUrl(null);
        reader._currentAudioBlob = null;
        reader._activeAudioIdx = 'A';

        // 이벤트 리스너 제거 (cloneNode를 통한 전체 리스너 제거)
        if (reader.audioElement) {
            const newAudio = reader.audioElement.cloneNode(true);
            if (reader.audioElement.parentNode) {
                reader.audioElement.parentNode.replaceChild(newAudio, reader.audioElement);
            }
            reader.audioElement = newAudio;
        }
        if (reader.audioElementB) {
            const newAudioB = reader.audioElementB.cloneNode(true);
            if (reader.audioElementB.parentNode) {
                reader.audioElementB.parentNode.replaceChild(newAudioB, reader.audioElementB);
            }
            reader.audioElementB = newAudioB;
        }

        // 상태 초기화
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('STOPPED', { source: 'cleanup' });
        } else {
            reader.isStopped = true;
            reader.isPaused = false;
        }
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
