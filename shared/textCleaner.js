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
    // For definitions, clean markdown and improve pauses
    cleaned = cleanMarkdown(text, preserveBold);
    cleaned = improveDefinitionPauses(cleaned);
  }

  cleaned = applyPronunciation(cleaned);

  // Final cleanup
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

module.exports = {
  cleanTextForTTS,
  cleanMarkdown,
  extractKeywordHeadwords,
  improveDefinitionPauses,
  applyPronunciation,
  PRONUNCIATION_DICT
};
