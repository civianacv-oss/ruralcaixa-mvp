"""
RuralCaixa — services/caprino_ia.py  (v2 — síncrono)
Compatível com psycopg2/FastAPI síncrono do main_api.py.
"""

import os
import json
import re
import logging
from datetime import date
from typing import Optional

import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é o assistente de campo do RuralCaixa, especializado em
criação de caprinos de corte no Brasil. Sua tarefa é extrair eventos zootécnicos
de mensagens enviadas pelo produtor via WhatsApp (texto ou transcrição de áudio).

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto extra.

Formato de resposta:
{
  "intent": "<uma das intents abaixo>",
  "confianca": <0.0 a 1.0>,
  "entidades": { <campos específicos da intent> },
  "resumo": "<frase curta confirmando o que foi registrado>"
}

Intents disponíveis e seus campos:
- pesagem        → brinco (str), peso_kg (float), motivo? (str)
- vacinacao      → produto (str), lote? (str), brinco? (str), dose_ml? (float)
- vermifugacao   → produto (str), lote? (str), brinco? (str), dose_ml? (float), via? (str)
- famacha        → brinco (str), escore (int 1-5)
- parto          → brinco_matriz (str), cabritos_vivos (int), cabritos_mortos? (int)
- monta          → brinco_matriz (str), brinco_reprodutor? (str)
- abate          → brinco (str), peso_vivo_kg? (float), peso_carcaca_kg? (float), destino? (str)
- cadastro       → brinco (str), sexo ("M"|"F"), raca? (str), data_nascimento? (str YYYY-MM-DD)
- tratamento     → brinco (str), produto (str), diagnostico? (str)
- desmame        → brinco_cordeiro (str), peso_kg? (float)
- morte          → brinco (str), causa? (str)
- compra         → quantidade (int), valor_total (float), regime? ("pasto"|"confinamento"), raca? (str), fornecedor? (str)
- venda          → quantidade (int), valor_total (float), brinco? (str), comprador? (str)
- outro          → descricao (str)

Regras:
- Datas sem ano assumem o ano atual.
- Pesos em arrobas (@): multiplique por 15 para obter kg.
- Se confiança < 0.4, use intent "outro".
- "Comprei/adquiri N cabras/bodes/cabritos por R$ X" → intent "compra".
- Regime da compra: "confinamento", "cocho", "curral", "engorda confinada" → regime "confinamento" (prazo fiscal: 52 dias). "Pasto", "solto", "campo", ou se não mencionar nada → regime "pasto" (prazo fiscal: 138 dias, é o padrão mais comum).
- "Vendi N cabras/bodes/cabritos por R$ X" → intent "venda".
"""


def classificar_mensagem_sync(
    texto: str,
    imovel_id: Optional[int] = None,
    hoje: Optional[date] = None,
) -> dict:
    """Versão síncrona — compatível com FastAPI sem async."""
    hoje_str = (hoje or date.today()).isoformat()

    user_content = (
        f"[Data de hoje: {hoje_str}]\n"
        f"[Imóvel ID: {imovel_id or 'não informado'}]\n\n"
        f"Mensagem do produtor:\n{texto.strip()}"
    )

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw = response.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE)
        result = json.loads(raw)

        result.setdefault("intent", "outro")
        result.setdefault("confianca", 0.0)
        result.setdefault("entidades", {})
        result.setdefault("resumo", "Evento registrado.")

        if "data_evento" not in result["entidades"]:
            result["entidades"]["data_evento"] = hoje_str

        logger.info("caprino_ia | intent=%s confianca=%.2f", result["intent"], result["confianca"])
        return result

    except json.JSONDecodeError as e:
        logger.warning("caprino_ia | JSON inválido: %s", e)
        return _fallback("Resposta da IA não era JSON válido.", texto)
    except Exception as e:
        logger.error("caprino_ia | Erro: %s", e, exc_info=True)
        return _fallback(str(e), texto)


def _fallback(motivo: str, texto: str) -> dict:
    return {
        "intent": "outro",
        "confianca": 0.0,
        "entidades": {"descricao": texto[:500]},
        "resumo": "Não foi possível classificar a mensagem automaticamente.",
        "_erro": motivo,
    }
