// ============================================
// media-session: iOS 잠금화면 Media Session API 핸들러
// setupMediaSession (metadata + play/pause/prev/next 핸들러)
// 의존성: window.verifiedPlay, window.finalizeTransition (playback-core.js),
//         window.prefetchNextTrack (playback-handlers.js),
//         window._ttsGetActiveAudio, window._ttsSetAudioUrl, window._ttsEscapeHtml,
//         window.speakNoteWithServerCache, window.audioStateMachine
// ============================================

if (!window._ttsMediaSessionLoaded) {
    window._ttsMediaSessionLoaded = true;

    window.setupMediaSession = function(reader, page, index) {
        if (!('mediaSession' in navigator)) return;

        // 다음 트랙 정보 미리 계산
        const nextIndex = (index + 1 >= reader.pages.length) ? 0 : index + 1;
        const nextPage = reader.pages[nextIndex];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: page.file.name,
            artist: 'Azure TTS',
            album: `\uCD9C\uC81C\uC608\uC0C1 (${index + 1}/${reader.pages.length})`,
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
                    album: `\uCD9C\uC81C\uC608\uC0C1 (${nextIndex + 1}/${reader.pages.length})`,
                    artwork: []
                };
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
                console.error('\u274C Media Session play error:', error);
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
                console.error('\u274C Media Session pause error:', error);
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', async () => {
            try {
                if (index > 0) {
                    await window.speakNoteWithServerCache(index - 1);
                }
            } catch (error) {
                console.error('\u274C Media Session previoustrack error:', error);
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', async () => {
            try {
                const nextIdx = index < reader.pages.length - 1 ? index + 1 : 0;
                const prefetched = reader._prefetchedNext;

                // Fast path: prefetch blob 있으면 사용자 제스처 만료 전에 즉시 play()
                if (prefetched && prefetched.index === nextIdx && prefetched.blob) {
                    const nPage = reader.pages[nextIdx];
                    const nextBlob = prefetched.blob;
                    const nextCacheKey = prefetched.cacheKey;
                    reader._prefetchedNext = null;
                    reader._nextTrackPrepared = false;

                    const nextUrl = URL.createObjectURL(nextBlob);
                    const activeAudio = window._ttsGetActiveAudio();
                    activeAudio.src = nextUrl;
                    activeAudio.playbackRate = reader.playbackRate;

                    // 사용자 제스처 컨텍스트 내에서 즉시 play() + 좀비 검증
                    await window.verifiedPlay(activeAudio, { cacheKey: nextCacheKey });

                    // play() 성공 후 상태 업데이트
                    reader._currentAudioBlob = nextBlob;
                    window._ttsSetAudioUrl(nextUrl);

                    window.finalizeTransition(nextIdx, nPage, {
                        cacheKey: nextCacheKey, audioUrl: nextUrl, source: '\u26A1 MediaSession nexttrack'
                    });
                    return;
                }

                // Slow path: prefetch 없으면 메타데이터만 업데이트
                const nPage = reader.pages[nextIdx];
                if (nPage) {
                    reader.currentIndex = nextIdx;
                    reader.lastPlayedIndex = nextIdx;
                    window.setupMediaSession(reader, nPage, nextIdx);
                    navigator.mediaSession.playbackState = 'paused';
                    // prefetch 시도 (다음 ▶️ 탭 대비)
                    window.prefetchNextTrack(reader, window.serverCacheManager, nextIdx > 0 ? nextIdx - 1 : 0);
                    window.ttsLog?.(`\u23ED\uFE0F [MediaSession] nexttrack: prefetch \uC5C6\uC74C \u2192 \uBA54\uD0C0\uB370\uC774\uD130\uB9CC [${nextIdx + 1}] ${window._ttsEscapeHtml(nPage.file.name)}`);
                }
            } catch (error) {
                console.error('\u274C Media Session nexttrack error:', error);
                navigator.mediaSession.playbackState = 'paused';
            }
        });
    };

    window.ttsLog?.('\u2705 [tts-engine/media-session] \uBAA8\uB4C8 \uB85C\uB4DC \uC644\uB8CC');
}
