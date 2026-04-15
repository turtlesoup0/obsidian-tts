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

    // 오디오 엘리먼트 정리 헬퍼 (onended/onerror 해제 + pause)
    function cleanupAudioElement(el) {
        if (!el) return;
        el.onended = null;
        el.onerror = null;
        if (!el.paused) el.pause();
    }

    // ============================================
    // verifiedPlay: play() 후 300ms 내 currentTime 진행 검증
    // 좀비(play() OK but no audio) 감지 시 IndexedDB에서 fresh blob 재로드
    // 모든 트랙 전환 경로의 play()를 이 함수로 통일
    // ============================================
    async function verifiedPlay(audioEl, { cacheKey } = {}) {
        const reader = window.azureTTSReader;

        // Step 1: play() 호출
        await audioEl.play();

        // Step 2: 300ms 후 currentTime 진행 확인
        const snapTime = audioEl.currentTime;
        await new Promise(r => setTimeout(r, 300));

        // 사용자가 정지/일시정지했거나 다른 트랙으로 전환된 경우 검증 스킵
        if (audioEl.paused || audioEl.ended || reader.isStopped || reader.isPaused) return;

        // currentTime이 진행했으면 정상
        if (audioEl.currentTime !== snapTime) return;

        // Step 3: 좀비 감지 — IndexedDB에서 fresh blob 재로드
        console.warn('[verifiedPlay] 🧟 play() OK but currentTime stuck at', snapTime, '→ IndexedDB recovery');

        if (!cacheKey) {
            throw new Error('verifiedPlay: zombie detected but no cacheKey for recovery');
        }

        let freshBlob = null;
        try {
            freshBlob = await window.offlineCacheManager.getAudio(cacheKey);
        } catch (e) {
            console.warn('[verifiedPlay] IndexedDB read failed:', e.message);
        }

        if (!freshBlob || !(freshBlob instanceof Blob) || freshBlob.size < 100) {
            throw new Error('verifiedPlay: zombie detected, no valid blob in IndexedDB');
        }

        // Fresh blob URL 생성 → src 교체 → 재생
        const newUrl = URL.createObjectURL(freshBlob);
        audioEl.pause();
        audioEl.src = newUrl;
        audioEl.currentTime = snapTime;
        audioEl.playbackRate = reader.playbackRate;
        reader._currentAudioBlob = freshBlob;
        window._ttsSetAudioUrl(newUrl);

        // Keepalive resume (iOS suspend 대응)
        if (reader._keepaliveCtx && reader._keepaliveCtx.state === 'suspended') {
            reader._keepaliveCtx.resume().catch(() => {});
        }

        await audioEl.play();

        try {
            if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
        } catch (e) { /* ignore */ }

        console.log('[verifiedPlay] ✅ IndexedDB recovery succeeded for cacheKey:', cacheKey.substring(0, 16));
    }

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
                            // 성공: A/B 스왑 + UI 업데이트 + 핸들러 등록
                            window._ttsSwapAudio();
                            audioEl.pause();
                            audioEl.src = '';

                            updateNoteHighlight(reader, nextIndex);
                            setupMediaSession(reader, nextPage, nextIndex);
                            setupAudioHandlers(reader, nextUrl, nextCacheKey, nextIndex, nextPage);

                            localStorage.setItem('azureTTS_lastPlayedIndex', nextIndex.toString());
                            localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
                            localStorage.setItem('azureTTS_lastPlayedTitle', nextPage.file.name);

                            window.dispatchEvent(new CustomEvent('tts-position-changed', {
                                detail: { index: nextIndex, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
                            }));

                            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
                            if (lastPlayedDiv) {
                                lastPlayedDiv.innerHTML = `
                                    ▶️ 재생 중: <strong>[${nextIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(nextPage.file.name)}
                                    <br><small style="opacity: 0.9;">⚡ gapless 연속 재생</small>
                                `;
                            }

                            if (window.playbackPositionManager?.savePosition) {
                                window.playbackPositionManager.savePosition(
                                    nextIndex, nextPage.file.path, nextPage.file.name
                                ).catch(error => console.warn('⚠️ Failed to save position:', error));
                            }

                            reader._nextTrackPrepared = false;
                            prefetchNextTrack(reader, window.serverCacheManager, nextIndex);
                            window.ttsLog?.(`🔄 [AutoNext] gapless 전환 성공: [${nextIndex + 1}] ${window._ttsEscapeHtml(nextPage.file.name)}`);
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
                                setupAudioHandlers(reader, audioEl.src, '', savedCurrentIndex, currentPage);
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
                    // Phase 1: 활성 오디오 엘리먼트 기준으로 복구
                    const activeAudio = window._ttsGetActiveAudio();

                    // 재진입 방지: 이미 재생 중이면 — 좀비 체크 후 스킵
                    if (!activeAudio.paused) {
                        // 좀비 감지: paused=false인데 currentTime이 안 움직이면 좀비
                        const snapTime = activeAudio.currentTime;
                        await new Promise(r => setTimeout(r, 600));
                        if (!activeAudio.paused && activeAudio.currentTime === snapTime && snapTime > 0) {
                            console.warn('[TTS-Guard] 🧟 Zombie detected on foreground return: paused=false but currentTime stuck at', snapTime);
                            // blob 재생성으로 복구
                            if (reader._currentAudioBlob) {
                                try {
                                    const newUrl = URL.createObjectURL(reader._currentAudioBlob);
                                    activeAudio.pause();
                                    activeAudio.src = newUrl;
                                    activeAudio.currentTime = snapTime;
                                    activeAudio.playbackRate = reader.playbackRate;
                                    window._ttsSetAudioUrl?.(newUrl);
                                    if (reader._keepaliveCtx && reader._keepaliveCtx.state === 'suspended') {
                                        reader._keepaliveCtx.resume().catch(() => {});
                                    }
                                    await activeAudio.play();
                                    reader._wasPlayingBeforeInterruption = false;
                                    try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; } catch (e) { /* ignore */ }
                                    if (dbg()) console.log('[TTS-Guard] 🧟 Zombie recovery succeeded on foreground return');
                                    return;
                                } catch (e) {
                                    console.warn('[TTS-Guard] 🧟 Zombie blob recovery failed, falling through to full reload:', e.message);
                                    // fall through to normal recovery paths below
                                }
                            }
                        } else {
                            // 정상 재생 중 — 스킵
                            reader._wasPlayingBeforeInterruption = false;
                            return;
                        }
                    }
                    if (reader.isPaused || reader.isStopped) return;

                    // Keepalive AudioContext resume (iOS suspend 대응)
                    if (reader._keepaliveCtx && reader._keepaliveCtx.state === 'suspended') {
                        reader._keepaliveCtx.resume().catch(() => {});
                    }

                    // Fast path: readyState가 충분하면 직접 play()
                    if (activeAudio.readyState >= 2) {
                        try {
                            await activeAudio.play();
                            reader._wasPlayingBeforeInterruption = false;
                            try {
                                if (navigator.mediaSession) {
                                    navigator.mediaSession.playbackState = 'playing';
                                }
                            } catch (e) { /* ignore */ }
                            if (dbg()) console.log('[TTS-Guard] Fast resume succeeded (active element)');
                            return;
                        } catch (e) {
                            if (dbg()) console.warn('[TTS-Guard] Fast resume failed:', e.message);
                        }
                    }

                    // Recovery path: Blob URL 무효화 시 _currentAudioBlob에서 URL 재생성
                    if (reader._currentAudioBlob) {
                        try {
                            const newUrl = URL.createObjectURL(reader._currentAudioBlob);
                            activeAudio.src = newUrl;
                            activeAudio.playbackRate = reader.playbackRate;
                            window._ttsSetAudioUrl(newUrl);
                            await activeAudio.play();
                            reader._wasPlayingBeforeInterruption = false;
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
                        await window.speakNoteWithServerCache(reader.currentIndex);
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
                        ${page ? `노트: [${index + 1}/${reader.pages.length}] ${window._ttsEscapeHtml(page.file.name)}` : ''}
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
                const msAudio = window._ttsGetActiveAudio();
                // Fast path: 현재 blob이 로드된 상태면 즉시 play()
                if (msAudio && msAudio.src && !msAudio.error && msAudio.readyState >= 2) {
                    await msAudio.play();
                    if (window.audioStateMachine) window.audioStateMachine.transitionTo('PLAYING', { source: 'mediasession_play_fast' });
                    navigator.mediaSession.playbackState = 'playing';
                    return;
                }
                // 현재 blob이 메모리에 있으면 src 재설정 후 즉시 play()
                if (reader._currentAudioBlob) {
                    const url = URL.createObjectURL(reader._currentAudioBlob);
                    msAudio.src = url;
                    msAudio.playbackRate = reader.playbackRate;
                    await msAudio.play();
                    window._ttsSetAudioUrl(url);
                    if (window.audioStateMachine) window.audioStateMachine.transitionTo('PLAYING', { source: 'mediasession_play_blob' });
                    navigator.mediaSession.playbackState = 'playing';
                    return;
                }
                // Slow path: blob 없으면 캐시에서 로드
                await window.speakNoteWithServerCache(reader.currentIndex);
            } catch (error) {
                console.error('❌ Media Session play error:', error);
                try { await window.speakNoteWithServerCache(reader.currentIndex); } catch (e) { console.debug('[MediaSession] fallback play failed:', e.message); }
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            try {
                const msAudio = window._ttsGetActiveAudio();
                if (msAudio) {
                    msAudio.pause();
                    if (window.audioStateMachine) window.audioStateMachine.transitionTo('PAUSED', { source: 'mediasession_pause' });
                    navigator.mediaSession.playbackState = 'paused';
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
                const prefetched = reader._prefetchedNext;

                // Fast path: prefetch blob 있으면 사용자 제스처 만료 전에 즉시 play()
                if (prefetched && prefetched.index === nextIdx && prefetched.blob) {
                    const nextPage = reader.pages[nextIdx];
                    const nextBlob = prefetched.blob;
                    const nextCacheKey = prefetched.cacheKey;
                    reader._prefetchedNext = null;
                    reader._nextTrackPrepared = false;

                    const nextUrl = URL.createObjectURL(nextBlob);
                    const activeAudio = window._ttsGetActiveAudio();
                    activeAudio.src = nextUrl;
                    activeAudio.playbackRate = reader.playbackRate;

                    // 사용자 제스처 컨텍스트 내에서 즉시 play() + 좀비 검증
                    await verifiedPlay(activeAudio, { cacheKey: nextCacheKey });

                    // play() 성공 후 상태 업데이트
                    reader._currentAudioBlob = nextBlob;
                    window._ttsSetAudioUrl(nextUrl);
                    reader.currentIndex = nextIdx;
                    reader.lastPlayedIndex = nextIdx;
                    if (window.audioStateMachine) window.audioStateMachine.transitionTo('PLAYING', { source: 'mediasession_nexttrack' });
                    navigator.mediaSession.playbackState = 'playing';

                    updateNoteHighlight(reader, nextIdx);
                    setupMediaSession(reader, nextPage, nextIdx);
                    setupAudioHandlers(reader, nextUrl, nextCacheKey, nextIdx, nextPage);

                    localStorage.setItem('azureTTS_lastPlayedIndex', nextIdx.toString());
                    localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
                    localStorage.setItem('azureTTS_lastPlayedTitle', nextPage.file.name);

                    window.dispatchEvent(new CustomEvent('tts-position-changed', {
                        detail: { index: nextIdx, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
                    }));

                    if (window.playbackPositionManager?.savePosition) {
                        window.playbackPositionManager.savePosition(
                            nextIdx, nextPage.file.path, nextPage.file.name
                        ).catch(e => console.warn('⚠️ Position save failed:', e));
                    }

                    prefetchNextTrack(reader, window.serverCacheManager, nextIdx);
                    window.ttsLog?.(`⚡ [MediaSession] Fast-path nexttrack: [${nextIdx + 1}] ${window._ttsEscapeHtml(nextPage.file.name)}`);
                    return;
                }

                // Slow path: prefetch 없으면 메타데이터만 업데이트 (▶️로 재생 유도)
                const nextPage = reader.pages[nextIdx];
                if (nextPage) {
                    reader.currentIndex = nextIdx;
                    reader.lastPlayedIndex = nextIdx;
                    setupMediaSession(reader, nextPage, nextIdx);
                    navigator.mediaSession.playbackState = 'paused';
                    // prefetch 시도 (다음 ▶️ 탭 대비)
                    prefetchNextTrack(reader, window.serverCacheManager, nextIdx > 0 ? nextIdx - 1 : 0);
                    window.ttsLog?.(`⏭️ [MediaSession] nexttrack: prefetch 없음 → 메타데이터만 [${nextIdx + 1}] ${window._ttsEscapeHtml(nextPage.file.name)}`);
                }
            } catch (error) {
                console.error('❌ Media Session nexttrack error:', error);
                // 에러 발생해도 플레이어 상태 유지 — 크래시 방지
                navigator.mediaSession.playbackState = 'paused';
            }
        });

    }

    // onended + onerror 핸들러 등록 (Phase 1: 활성 오디오 엘리먼트 기준)
    function setupAudioHandlers(reader, audioUrl, cacheKey, index, page) {
        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));

        // Phase 1: 활성 오디오 엘리먼트에 핸들러 등록
        const activeAudio = window._ttsGetActiveAudio();
        activeAudio.onended = async function() {
            URL.revokeObjectURL(audioUrl);
            reader._currentAudioBlob = null;
            window._ttsSetAudioUrl(null);
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
            // ⚠️ 백그라운드에서는 메모리 Blob이 iOS에 의해 무효화될 수 있으므로 스킵
            //    → 인라인 경로에서 IndexedDB 직접 읽기 (신선한 Blob 보장)
            const nextIndex = (index + 1 >= reader.pages.length) ? 0 : index + 1;
            const isBackground = document.visibilityState === 'hidden';
            const prefetched = reader._prefetchedNext;
            if (!isBackground && prefetched && prefetched.index === nextIndex && prefetched.blob) {
                const nextPage = reader.pages[nextIndex];
                const nextBlob = prefetched.blob;
                const nextCacheKey = prefetched.cacheKey;
                reader._prefetchedNext = null;

                // 즉시 재생 (sync 경로, async 0) - Phase 1: 활성 오디오 엘리먼트 사용
                const nextUrl = URL.createObjectURL(nextBlob);
                reader._currentAudioBlob = nextBlob;
                window._ttsSetAudioUrl(nextUrl);
                reader.currentIndex = nextIndex;
                reader.lastPlayedIndex = nextIndex;
                const onendedAudio = window._ttsGetActiveAudio();
                onendedAudio.src = nextUrl;
                onendedAudio.playbackRate = reader.playbackRate;

                try {
                    await verifiedPlay(onendedAudio, { cacheKey: nextCacheKey });

                    // 재생 성공 후 UI/상태 업데이트 (비동기 후처리)
                    updateNoteHighlight(reader, nextIndex);
                    setupMediaSession(reader, nextPage, nextIndex);
                    setupAudioHandlers(reader, nextUrl, nextCacheKey, nextIndex, nextPage);

                    localStorage.setItem('azureTTS_lastPlayedIndex', nextIndex.toString());
                    localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
                    localStorage.setItem('azureTTS_lastPlayedTitle', nextPage.file.name);

                    window.dispatchEvent(new CustomEvent('tts-position-changed', {
                        detail: { index: nextIndex, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
                    }));

                    if (lastPlayedDiv) {
                        lastPlayedDiv.innerHTML = `
                            ▶️ 재생 중: <strong>[${nextIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(nextPage.file.name)}
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

                    window.ttsLog?.(`⚡ [FastPlay] iOS fast-play 성공: [${nextIndex + 1}] ${window._ttsEscapeHtml(nextPage.file.name)}`);
                    return;
                } catch (e) {
                    // fast-play 실패 시 기존 경로로 폴백
                    console.warn('[FastPlay] iOS fast-play 실패, 기존 경로로 폴백:', e.message);
                    URL.revokeObjectURL(nextUrl);
                    reader._currentAudioBlob = null;
                    window._ttsSetAudioUrl(null);
                }
            }

            // === iOS 백그라운드 안전 경로 ===
            // speakNoteWithServerCache는 cleanupAudioElement로 양쪽 pause() 후 async 작업 →
            // iOS가 오디오 세션 suspend → play() 실패. 대신 같은 엘리먼트에서 직접 해결.
            const bgNextIndex = (index + 1 >= reader.pages.length) ? 0 : index + 1;
            const bgNextPage = reader.pages[bgNextIndex];
            if (!bgNextPage) {
                window.speakNoteWithServerCache(bgNextIndex);
                return;
            }

            reader.currentIndex = bgNextIndex;
            reader.lastPlayedIndex = bgNextIndex;

            try {
                // 인라인 캐시 해결 (pause 없이, 같은 엘리먼트 유지)
                const bgCacheManager = window.serverCacheManager;
                const bgContent = bgCacheManager.getNoteContent(bgNextPage);
                const bgCacheKey = await bgCacheManager.generateCacheKey(bgNextPage.file.path, bgContent);

                let bgBlob = null;
                // 1단계: 오프라인 캐시 (IndexedDB, 빠름)
                try { bgBlob = await window.offlineCacheManager.getAudio(bgCacheKey); } catch(e) {}
                // 2단계: 서버 캐시
                if (!bgBlob) {
                    try {
                        const sc = await bgCacheManager.getCachedAudioFromServer(bgCacheKey);
                        if (sc?.audioBlob) {
                            bgBlob = sc.audioBlob;
                            try { await window.offlineCacheManager.saveAudio(bgCacheKey, bgBlob, bgNextPage.file.path); } catch(e) {}
                        }
                    } catch(e) {}
                }
                // 3단계: TTS 생성
                if (!bgBlob) {
                    bgBlob = await window.callAzureTTS(bgContent);
                    if (bgBlob) {
                        try { await bgCacheManager.saveAudioToServer(bgCacheKey, bgBlob); } catch(e) {}
                        try { await window.offlineCacheManager.saveAudio(bgCacheKey, bgBlob, bgNextPage.file.path); } catch(e) {}
                    }
                }

                if (!bgBlob || bgBlob.size < 100) throw new Error('Empty audio');

                // 같은 엘리먼트에서 즉시 재생 (pause 없음 → iOS 세션 유지)
                const bgUrl = URL.createObjectURL(bgBlob);
                reader._currentAudioBlob = bgBlob;
                window._ttsSetAudioUrl(bgUrl);
                const bgAudio = window._ttsGetActiveAudio();
                bgAudio.src = bgUrl;
                bgAudio.playbackRate = reader.playbackRate;
                await verifiedPlay(bgAudio, { cacheKey: bgCacheKey });

                // 성공: 핸들러 재등록 + prefetch
                updateNoteHighlight(reader, bgNextIndex);
                setupMediaSession(reader, bgNextPage, bgNextIndex);
                setupAudioHandlers(reader, bgUrl, bgCacheKey, bgNextIndex, bgNextPage);
                localStorage.setItem('azureTTS_lastPlayedIndex', bgNextIndex.toString());
                localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
                localStorage.setItem('azureTTS_lastPlayedTitle', bgNextPage.file.name);
                window.dispatchEvent(new CustomEvent('tts-position-changed', {
                    detail: { index: bgNextIndex, noteTitle: bgNextPage.file.name, notePath: bgNextPage.file.path }
                }));
                if (lastPlayedDiv) {
                    lastPlayedDiv.innerHTML = `▶️ 재생 중: <strong>[${bgNextIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(bgNextPage.file.name)}`;
                }
                reader.isLoading = false;
                updateToggleButtonState(true);
                if (window.playbackPositionManager?.savePosition) {
                    window.playbackPositionManager.savePosition(bgNextIndex, bgNextPage.file.path, bgNextPage.file.name).catch(() => {});
                }
                prefetchNextTrack(reader, bgCacheManager, bgNextIndex);
                window.ttsLog?.(`📱 [onended-inline] 백그라운드 안전 전환: [${bgNextIndex + 1}] ${window._ttsEscapeHtml(bgNextPage.file.name)}`);
            } catch (bgError) {
                // speakNoteWithServerCache는 cleanupAudioElement로 양쪽 pause() → iOS 세션 사망
                // 대신 상태만 정리하고 포그라운드 복귀 시 복구에 맡김
                console.error('[onended-inline] 인라인 전환 실패 (세션 보호 위해 fallback 호출 안 함):', bgError.message);
                reader.isLoading = false;
                reader._wasPlayingBeforeInterruption = true;
                reader._lastInterruptionTime = Date.now();
            }
        };

        activeAudio.onerror = async function(e) {
            // 버그4 수정: 정지 상태에서는 에러 처리 스킵
            if (reader.isStopped) return;
            console.error('❌ 오디오 재생 오류:', e);
            const errAudio = window._ttsGetActiveAudio();
            const errorType = errAudio.error?.code;

            // SRC_NOT_SUPPORTED (코드 4): prefetch blob 손상 — prefetch 버리고 서버에서 재요청
            if (errorType === 4) {
                console.warn('⚠️ SRC_NOT_SUPPORTED 감지, prefetch 폐기 후 서버 재요청');
                reader._prefetchedNext = null;
                if (reader._currentAudioUrl) {
                    URL.revokeObjectURL(reader._currentAudioUrl);
                }
                reader._currentAudioBlob = null;
                window._ttsSetAudioUrl(null);
                reader.isLoading = false;
                window.speakNoteWithServerCache(index);
                return;
            }

            // 네트워크/디코드 에러 (코드 2, 3): 오프라인 캐시로 재시도
            if (errorType === 2 || errorType === 3) {
                console.warn('⚠️ 네트워크/디코드 에러 감지, 오프라인 캐시 재시도');
                try {
                    const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
                    if (offlineAudio) {
                        window.ttsLog('✅ 오프라인 캐시에서 복구 성공');
                        if (reader._currentAudioUrl) {
                            URL.revokeObjectURL(reader._currentAudioUrl);
                        }
                        const recoveryUrl = URL.createObjectURL(offlineAudio);
                        reader._currentAudioBlob = offlineAudio;
                        window._ttsSetAudioUrl(recoveryUrl);
                        errAudio.src = recoveryUrl;
                        await errAudio.play();

                        if (lastPlayedDiv) {
                            lastPlayedDiv.innerHTML = `
                                ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
                                <br><small style="opacity: 0.9;">💾 오프라인 캐시 (네트워크 복구)</small>
                            `;
                        }
                        return;
                    }
                } catch (retryError) {
                    console.error('❌ 오프라인 캐시 재시도 실패:', retryError);
                }
            }

            // 복구 실패 시 에러 표시
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
                window.ttsLog?.(`⚡ [Prefetch] 다음 트랙 준비 완료: [${nextIdx + 1}] ${window._ttsEscapeHtml(nextPage.file.name)} (${nextBlob.size} bytes)`);
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

        // 기존 재생 중인 오디오 모두 정지 (돌림노래 방지)
        // 버그5 수정: paused 여부와 무관하게 항상 핸들러 해제
        cleanupAudioElement(reader.audioElement);
        cleanupAudioElement(reader.audioElementB);

        // 버그2 수정: 재진입 방지 가드
        const callId = (reader._speakCallId = (reader._speakCallId || 0) + 1);

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
            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
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
        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                🔄 캐시 확인 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
            `;
        }

        try {
            // 3단계 캐시 해결 (modules/audio-cache-resolver.js)
            const { audioBlob, fromCache, cacheSource, cacheKey } = await window.resolveAudioCache({
                cacheManager, reader, page, index
            });

            // 버그2 수정: await 복귀 후 최신 호출인지 확인
            if (callId !== reader._speakCallId) {
                window.ttsLog?.(`⏭️ [speakNote] 호출 #${callId} 취소 (최신: #${reader._speakCallId})`);
                return;
            }

            // Phase 1: 활성 오디오 엘리먼트 사용
            const activeAudio = window._ttsGetActiveAudio();
            const audioUrl = URL.createObjectURL(audioBlob);
            reader._currentAudioBlob = audioBlob;
            window._ttsSetAudioUrl(audioUrl);
            activeAudio.src = audioUrl;
            activeAudio.playbackRate = reader.playbackRate;

            setupMediaSession(reader, page, index);

            setupAudioHandlers(reader, audioUrl, cacheKey, index, page);

            // UI 즉시 업데이트 (play() 전 — Next/Prev 버튼 반응성 개선)
            const lastPlayedDivEarly = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDivEarly) {
                const cacheIconEarly = fromCache ? '💾' : '🎙️';
                lastPlayedDivEarly.innerHTML = `
                    🔄 재생 준비: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
                    <br><small style="opacity: 0.9;">${cacheIconEarly} ${cacheSource}</small>
                `;
            }
            updateToggleButtonState(true);

            // TTS 직접 재생 (종소리 제거 — 백그라운드 연속재생 보장) + 좀비 검증
            try {
                await verifiedPlay(activeAudio, { cacheKey });
            } catch (playError) {
                handlePlayError(playError, reader, lastPlayedDiv, index);
                throw playError;
            }
            reader.isLoading = false;

            // R3: 토글 버튼 상태 업데이트 (재생 중)
            const toggleBtn = (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
            if (toggleBtn) {
                toggleBtn.textContent = '⏸️ 일시정지';
                toggleBtn.style.background = '#FF9800';
            }

            // 재생 중 상태 표시
            if (lastPlayedDiv) {
                const cacheIcon = fromCache ? '💾' : '🎙️';
                lastPlayedDiv.innerHTML = `
                    ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
                    <br><small style="opacity: 0.9;">${cacheIcon} ${cacheSource}</small>
                `;
            }

            // R1: 서버에 위치 저장 (재생 시작 후 실행 — iOS에서 오디오 활성 상태일 때 네트워크 접근 안정)
            if (window.playbackPositionManager?.savePosition) {
                window.ttsLog?.(`📤 [tts-engine] savePosition 호출: index=${index}, note="${window._ttsEscapeHtml(page.file.name)}"`);
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
                    <br>${window._ttsEscapeHtml(mainMsg)}
                    <br>엔드포인트: <span style="word-break:break-all;">${window._ttsEscapeHtml(reader.apiEndpoint || '?')}</span>
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
            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
            }
            return;
        }

        // 일시정지 상태에서 재개
        const playResumeAudio = window._ttsGetActiveAudio();
        if (reader.isPaused && playResumeAudio.src) {
            if (playResumeAudio.readyState >= 2) {
                try {
                    await playResumeAudio.play();
                    // 상태 머신 PLAYING 전이 (syncReaderFlags가 isPaused=false, isPlaying=true 자동 설정)
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
            playResumeAudio.src = '';
        }

        // 상태 머신 LOADING 전이 (syncReaderFlags가 isStopped=false, isPaused=false 자동 설정)
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('LOADING', { source: 'play_start' });
        } else {
            reader.isStopped = false;
            reader.isPaused = false;
        }

        // Phase 1: Silent Keepalive 시작 (iOS 백그라운드 오디오 세션 유지)
        window._ttsStartKeepalive();

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

            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv) {
                const lastNote = reader.pages[syncedIndex];
                lastPlayedDiv.innerHTML = `
                    🔄 마지막 재생 복원: <strong>[${syncedIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(lastNote.file.name)}
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
        const activeAudio = window._ttsGetActiveAudio();
        if (activeAudio.src && !activeAudio.paused) {
            activeAudio.pause();
            // 상태 머신 PAUSED 전이 (syncReaderFlags가 isPaused=true, isPlaying=false 자동 설정)
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PAUSED', {
                    source: 'user_action'
                });
            } else {
                reader.isPaused = true;
                reader.isPlaying = false;
            }

            // R3: 토글 버튼 상태 업데이트
            const toggleBtn = (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
            if (toggleBtn) {
                toggleBtn.textContent = '▶️ 재생';
                toggleBtn.style.background = '#4CAF50';
            }

            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                const currentNote = reader.pages[reader.currentIndex];
                lastPlayedDiv.innerHTML = `
                    ⏸️ 일시정지: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(currentNote.file.name)}
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
            const toggleAudio = window._ttsGetActiveAudio();
            if (toggleAudio.src && toggleAudio.readyState >= 2) {
                try {
                    await toggleAudio.play();
                    // 상태 머신 PLAYING 전이 (syncReaderFlags가 isPaused=false, isPlaying=true 자동 설정)
                    if (window.audioStateMachine) {
                        window.audioStateMachine.transitionTo('PLAYING', {
                            source: 'toggle_resume'
                        });
                    }

                    window.ttsLog('▶️ 재생 재개');

                    const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
                    if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                        const currentNote = reader.pages[reader.currentIndex];
                        lastPlayedDiv.innerHTML = `
                            ▶️ 재생 중: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(currentNote.file.name)}
                        `;
                    }

                    updateToggleButtonState(true);
                    return;
                } catch (error) {
                    console.error('❌ 재생 재개 실패:', error);
                }
            }
            // 오디오가 없으면 새로 재생 → LOADING 상태로 전이
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('LOADING', { source: 'toggle_new_play' });
            } else {
                reader.isPaused = false;
            }
        }

        // 재생 중이면 일시정지
        const toggleActiveAudio = window._ttsGetActiveAudio();
        if (!toggleActiveAudio.paused && !reader.isStopped) {
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
        const toggleBtn = window._ttsToggleBtn || (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
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

        // 🔥 상태를 pause() 호출 전에 먼저 설정 (pause 이벤트 핸들러 race condition 방지)
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('STOPPED', { source: 'user_stop' });
        } else {
            reader.isStopped = true;
            reader.isPaused = false;
            reader.isPlaying = false;
        }
        reader._wasPlayingBeforeInterruption = false;
        reader._prefetchedNext = null;

        reader.audioElement.pause();
        reader.audioElement.src = '';
        // Phase 1: 두 번째 오디오 엘리먼트도 정리
        if (reader.audioElementB) {
            reader.audioElementB.pause();
            reader.audioElementB.src = '';
        }
        reader._activeAudioIdx = 'A'; // A로 리셋
        reader._currentAudioBlob = null;
        window._ttsSetAudioUrl(null);

        // Phase 1: Silent Keepalive 종료
        window._ttsStopKeepalive();

        // Bell AudioContext 정리 (리소스 해제)
        if (window._ttsBellAudioContext) {
            try { window._ttsBellAudioContext.close(); } catch (e) {}
            window._ttsBellAudioContext = null;
        }

        // Watchdog 중지 (정지 후 자동 재개 방지)
        if (window.audioWatchdog) {
            window.audioWatchdog.stop();
        }

        // R3: 토글 버튼 상태 업데이트
        const toggleBtn = (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
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

        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
        if (lastPlayedDiv) {
            if (reader.lastPlayedIndex >= 0 && reader.lastPlayedIndex < reader.pages.length) {
                const lastNote = reader.pages[reader.lastPlayedIndex];
                lastPlayedDiv.innerHTML = `
                    💾 마지막 재생: <strong>[${reader.lastPlayedIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(lastNote.file.name)}
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

    // Next/Previous에서 즉시 UI 업데이트 헬퍼
    function immediateUIUpdate(reader, index) {
        const page = reader.pages[index];
        if (!page) return;
        const lastPlayedDiv = window._ttsLastPlayedDiv || (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}`;
        }
        updateToggleButtonState(true);
    }

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;
        if (!reader.pages || reader.pages.length === 0) return;

        const nextIndex = reader.currentIndex + 1 >= reader.pages.length ? 0 : reader.currentIndex + 1;
        // 버그1 수정: src='' 제거, 양쪽 엘리먼트 핸들러 해제 후 pause
        cleanupAudioElement(reader.audioElement);
        cleanupAudioElement(reader.audioElementB);

        immediateUIUpdate(reader, nextIndex);
        window.speakNoteWithServerCache(nextIndex);
    };

    window.azureTTSPrevious = function() {
        const reader = window.azureTTSReader;
        if (!reader.pages || reader.pages.length === 0) return;

        const prevIndex = reader.currentIndex - 1;
        if (prevIndex < 0) {
            alert('⚠️ 첫 번째 노트입니다.');
            return;
        }

        // 버그1 수정: src='' 제거, 양쪽 엘리먼트 핸들러 해제 후 pause
        cleanupAudioElement(reader.audioElement);
        cleanupAudioElement(reader.audioElementB);

        immediateUIUpdate(reader, prevIndex);
        window.speakNoteWithServerCache(prevIndex);
    };

    window.azureTTSSetRate = function(rate) {
        const reader = window.azureTTSReader;
        reader.playbackRate = parseFloat(rate);

        const activeAudio = window._ttsGetActiveAudio();
        if (activeAudio && activeAudio.src) {
            activeAudio.playbackRate = reader.playbackRate;
        }

        const rateDisplay = document.getElementById('rate-display');
        if (rateDisplay) {
            rateDisplay.textContent = `${rate}x`;
        }
    };

    window.azureTTSPlayFrom = function(index) {
        const reader = window.azureTTSReader;
        reader.currentIndex = index;
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('LOADING', { source: 'play_from', index });
        } else {
            reader.isStopped = false;
            reader.isPaused = false;
        }
        window.speakNoteWithServerCache(index);
    };

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
