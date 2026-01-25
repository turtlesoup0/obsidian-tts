/**
 * Azure Function: Get Speech Service Usage from Local Tracker
 */

const { app } = require('@azure/functions');
const { getUsage } = require('../../shared/usageTracker');
const { getCorsHeaders, handleCorsPreflightRequest } = require('../../shared/corsHelper');

app.http('get-usage', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'usage',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(requestOrigin, ['GET', 'OPTIONS']);
    }

    try {
      const usage = await getUsage();

      const freeLimit = 500000;
      const freePercentage = ((usage.freeChars / freeLimit) * 100).toFixed(2);
      const freeRemaining = Math.max(0, freeLimit - usage.freeChars);

      context.log(`Usage: Total=${usage.totalChars}, Free=${usage.freeChars}, Paid=${usage.paidChars}`);

      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          source: 'local-tracker',
          totalChars: usage.totalChars,
          freeChars: usage.freeChars,
          paidChars: usage.paidChars,
          currentMonth: usage.currentMonth,
          lastUpdated: usage.lastUpdated,
          freeLimit: freeLimit,
          freePercentage: freePercentage,
          freeRemaining: freeRemaining,
          // 하위 호환성을 위한 필드
          percentage: freePercentage,
          remaining: freeRemaining
        }
      };

    } catch (error) {
      context.error('Usage tracker error:', error);

      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get usage',
          details: error.message
        }
      };
    }
  }
});
