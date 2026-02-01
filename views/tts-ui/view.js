// ============================================
// tts-ui: UI 생성 + 사용량 표시 + 대량 생성
// 의존성: 전체 TTS 모듈
// input: { pages, dv } - dv.pages() 결과 및 dv 객체
// ============================================

const reader = window.azureTTSReader;
const config = window.ttsConfig || {};

// ============================================
// 캐시 통계 UI 업데이트
// ============================================
window.updateCacheStatsDisplay = async function() {
    if (!window.serverCacheManager || !window.serverCacheManager.stats) {
        console.warn('⚠️ serverCacheManager가 아직 초기화되지 않았습니다.');
        return;
    }

    const stats = window.serverCacheManager.stats;
    const hitRate = window.serverCacheManager.getHitRate();

    const cachedCountEl = document.getElementById('cached-count');
    const hitCountEl = document.getElementById('hit-count');
    const missCountEl = document.getElementById('miss-count');
    const hitRateEl = document.getElementById('hit-rate');

    if (cachedCountEl) cachedCountEl.textContent = stats.totalRequests;
    if (hitCountEl) hitCountEl.textContent = stats.cacheHits;
    if (missCountEl) missCountEl.textContent = stats.cacheMisses;
    if (hitRateEl) hitRateEl.textContent = `${hitRate}%`;

    const serverStats = await window.serverCacheManager.getServerCacheCount();

    let offlineStats = { count: 0, totalSizeMB: '0' };
    try {
        offlineStats = await window.offlineCacheManager.getCacheStats();
    } catch (error) {
        console.warn('⚠️ Failed to get offline cache stats:', error.message);
    }

    if (serverStats && cachedCountEl) {
        cachedCountEl.innerHTML = `${stats.totalRequests} <small style="color: #999;">(☁️ 서버: ${serverStats.totalFiles}개, ${serverStats.totalSizeMB}MB | 📱 오프라인: ${offlineStats.count}개, ${offlineStats.totalSizeMB}MB)</small>`;
    }
};

// ============================================
// 백엔드에서 사용량 조회
// ============================================
window.fetchUsageFromBackend = async function() {
    const baseUrl = window.ttsEndpointConfig?.azureFunctionUrl || '';
    try {
        // Azure Consumption API 우선 시도
        const azureUsageUrl = baseUrl + '/api/azure-usage';
        const azureResponse = await window.fetchWithTimeout(azureUsageUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 10000);

        if (azureResponse.ok) {
            const data = await azureResponse.json();
            reader.totalCharsUsed = data.totalChars || 0;
            localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());
            window.ttsLog('✅ Azure 실제 사용량:', data.totalChars, '자');

            // Blob Storage 사용량 추가 조회
            try {
                const storageUsageUrl = baseUrl + '/api/storage-usage';
                const storageResponse = await window.fetchWithTimeout(storageUsageUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 10000);

                if (storageResponse.ok) {
                    const storageData = await storageResponse.json();
                    data.blobStorageBytes = storageData.totalBytes || 0;
                    data.blobStorageGB = storageData.totalGB || 0;
                    data.blobStorageCost = storageData.estimatedMonthlyCost || 0;
                    data.blobCount = storageData.blobCount || 0;
                    data.totalCost = (data.totalCost || 0) + (data.blobStorageCost || 0);
                }
            } catch (storageError) {
                console.warn('⚠️ Blob Storage 사용량 조회 실패:', storageError);
            }

            return data;
        }

        // 폴백: 로컬 추적 API
        const usageApiUrl = baseUrl + '/api/usage';
        const response = await window.fetchWithTimeout(usageApiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 10000);

        if (response.ok) {
            const data = await response.json();
            reader.totalCharsUsed = data.totalChars || 0;
            localStorage.setItem('azureTTS_totalChars', reader.totalCharsUsed.toString());
            return data;
        }
    } catch (error) {
        console.error('백엔드 사용량 조회 실패:', error);
    }
    return null;
};

// ============================================
// 사용량 표시 업데이트
// ============================================
window.updateUsageDisplay = async function() {
    const usageDiv = document.getElementById('tts-usage-azure');
    if (!usageDiv) return;

    const backendData = await window.fetchUsageFromBackend();

    let totalChars, freeChars, paidChars, freeLimit, freePercentage, freeRemaining, lastUpdated;
    let paidCost = 0;
    let blobStorageGB = 0;
    let blobStorageCost = 0;
    let totalCost = 0;
    let hasCostData = false;

    if (backendData) {
        totalChars = backendData.totalChars || 0;
        freeLimit = backendData.freeLimit || 500000;
        freeChars = Math.min(totalChars, freeLimit);
        paidChars = Math.max(0, totalChars - freeLimit);
        freePercentage = parseFloat(backendData.freePercentage || backendData.percentage || ((freeChars / freeLimit) * 100).toFixed(1));
        freeRemaining = Math.max(0, freeLimit - totalChars);
        lastUpdated = new Date(backendData.lastUpdated).toLocaleString('ko-KR');

        if (backendData.source === 'azure-consumption-api') {
            paidCost = backendData.paidCost || 0;
            blobStorageGB = backendData.blobStorageGB || 0;
            blobStorageCost = backendData.blobStorageCost || 0;
            totalCost = backendData.totalCost || 0;
            hasCostData = true;
        } else {
            paidCost = paidChars * 0.000016;
        }
    } else {
        totalChars = reader.totalCharsUsed;
        freeLimit = 500000;
        freeChars = Math.min(totalChars, freeLimit);
        paidChars = Math.max(0, totalChars - freeLimit);
        freePercentage = ((freeChars / freeLimit) * 100).toFixed(1);
        freeRemaining = Math.max(0, freeLimit - totalChars);
        lastUpdated = '로컬 카운터';
        paidCost = paidChars * 0.000016;
    }

    // 월 초 리셋 감지
    const totalUsed = totalChars || (freeChars + paidChars);
    const isMonthlyReset = (totalUsed < freeLimit * 0.1);
    if (isMonthlyReset && window.apiKeyConfig.usePaidApi) {
        window.apiKeyConfig.usePaidApi = false;
        localStorage.setItem('azureTTS_usePaidApi', 'false');
        window.ttsLog('🔄 월 초 할당량 리셋 감지 - 무료 API로 자동 전환');
    }

    const apiModeText = window.apiKeyConfig.usePaidApi ?
        '<span style="color: #FFD700;">💳 유료 API 사용 중 (S0)</span>' :
        '<span style="color: #4CAF50;">🆓 무료 API 사용 중 (F0)</span>';

    const dataSourceBadge = backendData && backendData.source === 'azure-consumption-api' ?
        '<span style="color: #4CAF50;">✓ Azure 실제 사용량</span>' :
        (backendData && backendData.source === 'local-tracker' ?
            '<span style="color: #FFB74D;">⚠️ 로컬 추적 (부정확)</span>' :
            '<span style="color: rgba(255,255,255,0.6);">⚠ 로컬 추정</span>');

    const quotaWarning = freePercentage >= 90 ?
        `<div style="margin-top: 10px; padding: 10px; background: rgba(255,193,7,0.2); border-left: 3px solid #FFD700; border-radius: 5px; font-size: 11px; color: white;">
            ⚠️ 무료 할당량 ${freePercentage >= 100 ? '소진' : '부족'} (${freePercentage.toFixed(1)}%)
        </div>` : '';

    const paidCharsDisplay = paidChars > 0 ?
        `<span style="color: #FFD700; font-weight: bold;">${paidChars.toLocaleString()}자</span>` :
        `<span style="color: rgba(255,255,255,0.5);">0자</span>`;

    const paidCostDisplay = paidChars > 0 ?
        `<span style="color: #FFD700; font-size: 11px;"> ($${paidCost.toFixed(4)})</span>` :
        `<span style="color: rgba(255,255,255,0.5); font-size: 11px;"> ($0.0000)</span>`;

    const freeColor = freePercentage > 100 ? '#FF6B6B' : (freePercentage > 80 ? '#FFD700' : '#4CAF50');

    usageDiv.innerHTML = `
        <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-height: 180px;">
            <h3 style="color: white; margin: 0 0 15px 0; font-size: 16px;">📊 API 사용량 (이번 달)</h3>

            <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <div style="margin-bottom: 5px; font-size: 12px; color: rgba(255,255,255,0.9);">
                    ${apiModeText}
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.7);">
                    ${dataSourceBadge}
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 5px; color: white; font-size: 14px;">
                <div style="margin-bottom: 8px;">
                    <strong>🆓 무료:</strong> <span style="color: ${freeColor}; font-weight: bold;">${freeChars.toLocaleString()}자</span> / ${freeLimit.toLocaleString()}자 <span style="color: rgba(255,255,255,0.7);">(${freePercentage.toFixed(1)}%)</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>💳 유료:</strong> ${paidCharsDisplay} ${paidCostDisplay}
                </div>
                ${hasCostData && blobStorageGB > 0 ? `<div style="margin-bottom: 8px;">
                    <strong>💾 Blob Storage:</strong> <span style="color: #90CAF9; font-weight: bold;">${blobStorageGB.toFixed(2)} GB</span>
                    <span style="color: #90CAF9; font-size: 11px;"> ($${blobStorageCost.toFixed(4)})</span>
                </div>` : ''}
                <div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
                    전체: ${totalChars.toLocaleString()}자
                    ${(hasCostData && totalCost > 0) || paidCost > 0 ? `<span style="color: #FFD700;"> | 예상 총 비용: $${(totalCost || paidCost).toFixed(4)}</span>` : ''}
                </div>
            </div>

            <div style="margin-top: 10px; font-size: 12px; color: ${freeRemaining < 50000 ? '#FF6B6B' : '#4CAF50'}; font-weight: bold;">
                남은 무료 사용량: ${freeRemaining.toLocaleString()}자 ${freeRemaining < 50000 ? '⚠️' : '✅'}
            </div>
            ${quotaWarning}
            <div style="margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.6);">
                마지막 업데이트: ${lastUpdated}
                ${hasCostData ? '<span style="color: #4CAF50;"> ✓ 실시간 Azure 데이터</span>' : '<span style="color: #FFB74D;"> ⚠️ 추정값</span>'}
            </div>
        </div>
    `;
};

// ============================================
// 전체 노트 TTS 일괄 생성
// ============================================
window.bulkGenerateAllNotes = async function() {
    const dvObj = input?.dv || dv;

    let tagQuery = "#출제예상";
    for (let i = 130; i <= 137; i++) {
        tagQuery += ` or #${i}관 or #${i}응`;
    }

    const allPages = dvObj.pages(`"1_Project/정보 관리 기술사" and -#검색제외 and (${tagQuery})`)
        .sort(b => [b.file.folder, b.file.name], 'asc')
        .array();

    if (!allPages || allPages.length === 0) {
        alert('❌ 생성할 노트가 없습니다.');
        return;
    }

    const totalNotes = allPages.length;
    const confirmed = confirm(
        `⚡ 전체 ${totalNotes}개 노트에 대해 TTS를 일괄 생성하시겠습니까?\n\n` +
        `✅ 캐시된 노트는 자동으로 건너뜁니다\n` +
        `🎤 새로운 노트만 생성됩니다\n` +
        `⏹️ 진행 중 언제든지 중단 가능합니다`
    );

    if (!confirmed) return;

    // 진행 상황 UI
    const progressDiv = document.createElement('div');
    progressDiv.id = 'bulk-generation-progress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; min-width: 400px;';
    progressDiv.innerHTML = `
        <h3 style="margin: 0 0 20px 0; color: #333;">⚡ TTS 일괄 생성 중...</h3>
        <div style="margin-bottom: 15px;">
            <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                진행: <strong id="bulk-current">0</strong> / <strong id="bulk-total">${totalNotes}</strong>
                (<strong id="bulk-percentage">0%</strong>)
            </div>
            <div style="background: #eee; height: 20px; border-radius: 10px; overflow: hidden;">
                <div id="bulk-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); transition: width 0.3s;"></div>
            </div>
        </div>
        <div id="bulk-current-note" style="font-size: 12px; color: #999; margin-bottom: 10px; height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
        <div id="bulk-stats" style="font-size: 12px; color: #666; margin-bottom: 15px;">
            ✅ 생성: <strong id="bulk-generated">0</strong> |
            ⏭️ 건너뜀: <strong id="bulk-skipped">0</strong> |
            ❌ 실패: <strong id="bulk-failed">0</strong>
        </div>
        <button id="bulk-cancel-btn" style="width: 100%; padding: 10px; background: #F44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
            ⏹️ 중단
        </button>
    `;
    document.body.appendChild(progressDiv);

    let cancelled = false;
    document.getElementById('bulk-cancel-btn').onclick = () => {
        cancelled = true;
        alert('⏹️ 중단 요청됨. 현재 노트 완료 후 중단됩니다.');
    };

    let generated = 0, skipped = 0, failed = 0;

    for (let i = 0; i < allPages.length; i++) {
        if (cancelled) break;

        const page = allPages[i];
        const noteTitle = page.file.name;

        document.getElementById('bulk-current').textContent = i + 1;
        document.getElementById('bulk-percentage').textContent = Math.round(((i + 1) / totalNotes) * 100) + '%';
        document.getElementById('bulk-progress-bar').style.width = ((i + 1) / totalNotes * 100) + '%';
        document.getElementById('bulk-current-note').textContent = `📄 ${noteTitle}`;

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
            } catch (err) {}

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
            } catch (err) {}

            generated++;
            document.getElementById('bulk-generated').textContent = generated;

        } catch (error) {
            console.error(`❌ 실패: ${noteTitle}`, error);
            failed++;
            document.getElementById('bulk-failed').textContent = failed;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    document.body.removeChild(progressDiv);

    const resultMessage = cancelled
        ? `⏹️ 중단됨\n\n✅ 생성: ${generated}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개`
        : `🎉 완료!\n\n✅ 생성: ${generated}개\n⏭️ 건너뜀: ${skipped}개\n❌ 실패: ${failed}개`;

    alert(resultMessage);
    await window.updateCacheStatsDisplay();
};

// ============================================
// UI 생성 (dv 사용)
// ============================================
const pages = input?.pages || window.azureTTSReader?.pages || [];

// 서버 캐시 관리 패널
const cachePanel = dv.container.createEl('div', {
    attr: {
        style: 'margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
    }
});

cachePanel.createEl('h3', {
    text: '☁️ 서버 캐시 관리 (Azure Blob Storage)',
    attr: { style: 'color: white; margin: 0 0 15px 0;' }
});

const statsDiv = cachePanel.createEl('div', {
    attr: {
        id: 'cache-stats-content',
        style: 'background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; margin-bottom: 15px; color: white;'
    }
});

statsDiv.innerHTML = `
    <div style="font-size: 14px;">
        <div>📊 총 요청: <strong id="cached-count">0</strong></div>
        <div>💾 캐시 히트: <strong id="hit-count">0</strong></div>
        <div>🌐 캐시 미스: <strong id="miss-count">0</strong></div>
        <div>⚡ 히트율: <strong id="hit-rate">0%</strong></div>
    </div>
`;

const buttonStyle = 'background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 5px;';

const refreshStatsBtn = cachePanel.createEl('button', { text: '🔄 통계 새로고침', attr: { style: buttonStyle } });
refreshStatsBtn.onclick = window.updateCacheStatsDisplay;

const resetStatsBtn = cachePanel.createEl('button', { text: '🔄 통계 초기화', attr: { style: buttonStyle + 'background: #FF9800;' } });
resetStatsBtn.onclick = function() {
    window.serverCacheManager.resetStats();
    window.updateCacheStatsDisplay();
    alert('✅ 캐시 통계가 초기화되었습니다.');
};

const clearOfflineBtn = cachePanel.createEl('button', { text: '🗑️ 오프라인 캐시 삭제', attr: { style: buttonStyle + 'background: #9C27B0;' } });
clearOfflineBtn.onclick = async function() {
    if (!confirm('⚠️ 오프라인 캐시를 모두 삭제하시겠습니까?')) return;
    try {
        const statsBefore = await window.offlineCacheManager.getCacheStats();
        await window.offlineCacheManager.clearAll();
        await window.updateCacheStatsDisplay();
        alert(`✅ 오프라인 캐시 ${statsBefore.count}개 (${statsBefore.totalSizeMB}MB)를 삭제했습니다.`);
    } catch (error) {
        alert(`❌ 오프라인 캐시 삭제 실패: ${error.message}`);
    }
};

const bulkGenerateBtn = cachePanel.createEl('button', { text: '⚡ 전체 노트 TTS 일괄 생성', attr: { style: buttonStyle + 'background: #2196F3;' } });
bulkGenerateBtn.onclick = window.bulkGenerateAllNotes;

const clearAllCacheBtn = cachePanel.createEl('button', { text: '🔥 전체 캐시 삭제', attr: { style: buttonStyle + 'background: #F44336;' } });
clearAllCacheBtn.onclick = async function() {
    if (!confirm('⚠️ 모든 캐시를 삭제하시겠습니까?')) return;

    const results = { server: null, offline: null };

    try {
        const cacheApiEndpoint = window.ttsEndpointConfig.azureFunctionUrl + (config.cacheEndpoint || '/api/cache');
        const clearResponse = await window.fetchWithTimeout(`${cacheApiEndpoint}-clear`, { method: 'DELETE' }, 15000);
        if (!clearResponse.ok) throw new Error(`HTTP ${clearResponse.status}`);
        const clearData = await clearResponse.json();
        results.server = clearData.deletedCount;
    } catch (error) {
        results.server = error.message;
    }

    try {
        const offlineStats = await window.offlineCacheManager.getCacheStats();
        await window.offlineCacheManager.clearAll();
        results.offline = offlineStats.count;
    } catch (error) {
        results.offline = error.message;
    }

    window.serverCacheManager.resetStats();
    await window.updateCacheStatsDisplay();

    const serverMsg = typeof results.server === 'number' ? `${results.server}개 삭제` : `실패 (${results.server})`;
    const offlineMsg = typeof results.offline === 'number' ? `${results.offline}개 삭제` : `실패 (${results.offline})`;
    alert(`캐시 삭제 결과\n\n- 서버: ${serverMsg}\n- 오프라인: ${offlineMsg}`);
};

// 컨트롤 UI
const controlsDiv = dv.container.createEl('div', {
    attr: {
        style: 'margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
    }
});

controlsDiv.createEl('div', {
    text: '🎵 Azure TTS 고품질 재생 (v5.1.0 - 모듈화)',
    attr: { style: 'color: white; font-size: 18px; font-weight: bold; margin-bottom: 15px;' }
});

// 마지막 재생 위치 표시
const lastPlayedDiv = controlsDiv.createEl('div', {
    attr: {
        id: 'last-played-info',
        style: 'margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 14px;'
    }
});

if (reader.lastPlayedIndex >= 0 && reader.pages[reader.lastPlayedIndex]) {
    const lastNote = reader.pages[reader.lastPlayedIndex];
    lastPlayedDiv.innerHTML = `
        💾 마지막 재생: <strong>${reader.lastPlayedIndex + 1}번</strong> - ${lastNote.file.name}
        <br><small style="opacity: 0.9;">다음 재생 시 ${reader.lastPlayedIndex + 2}번부터 시작됩니다</small>
    `;
} else {
    lastPlayedDiv.textContent = '준비됨 - 아래 버튼을 클릭하여 재생하세요';
}

// API 모드 선택
const apiModeDiv = controlsDiv.createEl('div', {
    attr: { style: 'margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.15); border-radius: 8px;' }
});

const apiLabel = apiModeDiv.createEl('label', {
    attr: { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; font-size: 14px;' }
});

const apiCheckbox = apiLabel.createEl('input', {
    attr: { type: 'checkbox', id: 'use-paid-api-control', style: 'cursor: pointer; width: 18px; height: 18px;' }
});

if (window.apiKeyConfig.usePaidApi) {
    apiCheckbox.checked = true;
}

apiLabel.createEl('span', { text: '💳 유료 API 사용 (S0)', attr: { style: 'font-weight: bold;' } });

apiCheckbox.addEventListener('change', function(e) {
    const usePaid = e.target.checked;
    window.apiKeyConfig.usePaidApi = usePaid;
    localStorage.setItem('azureTTS_usePaidApi', usePaid.toString());
    window.updateUsageDisplay();
    alert(`✅ ${usePaid ? '유료 API (S0)' : '무료 API (F0)'}로 전환되었습니다.`);
});

// TTS 엔드포인트 선택
if (window.ttsEndpointConfig.localEdgeTtsUrl) {
    const endpointDiv = controlsDiv.createEl('div', {
        attr: { style: 'margin-bottom: 15px; padding: 10px; background: rgba(100,149,237,0.25); border-radius: 8px;' }
    });

    const endpointLabel = endpointDiv.createEl('label', {
        attr: { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; font-size: 14px;' }
    });

    const endpointCheckbox = endpointLabel.createEl('input', {
        attr: { type: 'checkbox', id: 'use-local-edge-tts', style: 'cursor: pointer; width: 18px; height: 18px;' }
    });

    if (window.ttsEndpointConfig.useLocalEdgeTts) {
        endpointCheckbox.checked = true;
    }

    endpointLabel.createEl('span', { text: '🏠 로컬 Edge TTS 사용 (무료, 고음질)', attr: { style: 'font-weight: bold;' } });

    const statusSpan = endpointDiv.createEl('span', {
        attr: { id: 'endpoint-status', style: 'display: block; margin-top: 5px; font-size: 12px; opacity: 0.8;' }
    });
    statusSpan.textContent = window.ttsEndpointConfig.useLocalEdgeTts
        ? '✅ Mac Mini Edge TTS 프록시 사용 중'
        : '☁️ Azure Function 사용 중';

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
            ? '✅ Mac Mini Edge TTS 프록시 사용 중'
            : '☁️ Azure Function 사용 중';

        alert(`✅ ${useLocal ? '로컬 Edge TTS (무료)' : 'Azure Function'}로 전환되었습니다.`);
    });
}

// 재생 버튼들
const btnStyle = 'margin: 5px; padding: 12px 24px; font-size: 16px; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; transition: all 0.3s;';

const prevBtn = controlsDiv.createEl('button', { text: '⏮️ 이전', attr: { style: btnStyle + 'background: #9C27B0;' } });
prevBtn.onclick = window.azureTTSPrevious;

const playBtn = controlsDiv.createEl('button', { text: '▶️ 재생 시작', attr: { style: btnStyle + 'background: #4CAF50;' } });
playBtn.onclick = window.azureTTSPlay;

const pauseBtn = controlsDiv.createEl('button', { text: '⏸️ 일시정지', attr: { style: btnStyle + 'background: #FF9800;' } });
pauseBtn.onclick = window.azureTTSPause;

const stopBtn = controlsDiv.createEl('button', { text: '⏹️ 정지', attr: { style: btnStyle + 'background: #F44336;' } });
stopBtn.onclick = window.azureTTSStop;

const nextBtn = controlsDiv.createEl('button', { text: '⏭️ 다음', attr: { style: btnStyle + 'background: #2196F3;' } });
nextBtn.onclick = window.azureTTSNext;

// 속도 조절
const rateDiv = controlsDiv.createEl('div', {
    attr: { style: 'margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;' }
});

const rateLabel = rateDiv.createEl('label', { text: '재생 속도: ', attr: { style: 'color: white; font-weight: bold; margin-right: 10px;' } });
rateLabel.createEl('span', { text: '1.0x', attr: { id: 'rate-display', style: 'color: #FFD700; font-size: 18px;' } });

const rateSlider = rateDiv.createEl('input', {
    attr: { type: 'range', min: '0.5', max: '2.0', step: '0.1', value: '1.0', style: 'width: 200px; margin-left: 10px; vertical-align: middle;' }
});
rateSlider.oninput = function() { window.azureTTSSetRate(this.value); };

// API 사용량 표시
const usageDiv = dv.container.createEl('div', {
    attr: { id: 'tts-usage-azure', style: 'margin-top: 15px; min-height: 180px;' }
});

usageDiv.innerHTML = `
    <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; min-height: 180px;">
        <h3 style="color: white; margin: 0 0 15px 0; font-size: 16px;">📊 API 사용량 (이번 달)</h3>
        <div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.1); border-radius: 5px;">
            🔄 사용량 로딩 중...
        </div>
    </div>
`;

// 노트 목록 표시
dv.header(3, `📚 총 ${pages.length}개의 노트 (출제예상 + 130~137회 기출)`);

const tableDiv = dv.container.createEl('table', {
    attr: { style: 'width: 100%; border-collapse: collapse; margin-top: 10px;' }
});

const thead = tableDiv.createEl('thead');
const headerRow = thead.createEl('tr');
['재생', '토픽', '정의 (미리보기)'].forEach(header => {
    headerRow.createEl('th', {
        text: header,
        attr: { style: 'border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: left;' }
    });
});

const tbody = tableDiv.createEl('tbody');

pages.forEach((p, idx) => {
    const row = tbody.createEl('tr', { attr: { style: 'border: 1px solid #ddd;' } });

    const playCell = row.createEl('td', {
        attr: { style: 'border: 1px solid #ddd; padding: 8px; text-align: center; width: 60px;' }
    });

    const playBtnItem = playCell.createEl('button', {
        text: '▶️',
        attr: { style: 'padding: 5px 10px; cursor: pointer; border: none; background: #4CAF50; color: white; border-radius: 3px; font-size: 14px;' }
    });
    playBtnItem.onclick = function() { window.azureTTSPlayFrom(idx); };

    const topicCell = row.createEl('td', { attr: { style: 'border: 1px solid #ddd; padding: 8px;' } });
    topicCell.createEl('a', { text: p.file.name, attr: { href: p.file.path, class: 'internal-link' } });

    row.createEl('td', {
        text: p.정의 ? String(p.정의).substring(0, 80) + "..." : "-",
        attr: { style: 'border: 1px solid #ddd; padding: 8px; color: #666; font-size: 13px;' }
    });
});

// 초기 로딩
(async () => {
    await window.updateUsageDisplay();
})();

setTimeout(() => {
    if (window.serverCacheManager && window.serverCacheManager.stats) {
        window.updateCacheStatsDisplay();
    }
}, 100);

window.ttsLog('✅ [tts-ui] 모듈 로드 완료');
