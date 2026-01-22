/**
 * SSML Builder for Azure TTS
 */

function escapeXML(text) {
  if (!text) return '';

  // emphasis 태그가 포함된 경우 특별 처리
  const emphasisRegex = /<emphasis level="(.*?)">(.*?)<\/emphasis>/g;
  let lastIndex = 0;
  let result = '';

  // emphasis 태그를 임시로 추출하고 처리
  let match;
  const textStr = String(text);

  while ((match = emphasisRegex.exec(textStr)) !== null) {
    // 태그 이전 텍스트는 이스케이프
    const beforeText = textStr.substring(lastIndex, match.index);
    result += beforeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // emphasis 태그 내부 텍스트만 이스케이프하고 태그는 유지
    const level = match[1];
    const innerText = match[2]
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    result += `<emphasis level="${level}">${innerText}</emphasis>`;
    lastIndex = match.index + match[0].length;
  }

  // 마지막 남은 텍스트 이스케이프
  const remainingText = textStr.substring(lastIndex);
  result += remainingText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return result;
}

function buildSSML(text, options = {}) {
  const {
    voice = 'ko-KR-SunHiNeural',
    rate = 1.0,
    pitch = 0,
    volume = 100
  } = options;

  const clampedRate = Math.max(0.5, Math.min(2.0, rate));
  const clampedPitch = Math.max(-50, Math.min(50, pitch));
  const clampedVolume = Math.max(0, Math.min(100, volume));

  const rateStr = clampedRate.toFixed(1);
  const pitchStr = clampedPitch >= 0 ? `+${clampedPitch}%` : `${clampedPitch}%`;
  const escapedText = escapeXML(text);

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
  formatKeywordsWithBreaks
};
