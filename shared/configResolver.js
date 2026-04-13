/**
 * ConfigResolver Module - SPEC-ARCH-001 Implementation
 *
 * 중앙 설정 관리 모듈로, 모든 설정 소스를 단일 출처(SSOT)로 통합합니다.
 * operationMode 기반의 자동 endpoint 라우팅을 제공합니다.
 *
 * 우선순위 (R1):
 * 1. Runtime Config (window.ttsEndpointConfig)
 * 2. Config File (obsidian-tts-config.md)
 * 3. Keychain
 * 4. Defaults (FALLBACK_URL)
 */

(function(global) {
    'use strict';

    // ============================================================
    // 타입 정의 (JSDoc for IDE support)
    // ============================================================
    /**
     * @typedef {<'local'|'server'|'hybrid'>} OperationMode
     * @typedef {<'tts'|'sync'|'position'|'scroll'>} EndpointType
     *
     * @typedef {Object} Config
     * @property {OperationMode} operationMode
     * @property {string} azureFunctionUrl
     * @property {string} edgeServerUrl
     * @property {string} localEdgeTtsUrl
     * @property {boolean} sseEnabled
     */

    // ============================================================
    // 기본 상수 (R4: 역호환성 유지)
    // ============================================================
    const FALLBACK_AZURE_URL = 'https://obsidian-tts-func-hwh0ffhneka3dtaa.koreacentral-01.azurewebsites.net';
    const FALLBACK_LOCAL_URL = 'http://100.107.208.106:5051';

    // ============================================================
    // ConfigResolver 모듈 구현
    // ============================================================
    const ConfigResolver = {
        // ============================================================
        // 내부 상태
        // ============================================================
        _config: null,
        _cache: new Map(),
        _lastLoadTime: 0,
        _cacheTTL: 5000, // 5초 캐시

        // ============================================================
        // 설정 로드 (TASK-002: Priority Merging)
        // ============================================================
        /**
         * 설정 소스를 우선순위별로 로드하고 병합
         * @returns {Promise<Config>} 병합된 설정 객체
         */
        async loadConfig() {
            const now = Date.now();

            // 캐시 유효성 확인
            if (this._config && (now - this._lastLoadTime < this._cacheTTL)) {
                global.ttsLog?.('🔄 ConfigResolver: 캐시된 설정 반환');
                return this._config;
            }

            global.ttsLog?.('📋 ConfigResolver: 설정 로드 시작 (우선순위별 병합)');

            // 우선순위별 설정 소스 로드
            const runtimeConfig = this._loadRuntimeConfig();
            const fileConfig = await this._loadFileConfig();
            const keychainConfig = await this._loadKeychainConfig();
            const defaultConfig = this._getDefaultConfig();

            // 설정 병합 (우선순위: Runtime > File > Keychain > Defaults)
            this._config = {
                ...defaultConfig,
                ...keychainConfig,
                ...fileConfig,
                ...runtimeConfig
            };

            this._lastLoadTime = now;
            this._logConfigMerged();
            return this._config;
        },

        // ============================================================
        // Endpoint 라우팅 (TASK-003 & TASK-005: SSE 라우팅)
        // ============================================================
        /**
         * endpointType과 현재 상태에 따라 URL 결정
         * @param {EndpointType} endpointType - 요청할 endpoint 유형
         * @returns {string} 전체 URL
         */
        resolveEndpoint(endpointType) {
            const config = this._config || this._getDefaultConfig();
            const mode = config.operationMode;
            const sseActive = this.isSSEActive();

            // Endpoint 경로 매핑
            const pathMap = {
                'tts': '/api/tts-stream',
                'sync': '/api/sync',
                'position': '/api/playback-position',
                'scroll': '/api/scroll-position'
            };

            // R2: Endpoint Resolution Table 구현
            if (mode === 'local') {
                // Local Mode: 항상 로컬 서버
                return this._buildLocalUrl(pathMap[endpointType]);

            } else if (mode === 'server') {
                // Server Mode: 항상 Azure Function
                return this._buildAzureUrl(pathMap[endpointType]);

            } else if (mode === 'hybrid') {
                // Hybrid Mode: TTS는 로컬, Sync는 조건부
                if (endpointType === 'tts') {
                    return this._buildLocalUrl('/api/tts-stream');
                } else if ((endpointType === 'sync' || endpointType === 'position' || endpointType === 'scroll') && sseActive) {
                    // R3: SSE 활성화 시 로컬 SSE endpoint 사용
                    return this._buildLocalUrl(pathMap[endpointType]);
                } else {
                    // SSE 비활성화 시 Azure Function 사용
                    return this._buildAzureUrl(pathMap[endpointType]);
                }
            }

            // 폴백 (기본값)
            global.ttsLog?.('⚠️ ConfigResolver: 알 수 없는 모드, Azure Function 사용');
            return this._buildAzureUrl(pathMap[endpointType] || '/api/tts-stream');
        },

        // ============================================================
        // SSE 상태 확인 (TASK-004)
        // ============================================================
        /**
         * SSE 연결 상태 확인
         * @returns {boolean} SSE 활성화 여부
         */
        isSSEActive() {
            // sseSyncManager가 있는지 확인
            if (!global.sseSyncManager) {
                return false;
            }

            // isConnected 상태와 connectionMode 확인
            const isConnected = global.sseSyncManager.isConnected || false;
            const connectionMode = global.sseSyncManager.connectionMode || 'none';

            return isConnected && connectionMode === 'sse';
        },

        // ============================================================
        // Operation Mode 반환
        // ============================================================
        /**
         * operationMode 반환
         * @returns {OperationMode} 현재 동작 모드
         */
        getOperationMode() {
            const config = this._config || this._getDefaultConfig();
            return config.operationMode;
        },

        // ============================================================
        // 캐시 무효화 (R5)
        // ============================================================
        /**
         * 설정 캐시 무효화
         */
        invalidateCache() {
            this._config = null;
            this._lastLoadTime = 0;
            this._cache.clear();
            global.ttsLog?.('🔄 ConfigResolver: 캐시 무효화 완료');
        },

        // ============================================================
        // 현재 설정 반환
        // ============================================================
        /**
         * 현재 설정 반환 (캐시된 경우)
         * @returns {Config|null} 현재 설정 객체
         */
        getConfig() {
            return this._config;
        },

        // ============================================================
        // 내부 헬퍼 메서드
        // ============================================================
        /**
         * Runtime Config 로드 (최우선)
         * @private
         */
        _loadRuntimeConfig() {
            return global.ttsEndpointConfig || {};
        },

        /**
         * File Config 로드 (obsidian-tts-config.md)
         * @private
         */
        async _loadFileConfig() {
            // ObsidianTTSConfig는 tts-config 모듈에서 이미 로드됨
            return global.ObsidianTTSConfig || {};
        },

        /**
         * Keychain Config 로드
         * @private
         */
        async _loadKeychainConfig() {
            const azureUrl = global.localStorage?.getItem('tts_azureFunctionUrl');
            const localUrl = global.localStorage?.getItem('tts_localEdgeTtsUrl');

            const config = {};
            if (azureUrl) config.azureFunctionUrl = azureUrl;
            if (localUrl) config.localEdgeTtsUrl = localUrl;

            return config;
        },

        /**
         * 기본 설정 반환
         * @private
         */
        _getDefaultConfig() {
            return {
                operationMode: 'hybrid',
                azureFunctionUrl: FALLBACK_AZURE_URL,
                edgeServerUrl: FALLBACK_LOCAL_URL,
                localEdgeTtsUrl: FALLBACK_LOCAL_URL + '/api/tts',
                sseEnabled: false
            };
        },

        /**
         * 로컬 URL 빌드
         * @private
         */
        _buildLocalUrl(path) {
            const config = this._config || this._getDefaultConfig();
            const baseUrl = config.edgeServerUrl || FALLBACK_LOCAL_URL;
            return baseUrl.replace(/\/$/, '') + path;
        },

        /**
         * Azure URL 빌드
         * @private
         */
        _buildAzureUrl(path) {
            const config = this._config || this._getDefaultConfig();
            const baseUrl = config.azureFunctionUrl || FALLBACK_AZURE_URL;
            return baseUrl.replace(/\/$/, '') + path;
        },

        /**
         * 설정 병합 로깅
         * @private
         */
        _logConfigMerged() {
            if (!this._config) return;

            global.ttsLog?.('✅ ConfigResolver: 설정 병합 완료', {
                operationMode: this._config.operationMode,
                azureUrl: this._config.azureFunctionUrl?.replace(/https?:\/\/[^@]+@/, 'https://***@'),
                edgeServerUrl: this._config.edgeServerUrl,
                sseEnabled: this.isSSEActive()
            });
        }
    };

    // ============================================================
    // 전역 노출
    // ============================================================
    global.ConfigResolver = ConfigResolver;
    global.ttsLog?.('✅ [ConfigResolver] 모듈 로드 완료 (TASK-001: Scaffolding)');

})(typeof window !== 'undefined' ? window : global);
