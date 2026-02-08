// ============================================
// tts-usage: 캐시 통계 UI + 사용량 조회/표시 + 캐시 상태 확인
// 의존성: tts-core, tts-cache (serverCacheManager, offlineCacheManager)
// ============================================

if (!window._ttsUsageModuleLoaded) {
    window._ttsUsageModuleLoaded = true;

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
            cachedCountEl.innerHTML = `${stats.totalRequests} <small style="color: var(--tts-text-muted, #999);">(서버: ${serverStats.totalFiles}개, ${serverStats.totalSizeMB}MB | 오프라인: ${offlineStats.count}개, ${offlineStats.totalSizeMB}MB)</small>`;
        }
    };

    // ============================================
    // 백엔드에서 사용량 조회 (모드 기반)
    // ============================================
    window.fetchUsageFromBackend = async function() {
        const reader = window.azureTTSReader;
        // 로컬/하이브리드 모드에서는 사용량 조회 스킵
        if (window.ttsModeConfig?.features?.usageTracking === 'local') {
            window.ttsLog(`📱 ${window.ttsModeConfig?.name || '로컬'} 모드 - Azure 사용량 조회 스킵`);
            return null;
        }

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
                if (reader) {
                    reader.totalCharsUsed = data.totalChars || 0;
                }
                localStorage.setItem('azureTTS_totalChars', (data.totalChars || 0).toString());
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
                if (reader) {
                    reader.totalCharsUsed = data.totalChars || 0;
                }
                localStorage.setItem('azureTTS_totalChars', (data.totalChars || 0).toString());
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
        const reader = window.azureTTSReader;
        const usageDiv = document.getElementById('tts-usage-azure');
        if (!usageDiv) return;

        // 로컬 Edge TTS 사용 시 백엔드 호출 건너뜀
        const backendData = window.ttsEndpointConfig?.useLocalEdgeTts
            ? null
            : await window.fetchUsageFromBackend();

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
            totalChars = reader?.totalCharsUsed || 0;
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
        if (isMonthlyReset && window.apiKeyConfig?.usePaidApi) {
            window.apiKeyConfig.usePaidApi = false;
            localStorage.setItem('azureTTS_usePaidApi', 'false');
            window.ttsLog('🔄 월 초 할당량 리셋 감지 - 무료 API로 자동 전환');
        }

        const apiModeText = window.apiKeyConfig?.usePaidApi
            ? '<span style="color: var(--tts-gold);">유료 API (S0)</span>'
            : '<span style="color: var(--tts-success);">무료 API (F0)</span>';

        const dataSourceBadge = backendData && backendData.source === 'azure-consumption-api'
            ? '<span style="color: var(--tts-success);">Azure 실제</span>'
            : (backendData && backendData.source === 'local-tracker'
                ? '<span style="color: var(--tts-warning);">로컬 추적</span>'
                : '<span style="color: var(--tts-text-dim);">로컬 추정</span>');

        const freeColor = freePercentage > 100 ? 'var(--tts-danger)' : (freePercentage > 80 ? 'var(--tts-gold)' : 'var(--tts-success)');

        const quotaWarning = freePercentage >= 90
            ? `<div style="margin-top: var(--tts-space-sm); padding: var(--tts-space-sm); background: rgba(255,193,7,0.2); border-left: 3px solid var(--tts-gold); border-radius: var(--tts-radius-sm); font-size: var(--tts-font-sm); color: white;">
                무료 할당량 ${freePercentage >= 100 ? '소진' : '부족'} (${freePercentage.toFixed(1)}%)
            </div>` : '';

        usageDiv.innerHTML = `
            <div style="font-size: var(--tts-font-md); color: var(--tts-text);">
                <div class="tts-glass-box" style="margin-bottom: var(--tts-space-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${apiModeText}</span>
                        <span style="font-size: var(--tts-font-sm);">${dataSourceBadge}</span>
                    </div>
                </div>
                <div class="tts-glass-box">
                    <div style="margin-bottom: var(--tts-space-sm);">
                        <strong>무료:</strong> <span style="color: ${freeColor}; font-weight: bold;">${freeChars.toLocaleString()}자</span> / ${freeLimit.toLocaleString()}자 <span style="color: var(--tts-text-muted);">(${freePercentage}%)</span>
                    </div>
                    <div style="margin-bottom: var(--tts-space-sm);">
                        <strong>유료:</strong> ${paidChars > 0 ? `<span style="color: var(--tts-gold); font-weight: bold;">${paidChars.toLocaleString()}자</span> <span style="font-size: var(--tts-font-sm); color: var(--tts-gold);">($${paidCost.toFixed(4)})</span>` : `<span style="color: var(--tts-text-dim);">0자 ($0.0000)</span>`}
                    </div>
                    ${hasCostData && blobStorageGB > 0 ? `<div style="margin-bottom: var(--tts-space-sm);">
                        <strong>Blob Storage:</strong> <span style="color: #90CAF9; font-weight: bold;">${blobStorageGB.toFixed(2)} GB</span> <span style="color: #90CAF9; font-size: var(--tts-font-sm);">($${blobStorageCost.toFixed(4)})</span>
                    </div>` : ''}
                    <div style="font-size: var(--tts-font-sm); color: var(--tts-text-muted); margin-top: var(--tts-space-sm); padding-top: var(--tts-space-sm); border-top: 1px solid rgba(255,255,255,0.2);">
                        전체: ${totalChars.toLocaleString()}자
                        ${(hasCostData && totalCost > 0) || paidCost > 0 ? `<span style="color: var(--tts-gold);"> | 예상 비용: $${(totalCost || paidCost).toFixed(4)}</span>` : ''}
                    </div>
                </div>
                <div style="margin-top: var(--tts-space-sm); font-size: var(--tts-font-sm); color: ${freeRemaining < 50000 ? 'var(--tts-danger)' : 'var(--tts-success)'}; font-weight: bold;">
                    남은 무료: ${freeRemaining.toLocaleString()}자
                </div>
                ${quotaWarning}
                <div style="margin-top: var(--tts-space-xs); font-size: 11px; color: var(--tts-text-dim);">
                    업데이트: ${lastUpdated} ${hasCostData ? '(Azure 실시간)' : '(추정값)'}
                </div>
            </div>
        `;
    };

    // ============================================
    // 캐시 상태 확인 함수
    // ============================================
    window.updateCacheStatusForNote = async function(idx, cacheKey) {
        const statusIcon = document.getElementById(`cache-status-${idx}`);
        if (!statusIcon) return;

        try {
            // 오프라인 캐시 확인
            const offlineCached = await window.offlineCacheManager.getAudio(cacheKey);

            // 서버 캐시 확인 (로컬 모드 제외)
            let serverCached = false;
            if (window.ttsModeConfig?.features?.cache !== 'local') {
                const serverResult = await window.serverCacheManager.getCachedAudioFromServer(cacheKey);
                serverCached = !!serverResult;
            }

            if (offlineCached && serverCached) {
                statusIcon.textContent = 'S+O';
                statusIcon.title = '서버 + 오프라인 캐시';
                statusIcon.style.cssText = 'font-size: 11px; font-weight: bold; color: var(--tts-success); cursor: help;';
            } else if (offlineCached) {
                statusIcon.textContent = 'OFF';
                statusIcon.title = '오프라인 캐시만';
                statusIcon.style.cssText = 'font-size: 11px; font-weight: bold; color: var(--tts-info); cursor: help;';
            } else if (serverCached) {
                statusIcon.textContent = 'SRV';
                statusIcon.title = '서버 캐시만';
                statusIcon.style.cssText = 'font-size: 11px; font-weight: bold; color: #9C27B0; cursor: help;';
            } else {
                statusIcon.textContent = '-';
                statusIcon.title = '캐시 없음';
                statusIcon.style.cssText = 'font-size: 11px; color: var(--text-muted, #999); cursor: help;';
            }
        } catch (error) {
            statusIcon.textContent = '?';
            statusIcon.title = '캐시 상태 확인 실패';
            statusIcon.style.cssText = 'font-size: 11px; color: var(--text-muted, #999); cursor: help;';
        }
    };

    // ============================================
    // 전체 노트 캐시 상태 확인 (배치 처리)
    // ============================================
    window.updateAllCacheStatus = async function() {
        const pages = window.azureTTSReader?.pages || [];
        const BATCH_SIZE = 10;
        const BATCH_DELAY_MS = 100;

        const batches = [];
        for (let i = 0; i < pages.length; i += BATCH_SIZE) {
            batches.push(pages.slice(i, i + BATCH_SIZE).map((page, localIdx) => ({
                page,
                idx: i + localIdx
            })));
        }

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            const batch = batches[batchIdx];
            const batchPromises = batch.map(async ({ page, idx }) => {
                const notePath = page.file.path;
                const content = window.serverCacheManager.getNoteContent(page);
                const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);
                await window.updateCacheStatusForNote(idx, cacheKey);
            });

            await Promise.all(batchPromises);

            if (batchIdx < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        window.ttsLog(`모든 노트 캐시 상태 확인 완료 (${batches.length}개 배치)`);
    };

    window.ttsLog?.('✅ [tts-ui/tts-usage] 모듈 로드 완료');
}
