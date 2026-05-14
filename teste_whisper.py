import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI

async def main():
    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    # Cria um arquivo de texto como teste da conexao
    result = await client.models.list()
    modelos = [m.id for m in result.data if "whisper" in m.id]
    print("Modelos Whisper disponiveis:", modelos)
    print("Conexao com OpenAI: OK!")

asyncio.run(main())