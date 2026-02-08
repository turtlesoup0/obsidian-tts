// ============================================
// tts-styles: TTS UI CSS 디자인 토큰 및 스타일
// 의존성: 없음
// ============================================

if (!document.getElementById('tts-ui-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'tts-ui-styles';
    styleEl.textContent = `
        :root {
            --tts-accent: #667eea;
            --tts-accent-end: #764ba2;
            --tts-success: #4CAF50;
            --tts-warning: #FF9800;
            --tts-danger: #F44336;
            --tts-info: #2196F3;
            --tts-gold: #FFD700;
            --tts-radius: 10px;
            --tts-radius-sm: 6px;
            --tts-space-xs: 4px;
            --tts-space-sm: 8px;
            --tts-space-md: 12px;
            --tts-space-lg: 16px;
            --tts-space-xl: 20px;
            --tts-font-sm: 12px;
            --tts-font-md: 14px;
            --tts-font-lg: 16px;
            --tts-font-xl: 18px;
            --tts-touch-min: 44px;
            --tts-glass: rgba(255,255,255,0.12);
            --tts-glass-hover: rgba(255,255,255,0.2);
            --tts-text: white;
            --tts-text-muted: rgba(255,255,255,0.7);
            --tts-text-dim: rgba(255,255,255,0.5);
        }

        .tts-container {
            display: flex;
            flex-direction: column;
            gap: var(--tts-space-lg);
        }

        .tts-panel {
            background: linear-gradient(135deg, var(--tts-accent) 0%, var(--tts-accent-end) 100%);
            border-radius: var(--tts-radius);
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            padding: var(--tts-space-xl);
        }

        .tts-panel-header {
            color: var(--tts-text);
            font-size: var(--tts-font-lg);
            font-weight: bold;
            margin: 0 0 var(--tts-space-md) 0;
        }

        .tts-glass-box {
            background: var(--tts-glass);
            border-radius: var(--tts-radius-sm);
            padding: var(--tts-space-md);
            color: var(--tts-text);
        }

        .tts-btn {
            border: none;
            border-radius: var(--tts-radius-sm);
            cursor: pointer;
            color: white;
            font-weight: bold;
            transition: all 0.2s ease;
            min-height: var(--tts-touch-min);
            min-width: var(--tts-touch-min);
            padding: var(--tts-space-md) var(--tts-space-lg);
            font-size: var(--tts-font-md);
        }
        .tts-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .tts-btn:active { transform: translateY(0); }

        .tts-btn-primary { background: var(--tts-success); }
        .tts-btn-danger { background: var(--tts-danger); }
        .tts-btn-info { background: var(--tts-info); }
        .tts-btn-warning { background: var(--tts-warning); }
        .tts-btn-purple { background: #9C27B0; }

        /* 플레이어 컨트롤 영역 */
        .tts-player-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--tts-space-sm);
            flex-wrap: wrap;
            margin: var(--tts-space-md) 0;
        }

        .tts-play-main {
            min-width: 120px;
            min-height: 52px;
            font-size: var(--tts-font-xl);
            padding: var(--tts-space-md) var(--tts-space-xl);
        }

        /* 속도 컨트롤 */
        .tts-rate-controls {
            display: flex;
            align-items: center;
            gap: var(--tts-space-sm);
            flex-wrap: wrap;
            margin-top: var(--tts-space-sm);
        }

        .tts-rate-label {
            color: var(--tts-text);
            font-weight: bold;
            font-size: var(--tts-font-md);
        }

        .tts-rate-value {
            color: var(--tts-gold);
            font-size: var(--tts-font-xl);
            font-weight: bold;
            min-width: 40px;
            text-align: center;
        }

        .tts-rate-btn {
            min-height: 36px;
            padding: var(--tts-space-sm) var(--tts-space-md);
            font-size: var(--tts-font-sm);
        }

        /* 접이식 섹션 */
        .tts-collapsible {
            border-radius: var(--tts-radius);
            overflow: hidden;
        }

        .tts-collapsible summary {
            background: linear-gradient(135deg, var(--tts-accent) 0%, var(--tts-accent-end) 100%);
            color: var(--tts-text);
            padding: var(--tts-space-md) var(--tts-space-lg);
            font-weight: bold;
            font-size: var(--tts-font-md);
            cursor: pointer;
            list-style: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: var(--tts-touch-min);
            user-select: none;
            border-radius: var(--tts-radius);
        }

        .tts-collapsible summary::-webkit-details-marker { display: none; }

        .tts-collapsible summary::after {
            content: '\\25B6';
            font-size: 12px;
            transition: transform 0.2s ease;
        }

        .tts-collapsible[open] summary::after {
            transform: rotate(90deg);
        }

        .tts-collapsible[open] summary {
            border-radius: var(--tts-radius) var(--tts-radius) 0 0;
        }

        .tts-collapsible-content {
            background: linear-gradient(135deg, var(--tts-accent) 0%, var(--tts-accent-end) 100%);
            padding: 0 var(--tts-space-xl) var(--tts-space-xl);
            border-radius: 0 0 var(--tts-radius) var(--tts-radius);
        }

        /* 노트 목록 테이블 */
        .tts-note-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: var(--tts-space-sm);
        }

        .tts-note-table th {
            padding: var(--tts-space-sm);
            background: var(--background-secondary, #f5f5f5);
            text-align: left;
            font-size: var(--tts-font-sm);
            border: 1px solid var(--background-modifier-border, #ddd);
            position: sticky;
            top: 0;
            z-index: 1;
        }

        .tts-note-table td {
            padding: var(--tts-space-sm);
            border: 1px solid var(--background-modifier-border, #ddd);
            font-size: var(--tts-font-sm);
        }

        .tts-note-table tr:hover {
            background: var(--background-secondary, rgba(0,0,0,0.02));
        }

        .tts-note-table .tts-note-play-btn {
            padding: var(--tts-space-xs) var(--tts-space-sm);
            min-height: 32px;
            min-width: 32px;
            font-size: var(--tts-font-md);
        }

        .tts-note-playing {
            background: rgba(76,175,80,0.15) !important;
        }

        /* 캐시 관리 버튼 그룹 */
        .tts-cache-actions {
            display: flex;
            flex-wrap: wrap;
            gap: var(--tts-space-xs);
            margin-top: var(--tts-space-md);
        }

        .tts-badge {
            display: inline-block;
            padding: var(--tts-space-xs) var(--tts-space-md);
            border-radius: 12px;
            font-size: var(--tts-font-sm);
            font-weight: bold;
        }

        /* 설정 토글 */
        .tts-toggle-row {
            display: flex;
            align-items: center;
            gap: var(--tts-space-sm);
            padding: var(--tts-space-sm) 0;
            cursor: pointer;
            color: var(--tts-text);
            font-size: var(--tts-font-md);
        }

        .tts-toggle-row input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        /* 반응형: 태블릿 최적화 */
        @media (max-width: 768px) {
            .tts-panel { padding: var(--tts-space-lg); }
            .tts-player-controls { gap: var(--tts-space-xs); }
            .tts-play-main { min-width: 100px; font-size: var(--tts-font-lg); }
            .tts-note-table .tts-col-preview { display: none; }
            .tts-note-table .tts-col-actions { width: 70px; }
            .tts-rate-controls { justify-content: center; }
        }

        /* 반응형: 데스크톱 넓은 화면 */
        @media (min-width: 1200px) {
            .tts-note-table .tts-col-topic { max-width: 300px; }
        }
    `;
    document.head.appendChild(styleEl);
}

window.ttsLog?.('✅ [tts-ui/tts-styles] 모듈 로드 완료');
