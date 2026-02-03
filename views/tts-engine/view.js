// ============================================
// tts-engine: TTS 재생 엔진
// callAzureTTS + speakNoteWithServerCache + 재생 컨트롤
// 의존성: tts-core, tts-config, tts-text, tts-cache, tts-position
// input: { pages } - dv.pages() 결과
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.azureTTSReader) {

    // azureTTSReader 전역 객체 초기화
    window.azureTTSReader = {
        apiEndpoint: window.ACTIVE_TTS_ENDPOINT,
        pages: [],
        currentIndex: 0,
        isPaused: false,
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
        _watchdogDetectedAt: 0
    };

    // 오디오 엘리먼트 생성 (iOS 백그라운드 재생 지원)
    window.azureTTSReader.audioElement = new Audio();
    window.azureTTSReader.audioElement.preload = 'auto';
    window.azureTTSReader.audioElement.setAttribute('playsinline', '');
    window.azureTTSReader.audioElement.setAttribute('webkit-playsinline', '');
    window.ttsLog('🎵 오디오 엘리먼트 생성 완료 (iOS 백그라운드 재생 지원)');

    // ============================================
    // 화면 잠금 시 TTS 재생 유지 방어 코드
    // ============================================
    (function() {
        const reader = window.azureTTSReader;
        const audio = reader.audioElement;
        const dbg = () => window.TTS_DEBUG;

        // --- 1. pause/play 이벤트 리스너 (addEventListener으로 덮어쓰기 방지) ---
        audio.addEventListener('pause', function() {
            if (reader.isPaused || reader.isStopped) {
                // 사용자가 직접 일시정지하거나 정지한 경우
                reader._wasPlayingBeforeInterruption = false;
                return;
            }
            // OS가 강제로 정지한 경우 (화면 잠금 등)
            reader._wasPlayingBeforeInterruption = true;
            reader._lastInterruptionTime = Date.now();
            if (dbg()) console.log('[TTS-Guard] OS-forced pause detected at', new Date().toLocaleTimeString());
        });

        audio.addEventListener('play', function() {
            reader._wasPlayingBeforeInterruption = false;
            reader._watchdogDetectedAt = 0;
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

        // --- 3. Heartbeat Watchdog (10초 간격) ---
        if (reader._watchdogTimerId) clearInterval(reader._watchdogTimerId);
        reader._watchdogTimerId = setInterval(function() {
            // 내부 상태와 실제 상태 불일치 감지
            if (!reader.isPaused && !reader.isStopped && audio.src && audio.paused && audio.readyState >= 2) {
                const now = Date.now();
                if (reader._watchdogDetectedAt === 0) {
                    // 최초 감지: 5초 유예 기간 시작
                    reader._watchdogDetectedAt = now;
                    if (dbg()) console.log('[TTS-Guard] Watchdog: mismatch detected, grace period started');
                } else if (now - reader._watchdogDetectedAt > 5000) {
                    // 유예 기간 경과: 자동 복구 시도
                    if (dbg()) console.log('[TTS-Guard] Watchdog: mismatch persisted, attempting recovery');
                    reader._watchdogDetectedAt = 0;
                    audio.play().catch(function(e) {
                        if (dbg()) console.warn('[TTS-Guard] Watchdog play() failed:', e.message);
                        // Blob 복구 시도
                        if (reader._currentAudioBlob) {
                            try {
                                var newUrl = URL.createObjectURL(reader._currentAudioBlob);
                                audio.src = newUrl;
                                audio.playbackRate = reader.playbackRate;
                                reader._currentAudioUrl = newUrl;
                                audio.play().catch(function() {});
                            } catch (e2) {}
                        }
                    });
                }
            } else {
                // 정상 상태이면 watchdog 리셋
                reader._watchdogDetectedAt = 0;
            }
        }, 10000);

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
                const htmlPreview = await audioBlob.clone().text().catch(() => '(읽기 실패)');
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
    // 서버 캐싱이 적용된 재생 함수
    // ============================================
    window.speakNoteWithServerCache = async function(index) {
        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

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

        // 마지막 재생 위치 저장 (로컬 + 서버)
        localStorage.setItem('azureTTS_lastPlayedIndex', index.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
        localStorage.setItem('azureTTS_lastPlayedTitle', page.file.name);

        // 서버에 저장 (비동기)
        window.playbackPositionManager.savePosition(
            index,
            page.file.path,
            page.file.name
        ).catch(error => {
            console.warn('⚠️ Failed to save playback position to server:', error);
        });

        // 재생 컨트롤 영역 업데이트
        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            lastPlayedDiv.innerHTML = `
                🔄 캐시 확인 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
            `;
        }

        try {
            const content = cacheManager.getNoteContent(page);
            const notePath = page.file.path;
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);

            window.ttsLog(`\n=== 노트 ${index + 1}/${reader.pages.length}: ${page.file.name} ===`);
            window.ttsLog(`Cache Key: ${cacheKey}`);

            let audioBlob;
            let fromCache = false;
            let cacheSource = '';

            // 1단계: 오프라인 캐시 확인
            try {
                audioBlob = await window.offlineCacheManager.getAudio(cacheKey);
                if (audioBlob) {
                    const blobType = audioBlob.type || '';
                    if (blobType.includes('text/html') || blobType.includes('text/plain') || blobType.includes('application/json') || audioBlob.size < 1000) {
                        console.warn(`⚠️ 오프라인 캐시 오염 감지: type=${blobType}, size=${audioBlob.size} → 폐기`);
                        try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch(e) {}
                        audioBlob = null;
                    } else {
                        fromCache = true;
                        cacheSource = '📱 오프라인 캐시';
                        window.ttsLog(`📱 Using offline cache (${audioBlob.size} bytes, type=${blobType})`);
                    }
                }
            } catch (offlineError) {
                console.warn('⚠️ Offline cache error:', offlineError.message);
                audioBlob = null;
            }

            if (!audioBlob) {
                // 2단계: 서버 캐시 확인
                try {
                    const cached = await cacheManager.getCachedAudioFromServer(cacheKey);

                    if (cached) {
                        audioBlob = cached.audioBlob;
                        fromCache = true;
                        cacheSource = '☁️ 서버 캐시';
                        window.ttsLog(`💾 Using server cache (${cached.size} bytes)`);

                        // 오프라인 캐시에 저장
                        try {
                            await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                            window.ttsLog(`✅ 오프라인 캐시 저장 완료 (서버 → 로컬)`);
                        } catch (saveError) {
                            console.warn('⚠️ 오프라인 캐시 저장 실패:', saveError.message);
                        }
                    }
                } catch (serverError) {
                    console.warn('⚠️ 서버 캐시 조회 실패:', serverError.message);
                    audioBlob = null;
                }

                if (!audioBlob) {
                    // 3단계: TTS 생성
                    try {
                        window.ttsLog(`🌐 Azure TTS API 호출 시작`);
                        cacheSource = '🎙️ 새로 생성';

                        const textToSpeak = cacheManager.getNoteContent(page);
                        audioBlob = await window.callAzureTTS(textToSpeak);
                        window.ttsLog(`✅ TTS 생성 완료: ${audioBlob.size} bytes, ${textToSpeak.length} chars`);

                        // 서버 캐시에 저장
                        try {
                            await cacheManager.saveAudioToServer(cacheKey, audioBlob);
                        } catch (saveServerError) {
                            console.warn('⚠️ 서버 캐시 저장 실패:', saveServerError.message);
                        }

                        // 오프라인 캐시에 저장
                        try {
                            await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                        } catch (saveError) {
                            console.warn('⚠️ 오프라인 캐시 저장 실패:', saveError.message);
                        }

                        fromCache = false;
                    } catch (ttsError) {
                        console.error('❌ TTS 생성 실패:', ttsError.message);
                        throw new Error(`TTS 생성 실패: ${ttsError.message}`);
                    }
                }
            }

            // 캐시 통계 업데이트
            if (window.updateCacheStatsDisplay) {
                window.updateCacheStatsDisplay();
            }

            // 오디오 blob 유효성 검증
            if (!audioBlob || audioBlob.size === 0) {
                console.error('❌ 오디오 blob이 비어있습니다.');
                try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch(e) {}
                throw new Error('빈 오디오 데이터. 다시 시도하세요.');
            }

            // 재생 전 Blob 진단 정보 저장
            reader._lastBlobInfo = {
                size: audioBlob.size,
                type: audioBlob.type || '(없음)',
                cacheSource: cacheSource,
                endpoint: reader.apiEndpoint,
                useLocal: window.ttsEndpointConfig.useLocalEdgeTts,
                timestamp: new Date().toLocaleTimeString()
            };

            // 비-오디오 Blob 차단
            const finalBlobType = audioBlob.type || '';
            if (finalBlobType.includes('text/') || finalBlobType.includes('application/json')) {
                const preview = await audioBlob.clone().text().catch(() => '(읽기 실패)');
                throw new Error(`비-오디오 데이터 차단 (${cacheSource})\ntype=${finalBlobType}, size=${audioBlob.size}bytes\n응답 내용: ${preview.substring(0, 300)}`);
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            reader._currentAudioBlob = audioBlob;
            reader._currentAudioUrl = audioUrl;
            reader.audioElement.src = audioUrl;
            reader.audioElement.playbackRate = reader.playbackRate;

            // iOS 잠금 화면 지원: Media Session API
            if ('mediaSession' in navigator) {
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
                        try { await window.speakNoteWithServerCache(reader.currentIndex); } catch (e) {}
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

            // 재생 완료 시 다음 노트로
            reader.audioElement.onended = function() {
                URL.revokeObjectURL(audioUrl);
                reader._currentAudioBlob = null;
                reader._currentAudioUrl = null;
                reader._wasPlayingBeforeInterruption = false;
                if (!reader.isStopped && !reader.isPaused) {
                    setTimeout(() => window.speakNoteWithServerCache(index + 1), 100);
                } else {
                    reader.isLoading = false;
                }
            };

            // 오디오 에러 핸들러
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
                            const audioUrl = URL.createObjectURL(offlineAudio);
                            reader.audioElement.src = audioUrl;
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

            await reader.audioElement.play();
            reader.isLoading = false;

            // 재생 중 상태 표시
            if (lastPlayedDiv) {
                const cacheIcon = fromCache ? '💾' : '🎙️';
                lastPlayedDiv.innerHTML = `
                    ▶️ 재생 중: <strong>[${index + 1}/${reader.pages.length}]</strong> ${page.file.name}
                    <br><small style="opacity: 0.9;">${cacheIcon} ${cacheSource}</small>
                `;
            }

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

        // 서버와 재생 위치 동기화
        const localIndex = localStorage.getItem('azureTTS_lastPlayedIndex');
        const savedIndex = localIndex ? parseInt(localIndex, 10) : -1;
        const syncedIndex = await window.playbackPositionManager.syncPosition(savedIndex);
        reader.lastPlayedIndex = syncedIndex;

        // 마지막 재생 위치 복원 (다음 노트부터)
        if (syncedIndex >= 0) {
            const nextIndex = syncedIndex + 1;
            if (nextIndex < reader.pages.length) {
                window.ttsLog(`🔄 마지막 재생 위치 ${syncedIndex + 1}번 다음부터 재개 (${nextIndex + 1}번)`);
                reader.currentIndex = nextIndex;
            } else {
                window.ttsLog(`✅ 모든 노트 재생 완료됨, 처음부터 재시작`);
                reader.currentIndex = 0;
            }
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

    window.azureTTSStop = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        reader.isStopped = true;
        reader.isPaused = false;
        reader._currentAudioBlob = null;
        reader._currentAudioUrl = null;
        reader._wasPlayingBeforeInterruption = false;

        const lastPlayedDiv = document.getElementById('last-played-info');
        if (lastPlayedDiv) {
            if (reader.lastPlayedIndex >= 0 && reader.lastPlayedIndex < reader.pages.length) {
                const lastNote = reader.pages[reader.lastPlayedIndex];
                lastPlayedDiv.innerHTML = `
                    💾 마지막 재생: <strong>[${reader.lastPlayedIndex + 1}/${reader.pages.length}]</strong> ${lastNote.file.name}
                    <br><small style="opacity: 0.9;">다음 재생 시 ${reader.lastPlayedIndex + 2}번부터 시작됩니다</small>
                `;
            } else {
                lastPlayedDiv.textContent = '⏹️ 정지됨 - 아래 버튼을 클릭하여 재생하세요';
            }
        }

        window.ttsLog('⏹️ 재생 중지');
    };

    window.azureTTSNext = function() {
        const reader = window.azureTTSReader;
        reader.audioElement.pause();
        reader.audioElement.src = '';
        window.speakNoteWithServerCache(reader.currentIndex + 1);
    };

    window.azureTTSPrevious = function() {
        const reader = window.azureTTSReader;
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
}

// ============================================
// pages 배열 설정 (input으로 전달받음)
// ============================================
if (input && input.pages) {
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
