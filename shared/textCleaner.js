/**
 * Text preprocessing for TTS with pronunciation optimization
 */

// ============================================
// 발음 프로파일 버전
// ============================================
// 발음 사전이나 정규화 규칙 변경 시 버전 업데이트
// 캐시 키에 포함되어 자동으로 새 오디오 생성
const PRONUNCIATION_PROFILE_VERSION = 'ko-v1.2';  // 공백 기반 음절 분리 방식 적용

// ============================================
// 기술 약어 발음 사전
// ============================================
const PRONUNCIATION_DICT = {
  // 웹 기술
  'API': '에이피아이',
  'HTTP': '에이치티티피',
  'HTTPS': '에이치티티피에스',
  'HTML': '에이치티엠엘',
  'CSS': '씨에스에스',
  'JSON': '제이슨',
  'XML': '엑스엠엘',
  'URL': '유알엘',
  'URI': '유알아이',

  // 데이터베이스
  'SQL': '에스큐엘',
  'NoSQL': '노에스큐엘',
  'DB': '디비',
  'DBMS': '디비엠에스',

  // 인공지능/머신러닝
  'AI': '인공지능',
  'ML': '머신러닝',
  'DL': '딥러닝',
  'IoT': '아이오티',

  // 하드웨어
  'CPU': '씨피유',
  'GPU': '지피유',
  'RAM': '램',
  'SSD': '에스에스디',
  'HDD': '에이치디디',

  // 네트워크
  'IP': '아이피',
  'TCP': '티씨피',
  'UDP': '유디피',
  'DNS': '디엔에스',
  'VPN': '브이피엔',
  'NW': '네트워크',

  // 프로그래밍
  'OS': '오에스',
  'IDE': '아이디이',
  'SDK': '에스디케이',
  'CLI': '씨엘아이',
  'GUI': '지유아이',

  // 기타
  'IT': '아이티',
  'SW': '소프트웨어',
  'HW': '하드웨어',
  'DB': '디비',
};

// ============================================
// 한국어 발음 교정 사전
// ============================================
// Azure Korean TTS는 SSML phoneme을 지원하지 않음
// 문자 치환 방식이 유일하고 가장 안정적인 해법
// 공백 삽입으로 음절 분리 → 정확한 발음 유도
const KOREAN_PRONUNCIATION_FIXES = {
  // "의" 발음 교정 (공백으로 음절 분리)
  '정의': '정 의',
  '의존': '의 존',
  '의의': '의 의',
  '회의': '회 의',
  '합의': '합 의',
  '동의': '동 의',
  '의미': '의 미',
};

function cleanMarkdown(text, preserveBold = false) {
  if (!text) return '';
  text = String(text);

  // Remove code blocks first
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]+`/g, '');

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

  // Remove markdown links - extract only the text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  if (preserveBold) {
    // Convert bold to placeholder for SSML processing
    // **텍스트** → 『텍스트』 (임시 마커)
    text = text.replace(/\*\*([^*]+)\*\*/g, '『$1』');
  }

  // Remove bold/italic markers (including underscore variants)
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');  // Bold + Italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');      // Bold
  text = text.replace(/\*([^*]+)\*/g, '$1');          // Italic
  text = text.replace(/___([^_]+)___/g, '$1');        // Bold + Italic (underscore)
  text = text.replace(/__([^_]+)__/g, '$1');          // Bold (underscore)
  text = text.replace(/_([^_]+)_/g, '$1');            // Italic (underscore)

  // Remove any remaining backslashes (escape characters)
  text = text.replace(/\\/g, '');

  // Remove headers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Remove hashtags
  text = text.replace(/#[\w가-힣]+/g, '');

  // Normalize whitespace first
  text = text.replace(/\s+/g, ' ');

  return text.trim();
}

// ============================================
// Phase 2: 특수문자 정규화
// ============================================
function normalizeSpecialChars(text) {
  if (!text) return '';

  // - 와 / 가 공백 없이 붙는 문제 해결
  // "데이터-분석" → "데이터 분석" (공백 추가)
  text = text.replace(/([가-힣])-([가-힣])/g, '$1 $2');

  // "TCP/IP" → "TCP IP" (공백 추가)
  text = text.replace(/([가-힣A-Z])\/([가-힣A-Z])/g, '$1 $2');

  // "A->B" 같은 화살표는 공백으로 (발음하지 않음)
  text = text.replace(/->|=>|→/g, ' ');

  // 범위 표시 (~) 는 "에서 ~ 까지" 형태로
  text = text.replace(/(\d+)\s*~\s*(\d+)/g, '$1에서 $2까지');

  return text;
}

// ============================================
// Phase 1: 개조식 문장 교정
// ============================================
function fixBulletEndings(text) {
  if (!text) return '';

  // 개조식 어미 (함, 임, 됨) 뒤에 마침표 추가
  // "데이터를 저장함" → "데이터를 저장함."
  text = text.replace(/([가-힣]+[함임됨])\s*$/gm, '$1.');

  return text;
}

// ============================================
// Phase 2: 한국어 발음 교정
// ============================================
function applyKoreanPronunciationFixes(text) {
  if (!text) return '';

  // 한글 단어 단위로 치환
  // \b는 한글에서 작동하지 않으므로 전역 매칭 사용
  for (const [word, fix] of Object.entries(KOREAN_PRONUNCIATION_FIXES)) {
    const regex = new RegExp(word, 'g');
    text = text.replace(regex, fix);
  }

  return text;
}

function improveDefinitionPauses(text) {
  if (!text) return '';

  // Add pauses after punctuation
  text = text.replace(/\.\s+/g, '. ');
  text = text.replace(/\?\s+/g, '? ');
  text = text.replace(/!\s+/g, '! ');

  // Add pauses after Korean sentence endings
  text = text.replace(/(다|요|임|음)\s+/g, '$1. ');

  return text;
}

function applyPronunciation(text) {
  let result = text;
  const terms = Object.keys(PRONUNCIATION_DICT).sort((a, b) => b.length - a.length);
  
  for (const term of terms) {
    const regex = new RegExp('\\b' + term + '\\b', 'gi');
    result = result.replace(regex, PRONUNCIATION_DICT[term]);
  }
  
  return result;
}

function extractKeywordHeadwords(keywordText) {
  if (!keywordText) return '';

  // Extract only text inside [**...**] or [*...*]
  const headwords = [];
  const regex = /\[\*\*([^\]]+?)\*\*\]|\[\*([^\]]+?)\*\]/g;
  let match;

  while ((match = regex.exec(keywordText)) !== null) {
    const headword = match[1] || match[2];  // match[1] for **, match[2] for *
    if (headword && headword.trim()) {
      headwords.push(headword.trim());
    }
  }

  return headwords.join(', ');
}

function cleanTextForTTS(text, isKeyword = false, preserveBold = false) {
  if (!text) return '';

  let cleaned;

  if (isKeyword) {
    // For keywords, extract only headwords in [**...**]
    cleaned = extractKeywordHeadwords(text);
  } else {
    // 파이프라인 순서 (중요!)
    // 1. 마크다운 제거
    cleaned = cleanMarkdown(text, preserveBold);

    // 2. 특수문자 정규화 (Phase 2)
    cleaned = normalizeSpecialChars(cleaned);

    // 3. 개조식 문장 교정 (Phase 1)
    cleaned = fixBulletEndings(cleaned);

    // 4. 한국어 발음 교정 (Phase 2)
    // 공백 삽입 방식으로 음절 분리 → Azure TTS 정확한 발음 유도
    cleaned = applyKoreanPronunciationFixes(cleaned);

    // 5. 기술 약어 치환 (Phase 1)
    cleaned = applyPronunciation(cleaned);

    // 6. 문장 pause 개선
    cleaned = improveDefinitionPauses(cleaned);
  }

  // Final cleanup
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

module.exports = {
  // Main functions
  cleanTextForTTS,
  cleanMarkdown,
  extractKeywordHeadwords,

  // Processing functions
  normalizeSpecialChars,
  fixBulletEndings,
  applyKoreanPronunciationFixes,
  improveDefinitionPauses,
  applyPronunciation,

  // Constants
  PRONUNCIATION_PROFILE_VERSION,
  PRONUNCIATION_DICT,
  KOREAN_PRONUNCIATION_FIXES
};
