// ============================================
// tts-text: 발음 사전 + cleanTextForTTS 파이프라인
// 의존성: tts-core
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.cleanTextForTTS) {

    // ============================================
    // 기술 약어 발음 사전
    // ============================================
    window.PRONUNCIATION_DICT = {
        // 웹 기술
        'API': '에이피아이', 'HTTP': '에이치티티피', 'HTTPS': '에이치티티피에스',
        'HTML': '에이치티엠엘', 'CSS': '씨에스에스', 'JSON': '제이슨',
        'XML': '엑스엠엘', 'URL': '유알엘', 'URI': '유알아이',

        // 데이터베이스
        'SQL': '에스큐엘', 'NoSQL': '노에스큐엘', 'DB': '디비', 'DBMS': '디비엠에스',

        // 인공지능/머신러닝
        'AI': '인공지능', 'ML': '머신러닝', 'DL': '딥러닝', 'IoT': '아이오티',

        // 하드웨어
        'CPU': '씨피유', 'GPU': '지피유', 'RAM': '램',
        'SSD': '에스에스디', 'HDD': '에이치디디',

        // 네트워크
        'IP': '아이피', 'TCP': '티씨피', 'UDP': '유디피',
        'DNS': '디엔에스', 'VPN': '브이피엔', 'NW': '네트워크',

        // 프로그래밍
        'OS': '오에스', 'IDE': '아이디이', 'SDK': '에스디케이',
        'CLI': '씨엘아이', 'GUI': '지유아이',

        // 기타
        'IT': '아이티', 'SW': '소프트웨어', 'HW': '하드웨어'
    };

    // ============================================
    // 한국어 발음 교정 사전
    // ============================================
    window.KOREAN_PRONUNCIATION_FIXES = {
        '정의': '정 의',
        '의존': '의 존',
        '의의': '의 의',
        '회의': '회 의',
        '합의': '합 의',
        '동의': '동 의',
        '의미': '의 미',
    };

    // ============================================
    // 특수문자 정규화
    // ============================================
    window.normalizeSpecialChars = function(text) {
        if (!text) return '';

        // 하이픈으로 연결된 한글/영문 단어 분리
        text = text.replace(/([가-힣])-([가-힣])/g, '$1 $2');

        // 슬래시로 구분된 한글/영문 단어 분리
        text = text.replace(/([가-힣A-Z])\/([가-힣A-Z])/g, '$1 $2');

        // 화살표 변환
        text = text.replace(/->|=>|→/g, ' ');

        // 범위 표시 (~) 자연어 변환
        text = text.replace(/(\d+)\s*~\s*(\d+)/g, '$1에서 $2까지');

        return text;
    };

    // ============================================
    // 개조식 문장 교정
    // ============================================
    window.fixBulletEndings = function(text) {
        if (!text) return '';
        // 개조식 어미 뒤에 마침표 추가
        text = text.replace(/([가-힣]+[함임됨])\s*$/gm, '$1.');
        return text;
    };

    // ============================================
    // 한국어 발음 교정
    // ============================================
    window.applyKoreanPronunciationFixes = function(text) {
        if (!text) return '';

        for (const [word, fix] of Object.entries(window.KOREAN_PRONUNCIATION_FIXES)) {
            const regex = new RegExp(`\\b${word}\\b`, 'g');
            text = text.replace(regex, fix);
        }

        return text;
    };

    // ============================================
    // 기술 약어 치환
    // ============================================
    window.applyPronunciation = function(text) {
        let result = text;
        const terms = Object.keys(window.PRONUNCIATION_DICT).sort((a, b) => b.length - a.length);
        for (const term of terms) {
            const regex = new RegExp('\\b' + term + '\\b', 'gi');
            result = result.replace(regex, window.PRONUNCIATION_DICT[term]);
        }
        return result;
    };

    // ============================================
    // 문장 pause 개선
    // ============================================
    window.improveDefinitionPauses = function(text) {
        if (!text) return '';
        text = text.replace(/\.\s+/g, '. ');
        text = text.replace(/\?\s+/g, '? ');
        text = text.replace(/!\s+/g, '! ');
        text = text.replace(/(다|요|임|음)\s+/g, '$1. ');
        return text;
    };

    // ============================================
    // cleanTextForTTS: 6단계 파이프라인
    // ============================================
    window.cleanTextForTTS = function(text) {
        if (!text) return "";

        let cleaned = String(text);

        // 1. Markdown 정제
        cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/`[^`]+`/g, '');
        cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
        cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
        cleaned = cleaned.replace(/___([^_]+)___/g, '$1');
        cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
        cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
        cleaned = cleaned.replace(/\\/g, '');
        cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
        cleaned = cleaned.replace(/^>\s+/gm, '');
        cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '');
        cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
        cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');
        cleaned = cleaned.replace(/#[\w가-힣]+/g, '');
        cleaned = cleaned.replace(/\s+/g, ' ');

        // 2. 특수문자 정규화
        cleaned = window.normalizeSpecialChars(cleaned);

        // 3. 개조식 문장 교정
        cleaned = window.fixBulletEndings(cleaned);

        // 4. 한국어 발음 교정
        cleaned = window.applyKoreanPronunciationFixes(cleaned);

        // 5. 기술 약어 치환
        cleaned = window.applyPronunciation(cleaned);

        // 6. 문장 pause 개선
        cleaned = window.improveDefinitionPauses(cleaned);
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    };

    window.ttsLog('✅ [tts-text] 모듈 로드 완료');
}
