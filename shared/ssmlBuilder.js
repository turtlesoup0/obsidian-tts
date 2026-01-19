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
