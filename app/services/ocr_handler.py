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
  (ATENÇÃO no campo "quantidade" de cada item: a coluna QUANT. de notas fiscais brasileiras (NF-e) usa VÍRGULA como separador DECIMAL, geralmente com 3 casas -- ex: "30,000" significa TRINTA (30), NÃO trinta mil; "20,000" significa VINTE (20), NÃO vinte mil. NUNCA interprete essa vírgula como separador de milhar. Retorne sempre o valor decimal correto: "quantidade": 30, nunca "quantidade": 30000 para uma coluna QUANT. mostrando "30,000".)
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


_MAPA_CATEGORIA_INSUMO_PARA_CONTA = {
    "racao": "2.2",
    "medicamento": "2.2",
    "agricola": "2.1",
    "combustivel": "2.3",
    "reproducao": "2.2.3",
}


def _peso_kg_por_unidade(descricao: str):
    """Extrai o peso por saca/unidade a partir do texto da nota (ex:
    'CAROCO DE ALGODAO - SC 25KG' -> 25.0). Retorna None se não achar um
    padrão reconhecível -- não adivinha um peso genérico."""
    import re
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*kg', (descricao or "").lower())
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def inferir_operacao_por_itens(itens: list, imovel_id: int):
    """
    Cruza a descrição de cada item da nota com o catálogo de insumos já
    cadastrado nesse imóvel. Se TODOS os itens baterem (por palavra-chave)
    com insumos de uma única categoria conhecida, retorna a conta de
    despesa correspondente -- sinal independente do CPF, usado quando o
    OCR não consegue decidir compra vs venda sozinho (achado em 30/07:
    nota real de ração caiu em "CPF ambíguo" e precisou de wizard manual
    completo, quando os próprios itens já indicavam claramente ser compra
    de insumo de ração).

    Também resolve insumo_id e quantidade em kg de cada item (convertendo
    sacas -> kg quando a nota traz o peso por saca no texto, ex: "SC
    25KG"), pra dar entrada automática no estoque -- sem isso, o
    lançamento financeiro gravava certo mas o estoque nunca era
    atualizado (achado em 30/07, mesma nota real).

    Retorna None se não bater com nada conhecido, ou se os itens baterem
    em mais de uma categoria (não dá pra sugerir uma única conta) -- nesse
    caso o chamador mantém o fluxo manual de histórico -> tipo -> conta.
    """
    if not itens:
        return None

    from app.db import engine
    from sqlalchemy import text as sqlt
    import unicodedata

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT id, nome, categoria, unidade FROM insumos
            WHERE fazenda_id = :fid AND ativo = TRUE
        """), {"fid": imovel_id}).fetchall()

    if not rows:
        return None

    def _normalizar(t):
        t2 = unicodedata.normalize("NFD", (t or "").lower())
        return "".join(c for c in t2 if unicodedata.category(c) != "Mn")

    # (nome_normalizado, categoria, insumo_id, nome_original, unidade)
    catalogo = [(_normalizar(r[1]), r[2], r[0], r[1], r[3]) for r in rows]

    itens_batidos = []
    categorias_encontradas = set()
    for item in itens:
        desc_norm = _normalizar(item.get("descricao", ""))
        if not desc_norm:
            return None  # item sem descrição -- não arrisca

        # Pontua CADA insumo do catálogo por quantos caracteres de palavras
        # específicas batem na descrição do item, e escolhe o MELHOR, não
        # o primeiro -- palavras curtas/genéricas ("farelo") não podem
        # vencer palavras mais específicas ("algodao") só por ordem de
        # iteração. Se houver empate entre 2+ insumos, não arrisca
        # escolher (comum em catálogos de teste com nomes duplicados).
        candidatos_scored = []
        for nome_cat, categoria, insumo_id, nome_original, unidade in catalogo:
            palavras_nome = [p for p in nome_cat.split() if len(p) > 3]
            score = sum(len(p) for p in palavras_nome if p in desc_norm)
            if score > 0:
                candidatos_scored.append((score, insumo_id, categoria, nome_original, unidade))

        if not candidatos_scored:
            return {
                "status": "sem_match",
                "item_faltante": {
                    "descricao": item.get("descricao"),
                    "quantidade": item.get("quantidade"),
                    "valor_total": item.get("valor_total", 0),
                },
            }

        candidatos_scored.sort(key=lambda c: -c[0])
        melhor_score = candidatos_scored[0][0]
        empatados = [c for c in candidatos_scored if c[0] == melhor_score]
        if len(empatados) > 1:
            return None  # 2+ insumos empatados -- não adivinha, mantém fluxo manual

        _, achou_insumo_id, achou_categoria, achou_nome, achou_unidade = empatados[0]

        # Quantidade pro estoque: converte sacas -> kg usando o peso
        # extraído do próprio texto do item, quando o insumo é rastreado
        # em kg. Se não conseguir converter com segurança, deixa None --
        # o chamador decide não dar entrada automática nesse item
        # específico em vez de arriscar um número errado.
        quantidade_estoque = None
        if item.get("quantidade"):
            try:
                qtd_nota = float(item["quantidade"])
                if achou_unidade == "kg":
                    peso_unitario = _peso_kg_por_unidade(item.get("descricao"))
                    if peso_unitario:
                        quantidade_estoque = qtd_nota * peso_unitario
                else:
                    quantidade_estoque = qtd_nota
            except (TypeError, ValueError):
                quantidade_estoque = None

        itens_batidos.append({
            "descricao": item.get("descricao"),
            "categoria": achou_categoria,
            "valor_total": item.get("valor_total", 0),
            "insumo_id": achou_insumo_id,
            "insumo_nome": achou_nome,
            "quantidade_estoque": quantidade_estoque,
            "unidade": achou_unidade,
        })
        categorias_encontradas.add(achou_categoria)

    if len(categorias_encontradas) != 1:
        return None  # itens de categorias diferentes -- não dá pra sugerir 1 conta só

    categoria_unica = categorias_encontradas.pop()
    conta = _MAPA_CATEGORIA_INSUMO_PARA_CONTA.get(categoria_unica)
    if not conta:
        return None

    return {"status": "ok", "conta": conta, "categoria": categoria_unica, "itens_batidos": itens_batidos}


CATEGORIAS_INSUMO_DISPONIVEIS = [
    ("1", "racao", "Ração / Nutrição animal"),
    ("2", "agricola", "Insumo agrícola (semente, adubo, defensivo)"),
    ("3", "medicamento", "Medicamento / Sanidade animal"),
    ("4", "combustivel", "Combustível"),
    ("5", "reproducao", "Reprodução"),
    ("6", "outros", "Outros"),
]


def criar_insumo_a_partir_de_item(imovel_id: int, item_faltante: dict, categoria: str) -> int:
    """Cadastra um insumo novo a partir de um item de nota que não bateu
    com nada no catálogo, depois do produtor confirmar que quer criar
    (fluxo "Não encontrei X no seu estoque. Quer cadastrar agora?")."""
    from app.db import get_db
    nome = (item_faltante.get("descricao") or "Insumo").strip().title()
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO insumos (fazenda_id, nome, categoria, unidade, origem, estoque_atual, ativo)
            VALUES (%s, %s, %s, 'kg', 'comprado', 0, true)
            RETURNING id
        """, (imovel_id, nome, categoria))
        row = cur.fetchone()
        insumo_id = row["id"] if isinstance(row, dict) else row[0]
        conn.commit()
        return insumo_id
    finally:
        conn.close()
