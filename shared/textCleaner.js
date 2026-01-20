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
  'AI': '에이아이',
  'ML': '머신러닝',
  'IoT': '아이오티',
  'DB': '디비'
};

function cleanMarkdown(text) {
  if (!text) return '';
  text = String(text);

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]+`/g, '');

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
  
  // Remove markdown links
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Remove bold/italic (including underscore variants)
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/___([^_]+)___/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // CRITICAL: Remove ALL backslashes (이스케이프 문자 완전 제거)
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
  
  // Remove remaining isolated special characters
  text = text.replace(/\s+[*_\[\]]+\s+/g, ' ');
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ');
  
  return text.trim();
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

function cleanTextForTTS(text, isKeyword = false) {
  if (!text) return '';
  
  let cleaned = cleanMarkdown(text);
  cleaned = improveDefinitionPauses(cleaned);
  cleaned = applyPronunciation(cleaned);
  
  // Final cleanup
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

module.exports = {
  cleanTextForTTS,
  cleanMarkdown,
  improveDefinitionPauses,
  applyPronunciation,
  PRONUNCIATION_DICT
};
