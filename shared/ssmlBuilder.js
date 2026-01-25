/**
 * SSML Builder for Azure TTS
 */

function escapeXML(text) {
  if (!text) return '';

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function applyBoldEmphasis(text) {
  // 『텍스트』 → <prosody>로 볼륨과 피치 조정하여 강조
  return text.replace(/『([^』]+)』/g, '<prosody volume="+20%" pitch="+10%">$1</prosody>');
}

function buildSSML(text, options = {}) {
  const {
    voice = 'ko-KR-SunHiNeural',
    rate = 1.0,
    pitch = 0,
    volume = 100,
    enableBoldEmphasis = false
  } = options;

  const clampedRate = Math.max(0.5, Math.min(2.0, rate));
  const clampedPitch = Math.max(-50, Math.min(50, pitch));
  const clampedVolume = Math.max(0, Math.min(100, volume));

  const rateStr = clampedRate.toFixed(1);
  const pitchStr = clampedPitch >= 0 ? `+${clampedPitch}%` : `${clampedPitch}%`;

  // 볼드 강조 적용
  let processedText = text;
  if (enableBoldEmphasis) {
    processedText = applyBoldEmphasis(processedText);
  }

  // SSML 태그를 보호하면서 이스케이프 (prosody)
  const parts = [];
  const ssmlTagRegex = /<(prosody)[^>]*>.*?<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = ssmlTagRegex.exec(processedText)) !== null) {
    // SSML 태그 이전 텍스트 이스케이프
    if (match.index > lastIndex) {
      parts.push(escapeXML(processedText.substring(lastIndex, match.index)));
    }
    // SSML 태그는 그대로 유지 (내부 텍스트만 이스케이프)
    const ssmlTag = match[0];
    const tagName = match[1];
    const innerTextMatch = ssmlTag.match(new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>`));
    if (innerTextMatch) {
      const attrs = ssmlTag.match(new RegExp(`<${tagName}([^>]*)>`))[1];
      const innerText = escapeXML(innerTextMatch[1]);
      parts.push(`<${tagName}${attrs}>${innerText}</${tagName}>`);
    } else {
      parts.push(escapeXML(ssmlTag));
    }
    lastIndex = match.index + match[0].length;
  }

  // 남은 텍스트 이스케이프
  if (lastIndex < processedText.length) {
    parts.push(escapeXML(processedText.substring(lastIndex)));
  }

  const escapedText = parts.join('');

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">
  <voice name="${voice}">
    <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${clampedVolume}">
      ${escapedText}
    </prosody>
  </voice>
</speak>`;

  return ssml;
}

function addBreak(durationMs) {
  return `<break time="${durationMs}ms"/>`;
}

function addEmphasis(text, level = 'moderate') {
  return `<emphasis level="${level}">${escapeXML(text)}</emphasis>`;
}

function formatKeywordsWithBreaks(keywords, breakDuration = 300) {
  if (!keywords) return '';

  const items = keywords.split(/[,،、]/);

  return items
    .map(item => escapeXML(item.trim()))
    .filter(item => item.length > 0)
    .join(addBreak(breakDuration));
}

module.exports = {
  buildSSML,
  escapeXML,
  addBreak,
  addEmphasis,
  formatKeywordsWithBreaks,
  applyBoldEmphasis
};
