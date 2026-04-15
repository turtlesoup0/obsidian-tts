// ============================================
// playback-core: 핵심 재생 함수 모듈
// cleanupAudioElement, verifiedPlay, finalizeTransition, speakNoteWithServerCache
// 의존성: window._ttsGetActiveAudio, window._ttsSetAudioUrl, window._ttsSwapAudio,
//         window._ttsUpdateNoteHighlight, window._ttsUpdateToggleButtonState,
//         window.setupMediaSession, window.setupAudioHandlers (playback-handlers.js),
//         window.prefetchNextTrack (playback-handlers.js), window._ttsHandlePlayError,
//         window.resolveAudioCache, window.offlineCacheManager, window.serverCacheManager
// ============================================

if (!window._ttsPlaybackCoreLoaded) {
    window._ttsPlaybackCoreLoaded = true;

    // ============================================
    // cleanupAudioElement: 오디오 엘리먼트 정리 (onended/onerror 해제 + pause)
    // ============================================
    window.cleanupAudioElement = function(el) {
        if (!el) return;
        el.onended = null;
        el.onerror = null;
        if (!el.paused) el.pause();
    };

    // ============================================
    // verifiedPlay: play() 후 300ms 내 currentTime 진행 검증
    // 좀비(play() OK but no audio) 감지 시 IndexedDB에서 fresh blob 재로드
    // 모든 트랙 전환 경로의 play()를 이 함수로 통일
    // ============================================
    window.verifiedPlay = async function(audioEl, { cacheKey } = {}) {
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
        console.warn('[verifiedPlay] \uD83E\uDDDF play() OK but currentTime stuck at', snapTime, '\u2192 IndexedDB recovery');

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

        console.log('[verifiedPlay] \u2705 IndexedDB recovery succeeded for cacheKey:', cacheKey.substring(0, 16));
    };

    // ============================================
    // finalizeTransition: 트랙 전환 성공 후 공통 후처리
    // 5개 전환 경로(gapless, fast-play, inline-bg, speakNote, MediaSession)에서 호출
    // ============================================
    window.finalizeTransition = function(nextIndex, nextPage, { cacheKey, audioUrl, source = '' } = {}) {
        const reader = window.azureTTSReader;
        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));

        // 1. 인덱스 + 상태 플래그
        reader.currentIndex = nextIndex;
        reader.lastPlayedIndex = nextIndex;
        reader.isLoading = false;
        reader._nextTrackPrepared = false;
        reader._wasPlayingBeforeInterruption = false;

        // 2. UI
        window._ttsUpdateNoteHighlight(reader, nextIndex);
        window._ttsUpdateToggleButtonState(true);
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                \u25B6\uFE0F \uC7AC\uC0DD \uC911: <strong>[${nextIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(nextPage.file.name)}
                ${source ? `<br><small style="opacity: 0.9;">${source}</small>` : ''}
            `;
        }

        // 3. 핸들러 + Media Session
        window.setupMediaSession(reader, nextPage, nextIndex);
        window.setupAudioHandlers(reader, audioUrl, cacheKey, nextIndex, nextPage);

        // 4. 상태 머신
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('PLAYING', { source: 'finalizeTransition' });
        }

        // 5. 영속화 (localStorage + 서버)
        localStorage.setItem('azureTTS_lastPlayedIndex', nextIndex.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
        localStorage.setItem('azureTTS_lastPlayedTitle', nextPage.file.name);

        window.dispatchEvent(new CustomEvent('tts-position-changed', {
            detail: { index: nextIndex, noteTitle: nextPage.file.name, notePath: nextPage.file.path }
        }));

        if (window.playbackPositionManager?.savePosition) {
            window.playbackPositionManager.savePosition(
                nextIndex, nextPage.file.path, nextPage.file.name
            ).catch(error => console.warn('\u26A0\uFE0F Failed to save position:', error));
        }

        // 6. 다음 트랙 프리패치
        window.prefetchNextTrack(reader, window.serverCacheManager, nextIndex);

        window.ttsLog?.(`\uD83C\uDFB5 [${source || 'transition'}] [${nextIndex + 1}/${reader.pages.length}] ${window._ttsEscapeHtml(nextPage.file.name)}`);
    };

    // ============================================
    // speakNoteWithServerCache: 서버 캐싱이 적용된 재생 함수
    // ============================================
    window.speakNoteWithServerCache = async function(index) {
        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        // 기존 재생 중인 오디오 모두 정지 (돌림노래 방지)
        window.cleanupAudioElement(reader.audioElement);
        window.cleanupAudioElement(reader.audioElementB);

        // 재진입 방지 가드
        const callId = (reader._speakCallId = (reader._speakCallId || 0) + 1);

        // 자동 전환 플래그 리셋 (새 트랙 시작 시)
        reader._nextTrackPrepared = false;

        // 상태 머신 LOADING 상태로 전이
        if (window.audioStateMachine) {
            window.audioStateMachine.transitionTo('LOADING', {
                index: index
            });
        }

        // pages 배열 유효성 검증
        if (!reader.pages || reader.pages.length === 0) {
            console.error('\u274C \uC7AC\uC0DD\uD560 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
            const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = '\u274C \uC7AC\uC0DD\uD560 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. Dataview \uCFFC\uB9AC\uB97C \uD655\uC778\uD558\uC138\uC694.';
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
            window.ttsLog('\uD83D\uDD04 \uB9AC\uC2A4\uD2B8 \uB05D \u2192 \uCC98\uC74C\uBD80\uD130 \uBC18\uBCF5 \uC7AC\uC0DD');
            index = 0;
        }

        const page = reader.pages[index];
        reader.currentIndex = index;
        reader.lastPlayedIndex = index;

        window._ttsUpdateNoteHighlight(reader, index);

        // localStorage에 즉시 저장 (동기, 빠름)
        localStorage.setItem('azureTTS_lastPlayedIndex', index.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
        localStorage.setItem('azureTTS_lastPlayedTitle', page.file.name);

        // 통합 노트 즉시 알림: CustomEvent로 위치 변경 전파
        window.dispatchEvent(new CustomEvent('tts-position-changed', {
            detail: { index: index, noteTitle: page.file.name, notePath: page.file.path }
        }));

        // 재생 컨트롤 영역 업데이트
        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                \uD83D\uDD04 \uCE90\uC2DC \uD655\uC778 \uC911: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
            `;
        }

        try {
            // 3단계 캐시 해결 (modules/audio-cache-resolver.js)
            const { audioBlob, fromCache, cacheSource, cacheKey } = await window.resolveAudioCache({
                cacheManager, reader, page, index
            });

            // await 복귀 후 최신 호출인지 확인
            if (callId !== reader._speakCallId) {
                window.ttsLog?.(`\u23ED\uFE0F [speakNote] \uD638\uCD9C #${callId} \uCDE8\uC18C (\uCD5C\uC2E0: #${reader._speakCallId})`);
                return;
            }

            // 활성 오디오 엘리먼트 사용
            const activeAudio = window._ttsGetActiveAudio();
            const audioUrl = URL.createObjectURL(audioBlob);
            reader._currentAudioBlob = audioBlob;
            window._ttsSetAudioUrl(audioUrl);
            activeAudio.src = audioUrl;
            activeAudio.playbackRate = reader.playbackRate;

            // play() 전 핸들러 선등록 (짧은 오디오가 verifiedPlay 300ms 검증 중 끝날 수 있으므로)
            window.setupAudioHandlers(reader, audioUrl, cacheKey, index, page);

            // UI 즉시 업데이트 (play() 전)
            const lastPlayedDivEarly = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));
            if (lastPlayedDivEarly) {
                const cacheIconEarly = fromCache ? '\uD83D\uDCBE' : '\uD83C\uDF99\uFE0F';
                lastPlayedDivEarly.innerHTML = `
                    \uD83D\uDD04 \uC7AC\uC0DD \uC900\uBE44: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
                    <br><small style="opacity: 0.9;">${cacheIconEarly} ${cacheSource}</small>
                `;
            }
            window._ttsUpdateToggleButtonState(true);

            // play() + 좀비 검증
            try {
                await window.verifiedPlay(activeAudio, { cacheKey });
            } catch (playError) {
                window._ttsHandlePlayError(playError, reader, lastPlayedDiv, index);
                throw playError;
            }

            const cacheIcon = fromCache ? '\uD83D\uDCBE' : '\uD83C\uDF99\uFE0F';
            window.finalizeTransition(index, page, {
                cacheKey, audioUrl: audioUrl, source: `${cacheIcon} ${cacheSource}`
            });

        } catch (error) {
            console.error('\u274C TTS \uC804\uCCB4 \uC624\uB958:', error);

            if (lastPlayedDiv) {
                const msgParts = error.message.split('\n');
                const mainMsg = msgParts[0];
                const responsePreview = msgParts.length > 1 ? msgParts.slice(1).join('\n') : '';

                lastPlayedDiv.innerHTML = `
                    <div style="text-align:left; font-size:12px; line-height:1.5;">
                    \u274C <strong>TTS \uC624\uB958</strong>
                    <br>${window._ttsEscapeHtml(mainMsg)}
                    <br>\uC5D4\uB4DC\uD3EC\uC778\uD2B8: <span style="word-break:break-all;">${window._ttsEscapeHtml(reader.apiEndpoint || '?')}</span>
                    ${responsePreview ? `<br><br><strong>\uC11C\uBC84 \uC751\uB2F5:</strong><br><pre style="white-space:pre-wrap; word-break:break-all; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; font-size:11px;">${responsePreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : ''}
                    </div>
                `;
            }

            reader.isLoading = false;
        }
    };

    window.ttsLog?.('\u2705 [tts-engine/playback-core] \uBAA8\uB4C8 \uB85C\uB4DC \uC644\uB8CC');
}
