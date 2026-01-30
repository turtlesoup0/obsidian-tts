/**
 * Azure Function v4: TTS Stream
 * Converts text to speech using Azure Cognitive Services
 */

const { app } = require('@azure/functions');
const { synthesizeSpeech } = require('../../shared/azureTTS-rest');
const { buildSSML } = require('../../shared/ssmlBuilder');
const { cleanTextForTTS, extractKeywordHeadwords } = require('../../shared/textCleaner');
const { addUsage } = require('../../shared/usageTracker');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');
const configLoader = require('../../shared/configLoader');

app.http('tts-stream', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'tts-stream',
  handler: async (request, context) => {
    // config.properties 로드 (최초 1회)
    if (!configLoader.config) {
      await configLoader.load();
    }

    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    // Get Azure credentials from config.properties or environment or request headers
    // 우선순위: 헤더의 API 키 > config.properties > 환경 변수
    const headerApiKey = request.headers.get('x-azure-speech-key');
    const configApiKey = configLoader.get('AZURE_SPEECH_KEY');
    const subscriptionKey = headerApiKey || configApiKey;
    const region = configLoader.get('AZURE_SPEECH_REGION', 'koreacentral');

    // 유료 API 사용 여부는 config.properties 또는 환경 변수로 설정
    const isPaidApiEnabled = configLoader.get('USE_PAID_API') === 'true';

    if (!subscriptionKey) {
      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: { error: 'Service configuration error' }
      };
    }

    // 🔒 보안: API 키 로깅 제거 (정보 노출 방지)
    if (headerApiKey) {
      context.log(`🔑 프론트엔드에서 전달된 API 키 사용`);
    } else {
      context.log(`🔑 환경 변수 API 키 사용`);
    }

    try {
      // Parse request body
      const body = await request.json();
      const { text, voice, rate, pitch, volume, usePaidApi } = body || {};

      // 프론트엔드에서 유료 API 사용 요청 시 반영
      // 프론트엔드 요청이 우선순위, 없으면 환경 변수 사용
      const shouldUsePaidApi = usePaidApi === true ? true : isPaidApiEnabled;

      // 무료 API 할당량 확인 (자동 전환은 하지 않음)
      const FREE_LIMIT = 500000;
      if (!shouldUsePaidApi) {
        try {
          const currentUsage = await require('../../shared/usageTracker').getUsage();
          if (currentUsage.freeChars >= FREE_LIMIT) {
            // 무료 할당량 초과 - 에러 반환 (자동 전환 없음)
            context.log(`⚠️ 무료 API 할당량 초과 (${currentUsage.freeChars}/${FREE_LIMIT})`);
            return {
              status: 429,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              },
              jsonBody: {
                error: 'Free API quota exceeded',
                details: `Monthly limit reached: ${currentUsage.freeChars}/${FREE_LIMIT} characters used. Please enable paid API.`
              }
            };
          } else {
            context.log(`✅ 무료 API 사용 중 (${currentUsage.freeChars}/${FREE_LIMIT})`);
          }
        } catch (err) {
          context.error('Failed to check usage:', err.message);
          // 사용량 확인 실패 시 안전을 위해 에러 반환
          return {
            status: 503,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              error: 'Usage check failed',
              details: 'Unable to verify free API quota. Please try again or enable paid API.',
              technical: err.message
            }
          };
        }
      } else {
        context.log(`✅ 유료 API 사용 중 (프론트엔드 요청 또는 환경 변수: ${usePaidApi === true ? '프론트엔드' : '환경변수'})`);
      }

      // 입력 검증: text 필수
      if (!text || typeof text !== 'string') {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Missing or invalid parameter: text must be a non-empty string' }
        };
      }

      // 🔒 보안: 입력 sanitization (제어 문자 제거)
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');  // 제어 문자 제거 (\t, \n, \r 제외)

      // Trim 후 빈 문자열 체크
      text = text.trim();
      if (text.length === 0) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Text is empty after sanitization' }
        };
      }

      // 입력 검증: text 길이 제한 (10,000자)
      // Azure TTS 권장: ~5,000자, 실용적 상한: 10,000자
      if (text.length > 10000) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Text too long: maximum 10,000 characters allowed' }
        };
      }

      // 입력 검증: voice (허용된 voice 목록)
      const allowedVoices = [
        'ko-KR-SunHiNeural', 'ko-KR-InJoonNeural', 'ko-KR-BongJinNeural',
        'ko-KR-GookMinNeural', 'ko-KR-JiMinNeural', 'ko-KR-SeoHyeonNeural',
        'ko-KR-SoonBokNeural', 'ko-KR-YuJinNeural'
      ];
      if (voice && !allowedVoices.includes(voice)) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: `Invalid voice: must be one of ${allowedVoices.join(', ')}` }
        };
      }

      // 입력 검증: rate (0.5 ~ 2.0)
      if (rate !== undefined && (typeof rate !== 'number' || rate < 0.5 || rate > 2.0)) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Invalid rate: must be a number between 0.5 and 2.0' }
        };
      }

      // 입력 검증: pitch (-50 ~ 50)
      if (pitch !== undefined && (typeof pitch !== 'number' || pitch < -50 || pitch > 50)) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Invalid pitch: must be a number between -50 and 50' }
        };
      }

      // 입력 검증: volume (0 ~ 100)
      if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 100)) {
        return {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Invalid volume: must be a number between 0 and 100' }
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
          cleanedText += `주제: ${cleanTextForTTS(subject[1], false, true)}. `;
        }

        if (defMatch) {
          const defText = cleanTextForTTS(defMatch[1], false, true);
          cleanedText += `정의: ${defText}. `;
        }

        if (kwMatch) {
          // 키워드 전체 읽기 (두음 추출 비활성화)
          const kwText = cleanTextForTTS(kwMatch[1], false, true);
          if (kwText) {
            cleanedText += `키워드: ${kwText}`;
          }
        }
      } else {
        // 일반 텍스트
        cleanedText = cleanTextForTTS(text, false, true);
      }

      context.log('Cleaned text:', cleanedText.substring(0, 150) + '...');

      // 실제 TTS에 사용될 문자 수 계산 (『』 마커 제거 후 계산)
      const actualCharsUsed = cleanedText.replace(/『|』/g, '').length;

      // Build SSML with bold emphasis
      const ssml = buildSSML(cleanedText, {
        voice: voice || 'ko-KR-SunHiNeural',
        rate: rate || 1.0,
        pitch: pitch || 0,
        volume: volume || 100,
        enableBoldEmphasis: true
      });

      // Synthesize speech
      const audioData = await synthesizeSpeech(ssml, subscriptionKey, region);

      context.log(`Audio generated: ${audioData.length} bytes, ${actualCharsUsed} chars used`);

      // 백엔드에서 사용량 추적 (동기적으로 실행)
      try {
        const updatedUsage = await addUsage(actualCharsUsed, shouldUsePaidApi);
        context.log(`Usage tracked: ${updatedUsage.totalChars} total (Free: ${updatedUsage.freeChars}, Paid: ${updatedUsage.paidChars}) in ${updatedUsage.currentMonth}`);
      } catch (err) {
        context.error('Failed to track usage:', err.message, err.stack);
      }

      // Return audio stream with usage info
      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=604800',
          'Content-Length': audioData.length.toString(),
          'X-TTS-Chars-Used': actualCharsUsed.toString()
        },
        body: audioData
      };

    } catch (error) {
      context.error('TTS Error:', error);

      // 에러 메시지에서 상세 정보 추출
      const errorMessage = error.message || 'Unknown error';

      // HTTP 상태 코드 결정
      let statusCode = 500;
      let userMessage = 'Speech synthesis failed';

      if (errorMessage.includes('quota exceeded') || errorMessage.includes('429')) {
        statusCode = 429;
        userMessage = 'API quota exceeded. Please try again later or enable paid API.';
      } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('401')) {
        statusCode = 401;
        userMessage = 'Invalid API key. Please check your Azure Speech Service credentials.';
      } else if (errorMessage.includes('timeout')) {
        statusCode = 504;
        userMessage = 'Request timeout. The text might be too long or the service is slow.';
      } else if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
        statusCode = 503;
        userMessage = 'Network error. Please check your internet connection.';
      }

      return {
        status: statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: userMessage,
          details: errorMessage,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
});
