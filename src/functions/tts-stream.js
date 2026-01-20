/**
 * Azure Function v4: TTS Stream
 * Converts text to speech using Azure Cognitive Services
 */

const { app } = require('@azure/functions');
const { synthesizeSpeech } = require('../../shared/azureTTS');
const { buildSSML } = require('../../shared/ssmlBuilder');
const { cleanTextForTTS, extractKeywordHeadwords } = require('../../shared/textCleaner');
const { addUsage } = require('../../shared/usageTracker');

app.http('tts-stream', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'tts-stream',
  handler: async (request, context) => {
    // CORS handling
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        },
        body: ''
      };
    }

    // Get Azure credentials from environment
    const subscriptionKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || 'koreacentral';

    if (!subscriptionKey) {
      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: { error: 'Azure Speech Service not configured' }
      };
    }

    try {
      // Parse request body
      const body = await request.json();
      const { text, voice, rate, pitch, volume } = body || {};

      if (!text) {
        return {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Missing required parameter: text' }
        };
      }

      context.log(`TTS Request: ${text.substring(0, 100)}...`);

      // 스마트 텍스트 처리: 정의/키워드 자동 감지
      let cleanedText = '';

      // "정의:" 와 "키워드:" 구분
      const defMatch = text.match(/정의:\s*(.+?)(?=키워드:|$)/s);
      const kwMatch = text.match(/키워드:\s*(.+?)$/s);

      if (defMatch || kwMatch) {
        // 구조화된 텍스트
        const subject = text.match(/주제:\s*(.+?)(?=정의:|키워드:|$)/s);

        if (subject) {
          cleanedText += `주제: ${cleanTextForTTS(subject[1], false)}. `;
        }

        if (defMatch) {
          const defText = cleanTextForTTS(defMatch[1], false);
          cleanedText += `정의: ${defText}. `;
        }

        if (kwMatch) {
          // 키워드 전체 읽기 (두음 추출 비활성화)
          const kwText = cleanTextForTTS(kwMatch[1], false);
          if (kwText) {
            cleanedText += `키워드: ${kwText}`;
          }
        }
      } else {
        // 일반 텍스트
        cleanedText = cleanTextForTTS(text, false);
      }

      context.log('Cleaned text:', cleanedText.substring(0, 150) + '...');

      // 실제 TTS에 사용될 문자 수 계산
      const actualCharsUsed = cleanedText.length;

      // Build SSML
      const ssml = buildSSML(cleanedText, {
        voice: voice || 'ko-KR-SunHiNeural',
        rate: rate || 1.0,
        pitch: pitch || 0,
        volume: volume || 100
      });

      // Synthesize speech
      const audioData = await synthesizeSpeech(ssml, subscriptionKey, region);

      context.log(`Audio generated: ${audioData.length} bytes, ${actualCharsUsed} chars used`);

      // 백엔드에서 사용량 추적 (동기적으로 실행)
      try {
        const updatedUsage = await addUsage(actualCharsUsed);
        context.log(`Usage tracked: ${updatedUsage.totalChars} total chars in ${updatedUsage.currentMonth}`);
      } catch (err) {
        context.error('Failed to track usage:', err.message, err.stack);
      }

      // Return audio stream with usage info
      return {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-TTS-Chars-Used',
          'Cache-Control': 'public, max-age=604800',
          'Content-Length': audioData.length.toString(),
          'X-TTS-Chars-Used': actualCharsUsed.toString()
        },
        body: audioData
      };

    } catch (error) {
      context.error('TTS Error:', error);

      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Speech synthesis failed',
          details: error.message
        }
      };
    }
  }
});
