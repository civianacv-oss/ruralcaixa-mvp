# app/services/classificador.py
import httpx, os, json

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

SISTEMA = """Você é um assistente contábil para produtor rural brasileiro.
Analise o texto e extraia um lançamento financeiro no formato JSON.
Responda APENAS com JSON, sem explicações.

Formato:
{
  "descricao": "texto resumido",
  "tipo": "receita" | "despesa",
  "valor": 0.00,
  "categoria": "uma dessas: venda_produto | servico_prestado | custeio | manutencao | combustivel | salario | investimento | outros",
  "data": "YYYY-MM-DD ou null se não mencionada",
  "confianca": "alta" | "media" | "baixa"
}
"""

async def classificar(texto: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 300,
                "system": SISTEMA,
                "messages": [{"role": "user", "content": texto}]
            }
        )
        texto_resposta = r.json()["content"][0]["text"]
        return json.loads(texto_resposta)