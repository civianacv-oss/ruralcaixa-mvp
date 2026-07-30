"""
app/services/producao_agricola_service.py — RuralCaixa MVP

Fluxo de bot para registrar produção agrícola (colheita) direto pelo
WhatsApp/Telegram, incluindo a ponte pra dar entrada no estoque de
insumos quando o destino é uso próprio (ex: silagem), calculando o
custo de produção a partir do gasto acumulado da safra (vw_dre_safra).

COMPARTILHADO entre os dois canais — não duplicar essa lógica em main.py
nem em mensagem_handler.py, só chamar as funções daqui (decisão de 25/07,
depois de 3+ bugs corrigidos em dobro no mesmo dia por causa de lógica
duplicada entre os canais).
"""
import re
import unicodedata

_VERBOS_PRODUCAO = ["produzi", "produziu", "colhi", "colheu", "colheita",
                     "ensilei", "ensilagem", "ensilar"]

_PALAVRAS_DESTINO_ESTOQUE = ["silo", "silagem", "estoque", "uso proprio",
                             "uso interno", "consumo proprio"]

_PALAVRAS_DESTINO_VENDA = ["vendi", "venda", "vendido"]

DESTINOS_VALIDOS = {
    "1": ("venda", "Venda"),
    "2": ("consumo_proprio", "Consumo próprio (ração/alimentação)"),
    "3": ("estoque", "Estoque (silagem/armazenamento)"),
}


def _normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def detectar_producao_agricola(texto: str):
    """
    Detecta mensagens de colheita/produção (ex: "colhi 5000 kg de milho
    pra silagem", "produzi 3 toneladas de milho pro silo"). Retorna
    None se não parecer uma mensagem desse tipo.
    """
    texto_norm = _normalizar(texto)

    if not any(v in texto_norm for v in _VERBOS_PRODUCAO):
        return None

    m = re.search(
        r'(\d+(?:[.,]\d+)?)\s*'
        r'(kg|quilos?|toneladas?|ton|sacas?|sacos?)?\s*'
        r'de\s+([a-z]+)',
        texto_norm,
    )
    if not m:
        return None

    try:
        quantidade = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    if quantidade <= 0:
        return None

    unidade = m.group(2) or "kg"
    cultura = m.group(3).strip()

    # Converte pra kg (padrão 60kg/saca — ajustar se a cultura usar outro peso)
    quantidade_kg = quantidade
    if unidade in ("toneladas", "tonelada", "ton"):
        quantidade_kg = quantidade * 1000
    elif unidade in ("sacas", "saco", "sacos"):
        quantidade_kg = quantidade * 60

    destino = None
    if any(p in texto_norm for p in _PALAVRAS_DESTINO_ESTOQUE):
        destino = "estoque"
    elif any(p in texto_norm for p in _PALAVRAS_DESTINO_VENDA):
        destino = "venda"
    elif any(v in texto_norm for v in ("ensilei", "ensilagem", "ensilar")):
        destino = "estoque"  # o próprio verbo já diz que é pra silagem

    return {
        "cultura": cultura,
        "quantidade_kg": quantidade_kg,
        "destino": destino,  # None = precisa perguntar
    }


def resolver_safras_ativas(imovel_id: int, cultura: str) -> list:
    """
    Busca safras em andamento/plantadas pra essa cultura nesse imóvel.
    Pode retornar mais de uma (ambiguidade) — quem chama decide como tratar
    (igual ao padrão já usado pra insumo ambíguo).
    """
    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT id, cultura, ano_safra, area_ha, status
            FROM safras
            WHERE imovel_id = :imovel_id
              AND (cultura_normalizada ILIKE :cultura OR cultura ILIKE :cultura)
              AND status IN ('em_andamento', 'plantada')
            ORDER BY data_plantio DESC
        """), {"imovel_id": imovel_id, "cultura": f"%{cultura}%"}).fetchall()
        return [dict(r._mapping) for r in rows]


def registrar_producao(safra_id: int, quantidade_kg: float, destino: str,
                        data_colheita, produtor_id: int) -> dict:
    """
    Registra a colheita em producao_agricola, seguindo a mesma lógica do
    endpoint POST /safras/{id}/producao já existente
    (app/routers/agricultura.py): lançamento financeiro de valor=0 quando
    destino != 'venda', e transição de status da safra pra 'colhida'.

    Recebe produtor_id já resolvido por quem chamou (via _autorizar_numero
    ou equivalente) — não tenta re-derivar isso aqui, pra não arriscar uma
    query errada sobre uma tabela que não vimos o schema completo.
    """
    from app.db import get_db
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO lancamentos (produtor_id, safra_id, valor, data, origem)
            VALUES (%s, %s, %s, %s, 'agricultura')
            RETURNING id
        """, (produtor_id, safra_id, 0, data_colheita))
        row = cur.fetchone()
        lancamento_id = row["id"] if isinstance(row, dict) else row[0]

        cur.execute("""
            INSERT INTO producao_agricola (
              safra_id, data_colheita, quantidade_kg, destino, lancamento_id
            ) VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (safra_id, data_colheita, quantidade_kg, destino, lancamento_id))
        row2 = cur.fetchone()
        producao_id = row2["id"] if isinstance(row2, dict) else row2[0]

        cur.execute(
            "UPDATE safras SET data_colheita_real = %s WHERE id = %s AND data_colheita_real IS NULL",
            (data_colheita, safra_id)
        )
        cur.execute(
            "UPDATE safras SET status = 'colhida' WHERE id = %s AND status = 'em_andamento'",
            (safra_id,)
        )
        conn.commit()
        return {"producao_id": producao_id, "lancamento_id": lancamento_id}
    finally:
        conn.close()


def dar_entrada_estoque_producao_propria(imovel_id: int, cultura: str,
                                          quantidade_kg: float, safra_id: int) -> dict:
    """
    Cria (se não existir) o insumo "Silagem de {cultura}" e dá entrada no
    estoque com tipo='producao_propria' (já usado hoje em movimentacoes_
    insumo, confirmado no diagnóstico de 30/07), calculando o custo
    unitário a partir do gasto acumulado real da safra (vw_dre_safra.
    custo_total), não um valor chutado.
    """
    from app.db import engine, get_db
    from sqlalchemy import text as sqlt

    nome_insumo = f"Silagem de {cultura.title()}"

    with engine.connect() as conn:
        custo_total = conn.execute(sqlt(
            "SELECT custo_total FROM vw_dre_safra WHERE safra_id = :sid"
        ), {"sid": safra_id}).scalar()

    custo_unitario = None
    if custo_total and quantidade_kg:
        custo_unitario = round(float(custo_total) / quantidade_kg, 4)

    conn2 = get_db()
    try:
        cur = conn2.cursor()
        cur.execute("""
            SELECT id FROM insumos
            WHERE fazenda_id = %s AND ativo = TRUE AND LOWER(TRIM(nome)) = LOWER(%s)
        """, (imovel_id, nome_insumo))
        row = cur.fetchone()
        if row:
            insumo_id = row["id"] if isinstance(row, dict) else row[0]
        else:
            cur.execute("""
                INSERT INTO insumos (fazenda_id, nome, categoria, unidade, origem, estoque_atual, ativo)
                VALUES (%s, %s, 'racao', 'kg', 'producao_propria', 0, true)
                RETURNING id
            """, (imovel_id, nome_insumo))
            row_novo = cur.fetchone()
            insumo_id = row_novo["id"] if isinstance(row_novo, dict) else row_novo[0]

        from app.services.estoque_insumos import aplicar_movimentacao_insumo
        aplicar_movimentacao_insumo(
            cur, fazenda_id=imovel_id, insumo_id=insumo_id,
            tipo="producao_propria", quantidade=quantidade_kg,
            custo_unitario=custo_unitario,
            origem_modulo="bot_agricultura",
            origem_descricao=f"Colheita da safra #{safra_id}",
            observacao="Producao propria registrada via bot",
        )
        conn2.commit()
        return {"insumo_id": insumo_id, "nome": nome_insumo, "custo_unitario": custo_unitario}
    finally:
        conn2.close()
