// ============================================
// tts-bulk: 전체 노트 TTS 일괄 생성
// 의존성: tts-core, tts-cache (serverCacheManager, offlineCacheManager)
// ============================================

if (!window._ttsBulkModuleLoaded) {
    window._ttsBulkModuleLoaded = true;

    window.bulkGenerateAllNotes = async function() {
        const dvObj = input?.dv || window._ttsDvObj || null;
        if (!dvObj) {
            alert('dv 객체를 찾을 수 없습니다.');
            return;
        }

        let tagQuery = "#출제예상";
        for (let i = 130; i <= 137; i++) {
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
                건너뜀: <strong id="bulk-skipped">0</strong> |
                실패: <strong id="bulk-failed">0</strong>
            </div>
            <button id="bulk-cancel-btn" class="tts-btn tts-btn-danger" style="width: 100%;">
                중단
            </button>
        `;
        document.body.appendChild(progressDiv);

        let cancelled = false;
        document.getElementById('bulk-cancel-btn').onclick = () => {
            cancelled = true;
            alert('중단 요청됨. 현재 노트 완료 후 중단됩니다.');
        };

        let generated = 0, skipped = 0, failed = 0;
        const bulkStartTime = Date.now();

        for (let i = 0; i < allPages.length; i++) {
            if (cancelled) break;

            const page = allPages[i];
            const noteTitle = page.file.name;

            document.getElementById('bulk-current').textContent = i + 1;
            document.getElementById('bulk-percentage').textContent = Math.round(((i + 1) / totalNotes) * 100) + '%';
            document.getElementById('bulk-progress-bar').style.width = ((i + 1) / totalNotes * 100) + '%';
            document.getElementById('bulk-current-note').textContent = noteTitle;

            // 경과 시간 및 예상 완료 시간 표시
            const elapsed = Date.now() - bulkStartTime;
            const avgPerNote = elapsed / (i + 1);
            const remaining = avgPerNote * (totalNotes - i - 1);
            const elapsedStr = Math.floor(elapsed / 1000) + '초';
            const remainingStr = remaining > 0 ? Math.floor(remaining / 1000) + '초' : '-';
            const speedStr = (1000 / avgPerNote).toFixed(1) + '개/초';
            const timeInfoEl = document.getElementById('bulk-time-info');
            if (timeInfoEl) {
                timeInfoEl.textContent = `${elapsedStr} 경과 | 예상 남은: ${remainingStr} | 속도: ${speedStr}`;
            }

            try {
                const structuredContent = window.serverCacheManager.getNoteContent(page);

                if (!structuredContent || structuredContent.trim().length === 0) {
                    skipped++;
                    document.getElementById('bulk-skipped').textContent = skipped;
                    continue;
                }

                const notePath = page.file.path;
                const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, structuredContent);

                // 오프라인 캐시 확인
                let audioBlob = null;
                try {
                    audioBlob = await window.offlineCacheManager.getAudio(cacheKey);
                } catch (err) { console.debug('[Bulk] offline cache read failed:', err.message); }

                // 서버 캐시 확인
                if (!audioBlob) {
                    const cached = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
                    if (cached) {
                        audioBlob = cached.audioBlob;
                    }
                }

                if (audioBlob) {
                    skipped++;
                    document.getElementById('bulk-skipped').textContent = skipped;
                    continue;
                }

                // TTS 생성
                audioBlob = await window.callAzureTTS(structuredContent);

                if (!audioBlob) {
                    throw new Error('TTS 생성 실패');
                }

                // 캐시에 저장
                await window.serverCacheManager.saveAudioToServer(cacheKey, audioBlob);

                try {
                    await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, notePath);
                } catch (err) { console.debug('[Bulk] offline cache save failed:', err.message); }

                generated++;
                document.getElementById('bulk-generated').textContent = generated;

            } catch (error) {
                console.error(`실패: ${noteTitle}`, error);
                failed++;
                document.getElementById('bulk-failed').textContent = failed;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        document.body.removeChild(progressDiv);

        const resultMessage = cancelled
            ? `중단됨\n\n생성: ${generated}개\n건너뜀: ${skipped}개\n실패: ${failed}개`
            : `완료!\n\n생성: ${generated}개\n건너뜀: ${skipped}개\n실패: ${failed}개`;

        alert(resultMessage);
        await window.updateCacheStatsDisplay();
    };

    window.ttsLog?.('✅ [tts-ui/tts-bulk] 모듈 로드 완료');
}
