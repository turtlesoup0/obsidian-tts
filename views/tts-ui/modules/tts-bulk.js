// ============================================
// tts-bulk: 전체 노트 TTS 일괄 생성
// 의존성: tts-core, tts-cache (serverCacheManager, offlineCacheManager)
// ============================================

if (!window._ttsBulkModuleLoaded) {
    window._ttsBulkModuleLoaded = true;

    window.bulkGenerateAllNotes = async function() {
        // 의존성 체크
        const dvObj = typeof dv !== 'undefined' ? dv : window._ttsDvObj;
        if (!dvObj) {
            alert('❌ Dataview 플러그인이 활성화되어 있지 않습니다.');
            return;
        }

        // 필수 의존성 확인
        const requiredDeps = ['serverCacheManager', 'offlineCacheManager', 'ttsPlayer', 'updateCacheStatsDisplay'];
        const missingDeps = requiredDeps.filter(dep => !window[dep]);
        if (missingDeps.length > 0) {
            alert(`❌ 필수 모듈이 로드되지 않았습니다: ${missingDeps.join(', ')}\n\n페이지를 새로고침하거나 관련 뷰 파일을 확인하세요.`);
            return;
        }

        let tagQuery = "#출제예상";
        const config = window._ttsConfig || { EXAM_RANGE: { start: 130, end: 138 } };
        const { start, end } = config.EXAM_RANGE;
        for (let i = start; i <= end; i++) {
            tagQuery += ` or #${i}관 or #${i}응`;
        }

        const allPages = dvObj.pages(`"1_Project/정보 관리 기술사" and -#검색제외 and (${tagQuery})`)
            .sort(b => [b.file.folder, b.file.name], 'asc')
            .array();

        if (!allPages || allPages.length === 0) {
            alert('생성할 노트가 없습니다.');
            return;
        }

        const totalNotes = allPages.length;
        const confirmed = confirm(
            `전체 ${totalNotes}개 노트에 대해 TTS를 일괄 생성하시겠습니까?\n\n` +
            `- 캐시된 노트는 자동으로 건너뜁니다\n` +
            `- 새로운 노트만 생성됩니다\n` +
            `- 진행 중 언제든지 중단 가능합니다`
        );

        if (!confirmed) return;

        // 진행 상황 UI
        const progressDiv = document.createElement('div');
        progressDiv.id = 'bulk-generation-progress';
        progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--background-primary, white); padding: 30px; border-radius: var(--tts-radius, 10px); box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; min-width: 350px; max-width: 90vw;';
        progressDiv.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: var(--text-normal, #333);">TTS 일괄 생성 중...</h3>
            <div style="margin-bottom: 15px;">
                <div style="font-size: 14px; color: var(--text-muted, #666); margin-bottom: 5px;">
                    진행: <strong id="bulk-current">0</strong> / <strong id="bulk-total">${totalNotes}</strong>
                    (<strong id="bulk-percentage">0%</strong>)
                </div>
                <div style="background: var(--background-secondary, #eee); height: 20px; border-radius: 10px; overflow: hidden;">
                    <div id="bulk-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--tts-success), #8BC34A); transition: width 0.3s;"></div>
                </div>
            </div>
            <div id="bulk-current-note" style="font-size: 12px; color: var(--text-muted, #999); margin-bottom: 5px; height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
            <div id="bulk-time-info" style="font-size: 11px; color: var(--text-faint, #888); margin-bottom: 10px;"></div>
            <div id="bulk-stats" style="font-size: 12px; color: var(--text-muted, #666); margin-bottom: 15px;">
                생성: <strong id="bulk-generated">0</strong> |
                동기화: <strong id="bulk-synced">0</strong> |
                건너뜀: <strong id="bulk-skipped">0</strong> |
                실패: <strong id="bulk-failed">0</strong>
            </div>
            <button id="bulk-cancel-btn" class="tts-btn tts-btn-danger" style="width: 100%;">
                중단
            </button>
        `;
        document.body.appendChild(progressDiv);

        // 중단 상태 관리 (객체로 래핑하여 참조 전달)
        const cancelState = { cancelled: false, reason: null };
        const cancelBtn = document.getElementById('bulk-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                cancelState.cancelled = true;
                cancelState.reason = '사용자 요청';
                cancelBtn.disabled = true;
                cancelBtn.textContent = '중단 중...';
                console.log('⏹️ 일괄 생성 중단 요청됨');
            };
        }

        let generated = 0, synced = 0, skipped = 0, failed = 0, cleaned = 0;
        const validCacheKeys = new Set();
        const bulkStartTime = Date.now();

        // UI 요소 캐싱 (null 체크 포함)
        const ui = {
            current: document.getElementById('bulk-current'),
            percentage: document.getElementById('bulk-percentage'),
            progressBar: document.getElementById('bulk-progress-bar'),
            currentNote: document.getElementById('bulk-current-note'),
            timeInfo: document.getElementById('bulk-time-info'),
            generated: document.getElementById('bulk-generated'),
            synced: document.getElementById('bulk-synced'),
            skipped: document.getElementById('bulk-skipped'),
            failed: document.getElementById('bulk-failed')
        };

        // 진행 상황 업데이트 헬퍼 함수
        const updateUI = (key, value) => {
            const el = ui[key];
            if (el) el.textContent = value;
        };

        for (let i = 0; i < allPages.length; i++) {
            if (cancelState.cancelled) {
                console.log('⏹️ 사용자 요청으로 중단됨');
                break;
            }

            const page = allPages[i];
            const noteTitle = page.file.name;

            updateUI('current', i + 1);
            updateUI('percentage', Math.round(((i + 1) / totalNotes) * 100) + '%');
            if (ui.progressBar) ui.progressBar.style.width = ((i + 1) / totalNotes * 100) + '%';
            updateUI('currentNote', noteTitle);

            // 경과 시간 및 예상 완료 시간 표시
            const elapsed = Date.now() - bulkStartTime;
            const avgPerNote = elapsed / (i + 1);
            const remaining = avgPerNote * (totalNotes - i - 1);
            const elapsedStr = Math.floor(elapsed / 1000) + '초';
            const remainingStr = remaining > 0 ? Math.floor(remaining / 1000) + '초' : '-';
            const speedStr = (1000 / avgPerNote).toFixed(1) + '개/초';
            if (ui.timeInfo) {
                ui.timeInfo.textContent = `${elapsedStr} 경과 | 예상 남은: ${remainingStr} | 속도: ${speedStr}`;
            }

            try {
                const structuredContent = window.serverCacheManager.getNoteContent(page);

                if (!structuredContent || structuredContent.trim().length === 0) {
                    skipped++;
                    updateUI('skipped', skipped);
                    continue;
                }

                const notePath = page.file.path;
                const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, structuredContent);
                validCacheKeys.add(cacheKey);

                // 오프라인 캐시 확인
                let audioBlob = null;
                try {
                    audioBlob = await window.offlineCacheManager.getAudio(cacheKey);
                } catch (err) { console.debug('[Bulk] offline cache read failed:', err.message); }

                // 오프라인 캐시에 이미 있으면 완전 스킵
                if (audioBlob) {
                    skipped++;
                    updateUI('skipped', skipped);
                    continue;
                }

                // 서버 캐시 확인 → 있으면 오프라인에 동기화
                const cached = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
                if (cached?.audioBlob) {
                    try {
                        await window.offlineCacheManager.saveAudio(cacheKey, cached.audioBlob, notePath);
                        window.ttsLog?.(`📥 [Bulk] 서버→오프라인 동기화: ${noteTitle}`);
                    } catch (err) { console.debug('[Bulk] offline sync save failed:', err.message); }
                    synced++;
                    updateUI('synced', synced);
                    continue;
                }

                // TTS 생성
                audioBlob = await window.ttsPlayer.synthesize(structuredContent);

                if (!audioBlob) {
                    throw new Error('TTS 생성 실패');
                }

                // 캐시에 저장
                await window.serverCacheManager.saveAudioToServer(cacheKey, audioBlob);

                try {
                    await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                } catch (err) { console.debug('[Bulk] offline cache save failed:', err.message); }

                generated++;
                updateUI('generated', generated);

            } catch (error) {
                console.error(`❌ [${noteTitle}]`, error);
                failed++;
                updateUI('failed', failed);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 고아 캐시 정리: 유효하지 않은 오프라인 캐시 삭제
        if (validCacheKeys.size > 0) {
            try {
                updateUI('currentNote', '고아 캐시 정리 중...');
                const allStoredKeys = await window.offlineCacheManager.getAllKeys();
                const orphanKeys = allStoredKeys.filter(key => !validCacheKeys.has(key));

                for (const orphanKey of orphanKeys) {
                    try {
                        await window.offlineCacheManager.deleteAudio(orphanKey);
                        cleaned++;
                    } catch (err) { console.debug('[Bulk] orphan delete failed:', err.message); }
                }

                if (cleaned > 0) {
                    window.ttsLog?.(`🧹 [Bulk] 고아 캐시 ${cleaned}개 정리 완료 (전체 ${allStoredKeys.length}개 중)`);
                }
            } catch (err) {
                console.warn('⚠️ 고아 캐시 정리 실패:', err.message);
            }
        }

        // 안전한 progressDiv 제거
        try {
            if (progressDiv && progressDiv.parentNode === document.body) {
                document.body.removeChild(progressDiv);
            }
        } catch (err) {
            console.warn('⚠️ 진행 상황 UI 제거 실패:', err.message);
        }

        const cleanedStr = cleaned > 0 ? `\n🧹 정리: ${cleaned}개` : '';
        const resultMessage = cancelState.cancelled
            ? `⏹️ 사용자 요청으로 중단됨\n\n✅ 생성: ${generated}개\n📥 동기화: ${synced}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개${cleanedStr}`
            : `🎉 완료!\n\n✅ 생성: ${generated}개\n📥 동기화: ${synced}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개${cleanedStr}`;

        alert(resultMessage);
        await window.updateCacheStatsDisplay();
    };

    window.ttsLog?.('✅ [tts-ui/tts-bulk] 모듈 로드 완료');
}

// TTS 네임스페이스 등록: 가드 밖에서 항상 실행 (Dataview 리렌더링 시 재등록 보장)
if (window.TTS && window.bulkGenerateAllNotes) {
    window.TTS.bulkGenerate = window.bulkGenerateAllNotes;
    window.TTS.registerModule('bulk', { generate: window.bulkGenerateAllNotes });
}
