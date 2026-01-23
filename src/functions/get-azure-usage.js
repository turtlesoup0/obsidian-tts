/**
 * Azure Function: Get REAL Azure Speech Service Usage from Consumption API
 *
 * This function queries Azure Consumption API to get the ACTUAL usage
 * reported by Azure, not the local file-based tracking.
 *
 * Note: Consumption API has 24-48 hour delay, so today's usage won't be visible immediately.
 */

const { app } = require('@azure/functions');
const { ManagedIdentityCredential } = require('@azure/identity');
const https = require('https');

/**
 * Query Azure Consumption API using Managed Identity
 */
async function getConsumptionUsage(subscriptionId) {
  // Get token using Managed Identity
  const credential = new ManagedIdentityCredential();
  const tokenResponse = await credential.getToken('https://management.azure.com/.default');

  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Consumption/usageDetails?api-version=2023-05-01`;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenResponse.token}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Consumption API error: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

app.http('get-azure-usage', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'azure-usage',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        },
        body: ''
      };
    }

    try {
      // Configuration
      const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
      const resourceId = process.env.COGNITIVE_SERVICES_RESOURCE_ID;

      if (!subscriptionId) {
        throw new Error('AZURE_SUBSCRIPTION_ID environment variable not set');
      }

      context.log('Querying Consumption API with Managed Identity...');
      const consumptionData = await getConsumptionUsage(subscriptionId);

      // 디버그: 모든 서비스 타입 확인
      const allServices = new Set();
      consumptionData.value.forEach(item => {
        if (item.properties.consumedService) {
          allServices.add(item.properties.consumedService);
        }
      });
      context.log('발견된 모든 서비스 타입:', Array.from(allServices).slice(0, 20));

      // Filter for our resources and current month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Separate filters for different services
      const cognitiveServicesUsage = consumptionData.value.filter(item => {
        const isCognitiveServices = item.properties.consumedService === 'Microsoft.CognitiveServices';
        const isOurResource = !resourceId || item.properties.instanceName.includes('obsidian-tts');
        const isCurrentMonth = item.properties.date.startsWith(currentMonth);
        return isCognitiveServices && isOurResource && isCurrentMonth;
      });

      // Blob Storage 필터링 (더 넓은 범위로 검색)
      const allStorageServices = new Set();
      consumptionData.value.forEach(item => {
        if (item.properties.consumedService &&
            item.properties.consumedService.toLowerCase().includes('storage')) {
          allStorageServices.add(item.properties.consumedService);
        }
      });

      if (allStorageServices.size > 0) {
        context.log('발견된 Storage 서비스 타입:', Array.from(allStorageServices));
      }

      const blobStorageUsage = consumptionData.value.filter(item => {
        const isStorage = item.properties.consumedService === 'Microsoft.Storage' ||
                          item.properties.consumedService === 'microsoft.storage';
        const isCurrentMonth = item.properties.date.startsWith(currentMonth);

        // 리소스 그룹이나 인스턴스 이름으로 필터링 (더 넓은 범위)
        const isOurResource = !item.properties.instanceName ||
                              item.properties.instanceName.toLowerCase().includes('obsidian') ||
                              item.properties.instanceName.toLowerCase().includes('tts') ||
                              (item.properties.resourceGroup &&
                               item.properties.resourceGroup.toLowerCase().includes('speech'));

        return isStorage && isCurrentMonth && isOurResource;
      });

      context.log(`Blob Storage 사용량 항목 수: ${blobStorageUsage.length}`);

      // Aggregate Cognitive Services usage by date and SKU
      const dailyUsage = {};
      let freeCharacters = 0;
      let paidCharacters = 0;
      let freeCost = 0;
      let paidCost = 0;

      cognitiveServicesUsage.forEach(item => {
        const date = item.properties.date.split('T')[0];
        const quantity = item.properties.quantity; // in millions
        const characters = Math.floor(quantity * 1000000);
        const cost = parseFloat(item.properties.cost || 0);
        const meterName = item.properties.meterName || '';

        // F0 (무료) vs S0 (유료) 구분
        // F0는 무료 티어이므로 cost가 0이거나, meterName에 "Free" 포함
        const isFree = cost === 0 || meterName.toLowerCase().includes('free') ||
                       meterName.includes('F0');

        if (!dailyUsage[date]) {
          dailyUsage[date] = { free: 0, paid: 0 };
        }

        if (isFree) {
          dailyUsage[date].free += characters;
          freeCharacters += characters;
          freeCost += cost;
        } else {
          dailyUsage[date].paid += characters;
          paidCharacters += characters;
          paidCost += cost;
        }

        context.log(`TTS Usage: ${date} ${isFree ? 'F0' : 'S0'} ${characters} chars, $${cost.toFixed(4)}`);
      });

      // Aggregate Blob Storage usage
      let blobStorageBytes = 0;
      let blobStorageCost = 0;
      const blobDailyUsage = {};

      blobStorageUsage.forEach(item => {
        const date = item.properties.date.split('T')[0];
        const quantity = item.properties.quantity; // 단위는 meterName에 따라 다름
        const cost = parseFloat(item.properties.cost || 0);
        const meterName = item.properties.meterName || '';

        // Blob Storage는 다양한 미터가 있음 (Storage, Transactions, etc.)
        // 여기서는 Storage 관련만 추적
        if (meterName.toLowerCase().includes('storage') ||
            meterName.toLowerCase().includes('capacity')) {

          if (!blobDailyUsage[date]) {
            blobDailyUsage[date] = { quantity: 0, cost: 0 };
          }

          blobDailyUsage[date].quantity += quantity;
          blobDailyUsage[date].cost += cost;
          blobStorageBytes += quantity * (1024 * 1024 * 1024); // GB to bytes (근사치)
          blobStorageCost += cost;

          context.log(`Blob Storage: ${date} ${quantity.toFixed(2)} GB, $${cost.toFixed(4)}`);
        }
      });

      // Calculate free tier status
      const freeLimit = 500000;
      const totalCharacters = freeCharacters + paidCharacters;
      const freePercentage = ((freeCharacters / freeLimit) * 100).toFixed(2);
      const freeRemaining = Math.max(0, freeLimit - freeCharacters);
      const totalCost = freeCost + paidCost + blobStorageCost;

      context.log(`Azure Consumption API Summary:`);
      context.log(`  TTS Free (F0): ${freeCharacters} chars, $${freeCost.toFixed(4)}`);
      context.log(`  TTS Paid (S0): ${paidCharacters} chars, $${paidCost.toFixed(4)}`);
      context.log(`  Blob Storage: ${(blobStorageBytes / (1024*1024*1024)).toFixed(2)} GB, $${blobStorageCost.toFixed(4)}`);
      context.log(`  Total Cost: $${totalCost.toFixed(4)}`);

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          source: 'azure-consumption-api',

          // TTS Usage
          totalChars: totalCharacters,
          freeChars: freeCharacters,
          paidChars: paidCharacters,

          // Costs
          freeCost: parseFloat(freeCost.toFixed(4)),
          paidCost: parseFloat(paidCost.toFixed(4)),
          ttsTotalCost: parseFloat((freeCost + paidCost).toFixed(4)),

          // Blob Storage
          blobStorageBytes: blobStorageBytes,
          blobStorageGB: parseFloat((blobStorageBytes / (1024*1024*1024)).toFixed(2)),
          blobStorageCost: parseFloat(blobStorageCost.toFixed(4)),
          blobDailyUsage: blobDailyUsage,

          // Total Cost
          totalCost: parseFloat(totalCost.toFixed(4)),

          // Free tier status
          currentMonth: currentMonth,
          lastUpdated: new Date().toISOString(),
          freeLimit: freeLimit,
          freePercentage: freePercentage,
          freeRemaining: freeRemaining,

          // Daily breakdown
          dailyUsage: dailyUsage,

          // Metadata
          dataDelay: '24-48 hours',
          note: 'Azure Consumption API has 24-48 hour delay. Today\'s usage may not be reflected yet.',
          currency: 'USD',

          // Backward compatibility
          percentage: freePercentage,
          remaining: freeRemaining
        }
      };

    } catch (error) {
      context.error('Azure usage query error:', error);

      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get Azure usage',
          details: error.message,
          hint: 'Make sure Managed Identity is enabled and has Reader role on the subscription'
        }
      };
    }
  }
});
