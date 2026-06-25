# app/services/ocr_handler.py — VERSÃO ROBUSTA COM FALLBACK
import httpx, os, json, base64, logging
from typing import Optional

logger = logging.getLogger(__name__)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

SISTEMA_OCR = """Você é um especialista em documentos fiscais brasileiros.
Analise o documento e extraia as informações fiscais.

REGRA CRÍTICA: Responda SOMENTE com o objeto JSON abaixo, sem nenhum texto antes ou depois, sem markdown, sem ```json, sem explicações. Apenas o JSON puro começando com { e terminando com }.

{
  "tipo_documento": "nfe | cupom_fiscal | boleto | recibo | outros",
  "emitente": "nome da empresa/pessoa que emitiu",
  "data": "YYYY-MM-DD ou null",
  "valor_total": 0.00,
  "itens": [
    {"descricao": "...", "quantidade": 1, "valor_unitario": 0.00, "valor_total": 0.00}
  ],
  "numero_documento": "número da nota/boleto ou null",
  "chave_nfe": "chave de 44 dígitos ou null",
  "tipo_operacao": "compra | venda | pagamento | outros",
  "confianca": "alta | media | baixa",
  "observacao": "qualquer informação relevante ou null"
}"""


def _montar_content(arquivo_bytes: bytes, mime_type: str) -> list:
    """
    Monta o content da mensagem para a API Claude.
    - PDF: usa type=document (nativo, sem conversão)
    - Imagem: usa type=image
    """
    arquivo_b64 = base64.standard_b64encode(arquivo_bytes).decode("utf-8")
    mime_lower = mime_type.lower()

    if "pdf" in mime_lower:
        logger.info(f"[OCR] Enviando PDF nativo ({len(arquivo_bytes)} bytes)")
        return [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": arquivo_b64,
                },
            },
            {"type": "text", "text": "Extraia todos os dados fiscais deste documento."},
        ]
    else:
        # Normaliza mime para tipos aceitos pela API
        if mime_lower not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
            mime_type = "image/jpeg"
        logger.info(f"[OCR] Enviando imagem {mime_type} ({len(arquivo_bytes)} bytes)")
        return [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime_type,
                    "data": arquivo_b64,
                },
            },
            {"type": "text", "text": "Extraia todos os dados fiscais desta imagem."},
        ]


async def extrair_dados_documento(arquivo_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Extrai dados de documento fiscal usando Claude.
    Suporta PDF nativamente (sem PyMuPDF) e imagens.
    """
    try:
        content = _montar_content(arquivo_bytes, mime_type)

        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1500,
                    "system": SISTEMA_OCR,
                    "messages": [{"role": "user", "content": content}],
                },
            )
            r.raise_for_status()
            texto = r.json()["content"][0]["text"].strip()
            logger.info(f"[OCR] Resposta bruta: {texto[:300]}")

            # Remove markdown ```json ... ``` se presente
            if "```" in texto:
                import re as _re
                texto = _re.sub(r"```[a-z]*\n?", "", texto).strip()

            # Extrai primeiro objeto JSON
            inicio = texto.find("{")
            fim = texto.rfind("}") + 1
            if inicio == -1 or fim == 0:
                raise json.JSONDecodeError("Nenhum JSON encontrado", texto, 0)

            dados = json.loads(texto[inicio:fim])
            logger.info(f"[OCR] Sucesso! Confiança: {dados.get('confianca')}")
            return dados
    
    except json.JSONDecodeError as e:
        logger.error(f"[OCR] Erro ao parsear JSON: {e}")
        raise RuntimeError("Claude retornou resposta inválida. Tente novamente.")
    
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code if hasattr(e.response, 'status_code') else 'unknown'
        response_text = e.response.text if hasattr(e, 'response') else str(e)
        logger.error(f"[OCR] Erro HTTP {status_code}: {response_text}")
        
        if status_code == 400:
            raise RuntimeError("Imagem inválida ou muito grande. Tente uma foto mais nítida.")
        elif status_code == 429:
            raise RuntimeError("Limite de requisições atingido. Tente novamente em alguns segundos.")
        else:
            raise RuntimeError(f"Erro na API Claude: {status_code}")
    
    except Exception as e:
        logger.error(f"[OCR] Erro inesperado: {type(e).__name__}: {str(e)}", exc_info=True)
        raise RuntimeError(f"Erro ao processar documento: {str(e)}")


def montar_mensagem_ocr(dados: dict, numero: str) -> str:
    """
    Monta mensagem de confirmação com classificação automática sugerida.
    O classificador decide o tipo; o usuário confirma ou corrige com 1/2/3.
    """
    from app.services.ocr_classificador import classificar_documento, TIPOS

    tipo_doc = dados.get("tipo_documento", "documento").upper()
    emitente = dados.get("emitente") or "N/A"
    data = dados.get("data") or "não identificada"
    valor = dados.get("valor_total", 0)

    # Classificação automática
    classif = classificar_documento(dados)
    tipo_sug = classif["tipo"]          # "despesa" | "investimento" | "receita"
    confianca_num = classif["confianca"]
    motivo = classif["motivo"]
    info_tipo = TIPOS[tipo_sug]

    # Itens
    itens = dados.get("itens", [])
    itens_txt = ""
    if itens:
        itens_txt = "\n📦 Itens:\n"
        for item in itens[:3]:
            itens_txt += f"  • {item.get('descricao', 'N/A')}: R$ {item.get('valor_total', 0):.2f}\n"
        if len(itens) > 3:
            itens_txt += f"  ... e mais {len(itens) - 3} item(ns)\n"

    # Barra de confiança textual
    estrelas = "⭐" * (confianca_num // 25) + "☆" * (4 - confianca_num // 25)

    return (
        f"🧾 *Documento identificado:*\n"
        f"📋 Tipo: {tipo_doc}\n"
        f"🏢 Emitente: {emitente}\n"
        f"📅 Data: {data}\n"
        f"💲 Valor: R$ {valor:.2f}\n"
        f"{itens_txt}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"🤖 *Classificação sugerida:*\n"
        f"{info_tipo['emoji']} {info_tipo['label']}\n"
        f"Confiança: {estrelas} ({confianca_num}%)\n"
        f"Motivo: {motivo}\n\n"
        f"✅ *SIM* — confirmar como {info_tipo['label'].lower()}\n"
        f"1️⃣ *1* — Despesa operacional (ração, combustível...)\n"
        f"2️⃣ *2* — Investimento/equipamento (máquinas...)\n"
        f"3️⃣ *3* — Receita (venda de produção...)\n"
        f"❌ *NAO* — cancelar"
    )


def ocr_para_lancamento(dados: dict) -> dict:
    """
    Converte dados do OCR para o formato de lançamento interno.
    Usa o classificador automático para definir tipo e conta.
    """
    from datetime import date as dt
    from app.services.ocr_classificador import classificar_documento

    classif = classificar_documento(dados)

    itens = dados.get("itens", [])
    descricao = dados.get("emitente") or "Documento fiscal"
    if itens:
        descricao = itens[0].get("descricao") or descricao

    return {
        "conta": classif["conta"],
        "tipo": classif["tipo"],
        "valor": float(dados.get("valor_total", 0)),
        "data": dados.get("data") or dt.today().isoformat(),
        "confianca": classif["confianca"],
        "produto": descricao,
        "numero_documento": dados.get("numero_documento"),
        "chave_nfe": dados.get("chave_nfe"),
        "_classificacao": classif,   # guardado na sessão para aprendizado
        "_dados_ocr": dados,         # guardado para extrair palavras na correção
    }
