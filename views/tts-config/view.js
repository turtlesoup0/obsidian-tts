// ============================================
// tts-config: 설정 로딩 + 시크릿 + 엔드포인트
// 의존성: tts-core
// ============================================

// 🔑 즉시 기본 설정 적용 (비동기 로드 전에 fallback 보장)
if (!window.ObsidianTTSConfig) {
    window.ObsidianTTSConfig = {
        operationMode: 'local',
        // Azure Function 의존성 제거 (2026-04-24) — Cloudflare Tunnel(tts.tech-insight.org)로 이전
        azureFunctionUrl: '',
        localEdgeTtsUrl: 'https://tts.tech-insight.org/api/tts',
        edgeServerUrl: 'https://tts.tech-insight.org',
        ttsEndpoint: '/api/tts-stream',
        cacheEndpoint: '/api/cache',
        playbackPositionEndpoint: '/api/playback-position',
        scrollPositionEndpoint: '/api/scroll-position',
        defaultVoice: 'ko-KR-SunHiNeural',
        defaultRate: 1.0,
        enableOfflineCache: true,
        cacheTtlDays: 30,
        debugMode: false
    };
    window.ttsLog?.('✅ [tts-config] 기본 설정 즉시 적용됨');
}

// 비동기 설정 파일 로드 (기본값 덮어쓰기)
(async function loadConfigFromFile() {
    try {
        const vault = app.vault;
        const configFile = vault.getAbstractFileByPath('obsidian-tts-config.md');

        if (configFile) {
            window.ttsLog?.('📄 obsidian-tts-config.md 파일을 찾았습니다.');
            const content = await vault.read(configFile);

            // dataviewjs 블록 내의 코드를 추출하여 실행
            const codeMatch = content.match(/```dataviewjs\n([\s\S]*?)```/);
            if (codeMatch) {
                try {
                    const codeContent = codeMatch[1];

                    // 보안 검증: 화이트리스트 패턴만 허용
                    const dangerousPatterns = [
                        /eval\s*\(/,
                        /new\s+Function\s*\(/,
                        /fetch\s*\(/,
                        /XMLHttpRequest/,
                        /\.import\s*\(/,
                        /require\s*\(/,
                        /import\s+/,
                        /export\s+/,
                        /document\.write/,
                        /innerHTML\s*=/,
                        /outerHTML\s*=/,
                        /location\s*=/,
                        /setTimeout\s*\(/,
                        /setInterval\s*\(/
                    ];

                    for (const pattern of dangerousPatterns) {
                        if (pattern.test(codeContent)) {
                            throw new Error(`위험한 코드 패턴이 감지되었습니다: ${pattern.source}`);
                        }
                    }

                    // 안전한 패턴 검증
                    const safePattern = /^[\s\S]*?window\.ObsidianTTSConfig\s*=(?!\s*[\(\[])[\s\S]*?;?\s*$/;
                    if (!safePattern.test(codeContent)) {
                        throw new Error('설정 파일에 안전하지 않은 코드가 있습니다.');
                    }

                    // 검증 통과 후 안전하게 실행
                    const safeExecute = new Function('"use strict"; ' + codeContent);
                    safeExecute();
                    window.ttsLog?.('✅ 설정 파일 로드 완료 (config 덮어쓰기)');

                    // 🔑 config 로드 후 엔드포인트 재설정
                    if (window.ObsidianTTSConfig?.edgeServerUrl && window.ttsEndpointConfig) {
                        window.ttsEndpointConfig.edgeServerUrl = window.ObsidianTTSConfig.edgeServerUrl;
                        window.ttsLog?.('✅ edgeServerUrl 재설정:', window.ObsidianTTSConfig.edgeServerUrl);
                    }
                } catch (execError) {
                    console.error('❌ 설정 파일 실행 오류:', execError.message);
                }
            }
        } else {
            window.ttsLog?.('⚠️ obsidian-tts-config.md 파일 없음, 기본 설정 사용');
        }
    } catch (error) {
        console.error('❌ 설정 파일 로드 실패:', error);
    }
})();

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
// TTS 동작 모드 정의
// ============================================
window.TTS_OPERATION_MODES = {
    local: {
        name: '로컬 모드',
        features: {
            tts: 'local',
            cache: 'local',
            positionSync: 'local'  // Uses local M4 Pro server
        }
    },
    server: {
        name: '서버 모드',
        features: {
            tts: 'azure',
            cache: 'azure',
            positionSync: 'azure'  // Uses Azure Function
        }
    },
    hybrid: {
        name: '하이브리드 모드',
        features: {
            tts: 'local',
            cache: 'hybrid',
            positionSync: 'local'  // Azure 의존성 제거 (2026-04-24) — 항상 로컬(Cloudflare Tunnel 경유)
        }
    }
};

// ============================================
// TTS 동작 모드 전역 설정
// ============================================
window.ttsOperationMode = config.operationMode || 'hybrid';  // local, server, hybrid
window.ttsModeConfig = window.TTS_OPERATION_MODES?.[window.ttsOperationMode] || window.TTS_OPERATION_MODES?.hybrid;

// 로그 출력
window.ttsLog('🎯 TTS 동작 모드:', window.ttsModeConfig?.name || '하이브리드');
window.ttsLog('📋 TTS:', window.ttsModeConfig?.features?.tts || 'local');
window.ttsLog('💾 캐시:', window.ttsModeConfig?.features?.cache || 'hybrid');
window.ttsLog('📍 위치 동기화:', window.ttsModeConfig?.features?.positionSync || 'azure');

// ============================================
// TTS 엔드포인트 설정 (모드 기반)
// ============================================
const LOCAL_EDGE_TTS_DEFAULT = 'https://tts.tech-insight.org/api/tts';
const AZURE_FUNCTION_DEFAULT = '';  // Azure 의존성 제거 (2026-04-24) — 레거시 참조 유지용 빈 값

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
        useLocalEdgeTts: (window.ttsModeConfig?.features?.tts === 'local')  // 모드 기반 자동 설정
    };
} else {
    if (localEdgeTtsUrl) {
        window.ttsEndpointConfig.localEdgeTtsUrl = localEdgeTtsUrl;
    }
    if (azureFunctionUrl) {
        window.ttsEndpointConfig.azureFunctionUrl = azureFunctionUrl;
    }
}

// localStorage에서 수동 설정 복원 (우선순위: 수동 설정 > 모드 설정)
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
    // Azure 의존성 제거 (2026-04-24) — localEdgeTtsUrl 에서 baseUrl 유도
    return (window.ttsEndpointConfig.localEdgeTtsUrl || LOCAL_EDGE_TTS_DEFAULT).replace(/\/api\/.*$/, '');
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
        // Azure 의존성 제거 (2026-04-24) — 항상 활성 base URL(로컬 프록시) 사용
        const baseUrl = window.getActiveBaseUrl?.();
        if (!baseUrl) {
            window.PRONUNCIATION_PROFILE_VERSION = 'ko-v1.2';
            window.ttsLog?.('⚠️ baseUrl 없음, 기본 발음 프로파일 사용');
            return;
        }
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
