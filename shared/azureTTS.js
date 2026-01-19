/**
 * Azure TTS Service wrapper
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');

async function synthesizeSpeech(ssml, subscriptionKey, region) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      synthesizer.speakSsmlAsync(
        ssml,
        result => {
          synthesizer.close();

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
          synthesizer.close();
          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );
    } catch (error) {
      reject(new Error(`Azure TTS initialization error: ${error.message}`));
    }
  });
}

async function getAvailableVoices(subscriptionKey, region, locale = 'ko-KR') {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      synthesizer.getVoicesAsync(
        result => {
          synthesizer.close();

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
          synthesizer.close();
          reject(new Error(`Voice retrieval error: ${error}`));
        }
      );
    } catch (error) {
      reject(new Error(`Azure TTS initialization error: ${error.message}`));
    }
  });
}

module.exports = {
  synthesizeSpeech,
  getAvailableVoices
};
