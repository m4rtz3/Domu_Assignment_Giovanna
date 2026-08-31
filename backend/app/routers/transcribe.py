"""
Optional: transcribe an uploaded call recording so it can be dropped straight
into the Script -> Agent flow instead of typed out by hand.

Runs locally via faster-whisper -- no API key, no per-call cost. Not
installed by default (see backend/requirements-local.txt) since the model
and its dependencies are too large for the Vercel deploy; the endpoint
degrades to a 503 if the package isn't available, rather than crashing the
whole app. See SCOPE_OF_WORK.md for how this would run in production.
"""
import logging
import tempfile
import wave
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import WHISPER_MODEL_SIZE
from app.schemas import TranscriptionResponse

logger = logging.getLogger("domu.transcribe")

router = APIRouter(prefix="/api/transcribe", tags=["transcribe"])

MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # one call recording, generously

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info("Loading Whisper model (%s)...", WHISPER_MODEL_SIZE)
        _model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def _split_speaker_channels(path: str) -> list[np.ndarray] | None:
    """
    Many call-center recordings put each speaker on its own audio channel
    (agent on one, caller on the other) instead of mixing them down to mono.
    If this file looks like that -- 16kHz 16-bit stereo -- split it into two
    per-speaker channels faster-whisper can transcribe separately. Anything
    else (mono, different sample rate/bit depth) returns None so the caller
    falls back to a single, unlabeled transcript instead.
    """
    try:
        with wave.open(path, "rb") as w:
            if w.getnchannels() != 2 or w.getsampwidth() != 2 or w.getframerate() != 16000:
                return None
            raw = w.readframes(w.getnframes())
    except wave.Error:
        return None

    samples = np.frombuffer(raw, dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32768.0
    return [samples[:, 0], samples[:, 1]]


def _detect_agent_channel(channels: list[np.ndarray], sample_rate: int = 16000) -> int:
    """The agent always speaks first (the greeting/compliance disclosure comes before
    anything else), so whichever channel has more raw audio energy in the opening few
    seconds is the agent's. Using raw energy rather than Whisper's own segment
    timestamps avoids being thrown off by short hallucinated fragments Whisper
    sometimes produces in near-silent audio."""
    window = int(sample_rate * 6)
    energies = [np.sqrt(np.mean(ch[:window] ** 2)) for ch in channels]
    return int(np.argmax(energies))


def _transcribe_with_speakers(model, channels: list[np.ndarray]) -> str:
    """Transcribes each channel separately, then interleaves the two by timestamp
    into speaker-labeled turns."""
    agent_channel = _detect_agent_channel(channels)
    labels = {agent_channel: "Agent", 1 - agent_channel: "Caller"}

    all_segments = []
    for channel_index, samples in enumerate(channels):
        segments, _info = model.transcribe(samples, language="en", vad_filter=True)
        for seg in segments:
            text = seg.text.strip()
            if text:
                all_segments.append((seg.start, channel_index, text))

    if not all_segments:
        return ""

    all_segments.sort(key=lambda s: s[0])

    turns: list[tuple[int, str]] = []
    for _start, channel_index, text in all_segments:
        if turns and turns[-1][0] == channel_index:
            turns[-1] = (channel_index, turns[-1][1] + " " + text)
        else:
            turns.append((channel_index, text))

    return "\n\n".join(f"{labels[channel_index]}: {text}" for channel_index, text in turns)


@router.post("", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile) -> TranscriptionResponse:
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 30MB).")

    try:
        model = _get_model()
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Transcription isn't installed in this environment. Run "
                "`pip install -r requirements-local.txt` and try again locally."
            ),
        )

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        channels = _split_speaker_channels(tmp_path)
        if channels:
            transcript = _transcribe_with_speakers(model, channels)
        else:
            segments, _info = model.transcribe(tmp_path, vad_filter=True)
            transcript = " ".join(segment.text.strip() for segment in segments)
    except Exception as e:
        logger.error("Transcription failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not transcribe this file.")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return TranscriptionResponse(transcript=transcript.strip())
