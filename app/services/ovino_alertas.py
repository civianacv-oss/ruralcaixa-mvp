"""
RuralCaixa — services/ovino_alertas.py
Motor de geração de alertas por reclassificação de lote.
Compatível com psycopg2 síncrono.
"""

import hashlib
from datetime import date, timedelta
from typing import Optional


# ── Definição dos alertas por fase ────────────────────────────────────────────

ALERTAS_POR_FASE = {
    "cria": [
        # (tipo, titulo, dias_offset, prioridade)
        ("cura_umbigo",           "🩹 Cura de umbigo",              0,   "alta"),
        ("confirmar_colostro",    "🍼 Confirmar colostro",           0,   "alta"),
        ("pesagem_inicial",       "⚖️ Pesagem inicial",              1,   "media"),
        ("programar_desmama",     "📅 Programar desmama",            60,  "media"),
        ("vacina_clostridiose_1", "💉 Clostridioses 1ª dose (4m)",   120, "media"),
    ],
    "recria": [
        ("pesagem_recria",           "⚖️ Pesagem de acompanhamento",    30, "media"),
        ("avaliar_transicao_engorda","📊 Avaliar transição para engorda",30, "baixa"),
        ("vermifugacao_recria",      "🧪 Vermifugação de entrada",       3,  "media"),
    ],
    "engorda": [
        ("revisao_nutricional",  "🌾 Revisão nutricional",       0,  "media"),
        ("pesagem_engorda_1",    "⚖️ Pesagem 21 dias",           21, "media"),
        ("pesagem_engorda_2",    "⚖️ Pesagem 42 dias",           42, "media"),
        ("meta_abate_check",     "🎯 Verificar meta de abate",   45, "baixa"),
    ],
    "reprodução": [
        ("avaliar_apto_reproducao",   "✅ Avaliar aptidão reprodutiva",  0, "alta"),
        ("check_sanitario_pre_monta", "🏥 Checagem sanitária pré-monta", 1, "alta"),
        ("preparar_estacao_monta",    "❤️ Preparar estação de monta",    30, "media"),
    ],
    "descarte": [  # pré-abate
        ("confirmar_venda",    "💰 Confirmar venda/destino",   0, "alta"),
        ("emitir_nfe",         "📄 Emitir NF-e produtor",      1, "media"),
        ("pesagem_pre_abate",  "⚖️ Pesagem pré-abate",         0, "alta"),
    ],
}


def _hash(animal_id: int, tipo: str, data_vencimento: date, origem: str) -> str:
    raw = f"{animal_id}:{tipo}:{data_vencimento.isoformat()}:{origem}"
    return hashlib.sha256(raw.encode()).hexdigest()


def gerar_alertas_reclassificacao(
    cur,
    imovel_id: int,
    animal_id: int,
    lote_id: int,
    fase_nova: str,
    data_ref: Optional[date] = None,
) -> int:
    """
    Gera alertas para um animal recém-reclassificado.
    Retorna o número de alertas criados (ignora duplicatas por hash).
    """
    if data_ref is None:
        data_ref = date.today()

    regras = ALERTAS_POR_FASE.get(fase_nova, [])
    criados = 0

    for tipo, titulo, dias_offset, prioridade in regras:
        data_venc = data_ref + timedelta(days=dias_offset)
        h = _hash(animal_id, tipo, data_venc, "reclassificacao")

        # INSERT ignorando duplicatas por hash
        cur.execute("""
            INSERT INTO ovino_alertas
                (imovel_id, animal_id, lote_id, tipo_alerta, titulo,
                 data_referencia, data_vencimento, prioridade, origem_evento, hash_unicidade)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'reclassificacao', %s)
            ON CONFLICT (hash_unicidade) DO NOTHING
        """, (imovel_id, animal_id, lote_id, tipo, titulo,
              data_ref, data_venc, prioridade, h))

        if cur.rowcount > 0:
            criados += 1

    return criados


def gerar_alerta_calendario(
    cur,
    imovel_id: int,
    animal_id: int,
    lote_id: Optional[int],
    tipo: str,
    titulo: str,
    data_vencimento: date,
    prioridade: str = "media",
    origem: str = "calendario",
    descricao: Optional[str] = None,
) -> bool:
    """Gera um alerta de calendário avulso. Retorna True se foi criado."""
    h = _hash(animal_id, tipo, data_vencimento, origem)
    cur.execute("""
        INSERT INTO ovino_alertas
            (imovel_id, animal_id, lote_id, tipo_alerta, titulo, descricao,
             data_vencimento, prioridade, origem_evento, hash_unicidade)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (hash_unicidade) DO NOTHING
    """, (imovel_id, animal_id, lote_id, tipo, titulo, descricao,
          data_vencimento, prioridade, origem, h))
    return cur.rowcount > 0
