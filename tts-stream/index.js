/**
 * Azure Function: TTS Stream
 * Converts text to speech using Azure Cognitive Services
 */

const { synthesizeSpeech } = require('../shared/azureTTS');
const { buildSSML } = require('../shared/ssmlBuilder');
const { cleanTextForTTS } = require('../shared/textCleaner');

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
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
    return;
  }

  // Get Azure credentials from environment
  const subscriptionKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'koreacentral';

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

    // Return audio stream
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800',
        'Content-Length': audioData.length
      },
      isRaw: true,
      body: audioData
    };

  } catch (error) {
    context.log.error('TTS Error:', error);

    context.res = {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: {
        error: 'Speech synthesis failed',
        details: error.message
      }
    };
  }
};
