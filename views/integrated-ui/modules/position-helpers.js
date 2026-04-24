// ============================================
// position-helpers: 통합 노트 위치 관리 유틸리티
// scrollToRow, findCenterRow, savePosition, gotoPosition, getTTSPosition
// 의존성: tts-core, scroll-manager (선택적)
// ============================================

if (!window._integratedPositionHelpers) {
    window._integratedPositionHelpers = true;

    /**
     * 팩토리: 위치 관리 함수 세트 생성
     * @param {Object} deps - { rows, getPageNames, getPageFolders, scrollPositionManager 등 }
     * @returns {Object} { scrollToRow, findCenterRow, savePosition, gotoPosition, getTTSPosition }
     */
    window.createPositionHelpers = function(deps) {
        const { rows } = deps;

        const scrollToRow = (row) => {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 800);
        };

        const findCenterRow = () => {
            const mid = window.innerHeight / 2;
            let closest = -1, minDist = Infinity;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].classList.contains('in-hidden')) continue;
                const rect = rows[i].getBoundingClientRect();
                if (rect.top > window.innerHeight || rect.bottom < 0) continue;
                const dist = Math.abs(mid - (rect.top + rect.height / 2));
                if (dist < minDist) { minDist = dist; closest = i; }
            }
            return closest;
        };

        const savePosition = async () => {
            const idx = findCenterRow();
            if (idx < 0 || !window.currentPageNames?.[idx]) return -1;
            const noteName = window.currentPageNames[idx];
            const timestamp = Date.now();
            if (window.scrollPositionManager) {
                window.scrollPositionManager.saveLocalPosition(noteName, idx, timestamp);
                try { await window.scrollPositionManager.savePosition(noteName, idx); return idx; }
                catch (e) { console.error('위치 저장 실패:', e); return -1; }
            } else {
                localStorage.setItem('scroll_lastNoteName', noteName);
                localStorage.setItem('scroll_lastNoteIndex', idx.toString());
                localStorage.setItem('scroll_lastTimestamp', timestamp.toString());
                return idx;
            }
        };

        const gotoPosition = async () => {
            let noteName = '';
            if (window.scrollPositionManager) {
                try {
                    const serverData = await window.scrollPositionManager.getPosition(true);
                    if (serverData.savedNoteName) {
                        noteName = serverData.savedNoteName;
                        window.scrollPositionManager.saveLocalPosition(serverData.savedNoteName, serverData.savedIndex, serverData.timestamp || Date.now());
                    }
                } catch (e) { console.warn('서버 위치 조회 실패:', e.message); }
            }
            if (!noteName) {
                noteName = localStorage.getItem('scroll_lastNoteName') || '';
            }
            if (!noteName) return -1;
            const idx = window.currentPageNames?.indexOf(noteName);
            if (idx >= 0 && rows[idx]) {
                requestAnimationFrame(() => {
                    scrollToRow(rows[idx]);
                    rows[idx].style.backgroundColor = '#ffeb3b33';
                    setTimeout(() => { requestAnimationFrame(() => { rows[idx].style.backgroundColor = ''; }); }, 3000);
                });
                return idx;
            }
            return -1;
        };

        const getTTSPosition = async () => {
            // Edge-First 순차 조회: Edge 성공 시 Azure 호출 안 함 (비용/전력 최소화)
            const edgeBase = (window.ttsEndpointConfig?.edgeServerUrl || window.ObsidianTTSConfig?.edgeServerUrl || 'http://100.107.208.106:5051').replace(/\/$/, '');

            const fetchPosition = async (label, url, timeout) => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);
                    const response = await fetch(url, {
                        method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (response.ok) {
                        const data = await response.json();
                        if (data?.timestamp) return { ...data, _source: label };
                    }
                } catch (e) {
                    window.ttsLog?.(`⚠️ [getTTSPosition] ${label} 실패: ${e.message}`);
                }
                return null;
            };

            // 1차: Edge 서버 (5초 timeout)
            const edgeData = await fetchPosition('Edge', edgeBase + '/api/playback-position', 5000);
            if (edgeData) {
                window.ttsLog?.(`📍 [getTTSPosition] Edge 성공: "${edgeData.noteTitle}" index=${edgeData.lastPlayedIndex}`);
                const localTimestamp = parseInt(localStorage.getItem('ttsPlayer_lastPlayedTimestamp') || '0', 10);
                if (edgeData.timestamp > localTimestamp) {
                    localStorage.setItem('ttsPlayer_lastPlayedIndex', edgeData.lastPlayedIndex.toString());
                    localStorage.setItem('ttsPlayer_lastPlayedTimestamp', edgeData.timestamp.toString());
                    if (edgeData.noteTitle) localStorage.setItem('ttsPlayer_lastPlayedTitle', edgeData.noteTitle);
                }
                return { index: edgeData.lastPlayedIndex, noteTitle: edgeData.noteTitle || '', notePath: edgeData.notePath || '' };
            }

            // 2차: Edge 실패 시에만 Azure fallback (10초 timeout)
            const azureBase = (window.ttsEndpointConfig?.azureFunctionUrl || window.ObsidianTTSConfig?.azureFunctionUrl || window.TTS_CONSTANTS?.AZURE_FUNCTION_URL || '').replace(/\/$/, '');
            const azureData = await fetchPosition('Azure', azureBase + '/api/playback-position', 10000);
            if (azureData) {
                window.ttsLog?.(`📍 [getTTSPosition] Azure fallback: "${azureData.noteTitle}" index=${azureData.lastPlayedIndex}`);
                const localTimestamp = parseInt(localStorage.getItem('ttsPlayer_lastPlayedTimestamp') || '0', 10);
                if (azureData.timestamp > localTimestamp) {
                    localStorage.setItem('ttsPlayer_lastPlayedIndex', azureData.lastPlayedIndex.toString());
                    localStorage.setItem('ttsPlayer_lastPlayedTimestamp', azureData.timestamp.toString());
                    if (azureData.noteTitle) localStorage.setItem('ttsPlayer_lastPlayedTitle', azureData.noteTitle);
                }
                return { index: azureData.lastPlayedIndex, noteTitle: azureData.noteTitle || '', notePath: azureData.notePath || '' };
            }

            // 모두 실패: localStorage 폴백
            return {
                index: parseInt(localStorage.getItem('ttsPlayer_lastPlayedIndex') || '-1', 10),
                noteTitle: localStorage.getItem('ttsPlayer_lastPlayedTitle') || '',
                notePath: localStorage.getItem('ttsPlayer_lastPlayedNotePath') || ''
            };
        };

        return { scrollToRow, findCenterRow, savePosition, gotoPosition, getTTSPosition };
    };

    window.ttsLog?.('✅ [integrated-ui/position-helpers] 모듈 로드 완료');
}
