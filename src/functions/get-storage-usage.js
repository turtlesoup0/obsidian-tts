/**
 * Azure Function: Get Real-time Blob Storage Usage
 *
 * Consumption API에서는 Storage 사용량이 지연되거나 소액이라 안 보일 수 있으므로
 * 직접 Blob Storage API로 실시간 사용량을 조회합니다.
 */

const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

app.http('get-storage-usage', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'storage-usage',
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
      const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!storageConnectionString) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');
      }

      const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
      const containerClient = blobServiceClient.getContainerClient('tts-cache');

      let totalBytes = 0;
      let blobCount = 0;

      // 모든 blob을 순회하며 크기 합산
      for await (const blob of containerClient.listBlobsFlat()) {
        totalBytes += blob.properties.contentLength || 0;
        blobCount++;
      }

      const totalMB = totalBytes / (1024 * 1024);
      const totalGB = totalBytes / (1024 * 1024 * 1024);

      // 예상 비용 계산
      // Azure Blob Storage 비용: Hot tier ~$0.0184/GB/month (한국 중부)
      const estimatedMonthlyCost = totalGB * 0.0184;

      context.log(`Blob Storage: ${blobCount} blobs, ${totalMB.toFixed(2)} MB, estimated $${estimatedMonthlyCost.toFixed(4)}/month`);

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          source: 'blob-storage-api',
          blobCount: blobCount,
          totalBytes: totalBytes,
          totalMB: parseFloat(totalMB.toFixed(2)),
          totalGB: parseFloat(totalGB.toFixed(4)),
          estimatedMonthlyCost: parseFloat(estimatedMonthlyCost.toFixed(4)),
          currency: 'USD',
          note: 'Real-time data from Blob Storage API. Cost is estimated based on Hot tier pricing.',
          lastUpdated: new Date().toISOString()
        }
      };

    } catch (error) {
      context.error('Blob Storage usage query error:', error);

      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get Blob Storage usage',
          details: error.message
        }
      };
    }
  }
});
