// ============================================
// tts-ui: UI 생성 + 사용량 표시 + 대량 생성
// v6.0.0 - UI/UX 전면 재설계 (반응형, 접이식, 터치 최적화)
// 의존성: 전체 TTS 모듈
// input: { pages, dv } - dv.pages() 결과 및 dv 객체
// ============================================

const reader = window.ttsPlayer?.state;
if (!reader) {
    window.ttsLog?.('⚠️ ttsPlayer.state 미초기화 - tts-ui 로드 지연');
    return;
}
const config = window.ttsConfig || {};

// dv 객체를 window에 저장 (bulk 모듈에서 참조)
window._ttsDvObj = typeof dv !== 'undefined' ? dv : null;

// CONFIG를 window에 저장 (bulk 모듈에서 참조)
if (input?.CONFIG) {
    window._ttsConfig = input.CONFIG;
}

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
await _loadVaultModule('3_Resource/obsidian/views/tts-ui/modules/tts-styles.js');
await _loadVaultModule('3_Resource/obsidian/views/tts-ui/modules/tts-usage.js');
await _loadVaultModule('3_Resource/obsidian/views/tts-ui/modules/tts-bulk.js');

// ============================================
// 캐시 통계, 사용량 조회/표시 → modules/tts-usage.js로 추출됨
// 전체 노트 TTS 일괄 생성 → modules/tts-bulk.js로 추출됨
// ============================================

// ============================================
// UI 생성 (dv 사용)
// ============================================
const pages = input?.pages || window.ttsPlayer.state?.pages || [];

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
    text: 'TTS Player v6.0.0',
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
const nowPlayingBox = playerPanel.createEl('div', { cls: 'tts-glass-box' });
nowPlayingBox.id = 'last-played-info';
nowPlayingBox.style.cssText = 'margin-bottom: var(--tts-space-md); line-height: 1.5;';
window._ttsLastPlayedDiv = nowPlayingBox;

// 재생 상태에 따라 초기 표시 결정
const _activeAudio = window._ttsGetActiveAudio?.();
const _isCurrentlyPlaying = _activeAudio && !_activeAudio.paused && reader.isPlaying;

if (_isCurrentlyPlaying && reader.currentIndex >= 0 && reader.pages[reader.currentIndex]) {
    const currentNote = reader.pages[reader.currentIndex];
    nowPlayingBox.innerHTML = `▶️ 재생 중: <strong>[${reader.currentIndex + 1}/${reader.pages.length}]</strong> ${window._ttsEscapeHtml?.(currentNote.file.name) || currentNote.file.name}`;
} else if (reader.lastPlayedIndex >= 0 && reader.pages[reader.lastPlayedIndex]) {
    const lastNote = reader.pages[reader.lastPlayedIndex];
    const lastTimestamp = localStorage.getItem('ttsPlayer_lastPlayedTimestamp');
    const lastTime = lastTimestamp ? new Date(parseInt(lastTimestamp)).toLocaleString('ko-KR') : '';

    nowPlayingBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--tts-space-sm); margin-bottom: var(--tts-space-xs);">
            <strong>마지막 재생:</strong> [${reader.lastPlayedIndex + 1}/${reader.pages.length}] ${window._ttsEscapeHtml?.(lastNote.file.name) || lastNote.file.name}
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
prevBtn.onclick = window.ttsPlayer.previous;

const toggleBtn = controlsRow.createEl('button', {
    text: _isCurrentlyPlaying ? '⏸️ 일시정지' : '▶️ 재생',
    cls: 'tts-btn tts-btn-primary tts-play-main'
});
toggleBtn.id = 'tts-toggle-play-pause-btn';
if (_isCurrentlyPlaying) toggleBtn.style.background = '#FF9800';
toggleBtn.onclick = window.ttsPlayer.togglePlayPause;
window._ttsToggleBtn = toggleBtn;

const stopBtn = controlsRow.createEl('button', { text: '정지', cls: 'tts-btn tts-btn-danger' });
stopBtn.onclick = window.ttsPlayer.stop;

const nextBtn = controlsRow.createEl('button', { text: '다음', cls: 'tts-btn tts-btn-info' });
nextBtn.onclick = window.ttsPlayer.next;

// ============================================
// 플레이백 모드 (2026-04-24 추가): 랜덤 재생 + 도메인 필터
// ============================================
const modeRow = playerPanel.createEl('div', {
    attr: { style: 'display: flex; gap: var(--tts-space-md); align-items: center; margin-top: var(--tts-space-sm); flex-wrap: wrap;' }
});

// 랜덤 재생 체크박스
const shuffleLabel = modeRow.createEl('label', {
    attr: { style: 'display: flex; align-items: center; gap: var(--tts-space-xs); cursor: pointer; color: var(--tts-text); font-size: var(--tts-font-sm);' }
});
const shuffleCheckbox = shuffleLabel.createEl('input', { attr: { type: 'checkbox', id: 'tts-shuffle-checkbox' } });
shuffleLabel.createEl('span', { text: '🔀 랜덤 재생' });

shuffleCheckbox.checked = localStorage.getItem('ttsPlayer_shuffle') === 'true';
shuffleCheckbox.onchange = function() {
    window.ttsPlayer.setShuffle(this.checked);
    localStorage.setItem('ttsPlayer_shuffle', String(this.checked));
};

// 도메인 셀렉트 라벨
modeRow.createEl('span', {
    text: '도메인:',
    attr: { style: 'color: var(--tts-text); font-size: var(--tts-font-sm); margin-left: var(--tts-space-md);' }
});

// 도메인 셀렉트박스
const domainSelect = modeRow.createEl('select', {
    attr: { id: 'tts-domain-select', style: 'padding: var(--tts-space-xs) var(--tts-space-sm); border-radius: var(--tts-radius-sm); background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); font-size: var(--tts-font-sm);' }
});
domainSelect.createEl('option', { text: '전체', attr: { value: '' } });

// 도메인 동적 추출: pages[].file.path 의 '1_Project/정보 관리 기술사/' 다음 첫 세그먼트 중 /^[1-9]_/ 매치
(function populateDomains() {
    const DOMAIN_PREFIX = '1_Project/정보 관리 기술사/';
    const srcPages = window.ttsPlayer.state.originalPages || pages || [];
    const domainSet = new Set();
    for (const p of srcPages) {
        const path = p?.file?.path;
        if (!path || !path.startsWith(DOMAIN_PREFIX)) continue;
        const firstSeg = path.slice(DOMAIN_PREFIX.length).split('/')[0];
        if (firstSeg && /^[1-9]_/.test(firstSeg)) domainSet.add(firstSeg);
    }
    Array.from(domainSet).sort().forEach(d => {
        domainSelect.createEl('option', { text: d, attr: { value: d } });
    });
})();

// localStorage 에서 이전 선택 복원
const savedDomain = localStorage.getItem('ttsPlayer_domainFilter') || '';
if (savedDomain && Array.from(domainSelect.options).some(o => o.value === savedDomain)) {
    domainSelect.value = savedDomain;
}

domainSelect.onchange = function() {
    const val = this.value;
    window.ttsPlayer.setDomainFilter(val);
    localStorage.setItem('ttsPlayer_domainFilter', val);
};

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
    const currentRate = window.ttsPlayer.state?.playbackRate || 1.0;
    const newRate = Math.max(0.5, parseFloat(currentRate) - 0.1);
    window.ttsPlayer.setRate(newRate.toFixed(1));
});

createRateBtn('정속', 'var(--tts-info)', () => {
    window.ttsPlayer.setRate('1.0');
});

createRateBtn('빠르게', 'var(--tts-warning)', () => {
    const currentRate = window.ttsPlayer.state?.playbackRate || 1.0;
    const newRate = Math.min(2.0, parseFloat(currentRate) + 0.1);
    window.ttsPlayer.setRate(newRate.toFixed(1));
});

// TTS 재생성 버튼 (현재 노트)
const regenRow = playerPanel.createEl('div', { attr: { style: 'margin-top: var(--tts-space-sm);' } });
const regenBtn = regenRow.createEl('button', {
    text: '🔄 현재 노트 TTS 재생성',
    cls: 'tts-btn tts-btn-warning',
    attr: { style: 'width: 100%; font-size: var(--tts-font-sm);' }
});
regenBtn.onclick = async function() {
    const r = window.ttsPlayer.state;
    const idx = r?.currentIndex ?? r?.lastPlayedIndex ?? -1;
    if (idx < 0 || !r.pages[idx]) {
        alert('재생성할 노트가 없습니다. 먼저 노트를 재생하세요.');
        return;
    }
    const page = r.pages[idx];
    const notePath = page.file.path;
    const content = window.serverCacheManager.getNoteContent(page);
    const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);

    if (!confirm(`"${page.file.name}" TTS를 재생성하시겠습니까?`)) return;

    try {
        regenBtn.disabled = true;
        regenBtn.textContent = '⏳ 재생성 중...';

        const result = await window.serverCacheManager.regenerateCache(
            cacheKey, page, content,
            r.apiEndpoint || window.getActiveBaseUrl() + (window.ttsConfig?.ttsEndpoint || '/api/tts-stream'),
            window.ttsConfig?.defaultVoice || 'ko-KR-SunHiNeural'
        );

        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 현재 노트 TTS 재생성';
        alert(`"${page.file.name}" TTS 재생성 완료 (${(result.audioBlob.size / 1024).toFixed(1)} KB)`);

        if (window.updateCacheStatusForNote) {
            window.updateCacheStatusForNote(idx, cacheKey);
        }
    } catch (error) {
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 현재 노트 TTS 재생성';
        alert(`TTS 재생성 실패: ${error.message}`);
    }
};

// ============================================
// 섹션 2: 캐시 관리 (접이식 — 플레이어 바로 아래)
// ============================================
const cacheDetails = mainContainer.createEl('details', { cls: 'tts-collapsible' });
cacheDetails.createEl('summary', { text: '캐시 관리' });

const cacheContent = cacheDetails.createEl('div', { cls: 'tts-collapsible-content' });

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
    const useLocalEdgeTts = window.ttsEndpointConfig?.useLocalEdgeTts;
    const serverName = useLocalEdgeTts ? '로컬 Edge TTS' : 'Azure Function';

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
        }

        const clearResponse = await window.fetchWithTimeout(cacheApiEndpoint, {
            method: 'DELETE', headers
        }, 15000);

        if (!clearResponse.ok) throw new Error(`HTTP ${clearResponse.status}`);
        const clearData = await clearResponse.json();
        results.server = clearData.deletedCount;
        localStorage.setItem('ttsServerCacheClearTime', Date.now().toString());
    } catch (error) {
        results.server = error.message;
        localStorage.setItem('ttsServerCacheClearTime', Date.now().toString());
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
    alert(`캐시 삭제 결과\n\n- ${serverName}: ${serverMsg}\n- 오프라인: ${offlineMsg}`);
};

// ============================================
// 섹션 3: 노트 목록 테이블
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
    playBtnItem.onclick = function() { window.ttsPlayer.playFrom(idx); };

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
                window.ttsPlayer.state?.apiEndpoint || window.getActiveBaseUrl() + (window.ttsConfig?.ttsEndpoint || '/api/tts-stream'),
                window.ttsConfig?.defaultVoice || 'ko-KR-SunHiNeural'
            );

            regenerateCacheBtn.disabled = false;
            regenerateCacheBtn.textContent = '재생성';

            let message = `"${page.file.name}" 캐시 재생성 완료:\n`;
            message += `- TTS 생성됨 (${(result.audioBlob.size / 1024).toFixed(1)} KB)`;

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
// 초기 로딩
// ============================================
if (window.updateAllCacheStatus) {
    setTimeout(() => {
        window.updateAllCacheStatus();
    }, 500);
}

setTimeout(() => {
    if (window.serverCacheManager && window.serverCacheManager.stats) {
        window.updateCacheStatsDisplay?.();
    }
}, 100);

// ============================================
// 포그라운드 복귀 시 재생 상태 복원 (iOS 대응)
// dataviewjs 재실행 → DOM 재생성 후 즉시 상태 복원
// ============================================
(() => {
    const r = window.ttsPlayer.state;
    if (!r) return;

    const activeAudio = window._ttsGetActiveAudio?.();
    const wasPlaying = activeAudio && !activeAudio.paused && r.isPlaying;
    const idx = r.currentIndex;

    // 1. 재생 중인 행 하이라이트 복원
    if ((wasPlaying || r.isPlaying) && idx >= 0) {
        const row = document.getElementById(`note-row-${idx}`);
        if (row) {
            row.style.background = 'linear-gradient(90deg, rgba(76,175,80,0.2), rgba(76,175,80,0.1))';
            row.style.fontWeight = 'bold';
        }
    }

    // 2. 재생/일시정지 버튼 상태 복원
    const toggleBtn = document.getElementById('tts-toggle-play-pause-btn');
    if (toggleBtn) {
        if (wasPlaying) {
            toggleBtn.textContent = '⏸️ 일시정지';
            toggleBtn.style.background = '#FF9800';
        } else if (r.isPaused && r.isPlaying) {
            toggleBtn.textContent = '▶️ 재생';
            toggleBtn.style.background = '';
        }
    }

    // 3. 속도 표시 복원
    const rateDisplay = document.getElementById('rate-display');
    if (rateDisplay && r.playbackRate) {
        rateDisplay.textContent = parseFloat(r.playbackRate).toFixed(1) + 'x';
    }

    // 4. 오디오가 일시정지되었으면 재개 시도 (DOM 재빌드로 인한 중단 복구)
    if (r._wasPlayingBeforeInterruption || (r.isPlaying && !r.isPaused && !r.isStopped && activeAudio?.paused)) {
        activeAudio?.play().then(() => {
            r._wasPlayingBeforeInterruption = false;
            window.ttsLog?.('🔄 [tts-ui] DOM 재빌드 후 재생 복구 성공');
        }).catch(e => {
            window.ttsLog?.('⚠️ [tts-ui] DOM 재빌드 후 재생 복구 실패:', e.message);
        });
    }
})();

// TTS 네임스페이스 등록
if (window.TTS) {
    window.TTS.reader = window.ttsPlayer.state;
    window.TTS.stateMachine = window.audioStateMachine;
    window.TTS.watchdog = window.audioWatchdog;
    window.TTS.registerModule('ui', { version: '6.0.0' });
}

window.ttsLog('✅ [tts-ui] 모듈 로드 완료 (v6.0.0 - UI/UX 재설계)');
