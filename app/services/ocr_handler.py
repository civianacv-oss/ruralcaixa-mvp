# app/services/ocr_handler.py
import httpx, os, json, base64

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
    """Usa Claude Vision para extrair dados de documento fiscal."""
    imagem_b64 = base64.standard_b64encode(imagem_bytes).decode("utf-8")
    
    async with httpx.AsyncClient(timeout=30) as client:
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
                                "media_type": mime_type,
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
        return json.loads(texto)


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
        for item in itens[:3]:  # máximo 3 itens na mensagem
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