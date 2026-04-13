/**
 * Azure Function: Get TTS Configuration Version
 * 프론트엔드가 백엔드 버전을 동적으로 조회하여 자동 동기화
 */

const { app } = require('@azure/functions');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');
const { PRONUNCIATION_PROFILE_VERSION } = require('../../shared/textCleaner');

app.http('get-version', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'version',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    try {
      context.log(`📦 Version API called: ${PRONUNCIATION_PROFILE_VERSION}`);

      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600' // 1시간 캐시
        },
        jsonBody: {
          pronunciationProfileVersion: PRONUNCIATION_PROFILE_VERSION,
          apiVersion: '1.0',
          buildDate: new Date().toISOString().split('T')[0],
          deprecatedVersions: ['ko-v1.0', 'ko-v1.1'] // 호환성 체크용
        }
      };

    } catch (error) {
      context.error('Version API error:', error);

      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get version',
          details: error.message
        }
      };
    }
  }
});
