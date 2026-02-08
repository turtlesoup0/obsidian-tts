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
            // R1.1: pause 이벤트 - 비정상 중단 감지
            this.audioElement.addEventListener('pause', () => {
                const reader = window.azureTTSReader;

                if (!this.stateMachine.isUserPaused() && !this.stateMachine.isStopped() &&
                    reader.isPlaying && !this.audioElement.ended) {
                    this.abnormalTerminationDetected = true;
                    this.interruptionCount++;
                    this.lastInterruptionTime = Date.now();

                    if (window.TTS_DEBUG) {
                        console.log('[InterruptDetector] Abnormal termination detected', {
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
            this.audioElement = audioElement;
            this.stateMachine = stateMachine;
            this.timeout = 5000; // R2.4: 5초 타임아웃
            this.recoveryTimeoutId = null;
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

            // R2.2-1: Fast path
            if (this.audioElement.readyState >= 2 && !this.audioElement.error) {
                try {
                    await this.audioElement.play();
                    return { success: true, method: 'fast' };
                } catch (e) {
                    if (window.TTS_DEBUG) {
                        console.warn('[Recovery] Fast path failed:', e.message);
                    }
                    this.logPlayError(e);
                }
            }

            // R2.2-2: Blob URL 재생성
            if (reader._currentAudioBlob) {
                try {
                    const newUrl = URL.createObjectURL(reader._currentAudioBlob);
                    this.audioElement.src = newUrl;
                    this.audioElement.playbackRate = reader.playbackRate;
                    reader._currentAudioUrl = newUrl;
                    await this.audioElement.play();
                    return { success: true, method: 'blob-recovery' };
                } catch (e) {
                    if (window.TTS_DEBUG) {
                        console.warn('[Recovery] Blob recovery failed:', e.message);
                    }
                    this.logPlayError(e);
                }
            }

            // R2.2-3: Last resort - 캐시에서 재로드
            if (window.speakNoteWithServerCache) {
                try {
                    await window.speakNoteWithServerCache(reader.currentIndex);
                    return { success: true, method: 'full-reload' };
                } catch (e) {
                    if (window.TTS_DEBUG) {
                        console.error('[Recovery] Full reload failed:', e.message);
                    }
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
            this.audioElement = audioElement;
            this.stateMachine = stateMachine;
            this.checkInterval = 10000; // 10초
            this.mismatchGracePeriod = 5000; // 5초 유예
            this.mismatchDetectedAt = 0;
            this.timerId = null;
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

        async attemptWatchdogRecovery() {
            const reader = window.azureTTSReader;

            try {
                await this.audioElement.play();
                if (window.TTS_DEBUG) {
                    console.log('[Watchdog] Direct play() succeeded');
                }
            } catch (e) {
                if (window.TTS_DEBUG) {
                    console.warn('[Watchdog] Direct play() failed:', e.message);
                }

                if (reader._currentAudioBlob) {
                    try {
                        const newUrl = URL.createObjectURL(reader._currentAudioBlob);
                        this.audioElement.src = newUrl;
                        this.audioElement.playbackRate = reader.playbackRate;
                        reader._currentAudioUrl = newUrl;
                        await this.audioElement.play();

                        if (window.TTS_DEBUG) {
                            console.log('[Watchdog] Blob recovery succeeded');
                        }
                    } catch (e2) {
                        if (window.TTS_DEBUG) {
                            console.error('[Watchdog] Blob recovery failed:', e2.message);
                        }

                        reader.isPlaying = false;
                        this.showWatchdogError();
                    }
                }
            }
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
