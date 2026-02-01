// ============================================
// integrated-ui: 통합 노트 UI 컴포넌트
// 의존성: tts-core, scroll-manager
// input: { config, domains, lowEndMode, getLayoutMode, TTS_POSITION_READ_ENDPOINT, bookmarkIndex, pages, savedNoteName, dv }
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.integratedUIModule) {
    window.integratedUIModule = true;
    window.ttsLog('✅ [integrated-ui] 모듈 로드 시작');
}

// input에서 필요한 값 추출
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
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000;
        ${!lowEndMode ? 'transition: transform 0.2s; will-change: transform;' : ''}
    }

    @media (min-width: ${CONFIG.BREAKPOINTS.tablet}px) {
        .dataview.table-view-table thead th:nth-child(1),
        .dataview.table-view-table tbody td:nth-child(1) { width: 40% !important; }
        .dataview.table-view-table thead th:nth-child(2),
        .dataview.table-view-table tbody td:nth-child(2) { width: 30% !important; }
        .dataview.table-view-table thead th:nth-child(3),
        .dataview.table-view-table tbody td:nth-child(3) { width: 30% !important; display: table-cell !important; }
        .in-action-btn { bottom: 20px; }
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
    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) return;

    // 가드: 이미 초기화된 경우 스킵
    if (table.parentNode.querySelector('.in-search-container')) {
        window.ttsLog('⚠️ initUI 중복 호출 방지 - 이미 초기화됨');
        return;
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
        threshold: 0
    });

    for (const row of rows) {
        if (row.querySelector('img.lazy-image[data-src]')) {
            rowObserver.observe(row);
        }
    }
    cleanupHandlers.push(() => rowObserver.disconnect());

    // 리사이즈 핸들러
    let resizeTimer = null;
    const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newMode = getLayoutMode();
            if (newMode !== currentLayoutMode) {
                currentLayoutMode = newMode;
                window.ttsLog(`🔄 레이아웃 변경: ${currentLayoutMode}`);
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
        try {
            const response = await window.fetchWithTimeout(TTS_POSITION_READ_ENDPOINT, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 10000);
            if (response.ok) {
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
        } catch (error) { console.warn('TTS position sync failed:', error); }
        return {
            index: parseInt(localStorage.getItem('azureTTS_lastPlayedIndex') || '-1', 10),
            noteTitle: localStorage.getItem('azureTTS_lastPlayedTitle') || ''
        };
    };

    // TTS 버튼 참조 (gotoTTSPosition에서 사용)
    let ttsBtn = null;

    const gotoTTSPosition = async () => {
        ttsBtn.textContent = '🎙️ 확인 중...';
        const ttsData = await getTTSPosition();

        let ttsIndex = -1;

        if (ttsData.noteTitle && window.currentPageNames) {
            ttsIndex = window.currentPageNames.indexOf(ttsData.noteTitle);
            if (ttsIndex >= 0) {
                window.ttsLog(`🎙️ TTS 위치: 이름 매칭 "${ttsData.noteTitle}" → index ${ttsIndex}`);
            }
        }

        if (ttsIndex < 0) {
            ttsIndex = ttsData.index;
            if (ttsIndex >= 0) {
                console.warn(`⚠️ TTS 위치: 이름 매칭 실패 ("${ttsData.noteTitle}"), 인덱스 폴백 → ${ttsIndex}`);
            }
        }

        if (ttsIndex < 0 || ttsIndex >= rows.length) {
            ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치';
            return;
        }
        scrollToRow(rows[ttsIndex]);
        rows[ttsIndex].style.backgroundColor = '#9C27B033';
        const name = getDisplayName(window.currentPageNames[ttsIndex]);
        ttsBtn.textContent = `🎙️ ${name}`;
        setTimeout(() => { ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치'; }, 5000);
        setTimeout(() => { rows[ttsIndex].style.backgroundColor = ''; }, 3000);
    };

    // 버튼 UI
    document.querySelectorAll('.in-action-btn').forEach(b => b.remove());

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
    };
    updateButtonPositions();

    document.body.append(saveBtn, gotoBtn, ttsBtn);

    // MutationObserver (정리용)
    const cleanupObserver = new MutationObserver(() => {
        if (!document.body.contains(table)) {
            saveBtn.remove();
            gotoBtn.remove();
            ttsBtn.remove();
            searchContainer.remove();
            cleanupObserver.disconnect();
            styleEl.remove();
            cleanupHandlers.forEach(fn => fn());
            clearTimeout(searchTimer);
            clearTimeout(resizeTimer);
            window.ttsLog('🧹 통합노트 정리 완료');
        }
    });
    cleanupObserver.observe(table.parentNode, { childList: true });
};

// ================================================================
// [3] 테이블 렌더링 대기
// ================================================================
const waitForTable = new MutationObserver(() => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (table?.querySelector('tbody tr')) {
        waitForTable.disconnect();
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
if (readyTable?.querySelector('tbody tr')) {
    waitForTable.disconnect();
    initUI();
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
