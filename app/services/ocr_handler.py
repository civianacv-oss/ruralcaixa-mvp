# app/services/ocr_handler.py — VERSÃO ROBUSTA COM FALLBACK
import httpx, os, json, base64, logging
from typing import Optional

logger = logging.getLogger(__name__)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

SISTEMA_OCR = """Você é um especialista em documentos fiscais brasileiros.
Analise a imagem e extraia as informações do documento fiscal.
Responda APENAS com JSON, sem explicações.

Formato:
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
}
"""


async def extrair_dados_documento(imagem_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Extrai dados de documento fiscal usando Claude Vision.
    
    NOVO: Suporta PDF e imagens. PDFs são convertidos para JPEG antes do envio.
    Versão robusta com fallback se pdf2image não estiver disponível.
    
    Args:
        imagem_bytes: Bytes do arquivo (PDF ou imagem)
        mime_type: MIME type do arquivo (application/pdf, image/jpeg, etc.)
    
    Returns:
        dict: Dados extraídos do documento em formato JSON
    """
    try:
        # ── NOVO: Processar PDF se necessário ──────────────────────────────
        if mime_type.lower() == "application/pdf" or mime_type.lower().endswith("+pdf"):
            logger.info(f"[PDF] Detectado PDF ({len(imagem_bytes)} bytes). Tentando converter...")
            try:
                from app.services.pdf_converter import processar_documento_para_claude
                imagem_bytes, mime_type = processar_documento_para_claude(
                    imagem_bytes, mime_type, "documento.pdf"
                )
                logger.info(f"[PDF] Conversão bem-sucedida: {len(imagem_bytes)} bytes")
            except ImportError as e:
                logger.warning(f"[PDF] Módulo pdf_converter não encontrado: {e}")
                raise RuntimeError(
                    "Suporte a PDF não configurado. Tente enviar uma foto nítida do documento."
                )
            except Exception as e:
                logger.error(f"[PDF] Erro ao converter PDF: {type(e).__name__}: {e}")
                raise RuntimeError(f"Não consegui processar o PDF: {str(e)}")
        
        # ── Codificar imagem em base64 ─────────────────────────────────────
        logger.info(f"[OCR] Codificando imagem em base64...")
        imagem_b64 = base64.standard_b64encode(imagem_bytes).decode("utf-8")
        logger.info(f"[OCR] Base64 gerado: {len(imagem_b64)} caracteres")
        
        # ── Enviar para Claude Vision ──────────────────────────────────────
        logger.info(f"[OCR] Enviando para Claude Vision...")
        
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-opus-4-5-20251001",
                    "max_tokens": 1000,
                    "system": SISTEMA_OCR,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": imagem_b64
                                }
                            },
                            {
                                "type": "text",
                                "text": "Extraia todos os dados fiscais desta imagem."
                            }
                        ]
                    }]
                }
            )
            r.raise_for_status()
            texto = r.json()["content"][0]["text"]
            dados = json.loads(texto)
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
