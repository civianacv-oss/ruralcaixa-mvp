# app/services/groq_stt.py
import httpx
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

async def transcrever_audio(audio_bytes: bytes, filename: str = "audio.ogg") -> str:
    """Envia áudio para Groq Whisper e retorna transcrição."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": (filename, audio_bytes, "audio/ogg")},
            data={"model": "whisper-large-v3-turbo", "language": "pt"},
        )
        if response.status_code >= 400:
            print(f"Groq STT erro {response.status_code}: {response.text} | bytes recebidos: {len(audio_bytes)}")
        response.raise_for_status()
        return response.json()["text"]