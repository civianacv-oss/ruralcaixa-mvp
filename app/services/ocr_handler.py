# app/services/ocr_handler.py — VERSÃO ROBUSTA COM FALLBACK
import httpx, os, json, base64, logging, re
from typing import Optional

logger = logging.getLogger(__name__)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

SISTEMA_OCR = """Você é um especialista em documentos fiscais brasileiros.
Analise a imagem e extraia as informações do documento fiscal.
Responda APENAS com JSON, sem explicações.

Formato:
{
  "tipo_documento": "nfe | cupom_fiscal | boleto | recibo | outros",
  "emitente": "nome da empresa/pessoa que emitiu (vendedor)",
  "emitente_documento": "CPF ou CNPJ do emitente, so digitos, ou null",
  "destinatario": "nome da empresa/pessoa que recebeu (comprador/destinatario)",
  "destinatario_documento": "CPF ou CNPJ do destinatario, so digitos, ou null",
  "data": "YYYY-MM-DD ou null (ATENÇÃO: documentos brasileiros escrevem a data como DD/MM/AAAA -- ex: '03/06/2026' é 3 de JUNHO, não 6 de março -- converta corretamente pro formato YYYY-MM-DD)",
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


def _parsear_json_claude(texto: str) -> dict:
    """Claude as vezes envolve a resposta em cercas de markdown (```json
    ... ```) mesmo quando instruido a responder so com JSON. Tenta na
    ordem: texto puro -> remover cercas de markdown -> extrair o
    primeiro {...} do texto. Loga o texto bruto (truncado) se tudo
    falhar, pra facilitar diagnostico -- antes esse texto se perdia."""
    texto_limpo = texto.strip()

    try:
        return json.loads(texto_limpo)
    except json.JSONDecodeError:
        pass

    sem_cercas = re.sub(r'^```(?:json)?\s*|\s*```$', '', texto_limpo, flags=re.MULTILINE).strip()
    try:
        return json.loads(sem_cercas)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', texto_limpo, flags=re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.error(f"[OCR] Resposta da Claude nao e JSON valido (nem com fallback). Texto bruto: {texto_limpo[:500]!r}")
    raise json.JSONDecodeError("Nenhuma das estrategias de parse funcionou", texto_limpo, 0)


def _so_digitos(valor) -> str:
    return re.sub(r"\D", "", valor or "")


def _corrigir_tipo_operacao_por_cpf(dados: dict, produtor_cpf: str = None) -> None:
    """Corrige dados["tipo_operacao"] IN-PLACE comparando o CPF/CNPJ do
    produtor com emitente_documento/destinatario_documento extraidos do
    documento. Isso e deterministico -- nao depende da Claude "entender"
    que o destinatario da nota e quem esta mandando a mensagem.

    Se o CPF do produtor bate com o emitente -> ele vendeu (venda).
    Se bate com o destinatario -> ele comprou (compra).
    Se nao tiver CPF do produtor ou nao bater com nenhum dos dois, marca
    dados["_ambiguo_cpf"] = True -- o chamador (mensagem_handler.py) usa
    esse sinal pra pular o SIM/NAO com palpite e pedir classificacao
    manual em vez de arriscar (achado em producao 28/07: nota de compra
    do proprio produtor saiu classificada como venda)."""
    dados["_ambiguo_cpf"] = True

    if not produtor_cpf:
        return

    cpf_produtor = _so_digitos(produtor_cpf)
    doc_emitente = _so_digitos(dados.get("emitente_documento"))
    doc_destinatario = _so_digitos(dados.get("destinatario_documento"))

    if not cpf_produtor:
        return

    if doc_emitente and doc_emitente == cpf_produtor:
        if dados.get("tipo_operacao") != "venda":
            logger.info("[OCR] CPF do produtor bate com emitente -- corrigindo tipo_operacao para 'venda'")
        dados["tipo_operacao"] = "venda"
        dados["_ambiguo_cpf"] = False
    elif doc_destinatario and doc_destinatario == cpf_produtor:
        if dados.get("tipo_operacao") not in ("compra", "pagamento"):
            logger.info("[OCR] CPF do produtor bate com destinatario -- corrigindo tipo_operacao para 'compra'")
        dados["tipo_operacao"] = "compra"
        dados["_ambiguo_cpf"] = False


async def extrair_dados_documento(imagem_bytes: bytes, mime_type: str = "image/jpeg", produtor_cpf: str = None) -> dict:
    """
    Extrai dados de documento fiscal usando Claude Vision.
    
    NOVO: Suporta PDF e imagens. PDFs são convertidos para JPEG antes do envio.
    Versão robusta com fallback se pdf2image não estiver disponível.
    
    NOVO (28/07): produtor_cpf, se informado, é comparado com
    emitente_documento/destinatario_documento extraídos do documento pra
    decidir compra vs venda de forma DETERMINÍSTICA -- antes o
    tipo_operacao vinha só do palpite da Claude, que já classificou uma
    nota de compra do próprio produtor como venda (achado em produção).

    Args:
        imagem_bytes: Bytes do arquivo (PDF ou imagem)
        mime_type: MIME type do arquivo (application/pdf, image/jpeg, etc.)
        produtor_cpf: CPF do produtor que está enviando o documento (só
            dígitos), usado pra corrigir tipo_operacao quando o campo
            bater com destinatario_documento ou emitente_documento
    
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
                    "model": "claude-haiku-4-5-20251001",
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
            dados = _parsear_json_claude(texto)
            _corrigir_tipo_operacao_por_cpf(dados, produtor_cpf)
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
