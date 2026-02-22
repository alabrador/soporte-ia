from pathlib import Path

import requests

from .settings import settings


def transcribe_audio_file(file_path: str) -> str:
    audio_path = Path(file_path)
    if not audio_path.exists():
        raise FileNotFoundError('Audio file not found for transcription.')

    with open(audio_path, 'rb') as audio_file:
        files = {
            settings.whisper_audio_field: (
                audio_path.name,
                audio_file,
                'application/octet-stream',
            )
        }
        response = requests.post(settings.whisper_http_url, files=files, timeout=120)

    if response.status_code >= 400:
        raise RuntimeError(f'Whisper HTTP error: {response.status_code} - {response.text}')

    payload = response.json()
    text = (payload.get('text') or '').strip()
    if not text:
        raise RuntimeError('Whisper no devolvió texto transcrito.')

    return text
