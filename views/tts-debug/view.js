// ============================================
// tts-debug: 디버그 함수들
// 의존성: 전체 TTS 모듈
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.ttsDebug) {

    window.ttsDebug = {};

    // ============================================
    // 유료 API 설정 진단
    // ============================================
    window.ttsDebug.diagnosePaidApi = function() {
        window.ttsLog('=== 유료 API 설정 진단 ===');
        window.ttsLog('1. API 키 설정:');
        window.ttsLog('   - 무료 API 키:', window.apiKeyConfig.freeKey ? '✅ 등록됨' : '❌ 없음');
        window.ttsLog('   - 유료 API 키:', window.apiKeyConfig.paidKey ? '✅ 등록됨' : '❌ 없음');
        window.ttsLog('2. 현재 모드:', window.apiKeyConfig.usePaidApi ? '💳 유료 API 선택됨' : '🆓 무료 API 선택됨');
        window.ttsLog('3. localStorage 상태:', localStorage.getItem('azureTTS_usePaidApi'));

        if (window.apiKeyConfig.usePaidApi && !window.apiKeyConfig.paidKey) {
            console.error('❌ 문제 발견: 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다!');
            window.ttsLog('💡 해결: obsidian-tts-config.md 파일에서 paidKey를 입력하세요.');
        } else if (window.apiKeyConfig.usePaidApi && window.apiKeyConfig.paidKey) {
            window.ttsLog('✅ 유료 API 설정 정상');
        } else {
            window.ttsLog('✅ 무료 API 모드 정상');
        }

        window.ttsLog('\n다음 명령어로 사용량 확인:');
        window.ttsLog('await window.fetchUsageFromBackend()');
        window.ttsLog('\nAPI 키 테스트:');
        window.ttsLog('await window.ttsDebug.testApiKey()');
        window.ttsLog('\n캐시 키 분석:');
        window.ttsLog('await window.ttsDebug.analyzeCacheKeys()');
    };

    // ============================================
    // 캐시 키 생성 분석
    // ============================================
    window.ttsDebug.analyzeCacheKeys = async function(sampleSize = 10) {
        window.ttsLog('🔍 캐시 키 생성 분석 시작...');

        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 노트 데이터가 없습니다.');
            return;
        }

        const cacheStats = await cacheManager.getServerCacheCount();
        if (cacheStats) {
            window.ttsLog(`\n📊 서버 캐시 현황: ${cacheStats.totalFiles}개 파일, ${cacheStats.totalSizeMB} MB`);
        }

        const samples = reader.pages.slice(0, Math.min(sampleSize, reader.pages.length));
        window.ttsLog(`\n📋 샘플 ${samples.length}개 노트 분석:\n`);

        const results = [];
        for (let i = 0; i < samples.length; i++) {
            const page = samples[i];
            const notePath = page.file.path;
            const content = cacheManager.getNoteContent(page);
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);

            const cached = await cacheManager.getCachedAudioFromServer(cacheKey);
            const status = cached ? '✅ HIT' : '❌ MISS';

            results.push({
                index: i,
                title: page.file.name,
                notePath: notePath,
                contentLength: content.length,
                cacheKey: cacheKey,
                cached: !!cached,
                status: status
            });

            window.ttsLog(`[${i+1}/${samples.length}] ${status}`);
            window.ttsLog(`  제목: ${page.file.name}`);
            window.ttsLog(`  경로: ${notePath}`);
            window.ttsLog(`  내용 길이: ${content.length}자`);
            window.ttsLog(`  캐시 키: ${cacheKey}`);
            window.ttsLog('');
        }

        const hitCount = results.filter(r => r.cached).length;
        const missCount = results.length - hitCount;
        const hitRate = ((hitCount / results.length) * 100).toFixed(1);

        window.ttsLog(`\n📈 샘플 분석 결과:`);
        window.ttsLog(`  전체: ${results.length}개`);
        window.ttsLog(`  캐시 HIT: ${hitCount}개`);
        window.ttsLog(`  캐시 MISS: ${missCount}개`);
        window.ttsLog(`  HIT 비율: ${hitRate}%`);

        if (missCount > hitCount) {
            window.ttsLog(`\n⚠️ 캐시 MISS가 많습니다. 가능한 원인:`);
            window.ttsLog(`  1. 노트 내용이 최근 수정됨`);
            window.ttsLog(`  2. 서버 캐시가 삭제되었거나 만료됨`);
            window.ttsLog(`  3. 캐시 키 생성 로직이 변경됨`);
        }

        return results;
    };

    // ============================================
    // API 키 테스트
    // ============================================
    window.ttsDebug.testApiKey = async function() {
        window.ttsLog('🧪 API 키 유효성 테스트 시작...');

        const reader = window.azureTTSReader;
        const testText = "테스트";

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (window.apiKeyConfig.usePaidApi) {
                if (!window.apiKeyConfig.paidKey) {
                    console.error('❌ 유료 API 키가 설정되지 않았습니다.');
                    return { success: false, error: 'No paid API key configured' };
                }
                headers['X-Azure-Speech-Key'] = window.apiKeyConfig.paidKey;
                window.ttsLog('💳 유료 API 키로 테스트 시작');
            } else {
                window.ttsLog('🆓 무료 API 키로 테스트 (백엔드 환경변수)');
            }

            window.ttsLog('📤 요청 URL:', reader.apiEndpoint);

            const response = await window.fetchWithTimeout(reader.apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: testText,
                    voice: 'ko-KR-SunHiNeural',
                    rate: 1.0
                })
            }, 15000);

            window.ttsLog('📥 응답 상태:', response.status, response.statusText);

            if (response.ok) {
                const audioBlob = await response.blob();
                window.ttsLog('✅ API 키 테스트 성공!');
                window.ttsLog(`✅ 오디오 생성됨: ${audioBlob.size} bytes`);
                return { success: true, audioSize: audioBlob.size };
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ API 키 테스트 실패:', response.status);
                console.error('❌ 에러 응답:', errorData);
                return { success: false, status: response.status, error: errorData };
            }

        } catch (error) {
            console.error('❌ API 키 테스트 중 예외 발생:', error);
            return { success: false, error: error.message };
        }
    };

    // ============================================
    // 서버 캐시 키 비교
    // ============================================
    window.ttsDebug.compareServerCacheKeys = async function(sampleSize = 50) {
        window.ttsLog('🔍 서버 캐시 키 vs 로컬 생성 캐시 키 비교 시작...\n');

        const reader = window.azureTTSReader;
        const cacheManager = window.serverCacheManager;

        if (!reader.pages || reader.pages.length === 0) {
            console.error('❌ 노트 데이터가 없습니다.');
            return;
        }

        // 서버에서 캐시 키 목록 가져오기
        window.ttsLog('📥 서버 캐시 키 목록 다운로드 중...');
        const response = await window.fetchWithTimeout(`${cacheManager.cacheApiEndpoint}-list?limit=${sampleSize}`, {
            headers: { 'Accept': 'application/json' }
        }, 15000);

        if (!response.ok) {
            console.error('❌ 서버 캐시 목록을 가져올 수 없습니다:', response.status);
            return;
        }

        const serverData = await response.json();
        const serverKeys = new Set(serverData.cacheKeys.map(k => k.key));
        window.ttsLog(`✅ 서버 캐시: ${serverKeys.size}개\n`);

        // 로컬에서 캐시 키 생성
        window.ttsLog('🔑 로컬 캐시 키 생성 중...');
        const localKeys = new Map();

        const samples = reader.pages.slice(0, Math.min(sampleSize, reader.pages.length));
        for (const page of samples) {
            const notePath = page.file.path;
            const content = cacheManager.getNoteContent(page);
            const cacheKey = await cacheManager.generateCacheKey(notePath, content);
            localKeys.set(cacheKey, {
                title: page.file.name,
                path: notePath,
                contentLength: content.length
            });
        }

        window.ttsLog(`✅ 로컬 생성: ${localKeys.size}개\n`);

        // 매칭 분석
        const matches = [];
        const mismatches = [];

        for (const [localKey, noteInfo] of localKeys.entries()) {
            if (serverKeys.has(localKey)) {
                matches.push({ key: localKey, ...noteInfo });
            } else {
                mismatches.push({ key: localKey, ...noteInfo });
            }
        }

        // 결과 출력
        window.ttsLog('📊 분석 결과:\n');
        window.ttsLog(`전체 비교: ${localKeys.size}개`);
        window.ttsLog(`✅ 매칭: ${matches.length}개 (${((matches.length / localKeys.size) * 100).toFixed(1)}%)`);
        window.ttsLog(`❌ 불일치: ${mismatches.length}개 (${((mismatches.length / localKeys.size) * 100).toFixed(1)}%)\n`);

        if (mismatches.length > 0) {
            window.ttsLog('❌ 불일치 캐시 키 샘플 (최대 10개):\n');
            mismatches.slice(0, 10).forEach((item, idx) => {
                window.ttsLog(`[${idx + 1}] ${item.title}`);
                window.ttsLog(`  경로: ${item.path}`);
                window.ttsLog(`  캐시 키: ${item.key}\n`);
            });
        }

        return {
            totalCompared: localKeys.size,
            matches: matches.length,
            mismatches: mismatches.length,
            matchRate: ((matches.length / localKeys.size) * 100).toFixed(1) + '%',
            mismatchedKeys: mismatches
        };
    };

    // 초기 로딩 시 유료 API 설정 확인
    if (window.apiKeyConfig.usePaidApi && !window.apiKeyConfig.paidKey) {
        console.warn('⚠️ 유료 API가 선택되었지만 유료 키가 등록되지 않았습니다.');
        window.ttsLog('💡 진단 실행: window.ttsDebug.diagnosePaidApi()');
    }

    window.ttsLog('✅ [tts-debug] 모듈 로드 완료');
    window.ttsLog('💡 사용 가능한 디버그 명령어:');
    window.ttsLog('  - window.ttsDebug.diagnosePaidApi()');
    window.ttsLog('  - window.ttsDebug.testApiKey()');
    window.ttsLog('  - window.ttsDebug.analyzeCacheKeys()');
    window.ttsLog('  - window.ttsDebug.compareServerCacheKeys()');
}
