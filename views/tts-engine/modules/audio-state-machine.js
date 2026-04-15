// ============================================
// audio-state-machine: 오디오 재생 상태 관리 통합 모듈
// StateMachine + InterruptDetector + RecoveryStrategy + Watchdog
// 의존성: tts-core (window.ttsLog, window.TTS_DEBUG)
// ============================================

if (!window.AudioPlaybackStateMachine) {

    // ============================================
    // R4: 오디오 재생 상태 머신 (7가지 상태)
    // ============================================
    window.AudioPlaybackStateMachine = class AudioPlaybackStateMachine {
        constructor() {
            this.state = 'IDLE'; // IDLE, LOADING, PLAYING, PAUSED, INTERRUPTED, ERROR, STOPPED
            this.stateHistory = [];
            this.recoveryAttempts = 0;
            this.maxRecoveryAttempts = 3;
            this.listeners = {};
        }

        transitionTo(newState, context = {}) {
            const oldState = this.state;
            this.state = newState;

            this.stateHistory.push({
                from: oldState,
                to: newState,
                timestamp: Date.now(),
                context
            });

            if (window.TTS_DEBUG) {
                console.log(`[StateMachine] ${oldState} -> ${newState}`, context);
            }

            // reader 플래그 자동 동기화
            this.syncReaderFlags(newState);

            // 상태별 로직 실행
            switch (newState) {
                case 'INTERRUPTED':
                    this.onInterrupted();
                    break;
                case 'ERROR':
                    this.onError();
                    break;
                case 'PLAYING':
                    this.recoveryAttempts = 0; // 성공 시 복구 카운트 리셋
                    break;
            }

            this.notifyListeners(newState, oldState, context);
        }

        /**
         * 상태 전이에 따라 reader 플래그를 자동 동기화합니다.
         * INTERRUPTED 상태는 복구를 위해 기존 플래그를 유지합니다.
         */
        syncReaderFlags(state) {
            const reader = window.azureTTSReader;
            if (!reader) return;

            switch (state) {
                case 'PLAYING':
                    reader.isPlaying = true;
                    reader.isPaused = false;
                    reader.isStopped = false;
                    break;
                case 'PAUSED':
                    reader.isPlaying = false;
                    reader.isPaused = true;
                    reader.isStopped = false;
                    break;
                case 'STOPPED':
                    reader.isPlaying = false;
                    reader.isPaused = false;
                    reader.isStopped = true;
                    break;
                case 'LOADING':
                case 'IDLE':
                    reader.isPlaying = false;
                    reader.isPaused = false;
                    reader.isStopped = false;
                    break;
                case 'ERROR':
                    reader.isPlaying = false;
                    reader.isPaused = false;
                    break;
                // INTERRUPTED: 기존 플래그 유지 (복구 시도 시 isPlaying=true 필요)
            }
        }

        onInterrupted() {
            if (this.recoveryAttempts < this.maxRecoveryAttempts) {
                setTimeout(() => {
                    if (this.state === 'INTERRUPTED') {
                        this.attemptRecovery();
                    }
                }, 500);
            } else {
                this.transitionTo('ERROR', { reason: 'max_recovery_attempts_exceeded' });
            }
        }

        onError() {
            console.error('[StateMachine] Entered ERROR state');
        }

        attemptRecovery() {
            this.recoveryAttempts++;
            if (window.TTS_DEBUG) {
                console.log(`[StateMachine] Recovery attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts}`);
            }

            const event = new CustomEvent('audioRecoveryRequested', {
                detail: { attempt: this.recoveryAttempts }
            });
            document.dispatchEvent(event);
        }

        on(state, callback) {
            if (!this.listeners[state]) {
                this.listeners[state] = [];
            }
            this.listeners[state].push(callback);
        }

        notifyListeners(newState, oldState, context) {
            if (this.listeners[newState]) {
                this.listeners[newState].forEach(callback => {
                    callback(newState, oldState, context);
                });
            }
        }

        isUserPaused() {
            return window.azureTTSReader?.isPaused || false;
        }

        isStopped() {
            return window.azureTTSReader?.isStopped || false;
        }

        reset() {
            this.state = 'IDLE';
            this.recoveryAttempts = 0;
        }
    };

    // ============================================
    // R1: 오디오 인터럽트 감지기
    // ============================================
    window.AudioInterruptDetector = class AudioInterruptDetector {
        constructor(audioElement, stateMachine) {
            this.audioElement = audioElement;
            this.stateMachine = stateMachine;
            this.interruptionCount = 0;
            this.lastInterruptionTime = 0;
            this.abnormalTerminationDetected = false;
        }

        setupListeners() {
            // R1.1: pause 이벤트 - 비정상 중단 감지 (A+B 양쪽 등록)
            const detectAbnormalPause = (audioEl) => {
                audioEl.addEventListener('pause', () => {
                    // Dual Audio: 현재 활성 엘리먼트만 감지
                    if (window._ttsGetActiveAudio?.() !== audioEl) return;

                    const reader = window.azureTTSReader;

                    if (!this.stateMachine.isUserPaused() && !this.stateMachine.isStopped() &&
                        reader.isPlaying && !audioEl.ended) {
                        this.abnormalTerminationDetected = true;
                        this.interruptionCount++;
                        this.lastInterruptionTime = Date.now();

                        if (window.TTS_DEBUG) {
                            console.log('[InterruptDetector] Abnormal termination detected on', reader._activeAudioIdx, {
                                count: this.interruptionCount,
                                time: new Date(this.lastInterruptionTime).toLocaleTimeString()
                            });
                        }

                        this.stateMachine.transitionTo('INTERRUPTED', {
                            reason: 'pause_without_user_action',
                            abnormal: true
                        });
                    }
                });
            };
            detectAbnormalPause(this.audioElement);
            // audioElementB도 등록 (Dual Audio 전환 후 B 활성 시 감지)
            const audioB = window.azureTTSReader?.audioElementB;
            if (audioB) detectAbnormalPause(audioB);

            // R1.3: Media Session API interrupt 이벤트 (단일 등록)
            if ('mediaSession' in navigator) {
                try {
                    navigator.mediaSession.addEventListener('interrupt', (e) => {
                        this.handleMediaSessionInterrupt(e);
                    });
                    if (window.TTS_DEBUG) {
                        console.log('[InterruptDetector] Media Session API interrupt listener registered');
                    }
                } catch (err) {
                    console.warn('[InterruptDetector] Media Session API interrupt listener failed:', err);
                }
            }

            // R1.4: 헤드폰 연결/해제 감지
            if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
                try {
                    navigator.mediaDevices.addEventListener('devicechange', () => {
                        this.handleAudioOutputChange();
                    });
                    if (window.TTS_DEBUG) {
                        console.log('[InterruptDetector] Audio output change listener registered');
                    }
                } catch (err) {
                    console.warn('[InterruptDetector] Audio output change listener failed:', err);
                }
            }
        }

        handleMediaSessionInterrupt(event) {
            const reader = window.azureTTSReader;

            if (window.TTS_DEBUG) {
                console.log('[InterruptDetector] Media Session interrupt:', event);
            }

            this.interruptionCount++;
            this.lastInterruptionTime = Date.now();

            if (reader.isPlaying && !this.stateMachine.isUserPaused() && !this.stateMachine.isStopped()) {
                this.stateMachine.transitionTo('INTERRUPTED', {
                    reason: 'media_session_interrupt',
                    type: event.type
                });
            }
        }

        async handleAudioOutputChange() {
            const reader = window.azureTTSReader;

            if (window.TTS_DEBUG) {
                console.log('[InterruptDetector] Audio output changed');
            }

            if (reader.isPlaying && !this.stateMachine.isUserPaused() && !this.stateMachine.isStopped()) {
                await new Promise(resolve => setTimeout(resolve, 100));

                if (this.audioElement.paused && reader.isPlaying) {
                    this.stateMachine.transitionTo('INTERRUPTED', {
                        reason: 'audio_output_changed'
                    });
                }
            }
        }

        reset() {
            this.interruptionCount = 0;
            this.lastInterruptionTime = 0;
            this.abnormalTerminationDetected = false;
        }
    };

    // ============================================
    // R2, R3: 오디오 복구 전략 (다단계 복구 + 타임아웃)
    // ============================================
    window.AudioRecoveryStrategy = class AudioRecoveryStrategy {
        constructor(audioElement, stateMachine) {
            this._fallbackAudioElement = audioElement;
            this.stateMachine = stateMachine;
            this.timeout = 5000; // R2.4: 5초 타임아웃
            this.recoveryTimeoutId = null;
        }

        get audioElement() {
            return window._ttsGetActiveAudio?.() || this._fallbackAudioElement;
        }

        async attemptRecovery(context = {}) {
            const attemptNumber = context.attempt || 1;

            if (window.TTS_DEBUG) {
                console.log(`[Recovery] Attempt ${attemptNumber}/${this.stateMachine.maxRecoveryAttempts}`);
            }

            const timeoutPromise = new Promise((_, reject) => {
                this.recoveryTimeoutId = setTimeout(() => {
                    reject(new Error('Recovery timeout'));
                }, this.timeout);
            });

            try {
                const result = await Promise.race([
                    this.performRecovery(attemptNumber),
                    timeoutPromise
                ]);

                clearTimeout(this.recoveryTimeoutId);

                if (result.success) {
                    this.stateMachine.transitionTo('PLAYING', {
                        recovered: true,
                        method: result.method
                    });
                    return result;
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                clearTimeout(this.recoveryTimeoutId);

                if (window.TTS_DEBUG) {
                    console.warn('[Recovery] Failed:', error.message);
                }

                if (attemptNumber >= this.stateMachine.maxRecoveryAttempts) {
                    this.stateMachine.transitionTo('ERROR', {
                        reason: 'all_recovery_methods_failed',
                        lastError: error.message
                    });
                    this.showUserFeedback('PERMANENT_ERROR', error.message);
                }

                throw error;
            }
        }

        async performRecovery(attemptNumber) {
            const reader = window.azureTTSReader;

            // 통합 복구: speakNoteWithServerCache가 cleanup → cache → verifiedPlay 전체 처리
            // 기존 3단계(fast → blob → reload) 대신 단일 경로로 통합
            if (window.speakNoteWithServerCache) {
                try {
                    await window.speakNoteWithServerCache(reader.currentIndex);
                    return { success: true, method: 'speakNoteWithServerCache' };
                } catch (e) {
                    if (window.TTS_DEBUG) {
                        console.error('[Recovery] speakNoteWithServerCache failed:', e.message);
                    }
                    this.logPlayError(e);
                    return { success: false, error: e.message };
                }
            }

            return { success: false, error: 'No recovery method available' };
        }

        logPlayError(error) {
            const errorInfo = {
                name: error.name,
                message: error.message,
                timestamp: new Date().toISOString()
            };

            if (window.TTS_DEBUG) {
                console.error('[Recovery] Play error details:', errorInfo);
            }

            if (error.name === 'NotAllowedError') {
                this.showUserFeedback('AUTOPLAY_BLOCKED');
            } else if (error.name === 'AbortError' || error.message.includes('network')) {
                this.showUserFeedback('NETWORK_ERROR');
            }
        }

        showUserFeedback(errorType, detail = '') {
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (!lastPlayedDiv) return;

            const ERROR_MESSAGES = {
                INTERRUPT_RECOVERABLE: '재생이 일시 중단되었습니다. 자동으로 다시 재생합니다...',
                INTERRUPT_NEEDS_USER: '재생이 중단되었습니다. 재생 버튼을 눌러주세요.',
                NETWORK_ERROR: '네트워크 오류가 발생했습니다. 오프라인 캐시에서 복구 시도 중...',
                PERMANENT_ERROR: '재생을 재개할 수 없습니다. Obsidian을 재기동하거나 재생 버튼을 다시 눌러주세요.',
                AUTOPLAY_BLOCKED: '자동 재생이 차단되었습니다. 화면을 터치해주세요.'
            };

            const message = ERROR_MESSAGES[errorType] || detail;

            lastPlayedDiv.innerHTML = `
                <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; margin-top: 8px;">
                    ${message}
                </div>
            `;
        }

        clearTimeout() {
            if (this.recoveryTimeoutId) {
                window.clearTimeout(this.recoveryTimeoutId);
                this.recoveryTimeoutId = null;
            }
        }
    };

    // ============================================
    // R5: 통합 Watchdog (유일한 Watchdog 인스턴스)
    // ============================================
    window.AudioPlaybackWatchdog = class AudioPlaybackWatchdog {
        constructor(audioElement, stateMachine) {
            this._fallbackAudioElement = audioElement;
            this.stateMachine = stateMachine;
            this.checkInterval = 10000; // 10초
            this.mismatchGracePeriod = 5000; // 5초 유예
            this.mismatchDetectedAt = 0;
            this.timerId = null;
            // 좀비 감지: paused=false인데 currentTime 안 변하는 상태
            this._lastCurrentTime = -1;
            this._zombieDetectedAt = 0;
        }

        get audioElement() {
            return window._ttsGetActiveAudio?.() || this._fallbackAudioElement;
        }

        start() {
            if (this.timerId) {
                clearInterval(this.timerId);
            }

            this.timerId = setInterval(() => {
                this.checkStateConsistency();
            }, this.checkInterval);

            if (window.TTS_DEBUG) {
                console.log('[Watchdog] Started');
            }
        }

        stop() {
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
        }

        checkStateConsistency() {
            const reader = window.azureTTSReader;
            if (!reader) return;

            // 사용자가 정지/일시정지한 경우 복구 시도 안 함
            if (reader.isStopped || reader.isPaused) return;

            const isStatePlaying = this.stateMachine.state === 'PLAYING' || reader.isPlaying;
            const isActuallyPaused = this.audioElement.paused;
            const hasSource = !!this.audioElement.src;
            const isReady = this.audioElement.readyState >= 2;

            if (isStatePlaying && isActuallyPaused && hasSource && isReady) {
                // Case 1: 상태 불일치 — 재생 중이어야 하는데 paused
                const now = Date.now();

                if (this.mismatchDetectedAt === 0) {
                    this.mismatchDetectedAt = now;
                    this.logDiagnostics();

                    if (window.TTS_DEBUG) {
                        console.log('[Watchdog] State mismatch detected, grace period started');
                    }
                } else if (now - this.mismatchDetectedAt > this.mismatchGracePeriod) {
                    if (window.TTS_DEBUG) {
                        console.log('[Watchdog] Mismatch persisted, attempting recovery');
                    }

                    this.mismatchDetectedAt = 0;
                    this.attemptWatchdogRecovery();
                }
            } else {
                this.mismatchDetectedAt = 0;
            }

            // Case 2: 좀비 감지 — paused=false인데 currentTime 정지
            // iOS 백그라운드에서 play() 성공했지만 오디오 파이프라인 suspend된 상태
            if (isStatePlaying && !isActuallyPaused && hasSource) {
                const currentTime = this.audioElement.currentTime;
                const now = Date.now();

                if (this._lastCurrentTime >= 0 && currentTime === this._lastCurrentTime) {
                    // currentTime이 변하지 않음
                    if (this._zombieDetectedAt === 0) {
                        this._zombieDetectedAt = now;
                        console.warn('[Watchdog] 🧟 Zombie state detected: paused=false but currentTime stuck at', currentTime);
                    } else if (now - this._zombieDetectedAt > this.mismatchGracePeriod) {
                        console.warn('[Watchdog] 🧟 Zombie state persisted, attempting recovery');
                        this._zombieDetectedAt = 0;
                        this._lastCurrentTime = -1;
                        this.attemptZombieRecovery();
                    }
                } else {
                    // currentTime이 정상적으로 진행 중
                    this._zombieDetectedAt = 0;
                }
                this._lastCurrentTime = currentTime;
            } else {
                this._lastCurrentTime = -1;
                this._zombieDetectedAt = 0;
            }
        }

        logDiagnostics() {
            const diagnostics = {
                stateMachine: this.stateMachine.state,
                isPlaying: window.azureTTSReader?.isPlaying,
                audioPaused: this.audioElement.paused,
                readyState: this.audioElement.readyState,
                src: this.audioElement.src?.substring(0, 100) + '...',
                currentTime: this.audioElement.currentTime,
                duration: this.audioElement.duration,
                error: this.audioElement.error?.code,
                timestamp: new Date().toISOString()
            };

            console.warn('[Watchdog] State mismatch detected:', diagnostics);
        }

        // 통합 복구: paused 불일치 + 좀비 모두 speakNoteWithServerCache로 위임
        // speakNoteWithServerCache → cleanup → cache resolve → verifiedPlay (좀비 검증 포함)
        async attemptWatchdogRecovery() {
            const reader = window.azureTTSReader;
            if (!reader) return;

            const reason = this._lastCurrentTime >= 0 ? 'zombie' : 'paused-mismatch';
            console.warn(`[Watchdog] Recovery (${reason}): delegating to speakNoteWithServerCache`);

            try {
                await window.speakNoteWithServerCache(reader.currentIndex);
                console.log(`[Watchdog] Recovery (${reason}) succeeded`);
            } catch (e) {
                console.error(`[Watchdog] Recovery (${reason}) failed:`, e.message);
                this.stateMachine.transitionTo('ERROR', { reason: `watchdog_${reason}_failed` });
                this.showWatchdogError();
            }
        }

        // attemptZombieRecovery는 attemptWatchdogRecovery로 통합
        attemptZombieRecovery() {
            this.attemptWatchdogRecovery();
        }

        showWatchdogError() {
            const lastPlayedDiv = document.getElementById('last-played-info');
            if (!lastPlayedDiv) return;

            lastPlayedDiv.innerHTML = `
                <div class="tts-watchdog-error" style="padding: 12px; background: rgba(244,67,54,0.2); border-radius: 8px; margin-top: 8px;">
                    재생 상태 불일치가 감지되었습니다. 재생 버튼을 다시 눌러주세요.
                </div>
            `;
        }
    };

    window.ttsLog?.('✅ [tts-engine/audio-state-machine] 모듈 로드 완료');
}
