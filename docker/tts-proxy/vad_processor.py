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

        # MP3 → 16kHz mono AudioSegment → torch 텐서
        audio_segment = AudioSegment.from_mp3(io.BytesIO(audio_data))
        audio_segment = audio_segment.set_frame_rate(VAD_SAMPLE_RATE).set_channels(1)
        waveform = _pydub_to_tensor(audio_segment)

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

        # 첫 음성 시작 ~ 마지막 음성 끝 (패딩 포함)
        padding_samples = int(VAD_PADDING_MS * VAD_SAMPLE_RATE / 1000)
        start_sample = max(0, speech_timestamps[0]['start'] - padding_samples)
        end_sample = min(waveform.shape[1], speech_timestamps[-1]['end'] + padding_samples)

        trimmed_waveform = waveform[:, start_sample:end_sample]

        # 트리밍 결과 로깅
        original_duration_ms = waveform.shape[1] * 1000 / VAD_SAMPLE_RATE
        trimmed_duration_ms = trimmed_waveform.shape[1] * 1000 / VAD_SAMPLE_RATE
        removed_ms = original_duration_ms - trimmed_duration_ms
        logger.info(
            f"VAD trim: {original_duration_ms:.0f}ms → {trimmed_duration_ms:.0f}ms "
            f"(removed {removed_ms:.0f}ms silence)"
        )

        # torch 텐서 → pydub → MP3 재인코딩
        trimmed_segment = _tensor_to_pydub(trimmed_waveform, VAD_SAMPLE_RATE)
        output_buffer = io.BytesIO()
        trimmed_segment.export(output_buffer, format='mp3', bitrate='192k')
        return output_buffer.getvalue()

    except Exception as e:
        logger.error(f"VAD trim failed, returning original audio: {e}")
        return audio_data
