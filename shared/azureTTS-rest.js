/**
 * Azure TTS Service wrapper (REST API 직접 사용)
 */

const axios = require('axios');

// Azure TTS 타임아웃 (30초)
const TTS_TIMEOUT = 30000;

/**
 * 텍스트 길이에 따라 최적의 비트레이트 선택
 */
function getOptimalOutputFormat(ssmlLength) {
  if (ssmlLength < 200) {
    return 'audio-16khz-24kbitrate-mono-mp3';
  } else if (ssmlLength < 1000) {
    return 'audio-16khz-32kbitrate-mono-mp3';
  } else {
    return 'audio-16khz-48kbitrate-mono-mp3';
  }
}

/**
 * REST API로 TTS 생성
 */
async function synthesizeSpeech(ssml, subscriptionKey, region) {
  console.log(`[TTS REST] 시작 - Region: ${region}, Key prefix: ${subscriptionKey.substring(0, 10)}...`);

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const outputFormat = getOptimalOutputFormat(ssml.length);

  try {
    console.log(`[TTS REST] 요청 URL: ${endpoint}`);
    console.log(`[TTS REST] Output Format: ${outputFormat}`);
    console.log(`[TTS REST] SSML 길이: ${ssml.length}자`);

    const response = await axios.post(endpoint, ssml, {
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormat,
        'User-Agent': 'obsidian-tts-function'
      },
      responseType: 'arraybuffer',
      timeout: TTS_TIMEOUT
    });

    console.log(`[TTS REST] ✅ 성공 - ${response.data.length} bytes`);
    return Buffer.from(response.data);

  } catch (error) {
    console.error(`[TTS REST] ❌ 에러:`, error.message);

    if (error.response) {
      console.error(`[TTS REST] HTTP ${error.response.status}: ${error.response.statusText}`);
      console.error(`[TTS REST] Response:`, error.response.data ? error.response.data.toString() : 'No data');

      if (error.response.status === 429) {
        throw new Error('API quota exceeded');
      } else if (error.response.status === 401) {
        throw new Error('Invalid API key');
      }
    }

    throw new Error(`Speech synthesis error: ${error.message}`);
  }
}

/**
 * 사용 가능한 음성 목록 가져오기
 */
async function getAvailableVoices(subscriptionKey, region, locale = 'ko-KR') {
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;

  try {
    const response = await axios.get(endpoint, {
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey
      },
      timeout: 10000
    });

    const voices = response.data
      .filter(v => v.Locale.startsWith(locale))
      .map(v => ({
        name: v.ShortName,
        displayName: v.LocalName,
        gender: v.Gender,
        locale: v.Locale
      }));

    return voices;

  } catch (error) {
    console.error('Failed to get voices:', error.message);
    throw new Error(`Voice retrieval error: ${error.message}`);
  }
}

module.exports = {
  synthesizeSpeech,
  getAvailableVoices
};
