// ============================================
// integrated-ui: 통합 노트 UI 컴포넌트
// 의존성: tts-core, scroll-manager
// input: { config, domains, lowEndMode, getLayoutMode, TTS_POSITION_READ_ENDPOINT, bookmarkIndex, pages, savedNoteName, dv }
// ============================================

// Load modules (app.vault.read 사용 - Obsidian app:// 프로토콜에서 <script src> 불가)
(async () => {
    const loadVaultModule = async (path) => {
        try {
            const file = app.vault.getAbstractFileByPath(path);
            if (file) {
                const content = await app.vault.read(file);
                new Function(content)();
            } else {
                console.warn(`⚠️ [integrated-ui] 모듈 파일 없음 (무시): ${path}`);
            }
        } catch(e) {
            console.warn(`⚠️ [integrated-ui] 모듈 로드 실패 (무시): ${path}`, e.message);
        }
    };

    await loadVaultModule('views/integrated-ui/modules/state-lock.js');
    await loadVaultModule('views/integrated-ui/modules/auto-move-manager.js');
    await loadVaultModule('views/integrated-ui/modules/position-helpers.js');
    await loadVaultModule('views/integrated-ui/modules/integrated-styles.js');
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

// StateLock, TTSAutoMoveManager: modules/state-lock.js, modules/auto-move-manager.js 에서 로드

// StateLock 인스턴스 생성
if (!window.ttsAutoMoveStateLock) {
    window.ttsAutoMoveStateLock = new window.StateLock();
    window.ttsLog?.('✅ ttsAutoMoveStateLock 인스턴스 생성');
}

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
// [1] 반응형 CSS (modules/integrated-styles.js)
// ================================================================
const styleEl = window.createIntegratedStyles({
    styleId: CONFIG.STYLE_ID,
    breakpoints: CONFIG.BREAKPOINTS,
    lowEndMode
});

// ================================================================
// [2] UI 컴포넌트 + 초기화
// ================================================================
const cleanupHandlers = [];

const initUI = () => {
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
        return;
    }
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) {
        return;
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
                updateButtonPositions();
            }
        }, CONFIG.RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', handleResize);
    cleanupHandlers.push(() => window.removeEventListener('resize', handleResize));

    // 유틸리티
    const getDisplayName = (name) => name && name.length > 10 ? name.slice(0, 10) + '…' : (name || '없음');

    // 위치 관리 함수 (modules/position-helpers.js)
    const { scrollToRow, findCenterRow, savePosition, gotoPosition, getTTSPosition } = window.createPositionHelpers({ rows });

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
    // skipLock: 토글 핸들러 내부에서 호출 시 true (이미 lock 보유 → 이중 acquire 방지)
    const gotoTTSPosition = async (skipLock = false) => {
        // 버튼이 초기화되지 않았으면 무시
        if (!ttsBtn) {
            window.ttsLog?.('⚠️ TTS 버튼이 초기화되지 않았습니다');
            return;
        }

        ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ ⏳';
        ttsBtn.style.opacity = '0.7';

        // StateLock이 있고, skipLock이 아니면 lock 획득
        const hasStateLock = !skipLock && !!window.ttsAutoMoveStateLock;

        try {
            if (hasStateLock) {
                await window.ttsAutoMoveStateLock.acquire('manual-click');
            }

            try {
                const ttsData = await getTTSPosition();

                let ttsIndex = -1;

                // noteTitle 우선 매칭 (TTS노트와 통합노트의 인덱스 공간이 다를 수 있음)
                if (ttsData.noteTitle && window.currentPageNames) {
                    ttsIndex = window.currentPageNames.indexOf(ttsData.noteTitle);
                    if (ttsIndex >= 0) {
                        window.ttsLog(`🎙️ TTS 위치: 제목 매칭 "${ttsData.noteTitle}" → index ${ttsIndex}`);
                    }
                }
                // noteTitle 매칭 실패 시 인덱스 폴백
                if (ttsIndex < 0 && ttsData.index !== undefined && ttsData.index >= 0 && ttsData.index < rows.length) {
                    ttsIndex = ttsData.index;
                    window.ttsLog(`🎙️ TTS 위치: 인덱스 폴백 → index ${ttsIndex}`);
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
                ttsBtn.style.opacity = '1';
                ttsBtn.textContent = `🎙️ ${name}`;
                setTimeout(() => { ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치'; }, 8000);
                setTimeout(() => { rows[ttsIndex].style.backgroundColor = ''; }, 3000);

                // lastPosition 동기화: 이후 SSE 이벤트와 중복 스크롤 방지
                if (autoMoveManager) {
                    autoMoveManager.lastPosition = { index: ttsIndex, name: ttsData.noteTitle || '' };
                }

                // R3.5: Race condition prevention logging
                window.ttsLog(`✅ [StateLock] Manual click → Edge 1회 조회 완료, lastPosition 동기화`);
            } catch (error) {
                window.ttsLog(`❌ [StateLock] Manual click operation failed: ${error.message}`);
                if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                    ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ 서버 응답 없음';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ 네트워크 오류';
                } else {
                    ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ 위치 확인 실패';
                }
                setTimeout(() => { ttsBtn.textContent = isMobile() ? '🎙️' : '🎙️ TTS 위치'; }, 5000);
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

        // 토글 클릭 이벤트는 initUI 내 StateLock 핸들러에서 단일 등록 (L971)
        // 여기서 중복 등록하면 교착 위험 (skipLock 없이 gotoTTSPosition 호출)

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
        autoMoveManager = new TTSAutoMoveManager(noteId);

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

    // pollTTSPosition 완전 제거: 위치 동기화는 SSE 이벤트(tts-position-changed) 전용
    // 폴링 제거 이유: (1) 오프라인/불안정 네트워크에서 무의미 (2) TTS 미재생 시 불필요한 HTTP 요청 폭증

    // SSE 전용 위치 동기화 핸들러 (유일한 위치 업데이트 경로)
    // Edge PUT → SSE broadcast → tts-position-changed 이벤트 → 여기서 스크롤
    const handleTTSPositionChanged = (event) => {
        // 토글 OFF 시 SSE 이벤트 무시
        if (autoMoveManager && !autoMoveManager.enabled) return;

        // SSE 이벤트 데이터 검증
        const detail = event.detail || {};
        const index = Number.isInteger(detail.index) ? detail.index : -1;
        const noteTitle = typeof detail.noteTitle === 'string' ? detail.noteTitle : '';
        // noteTitle 우선 매칭 (TTS노트와 통합노트의 인덱스 공간이 다를 수 있음)
        let targetIndex = -1;
        if (noteTitle && window.currentPageNames) {
            targetIndex = window.currentPageNames.indexOf(noteTitle);
            if (targetIndex >= 0) {
                window.ttsLog?.(`⚡ [AutoMove] 제목 매칭: "${noteTitle}" → index ${targetIndex}`);
            }
        }
        // noteTitle 매칭 실패 시 인덱스 폴백
        if (targetIndex < 0) {
            targetIndex = index;
        }
        if (targetIndex < 0 || targetIndex >= rows.length) {
            window.ttsLog?.(`⚠️ [AutoMove] SSE 위치 범위 초과: target=${targetIndex}, max=${rows.length - 1}`);
            return;
        }
        if (autoMoveManager) {
            autoMoveManager.onPositionChanged();
            autoMoveManager.lastPosition = { index: targetIndex, name: noteTitle };
        }
        debouncedScrollToRow(rows[targetIndex]);
        if (ttsStatusSpan) {
            ttsStatusSpan.style.color = '#4CAF50';
            ttsStatusSpan.textContent = '●';
            ttsStatusSpan.title = `SSE 동기화: ${new Date().toLocaleTimeString()}`;
        }
        // SSE 헬스 타이머 리셋
        if (sseHealthTimer) clearTimeout(sseHealthTimer);
        sseHealthTimer = setTimeout(() => {
            if (ttsStatusSpan && autoMoveManager?.enabled) {
                ttsStatusSpan.style.color = '#FF9800';
                ttsStatusSpan.textContent = '△';
                ttsStatusSpan.title = 'SSE 이벤트 30초 이상 미수신';
            }
        }, 30000);
        window.ttsLog?.(`⚡ [AutoMove] SSE 즉시 이동: index=${targetIndex}, note="${noteTitle}"`);
    };
    let sseHealthTimer = null;
    window.addEventListener('tts-position-changed', handleTTSPositionChanged);
    cleanupHandlers.push(() => window.removeEventListener('tts-position-changed', handleTTSPositionChanged));

    // SSE 모드 변경 이벤트 리스너 (로깅 전용, 폴링 완전 제거)
    // Edge-First 아키텍처: PUT → Edge → SSE broadcast → tts-position-changed 이벤트 → 즉시 반영
    const handleSSEModeChanged = (event) => {
        const { mode } = event.detail;
        if (mode === 'sse') {
            window.ttsLog?.('🔄 [AutoMove] SSE 활성화 - 실시간 동기화 모드');
        } else {
            window.ttsLog?.('⚠️ [AutoMove] SSE 비활성화 - SSE 재연결 대기 (폴링 없음)');
        }
    };
    window.addEventListener('sse-mode-changed', handleSSEModeChanged);
    cleanupHandlers.push(() => window.removeEventListener('sse-mode-changed', handleSSEModeChanged));

    // 자동 모니터링 초기화 (SSE 전용, 폴링 없음)
    const isEnabled = localStorage.getItem('ttsAutoMoveEnabled') !== 'false';
    if (isEnabled) {
        autoMoveManager.enable();
        window.ttsLog?.('🎬 [TTS Auto-Move] SSE 전용 모드 활성화 (폴링 없음, tts-position-changed 이벤트 대기)');
    } else {
        window.ttsLog?.('⏸️ [TTS Auto-Move] 토글이 꺼져 있어 모니터링 시작 안 함');
    }

    // 토글 클릭 이벤트 (StateLock으로 Race Condition 방지)
    ttsToggleSwitch.onclick = async (event) => {
        const currentState = ttsToggleSwitch.classList.contains('active');
        const newState = !currentState;

        // StateLock으로 원자적 상태 변경 보장
        if (window.ttsAutoMoveStateLock) await window.ttsAutoMoveStateLock.acquire('toggle');
        try {
            if (newState) {
                // 토글 ON
                ttsToggleSwitch.classList.add('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'true');
                ttsStatusSpan.style.color = '#4CAF50';
                ttsStatusSpan.textContent = '●';

                // 즉시 TTS 위치로 이동 (skipLock=true: 이미 토글에서 lock 보유)
                await gotoTTSPosition(true);

                // SSE 전용 모드 활성화 (폴링 없음)
                if (autoMoveManager) {
                    autoMoveManager.enable();
                    window.ttsLog?.('🎬 [AutoMove] 토글 ON: SSE 전용 모드 활성화');
                }
            } else {
                // 토글 OFF
                ttsToggleSwitch.classList.remove('active');
                localStorage.setItem('ttsAutoMoveEnabled', 'false');
                ttsStatusSpan.style.color = '#888';
                ttsStatusSpan.textContent = '○';

                // Manager 비활성화
                if (autoMoveManager) {
                    autoMoveManager.disable();
                }
            }
        } finally {
            if (window.ttsAutoMoveStateLock) window.ttsAutoMoveStateLock.release();
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
    };

    // 초기 상태 설정 (항상 보이게 시작 - table은 이미 DOM에 있음)
    buttonContainer.style.display = 'block';

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
        }
    });
    cleanupObserver.observe(table.parentNode, { childList: true });

};

// ================================================================
// [3] 테이블 렌더링 대기
// ================================================================
const waitForTable = new MutationObserver(() => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) {
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        return;
    }

    const rows = tbody.querySelectorAll('tr');

    // Add row count validation - wait for actual data rows
    if (rows.length === 0) {
        return;
    }

    if (rows.length > 0) {
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
if (readyTable) {
    const tbody = readyTable.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr') ?? [];

    // Add row count validation for pre-rendered table
    if (!tbody || rows.length === 0) {
        // 아직 데이터 없음 - MutationObserver가 처리
    } else if (tbody && rows.length > 0) {
        waitForTable.disconnect();
        initUI();
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
}
