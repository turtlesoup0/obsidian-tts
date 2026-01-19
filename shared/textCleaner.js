/**
 * Text preprocessing for TTS
 * Cleans markdown and applies pronunciation dictionary
 */

// Technical term pronunciation dictionary for 정보관리기술사
const PRONUNCIATION_DICT = {
  // English acronyms
  'API': '에이피아이',
  'HTTP': '에이치티티피',
  'HTTPS': '에이치티티피에스',
  'HTML': '에이치티엠엘',
  'CSS': '씨에스에스',
  'JSON': '제이슨',
  'XML': '엑스엠엘',
  'REST': '레스트',
  'SOAP': '소프',
  'CPU': '씨피유',
  'GPU': '지피유',
  'RAM': '램',
  'ROM': '롬',
  'SSD': '에스에스디',
  'HDD': '에이치디디',
  'IoT': '아이오티',
  'AI': '에이아이',
  'ML': '머신러닝',
  'DL': '딥러닝',
  'NLP': '엔엘피',
  'CNN': '씨엔엔',
  'RNN': '알엔엔',
  'OS': '오에스',
  'DB': '디비',
  'DBMS': '디비엠에스',
  'SQL': '에스큐엘',
  'NoSQL': '노에스큐엘',
  'RDBMS': '알디비엠에스',
  'TCP': '티씨피',
  'IP': '아이피',
  'UDP': '유디피',
  'DNS': '디엔에스',
  'VPN': '브이피엔',
  'SSL': '에스에스엘',
  'TLS': '티엘에스',
  'OAuth': '오어쓰',
  'JWT': '제이더블유티',
  'AWS': '에이더블유에스',
  'Azure': '애저',
  'GCP': '지씨피',
  'SaaS': '사스',
  'PaaS': '파스',
  'IaaS': '아이에이에이에스',
  'Docker': '도커',
  'Kubernetes': '쿠버네티스'
};

/**
 * Clean markdown formatting from text
 */
function cleanMarkdown(text) {
  if (!text) return '';

  text = String(text);

  // Remove markdown formatting
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');  // Bold
  text = text.replace(/_(.+?)_/g, '$1');         // Italic
  text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Links
  text = text.replace(/`(.+?)`/g, '$1');         // Code
  text = text.replace(/#\w+/g, '');              // Hashtags

  // Normalize whitespace
  text = text.replace(/\n/g, ' ');
  text = text.replace(/\s+/g, ' ');

  // Remove quotes
  text = text.replace(/"/g, '');

  return text.trim();
}

/**
 * Apply pronunciation dictionary for technical terms
 */
function applyPronunciation(text) {
  let result = text;

  // Sort by length (longest first) to avoid partial replacements
  const terms = Object.keys(PRONUNCIATION_DICT).sort((a, b) => b.length - a.length);

  for (const term of terms) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    result = result.replace(regex, PRONUNCIATION_DICT[term]);
  }

  return result;
}

/**
 * Convert numbers to Korean reading
 */
function numberToKorean(text) {
  // Simple implementation for years
  text = text.replace(/(\d{4})년/g, (match, year) => {
    const digits = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const y = year.toString().split('').map(d => digits[parseInt(d)]).join('');
    return y + '년';
  });

  return text;
}

/**
 * Main text cleaning function for TTS
 */
function cleanTextForTTS(text) {
  if (!text) return '';

  let cleaned = cleanMarkdown(text);
  cleaned = applyPronunciation(cleaned);
  cleaned = numberToKorean(cleaned);

  return cleaned;
}

module.exports = {
  cleanTextForTTS,
  cleanMarkdown,
  applyPronunciation,
  numberToKorean,
  PRONUNCIATION_DICT
};
