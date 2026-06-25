"""
OCR Handler - Extrai dados de documentos fiscais usando Claude Vision
Suporta: JPEG, PNG (imagens)
Não suporta: PDF (temporariamente desabilitado)
"""

import base64
import json
import logging
import httpx
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


async def extrair_dados_documento(
    midia_bytes: bytes,
    mime_type: str,
    timeout: int = 60
) -> dict:
    """
    Extrai dados de um documento fiscal usando Claude Vision.
    
    Suporta:
    - image/jpeg
    - image/png
    
    Não suporta (temporariamente):
    - application/pdf
    
    Args:
        midia_bytes: Conteúdo do arquivo em bytes
        mime_type: Tipo MIME do arquivo
        timeout: Timeout em segundos
        
    Returns:
        dict com dados extraídos ou erro
    """
    
    # ✅ Rejeitar PDFs com mensagem clara
    if mime_type == "application/pdf":
        logger.warning(f"[OCR] PDF recebido mas não suportado temporariamente")
        raise RuntimeError(
            "📄 Suporte a PDF está em desenvolvimento!\n\n"
            "Por enquanto, envie uma **foto nítida** do documento.\n\n"
            "Dicas:\n"
            "✅ Boa iluminação\n"
            "✅ Documento inteiro na foto\n"
            "✅ Sem sombras\n\n"
            "Em breve suportaremos PDFs! 🚀"
        )
    
    # ✅ Validar tipo MIME
    if mime_type not in ["image/jpeg", "image/png"]:
        logger.error(f"[OCR] Tipo MIME não suportado: {mime_type}")
        raise RuntimeError(
            f"Tipo de arquivo não suportado: {mime_type}\n\n"
            "Envie uma imagem (JPEG ou PNG) do documento."
        )
    
    # ✅ Validar tamanho
    if len(midia_bytes) > 20 * 1024 * 1024:  # 20 MB
        logger.error(f"[OCR] Arquivo muito grande: {len(midia_bytes)} bytes")
        raise RuntimeError("Arquivo muito grande (máximo 20 MB)")
    
    logger.info(f"[OCR] Iniciando extração: {mime_type}, {len(midia_bytes)} bytes")
    
    # ✅ Codificar imagem em base64
    imagem_b64 = base64.standard_b64encode(midia_bytes).decode("utf-8")
    
    # ✅ Preparar prompt para Claude
    prompt = """Você é um especialista em extração de dados de documentos fiscais brasileiros.

Analise esta imagem e extraia os seguintes dados em formato JSON:

{
    "tipo_documento": "NFe|Cupom|Boleto|Outro",
    "emitente": "Nome da empresa",
    "cnpj_emitente": "XX.XXX.XXX/XXXX-XX",
    "data": "DD/MM/YYYY",
    "valor_total": 0.00,
    "tipo_operacao": "compra|venda|outros",
    "itens": [
        {
            "descricao": "Descrição do item",
            "quantidade": 0,
            "valor_unitario": 0.00,
            "valor_total": 0.00
        }
    ],
    "confianca": "alta|media|baixa",
    "observacoes": "Qualquer informação adicional relevante"
}

Se não conseguir extrair algum campo, deixe como null.
Retorne APENAS o JSON, sem explicações adicionais."""

    try:
        # ✅ Chamar Claude Vision
        logger.info("[OCR] Chamando Claude Vision...")
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": __import__('os').getenv('ANTHROPIC_API_KEY'),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 1024,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": mime_type,
                                        "data": imagem_b64,
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": prompt,
                                },
                            ],
                        }
                    ],
                },
            )
        
        # ✅ Processar resposta
        response.raise_for_status()
        texto = response.json()["content"][0]["text"]
        dados = json.loads(texto)
        
        logger.info(f"[OCR] Extração concluída com sucesso. Confiança: {dados.get('confianca')}")
        return dados
        
    except httpx.HTTPStatusError as e:
        # ✅ Tratar erros HTTP
        status_code = e.response.status_code if hasattr(e.response, 'status_code') else getattr(e, 'status_code', 'unknown')
        response_text = e.response.text if hasattr(e, 'response') else str(e)
        logger.error(f"[OCR] Erro HTTP da API Claude: {status_code} - {response_text}")
        
        if status_code == 400:
            raise RuntimeError("Imagem inválida ou muito grande. Tente uma foto mais nítida.")
        elif status_code == 429:
            raise RuntimeError("Limite de requisições atingido. Tente novamente em alguns segundos.")
        else:
            raise RuntimeError(f"Erro na API Claude: {status_code}")
            
    except json.JSONDecodeError as e:
        logger.error(f"[OCR] Erro ao parsear resposta JSON do Claude: {e}")
        raise RuntimeError("Claude retornou resposta inválida. Tente novamente.")
        
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

    mensagem = f"""{emoji} **Documento Identificado:**

📋 **Tipo**: {tipo}
🏢 **Emitente**: {emitente}
📅 **Data**: {data}
💵 **Valor**: R$ {valor:,.2f}
📊 **Operação**: {operacao.capitalize()}
✅ **Confiança**: {confianca.upper()}

Confirma o lançamento? (responda com 'sim' ou 'não')"""

    return mensagem
