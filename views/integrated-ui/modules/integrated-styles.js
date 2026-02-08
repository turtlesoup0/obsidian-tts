// ============================================
// integrated-styles: 통합 노트 반응형 CSS
// 의존성: 없음 (CONFIG, lowEndMode를 파라미터로 수신)
// ============================================

if (!window._integratedStylesLoaded) {
    window._integratedStylesLoaded = true;

    /**
     * 통합 노트 스타일 생성 및 DOM 삽입
     * @param {Object} params - { styleId, breakpoints: { mobile, tablet }, lowEndMode }
     * @returns {HTMLStyleElement} 삽입된 style 요소
     */
    window.createIntegratedStyles = function({ styleId, breakpoints, lowEndMode }) {
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) existingStyle.remove();

        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
    :root {
        --in-transition-speed: ${lowEndMode ? '0.15s' : '0.3s'};
        --in-bp-mobile: ${breakpoints.mobile}px;
        --in-bp-tablet: ${breakpoints.tablet}px;
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
    @media (min-width: ${breakpoints.tablet}px) {
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

    @media (min-width: ${breakpoints.mobile}px) and (max-width: ${breakpoints.tablet - 1}px) {
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

    @media (max-width: ${breakpoints.mobile - 1}px) {
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
        return styleEl;
    };

    window.ttsLog?.('✅ [integrated-ui/integrated-styles] 모듈 로드 완료');
}
