/**
 * Config Loader for Obsidian TTS
 * properties 파일 또는 Obsidian 노트에서 설정을 로드합니다
 */

const fs = require('fs').promises;
const path = require('path');

class ConfigLoader {
    constructor() {
        this.config = null;
        this.configPath = path.join(__dirname, '..', 'config.properties');
    }

    /**
     * properties 파일 파싱
     */
    parseProperties(content) {
        const config = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // 주석이나 빈 줄 건너뛰기
            if (trimmed.startsWith('#') || trimmed === '') {
                continue;
            }

            // key=value 형식 파싱
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                config[key] = value;
            }
        }

        return config;
    }

    /**
     * 설정 파일 로드
     */
    async load() {
        try {
            const content = await fs.readFile(this.configPath, 'utf-8');
            this.config = this.parseProperties(content);
            console.log('✅ Config loaded from config.properties');
            return this.config;
        } catch (error) {
            console.warn('⚠️  config.properties not found, using default values');
            this.config = this.getDefaultConfig();
            return this.config;
        }
    }

    /**
     * 기본 설정값
     */
    getDefaultConfig() {
        return {
            AZURE_FUNCTION_URL: process.env.AZURE_FUNCTION_URL || '',
            TTS_API_ENDPOINT: '/api/tts-stream',
            CACHE_API_ENDPOINT: '/api/cache',
            PLAYBACK_POSITION_ENDPOINT: '/api/playback-position',
            SCROLL_POSITION_ENDPOINT: '/api/scroll-position',
            DEFAULT_VOICE: 'ko-KR-SunHiNeural',
            DEFAULT_RATE: '1.0',
            DEFAULT_PITCH: '0',
            DEFAULT_VOLUME: '100',
            NOTES_PATH: '',
            ENABLE_OFFLINE_CACHE: 'true',
            CACHE_TTL_DAYS: '30',
            DEBUG_MODE: 'false'
        };
    }

    /**
     * 특정 설정값 가져오기
     */
    get(key, defaultValue = null) {
        if (!this.config) {
            throw new Error('Config not loaded. Call load() first.');
        }
        return this.config[key] || defaultValue;
    }

    /**
     * 전체 URL 생성 (Function URL + 엔드포인트)
     */
    getFullUrl(endpointKey) {
        const baseUrl = this.get('AZURE_FUNCTION_URL', '');
        const endpoint = this.get(endpointKey, '');

        if (!baseUrl) {
            throw new Error('AZURE_FUNCTION_URL not configured');
        }

        return `${baseUrl.replace(/\/$/, '')}${endpoint}`;
    }
}

// Singleton instance
const configLoader = new ConfigLoader();

module.exports = configLoader;
