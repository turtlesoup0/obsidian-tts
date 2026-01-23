/**
 * Azure Blob Storage 공통 유틸리티
 *
 * 여러 Azure Functions에서 공통으로 사용하는 Blob Storage 헬퍼
 */

const { BlobServiceClient } = require('@azure/storage-blob');

/**
 * Blob Service Client 인스턴스 생성
 *
 * @returns {BlobServiceClient} Blob Storage 클라이언트
 * @throws {Error} 연결 문자열이 설정되지 않은 경우
 */
function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');
  }

  return BlobServiceClient.fromConnectionString(connectionString);
}

/**
 * TTS 캐시 컨테이너 클라이언트 가져오기
 *
 * @returns {ContainerClient} 'tts-cache' 컨테이너 클라이언트
 */
function getTTSCacheContainer() {
  const blobServiceClient = getBlobServiceClient();
  return blobServiceClient.getContainerClient('tts-cache');
}

module.exports = {
  getBlobServiceClient,
  getTTSCacheContainer
};
