/**
 * Azure Function: Fix Usage Data Migration
 * 일회성 마이그레이션: totalChars를 freeChars로 이전
 */

const { app } = require('@azure/functions');
const { getUsage } = require('../../shared/usageTracker');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.HOME ? path.join(process.env.HOME, 'data') : '/tmp';
const USAGE_FILE = path.join(DATA_DIR, 'tts-usage.json');

app.http('fix-usage', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'fix-usage',
  handler: async (request, context) => {
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

    try {
      // 현재 데이터 읽기
      const usage = await getUsage();

      context.log('Current usage:', JSON.stringify(usage, null, 2));

      // 불일치 계산
      const tracked = usage.freeChars + usage.paidChars;
      const discrepancy = usage.totalChars - tracked;

      context.log(`Discrepancy found: ${discrepancy} chars not tracked`);

      if (discrepancy > 0) {
        // 누락된 사용량을 freeChars에 추가 (과거 사용량은 모두 무료 API로 간주)
        usage.freeChars += discrepancy;

        context.log(`Migrating ${discrepancy} chars to freeChars`);
        context.log(`New freeChars: ${usage.freeChars}`);

        // 파일에 저장
        await fs.mkdir(DATA_DIR, { recursive: true });
        usage.lastUpdated = new Date().toISOString();
        await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf8');

        return {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: {
            success: true,
            message: 'Usage data migrated successfully',
            before: {
              totalChars: usage.totalChars,
              freeChars: usage.freeChars - discrepancy,
              paidChars: usage.paidChars,
              discrepancy: discrepancy
            },
            after: {
              totalChars: usage.totalChars,
              freeChars: usage.freeChars,
              paidChars: usage.paidChars,
              freeRemaining: Math.max(0, 500000 - usage.freeChars)
            }
          }
        };
      } else {
        return {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: {
            success: true,
            message: 'No migration needed',
            usage: usage
          }
        };
      }

    } catch (error) {
      context.error('Fix usage error:', error);

      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          success: false,
          error: 'Failed to fix usage data',
          details: error.message
        }
      };
    }
  }
});
