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
        'REST': '레스트', 'SOAP': '소프', 'GraphQL': '그래프큐엘',
        'WebSocket': '웹소켓', 'AJAX': '에이젝스', 'DOM': '돔',

        // 데이터베이스
        'SQL': '에스큐엘', 'NoSQL': '노에스큐엘', 'DB': '디비', 'DBMS': '디비엠에스',
        'RDBMS': '알디비엠에스', 'ACID': '에씨아이디', 'CRUD': '크루드',
        'ORM': '오알엠', 'JDBC': '제이디비씨', 'ODBC': '오디비씨',

        // 클라우드/DevOps
        'AWS': '아마존 웹 서비스', 'GCP': '지씨피', 'Azure': '아주레',
        'DevOps': '데브옵스', 'CI/CD': '씨아이씨디', 'CD': '씨디',
        'SRE': '에스알이', 'CI': '씨아이', 'CD': '씨디',

        // 컨테이너/오케스트레이션
        'Docker': '도커', 'Kubernetes': '쿠버네티스', 'K8s': '케이에이츠',
        'Pod': '파드', 'Node': '노드', 'Cluster': '클러스터',
        'Helm': '헬름', 'Istio': '이스티오', 'Prometheus': '프로메테우스',
        'Grafana': '그라파나', 'ELK': '엘크', 'Jenkins': '젠킨스',
        'GitHub': '깃허브', 'GitLab': '깃랩', 'Bitbucket': '빛버킷',
        'Git': '깃', 'SVN': '에스브이엔', 'Mercurial': '머큐리얼',
        'Architecture': '아키텍처', 'arch': '아크', 'Microservices': '마이크로서비스',

        // 인프라/IaC
        'Terraform': '테라폼', 'Ansible': '앤서블', 'Chef': '셰프',
        'Puppet': '퍼핏', 'SaltStack': '솔트스택', 'Vagrant': '베이그런트',
        'Packer': '패커', 'Consul': '콘설', 'Nomad': '노마드',

        // 모니터링/로깅
        'Nagios': '나기오스', 'Zabbix': '재빅스', 'Datadog': '데이터독',
        'New Relic': '뉴렐릭', 'Splunk': '스플렁크', 'Fluentd': '플루언트디',

        // 협업도구
        'Jira': '지라', 'Confluence': '컨플루언스', 'Slack': '슬랙',
        'Teams': '팀즈', 'Zoom': '줌', 'Mattermost': '매터모스트',

        // 인공지능/머신러닝
        'AI': '인공지능', 'ML': '머신러닝', 'DL': '딥러닝', 'IoT': '아이오티',
        'NLP': '엘엘피', 'CV': '씨비', 'RPA': '알피에이',
        'LLM': '엘엠엠', 'GPT': '지피티', 'BERT': '버트',

        // 하드웨어
        'CPU': '씨피유', 'GPU': '지피유', 'RAM': '램',
        'SSD': '에스에스디', 'HDD': '에이치디디', 'NVMe': '엔브이엠이',

        // 네트워크
        'IP': '아이피', 'TCP': '티씨피', 'UDP': '유디피',
        'DNS': '디엔에스', 'VPN': '브이피엔', 'NW': '네트워크',
        'LAN': '랜', 'WAN': '왠', 'VLAN': '브이랜', 'VPC': '브이피씨',
        'CDN': '씨디엔', 'LB': '엘비', 'NLB': '엔엘비',
        'NAT': '냇', 'DHCP': '디에이치피', 'ARP': '아알피',
        'MAC': '맥', 'SSID': '에스에스아이디', 'WPA': '더블유피에이',

        // 보안
        'IDS': '아이디에스', 'IPS': '아이피에스', 'DDoS': '디디오스',
        'XSS': '엑스에스에스', 'CSRF': '시서에프', 'SQLi': '에스큐엘아이',
        'MITM': '맨인더미들', 'Ransomware': '랜섬웨어', 'Malware': '맬웨어',
        'Phishing': '피싱', 'SOC': '에스오씨', 'SIEM': '시엠',

        // 인증/보안
        'JWT': '제이웨티', 'OAuth': '오오스', 'SAML': '샘엘',
        'LDAP': '엘다프', 'AD': '액티브 디렉토리', 'SSO': '에스에스오',
        'MFA': '엠에프에이', '2FA': '투에프에이', 'TOTP': '티오티피',
        'SSL': '에스에스엘', 'TLS': '티엘에스', 'RSA': '알에스에이',
        'AES': '에이이에스', 'SHA': '샤', 'MD5': '엠디파이브',

        // 가상화
        'VM': '가상 머신', 'Hypervisor': '하이퍼바이저',
        'VMware': '브이엠웨어', 'VirtualBox': '버추얼박스', 'KVM': '케이비엠',

        // 프로그래밍/개발
        'OS': '오에스', 'IDE': '아이디이', 'SDK': '에스디케이',
        'CLI': '씨엘아이', 'GUI': '지유아이', 'API': '에이피아이',
        'SDK': '에스디케이', 'API_KEY': '에이피아이 키', 'WEBHOOK': '웹훅',

        // 기타
        'IT': '아이티', 'SW': '소프트웨어', 'HW': '하드웨어',
        'FAQ': '에프에이큐', 'ASAP': '에이에스에이피', 'BTW': '바이더웨이',
        'TBD': '티비디', 'ETA': '에스티에이', 'EOD': '이오디'
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
