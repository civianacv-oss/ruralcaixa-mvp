"""
RuralCaixa — services/piscicultura_ia.py
Classificador de mensagens de WhatsApp/Telegram para o módulo Piscicultura.
Espelha o padrão de app/services/ovino_ia.py, adaptado para trabalhar sempre
dentro do ciclo ATIVO do imóvel (resolvido pelo webhook, não pela IA).
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
piscicultura (tilápia e outras espécies) no Brasil. Sua tarefa é extrair
eventos de manejo do ciclo de produção em mensagens enviadas pelo produtor
via WhatsApp (texto ou transcrição de áudio). Todo evento pertence ao ciclo
de piscicultura ATUALMENTE ATIVO do produtor — você não precisa identificar
qual ciclo é, apenas extrair os dados do evento.

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto extra.

Formato de resposta:
{
  "intent": "<uma das intents abaixo>",
  "confianca": <0.0 a 1.0>,
  "entidades": { <campos específicos da intent> },
  "resumo": "<frase curta confirmando o que foi registrado>"
}

Intents disponíveis e seus campos:
- registro_diario → racao_kg? (float), tipo_racao? (str), mortalidade_qtd? (int),
                     mortalidade_causa? (str), oxigenio_dissolvido? (float, mg/L),
                     ph? (float), temperatura_c? (float), transparencia_secchi_cm? (int)
- biometria       → qtd_amostrada (int), peso_medio_g (float), tecnico_responsavel? (str)
- compra_insumo   → tipo_insumo (str: "racao"|"alevino"|"cal"|"outro"), descricao (str),
                     quantidade? (float), unidade? (str), valor_total (float), fornecedor? (str)
- despesca        → peso_total_kg (float), preco_kg? (float), valor_total? (float),
                     qtd_peixes_vendidos? (int), comprador? (str)
- outro           → descricao (str)

Regras:
- Datas sem ano assumem o ano atual.
- "Comprei X kg de ração / alevinos / cal por R$ Y" → intent "compra_insumo".
- "Vendi/despesquei X kg de peixe por R$ Y" (ou "a R$ Y o kg") → intent "despesca".
  Se vier preço por kg, preencha preco_kg; se vier valor total, preencha valor_total.
- Mortalidade, ração do dia, ou parâmetros de água → intent "registro_diario"
  (podem vir combinados na mesma mensagem, ex: "morreram 5 peixes hoje, ração 10kg").
- "Biometria" ou "peso médio de N peixes foi X gramas" → intent "biometria".
- Se confiança < 0.4, use intent "outro".
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

        logger.info("piscicultura_ia | intent=%s confianca=%.2f", result["intent"], result["confianca"])
        return result

    except json.JSONDecodeError as e:
        logger.warning("piscicultura_ia | JSON inválido: %s", e)
        return _fallback("Resposta da IA não era JSON válido.", texto)
    except Exception as e:
        logger.error("piscicultura_ia | Erro: %s", e, exc_info=True)
        return _fallback(str(e), texto)


def _fallback(motivo: str, texto: str) -> dict:
    return {
        "intent": "outro",
        "confianca": 0.0,
        "entidades": {"descricao": texto[:500]},
        "resumo": "Não foi possível classificar a mensagem automaticamente.",
        "_erro": motivo,
    }
