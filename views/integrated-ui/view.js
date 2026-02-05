// ============================================
// integrated-ui: 통합 노트 UI 컴포넌트
// 의존성: tts-core, scroll-manager
// input: { config, domains, lowEndMode, getLayoutMode, TTS_POSITION_READ_ENDPOINT, bookmarkIndex, pages, savedNoteName, dv }
// ============================================

// ================================================================
// [DEBUG] Visual Debug Panel - 모듈로 분리됨
// Load from: views/integrated-ui/modules/debug-panel.js
// Toggle: window.ttsDebugPanel.toggle()
// ================================================================

// Load modules (best effort - 로드 실패해도 버튼/이미지 기능은 정상 동작)
(async () => {
    const loadScript = (src) => new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.type = 'text/javascript';
        script.onload = resolve;
        script.onerror = () => {
            console.warn(`⚠️ [integrated-ui] 모듈 로드 실패 (무시): ${src}`);
            resolve(); // 실패해도 다음 모듈 로드 계속 진행
        };
        document.head.appendChild(script);
    });

    await loadScript('views/integrated-ui/modules/state-lock.js');
    await loadScript('views/integrated-ui/modules/api-throttle.js');
    await loadScript('views/integrated-ui/modules/auto-move-manager.js');
    await loadScript('views/integrated-ui/modules/debug-panel.js');
    window.ttsLog?.('✅ [integrated-ui] 모듈 로드 완료');

    // 모듈 로드 성공/실패와 무관하게 항상 초기화
    initializeIntegratedUI();
})();

    // Initialization function (called after modules load)
    function initializeIntegratedUI() {

// ================================================================
// [0] TTS 자동 이동 관리자 (리팩토링: SPEC-TTS-AUTOMOVE-001)
// ================================================================

// 노트별 타이머 관리를 위한 Map 구조 (다중 노트 환경 지원)
window.ttsAutoMoveTimers = window.ttsAutoMoveTimers || new Map();
window.ttsAutoMoveStates = window.ttsAutoMoveStates || new Map();

// StateLock 클래스는 모듈로 이동됨 (views/integrated-ui/modules/state-lock.js)
// APIThrottle 클래스는 모듈로 이동됨 (views/integrated-ui/modules/api-throttle.js)

// TTSAutoMoveManager 클래스는 모듈로 이동됨 (views/integrated-ui/modules/auto-move-manager.js)

// ================================================================
// [1] input에서 필요한 값 추출
// ================================================================
const {
    config: CONFIG,
    domains,
    lowEndMode,
    getLayoutMode,
    TTS_POSITION_READ_ENDPOINT,
    bookmarkIndex,
    pages,
    savedNoteName,
    dv: dvRef
} = input;

// 현재 레이아웃 모드 (모듈 스코프)
let currentLayoutMode = getLayoutMode();

// ================================================================
// [1] 반응형 CSS
// ================================================================
const existingStyle = document.getElementById(CONFIG.STYLE_ID);
if (existingStyle) existingStyle.remove();

const styleEl = document.createElement('style');
styleEl.id = CONFIG.STYLE_ID;
styleEl.textContent = `
    :root {
        --in-transition-speed: ${lowEndMode ? '0.15s' : '0.3s'};
        --in-bp-mobile: ${CONFIG.BREAKPOINTS.mobile}px;
        --in-bp-tablet: ${CONFIG.BREAKPOINTS.tablet}px;
    }

    .in-search-container {
        display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;
    }
    .in-search-input {
        flex: 1; min-width: 200px; padding: 8px 12px;
        border: 1px solid var(--background-modifier-border); border-radius: 8px;
        background: var(--background-primary); color: var(--text-normal);
        font-size: 14px; outline: none; transition: border-color 0.2s;
    }
    .in-search-input:focus { border-color: var(--interactive-accent); }
    .in-search-input::placeholder { color: var(--text-faint); }
    .in-domain-select {
        padding: 8px 12px; border: 1px solid var(--background-modifier-border); border-radius: 8px;
        background: var(--background-primary); color: var(--text-normal);
        font-size: 14px; cursor: pointer; outline: none; min-width: 140px;
    }
    .in-domain-select:focus { border-color: var(--interactive-accent); }
    .in-filter-count { font-size: 12px; color: var(--text-muted); padding: 4px 8px; white-space: nowrap; }

    .dataview.table-view-table {
        table-layout: fixed !important; width: 100% !important;
        ${!lowEndMode ? 'transform: translateZ(0); backface-visibility: hidden;' : ''}
    }
    .dataview.table-view-table tbody tr {
        ${!lowEndMode ? 'content-visibility: auto;' : ''}
        contain-intrinsic-size: auto 150px;
    }
    .dataview.table-view-table tbody tr.in-hidden { display: none !important; }

    .dataview.table-view-table img.lazy-image {
        ${!lowEndMode ? 'will-change: opacity;' : ''}
        opacity: 0; transition: opacity var(--in-transition-speed) ease-in;
    }
    .dataview.table-view-table img.lazy-image.loaded { opacity: 1; }

    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        10% { opacity: 1; transform: translateX(-50%) translateY(0); }
        90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }

    .in-action-btn {
        position: fixed; padding: 12px 20px; font-size: 14px; color: #fff;
        border: none; border-radius: 25px; font-weight: bold; cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 800;
        ${!lowEndMode ? 'transition: transform 0.2s; will-change: transform;' : ''}
    }


    /* TTS 자동 이동 토글 스위치 */
    .in-tts-toggle-container {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 800;
        padding: 12px 16px;
        background: var(--background-primary, #1e1e1e);
        border: 1px solid var(--background-modifier-border, #333);
        border-radius: 25px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ${!lowEndMode ? 'transition: transform 0.2s; will-change: transform;' : ''}
    }
    .in-tts-toggle-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-normal, #e0e0e0);
        white-space: nowrap;
    }
    .in-tts-toggle-switch {
        position: relative;
        width: 44px;
        height: 24px;
        background: var(--background-modifier-border-hover, #555);
        border-radius: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    .in-tts-toggle-switch.active {
        background: #9C27B0;
    }
    .in-tts-toggle-slider {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .in-tts-toggle-switch.active .in-tts-toggle-slider {
        transform: translateX(20px);
    }
    @media (min-width: ${CONFIG.BREAKPOINTS.tablet}px) {
        .dataview.table-view-table thead th:nth-child(1),
        .dataview.table-view-table tbody td:nth-child(1) { width: 40% !important; }
        .dataview.table-view-table thead th:nth-child(2),
        .dataview.table-view-table tbody td:nth-child(2) { width: 30% !important; }
        .dataview.table-view-table thead th:nth-child(3),
        .dataview.table-view-table tbody td:nth-child(3) { width: 30% !important; display: table-cell !important; }
        .in-action-btn { bottom: 20px; }
        .in-tts-toggle-container { bottom: 20px; }
        .in-tts-toggle-label { display: block; }
        .in-inline-media, .in-inline-keywords, .in-col2-media { display: none !important; }
    }

    @media (min-width: ${CONFIG.BREAKPOINTS.mobile}px) and (max-width: ${CONFIG.BREAKPOINTS.tablet - 1}px) {
        .dataview.table-view-table tbody tr { contain-intrinsic-size: auto 200px; }
        .dataview.table-view-table thead th:nth-child(1),
        .dataview.table-view-table tbody td:nth-child(1) { width: 50% !important; }
        .dataview.table-view-table thead th:nth-child(2),
        .dataview.table-view-table tbody td:nth-child(2) { width: 50% !important; }
        .dataview.table-view-table thead th:nth-child(3),
        .dataview.table-view-table tbody td:nth-child(3) { display: none !important; }
        .in-action-btn { bottom: 20px; }
        .in-tts-toggle-container { bottom: 20px; }
        .in-tts-toggle-label { display: block; }
        .in-inline-media, .in-inline-keywords { display: none !important; }
        .in-col2-media { display: block; }
    }

    @media (max-width: ${CONFIG.BREAKPOINTS.mobile - 1}px) {
        .dataview.table-view-table tbody tr { contain-intrinsic-size: auto 300px; }
        .dataview.table-view-table thead th:nth-child(1),
        .dataview.table-view-table tbody td:nth-child(1) { width: 100% !important; }
        .dataview.table-view-table thead th:nth-child(2),
        .dataview.table-view-table thead th:nth-child(3),
        .dataview.table-view-table tbody td:nth-child(2),
        .dataview.table-view-table tbody td:nth-child(3) { display: none !important; }
        .in-action-btn { bottom: 86px; padding: 10px 16px; font-size: 11px; }
        .in-tts-toggle-container { bottom: 86px; padding: 10px 12px; }
        .in-tts-toggle-label { display: none; }
        .in-search-container { flex-direction: column; }
        .in-search-input { min-width: unset; }
        .in-inline-media, .in-inline-keywords { display: block; margin-top: 8px; }
        .in-col2-media { display: none; }
    }
`;
document.head.appendChild(styleEl);

// ================================================================
// [2] UI 컴포넌트 + 초기화
// ================================================================
const cleanupHandlers = [];

const initUI = () => {
    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('INFO', 'initUI() called');
        window.ttsDebugPanel.updateLayoutMode(currentLayoutMode);
    }

    // R1.1: 엔드포인트 일치 검증 (TTS v5와 통합 노트가 동일한 엔드포인트 사용 확인)
    window.ttsLog('✅ TTS Position Read Endpoint (통합 노트):', TTS_POSITION_READ_ENDPOINT);
    if (window.playbackPositionManager?.apiEndpoint) {
        const ttsV5Endpoint = window.playbackPositionManager.apiEndpoint;
        window.ttsLog('✅ TTS v5 Endpoint:', ttsV5Endpoint);
        const match = (ttsV5Endpoint === TTS_POSITION_READ_ENDPOINT);
        window.ttsLog(match ? '✅ 엔드포인트 일치 확인!' : '⚠️ 엔드포인트 불일치 감지!');
    } else {
        window.ttsLog('⚠️ TTS v5 playbackPositionManager를 찾을 수 없습니다 (TTS v5 노트를 먼저 실행하세요)');
    }

    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) {
        // Clean up any existing button containers from previous runs
        const existingContainers = document.querySelectorAll('.integrated-ui-buttons-container');
        existingContainers.forEach(container => container.remove());

        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('WARN', 'initUI: Table not found yet, cleaned up old containers');
        }
        return;
    }
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) {
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('ERROR', 'initUI: No rows found!');
        }
        return;
    }

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('SUCCESS', `initUI: Found ${rows.length} rows`);
    }

    // 가드: 이미 초기화된 경우 기존 UI 전체 제거 후 재생성
    const existingContainer = table.parentNode.querySelector('.in-search-container');
    if (existingContainer) {
        window.ttsLog('⚠️ initUI 중복 호출 - 기존 UI 전체 제거 후 재초기화');
        // 기존 UI 전체 제거 (검색 컨테이너 포함)
        existingContainer.remove();

        // 기존 버튼/토글 제거 (이중으로 남은 것들 대비)
        const existingButtons = document.querySelectorAll('.in-action-btn');
        existingButtons.forEach(b => b.remove());
        const existingToggle = document.querySelector('.in-tts-toggle-container');
        if (existingToggle) existingToggle.remove();
    }

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('INFO', 'Creating search container and filters...');
    }

    // 검색/필터 UI
    const searchContainer = document.createElement('div');
    searchContainer.className = 'in-search-container';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'in-search-input';
    searchInput.placeholder = '토픽명 검색...';

    const domainSelect = document.createElement('select');
    domainSelect.className = 'in-domain-select';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '전체 도메인';
    domainSelect.appendChild(defaultOpt);
    domains.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        domainSelect.appendChild(opt);
    });

    const filterCount = document.createElement('span');
    filterCount.className = 'in-filter-count';
    filterCount.textContent = `${rows.length}개 표시`;

    searchContainer.append(searchInput, domainSelect, filterCount);
    table.parentNode.insertBefore(searchContainer, table);

    // 필터링 로직
    const applyFilter = () => {
        const query = searchInput.value.trim().toLowerCase();
        const selectedDomain = domainSelect.value;
        let visibleCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const name = (window.currentPageNames[i] || '').toLowerCase();
            const folder = (window._integratedNotePageFolders[i] || '');
            const matchesSearch = !query || name.includes(query);
            const matchesDomain = !selectedDomain || folder.includes(selectedDomain);

            if (matchesSearch && matchesDomain) {
                rows[i].classList.remove('in-hidden');
                visibleCount++;
            } else {
                rows[i].classList.add('in-hidden');
            }
        }
        filterCount.textContent = `${visibleCount}/${rows.length}개 표시`;
    };

    let searchTimer = null;
    const debouncedSearch = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applyFilter, CONFIG.SEARCH_DEBOUNCE_MS);
    };
    searchInput.addEventListener('input', debouncedSearch);
    domainSelect.addEventListener('change', applyFilter);

    // 이미지 Lazy Loading
    const loadRowImages = (row) => {
        const imgs = row.querySelectorAll('img.lazy-image[data-src]');
        imgs.forEach(img => {
            img.onload = () => { img.style.background = 'none'; img.classList.add('loaded'); };
            img.onerror = () => {
                img.style.background = 'var(--background-modifier-error-hover, #ffebee)';
                img.style.minHeight = '80px';
                img.alt = '이미지 로드 실패';
            };
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        });
    };

    const scrollEl = table.closest('.markdown-preview-view') || table.closest('.view-content');
    const scrollRoot = scrollEl && (getComputedStyle(scrollEl).overflowY === 'auto' || getComputedStyle(scrollEl).overflowY === 'scroll') ? scrollEl : null;

    // 초기 로딩: 현재 보이는 행의 이미지 즉시 로드
    const loadVisibleImages = () => {
        const viewport = table.closest('.markdown-preview-view') || table.closest('.view-content') || document.documentElement;
        const viewportHeight = viewport.innerHeight || window.innerHeight;
        
        for (const row of rows) {
            if (row.classList.contains('in-hidden')) continue;
            
            const rect = row.getBoundingClientRect();
            const viewportRect = viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : { top: 0 };
            
            // 뷰포트 내에 있거나 근처에 있는 이미지 로드
            const relativeTop = rect.top - viewportRect.top;
            if (relativeTop > -200 && relativeTop < viewportHeight + 200) {
                loadRowImages(row);
            }
        }
    };
    
    // 즉시 보이는 이미지 로드
    setTimeout(() => loadVisibleImages(), 100);

    const rowObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadRowImages(entry.target);
                rowObserver.unobserve(entry.target);
            }
        });
    }, {
        root: scrollRoot,
        rootMargin: lowEndMode ? '600px 0px' : '300px 0px',
        threshold: 0.01
    });

    for (const row of rows) {
        if (row.querySelector('img.lazy-image[data-src]')) {
            rowObserver.observe(row);
        }
    }
    cleanupHandlers.push(() => rowObserver.disconnect());

    // 버튼 위치 설정
    const updateButtonPositions = () => {
        const mob = isMobile();
        saveBtn.style.right = '20px';
        gotoBtn.style.right = mob ? '70px' : '120px';
        ttsBtn.style.right = mob ? '120px' : '320px';
        saveBtn.innerHTML = mob ? '📍' : '📍 저장';
        if (!gotoBtn.innerHTML.includes('✅') && !gotoBtn.innerHTML.includes('❌')) {
            const currentData = window.scrollPositionManager
                ? window.scrollPositionManager.getLocalPosition()
                : { noteName: localStorage.getItem('scroll_lastNoteName') || '' };
            gotoBtn.innerHTML = mob ? '🎯' : `🎯 ${getDisplayName(currentData.noteName)}`;
        }
        gotoBtn.style.maxWidth = mob ? '' : '180px';
        ttsBtn.style.maxWidth = mob ? '' : '180px';

        // 토글 스위치 위치 설정 (좌측)
        ttsToggleContainer.style.left = '20px';

        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('DEBUG', `Buttons positioned: mobile=${mob}`);
        }
    };

    // 리사이즈 핸들러
    let resizeTimer = null;
    const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newMode = getLayoutMode();
            if (newMode !== currentLayoutMode) {
                currentLayoutMode = newMode;
                window.ttsLog(`🔄 레이아웃 변경: ${currentLayoutMode}`);
                if (window.ttsDebugPanel) {
                    window.ttsDebugPanel.log('INFO', `Layout changed: ${currentLayoutMode}`);
                    window.ttsDebugPanel.updateLayoutMode(currentLayoutMode);
                    window.ttsDebugPanel.updateStats();
                }
                updateButtonPositions();
            }
        }, CONFIG.RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', handleResize);
    cleanupHandlers.push(() => window.removeEventListener('resize', handleResize));

    // 유틸리티
    const getDisplayName = (name) => name && name.length > 10 ? name.slice(0, 10) + '…' : (name || '없음');

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
        // fetchWithTimeout가 없으면 기본 fetch 사용 (타임아웃 없음)
        const fetchFn = window.fetchWithTimeout || window.fetch;
        const hasTimeout = typeof window.fetchWithTimeout === 'function';

        try {
            let response;
            if (hasTimeout) {
                response = await fetchFn(TTS_POSITION_READ_ENDPOINT, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }, 10000);
            } else {
                // 타임아웃 없는 fallback
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                try {
                    response = await fetch(TTS_POSITION_READ_ENDPOINT, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal
                    });
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (response && response.ok) {
                const serverData = await response.json();
                if (serverData && serverData.timestamp) {
                    const localTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);
                    if (serverData.timestamp > localTimestamp) {
                        localStorage.setItem('azureTTS_lastPlayedIndex', serverData.lastPlayedIndex.toString());
                        localStorage.setItem('azureTTS_lastPlayedTimestamp', serverData.timestamp.toString());
                        if (serverData.noteTitle) localStorage.setItem('azureTTS_lastPlayedTitle', serverData.noteTitle);
                    }
                    return {
                        index: serverData.lastPlayedIndex,
                        noteTitle: serverData.noteTitle || '',
                        notePath: serverData.notePath || ''
                    };
                }
            }
        } catch (error) {
            console.warn('TTS position sync failed:', error);
        }
        return {
            index: parseInt(localStorage.getItem('azureTTS_lastPlayedIndex') || '-1', 10),
            noteTitle: localStorage.getItem('azureTTS_lastPlayedTitle') || ''
        };
    };

    // TTS 버튼 참조 (gotoTTSPosition에서 사용)
    let ttsBtn = null;

    // R3.4: Debounce for scroll operations (300ms)
    let scrollDebounceTimer = null;
    const debouncedScrollToRow = (row) => {
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
        }
        scrollDebounceTimer = setTimeout(() => {
            scrollToRow(row);
            scrollDebounceTimer = null;
        }, 300);
    };

    // R3: Manual click handler with StateLock priority (R3.2: manual-click > auto-polling)
    const gotoTTSPosition = async () => {
        // 버튼이 초기화되지 않았으면 무시
        if (!ttsBtn) {
            window.ttsLog?.('⚠️ TTS 버튼이 초기화되지 않았습니다');
            return;
        }

        ttsBtn.textContent = '🎙️ 확인 중...';

        // StateLock이 있으면 사용, 없으면 lock 없이 직접 실행
        const hasStateLock = !!window.ttsAutoMoveStateLock;

        try {
            if (hasStateLock) {
                await window.ttsAutoMoveStateLock.acquire('manual-click');
            }

            try {
                const ttsData = await getTTSPosition();

                let ttsIndex = -1;

                // R1: Index-first matching for manual clicks too
                if (ttsData.index !== undefined && ttsData.index >= 0) {
                    ttsIndex = ttsData.index;
                    if (ttsData.noteTitle && window.currentPageNames) {
                        const expectedTitle = window.currentPageNames[ttsIndex];
                        if (expectedTitle === ttsData.noteTitle) {
                            window.ttsLog(`🎙️ TTS 위치: 인덱스 매칭 "${ttsData.noteTitle}" → index ${ttsIndex}`);
                        } else {
                            window.ttsLog(`🎙️ TTS 위치: 인덱스 ${ttsIndex} (제목 불일치)`);
                        }
                    } else {
                        window.ttsLog(`🎙️ TTS 위치: 인덱스 ${ttsIndex}`);
                    }
                } else if (ttsData.noteTitle && window.currentPageNames) {
                    // Fallback to title matching
                    ttsIndex = window.currentPageNames.indexOf(ttsData.noteTitle);
                    if (ttsIndex >= 0) {
                        window.ttsLog(`🎙️ TTS 위치: 제목 폴백 "${ttsData.noteTitle}" → index ${ttsIndex}`);
                    }
                }

                if (ttsIndex < 0 || ttsIndex >= rows.length) {
                    ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치';
                    window.ttsLog(`⚠️ TTS 위치 인덱스 범위 벗어남: ${ttsIndex}, 전체: ${rows.length}`);
                    return;
                }

                // R3.4: Use debounced scroll
                debouncedScrollToRow(rows[ttsIndex]);
                rows[ttsIndex].style.backgroundColor = '#9C27B033';
                const name = getDisplayName(window.currentPageNames[ttsIndex]);
                ttsBtn.textContent = `🎙️ ${name}`;
                setTimeout(() => { ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치'; }, 8000);
                setTimeout(() => { rows[ttsIndex].style.backgroundColor = ''; }, 3000);

                // R3.5: Race condition prevention logging
                window.ttsLog(`✅ [StateLock] Manual click operation completed successfully`);
            } catch (error) {
                window.ttsLog(`❌ [StateLock] Manual click operation failed: ${error.message}`);
                ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치';
            }
        } catch (error) {
            // StateLock acquire 실패 등 외부 에러 처리
            window.ttsLog(`❌ [StateLock] Lock acquisition failed: ${error.message}`);
            ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치';
        } finally {
            if (window.ttsAutoMoveStateLock) {
                window.ttsAutoMoveStateLock.release();
            }
        }
    };

    // 버튼 UI
    document.querySelectorAll('.in-action-btn').forEach(b => b.remove());

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('INFO', 'Creating buttons...');
    }

    const createButton = (className, text, backgroundColor) => {
        const btn = document.createElement('button');
        btn.className = `in-action-btn ${className}`;
        btn.innerHTML = text;
        btn.style.background = backgroundColor;
        if (!lowEndMode) {
            btn.onmouseenter = () => { btn.style.transform = 'scale(1.1)'; };
            btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
        }
        btn.ontouchstart = (e) => { e.preventDefault(); btn.click(); };
        return btn;
    };

    const isMobile = () => window.innerWidth < CONFIG.BREAKPOINTS.mobile;

    const localData = window.scrollPositionManager
        ? window.scrollPositionManager.getLocalPosition()
        : { noteName: localStorage.getItem('scroll_lastNoteName') || '', noteIndex: parseInt(localStorage.getItem('scroll_lastNoteIndex') || '-1', 10) };
    let displayName = getDisplayName(localData.noteName);

    // 저장 버튼
    const saveBtn = createButton('scroll-save-btn', isMobile() ? '📍' : '📍 저장', '#4CAF50');
    saveBtn.onclick = async () => {
        const idx = await savePosition();
        const isSuccess = idx >= 0;
        if (isSuccess) {
            displayName = getDisplayName(window.currentPageNames[idx]);
            if (!isMobile()) gotoBtn.innerHTML = `🎯 ${displayName}`;
        }
        saveBtn.innerHTML = isSuccess ? (isMobile() ? '✅' : '✅ 저장됨!') : '❌';
        saveBtn.style.background = isSuccess ? '#2196F3' : '#f44336';
        setTimeout(() => { saveBtn.innerHTML = isMobile() ? '📍' : '📍 저장'; saveBtn.style.background = '#4CAF50'; }, 2000);
    };

    // 이동 버튼
    const gotoBtn = createButton('scroll-goto-btn', isMobile() ? '🎯' : `🎯 ${displayName}`, '#FF9800');
    if (!isMobile()) gotoBtn.style.maxWidth = '180px';
    gotoBtn.onclick = async () => {
        gotoBtn.innerHTML = isMobile() ? '🎯' : '🎯 조회 중...';
        const idx = await gotoPosition();
        const isSuccess = idx >= 0;
        gotoBtn.innerHTML = isSuccess ? '✅' : '❌';
        gotoBtn.style.background = isSuccess ? '#2196F3' : '#f44336';
        setTimeout(() => {
            const currentData = window.scrollPositionManager
                ? window.scrollPositionManager.getLocalPosition()
                : { noteName: localStorage.getItem('scroll_lastNoteName') || '', noteIndex: parseInt(localStorage.getItem('scroll_lastNoteIndex') || '-1', 10) };
            gotoBtn.innerHTML = isMobile() ? '🎯' : `🎯 ${getDisplayName(currentData.noteName)}`;
            gotoBtn.style.background = '#FF9800';
        }, 2000);
    };

    // TTS 버튼
    ttsBtn = createButton('tts-goto-btn', isMobile() ? '🎙️' : '🎙️ TTS 위치', '#9C27B0');
    if (!isMobile()) ttsBtn.style.maxWidth = '180px';
    ttsBtn.onclick = async () => { await gotoTTSPosition(); };

    // TTS 자동 이동 토글 스위치
    const createTTSToggle = () => {
        const container = document.createElement('div');
        container.className = 'in-tts-toggle-container';

        // localStorage에서 상태 가져오기 (기본값: true)
        const isEnabled = localStorage.getItem('ttsAutoMoveEnabled') !== 'false';

        const label = document.createElement('label');
        label.className = 'in-tts-toggle-label';
        label.textContent = '자동 이동';

        // 토글 스위치 생성
        const toggleSwitch = document.createElement('div');
        toggleSwitch.className = `in-tts-toggle-switch ${isEnabled ? 'active' : ''}`;

        const slider = document.createElement('div');
        slider.className = 'in-tts-toggle-slider';
        toggleSwitch.appendChild(slider);

        // 간단한 상태 표시
        const statusSpan = document.createElement('span');
        statusSpan.id = 'tts-auto-status';
        statusSpan.textContent = '●';
        statusSpan.style.cssText = 'font-size: 8px; margin-left: 4px; color: #4CAF50;';

        // 토글 클릭 이벤트
        toggleSwitch.onclick = async (event) => {
            const currentState = toggleSwitch.classList.contains('active');
            const newState = !currentState;

            if (newState) {
                toggleSwitch.classList.add('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'true');
                statusSpan.style.color = '#4CAF50';
                statusSpan.textContent = '●';
                // 토글 켤 때 즉시 이동
                await gotoTTSPosition();
            } else {
                toggleSwitch.classList.remove('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'false');
                statusSpan.style.color = '#888';
                statusSpan.textContent = '○';
            }
        };

        container.append(label, toggleSwitch, statusSpan);
        return { container, toggleSwitch, statusSpan };
    };

    const { container: ttsToggleContainer, toggleSwitch: ttsToggleSwitch, statusSpan: ttsStatusSpan } = createTTSToggle();

    // 초기 상태 설정 (localStorage 값에 따른 상태 표시)
    const savedState = localStorage.getItem('ttsAutoMoveEnabled');
    if (savedState !== 'false') {
        ttsStatusSpan.style.color = '#4CAF50';
        ttsStatusSpan.textContent = '●';
    } else {
        ttsStatusSpan.style.color = '#888';
        ttsStatusSpan.textContent = '○';
    }

    // 버튼 컨테이너를 DOM에 먼저 추가 (auto-move 오류와 무관하게 버튼 표시 보장)
    updateButtonPositions();
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'integrated-ui-buttons-container';
    buttonContainer.append(saveBtn, gotoBtn, ttsBtn, ttsToggleContainer);
    document.body.appendChild(buttonContainer);

    // ================================================================
    // TTS 연속 자동 이동 (리팩토링: SPEC-TTS-AUTOMOVE-001)
    // - 노트별 타이머 격리 (TTSAutoMoveManager)
    // - Race Condition 방지 (StateLock)
    // - 다중 레이어 정리 메커니즘
    // - API 요청 쓰로틀링 (APIThrottle)
    // ================================================================
    let autoMoveManager = null;
    try {

    // 노트 ID 생성 (고유 식별자)
    const generateNoteId = () => {
        if (savedNoteName) {
            return `note:${savedNoteName}`;
        }
        const table = dvRef.container.querySelector('.table-view-table');
        if (table) {
            return `note:table-${Array.from(document.querySelectorAll('.table-view-table')).indexOf(table)}`;
        }
        return `note:${Date.now()}`;
    };

    const noteId = generateNoteId();
    window.ttsLog(`🆔 [TTS Auto-Move] 노트 ID: ${noteId}`);

    // 페이지 로드 시 기존 타이머 정리 (이전 노트의 타이머 정리)
    const cleanupOldTimers = () => {
        for (const [id, manager] of window.ttsAutoMoveTimers) {
            if (id !== noteId) {
                window.ttsLog(`🧹 [TTS Auto-Move] 이전 노트 타이머 정리: ${id}`);
                manager.cleanup();
            }
        }
    };
    cleanupOldTimers();

    // TTSAutoMoveManager 생성 또는 가져오기
    autoMoveManager = window.ttsAutoMoveTimers.get(noteId);
    if (!autoMoveManager) {
        autoMoveManager = new TTSAutoMoveManager(noteId, {
            endpoint: TTS_POSITION_READ_ENDPOINT,
            interval: 6000,
            initialDelay: 3000
        });

        // UI 참조 설정
        autoMoveManager.setUIRefs(ttsStatusSpan, rows, scrollToRow);

        // Map에 등록
        window.ttsAutoMoveTimers.set(noteId, autoMoveManager);
        window.ttsAutoMoveStates.set(noteId, { enabled: true });

        // 정리 핸들러 설정
        autoMoveManager.setupCleanupHandlers(ttsToggleContainer);

        window.ttsLog(`✅ [TTS Auto-Move] ${noteId} Manager 생성 완료`);
    } else {
        // 기존 Manager가 있으면 UI 참조 업데이트
        autoMoveManager.setUIRefs(ttsStatusSpan, rows, scrollToRow);
        window.ttsLog(`♻️ [TTS Auto-Move] ${noteId} Manager 재사용`);
    }

    // 자동 모니터링 시작 (토글이 켜져 있는 경우)
    const isEnabled = localStorage.getItem('ttsAutoMoveEnabled') !== 'false';
    if (isEnabled) {
        window.ttsLog('🎬 [TTS Auto-Move] 자동 모니터링 시작');
        autoMoveManager.start();
    } else {
        window.ttsLog('⏸️ [TTS Auto-Move] 토글이 꺼져 있어 모니터링 시작 안함');
    }

    // 토글 클릭 이벤트 (StateLock으로 Race Condition 방지)
    ttsToggleSwitch.onclick = async (event) => {
        const currentState = ttsToggleSwitch.classList.contains('active');
        const newState = !currentState;

        // StateLock으로 원자적 상태 변경 보장
        await window.ttsAutoMoveStateLock.acquire();
        try {
            if (newState) {
                // 토글 ON
                ttsToggleSwitch.classList.add('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'true');
                ttsStatusSpan.style.color = '#4CAF50';
                ttsStatusSpan.textContent = '●';

                // 즉시 TTS 위치로 이동
                await gotoTTSPosition();

                // Manager로 모니터링 시작
                if (autoMoveManager && !autoMoveManager.isRunning) {
                    autoMoveManager.start();
                }
            } else {
                // 토글 OFF
                ttsToggleSwitch.classList.remove('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'false');
                ttsStatusSpan.style.color = '#888';
                ttsStatusSpan.textContent = '○';

                // Manager 정지
                if (autoMoveManager && autoMoveManager.isRunning) {
                    autoMoveManager.stop();
                }
            }
        } finally {
            window.ttsAutoMoveStateLock.release();
        }
    };

    // 정리 시 Manager 정리
    const originalRemove = ttsToggleContainer.remove;
    ttsToggleContainer.remove = function() {
        if (autoMoveManager) {
            autoMoveManager.cleanup();
        }
        originalRemove.call(this);
    };

    } catch (autoMoveError) {
        window.ttsLog?.(`⚠️ [TTS Auto-Move] 초기화 실패 (버튼 표시는 정상): ${autoMoveError.message}`);
        console.warn('[TTS Auto-Move] Init error:', autoMoveError);
    }

    // 현재 노트가 통합노트인지 확인 (table이 DOM에 있는지로 판단)
    const updateButtonsVisibility = () => {
        const isIntegratedNoteOpen = document.body.contains(table);
        buttonContainer.style.display = isIntegratedNoteOpen ? 'block' : 'none';
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('DEBUG', `Visibility check: ${isIntegratedNoteOpen ? 'visible' : 'hidden'}`);
        }
    };

    // 초기 상태 설정 (항상 보이게 시작 - table은 이미 DOM에 있음)
    buttonContainer.style.display = 'block';
    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('SUCCESS', 'Buttons set to visible initially');
    }

    // 노트 전환 감지 (주기적으로 체크)
    const visibilityCheckInterval = setInterval(() => {
        // Check if buttonContainer still exists
        if (!buttonContainer || !document.body.contains(buttonContainer)) {
            clearInterval(visibilityCheckInterval);
            window.ttsLog('🔍 [Visibility] Button container removed, stopping visibility check');
            return;
        }

        // Check if table still exists in DOM
        const currentTable = dvRef.container?.querySelector('.table-view-table');
        const isTablePresent = currentTable && document.body.contains(currentTable);

        if (!isTablePresent) {
            buttonContainer.style.display = 'none';
            if (window.ttsDebugPanel) {
                window.ttsDebugPanel.log('DEBUG', 'Table not found, hiding buttons');
            }
        } else {
            buttonContainer.style.display = 'block';
            updateButtonsVisibility();
        }
    }, 500);

    // 정리 핸들러에 추가
    cleanupHandlers.push(() => {
        clearInterval(visibilityCheckInterval);
    });

    // MutationObserver (정리용)
    const cleanupObserver = new MutationObserver(() => {
        if (!document.body.contains(table)) {
            buttonContainer.remove();
            clearInterval(visibilityCheckInterval);
            // Manager 정리 (새로운 방식)
            if (autoMoveManager) {
                autoMoveManager.cleanup();
            }
            searchContainer.remove();
            cleanupObserver.disconnect();
            styleEl.remove();
            cleanupHandlers.forEach(fn => fn());
            clearTimeout(searchTimer);
            clearTimeout(resizeTimer);
            window.ttsLog('🧹 통합노트 정리 완료');
            if (window.ttsDebugPanel) {
                window.ttsDebugPanel.log('INFO', 'Cleanup: Integrated note removed');
            }
        }
    });
    cleanupObserver.observe(table.parentNode, { childList: true });

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('SUCCESS', 'initUI() completed successfully');
    }
};

// ================================================================
// [3] 테이블 렌더링 대기
// ================================================================
const waitForTable = new MutationObserver(() => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) {
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.updateTableStatus(false, 0);
        }
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('WARN', 'Table found but tbody missing');
            window.ttsDebugPanel.updateTableStatus(false, 0);
        }
        return;
    }

    const rows = tbody.querySelectorAll('tr');

    // Add row count validation - wait for actual data rows
    if (rows.length === 0) {
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('INFO', 'Table has no rows yet, waiting...');
            window.ttsDebugPanel.updateTableStatus(true, 0);
        }
        return;
    }

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('DEBUG', `Table detected, ${rows.length} rows found`);
        window.ttsDebugPanel.updateTableStatus(true, rows.length);
    }

    if (rows.length > 0) {
        waitForTable.disconnect();
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('SUCCESS', 'Table ready, calling initUI()');
        }
        if (window.requestIdleCallback) {
            requestIdleCallback(() => initUI(), { timeout: 200 });
        } else {
            setTimeout(() => initUI(), 50);
        }
    }
});
waitForTable.observe(dvRef.container, { childList: true, subtree: true });

// 이미 렌더링된 경우 즉시 실행
const readyTable = dvRef.container.querySelector('.table-view-table');
if (readyTable) {
    const tbody = readyTable.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr') ?? [];

    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('INFO', 'Pre-rendered table detected');
        window.ttsDebugPanel.updateTableStatus(!!tbody, rows.length);
    }

    // Add row count validation for pre-rendered table
    if (!tbody || rows.length === 0) {
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('INFO', 'Pre-rendered table has no rows yet, waiting for data...');
        }
    } else if (tbody && rows.length > 0) {
        waitForTable.disconnect();
        if (window.ttsDebugPanel) {
            window.ttsDebugPanel.log('SUCCESS', `Pre-rendered table ready with ${rows.length} rows, calling initUI()`);
        }
        initUI();
    }
} else {
    if (window.ttsDebugPanel) {
        window.ttsDebugPanel.log('INFO', 'Waiting for table to render...');
    }
}

// ================================================================
// [4] 상태 표시
// ================================================================
const layoutIcons = { desktop: '🖥️ Desktop (3 Column)', tablet: '📱 Tablet (2 Column)', mobile: '📱 Mobile (1 Column)' };
if (bookmarkIndex >= 0 && pages[bookmarkIndex]) {
    dvRef.paragraph(`> ✅ 마지막 위치: **${bookmarkIndex + 1}번째** - "${pages[bookmarkIndex].file.name}" (☁️ 서버 동기화됨)`);
} else if (savedNoteName) {
    dvRef.paragraph(`> ⚠️ "${savedNoteName}" 노트를 찾을 수 없음`);
} else {
    dvRef.paragraph(`> ℹ️ 저장된 위치 없음 - 📍 저장 버튼으로 수동 저장`);
}
dvRef.paragraph(`총 ${pages.length}개 항목 | 기출 범위: ${CONFIG.EXAM_RANGE.start}~${CONFIG.EXAM_RANGE.end}회 | 현재 레이아웃: ${layoutIcons[currentLayoutMode]}`);

window.ttsLog('✅ [integrated-ui] 모듈 로드 완료');

// Debug panel: Enable by running this in browser console:
// localStorage.setItem('debugPanelEnabled', 'true'); location.reload();
// Or simply: window.ttsDebugPanel.toggle(true);

if (window.ttsDebugPanel) {
    window.ttsDebugPanel.log('SUCCESS', '[integrated-ui] Module loaded completely');
    window.ttsDebugPanel.updateLayoutMode(currentLayoutMode);
}
}
