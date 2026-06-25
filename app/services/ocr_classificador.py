# app/services/ocr_classificador.py — RuralCaixa MVP
"""
Classificador de documentos fiscais com aprendizado supervisionado.

Fluxo:
1. Extrai palavras-chave do documento (itens + emitente)
2. Consulta banco: palavras com maior peso acumulado ganham
3. Retorna classificação com confiança e conta sugerida
4. Quando usuário corrige, registrar_correcao() atualiza os pesos
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Mapeamento tipo → label amigável → conta padrão
TIPOS = {
    "despesa":      {"label": "Despesa operacional",      "emoji": "💸", "conta": "3.1.1"},
    "investimento": {"label": "Investimento/equipamento", "emoji": "🔧", "conta": "4.1"},
    "receita":      {"label": "Receita",                  "emoji": "💰", "conta": "1.1.1"},
    "contrato":     {"label": "Contrato/documento jurídico", "emoji": "📋", "conta": "9.9"},
}


def _extrair_palavras(dados_ocr: dict) -> list[str]:
    """Extrai palavras relevantes do documento OCR."""
    textos = []

    # Itens da nota
    for item in dados_ocr.get("itens", []):
        desc = item.get("descricao") or ""
        textos.append(desc.lower())

    # Emitente
    emitente = dados_ocr.get("emitente") or ""
    textos.append(emitente.lower())

    # Observação
    obs = dados_ocr.get("observacao") or ""
    textos.append(obs.lower())

    texto_completo = " ".join(textos)
    # Remove caracteres especiais, mantém letras/números/espaço
    texto_limpo = re.sub(r"[^a-záàâãéêíóôõúüçñ0-9\s]", " ", texto_completo)
    palavras = [p for p in texto_limpo.split() if len(p) > 3]
    return list(set(palavras))


def classificar_documento(dados_ocr: dict, produtor_id: Optional[int] = None) -> dict:
    """
    Classifica o documento usando aprendizado do banco + regras fixas.

    Retorna:
        tipo: "despesa" | "investimento" | "receita"
        conta: código da subconta
        confianca: 0-100
        motivo: texto explicativo
        palavras_chave: lista de palavras que influenciaram
    """
    palavras = _extrair_palavras(dados_ocr)

    # Consulta banco de aprendizado
    scores = {"despesa": 0, "investimento": 0, "receita": 0, "contrato": 0}
    contas = {"despesa": "3.1.1", "investimento": "4.1", "receita": "1.1.1", "contrato": "9.9"}
    palavras_ativas = []

    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                for palavra in palavras:
                    cur.execute("""
                        SELECT tipo, conta, peso
                        FROM ocr_classificacoes_aprendizado
                        WHERE lower(palavra) = lower(%s)
                        ORDER BY peso DESC
                        LIMIT 1
                    """, (palavra,))
                    row = cur.fetchone()
                    if row:
                        tipo_db, conta_db, peso = row["tipo"], row["conta"], row["peso"]
                        scores[tipo_db] += peso
                        contas[tipo_db] = conta_db
                        palavras_ativas.append((palavra, tipo_db, peso))
    except Exception as e:
        logger.warning(f"[Classificador] Erro ao consultar banco: {e}. Usando regras fixas.")

    # Regra de desempate: tipo_documento como sinal extra
    tipo_doc = dados_ocr.get("tipo_documento", "").lower()
    tipo_op = dados_ocr.get("tipo_operacao", "").lower()
    observacao = (dados_ocr.get("observacao") or "").lower()

    # Contratos e documentos jurídicos têm prioridade máxima
    palavras_contrato = [
        "contrato", "cessão", "arrendamento", "parceria", "consórcio",
        "locação", "comodato", "escritura", "procuração", "testamento",
        "inventário", "partilha", "distrato", "aditivo", "termo",
        "possessório", "possessória", "direitos", "hectare", "área rural",
    ]
    texto_completo = " ".join([
        dados_ocr.get("emitente", ""),
        dados_ocr.get("observacao", "") or "",
        " ".join(i.get("descricao", "") for i in dados_ocr.get("itens", [])),
    ]).lower()

    if any(p in texto_completo for p in palavras_contrato):
        scores["contrato"] += 15  # peso alto para garantir vitória

    elif tipo_op == "venda" and scores["receita"] == 0 and scores["despesa"] == 0:
        scores["receita"] += 3
    elif tipo_op in ("compra", "pagamento") and scores["despesa"] == 0 and scores["investimento"] == 0:
        scores["despesa"] += 3

    # Vencedor
    tipo_vencedor = max(scores, key=lambda t: scores[t])
    score_max = scores[tipo_vencedor]
    score_total = sum(scores.values())

    if score_total == 0:
        # Sem dados — default conservador: despesa
        tipo_vencedor = "despesa"
        confianca = 30
        motivo = "Sem palavras-chave reconhecidas. Sugerindo despesa como padrão."
    else:
        confianca = min(95, int((score_max / score_total) * 100))
        palavras_str = ", ".join(p[0] for p in palavras_ativas if p[1] == tipo_vencedor)
        motivo = f"Palavras reconhecidas: {palavras_str or 'regra geral'}"

    return {
        "tipo": tipo_vencedor,
        "conta": contas[tipo_vencedor],
        "confianca": confianca,
        "motivo": motivo,
        "scores": scores,
        "palavras_ativas": palavras_ativas,
    }


def registrar_correcao(
    dados_ocr: dict,
    tipo_correto: str,
    conta_correta: str,
    produtor_id: Optional[int] = None,
) -> None:
    """
    Registra correção do usuário no banco de aprendizado.
    Aumenta peso das palavras que levam ao tipo correto.
    Diminui peso das palavras que levaram ao tipo errado.
    """
    if tipo_correto not in TIPOS:
        logger.error(f"[Aprendizado] Tipo inválido: {tipo_correto}")
        return

    palavras = _extrair_palavras(dados_ocr)
    if not palavras:
        return

    emitente = dados_ocr.get("emitente") or ""
    descricao = ""
    itens = dados_ocr.get("itens", [])
    if itens:
        descricao = itens[0].get("descricao") or ""

    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                for palavra in palavras[:10]:  # limita para não poluir
                    # Verifica se já existe
                    cur.execute("""
                        SELECT id, tipo, peso
                        FROM ocr_classificacoes_aprendizado
                        WHERE lower(palavra) = lower(%s)
                    """, (palavra,))
                    rows = cur.fetchall()

                    achou_correto = False
                    for row in rows:
                        if row["tipo"] == tipo_correto:
                            # Reforça o correto
                            cur.execute("""
                                UPDATE ocr_classificacoes_aprendizado
                                SET peso = peso + 2, atualizado_em = NOW()
                                WHERE id = %s
                            """, (row["id"],))
                            achou_correto = True
                        else:
                            # Penaliza o incorreto (mínimo 1)
                            cur.execute("""
                                UPDATE ocr_classificacoes_aprendizado
                                SET peso = GREATEST(1, peso - 1), atualizado_em = NOW()
                                WHERE id = %s
                            """, (row["id"],))

                    if not achou_correto:
                        # Insere nova entrada
                        cur.execute("""
                            INSERT INTO ocr_classificacoes_aprendizado
                                (palavra, tipo, conta, emitente, descricao, peso, produtor_id)
                            VALUES (%s, %s, %s, %s, %s, 3, %s)
                        """, (
                            palavra, tipo_correto, conta_correta,
                            emitente[:200], descricao[:200], produtor_id,
                        ))

            conn.commit()
        logger.info(f"[Aprendizado] Correção registrada: {tipo_correto} para {len(palavras)} palavras")

    except Exception as e:
        logger.error(f"[Aprendizado] Erro ao registrar correção: {e}")
