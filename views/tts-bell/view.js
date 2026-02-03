// ============================================
// tts-bell: 토픽 변경 시 종소리 효과음
// 의존성: tts-core
// input: { config }
// ============================================

// 가드 패턴: 중복 로드 방지
if (!window.ttsBellManager) {

    // ============================================
    // 종소리 설정
    // ============================================
    window.ttsBellConfig = {
        enabled: true,                    // 종소리 활성화/비활성화
        volume: 0.3,                      // 볼륨 (0.0 ~ 1.0)
        duration: 0.8,                    // 종소리 지속 시간 (초)
        frequencies: [523.25, 659.25, 783.99], // 도-미-솔 (C5, E5, G5)
        decay: 0.5,                       // 감쇠율
        useCustomAudio: false,            // 사용자 제공 오디오 사용 여부
        customAudioUrl: null              // 사용자 제공 오디오 URL
    };

    // ============================================
    // Web Audio API로 종소리 합성 (Oscillator)
    // ============================================
    window.synthesizeBellSound = async function() {
        if (!window.ttsBellConfig.enabled) return null;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = audioContext.sampleRate;
            const duration = window.ttsBellConfig.duration;
            const totalSamples = Math.floor(sampleRate * duration);

            // 오디오 버퍼 생성 (스테레오)
            const audioBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);
            const leftChannel = audioBuffer.getChannelData(0);
            const rightChannel = audioBuffer.getChannelData(1);

            const volume = window.ttsBellConfig.volume;
            const frequencies = window.ttsBellConfig.frequencies;
            const decay = window.ttsBellConfig.decay;

            // 각 주파수에 대해 합성
            for (let i = 0; i < totalSamples; i++) {
                const t = i / sampleRate;
                let sample = 0;

                // 여러 주파수를 합성하여 종소리 톤 생성
                for (let j = 0; j < frequencies.length; j++) {
                    const freq = frequencies[j];
                    // 지수 감쇠 적용
                    const amplitude = Math.exp(-decay * t * 3);
                    // 사인파 합성
                    sample += Math.sin(2 * Math.PI * freq * t) * amplitude;
                }

                // 기본 하모닉 추가 (풍부한 소리)
                sample += Math.sin(2 * Math.PI * frequencies[0] * 2 * t) * Math.exp(-decay * t * 4) * 0.3;

                // 정규화 및 볼륨 적용
                sample = sample / frequencies.length * volume;

                leftChannel[i] = sample;
                rightChannel[i] = sample;
            }

            window.ttsLog('🔔 종소리 합성 완료');
            return audioBuffer;

        } catch (error) {
            console.error('❌ 종소리 합성 실패:', error);
            return null;
        }
    };

    // ============================================
    // 사용자 제공 오디오 파일 로드
    // ============================================
    window.loadCustomBellAudio = async function() {
        if (!window.ttsBellConfig.useCustomAudio || !window.ttsBellConfig.customAudioUrl) {
            return null;
        }

        try {
            const response = await fetch(window.ttsBellConfig.customAudioUrl);
            const arrayBuffer = await response.arrayBuffer();

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            window.ttsLog('🔔 사용자 종소리 로드 완료');
            return audioBuffer;

        } catch (error) {
            console.error('❌ 사용자 종소리 로드 실패:', error);
            // 실패 시 합성 종소리로 폴백
            return window.synthesizeBellSound();
        }
    };

    // ============================================
    // 오디오 버퍼를 Blob으로 변환
    // ============================================
    window.audioBufferToBlob = async function(audioBuffer) {
        if (!audioBuffer) return null;

        try {
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );

            const bufferSource = offlineContext.createBufferSource();
            bufferSource.buffer = audioBuffer;
            bufferSource.connect(offlineContext.destination);
            bufferSource.start();

            const renderedBuffer = await offlineContext.startRendering();

            // WAV 파일로 인코딩
            const wavBlob = window.bufferToWave(renderedBuffer, renderedBuffer.length);
            return wavBlob;

        } catch (error) {
            console.error('❌ 오디오 버퍼 변환 실패:', error);
            return null;
        }
    };

    // ============================================
    // AudioBuffer를 WAV Blob으로 변환
    // ============================================
    window.bufferToWave = function(abuffer, len) {
        const numOfChan = abuffer.numberOfChannels;
        const length = len * numOfChan * 2 + 44;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        // WAV 헤더 작성
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit (hardcoded in this example)

        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        // 인터리브된 데이터 작성
        for (i = 0; i < abuffer.numberOfChannels; i++) {
            channels.push(abuffer.getChannelData(i));
        }

        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return new Blob([buffer], { type: 'audio/wav' });

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    };

    // ============================================
    // 종소리 재생 (테스트용)
    // ============================================
    window.playBellSound = async function() {
        try {
            let audioBuffer = await window.loadCustomBellAudio();

            if (!audioBuffer) {
                audioBuffer = await window.synthesizeBellSound();
            }

            if (!audioBuffer) {
                throw new Error('종소리 생성 실패');
            }

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();

            window.ttsLog('🔔 종소리 재생 완료');

        } catch (error) {
            console.error('❌ 종소리 재생 실패:', error);
        }
    };

    // ============================================
    // TTS 재생 전 종소리 재생 (연속 재생)
    // ============================================
    window.playTTSWithBellSequential = async function(audioBlob, audioElement) {
        if (!window.ttsBellConfig.enabled) {
            // 종소리 비활성화 시 바로 TTS 재생
            audioElement.src = URL.createObjectURL(audioBlob);
            await audioElement.play();
            return;
        }

        try {
            window.ttsLog('🔔 종소리 + TTS 연속 재생 시작');

            // 1. 종소리 재생
            const bellBuffer = await window.synthesizeBellSound();
            if (!bellBuffer) {
                throw new Error('종소리 생성 실패');
            }

            const bellContext = new (window.AudioContext || window.webkitAudioContext)();
            const bellSource = bellContext.createBufferSource();
            bellSource.buffer = bellBuffer;
            bellSource.connect(bellContext.destination);

            // 종소리 재생
            await new Promise((resolve, reject) => {
                bellSource.onended = resolve;
                bellSource.onerror = reject;
                bellSource.start();
            });

            // 2. 종소리 종료 후 TTS 재생
            window.ttsLog('🔔 종소리 재생 완료, TTS 재생 시작');
            audioElement.src = URL.createObjectURL(audioBlob);
            // 사용자 설정 재생속도 유지
            audioElement.playbackRate = window.azureTTSReader?.playbackRate || 1.0;
            await audioElement.play();

            window.ttsLog('✅ 종소리 + TTS 연속 재생 완료');

        } catch (error) {
            console.error('❌ 종소리 연속 재생 실패:', error);
            // 실패 시 TTS만 재생
            audioElement.src = URL.createObjectURL(audioBlob);
            // 사용자 설정 재생속도 유지
            audioElement.playbackRate = window.azureTTSReader?.playbackRate || 1.0;
            await audioElement.play();
        }
    };

    // ============================================
    // TTS용 종소리가 포함된 오디오 생성
    // ============================================
    window.createTTSWithBell = async function(ttsBlob) {
        if (!window.ttsBellConfig.enabled) {
            return ttsBlob;
        }

        try {
            window.ttsLog('🔔 종소리 + TTS 병합 시작');

            // 1. 종소리 오디오 버퍼 로드
            let bellBuffer = await window.loadCustomBellAudio();
            if (!bellBuffer) {
                bellBuffer = await window.synthesizeBellSound();
            }

            if (!bellBuffer) {
                window.ttsLog('⚠️ 종소리 생성 실패, TTS만 재생');
                return ttsBlob;
            }

            // 2. TTS 오디오 디코딩
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const ttsArrayBuffer = await ttsBlob.arrayBuffer();
            const ttsBuffer = await audioContext.decodeAudioData(ttsArrayBuffer);

            // 3. 두 오디오 버퍼 병합
            const totalLength = bellBuffer.length + ttsBuffer.length;
            const numberOfChannels = Math.max(bellBuffer.numberOfChannels, ttsBuffer.numberOfChannels);
            const sampleRate = Math.max(bellBuffer.sampleRate, ttsBuffer.sampleRate);

            const offlineContext = new OfflineAudioContext(numberOfChannels, totalLength, sampleRate);

            // 종소리 소스 생성
            const bellSource = offlineContext.createBufferSource();
            bellSource.buffer = bellBuffer;
            bellSource.connect(offlineContext.destination);
            bellSource.start(0);

            // TTS 소스 생성 (종소리 직후 시작)
            const ttsSource = offlineContext.createBufferSource();
            ttsSource.buffer = ttsBuffer;
            ttsSource.connect(offlineContext.destination);
            ttsSource.start(bellBuffer.duration);

            // 렌더링
            const mergedBuffer = await offlineContext.startRendering();

            // 4. WAV Blob으로 변환
            const wavBlob = window.bufferToWave(mergedBuffer, mergedBuffer.length);

            window.ttsLog(`🔔 종소리 + TTS 병합 완료 (${ttsBlob.size} → ${wavBlob.size} bytes)`);
            return wavBlob;

        } catch (error) {
            console.error('❌ 종소리 병합 실패:', error);
            window.ttsLog('⚠️ 종소리 병합 실패, TTS만 재생');
            return ttsBlob;
        }
    };

    // ============================================
    // 설정 함수들
    // ============================================
    window.setBellEnabled = function(enabled) {
        window.ttsBellConfig.enabled = enabled;
        localStorage.setItem('ttsBellEnabled', enabled.toString());
        window.ttsLog(`🔔 종소리 ${enabled ? '활성화' : '비활성화'}`);
    };

    window.setBellVolume = function(volume) {
        window.ttsBellConfig.volume = Math.max(0, Math.min(1, volume));
        localStorage.setItem('ttsBellVolume', volume.toString());
        window.ttsLog(`🔔 종소리 볼륨: ${volume}`);
    };

    // ============================================
    // 설정 복원
    // ============================================
    const savedEnabled = localStorage.getItem('ttsBellEnabled');
    if (savedEnabled !== null) {
        window.ttsBellConfig.enabled = savedEnabled === 'true';
    }

    const savedVolume = localStorage.getItem('ttsBellVolume');
    if (savedVolume !== null) {
        window.ttsBellConfig.volume = parseFloat(savedVolume);
    }

    window.ttsLog('✅ [tts-bell] 모듈 로드 완료');
}
