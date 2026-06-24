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
    """Monta mensagem de confirmação para o produtor."""
    tipo = dados.get("tipo_documento", "documento").upper()
    emitente = dados.get("emitente") or "N/A"
    data = dados.get("data") or "não identificada"
    valor = dados.get("valor_total", 0)
    operacao = dados.get("tipo_operacao", "outros")
    confianca = dados.get("confianca", "baixa")
    
    emoji = "🧾" if operacao == "compra" else "💰" if operacao == "venda" else "📄"
    tipo_label = "[DESPESA]" if operacao in ("compra", "pagamento") else "[RECEITA]" if operacao == "venda" else "[DOCUMENTO]"
    
    itens = dados.get("itens", [])
    itens_txt = ""
    if itens:
        itens_txt = "\n📦 Itens:\n"
        for item in itens[:3]:
            itens_txt += f"  • {item.get('descricao', 'N/A')}: R$ {item.get('valor_total', 0):.2f}\n"
        if len(itens) > 3:
            itens_txt += f"  ... e mais {len(itens) - 3} item(ns)\n"

    return (
        f"{emoji} *Documento identificado:*\n"
        f"📋 Tipo: {tipo}\n"
        f"🏢 Emitente: {emitente}\n"
        f"📅 Data: {data}\n"
        f"💲 Valor: R$ {valor:.2f}\n"
        f"{tipo_label}\n"
        f"{itens_txt}\n"
        f"Confiança: {confianca}\n\n"
        f"Responda *SIM* para lançar como {tipo_label.strip('[]').lower()} ou *NAO* para cancelar."
    )


def ocr_para_lancamento(dados: dict) -> dict:
    """Converte dados do OCR para o formato de lançamento interno."""
    from datetime import date as dt
    
    operacao = dados.get("tipo_operacao", "outros")
    tipo = "despesa" if operacao in ("compra", "pagamento") else "receita" if operacao == "venda" else "despesa"
    
    MAPA_CONTA = {
        "compra": "3.1.1",
        "pagamento": "3.9",
        "venda": "1.1.1",
        "outros": "3.9",
    }
    
    itens = dados.get("itens", [])
    descricao = dados.get("emitente") or "Documento fiscal"
    if itens:
        descricao = itens[0].get("descricao") or descricao

    return {
        "conta": MAPA_CONTA.get(operacao, "3.9"),
        "tipo": tipo,
        "valor": float(dados.get("valor_total", 0)),
        "data": dados.get("data") or dt.today().isoformat(),
        "confianca": 80 if dados.get("confianca") == "alta" else 60,
        "produto": descricao,
        "numero_documento": dados.get("numero_documento"),
        "chave_nfe": dados.get("chave_nfe"),
    }
