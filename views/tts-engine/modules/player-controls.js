// ============================================
// player-controls: 재생 컨트롤 + UI 헬퍼
// Play, Pause, Toggle, Stop, Next, Prev, SetRate, PlayFrom
// handlePlayError, updateNoteHighlight, updateToggleButtonState, immediateUIUpdate
// 의존성: window._ttsGetActiveAudio, window._ttsSetAudioUrl, window._ttsEscapeHtml,
//         window._ttsStartKeepalive, window._ttsStopKeepalive,
//         window.cleanupAudioElement (playback-core.js),
//         window.speakNoteWithServerCache (playback-core.js),
//         window.audioStateMachine, window.audioWatchdog,
//         window.playbackPositionManager
// ============================================

if (!window._ttsPlayerControlsLoaded) {
    window._ttsPlayerControlsLoaded = true;

    // ============================================
    // UI 헬퍼 함수들
    // ============================================

    window._ttsHandlePlayError = function(error, reader, lastPlayedDiv, index) {
        const errorInfo = {
            name: error.name,
            message: error.message,
            timestamp: new Date().toISOString()
        };

        console.error('[PlayError] Play() rejected:', errorInfo);

        if (error.name === 'NotAllowedError') {
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; margin-top: 8px;">
                        \uD83D\uDD07 \uC790\uB3D9 \uC7AC\uC0DD\uC774 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD654\uBA74\uC744 \uD130\uCE58\uD558\uC5EC \uC7AC\uC0DD\uC744 \uC2DC\uC791\uD574\uC8FC\uC138\uC694.
                    </div>
                `;
            }
        } else if (error.name === 'AbortError' || error.message.includes('network')) {
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; margin-top: 8px;">
                        \uD83C\uDF10 \uB124\uD2B8\uC6CC\uD06C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC624\uD504\uB77C\uC778 \uCE90\uC2DC\uC5D0\uC11C \uBCF5\uAD6C\uB97C \uC2DC\uB3C4\uD569\uB2C8\uB2E4...
                    </div>
                `;
            }
        } else {
            if (lastPlayedDiv) {
                const page = reader.pages[index];
                lastPlayedDiv.innerHTML = `
                    <div class="tts-error-feedback" style="padding: 12px; background: rgba(244,67,54,0.2); border-radius: 8px; margin-top: 8px;">
                        \u274C \uC7AC\uC0DD \uC624\uB958: ${error.message}<br>
                        ${page ? `\uB178\uD2B8: [${index + 1}/${reader.pages.length}] ${window._ttsEscapeHtml(page.file.name)}` : ''}
                    </div>
                `;
            }
        }
    };

    window._ttsUpdateNoteHighlight = function(reader, index) {
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
    };

    window._ttsUpdateToggleButtonState = function(isPlaying) {
        const toggleBtn = window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn');
        if (toggleBtn) {
            if (isPlaying) {
                toggleBtn.textContent = '\u23F8\uFE0F \uC77C\uC2DC\uC815\uC9C0';
                toggleBtn.style.background = '#FF9800';
            } else {
                toggleBtn.textContent = '\u25B6\uFE0F \uC7AC\uC0DD';
                toggleBtn.style.background = '#4CAF50';
            }
        }
    };

    function immediateUIUpdate(reader, index) {
        const page = reader.pages[index];
        if (!page) return;
        const lastPlayedDiv = window._ttsLastPlayedDiv || document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `\u25B6\uFE0F \uC7AC\uC0DD \uC911: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}`;
        }
        window._ttsUpdateToggleButtonState(true);
    }

    // ============================================
    // 재생 컨트롤 함수들
    // ============================================

    window.azureTTSPlay = async function() {
        const reader = window.azureTTSReader;

        if (!reader.pages || reader.pages.length === 0) {
            console.error('\u274C \uC7AC\uC0DD\uD560 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '\u274C \uC7AC\uC0DD\uD560 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. Dataview \uCFFC\uB9AC\uB97C \uD655\uC778\uD558\uC138\uC694.';
            }
            return;
        }

        // 일시정지 상태에서 재개
        const playResumeAudio = window._ttsGetActiveAudio();
        if (reader.isPaused && playResumeAudio.src) {
            if (playResumeAudio.readyState >= 2) {
                try {
                    await playResumeAudio.play();
                    if (window.audioStateMachine) {
                        window.audioStateMachine.transitionTo('PLAYING', {
                            source: 'resume_from_pause'
                        });
                    }
                    window.ttsLog('\u25B6\uFE0F \uC7AC\uC0DD \uC7AC\uAC1C');
                    return;
                } catch (error) {
                    console.error('\u274C \uC7AC\uC0DD \uC7AC\uAC1C \uC2E4\uD328:', error);
                }
            }
            playResumeAudio.src = '';
        }

        // 상태 머신 LOADING 전이
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('LOADING', { source: 'play_start' });
        } else {
            reader.isStopped = false;
            reader.isPaused = false;
        }

        // Silent Keepalive 시작 (iOS 백그라운드 오디오 세션 유지)
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

        if (syncedIndex >= 0 && syncedIndex < reader.pages.length) {
            window.ttsLog(`\uD83D\uDD04 \uB9C8\uC9C0\uB9C9 \uC7AC\uC0DD: ${syncedIndex + 1}\uBC88 \uB178\uD2B8 - \uC790\uB3D9 \uC7AC\uC0DD\uD569\uB2C8\uB2E4`);
            reader.currentIndex = syncedIndex;

            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv) {
                const lastNote = reader.pages[syncedIndex];
                lastPlayedDiv.innerHTML = `
                    \uD83D\uDD04 \uB9C8\uC9C0\uB9C9 \uC7AC\uC0DD \uBCF5\uC6D0: <strong>[${syncedIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(lastNote.file.name)}
                    <br><small style="opacity: 0.9;">\uACC4\uC18D \uC7AC\uC0DD\uD569\uB2C8\uB2E4...</small>
                `;
            }
        } else {
            window.ttsLog(`\uD83C\uDFB5 \uCCAB \uC7AC\uC0DD: 1\uBC88 \uB178\uD2B8\uBD80\uD130 \uC2DC\uC791`);
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
            if (window.audioStateMachine) {
                window.audioStateMachine.transitionTo('PAUSED', {
                    source: 'user_action'
                });
            } else {
                reader.isPaused = true;
                reader.isPlaying = false;
            }

            const toggleBtn = (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
            if (toggleBtn) {
                toggleBtn.textContent = '\u25B6\uFE0F \uC7AC\uC0DD';
                toggleBtn.style.background = '#4CAF50';
            }

            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                const currentNote = reader.pages[reader.currentIndex];
                lastPlayedDiv.innerHTML = `
                    \u23F8\uFE0F \uC77C\uC2DC\uC815\uC9C0: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(currentNote.file.name)}
                `;
            }

            window.ttsLog('\u23F8\uFE0F \uC77C\uC2DC\uC815\uC9C0');
        }
    };

    window.azureTTSTogglePlayPause = async function() {
        const reader = window.azureTTSReader;

        if (reader.isLoading) {
            console.warn('\u26A0\uFE0F \uB85C\uB529 \uC911\uC785\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.');
            return;
        }

        // 일시정지 상태이면 재생 재개
        if (reader.isPaused) {
            const toggleAudio = window._ttsGetActiveAudio();
            if (toggleAudio.src && toggleAudio.readyState >= 2) {
                try {
                    await toggleAudio.play();
                    if (window.audioStateMachine) {
                        window.audioStateMachine.transitionTo('PLAYING', {
                            source: 'toggle_resume'
                        });
                    }
                    window.ttsLog('\u25B6\uFE0F \uC7AC\uC0DD \uC7AC\uAC1C');

                    const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
                    if (lastPlayedDiv && reader.currentIndex >= 0 && reader.currentIndex < reader.pages.length) {
                        const currentNote = reader.pages[reader.currentIndex];
                        lastPlayedDiv.innerHTML = `
                            \u25B6\uFE0F \uC7AC\uC0DD \uC911: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(currentNote.file.name)}
                        `;
                    }

                    window._ttsUpdateToggleButtonState(true);
                    return;
                } catch (error) {
                    console.error('\u274C \uC7AC\uC0DD \uC7AC\uAC1C \uC2E4\uD328:', error);
                }
            }
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
            window._ttsUpdateToggleButtonState(false);
            return;
        }

        // 정지 상태이면 새로 재생
        await window.azureTTSPlay();
        window._ttsUpdateToggleButtonState(true);
    };

    window.azureTTSStop = function() {
        const reader = window.azureTTSReader;

        // 상태를 pause() 호출 전에 먼저 설정 (pause 이벤트 핸들러 race condition 방지)
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
        if (reader.audioElementB) {
            reader.audioElementB.pause();
            reader.audioElementB.src = '';
        }
        reader._activeAudioIdx = 'A';
        reader._currentAudioBlob = null;
        window._ttsSetAudioUrl(null);

        // Silent Keepalive 종료
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

        const toggleBtn = (window._ttsToggleBtn || document.getElementById('tts-toggle-play-pause-btn'));
        if (toggleBtn) {
            toggleBtn.textContent = '\u25B6\uFE0F \uC7AC\uC0DD';
            toggleBtn.style.background = '#4CAF50';
        }

        // 모든 노트 행 강조 해제
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
                    \uD83D\uDCBE \uB9C8\uC9C0\uB9C9 \uC7AC\uC0DD: <strong>[${reader.lastPlayedIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(lastNote.file.name)}
                    <br><small style="opacity: 0.9;">\uB2E4\uC74C \uC7AC\uC0DD \uC2DC ${reader.lastPlayedIndex + 1}\uBC88\uBD80\uD130 \uC2DC\uC791\uB429\uB2C8\uB2E4</small>
                `;
            } else {
                lastPlayedDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        \u23F9\uFE0F <strong>\uC815\uC9C0\uB428</strong> - \uC704 \uBC84\uD2BC\uC744 \uD074\uB9AD\uD558\uC5EC \uC7AC\uC0DD\uD558\uC138\uC694
                    </div>
                `;
            }
        }

        window.ttsLog('\u23F9\uFE0F \uC7AC\uC0DD \uC911\uC9C0');
    };

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;
        if (!reader.pages || reader.pages.length === 0) return;

        const nextIndex = reader.currentIndex + 1 >= reader.pages.length ? 0 : reader.currentIndex + 1;
        window.cleanupAudioElement(reader.audioElement);
        window.cleanupAudioElement(reader.audioElementB);

        immediateUIUpdate(reader, nextIndex);
        window.speakNoteWithServerCache(nextIndex);
    };

    window.azureTTSPrevious = function() {
        const reader = window.azureTTSReader;
        if (!reader.pages || reader.pages.length === 0) return;

        const prevIndex = reader.currentIndex - 1;
        if (prevIndex < 0) {
            alert('\u26A0\uFE0F \uCCAB \uBC88\uC9F8 \uB178\uD2B8\uC785\uB2C8\uB2E4.');
            return;
        }

        window.cleanupAudioElement(reader.audioElement);
        window.cleanupAudioElement(reader.audioElementB);

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

    window.ttsLog?.('\u2705 [tts-engine/player-controls] \uBAA8\uB4C8 \uB85C\uB4DC \uC644\uB8CC');
}
