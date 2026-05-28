"""
RuralCaixa — services/ovino_ia.py
Classifica mensagens WhatsApp (texto / transcrição de áudio) em eventos
do módulo ovino usando Claude claude-sonnet-4-20250514 via Anthropic API.

Compatível com a arquitetura atual: FastAPI + PostgreSQL (asyncpg/SQLAlchemy).
"""

import os
import json
import re
import logging
from datetime import date
from typing import Optional

import anthropic

logger = logging.getLogger(__name__)

# ─── Cliente Anthropic ────────────────────────────────────────────────────────
_client: Optional[anthropic.AsyncAnthropic] = None

def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"]
        )
    return _client


# ─── Prompt de classificação ─────────────────────────────────────────────────
SYSTEM_PROMPT = """Você é o assistente de campo do RuralCaixa, especializado em
criação de ovinos de corte no Brasil. Sua tarefa é extrair eventos zootécnicos
de mensagens enviadas pelo produtor via WhatsApp (texto ou transcrição de áudio).

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto extra.

Formato de resposta:
{
  "intent": "<uma das intents abaixo>",
  "confianca": <0.0 a 1.0>,
  "entidades": { <campos específicos da intent> },
  "resumo": "<frase curta confirmando o que foi registrado>"
}

Intents disponíveis e seus campos obrigatórios:
- pesagem        → brinco (str), peso_kg (float), motivo? (str)
- vacinacao      → produto (str), lote? (str), brinco? (str), dose_ml? (float)
- vermifugacao   → produto (str), lote? (str), brinco? (str), dose_ml? (float), via? (str)
- famacha        → brinco (str), escore (int 1-5)
- parto          → brinco_matriz (str), cordeiros_vivos (int), cordeiros_mortos? (int)
- monta          → brinco_matriz (str), brinco_reprodutor? (str)
- abate          → brinco (str), peso_vivo_kg? (float), peso_carcaca_kg? (float), destino? (str)
- cadastro       → brinco (str), sexo ("M"|"F"), raca? (str), data_nascimento? (str YYYY-MM-DD)
- tratamento     → brinco (str), produto (str), diagnostico? (str)
- desmame        → brinco_cordeiro (str), peso_kg? (float)
- morte          → brinco (str), causa? (str)
- outro          → descricao (str)

Regras:
- Datas sem ano assumem o ano atual.
- Pesos em arrobas (@): multiplique por 15 para obter kg.
- "brinco" é o identificador do animal (número, letra+número, etc).
- Nomes de lote como "lote 1", "engorda", "cria" são válidos para o campo lote.
- Se não conseguir extrair intent com confiança > 0.4, use intent "outro".
"""


# ─── Função principal ─────────────────────────────────────────────────────────
async def classificar_mensagem(
    texto: str,
    imovel_id: Optional[int] = None,
    hoje: Optional[date] = None,
) -> dict:
    """
    Recebe texto livre (transcrição de áudio ou mensagem de texto)
    e retorna dict com intent, confiança, entidades e resumo.

    Sempre retorna um dict (nunca lança exceção para o caller).
    """
    hoje_str = (hoje or date.today()).isoformat()

    user_content = (
        f"[Data de hoje: {hoje_str}]\n"
        f"[Imóvel ID: {imovel_id or 'não informado'}]\n\n"
        f"Mensagem do produtor:\n{texto.strip()}"
    )

    try:
        client = get_client()
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw = response.content[0].text.strip()

        # Remove eventual markdown fence
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE)
        result = json.loads(raw)

        # Garante campos mínimos
        result.setdefault("intent", "outro")
        result.setdefault("confianca", 0.0)
        result.setdefault("entidades", {})
        result.setdefault("resumo", "Evento registrado.")

        # Injeta data_evento se a intent precisar e não vier na mensagem
        if "data_evento" not in result["entidades"]:
            result["entidades"]["data_evento"] = hoje_str

        logger.info(
            "ovino_ia | intent=%s confianca=%.2f imovel=%s",
            result["intent"], result["confianca"], imovel_id,
        )
        return result

    except json.JSONDecodeError as e:
        logger.warning("ovino_ia | JSON inválido da IA: %s | raw=%r", e, raw[:200])
        return _fallback("Resposta da IA não era JSON válido.", texto)

    except anthropic.APIError as e:
        logger.error("ovino_ia | Anthropic API error: %s", e)
        return _fallback(f"Erro API Anthropic: {e}", texto)

    except Exception as e:
        logger.error("ovino_ia | Erro inesperado: %s", e, exc_info=True)
        return _fallback(f"Erro inesperado: {e}", texto)


def _fallback(motivo: str, texto_original: str) -> dict:
    return {
        "intent": "outro",
        "confianca": 0.0,
        "entidades": {"descricao": texto_original[:500]},
        "resumo": "Não foi possível classificar a mensagem automaticamente.",
        "_erro": motivo,
    }
