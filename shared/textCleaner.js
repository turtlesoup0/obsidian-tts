/**
 * Text preprocessing for TTS
 */

const PRONUNCIATION_DICT = {
  'API': '에이피아이',
  'HTTP': '에이치티티피',
  'HTTPS': '에이치티티피에스',
  'HTML': '에이치티엠엘',
  'CSS': '씨에스에스',
  'JSON': '제이슨',
  'XML': '엑스엠엘',
  'SQL': '에스큐엘',
  'AI': '인공지능',
  'ML': '머신러닝',
  'IoT': '아이오티',
  'DB': '디비',
  'SW': '소프트웨어'
};

function cleanMarkdown(text) {
  if (!text) return '';
  text = String(text);

  // Remove code blocks first
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]+`/g, '');

  // Remove markdown links - extract only the text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
  
  // Remove bold/italic markers
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');  // Bold + Italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');      // Bold
  text = text.replace(/\*([^*]+)\*/g, '$1');          // Italic
  text = text.replace(/__([^_]+)__/g, '$1');          // Bold
  text = text.replace(/_([^_]+)_/g, '$1');            // Italic
  
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
  
  // Remove escaped characters
  text = text.replace(/\\([*_\[\](){}#.!|`~\-+])/g, '$1');
  
  // Remove remaining single special characters that are alone
  text = text.replace(/\s+[*_\[\]\\]+\s+/g, ' ');
  
  // Convert newlines to pauses for better speech flow
  // Multiple newlines = longer pause
  text = text.replace(/\n{3,}/g, '. ');  // 3+ newlines = sentence break
  text = text.replace(/\n{2}/g, ', ');    // 2 newlines = comma pause
  text = text.replace(/\n/g, ', ');       // 1 newline = comma pause
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ');
  
  // Clean up punctuation spacing
  text = text.replace(/\s*,\s*/g, ', ');
  text = text.replace(/\s*\.\s*/g, '. ');
  
  // Remove quotes if they're not part of actual content
  text = text.replace(/["""]/g, '');
  
  return text.trim();
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

function cleanTextForTTS(text) {
  if (!text) return '';
  
  let cleaned = cleanMarkdown(text);
  cleaned = applyPronunciation(cleaned);
  
  // Final cleanup
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

module.exports = {
  cleanTextForTTS,
  cleanMarkdown,
  applyPronunciation,
  PRONUNCIATION_DICT
};
