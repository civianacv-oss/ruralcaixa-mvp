import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def transcrever_audio(audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
    extensoes = {
        "audio/ogg": "audio.ogg",
        "audio/mpeg": "audio.mp3",
        "audio/mp4": "audio.mp4",
        "audio/webm": "audio.webm",
    }
    filename = extensoes.get(mime_type, "audio.ogg")

    transcricao = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes, mime_type),
        language="pt",
    )
    return transcricao.text
