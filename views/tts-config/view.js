// ============================================
// tts-config: 설정 로딩 + 시크릿 + 엔드포인트
// 의존성: tts-core
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.ObsidianTTSConfig) {

    // ============================================
    // 설정 로드 (obsidian-tts-config.md)
    // ============================================
    (async function loadConfig() {
        try {
            const vault = app.vault;
            const configFile = vault.getAbstractFileByPath('obsidian-tts-config.md');

            if (configFile) {
                window.ttsLog('📄 obsidian-tts-config.md 파일을 찾았습니다.');
                const content = await vault.read(configFile);

                // dataviewjs 블록 내의 코드를 추출하여 실행
                const codeMatch = content.match(/```dataviewjs\n([\s\S]*?)```/);
                if (codeMatch) {
                    try {
                        const safeExecute = new Function('"use strict"; ' + codeMatch[1]);
                        safeExecute();
                        window.ttsLog('✅ 설정 파일 로드 완료 (안전 모드)');
                        localStorage.setItem('tts-config-created', 'true');
                    } catch (execError) {
                        console.error('❌ 설정 파일 실행 오류:', execError.message);
                    }
                }
            } else {
                window.ttsLog('⚠️ obsidian-tts-config.md 파일이 없습니다. 기본 설정을 사용합니다.');
            }
        } catch (error) {
            console.error('❌ 설정 파일 로드 실패:', error);
        }
    })();
}

// ============================================
// 설정 객체 (config 파일 또는 기본값)
// ============================================
const config = window.ObsidianTTSConfig || {
    azureFunctionUrl: '',
    ttsEndpoint: '/api/tts-stream',
    cacheEndpoint: '/api/cache',
    playbackPositionEndpoint: '/api/playback-position',
    scrollPositionEndpoint: '/api/scroll-position',
    azureFreeApiKey: '',
    azurePaidApiKey: '',
    usePaidApi: false,
    defaultVoice: 'ko-KR-SunHiNeural',
    defaultRate: 1.0,
    enableOfflineCache: true,
    cacheTtlDays: 30,
    debugMode: false
};

// 설정 파일 존재 여부 메시지
if (!window.ObsidianTTSConfig) {
    window.ttsLog('⚠️ obsidian-tts-config.md가 없습니다. 기본 설정을 사용합니다.');
} else {
    window.ttsLog('✅ obsidian-tts-config.md에서 설정을 로드했습니다.');
}

// ============================================
// 민감정보 로드 (config → localStorage 폴백)
// ============================================
const secrets = {
    functionUrl: config.azureFunctionUrl || localStorage.getItem('tts_azureFunctionUrl') || '',
    freeKey: config.azureFreeApiKey || '',
    paidKey: config.azurePaidApiKey || '',
    localEdgeTtsUrl: localStorage.getItem('tts_localEdgeTtsUrl') || ''
};

if (secrets.functionUrl) {
    config.azureFunctionUrl = secrets.functionUrl;
}

// ============================================
// API 키 설정 (무료 F0 / 유료 S0)
// ============================================
if (!window.apiKeyConfig) {
    window.apiKeyConfig = {
        freeKey: secrets.freeKey,
        paidKey: secrets.paidKey,
        usePaidApi: config.usePaidApi || false
    };
}

// localStorage에서 API 키 선택 복원
const savedApiMode = localStorage.getItem('azureTTS_usePaidApi');
if (savedApiMode !== null) {
    window.apiKeyConfig.usePaidApi = (savedApiMode === 'true');
}

// ============================================
// TTS 엔드포인트 설정
// ============================================
const LOCAL_EDGE_TTS_DEFAULT = 'http://100.107.208.106:5051/api/tts';
const AZURE_FUNCTION_DEFAULT = 'http://100.107.208.106:5051';

const localEdgeTtsUrl = secrets.localEdgeTtsUrl
    || localStorage.getItem('tts_localEdgeTtsUrl')
    || LOCAL_EDGE_TTS_DEFAULT;
const azureFunctionUrl = config.azureFunctionUrl
    || localStorage.getItem('tts_azureFunctionUrl')
    || AZURE_FUNCTION_DEFAULT;

if (!window.ttsEndpointConfig) {
    window.ttsEndpointConfig = {
        azureFunctionUrl: azureFunctionUrl,
        localEdgeTtsUrl: localEdgeTtsUrl,
        useLocalEdgeTts: false
    };
} else {
    if (localEdgeTtsUrl) {
        window.ttsEndpointConfig.localEdgeTtsUrl = localEdgeTtsUrl;
    }
    if (azureFunctionUrl) {
        window.ttsEndpointConfig.azureFunctionUrl = azureFunctionUrl;
    }
}

// localStorage에서 엔드포인트 선택 복원
const savedEndpointMode = localStorage.getItem('azureTTS_useLocalEdgeTts');
if (savedEndpointMode !== null) {
    window.ttsEndpointConfig.useLocalEdgeTts = (savedEndpointMode === 'true');
}

window.ttsLog('🔧 TTS Endpoint Config:', {
    localEdgeTtsUrl: window.ttsEndpointConfig.localEdgeTtsUrl || '(없음)',
    azureFunctionUrl: window.ttsEndpointConfig.azureFunctionUrl || '(없음)',
    source: localStorage.getItem('tts_localEdgeTtsUrl') ? 'localStorage' : (secrets.localEdgeTtsUrl ? 'config' : 'default')
});

// ============================================
// 실제 사용할 TTS 엔드포인트 계산
// ============================================
window.getActiveTtsEndpoint = function() {
    return window.ttsEndpointConfig.useLocalEdgeTts && window.ttsEndpointConfig.localEdgeTtsUrl
        ? window.ttsEndpointConfig.localEdgeTtsUrl
        : window.ttsEndpointConfig.azureFunctionUrl + (config.ttsEndpoint || '/api/tts-stream');
};

window.getActiveBaseUrl = function() {
    if (window.ttsEndpointConfig.useLocalEdgeTts && window.ttsEndpointConfig.localEdgeTtsUrl) {
        return window.ttsEndpointConfig.localEdgeTtsUrl.replace(/\/api\/.*$/, '');
    }
    return window.ttsEndpointConfig.azureFunctionUrl;
};

// 전역 상수
window.ACTIVE_TTS_ENDPOINT = window.getActiveTtsEndpoint();
window.ACTIVE_BASE_URL = window.getActiveBaseUrl();

// ============================================
// 발음 프로파일 버전 (백엔드에서 동적 로드)
// ============================================
window.PRONUNCIATION_PROFILE_VERSION = null;

(async function syncVersionWithBackend() {
    try {
        const baseUrl = window.ttsEndpointConfig?.azureFunctionUrl || AZURE_FUNCTION_DEFAULT;
        const versionUrl = baseUrl + '/api/version';
        const response = await window.fetchWithTimeout(versionUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 10000);

        if (response.ok) {
            const versionData = await response.json();
            window.PRONUNCIATION_PROFILE_VERSION = versionData.pronunciationProfileVersion;
            window.ttsLog(`✅ 백엔드 버전 동기화 완료: ${window.PRONUNCIATION_PROFILE_VERSION}`);

            if (versionData.deprecatedVersions && versionData.deprecatedVersions.includes(window.PRONUNCIATION_PROFILE_VERSION)) {
                console.warn('⚠️ 이전 버전을 사용 중입니다. 캐시가 무효화될 수 있습니다.');
            }
        } else {
            throw new Error(`Version API failed: ${response.status}`);
        }
    } catch (error) {
        console.warn('⚠️ 백엔드 버전 조회 실패. 기본값 사용:', error.message);
        window.PRONUNCIATION_PROFILE_VERSION = 'ko-v1.2';
    }
})();

// config 객체를 전역으로 노출 (다른 모듈에서 참조)
window.ttsConfig = config;

window.ttsLog('✅ [tts-config] 모듈 로드 완료:', {
    endpoint: window.ACTIVE_TTS_ENDPOINT,
    useLocalEdgeTts: window.ttsEndpointConfig.useLocalEdgeTts,
    usingPaidApi: window.apiKeyConfig.usePaidApi
});
