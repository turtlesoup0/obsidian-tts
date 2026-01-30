/**
 * Azure TTS Service wrapper (REST API 직접 사용)
 */

const axios = require('axios');

// Azure TTS 타임아웃 (30초)
const TTS_TIMEOUT = 30000;

/**
 * 텍스트 길이에 따라 최적의 비트레이트 선택
 * Azure 지원 포맷: 32kbps, 64kbps, 128kbps (16kHz)
 */
function getOptimalOutputFormat(ssmlLength) {
  if (ssmlLength < 200) {
    return 'audio-16khz-32kbitrate-mono-mp3';  // 짧은 텍스트: 32kbps
  } else if (ssmlLength < 1000) {
    return 'audio-16khz-64kbitrate-mono-mp3';  // 중간 텍스트: 64kbps
  } else {
    return 'audio-16khz-128kbitrate-mono-mp3';  // 긴 텍스트: 128kbps
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
    // 🔒 보안: 프로덕션 환경에서는 최소 로깅
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      console.error(`[TTS REST] Error: ${error.message}`);
    } else {
      console.error(`[TTS REST] ❌ 에러:`, error.message);
    }

    if (error.response) {
      if (isProduction) {
        // 프로덕션: 상태 코드만 로깅
        console.error(`[TTS REST] HTTP ${error.response.status}`);
      } else {
        // 개발: 상세 로깅
        console.error(`[TTS REST] HTTP ${error.response.status}: ${error.response.statusText}`);
        console.error(`[TTS REST] Response Headers:`, error.response.headers);
        console.error(`[TTS REST] Response Data:`, error.response.data ? error.response.data.toString() : 'No data');
      }

      // 상세 에러 정보 추출 (개발 환경에서만)
      let detailedError = error.response.statusText;
      if (error.response.data && !isProduction) {
        try {
          const dataStr = error.response.data.toString();
          console.error(`[TTS REST] Full Response Body:`, dataStr);
          detailedError = dataStr;
        } catch (e) {
          // Ignore parsing errors
        }
      }

      if (error.response.status === 429) {
        throw new Error('API quota exceeded');
      } else if (error.response.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response.status === 403) {
        throw new Error(`Access forbidden: ${detailedError}`);
      } else {
        throw new Error(`Azure API error (${error.response.status}): ${detailedError}`);
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
