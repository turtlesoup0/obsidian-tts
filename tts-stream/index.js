/**
 * Azure Function: TTS Stream
 * Converts text to speech using Azure Cognitive Services
 */

// REST API 버전 사용 (SDK 안정성 문제로 인한 전환)
const { synthesizeSpeech } = require('../shared/azureTTS-rest');
const { buildSSML } = require('../shared/ssmlBuilder');
const { cleanTextForTTS } = require('../shared/textCleaner');
const { addUsage } = require('../shared/usageTracker');

/**
 * Main HTTP trigger function
 */
module.exports = async function (context, req) {
  // CORS handling
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Azure-Speech-Key',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
    return;
  }

  // Get Azure credentials from header or environment
  // req.headers는 자동으로 소문자로 변환됨
  const subscriptionKey = req.headers['x-azure-speech-key'] ||
                          req.headers['X-Azure-Speech-Key'] ||
                          process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'koreacentral';

  const keySource = req.headers['x-azure-speech-key'] ? 'header' : 'environment';
  const keyPrefix = subscriptionKey ? subscriptionKey.substring(0, 10) + '...' : 'NONE';
  context.log(`Using API key from: ${keySource}, Key prefix: ${keyPrefix}`);

  if (!subscriptionKey) {
    context.res = {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: { error: 'Azure Speech Service not configured' }
    };
    return;
  }

  try {
    // Parse request body
    const { text, voice, rate, pitch, volume } = req.body || {};

    if (!text) {
      context.res = {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: { error: 'Missing required parameter: text' }
      };
      return;
    }

    context.log(`TTS Request: ${text.substring(0, 100)}... (voice: ${voice || 'default'}, rate: ${rate || 1.0})`);

    // Clean text
    const cleanedText = cleanTextForTTS(text);

    // Build SSML
    const ssml = buildSSML(cleanedText, {
      voice: voice || 'ko-KR-SunHiNeural',
      rate: rate || 1.0,
      pitch: pitch || 0,
      volume: volume || 100
    });

    context.log('SSML generated:', ssml.substring(0, 200) + '...');

    // Synthesize speech
    const audioData = await synthesizeSpeech(ssml, subscriptionKey, region);

    context.log(`Audio generated: ${audioData.length} bytes`);

    // 사용량 추적 (유료/무료 구분)
    const isPaidApi = req.headers['x-azure-speech-key'] ? true : false;
    const charsUsed = cleanedText.length;

    try {
      await addUsage(charsUsed, isPaidApi);
      context.log(`Usage tracked: ${charsUsed} chars (${isPaidApi ? 'paid' : 'free'})`);
    } catch (usageError) {
      context.log.warn('Failed to track usage:', usageError.message);
    }

    // Return audio stream
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800',
        'Content-Length': audioData.length,
        'X-TTS-Chars-Used': charsUsed.toString(),
        'X-TTS-API-Type': isPaidApi ? 'paid' : 'free'
      },
      isRaw: true,
      body: audioData
    };

  } catch (error) {
    context.log.error('TTS Error:', error);

    // 할당량 초과 감지
    let errorMessage = 'Speech synthesis failed';
    let isQuotaExceeded = false;

    if (error.message && (
      error.message.includes('quota') ||
      error.message.includes('Quota') ||
      error.message.includes('429') ||
      error.message.includes('limit')
    )) {
      errorMessage = 'API quota exceeded';
      isQuotaExceeded = true;
    }

    context.res = {
      status: isQuotaExceeded ? 429 : 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: {
        error: errorMessage,
        details: error.message,
        quotaExceeded: isQuotaExceeded
      }
    };
  }
};
