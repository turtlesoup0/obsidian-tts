// ============================================
// audio-cache-resolver: 3단계 오디오 캐시 해결
// prefetch → 오프라인 캐시 → 서버 캐시 → TTS 생성
// 의존성: offlineCacheManager, serverCacheManager, ttsPlayer.synthesize
// ============================================

if (!window.resolveAudioCache) {

    /**
     * 3단계 캐시 해결: prefetch fast path → 오프라인 → 서버 → TTS 생성
     * @param {Object} params
     * @param {Object} params.cacheManager - serverCacheManager
     * @param {Object} params.reader - ttsPlayer.state
     * @param {Object} params.page - 현재 페이지 (page.file.name, page.file.path)
     * @param {number} params.index - 현재 인덱스
     * @returns {Promise<{audioBlob: Blob, fromCache: boolean, cacheSource: string, cacheKey: string}>}
     */
    window.resolveAudioCache = async function({ cacheManager, reader, page, index }) {
        let audioBlob = null;
        let fromCache = false;
        let cacheSource = '';
        let cacheKey;

        // 🚀 Fast path: prefetch된 blob이 있으면 IndexedDB + SHA-256 건너뛰기
        const prefetched = reader._prefetchedNext;
        if (prefetched && prefetched.index === index && prefetched.blob) {
            audioBlob = prefetched.blob;
            cacheKey = prefetched.cacheKey;
            fromCache = true;
            cacheSource = '⚡ prefetch 캐시';
            reader._prefetchedNext = null;
            window.ttsLog(`\n=== 노트 ${index + 1}/${reader.pages.length}: ${page.file.name} ===`);
            window.ttsLog(`⚡ [Prefetch] fast path 사용 (IndexedDB/SHA-256 스킵)`);
        }

        if (!audioBlob) {
            // 일반 경로: generateCacheKey + 캐시 조회
            const content = cacheManager.getNoteContent(page);
            const notePath = page.file.path;
            cacheKey = await cacheManager.generateCacheKey(notePath, content);

            window.ttsLog(`\n=== 노트 ${index + 1}/${reader.pages.length}: ${page.file.name} ===`);
            window.ttsLog(`Cache Key: ${cacheKey}`);
        }

        const notePath = page.file.path;

        // 1단계: 오프라인 캐시 확인 (prefetch fast path 시 건너뜀)
        if (!audioBlob) {
            try {
                const cached = await window.offlineCacheManager.getAudio(cacheKey);
                if (cached) {
                    // 🔑 Blob 타입 검증 (버전 불일치 방지)
                    if (!(cached instanceof Blob)) {
                        console.warn(`⚠️ 오프라인 캐시 타입 오류: expected Blob, got ${typeof cached} → 폐기`);
                        try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch(e) { console.debug('[CacheResolver] delete invalid offline cache failed:', e.message); }
                        audioBlob = null;
                    } else {
                        audioBlob = cached;

                        const blobType = audioBlob.type || '';
                        if (blobType.includes('text/html') || blobType.includes('text/plain') || blobType.includes('application/json') || audioBlob.size < 1000) {
                            console.warn(`⚠️ 오프라인 캐시 오염 감지: type=${blobType}, size=${audioBlob.size} → 폐기`);
                            try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch(e) { console.debug('[CacheResolver] delete contaminated cache failed:', e.message); }
                            audioBlob = null;
                        } else {
                            fromCache = true;
                            cacheSource = '📱 오프라인 캐시';
                            window.ttsLog(`📱 Using offline cache (${audioBlob.size} bytes, type=${blobType})`);
                        }
                    }
                }
            } catch (offlineError) {
                console.warn('⚠️ Offline cache error:', offlineError.message);
                audioBlob = null;
            }
        }

        if (!audioBlob) {
            // 2단계: 서버 캐시 확인
            try {
                const cached = await cacheManager.getCachedAudioFromServer(cacheKey);

                if (cached && cached.audioBlob) {
                    // 🔑 Blob 타입 검증
                    if (!(cached.audioBlob instanceof Blob)) {
                        console.warn(`⚠️ 서버 캐시 타입 오류: expected Blob, got ${typeof cached.audioBlob}`);
                        audioBlob = null;
                    } else {
                        audioBlob = cached.audioBlob;
                        fromCache = true;
                        cacheSource = '☁️ 서버 캐시';
                        window.ttsLog(`💾 Using server cache (${cached.size} bytes)`);

                        // 오프라인 캐시에 저장 (순수 TTS만 저장)
                        try {
                            await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                            window.ttsLog(`✅ 오프라인 캐시 저장 완료 (서버 → 로컬)`);
                        } catch (saveError) {
                            console.warn('⚠️ 오프라인 캐시 저장 실패:', saveError.message);
                        }
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
                    audioBlob = await window.ttsPlayer.synthesize(textToSpeak);
                    window.ttsLog(`✅ TTS 생성 완료: ${audioBlob.size} bytes, ${textToSpeak.length} chars`);

                    // 서버 캐시에 저장 (순수 TTS만 저장)
                    try {
                        await cacheManager.saveAudioToServer(cacheKey, audioBlob);
                    } catch (saveServerError) {
                        console.warn('⚠️ 서버 캐시 저장 실패:', saveServerError.message);
                    }

                    // 오프라인 캐시에 저장 (순수 TTS만 저장)
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
            try { await window.offlineCacheManager.deleteAudio(cacheKey); } catch(e) { console.debug('[CacheResolver] delete empty blob cache failed:', e.message); }
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
            // 🔑 clone() 안전 호출
            const preview = typeof audioBlob.clone === 'function'
                ? await audioBlob.clone().text().catch(() => '(읽기 실패)')
                : '(clone 미지원)';
            throw new Error(`비-오디오 데이터 차단 (${cacheSource})\ntype=${finalBlobType}, size=${audioBlob.size}bytes\n응답 내용: ${preview.substring(0, 300)}`);
        }

        return { audioBlob, fromCache, cacheSource, cacheKey };
    };

    window.ttsLog?.('✅ [tts-engine/audio-cache-resolver] 모듈 로드 완료');
}
