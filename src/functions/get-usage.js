/**
 * Azure Function: Get Speech Service Usage from Azure Monitor
 */

const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { MetricsQueryClient } = require('@azure/monitor-query');

app.http('get-usage', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'usage',
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

    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
    const speechResourceName = process.env.AZURE_SPEECH_RESOURCE_NAME;

    if (!subscriptionId || !resourceGroup || !speechResourceName) {
      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Configuration missing',
          details: 'Environment variables not set'
        }
      };
    }

    try {
      const credential = new DefaultAzureCredential();
      const metricsClient = new MetricsQueryClient(credential);

      const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${speechResourceName}`;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      context.log(`Querying metrics from ${startOfMonth.toISOString()} to ${now.toISOString()}`);

      // ISO 8601 duration format: startTime/endTime
      const timespan = `${startOfMonth.toISOString()}/${now.toISOString()}`;

      const response = await metricsClient.queryResource(
        resourceId,
        ['CharactersTranslated'],
        {
          timespan: timespan,
          granularity: 'PT1H',
          aggregations: ['Total']
        }
      );

      let totalChars = 0;

      if (response.metrics && response.metrics.length > 0) {
        const metric = response.metrics[0];
        if (metric.timeseries && metric.timeseries.length > 0) {
          for (const timeseries of metric.timeseries) {
            if (timeseries.data) {
              for (const dataPoint of timeseries.data) {
                if (dataPoint.total !== undefined && dataPoint.total !== null) {
                  totalChars += dataPoint.total;
                }
              }
            }
          }
        }
      }

      context.log(`Azure Monitor reports: ${totalChars} total characters used this month`);

      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const freeLimit = 500000;

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          source: 'azure-monitor',
          totalChars: Math.round(totalChars),
          currentMonth: currentMonth,
          lastUpdated: now.toISOString(),
          freeLimit: freeLimit,
          percentage: ((totalChars / freeLimit) * 100).toFixed(2),
          remaining: Math.max(0, freeLimit - Math.round(totalChars))
        }
      };

    } catch (error) {
      context.error('Azure Monitor query error:', error);

      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to query Azure Monitor',
          details: error.message,
          stack: error.stack
        }
      };
    }
  }
});
