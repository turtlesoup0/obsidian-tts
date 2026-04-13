// ============================================
// VisualDebugPanel: 개발용 디버그 패널 (dev-only)
// ============================================

const DEV_MODE = localStorage.getItem('debugPanelEnabled') === 'true';

if (DEV_MODE && !window.VisualDebugPanel) {
    window.VisualDebugPanel = class VisualDebugPanel {
        constructor() {
            this.enabled = true;
            this.logs = [];
            this.init();
        }

        init() {
            // Create debug panel UI
            this.panel = document.createElement('div');
            this.panel.id = 'tts-debug-panel';
            this.panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 300px;
                max-height: 400px;
                background: rgba(30, 30, 30, 0.95);
                border: 1px solid #444;
                border-radius: 8px;
                padding: 12px;
                font-family: monospace;
                font-size: 11px;
                color: #e0e0e0;
                z-index: 10000;
                overflow-y: auto;
            `;
            this.panel.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <strong>🔍 TTS Debug</strong>
                    <button onclick="this.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:#e0e0e0;cursor:pointer;">✕</button>
                </div>
                <div id="tts-debug-logs" style="max-height:350px;overflow-y:auto;"></div>
            `;
            document.body.appendChild(this.panel);
        }

        log(level, message) {
            if (!this.enabled) return;
            const logEntry = document.createElement('div');
            logEntry.style.cssText = `margin: 4px 0; padding: 4px; border-radius: 4px; background: ${level === 'ERROR' ? '#f4433633' : level === 'WARN' ? '#ff980033' : '#4caf5033'};`;
            logEntry.textContent = `[${level}] ${message}`;
            const logsDiv = this.panel?.querySelector('#tts-debug-logs');
            logsDiv?.appendChild(logEntry);
            logsDiv?.scrollTop = logsDiv.scrollHeight;
        }

        cleanup() {
            this.panel?.remove();
        }
    };

    // Create global instance
    if (!window.ttsDebugPanel) {
        window.ttsDebugPanel = new window.VisualDebugPanel();
    }
}
