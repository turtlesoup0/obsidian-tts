/**
 * Azure TTS Service wrapper (타임아웃 및 리소스 정리 개선)
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');

// Azure TTS 타임아웃 (30초)
const TTS_TIMEOUT = 30000;

async function synthesizeSpeech(ssml, subscriptionKey, region) {
  return new Promise((resolve, reject) => {
    let synthesizer = null;
    let timeoutId = null;
    let isCompleted = false;

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

      synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      // 타임아웃 설정
      timeoutId = setTimeout(() => {
        if (!isCompleted && synthesizer) {
          isCompleted = true;
          synthesizer.close();
          reject(new Error('Speech synthesis timeout'));
        }
      }, TTS_TIMEOUT);

      synthesizer.speakSsmlAsync(
        ssml,
        result => {
          if (isCompleted) return; // 이미 타임아웃된 경우 무시

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = Buffer.from(result.audioData);
            resolve(audioData);
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
            reject(new Error(`Speech synthesis canceled: ${cancellation.errorDetails}`));
          } else {
            reject(new Error(`Speech synthesis failed: ${result.reason}`));
          }
        },
        error => {
          if (isCompleted) return; // 이미 타임아웃된 경우 무시

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );
    } catch (error) {
      isCompleted = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (synthesizer) {
        synthesizer.close();
        synthesizer = null;
      }
      reject(new Error(`Azure TTS initialization error: ${error.message}`));
    }
  });
}

async function getAvailableVoices(subscriptionKey, region, locale = 'ko-KR') {
  return new Promise((resolve, reject) => {
    let synthesizer = null;
    let timeoutId = null;
    let isCompleted = false;

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      // 타임아웃 설정 (10초)
      timeoutId = setTimeout(() => {
        if (!isCompleted && synthesizer) {
          isCompleted = true;
          synthesizer.close();
          reject(new Error('Voice list retrieval timeout'));
        }
      }, 10000);

      synthesizer.getVoicesAsync(
        result => {
          if (isCompleted) return;

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
            const voices = result.voices
              .filter(v => v.locale.startsWith(locale))
              .map(v => ({
                name: v.shortName,
                displayName: v.localName,
                gender: v.gender,
                locale: v.locale
              }));
            resolve(voices);
          } else {
            reject(new Error(`Failed to retrieve voices: ${result.reason}`));
          }
        },
        error => {
          if (isCompleted) return;

          isCompleted = true;
          clearTimeout(timeoutId);

          // 리소스 정리
          if (synthesizer) {
            synthesizer.close();
            synthesizer = null;
          }

          reject(new Error(`Voice retrieval error: ${error}`));
        }
      );
    } catch (error) {
      isCompleted = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (synthesizer) {
        synthesizer.close();
        synthesizer = null;
      }
      reject(new Error(`Azure TTS initialization error: ${error.message}`));
    }
  });
}

module.exports = {
  synthesizeSpeech,
  getAvailableVoices
};
