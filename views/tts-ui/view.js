// ============================================
// tts-ui: UI 생성 + 사용량 표시 + 대량 생성
// v6.0.0 - UI/UX 전면 재설계 (반응형, 접이식, 터치 최적화)
// 의존성: 전체 TTS 모듈
// input: { pages, dv } - dv.pages() 결과 및 dv 객체
// ============================================

const reader = window.azureTTSReader;
if (!reader) {
    window.ttsLog?.('⚠️ azureTTSReader 미초기화 - tts-ui 로드 지연');
    return;
}
const config = window.ttsConfig || {};

// dv 객체를 window에 저장 (bulk 모듈에서 참조)
window._ttsDvObj = typeof dv !== 'undefined' ? dv : null;

// 모듈 로드 (app.vault.read 사용 - Obsidian app:// 프로토콜에서 <script src> 불가)
const _loadVaultModule = async (path) => {
    try {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) {
            const content = await app.vault.read(file);
            new Function(content)();
        } else {
            console.warn(`⚠️ [tts-ui] 모듈 파일 없음: ${path}`);
        }
    } catch(e) {
        console.warn(`⚠️ [tts-ui] 모듈 로드 실패 (무시): ${path}`, e.message);
    }
};
await _loadVaultModule('views/tts-ui/modules/tts-styles.js');
await _loadVaultModule('views/tts-ui/modules/tts-usage.js');
await _loadVaultModule('views/tts-ui/modules/tts-bulk.js');

// ============================================
// 캐시 통계, 사용량 조회/표시 → modules/tts-usage.js로 추출됨
// 전체 노트 TTS 일괄 생성 → modules/tts-bulk.js로 추출됨
// ============================================

// ============================================
// UI 생성 (dv 사용)
// ============================================
const pages = input?.pages || window.azureTTSReader?.pages || [];

// 메인 컨테이너
const mainContainer = dv.container.createEl('div', { cls: 'tts-container' });

// ============================================
// 섹션 1: 플레이어 컨트롤 (최상단 - 가장 자주 사용)
// ============================================
const playerPanel = mainContainer.createEl('div', { cls: 'tts-panel' });

// 헤더: 타이틀 + 모드 뱃지
const headerRow = playerPanel.createEl('div', {
    attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--tts-space-sm); margin-bottom: var(--tts-space-md);' }
});

headerRow.createEl('div', {
    text: 'Azure TTS v5.1.0',
    attr: { style: 'color: var(--tts-text); font-size: var(--tts-font-xl); font-weight: bold;' }
});

const modeBadgeColor = {
    'local': 'var(--tts-success)',
    'server': 'var(--tts-info)',
    'hybrid': 'var(--tts-warning)'
}[window.ttsOperationMode] || 'var(--tts-warning)';

const modeBadgeText = {
    'local': '로컬',
    'server': '서버',
    'hybrid': '하이브리드'
}[window.ttsOperationMode] || '하이브리드';

headerRow.createEl('span', {
    text: modeBadgeText,
    cls: 'tts-badge',
    attr: { style: `background: ${modeBadgeColor};  color: white;` }
});

// 현재 재생 정보 + 동기화 상태
const nowPlayingBox = playerPanel.createEl('div', {
    attr: {
        id: 'last-played-info',
        cls: 'tts-glass-box',
        style: 'margin-bottom: var(--tts-space-md); line-height: 1.5;'
    }
});

if (reader.lastPlayedIndex >= 0 && reader.pages[reader.lastPlayedIndex]) {
    const lastNote = reader.pages[reader.lastPlayedIndex];
    const lastTimestamp = localStorage.getItem('azureTTS_lastPlayedTimestamp');
    const lastTime = lastTimestamp ? new Date(parseInt(lastTimestamp)).toLocaleString('ko-KR') : '';

    nowPlayingBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--tts-space-sm); margin-bottom: var(--tts-space-xs);">
            <strong>마지막 재생:</strong> [${reader.lastPlayedIndex + 1}/${reader.pages.length}] ${lastNote.file.name}
        </div>
        ${lastTime ? `<small style="opacity: 0.8;">${lastTime}</small>` : ''}
    `;
} else {
    nowPlayingBox.innerHTML = `<div style="display: flex; align-items: center; gap: var(--tts-space-sm);"><strong>준비 완료</strong> - 재생 버튼을 클릭하세요</div>`;
}

// 동기화 상태
const syncStatusDiv = playerPanel.createEl('div', {
    attr: {
        id: 'sync-status-info',
        style: 'margin-bottom: var(--tts-space-md); padding: var(--tts-space-sm) var(--tts-space-md); background: rgba(33,150,243,0.2); border-radius: var(--tts-radius-sm); color: var(--tts-text); font-size: var(--tts-font-sm); display: flex; align-items: center; gap: var(--tts-space-sm);'
    }
});
syncStatusDiv.innerHTML = `<span id="sync-status-text">서버 동기화 준비 완료</span>`;

// 재생 컨트롤 버튼들
const controlsRow = playerPanel.createEl('div', { cls: 'tts-player-controls' });

const prevBtn = controlsRow.createEl('button', { text: '이전', cls: 'tts-btn tts-btn-purple' });
prevBtn.onclick = window.azureTTSPrevious;

const toggleBtn = controlsRow.createEl('button', {
    text: '재생',
    cls: 'tts-btn tts-btn-primary tts-play-main',
    attr: { id: 'tts-toggle-play-pause-btn' }
});
toggleBtn.onclick = window.azureTTSTogglePlayPause;

const stopBtn = controlsRow.createEl('button', { text: '정지', cls: 'tts-btn tts-btn-danger' });
stopBtn.onclick = window.azureTTSStop;

const nextBtn = controlsRow.createEl('button', { text: '다음', cls: 'tts-btn tts-btn-info' });
nextBtn.onclick = window.azureTTSNext;

// 속도 컨트롤
const rateRow = playerPanel.createEl('div', { cls: 'tts-rate-controls' });

rateRow.createEl('span', { text: '속도:', cls: 'tts-rate-label' });
rateRow.createEl('span', { text: '1.0x', cls: 'tts-rate-value', attr: { id: 'rate-display' } });

const createRateBtn = (text, color, onClick) => {
    const btn = rateRow.createEl('button', { text, cls: 'tts-btn tts-rate-btn' });
    btn.style.background = color;
    btn.onclick = onClick;
    return btn;
};

createRateBtn('느리게', 'var(--tts-success)', () => {
    const currentRate = window.azureTTSReader?.playbackRate || 1.0;
    const newRate = Math.max(0.5, parseFloat(currentRate) - 0.1);
    window.azureTTSSetRate(newRate.toFixed(1));
});

createRateBtn('정속', 'var(--tts-info)', () => {
    window.azureTTSSetRate('1.0');
});

createRateBtn('빠르게', 'var(--tts-warning)', () => {
    const currentRate = window.azureTTSReader?.playbackRate || 1.0;
    const newRate = Math.min(2.0, parseFloat(currentRate) + 0.1);
    window.azureTTSSetRate(newRate.toFixed(1));
});

// ============================================
// 섹션 2: 노트 목록 테이블
// ============================================
const noteListHeader = mainContainer.createEl('h3', {
    text: `총 ${pages.length}개의 노트 (출제예상 + 130~137회 기출)`,
    attr: { style: 'margin: 0;' }
});

const tableDiv = mainContainer.createEl('table', { cls: 'tts-note-table' });

const thead = tableDiv.createEl('thead');
const headerTr = thead.createEl('tr');
[
    { text: '재생', cls: '', style: 'width: 50px; text-align: center;' },
    { text: '토픽', cls: 'tts-col-topic', style: '' },
    { text: '정의 (미리보기)', cls: 'tts-col-preview', style: '' },
    { text: '캐시', cls: '', style: 'width: 60px; text-align: center;' },
    { text: '관리', cls: 'tts-col-actions', style: 'width: 90px; text-align: center;' }
].forEach(col => {
    headerTr.createEl('th', {
        text: col.text,
        cls: col.cls,
        attr: { style: col.style }
    });
});

const tbody = tableDiv.createEl('tbody');

pages.forEach((p, idx) => {
    const row = tbody.createEl('tr', {
        attr: { id: `note-row-${idx}` }
    });

    // 재생 버튼
    const playCell = row.createEl('td', {
        attr: { style: 'text-align: center;' }
    });
    const playBtnItem = playCell.createEl('button', {
        text: '▶',
        cls: 'tts-btn tts-btn-primary tts-note-play-btn'
    });
    playBtnItem.onclick = function() { window.azureTTSPlayFrom(idx); };

    // 토픽
    const topicCell = row.createEl('td', { cls: 'tts-col-topic' });
    topicCell.createEl('a', { text: p.file.name, attr: { href: p.file.path, class: 'internal-link' } });

    // 정의 미리보기
    row.createEl('td', {
        text: p.정의 ? String(p.정의).substring(0, 80) + "..." : "-",
        cls: 'tts-col-preview',
        attr: { style: 'color: var(--text-muted, #666); font-size: var(--tts-font-sm);' }
    });

    // 캐시 상태
    const cacheStatusCell = row.createEl('td', {
        attr: { style: 'text-align: center;' }
    });
    cacheStatusCell.createEl('span', {
        attr: {
            id: `cache-status-${idx}`,
            text: '...',
            style: 'font-size: var(--tts-font-lg); cursor: help;',
            title: '캐시 상태 확인 중...'
        }
    });

    // 캐시 관리 버튼
    const actionsCell = row.createEl('td', {
        cls: 'tts-col-actions',
        attr: { style: 'text-align: center;' }
    });

    // 삭제 버튼
    const deleteCacheBtn = actionsCell.createEl('button', {
        text: '삭제',
        attr: {
            style: 'padding: 2px 6px; cursor: pointer; border: none; background: var(--tts-danger); color: white; border-radius: 3px; font-size: 11px; margin-right: 2px;',
            title: '캐시 삭제'
        }
    });
    deleteCacheBtn.onclick = async function() {
        const page = pages[idx];
        const notePath = page.file.path;
        const content = window.serverCacheManager.getNoteContent(page);
        const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);

        const confirmed = confirm(`"${page.file.name}"의 캐시를 삭제하시겠습니까?\n\n오프라인 캐시와 서버 캐시가 모두 삭제됩니다.`);
        if (!confirmed) return;

        try {
            const result = await window.serverCacheManager.deleteCacheFromBoth(cacheKey);

            let message = `"${page.file.name}" 캐시 삭제 완료:\n`;
            if (result.offline) message += '- 오프라인 캐시 삭제됨\n';
            if (result.server) message += '- 서버 캐시 삭제됨\n';
            if (result.errors.length > 0) {
                message += '\n오류:\n' + result.errors.join('\n');
            }

            alert(message);

            if (window.updateCacheStatusForNote) {
                window.updateCacheStatusForNote(idx, cacheKey);
            } else {
                document.getElementById(`cache-status-${idx}`)?.replaceChildren('X');
            }
        } catch (error) {
            alert(`캐시 삭제 실패: ${error.message}`);
        }
    };

    // 재생성 버튼
    const regenerateCacheBtn = actionsCell.createEl('button', {
        text: '재생성',
        attr: {
            style: 'padding: 2px 6px; cursor: pointer; border: none; background: var(--tts-info); color: white; border-radius: 3px; font-size: 11px;',
            title: '캐시 재생성'
        }
    });
    regenerateCacheBtn.onclick = async function() {
        const page = pages[idx];
        const notePath = page.file.path;
        const content = window.serverCacheManager.getNoteContent(page);
        const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);

        const confirmed = confirm(`"${page.file.name}"의 캐시를 재생성하시겠습니까?\n\n기존 캐시가 삭제되고 새로운 TTS가 생성됩니다.`);
        if (!confirmed) return;

        try {
            regenerateCacheBtn.disabled = true;
            regenerateCacheBtn.textContent = '...';
            document.getElementById(`cache-status-${idx}`)?.replaceChildren('...');

            const result = await window.serverCacheManager.regenerateCache(
                cacheKey,
                page,
                content,
                window.azureTTSReader?.apiEndpoint || window.getActiveBaseUrl() + (window.ttsConfig?.ttsEndpoint || '/api/tts-stream'),
                window.ttsConfig?.defaultVoice || 'ko-KR-SunHiNeural'
            );

            regenerateCacheBtn.disabled = false;
            regenerateCacheBtn.textContent = '재생성';

            let message = `"${page.file.name}" 캐시 재생성 완료:\n`;
            message += `- TTS 생성됨 (${(result.audioBlob.size / 1024).toFixed(1)} KB)\n`;
            message += '- 재생 시 종소리가 추가됩니다';

            alert(message);

            if (window.updateCacheStatusForNote) {
                window.updateCacheStatusForNote(idx, cacheKey);
            } else {
                document.getElementById(`cache-status-${idx}`)?.replaceChildren('OK');
            }
        } catch (error) {
            regenerateCacheBtn.disabled = false;
            regenerateCacheBtn.textContent = '재생성';
            alert(`캐시 재생성 실패: ${error.message}`);
        }
    };
});

// ============================================
// 섹션 3: 설정 (접이식)
// ============================================
const settingsDetails = mainContainer.createEl('details', { cls: 'tts-collapsible' });
settingsDetails.createEl('summary', { text: '설정' });

const settingsContent = settingsDetails.createEl('div', { cls: 'tts-collapsible-content' });

// 모드 설명
const modeDescBox = settingsContent.createEl('div', {
    cls: 'tts-glass-box',
    attr: { style: 'margin-bottom: var(--tts-space-md);' }
});
modeDescBox.createEl('div', {
    text: window.ttsModeConfig?.description || 'TTS는 로컬, 캐시/동기화는 Azure',
    attr: { style: 'font-size: var(--tts-font-sm); color: var(--tts-text-muted);' }
});

// API 모드 토글
const apiToggleRow = settingsContent.createEl('label', { cls: 'tts-toggle-row' });
const apiCheckbox = apiToggleRow.createEl('input', {
    attr: { type: 'checkbox', id: 'use-paid-api-control' }
});
if (window.apiKeyConfig.usePaidApi) {
    apiCheckbox.checked = true;
}
apiToggleRow.createEl('span', { text: '유료 API 사용 (S0)', attr: { style: 'font-weight: bold;' } });

apiCheckbox.addEventListener('change', function(e) {
    const usePaid = e.target.checked;
    window.apiKeyConfig.usePaidApi = usePaid;
    localStorage.setItem('azureTTS_usePaidApi', usePaid.toString());
    window.updateUsageDisplay?.();
    alert(`${usePaid ? '유료 API (S0)' : '무료 API (F0)'}로 전환되었습니다.`);
});

// TTS 엔드포인트 토글
if (window.ttsEndpointConfig.localEdgeTtsUrl) {
    const endpointToggleRow = settingsContent.createEl('label', { cls: 'tts-toggle-row' });
    const endpointCheckbox = endpointToggleRow.createEl('input', {
        attr: { type: 'checkbox', id: 'use-local-edge-tts' }
    });

    if (window.ttsEndpointConfig.useLocalEdgeTts) {
        endpointCheckbox.checked = true;
    }

    endpointToggleRow.createEl('span', { text: '로컬 Edge TTS 사용 (무료, 고음질)', attr: { style: 'font-weight: bold;' } });

    const statusSpan = settingsContent.createEl('div', {
        attr: {
            id: 'endpoint-status',
            style: 'font-size: var(--tts-font-sm); color: var(--tts-text-muted); padding: var(--tts-space-xs) 0 var(--tts-space-sm);'
        }
    });
    statusSpan.textContent = window.ttsEndpointConfig.useLocalEdgeTts
        ? 'Mac Mini Edge TTS 프록시 사용 중'
        : 'Azure Function 사용 중';

    endpointCheckbox.addEventListener('change', function(e) {
        const useLocal = e.target.checked;
        window.ttsEndpointConfig.useLocalEdgeTts = useLocal;
        localStorage.setItem('azureTTS_useLocalEdgeTts', useLocal.toString());

        const newBaseUrl = useLocal
            ? window.ttsEndpointConfig.localEdgeTtsUrl.replace(/\/api\/.*$/, '')
            : window.ttsEndpointConfig.azureFunctionUrl;

        const newTtsEndpoint = useLocal
            ? window.ttsEndpointConfig.localEdgeTtsUrl
            : window.ttsEndpointConfig.azureFunctionUrl + (config.ttsEndpoint || '/api/tts-stream');
        reader.apiEndpoint = newTtsEndpoint;

        if (window.serverCacheManager) {
            window.serverCacheManager.cacheApiEndpoint = newBaseUrl + (config.cacheEndpoint || '/api/cache');
        }

        statusSpan.textContent = useLocal
            ? 'Mac Mini Edge TTS 프록시 사용 중'
            : 'Azure Function 사용 중';

        alert(`${useLocal ? '로컬 Edge TTS (무료)' : 'Azure Function'}로 전환되었습니다.`);
    });
}

// ============================================
// 섹션 4: 캐시 관리 (접이식)
// ============================================
const cacheDetails = mainContainer.createEl('details', { cls: 'tts-collapsible' });
cacheDetails.createEl('summary', { text: '캐시 관리' });

const cacheContent = cacheDetails.createEl('div', { cls: 'tts-collapsible-content' });

// 캐시 통계
const statsDiv = cacheContent.createEl('div', {
    attr: {
        id: 'cache-stats-content',
        cls: 'tts-glass-box',
        style: 'margin-bottom: var(--tts-space-md);'
    }
});

statsDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--tts-space-xs); font-size: var(--tts-font-md);">
        <div>총 요청: <strong id="cached-count">0</strong></div>
        <div>캐시 히트: <strong id="hit-count">0</strong></div>
        <div>캐시 미스: <strong id="miss-count">0</strong></div>
        <div>히트율: <strong id="hit-rate">0%</strong></div>
    </div>
`;

// 캐시 관리 버튼들
const cacheActionsDiv = cacheContent.createEl('div', { cls: 'tts-cache-actions' });

const refreshStatsBtn = cacheActionsDiv.createEl('button', { text: '통계 새로고침', cls: 'tts-btn tts-btn-primary', attr: { style: 'font-size: var(--tts-font-sm);' } });
refreshStatsBtn.onclick = () => window.updateCacheStatsDisplay?.();

const resetStatsBtn = cacheActionsDiv.createEl('button', { text: '통계 초기화', cls: 'tts-btn tts-btn-warning', attr: { style: 'font-size: var(--tts-font-sm);' } });
resetStatsBtn.onclick = function() {
    window.serverCacheManager.resetStats();
    window.updateCacheStatsDisplay?.();
    alert('캐시 통계가 초기화되었습니다.');
};

const clearOfflineBtn = cacheActionsDiv.createEl('button', { text: '오프라인 캐시 삭제', cls: 'tts-btn tts-btn-purple', attr: { style: 'font-size: var(--tts-font-sm);' } });
clearOfflineBtn.onclick = async function() {
    if (!confirm('오프라인 캐시를 모두 삭제하시겠습니까?')) return;
    try {
        const statsBefore = await window.offlineCacheManager.getCacheStats();
        await window.offlineCacheManager.clearAll();
        await window.updateCacheStatsDisplay?.();
        alert(`오프라인 캐시 ${statsBefore.count}개 (${statsBefore.totalSizeMB}MB)를 삭제했습니다.`);
    } catch (error) {
        alert(`오프라인 캐시 삭제 실패: ${error.message}`);
    }
};

const bulkGenerateBtn = cacheActionsDiv.createEl('button', { text: '전체 TTS 일괄 생성', cls: 'tts-btn tts-btn-info', attr: { style: 'font-size: var(--tts-font-sm);' } });
bulkGenerateBtn.onclick = window.bulkGenerateAllNotes;

const clearAllCacheBtn = cacheActionsDiv.createEl('button', { text: '전체 캐시 삭제', cls: 'tts-btn tts-btn-danger', attr: { style: 'font-size: var(--tts-font-sm);' } });
clearAllCacheBtn.onclick = async function() {
    if (!confirm('모든 캐시를 삭제하시겠습니까?')) return;

    const results = { server: null, offline: null };

    // 현재 사용 중인 서버 확인
    const useLocalEdgeTts = window.ttsEndpointConfig?.useLocalEdgeTts;
    const serverName = useLocalEdgeTts ? '로컬 Edge TTS' : 'Azure Function';
    window.ttsLog(`${serverName} 서버 캐시 삭제 시작`);

    try {
        let cacheApiEndpoint;
        if (useLocalEdgeTts && window.ttsEndpointConfig?.localEdgeTtsUrl) {
            cacheApiEndpoint = window.ttsEndpointConfig.localEdgeTtsUrl.replace(/\/api\/.*$/, '/api/cache-clear');
        } else {
            cacheApiEndpoint = window.ttsEndpointConfig.azureFunctionUrl + (config.cacheEndpoint || '/api/cache');
            cacheApiEndpoint = `${cacheApiEndpoint}-clear`;
        }

        const headers = {};
        if (!useLocalEdgeTts && window.apiKeyConfig?.usePaidApi && window.apiKeyConfig?.paidKey) {
            headers['X-Azure-Speech-Key'] = window.apiKeyConfig.paidKey;
            window.ttsLog('유료 API 키로 서버 캐시 삭제 요청');
        }

        const clearResponse = await window.fetchWithTimeout(cacheApiEndpoint, {
            method: 'DELETE',
            headers: headers
        }, 15000);

        if (!clearResponse.ok) throw new Error(`HTTP ${clearResponse.status}`);
        const clearData = await clearResponse.json();
        results.server = clearData.deletedCount;
        localStorage.setItem('ttsServerCacheClearTime', Date.now().toString());
        window.ttsLog(`${serverName} 서버 캐시 삭제 완료: ${clearData.deletedCount}개`);
    } catch (error) {
        results.server = error.message;
        // 서버 삭제 실패해도 60초 스킵 활성화 → 일괄생성 시 서버 캐시 무시하고 재생성
        localStorage.setItem('ttsServerCacheClearTime', Date.now().toString());
        window.ttsLog(`${serverName} 서버 캐시 삭제 실패: ${error.message} (60초 서버 캐시 스킵 활성화)`);
    }

    try {
        const offlineStats = await window.offlineCacheManager.getCacheStats();
        await window.offlineCacheManager.clearAll();
        results.offline = offlineStats.count;
    } catch (error) {
        results.offline = error.message;
    }

    window.serverCacheManager.resetStats();
    await window.updateCacheStatsDisplay?.();

    const serverMsg = typeof results.server === 'number' ? `${results.server}개 삭제` : `실패 (${results.server})`;
    const offlineMsg = typeof results.offline === 'number' ? `${results.offline}개 삭제` : `실패 (${results.offline})`;

    let alertMessage = `캐시 삭제 결과\n\n- ${serverName}: ${serverMsg}\n- 오프라인: ${offlineMsg}`;
    if (typeof results.server === 'number') {
        alertMessage += '\n\n60초 동안 서버 캐시 조회를 건너뜁니다.';
    } else {
        alertMessage += '\n\n서버 삭제 실패했지만, 60초 내 일괄생성 시 서버 캐시를 무시하고 재생성합니다.';
    }
    alert(alertMessage);
};

// ============================================
// 섹션 5: API 사용량 (접이식)
// ============================================
const usageDetails = mainContainer.createEl('details', { cls: 'tts-collapsible' });
usageDetails.createEl('summary', { text: 'API 사용량 (이번 달)' });

const usageContent = usageDetails.createEl('div', { cls: 'tts-collapsible-content' });

const usageDiv = usageContent.createEl('div', {
    attr: { id: 'tts-usage-azure' }
});

usageDiv.innerHTML = `
    <div class="tts-glass-box" style="text-align: center; color: var(--tts-text-muted);">
        사용량 로딩 중...
    </div>
`;

// ============================================
// 캐시 상태 확인 함수 → modules/tts-usage.js로 추출됨
// ============================================

// ============================================
// 초기 로딩
// ============================================
(async () => {
    await window.updateUsageDisplay?.();

    if (window.updateAllCacheStatus) {
        setTimeout(() => {
            window.updateAllCacheStatus();
        }, 500);
    }
})();

setTimeout(() => {
    if (window.serverCacheManager && window.serverCacheManager.stats) {
        window.updateCacheStatsDisplay?.();
    }
}, 100);

window.ttsLog('✅ [tts-ui] 모듈 로드 완료 (v6.0.0 - UI/UX 재설계)');
