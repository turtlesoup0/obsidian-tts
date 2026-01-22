/**
 * CORS Helper - 환경 변수 기반 CORS 설정
 */

/**
 * 허용된 오리진 목록 가져오기
 */
function getAllowedOrigins() {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (!allowedOriginsEnv) {
    // 개발 환경: localhost만 허용
    return ['http://localhost', 'http://127.0.0.1'];
  }

  // 프로덕션 환경: 환경 변수에서 쉼표로 구분된 도메인 목록
  return allowedOriginsEnv.split(',').map(origin => origin.trim());
}

/**
 * Origin이 허용되는지 확인
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  // 와일드카드는 개발 환경에서만 허용
  if (process.env.NODE_ENV === 'development' && allowedOrigins.includes('*')) {
    return true;
  }

  // 정확한 일치 또는 도메인 접두사 일치 확인
  return allowedOrigins.some(allowed => {
    if (allowed === origin) return true;

    // app:// 같은 프로토콜도 허용 (Obsidian 앱)
    if (origin.startsWith('app://') || origin.startsWith('capacitor://')) {
      return true;
    }

    return false;
  });
}

/**
 * CORS 헤더 생성
 */
function getCorsHeaders(requestOrigin) {
  const origin = isOriginAllowed(requestOrigin) ? requestOrigin : getAllowedOrigins()[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-TTS-Chars-Used, X-Cache-Status, X-Cached-At, X-Expires-At'
  };
}

/**
 * OPTIONS 요청에 대한 CORS preflight 응답
 */
function handleCorsPreflightResponse(requestOrigin) {
  return {
    status: 204,
    headers: getCorsHeaders(requestOrigin),
    body: ''
  };
}

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,
  handleCorsPreflightResponse
};
