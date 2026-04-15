// ============================================
// playback-handlers: onended/onerror 핸들러 + prefetch
// setupAudioHandlers, prefetchNextTrack
// 의존성: window.verifiedPlay, window.finalizeTransition,
//         window._ttsGetActiveAudio, window._ttsSetAudioUrl,
//         window._ttsUpdateToggleButtonState, window._ttsEscapeHtml,
//         window.offlineCacheManager, window.serverCacheManager, window.callAzureTTS
// ============================================

if (!window._ttsPlaybackHandlersLoaded) {
    window._ttsPlaybackHandlersLoaded = true;

    // ============================================
    // setupAudioHandlers: onended + onerror 핸들러 등록
    // 활성 오디오 엘리먼트 기준, 트랙 전환 경로 포함 (fast-play + 백그라운드 인라인)
    // ============================================
    window.setupAudioHandlers = function(reader, audioUrl, cacheKey, index, page) {
        const lastPlayedDiv = (window._ttsLastPlayedDiv || document.getElementById('last-played-info'));

        // 활성 오디오 엘리먼트에 핸들러 등록
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
                window._ttsUpdateToggleButtonState(false);
                return;
            }

            // iOS 잠금화면 fast-play: prefetch blob이 준비되어 있으면
            // async 작업 없이 즉시 src 설정 + play() 호출하여 오디오 세션 유지
            // 백그라운드에서는 메모리 Blob이 iOS에 의해 무효화될 수 있으므로 스킵
            const nextIndex = (index + 1 >= reader.pages.length) ? 0 : index + 1;
            const isBackground = document.visibilityState === 'hidden';
            const prefetched = reader._prefetchedNext;
            if (!isBackground && prefetched && prefetched.index === nextIndex && prefetched.blob) {
                const nextPage = reader.pages[nextIndex];
                const nextBlob = prefetched.blob;
                const nextCacheKey = prefetched.cacheKey;
                reader._prefetchedNext = null;

                // 즉시 재생 (sync 경로) - 활성 오디오 엘리먼트 사용
                const nextUrl = URL.createObjectURL(nextBlob);
                reader._currentAudioBlob = nextBlob;
                window._ttsSetAudioUrl(nextUrl);
                reader.currentIndex = nextIndex;
                reader.lastPlayedIndex = nextIndex;
                const onendedAudio = window._ttsGetActiveAudio();
                onendedAudio.src = nextUrl;
                onendedAudio.playbackRate = reader.playbackRate;

                try {
                    await window.verifiedPlay(onendedAudio, { cacheKey: nextCacheKey });

                    window.finalizeTransition(nextIndex, nextPage, {
                        cacheKey: nextCacheKey, audioUrl: nextUrl, source: '\u26A1 prefetch \uCE90\uC2DC'
                    });
                    return;
                } catch (e) {
                    // fast-play 실패 시 기존 경로로 폴백
                    console.warn('[FastPlay] iOS fast-play \uC2E4\uD328, \uAE30\uC874 \uACBD\uB85C\uB85C \uD3F4\uBC31:', e.message);
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
                await window.verifiedPlay(bgAudio, { cacheKey: bgCacheKey });

                window.finalizeTransition(bgNextIndex, bgNextPage, {
                    cacheKey: bgCacheKey, audioUrl: bgUrl, source: '\uD83D\uDCF1 \uBC31\uADF8\uB77C\uC6B4\uB4DC \uC548\uC804 \uC804\uD658'
                });
            } catch (bgError) {
                // 상태만 정리하고 포그라운드 복귀 시 복구에 맡김
                console.error('[onended-inline] \uC778\uB77C\uC778 \uC804\uD658 \uC2E4\uD328 (\uC138\uC158 \uBCF4\uD638 \uC704\uD574 fallback \uD638\uCD9C \uC548 \uD568):', bgError.message);
                reader.isLoading = false;
                reader._wasPlayingBeforeInterruption = true;
                reader._lastInterruptionTime = Date.now();
            }
        };

        activeAudio.onerror = async function(e) {
            // 정지 상태에서는 에러 처리 스킵
            if (reader.isStopped) return;
            console.error('\u274C \uC624\uB514\uC624 \uC7AC\uC0DD \uC624\uB958:', e);
            const errAudio = window._ttsGetActiveAudio();
            const errorType = errAudio.error?.code;

            // SRC_NOT_SUPPORTED (코드 4): prefetch blob 손상 — prefetch 버리고 서버에서 재요청
            if (errorType === 4) {
                console.warn('\u26A0\uFE0F SRC_NOT_SUPPORTED \uAC10\uC9C0, prefetch \uD3D0\uAE30 \uD6C4 \uC11C\uBC84 \uC7AC\uC694\uCCAD');
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
                console.warn('\u26A0\uFE0F \uB124\uD2B8\uC6CC\uD06C/\uB514\uCF54\uB4DC \uC5D0\uB7EC \uAC10\uC9C0, \uC624\uD504\uB77C\uC778 \uCE90\uC2DC \uC7AC\uC2DC\uB3C4');
                try {
                    const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
                    if (offlineAudio) {
                        window.ttsLog('\u2705 \uC624\uD504\uB77C\uC778 \uCE90\uC2DC\uC5D0\uC11C \uBCF5\uAD6C \uC131\uACF5');
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
                                \u25B6\uFE0F \uC7AC\uC0DD \uC911: <strong>[${index + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml(page.file.name)}
                                <br><small style="opacity: 0.9;">\uD83D\uDCBE \uC624\uD504\uB77C\uC778 \uCE90\uC2DC (\uB124\uD2B8\uC6CC\uD06C \uBCF5\uAD6C)</small>
                            `;
                        }
                        return;
                    }
                } catch (retryError) {
                    console.error('\u274C \uC624\uD504\uB77C\uC778 \uCE90\uC2DC \uC7AC\uC2DC\uB3C4 \uC2E4\uD328:', retryError);
                }
            }

            // 복구 실패 시 에러 표시
            const errorNames = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
            const blobInfo = reader._lastBlobInfo || {};
            if (lastPlayedDiv) {
                lastPlayedDiv.innerHTML = `
                    <div style="text-align:left; font-size:13px; line-height:1.6;">
                    \u274C <strong>\uC624\uB514\uC624 \uC7AC\uC0DD \uC624\uB958</strong>
                    <br>\uC5D0\uB7EC \uCF54\uB4DC: <strong>${errorType || '?'} (${errorNames[errorType] || 'UNKNOWN'})</strong>
                    <br>Blob \uD06C\uAE30: <strong>${blobInfo.size ?? '?'} bytes</strong>
                    <br>Blob \uD0C0\uC785: <strong>${blobInfo.type ?? '?'}</strong>
                    <br>\uCE90\uC2DC \uC18C\uC2A4: ${blobInfo.cacheSource ?? '?'}
                    </div>
                `;
            }

            reader.isLoading = false;
        };
    };

    // ============================================
    // prefetchNextTrack: 다음 트랙 오디오 미리 가져오기 (비동기, 실패해도 무시)
    // ============================================
    window.prefetchNextTrack = async function(reader, cacheManager, index) {
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
                window.ttsLog?.(`\u26A1 [Prefetch] \uB2E4\uC74C \uD2B8\uB799 \uC900\uBE44 \uC644\uB8CC: [${nextIdx + 1}] ${window._ttsEscapeHtml(nextPage.file.name)} (${nextBlob.size} bytes)`);
            }
        } catch (e) {
            // prefetch 실패해도 재생에 영향 없음
        }
    };

    window.ttsLog?.('\u2705 [tts-engine/playback-handlers] \uBAA8\uB4C8 \uB85C\uB4DC \uC644\uB8CC');
}
