"""
Silero VAD 기반 무음 트리밍 모듈

TTS 출력 오디오의 앞뒤 불필요한 무음/숨소리를 자동 제거합니다.
"""
import io
import os
import struct
import logging

import torch
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# 설정
VAD_ENABLED = os.environ.get('VAD_ENABLED', 'true').lower() == 'true'
VAD_PADDING_MS = int(os.environ.get('VAD_PADDING_MS', '100'))
VAD_SAMPLE_RATE = 16000

_vad_model = None
_vad_utils = None


def get_vad_model():
    """Silero VAD 모델 lazy loading"""
    global _vad_model, _vad_utils
    if _vad_model is None:
        logger.info("Loading Silero VAD model...")
        model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            trust_repo=True
        )
        _vad_model = model
        _vad_utils = utils
        logger.info("Silero VAD model loaded")
    return _vad_model, _vad_utils


def is_loaded() -> bool:
    """VAD 모델이 로드되었는지 여부"""
    return _vad_model is not None


def preload():
    """서버 시작 시 VAD 모델을 미리 로드 (첫 요청 지연 방지)"""
    if VAD_ENABLED and not is_loaded():
        logger.info("Preloading VAD model at startup...")
        get_vad_model()
        logger.info("VAD model preloaded successfully")


def _pydub_to_tensor(audio_segment: AudioSegment) -> torch.Tensor:
    """pydub AudioSegment → torch float32 텐서 [1, samples]"""
    samples = audio_segment.get_array_of_samples()
    max_val = float(2 ** (audio_segment.sample_width * 8 - 1))
    tensor = torch.FloatTensor(list(samples)) / max_val
    return tensor.unsqueeze(0)


def _tensor_to_pydub(tensor: torch.Tensor, sample_rate: int) -> AudioSegment:
    """torch float32 텐서 [1, samples] → pydub AudioSegment (16-bit mono)"""
    samples = (tensor.squeeze().clamp(-1, 1) * 32767).to(torch.int16)
    raw_data = struct.pack(f'<{len(samples)}h', *samples.tolist())
    return AudioSegment(
        data=raw_data,
        sample_width=2,
        frame_rate=sample_rate,
        channels=1
    )


def trim_silence(audio_data: bytes) -> bytes:
    """
    Silero VAD로 앞뒤 무음/숨소리를 트리밍합니다.

    Args:
        audio_data: MP3 오디오 바이너리

    Returns:
        트리밍된 MP3 오디오 바이너리
    """
    if not VAD_ENABLED:
        return audio_data

    try:
        model, utils = get_vad_model()
        get_speech_timestamps = utils[0]

        # MP3 → 원본 AudioSegment 보존
        original_segment = AudioSegment.from_mp3(io.BytesIO(audio_data))
        original_rate = original_segment.frame_rate

        # VAD 분석용: 16kHz mono로 다운샘플링 (분석만 사용, 출력에는 사용하지 않음)
        vad_segment = original_segment.set_frame_rate(VAD_SAMPLE_RATE).set_channels(1)
        waveform = _pydub_to_tensor(vad_segment)

        # VAD로 음성 구간 감지
        speech_timestamps = get_speech_timestamps(
            waveform.squeeze(),
            model,
            sampling_rate=VAD_SAMPLE_RATE,
            threshold=0.3,
            min_speech_duration_ms=50,
        )

        if not speech_timestamps:
            logger.warning("VAD: No speech detected, returning original audio")
            return audio_data

        # VAD 타임스탬프(16kHz 기준)를 밀리초로 변환 → 원본 AudioSegment에서 트리밍
        padding_ms = VAD_PADDING_MS
        start_ms = max(0, int(speech_timestamps[0]['start'] * 1000 / VAD_SAMPLE_RATE) - padding_ms)
        end_ms = min(len(original_segment), int(speech_timestamps[-1]['end'] * 1000 / VAD_SAMPLE_RATE) + padding_ms)

        trimmed_segment = original_segment[start_ms:end_ms]

        # 트리밍 결과 로깅
        original_duration_ms = len(original_segment)
        trimmed_duration_ms = len(trimmed_segment)
        removed_ms = original_duration_ms - trimmed_duration_ms
        logger.info(
            f"VAD trim: {original_duration_ms}ms → {trimmed_duration_ms}ms "
            f"(removed {removed_ms}ms silence)"
        )

        # 원본 포맷 그대로 MP3 재인코딩 (원본 샘플레이트 유지)
        output_buffer = io.BytesIO()
        trimmed_segment.export(output_buffer, format='mp3', bitrate='192k')
        return output_buffer.getvalue()

    except Exception as e:
        logger.error(f"VAD trim failed, returning original audio: {e}")
        return audio_data
